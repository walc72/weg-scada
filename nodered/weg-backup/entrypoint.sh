#!/bin/bash
# Al arrancar: fija la retención del bucket (idempotente) y lanza cron.
set -uo pipefail

URL="${INFLUXDB_URL:-http://weg-influxdb:8086}"
ORG="${INFLUXDB_ORG:-tecnoelectric}"
BUCKET="${INFLUXDB_BUCKET:-weg_drives}"
RETENTION="${RETENTION:-1095d}"   # 3 años

log() { echo "[$(date '+%F %T')] $*"; }

if [ -n "${INFLUXDB_TOKEN:-}" ]; then
  # Espera a que InfluxDB esté listo, busca el ID del bucket y le fija la
  # retención (3 años). 'bucket update' identifica por --id (no acepta --org).
  for i in $(seq 1 30); do
    BID="$(influx bucket list --name "$BUCKET" --org "$ORG" --host "$URL" --token "$INFLUXDB_TOKEN" --hide-headers 2>/dev/null | awk 'NR==1{print $1}')"
    if [ -n "$BID" ]; then
      if influx bucket update --id "$BID" --retention "$RETENTION" --host "$URL" --token "$INFLUXDB_TOKEN" >/dev/null 2>&1; then
        log "retención de '$BUCKET' fijada en $RETENTION"
      else
        log "AVISO: no se pudo actualizar la retención de '$BUCKET'"
      fi
      break
    fi
    sleep 3
  done
  [ -z "${BID:-}" ] && log "AVISO: no se encontró el bucket '$BUCKET' para fijar retención"
else
  log "AVISO: INFLUXDB_TOKEN no definido; no se fija retención ni se harán backups"
fi

log "cron de backup activo (día 1 de cada mes 03:00). Backups en /backups"
exec crond -f -l 8
