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

# Volumes to backup
VOLUMES=(
  "influxdb-data"
  "influxdb-config"
  "grafana-data"
  "nodered-data"
  "mosquitto-data"
  "poller-config"
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
cp weg-modbus-poller/config.json "${BACKUP_DIR}/poller-config.json" 2>/dev/null || true

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
