#!/bin/bash
##############################################################################
# WEG SCADA - Backup Script
# Backs up all Docker volumes to a timestamped directory
#
# Usage:
#   bash backup.sh                  # backup to ./backups/
#   bash backup.sh /path/to/dir     # backup to custom directory
#
# Restore example:
#   docker run --rm -v weg-influxdb-data:/data -v $(pwd)/backups/20260402_120000:/backup \
#     alpine sh -c "cd /data && tar xzf /backup/influxdb-data.tar.gz"
##############################################################################

set -euo pipefail

BACKUP_ROOT="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="${BACKUP_ROOT}/${TIMESTAMP}"
COMPOSE_PROJECT="nodered"

echo "=== WEG SCADA Backup ==="
echo "Timestamp: ${TIMESTAMP}"
echo "Backup dir: ${BACKUP_DIR}"
mkdir -p "${BACKUP_DIR}"

# Backup nativo de InfluxDB (consistente, a diferencia del tar del volumen en caliente)
if [ -f .env ]; then
  INFLUXDB_TOKEN=$(grep -E '^INFLUXDB_TOKEN=' .env | cut -d= -f2-)
fi
if [ -n "${INFLUXDB_TOKEN:-}" ]; then
  echo "  Backing up InfluxDB (native backup)..."
  docker exec weg-influxdb influx backup /tmp/influx-backup -t "${INFLUXDB_TOKEN}" \
    && docker cp weg-influxdb:/tmp/influx-backup "${BACKUP_DIR}/influxdb" \
    && docker exec weg-influxdb rm -rf /tmp/influx-backup \
    && echo "    OK" \
    || echo "    ERROR: fallo el backup nativo de InfluxDB"
else
  echo "  WARN: INFLUXDB_TOKEN no encontrado en .env — se omite backup nativo de InfluxDB"
fi

# Volumes to backup
VOLUMES=(
  "influxdb-config"
  "grafana-data"
  "mosquitto-data"
)

for vol in "${VOLUMES[@]}"; do
  FULL_VOL="${COMPOSE_PROJECT}_${vol}"
  echo "  Backing up ${FULL_VOL}..."
  docker run --rm \
    -v "${FULL_VOL}":/source:ro \
    -v "$(cd "${BACKUP_DIR}" && pwd)":/backup \
    alpine tar czf "/backup/${vol}.tar.gz" -C /source . 2>/dev/null \
    && echo "    OK" \
    || echo "    SKIP (volume not found)"
done

# Backup config files
echo "  Backing up config files..."
cp docker-compose.yml "${BACKUP_DIR}/" 2>/dev/null || true
cp .env "${BACKUP_DIR}/env.bak" 2>/dev/null || true
# La config viva es la montada en los contenedores (config/), no el template del repo
cp config/config.json "${BACKUP_DIR}/config.json" 2>/dev/null || true

# Calculate total size
TOTAL=$(du -sh "${BACKUP_DIR}" | cut -f1)
echo ""
echo "=== Backup complete: ${TOTAL} in ${BACKUP_DIR} ==="

# Cleanup old backups (keep last 7)
if [ -d "${BACKUP_ROOT}" ]; then
  BACKUP_COUNT=$(ls -1d "${BACKUP_ROOT}"/20* 2>/dev/null | wc -l)
  if [ "${BACKUP_COUNT}" -gt 7 ]; then
    echo "Cleaning old backups (keeping last 7)..."
    ls -1d "${BACKUP_ROOT}"/20* | head -n -7 | xargs rm -rf
  fi
fi
