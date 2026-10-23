#!/bin/bash
# Restauración guiada: lo llama `sudo weg-scada restore` (docker compose exec -T backup restore-cli.sh …).
#   list                         backups locales y remotos, una línea por archivo (TSV, más nuevo primero
#                                dentro de cada parte): parte  clave  fecha  origen(local|drive|sftp)  nombre
#   fetch <drive|sftp> <nombre>  baja un backup remoto a /backups
#   check-name <nombre>          0 si es un nombre de backup de weg-scada (si no, explica cómo se llaman)
#   verify <nombre> <tmp>        descifra (frase por stdin, una línea) y desempaca a /backups/<tmp>; resumen
#   wait-idle                    espera (hasta 15 min) a que termine un backup en curso
#   apply-config <tmp>           reemplaza /config con lo desempacado
#   apply-historico <tmp>        reemplaza el bucket del histórico con lo desempacado
#   summary                      resumen de /config y rango del histórico actual
#   cleanup <id>                 borra /backups/.tmp-restore-<id>-*
# <tmp> = .tmp-restore-<id>-<config|historico>. Salida: 0 ok, 1 error, 2 frase incorrecta / archivo dañado.
# La frase nunca va por argv ni entorno: se lee de stdin y llega a openssl por fd 3 (decrypt de lib.sh).
set -uo pipefail
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

URL="${INFLUXDB_URL:-http://weg-influxdb:8086}"
ORG="${INFLUXDB_ORG:-tecnoelectric}"
BUCKET="${INFLUXDB_BUCKET:-weg_drives}"
RETENTION="${RETENTION:-1095d}"
FLOOR="${DISK_FLOOR_GB:-15}"

die()  { echo "ERROR: $*" >&2; exit 1; }
warn() { echo "AVISO: $*" >&2; }

# bk_info <nombre> → "parte<TAB>clave<TAB>fecha", o 1 si no es un nombre de backup de weg-scada.
# Los weg-backup-AAAA-MM.tar.gz (modo anterior) son históricos sin cifrar.
NAME_RE='^weg-(config|historico)-[a-z0-9-]+-([0-9]{8})-([0-9]{4})\.tar\.gz(\.enc)?$'
LEGACY_RE='^weg-backup-([0-9]{4})-([0-9]{2})\.tar\.gz$'
bk_info() {
  local d h
  if [[ "$1" =~ $NAME_RE ]]; then
    d="${BASH_REMATCH[2]}"; h="${BASH_REMATCH[3]}"
    printf '%s\t%s-%s\t%s-%s-%s %s:%s\n' "${BASH_REMATCH[1]}" "$d" "$h" "${d:0:4}" "${d:4:2}" "${d:6:2}" "${h:0:2}" "${h:2:2}"
  elif [[ "$1" =~ $LEGACY_RE ]]; then
    printf 'historico\t%s%s00-0000\t%s-%s (mensual anterior)\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}"
  else return 1; fi
}

# tmp_path <tmp> → ruta absoluta (solo nombres .tmp-restore-<id>-<parte>: nada de rutas arbitrarias).
tmp_path() {
  [[ "$1" =~ ^\.tmp-restore-[0-9]+-(config|historico)$ ]] || die "directorio temporal inválido: $1"
  echo "$BACKUP_DIR/$1"
}

# Un backup a la vez (los de run.sh esperan o se saltean mientras se restaura).
lock() {
  mkdir -p "$LOCK_DIR"
  exec 9>"$LOCK_DIR/weg-backup.lock"
  local i
  for i in $(seq 1 "${LOCK_WAIT:-900}"); do flock -n 9 && return 0; [ "$i" = 1 ] && echo "Esperando a que termine el backup en curso…"; sleep 1; done   # flock de busybox: sin -w
  die "hay un backup en curso desde hace más de 15 min; probá de nuevo más tarde"
}

cmd_list() {
  local f n i d dir
  {
    for f in "$BACKUP_DIR"/*; do
      n="${f##*/}"; [ -f "$f" ] || continue
      i="$(bk_info "$n")" && printf '%s\tlocal\t%s\n' "$i" "$n"
    done
    for d in drive sftp; do
      [ "$(_bj ".$d.activo")" = true ] || continue
      if ! dest_config "$d"; then warn "$d: $ERR"; continue; fi
      if [ "$d" = sftp ] && ! known_host; then warn "sftp: falta aceptar la huella SSH de $SFTP_HOST"; continue; fi
      if [ -z "$RDIR" ] && ! rclone_open; then warn "$d: no se pudo preparar rclone"; continue; fi
      dir="$(dest_dir "$d")"
      if rc lsf --files-only "$d:$dir"; then
        while IFS= read -r n; do i="$(bk_info "$n")" && printf '%s\t%s\t%s\n' "$i" "$d" "$n"; done <"$RDIR/out"
      else warn "$d: $(dest_error "$d")"; fi
    done
    rclone_close
  } | awk -F'\t' '!seen[$5]++' | sort -s -t$'\t' -k1,1 -k2,2r   # local antes que remoto (mismo nombre)
}

cmd_fetch() {
  local d="${1:-}" n="${2:-}" part
  case "$d" in drive|sftp) ;; *) die "destino desconocido: $d" ;; esac
  bk_info "$n" >/dev/null || die "nombre de backup inválido: $n"
  dest_config "$d" || die "$ERR"
  if [ "$d" = sftp ] && ! known_host; then die "falta aceptar la huella SSH de $SFTP_HOST"; fi
  rclone_open || die "no se pudo preparar rclone"
  part="$BACKUP_DIR/.tmp-fetch-$n"
  trap "rclone_close; rm -f '$part'" EXIT
  echo "Bajando $n de $d…"
  rc copyto "$(_rpath "$d" "$(dest_dir "$d")" "$n")" "$part" || die "$(dest_error "$d")"
  mv -f "$part" "$BACKUP_DIR/$n" || die "no se pudo guardar $n"
}

summary_config() {
  local c="$1" cl id
  echo "Archivos:"
  (cd "$c" && find . \( -type f -o -type l \) | sed 's#^\./#  #' | sort)
  if jq -e 'type == "object"' "$c/config.json" >/dev/null 2>&1; then
    jq -r '"Equipos: \((.devices // []) | length) variadores, \((.meters // []) | length) medidores, \((.flowmeters // []) | length) caudalímetros"' "$c/config.json"
  else echo "Equipos: sin config.json válido"; fi
  jq -r '"Usuarios: \((.users // []) | length) (\([(.users // [])[] | "\(.user) [\(.role)]"] | join(", ")))"' "$c/settings.json" 2>/dev/null \
    || echo "Usuarios: sin settings.json (quedan los del .env)"
  id="$(tr -d "[:space:]" 2>/dev/null <"$c/install-id")"; id="${id:0:8}"; id="${id:-ninguno}"
  cl="$(CONFIG_DIR="$c" license_cliente)"
  if [ -n "$cl" ]; then echo "Licencia: $cl (install-id $id)"
  elif [ -f "$c/license.key" ]; then echo "Licencia: no corresponde al install-id $id"
  else echo "Licencia: no tiene (install-id $id)"; fi
}

# manifest <dir> → ruta del .manifest de `influx backup` (exactamente un bucket), o error.
manifest() {
  local m
  m="$(find "$1" -maxdepth 1 -name '*.manifest' | sort | tail -n1)"
  [ -n "$m" ] || { echo "no parece un backup de InfluxDB (falta el .manifest)" >&2; return 1; }
  [ "$(jq '.buckets | length' "$m" 2>/dev/null)" = 1 ] || { echo "el backup tiene que traer un solo bucket" >&2; return 1; }
  echo "$m"
}

summary_historico() {
  local m
  m="$(manifest "$1")" || return 1
  jq -r '.buckets[0] | "Bucket: \(.bucketName) (org \(.organizationName))",
    ([.retentionPolicies[].shardGroups[]] | if length == 0 then "Datos: vacío"
      else "Datos: entre \(map(.startTime) | min | .[:10]) y \(map(.endTime) | max | .[:10]) (aprox., por semanas)" end)' "$m"
  echo "Tamaño: $(du -sh "$1" | cut -f1)"
}

# need_space <dir> <bytes> <para qué>: libre ≥ bytes (GB, redondeado arriba) + piso DISK_FLOOR_GB.
# Sin poder medir (df falla) no frena.
need_space() {
  local free need
  free="$(freeGB "$1")"; [ -n "$free" ] || return 0
  need=$(( ($2 + 1073741823) / 1073741824 + FLOOR ))
  [ "$free" -ge "$need" ] \
    || die "espacio libre insuficiente para $3: hay $free GB y hacen falta $need GB (incluye el piso de $FLOOR GB); no se tocó nada"
}

cmd_check_name() {
  bk_info "${1:-}" >/dev/null && return 0
  die "nombre no reconocido: '${1:-}'. Los backups se llaman weg-config-<instalación>-AAAAMMDD-HHMM.tar.gz.enc, weg-historico-<instalación>-AAAAMMDD-HHMM.tar.gz.enc o weg-backup-AAAA-MM.tar.gz. Si al bajarlo quedó con otro nombre (p. ej. '… (1).enc' de Drive), renombralo al original."
}

cmd_verify() {
  local n="${1:-}" t f info parte FRASE=""
  t="$(tmp_path "${2:-}")" || exit 1
  info="$(bk_info "$n")" || cmd_check_name "$n"
  parte="${info%%$'\t'*}"
  [ "${2##*-}" = "$parte" ] || die "$n no es un backup de ${2##*-}"
  f="$BACKUP_DIR/$n"
  [ -f "$f" ] || die "no existe $n en los backups locales"
  # descifrado + desempacado conviven un momento
  [ "$parte" = config ] || need_space "$BACKUP_DIR" $(( 2 * $(stat -c %s "$f") )) "desempacar el histórico"
  rm -rf "$t"; mkdir -p "$t/x" && chmod 700 "$t" || die "no se pudo crear $t"
  trap "rm -rf '$t'" EXIT
  if [[ "$n" == *.enc ]]; then
    IFS= read -r FRASE || true
    _frase() { printf '%s' "$FRASE"; }   # en lugar de backup-secretos.json (instalación nueva: no hay)
    decrypt "$f" "$t/a.tar.gz" || { echo "Frase incorrecta o archivo dañado" >&2; exit 2; }
    f="$t/a.tar.gz"
  elif ! gzip -t "$f" 2>/dev/null; then echo "Archivo dañado (gzip inválido)" >&2; exit 2; fi
  tar xzf "$f" -C "$t/x" --no-same-owner 2>/dev/null || { echo "Archivo dañado (tar inválido)" >&2; exit 2; }
  rm -f "$t/a.tar.gz"
  # Sin config.json válido se vaciaría config/ (una réplica sin enlazar puede no tenerlo: trae replica.json).
  if [ "$parte" = config ] && ! jq -e 'type == "object"' "$t/x/config.json" >/dev/null 2>&1 && [ ! -f "$t/x/replica.json" ]; then
    echo "El backup de config no trae un config.json válido" >&2; exit 2
  fi
  echo "Backup: $n ($(cut -f3 <<<"$info"))"
  if [ "$parte" = config ]; then summary_config "$t/x"
  else summary_historico "$t/x" || exit 2; fi
  trap - EXIT   # queda para apply-*; lo borra apply o cleanup
}

cmd_apply_config() {
  local t; t="$(tmp_path "${1:-}")" || exit 1
  [ -d "$t/x" ] && [ -n "$(ls -A "$t/x")" ] || die "no hay nada verificado en $1"
  [ -d "$CONFIG_DIR" ] || die "no existe $CONFIG_DIR"
  lock
  find "$CONFIG_DIR" -mindepth 1 -delete || die "no se pudo vaciar $CONFIG_DIR"
  cp -a "$t/x/." "$CONFIG_DIR/" || die "no se pudo copiar la config restaurada"
  rm -f "$CONFIG_DIR/backup-pedido.json" "$CONFIG_DIR"/backup-prueba*.json
  chown -R "$API_UID:$API_GID" "$CONFIG_DIR" 2>/dev/null || warn "no se pudo cambiar el dueño de $CONFIG_DIR"
  rm -rf "$t"
  echo "Config restaurada"
}

# ID del bucket <nombre> en $ORG (vacío si no existe).
bucket_id() { influx bucket list --name "$1" --org "$ORG" --hide-headers 2>/dev/null | awk 'NR==1{print $1}'; }

# recover_action <hay actual 0|1> <hay temporal 0|1> → qué hacer con un ${BUCKET}_restaurando previo:
#   rename      sin actual: un intento anterior ya borró el actual y no llegó a renombrar → se renombra
#               (nunca se borra: es el único histórico que queda)
#   delete-tmp  con actual: el intento anterior falló antes del cambio → el temporal sobra
#   none
recover_action() {
  if [ "$2" = 1 ] && [ "$1" = 0 ]; then echo rename
  elif [ "$2" = 1 ]; then echo delete-tmp
  else echo none; fi
}

# rename_bucket <id>: el bucket <id> pasa a llamarse $BUCKET (con un reintento).
rename_bucket() {
  local i
  for i in 1 2; do
    influx bucket update --id "$1" --name "$BUCKET" --retention "$RETENTION" >/dev/null && return 0
    [ "$i" = 2 ] || sleep 3
  done
  return 1
}
manual_hint() {
  echo "Para terminarlo a mano (o volvé a correr sudo weg-scada restore, que lo recupera):" >&2
  echo "  cd ${WEG_DIR:-/opt/weg-scada} && sudo docker compose exec backup sh -c 'influx bucket update --host \"\$INFLUXDB_URL\" --token \"\$INFLUXDB_TOKEN\" --id $1 --name $BUCKET --retention $RETENTION'" >&2
}

# Restaura en un bucket temporal y recién ahí cambia el actual: si `influx restore` falla, el histórico
# actual queda intacto. --org/--bucket son los originales del backup (pueden venir de otra org o con
# otro nombre de bucket); --new-org/--new-bucket los de esta instalación. Nunca --full (pisaría tokens
# y usuarios de esta instancia).
cmd_apply_historico() {
  local t m sorg src tmpb nid oid tid
  t="$(tmp_path "${1:-}")" || exit 1
  [ -n "${INFLUXDB_TOKEN:-}" ] || die "falta INFLUXDB_TOKEN"
  export INFLUX_HOST="$URL" INFLUX_TOKEN="$INFLUXDB_TOKEN"   # el token no va por argv
  m="$(manifest "$t/x")" || exit 1
  sorg="$(jq -r '.buckets[0].organizationName' "$m")"; src="$(jq -r '.buckets[0].bucketName' "$m")"
  tmpb="${BUCKET}_restaurando"
  lock
  oid="$(bucket_id "$BUCKET")"; tid="$(bucket_id "$tmpb")"
  case "$(recover_action "$([ -n "$oid" ] && echo 1 || echo 0)" "$([ -n "$tid" ] && echo 1 || echo 0)")" in
    rename)
      echo "Recuperando '$tmpb' de un intento anterior → '$BUCKET'"
      rename_bucket "$tid" || { manual_hint "$tid"; die "no se pudo renombrar '$tmpb'"; } ;;
    delete-tmp)
      influx bucket delete --id "$tid" >/dev/null || die "no se pudo borrar el temporal '$tmpb' de un intento anterior" ;;
  esac
  # el temporal convive con el actual hasta el cambio
  need_space "$BACKUP_DIR" $(( 2 * $(du -sb "$t/x" | cut -f1) )) "restaurar el histórico (bucket temporal junto al actual)"
  echo "influx restore: '$src' (org $sorg) → '$tmpb' (org $ORG)"
  influx restore "$t/x" --org "$sorg" --bucket "$src" --new-org "$ORG" --new-bucket "$tmpb" \
    || die "influx restore falló; el histórico actual no se tocó"
  nid="$(bucket_id "$tmpb")"; [ -n "$nid" ] || die "no aparece el bucket restaurado '$tmpb'"
  oid="$(bucket_id "$BUCKET")"
  if [ -n "$oid" ]; then
    influx bucket delete --id "$oid" >/dev/null || die "no se pudo borrar '$BUCKET'; lo restaurado quedó en '$tmpb'"
  fi
  rename_bucket "$nid" || { manual_hint "$nid"; die "lo restaurado quedó en '$tmpb' (id $nid) y '$BUCKET' ya no existe"; }
  rm -rf "$t"
  echo "Histórico restaurado en '$BUCKET'"
}

# Rango del histórico actual en una sola consulta (first/last por serie se resuelven en el storage).
hist_range() {
  local q out s t
  q="d = from(bucket: \"$BUCKET\") |> range(start: 0)
union(tables: [d |> first() |> keep(columns: [\"_time\"]) |> group() |> min(column: \"_time\"),
               d |> last() |> keep(columns: [\"_time\"]) |> group() |> max(column: \"_time\")])"
  out="$(timeout 120 influx query --org "$ORG" --raw "$q" 2>/dev/null)"; s=$?
  if [ "$s" = 124 ]; then echo "no se pudo consultar el rango (tarda demasiado)"; return; fi
  if [ "$s" != 0 ]; then echo "no se pudo consultar el rango"; return; fi
  t="$(grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:]{8}' <<<"$out" | sort)"
  if [ -z "$t" ]; then echo "vacío"; else echo "$(head -n1 <<<"$t" | tr T ' ') → $(tail -n1 <<<"$t" | tr T ' ') (UTC)"; fi
}

cmd_summary() {
  summary_config "$CONFIG_DIR" | grep -v '^ \|^Archivos:'
  [ -n "${INFLUXDB_TOKEN:-}" ] || { echo "Histórico: sin INFLUXDB_TOKEN"; return 0; }
  export INFLUX_HOST="$URL" INFLUX_TOKEN="$INFLUXDB_TOKEN"
  echo "Histórico ($BUCKET): $(hist_range)"
}

cmd_cleanup() {
  [[ "${1:-}" =~ ^[0-9]+$ ]] || die "uso: cleanup <id>"
  rm -rf "$BACKUP_DIR/.tmp-restore-$1-"*
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cmd="${1:-}"; shift || true
  case "$cmd" in
    list)            cmd_list ;;
    fetch)           cmd_fetch "$@" ;;
    check-name)      cmd_check_name "$@" ;;
    verify)          cmd_verify "$@" ;;
    wait-idle)       lock ;;   # espera a que no haya un backup en curso (antes de detener servicios)
    apply-config)    cmd_apply_config "$@" ;;
    apply-historico) cmd_apply_historico "$@" ;;
    summary)         cmd_summary ;;
    cleanup)         cmd_cleanup "$@" ;;
    ok)              exit 0 ;;   # el CLI del host comprueba que la imagen lo trae
    *) sed -n '2,15p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
  esac
fi
