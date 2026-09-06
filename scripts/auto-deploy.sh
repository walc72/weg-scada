#!/bin/bash
# Auto-deploy: pulls latest from GitHub and redeploys the affected services.
# Run via cron on PME-SERVER, e.g.:
#   */2 * * * * /opt/weg-scada/scripts/auto-deploy.sh >> /var/log/weg-deploy.log 2>&1
#
# Nota: rebuild de imagen en vez de docker cp — asi los cambios en package.json,
# Dockerfile o archivos nuevos tambien llegan al contenedor.
set -e

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

BEFORE=$(git rev-parse HEAD)
git fetch --quiet origin master
AFTER=$(git rev-parse origin/master)

if [ "$BEFORE" = "$AFTER" ]; then
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Updating $BEFORE -> $AFTER"
git reset --hard origin/master

CHANGED=$(git diff --name-only "$BEFORE" "$AFTER")
echo "Changed files:"
echo "$CHANGED" | sed 's/^/  /'

cd nodered

if echo "$CHANGED" | grep -q '^nodered/weg-modbus-poller/'; then
  echo "Rebuilding modbus-poller..."
  docker compose build modbus-poller
  docker compose up -d modbus-poller
fi

if echo "$CHANGED" | grep -q '^nodered/weg-api/'; then
  echo "Rebuilding weg-api..."
  docker compose build weg-api
  docker compose up -d weg-api
fi

if echo "$CHANGED" | grep -qE '^nodered/(nginx|mosquitto)/'; then
  echo "Restarting frontend/mosquitto (config change)..."
  docker compose up -d frontend mosquitto
fi

if echo "$CHANGED" | grep -q '^frontend-react/'; then
  if command -v npm >/dev/null 2>&1; then
    echo "Rebuilding frontend..."
    (cd ../frontend-react && npm ci --no-audit --no-fund && npx vite build)
  else
    echo "WARN: frontend-react cambio pero npm no esta instalado — build manual requerido"
  fi
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy OK"

# Ensure InfluxDB bucket retention = 365d (overwrites oldest data automatically)
docker exec weg-influxdb influx bucket update \
  --name weg_drives \
  --retention 365d \
  2>/dev/null && echo "[$(date '+%Y-%m-%d %H:%M:%S')] InfluxDB retention OK (365d)" || true
