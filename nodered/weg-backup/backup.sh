#!/bin/bash
# Genera un backup. Lo llama run.sh (o a mano: docker exec weg-backup backup.sh <parte>).
#   backup.sh [legacy]     modo actual: InfluxDB → /backups/weg-backup-AAAA-MM.tar.gz,
#                          BACKUP_KEEP, BACKUP_EXTERNAL (sin backup.json o "modulo": false)
#   backup.sh config       módulo: tar de /config → weg-config-<inst>-AAAAMMDD-HHMM.tar.gz[.enc]
#   backup.sh historico    módulo: influx backup  → weg-historico-…   (registra en backup-estado.json)
# Salida: 0 ok, 1 error, 2 disco bajo (omitido), 3 ya hay otro backup en curso (salteado).
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

freeGB() { df -PBG "$1" 2>/dev/null | awk 'NR==2{gsub("G","",$4); print $4+0}'; }

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
  fail() {  # fail <mensaje> <exit> <estado local>
    log "ERROR ($parte): $1"
    rm -rf "$tmpd" "$plain"; [ -n "$name" ] && rm -f "$BACKUP_DIR/.tmp-$name"
    record false "" 0 "$(jq -nc --arg l "$3" '{local:$l}')" "$1"
    exit "$2"
  }

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
  log "OK: $BACKUP_DIR/$name ($bytes bytes)"
  prune_local "$BACKUP_DIR" "$parte" "$copias"
  destinos='{"local":"ok"}'

  # Segundo destino del modo actual (BACKUP_EXTERNAL): se mantiene con el módulo
  if [ -n "$EXTERNAL" ]; then
    local ext="ok"
    if [ ! -d "$EXTERNAL" ]; then ext="error BACKUP_EXTERNAL='$EXTERNAL' no está accesible"
    elif cp -f "$BACKUP_DIR/$name" "$EXTERNAL/"; then prune_local "$EXTERNAL" "$parte" "$copias"
    else ext="error no se pudo copiar a $EXTERNAL"; fi
    log "externo: $ext"
    destinos="$(jq -c --arg e "$ext" '. + {externo: $e}' <<<"$destinos")"
  fi

  record true "$name" "$bytes" "$destinos"
  log "backup de $parte finalizado"
}

parte="${1:-legacy}"
case "$parte" in legacy|config|historico) ;; *) echo "Uso: backup.sh [legacy|config|historico]"; exit 1 ;; esac
mkdir -p "$LOCK_DIR"
exec 9>"$LOCK_DIR/weg-backup.lock"
if ! flock -n 9; then log "AVISO: ya hay un backup en curso; se saltea $parte"; exit 3; fi
if [ "$parte" = legacy ]; then legacy; else run_parte "$parte"; fi
