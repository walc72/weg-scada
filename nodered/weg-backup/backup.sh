#!/bin/bash
# Genera un backup. Lo llama run.sh (o a mano: docker exec weg-backup backup.sh <parte>).
#   backup.sh [legacy]     modo actual: InfluxDB → /backups/weg-backup-AAAA-MM.tar.gz,
#                          BACKUP_KEEP, BACKUP_EXTERNAL (sin backup.json o "modulo": false)
#   backup.sh config       módulo: tar de /config → weg-config-<inst>-AAAAMMDD-HHMM.tar.gz[.enc]
#   backup.sh historico    módulo: influx backup  → weg-historico-…   (registra en backup-estado.json)
#                          luego envía a Google Drive / SFTP activos (rclone) y poda allá
#   backup.sh prueba       prueba de destino: backup-prueba.json → backup-prueba-resultado.json
# Salida: 0 ok, 1 error (o algún destino con error), 2 disco bajo (omitido), 3 ya hay otro backup en curso (salteado).
set -uo pipefail
HERE="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"

URL="${INFLUXDB_URL:-http://weg-influxdb:8086}"
ORG="${INFLUXDB_ORG:-tecnoelectric}"
BUCKET="${INFLUXDB_BUCKET:-weg_drives}"
KEEP="${BACKUP_KEEP:-12}"          # legacy: cuántos backups conservar
FLOOR="${DISK_FLOOR_GB:-15}"       # piso de espacio libre (GB)
EXTERNAL="${BACKUP_EXTERNAL:-}"    # segundo destino (montado en el contenedor), opcional


# Stub en tests: INFLUX_BACKUP_CMD=<cmd> se llama con el directorio destino.
influx_backup() {
  if [ -n "${INFLUX_BACKUP_CMD:-}" ]; then $INFLUX_BACKUP_CMD "$1"; return; fi
  influx backup "$1" --host "$URL" --token "$INFLUXDB_TOKEN" --org "$ORG" --bucket "$BUCKET"
}

# ── Modo actual (mismo comportamiento que el cron mensual de antes) ──
legacy() {
  local LOCAL="$BACKUP_DIR" STAMP free tmp out
  STAMP="$(date +%Y-%m)"
  prune() { local d="$1"; ls -1t "$d"/weg-backup-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | while read -r f; do log "podar $f"; rm -f "$f"; done; }

  if [ -z "${INFLUXDB_TOKEN:-}" ]; then log "ERROR: falta INFLUXDB_TOKEN"; exit 1; fi
  mkdir -p "$LOCAL"

  # Guardián de disco: no dejar que se llene y tire los servicios
  free="$(freeGB "$LOCAL")"
  if [ -n "$free" ] && [ "$free" -lt "$FLOOR" ]; then
    log "ALERTA: espacio libre bajo (${free}GB < ${FLOOR}GB). Podando backups viejos…"
    prune "$LOCAL"
    free="$(freeGB "$LOCAL")"
    if [ -n "$free" ] && [ "$free" -lt "$FLOOR" ]; then
      log "CRÍTICO: sigue bajo (${free}GB). Se OMITE el backup para no llenar el disco."
      exit 2
    fi
  fi

  tmp="$LOCAL/.tmp-$STAMP"
  out="$LOCAL/weg-backup-$STAMP.tar.gz"
  rm -rf "$tmp"; mkdir -p "$tmp"
  trap 'log "interrumpido"; rm -rf "$tmp"; exit 143' TERM INT

  log "backup de '$BUCKET' → $out"
  if influx_backup "$tmp"; then
    tar czf "$out" -C "$tmp" . && rm -rf "$tmp"
    log "OK: $out ($(du -h "$out" 2>/dev/null | cut -f1))"
  else
    log "ERROR: 'influx backup' falló"; rm -rf "$tmp"; exit 1
  fi

  prune "$LOCAL"

  # Segundo destino (disco externo / carpeta de red)
  if [ -n "$EXTERNAL" ]; then
    if [ -d "$EXTERNAL" ]; then
      cp -f "$out" "$EXTERNAL/" && log "copiado a $EXTERNAL" && prune "$EXTERNAL"
    else
      log "AVISO: BACKUP_EXTERNAL='$EXTERNAL' no está accesible; se omite la copia externa"
    fi
  fi

  log "backup finalizado"
}

# ── Módulo: una parte (config | historico) ──
run_parte() {
  local parte="$1" t0 copias free inst cif=0 name="" plain="" tmpd="" bytes destinos
  t0="$(date +%s)"
  umask 077   # sin frase la copia lleva secretos en claro: solo root
  state_update '.enCurso = {parte: $p, desde: $d}' --arg p "$parte" --arg d "$(iso "$t0")"

  copias="$(jq -r --arg p "$parte" '.[$p].copias // empty' "$CONFIG_DIR/backup.json" 2>/dev/null)"
  if ! [[ "$copias" =~ ^[0-9]+$ ]] || [ "$copias" -lt 1 ] || [ "$copias" -gt 365 ]; then
    if [ "$parte" = config ]; then copias=30; else copias=12; fi
  fi

  record() {  # record <ok> <archivo|''> <bytes> <destinos-json> [error]
    state_record_run "$(jq -nc --arg p "$parte" --arg i "$(iso "$t0")" --arg f "$(iso "$(date +%s)")" \
      --argjson ok "$1" --arg a "$2" --argjson b "$3" --argjson c "$([ "$cif" = 1 ] && echo true || echo false)" \
      --argjson d "$4" --arg e "${5:-}" \
      '{parte:$p, inicio:$i, fin:$f, ok:$ok, archivo:(if $a == "" then null else $a end), bytes:$b,
        cifrado:$c, destinos:$d} + (if $e == "" then {} else {error:$e} end)')"
  }
  # fail <mensaje> <exit> <estado local>. Ya guardado el archivo (interrupción durante los envíos):
  # registra archivo, bytes y los destinos ya resueltos; el que estaba en curso queda "error <mensaje>".
  saved=0; cur_d=""
  fail() {
    log "ERROR ($parte): $1"
    rclone_close
    rm -rf "$tmpd" "$plain"; [ -n "$name" ] && rm -f "$BACKUP_DIR/.tmp-$name"
    if [ "$saved" = 1 ]; then
      [ -n "$cur_d" ] && destinos="$(jq -c --arg d "$cur_d" --arg e "error $1" '. + {($d): $e}' <<<"$destinos")"
      record false "$name" "$bytes" "$destinos" "$1"
    else
      record false "" 0 "$(jq -nc --arg l "$3" '{local:$l}')" "$1"
    fi
    exit "$2"
  }
  # docker stop / update a mitad: limpiar temporales y registrar (bash corre el trap al terminar
  # el comando en curso —rclone corre en segundo plano, así que enseguida—; si llega el SIGKILL
  # antes, run.sh limpia los .tmp-* al arrancar).
  trap 'fail "interrumpido" 143 "error interrumpido"' TERM INT

  mkdir -p "$BACKUP_DIR"
  if [ "$parte" = historico ] && [ -z "${INFLUXDB_TOKEN:-}" ] && [ -z "${INFLUX_BACKUP_CMD:-}" ]; then
    fail "falta INFLUXDB_TOKEN" 1 omitido
  fi

  # Guardián de disco
  free="$(freeGB "$BACKUP_DIR")"
  if [ -n "$free" ] && [ "$free" -lt "$FLOOR" ]; then
    log "ALERTA: espacio libre bajo (${free}GB < ${FLOOR}GB). Podando $parte…"
    prune_local "$BACKUP_DIR" "$parte" "$copias"
    free="$(freeGB "$BACKUP_DIR")"
    if [ -n "$free" ] && [ "$free" -lt "$FLOOR" ]; then
      fail "espacio libre bajo (${free}GB < ${FLOOR}GB); se omite el backup" 2 omitido
    fi
  fi

  inst="$(installation_id)"
  has_frase && cif=1
  name="$(filename "$parte" "$inst" "$t0" "$cif")"
  plain="$BACKUP_DIR/.tmp-$parte-$$.tar.gz"
  log "backup de $parte → $BACKUP_DIR/$name"

  if [ "$parte" = config ]; then
    tar czf "$plain" -C "$CONFIG_DIR" --exclude=./backup-pedido.json --exclude=./backup-estado.json \
      --exclude='./backup-prueba*.json' --exclude='*.tmp' . || fail "no se pudo empaquetar /config" 1 "error tar"
  else
    tmpd="$BACKUP_DIR/.tmp-$parte-$$"
    rm -rf "$tmpd"; mkdir -p "$tmpd"
    influx_backup "$tmpd" || fail "'influx backup' falló" 1 "error influx backup"
    tar czf "$plain" -C "$tmpd" . || fail "no se pudo empaquetar el histórico" 1 "error tar"
    rm -rf "$tmpd"
  fi

  if [ "$cif" = 1 ]; then
    encrypt "$plain" "$BACKUP_DIR/.tmp-$name" || fail "no se pudo cifrar" 1 "error cifrado"
    rm -f "$plain"
  else
    log "AVISO: sin frase de backup; la copia local queda sin cifrar"
    mv -f "$plain" "$BACKUP_DIR/.tmp-$name"
  fi
  mv -f "$BACKUP_DIR/.tmp-$name" "$BACKUP_DIR/$name" || fail "no se pudo guardar $name" 1 "error al guardar"
  bytes="$(stat -c %s "$BACKUP_DIR/$name")"
  destinos='{"local":"ok"}'; saved=1
  log "OK: $BACKUP_DIR/$name ($bytes bytes)"
  prune_local "$BACKUP_DIR" "$parte" "$copias"

  # Segundo destino del modo actual (BACKUP_EXTERNAL): se mantiene con el módulo, pero solo
  # cifrado (sin frase los destinos externos quedan inactivos: config lleva tokens, licencia, clave SSH).
  if [ -n "$EXTERNAL" ]; then
    local ext="ok"; cur_d=externo
    if [ "$cif" != 1 ]; then ext="omitido"
    elif [ ! -d "$EXTERNAL" ]; then ext="error BACKUP_EXTERNAL='$EXTERNAL' no está accesible"
    elif cp -f "$BACKUP_DIR/$name" "$EXTERNAL/"; then prune_local "$EXTERNAL" "$parte" "$copias"
    else ext="error no se pudo copiar a $EXTERNAL"; fi
    log "externo: $ext"
    destinos="$(jq -c --arg e "$ext" '. + {externo: $e}' <<<"$destinos")"; cur_d=""
  fi

  # Google Drive / SFTP: cada destino activo por separado (uno caído no frena al otro). Solo cifrado.
  local d ok
  for d in drive sftp; do
    [ "$(jq -r --arg d "$d" '.[$d].activo == true' "$CONFIG_DIR/backup.json" 2>/dev/null)" = true ] || continue
    cur_d="$d"
    if [ "$cif" != 1 ]; then RES=omitido
    elif [ -z "$RDIR" ] && ! rclone_open; then RES="error no se pudo preparar rclone"
    else enviar "$d" "$BACKUP_DIR/$name" "$parte" "$inst" "$copias"; fi
    log "$d: $RES"
    destinos="$(jq -c --arg d "$d" --arg e "$RES" '. + {($d): $e}' <<<"$destinos")"; cur_d=""
  done
  rclone_close

  ok="$(jq 'all(.[]; . == "ok" or . == "omitido")' <<<"$destinos")"
  record "$ok" "$name" "$bytes" "$destinos"
  log "backup de $parte finalizado"
  [ "$ok" = true ]
}

# ── Prueba de destino (backup-prueba.json → backup-prueba-resultado.json) ──
prueba() {
  local f="$CONFIG_DIR/backup-prueba.json" out="$CONFIG_DIR/backup-prueba-resultado.json" req d tmp
  [ -f "$f" ] || return 0
  req="$(jq -c '{destino: (.destino // null), ts: (.ts // null)}' "$f" 2>/dev/null)" || req='{"destino":null,"ts":null}'
  rm -f "$f"
  d="$(jq -r '.destino // ""' <<<"$req")"
  P_TS="$(jq -r '.ts // ""' <<<"$req")"
  [[ "$P_TS" =~ ^[0-9A-Za-z_-]{1,40}$ ]] || P_TS="$(date +%s)"
  RC_FLAGS=(--contimeout 15s --timeout 1m --retries 1 --low-level-retries 2 --log-level ERROR)
  RC_WRAP=(timeout 120)   # el portal espera la respuesta: tope duro por llamada
  trap 'rclone_close; exit 143' TERM INT
  log "prueba de destino: $d"
  case "$d" in drive|sftp) prueba_destino "$d" ;; *) P_OK=false; P_ERR="Destino desconocido"; P_HUELLA=""; P_KH="" ;; esac
  log "prueba de $d: $([ "$P_OK" = true ] && echo ok || echo "$P_ERR")"
  tmp="$out.$BASHPID.tmp"
  jq -c --argjson ok "$P_OK" --arg e "$P_ERR" --arg h "$P_HUELLA" --arg k "$P_KH" \
    '. + {ok: $ok} + (if $e == "" then {} else {error: $e} end)
       + (if $h == "" then {} else {huella: $h} end) + (if $k == "" then {} else {knownHostsLine: $k} end)' \
    <<<"$req" >"$tmp" && chmod 644 "$tmp" && own_like "$tmp" "$out" && mv -f "$tmp" "$out" || rm -f "$tmp"
}

parte="${1:-legacy}"
case "$parte" in legacy|config|historico|prueba) ;; *) echo "Uso: backup.sh [legacy|config|historico|prueba]"; exit 1 ;; esac
mkdir -p "$LOCK_DIR"
exec 9>"$LOCK_DIR/weg-backup.lock"
if ! flock -n 9; then
  log "AVISO: ya hay un backup en curso; se saltea $parte"
  if [ "$parte" != legacy ] && [ "$parte" != prueba ]; then   # la prueba queda para el próximo ciclo
    # se registra (sin tocar el enCurso del que está corriendo)
    now="$(iso "$(date +%s)")"
    state_record_run "$(jq -nc --arg p "$parte" --arg t "$now" \
      '{parte:$p, inicio:$t, fin:$t, ok:false, archivo:null, bytes:0, cifrado:false,
        destinos:{local:"omitido"}, error:"otro backup en curso"}')" keep
  fi
  exit 3
fi
case "$parte" in legacy) legacy ;; prueba) prueba ;; *) run_parte "$parte" ;; esac
