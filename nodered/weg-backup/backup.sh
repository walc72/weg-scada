#!/bin/bash
# Backup mensual de InfluxDB, comprimido, con rotación y guardián de disco.
set -uo pipefail

URL="${INFLUXDB_URL:-http://weg-influxdb:8086}"
ORG="${INFLUXDB_ORG:-tecnoelectric}"
BUCKET="${INFLUXDB_BUCKET:-weg_drives}"
KEEP="${BACKUP_KEEP:-12}"          # cuántos backups conservar
FLOOR="${DISK_FLOOR_GB:-15}"       # piso de espacio libre (GB)
LOCAL=/backups
EXTERNAL="${BACKUP_EXTERNAL:-}"    # segundo destino (montado en el contenedor), opcional
STAMP="$(date +%Y-%m)"

log()    { echo "[$(date '+%F %T')] $*"; }
freeGB() { df -PBG "$1" 2>/dev/null | awk 'NR==2{gsub("G","",$4); print $4+0}'; }
prune()  { local d="$1"; ls -1t "$d"/weg-backup-*.tar.gz 2>/dev/null | tail -n +$((KEEP+1)) | while read -r f; do log "podar $f"; rm -f "$f"; done; }

if [ -z "${INFLUXDB_TOKEN:-}" ]; then log "ERROR: falta INFLUXDB_TOKEN"; exit 1; fi
mkdir -p "$LOCAL"

# ── Guardián de disco: no dejar que se llene y tire los servicios ──
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
if influx backup "$tmp" --host "$URL" --token "$INFLUXDB_TOKEN" --org "$ORG" --bucket "$BUCKET"; then
  tar czf "$out" -C "$tmp" . && rm -rf "$tmp"
  log "OK: $out ($(du -h "$out" 2>/dev/null | cut -f1))"
else
  log "ERROR: 'influx backup' falló"; rm -rf "$tmp"; exit 1
fi

prune "$LOCAL"

# ── Segundo destino (disco externo / carpeta de red) ──
if [ -n "$EXTERNAL" ]; then
  if [ -d "$EXTERNAL" ]; then
    cp -f "$out" "$EXTERNAL/" && log "copiado a $EXTERNAL" && prune "$EXTERNAL"
  else
    log "AVISO: BACKUP_EXTERNAL='$EXTERNAL' no está accesible; se omite la copia externa"
  fi
fi

log "backup finalizado"
