#!/bin/bash
# Restaura un backup mensual a un bucket de archivo, para consultarlo en Históricos.
#   Uso:  docker exec weg-backup restore.sh 2025-01
# Crea el bucket weg_archive_2025_01. Luego elegí "Archivo 2025-01" en Históricos.
set -uo pipefail

URL="${INFLUXDB_URL:-http://weg-influxdb:8086}"
ORG="${INFLUXDB_ORG:-tecnoelectric}"
SRC_BUCKET="${INFLUXDB_BUCKET:-weg_drives}"
LOCAL=/backups
M="${1:-}"

[ -z "$M" ] && { echo "Uso: restore.sh AAAA-MM   (ej. 2025-01)"; exit 1; }
[ -z "${INFLUXDB_TOKEN:-}" ] && { echo "ERROR: falta INFLUXDB_TOKEN"; exit 1; }

FILE="$LOCAL/weg-backup-$M.tar.gz"
[ -f "$FILE" ] || { echo "ERROR: no existe $FILE"; echo "Disponibles:"; ls -1 "$LOCAL"/weg-backup-*.tar.gz 2>/dev/null; exit 1; }

NEW="weg_archive_${M//-/_}"
tmp="$LOCAL/.restore-$M"
rm -rf "$tmp"; mkdir -p "$tmp"
tar xzf "$FILE" -C "$tmp"

echo "restaurando $FILE → bucket '$NEW'"
if influx restore "$tmp" --host "$URL" --token "$INFLUXDB_TOKEN" --org "$ORG" --bucket "$SRC_BUCKET" --new-bucket "$NEW"; then
  echo "OK: en Históricos elegí 'Archivo ${M}'"
else
  echo "ERROR: la restauración falló (¿ya existe el bucket '$NEW'?)"
fi
rm -rf "$tmp"
