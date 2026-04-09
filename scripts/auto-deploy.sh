#!/bin/bash
# Auto-deploy: pulls latest from GitHub and redeploys to running containers.
# Run via cron on PME-SERVER, e.g.:
#   */2 * * * * /opt/weg-scada/auto-deploy.sh >> /var/log/weg-deploy.log 2>&1
set -e

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
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

POLLER_RESTART=0
NODERED_RESTART=0

if echo "$CHANGED" | grep -q '^nodered/weg-modbus-poller/src/'; then
  docker cp nodered/weg-modbus-poller/src/index.js  weg-modbus-poller:/app/src/index.js  2>/dev/null || true
  docker cp nodered/weg-modbus-poller/src/parser.js weg-modbus-poller:/app/src/parser.js 2>/dev/null || true
  docker cp nodered/weg-modbus-poller/src/connections.js weg-modbus-poller:/app/src/connections.js 2>/dev/null || true
  POLLER_RESTART=1
fi

if echo "$CHANGED" | grep -q '^nodered/weg-modbus-poller/config.json$'; then
  # config.json is bind-mounted from the host, so the git pull already updated it.
  # Just restart the poller to pick up changes.
  POLLER_RESTART=1
fi

if echo "$CHANGED" | grep -q '^nodered/flows.json$'; then
  docker cp nodered/flows.json projects-nodered-1:/data/flows.json
  NODERED_RESTART=1
fi

[ "$POLLER_RESTART" = "1" ]  && docker restart weg-modbus-poller
[ "$NODERED_RESTART" = "1" ] && docker restart projects-nodered-1

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Deploy OK"

# Ensure InfluxDB bucket retention = 365d (overwrites oldest data automatically)
docker exec weg-influxdb influx bucket update \
  --name weg_drives \
  --retention 365d \
  2>/dev/null && echo "[$(date '+%Y-%m-%d %H:%M:%S')] InfluxDB retention OK (365d)" || true
