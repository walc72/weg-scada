#!/bin/bash
##############################################################################
# Node-RED: Install required palettes inside the container
# Run ONCE after first docker-compose up:
#
#   docker exec -it weg-nodered bash /data/install-packages.sh
#
# Or install from Node-RED UI: Menu > Manage palette > Install
##############################################################################

cd /data

npm install \
    node-red-contrib-modbus \
    node-red-dashboard \
    node-red-contrib-telegrambot \
    node-red-contrib-influxdb \
    node-red-node-smooth \
    node-red-node-email

echo ""
echo "=== All packages installed ==="
echo "Restart Node-RED: docker restart weg-nodered"
