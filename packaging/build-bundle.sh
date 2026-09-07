#!/bin/bash
# =============================================================================
# WEG SCADA - Generador de paquete pre-compilado (Windows + Docker Desktop)
#
# Arma un .zip con las imagenes Docker ya construidas, el frontend ya buildeado,
# el compose transformado (sin build:), los configs y el instalador. La PC de
# destino solo descomprime y corre install.ps1 — no necesita compilar.
#
# Uso:   bash packaging/build-bundle.sh [version]      (default: 1.0.0)
# Salida: weg-scada-<version>-prebuilt-windows.zip en la raiz del repo.
#
# Requisitos: Docker, y red para el build del frontend (npm) la primera vez.
# =============================================================================
set -e

VER="${1:-1.0.0}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/.." && pwd)"
WORK="$(mktemp -d)"
OUT="$WORK/weg-scada-$VER"
mkdir -p "$OUT/images" "$OUT/frontend" "$OUT/config"

echo "=== 1. Build + tag imagenes custom ($VER) ==="
( cd "$REPO/nodered" && docker compose build weg-api modbus-poller )
docker tag nodered-weg-api "weg-scada-weg-api:$VER"
docker tag nodered-modbus-poller "weg-scada-modbus-poller:$VER"

echo "=== 2. Guardar imagenes (gzip) ==="
docker save "weg-scada-weg-api:$VER" "weg-scada-modbus-poller:$VER" \
  | gzip > "$OUT/images/weg-scada-images.tar.gz"

echo "=== 3. Build frontend (en contenedor node) ==="
FT="$WORK/frontend-src"
cp -r "$REPO/frontend-react" "$FT"
rm -rf "$FT/node_modules" "$FT/dist" "$FT/tsconfig.tsbuildinfo"
docker run --rm -v "$FT":/app -w /app node:20-alpine \
  sh -c 'npm ci --no-audit --no-fund && npm run build'
cp -r "$FT/dist" "$OUT/frontend/dist"

echo "=== 4. Copiar configs y transformar compose ==="
cp -r "$REPO/nodered/nginx" "$OUT/nginx"
cp -r "$REPO/nodered/mosquitto" "$OUT/mosquitto"
cp -r "$REPO/nodered/grafana" "$OUT/grafana"
cp "$REPO/nodered/.env.example" "$OUT/.env.example"
cp "$REPO/nodered/weg-modbus-poller/config.json" "$OUT/config/config.json"

# build: -> image: (usa las imagenes cargadas) y dist bundleado
sed -e "s#    build: ./weg-api#    image: weg-scada-weg-api:$VER#" \
    -e "s#    build: ./weg-modbus-poller#    image: weg-scada-modbus-poller:$VER#" \
    -e 's#../frontend-react/dist:/usr/share/nginx/html:ro#./frontend/dist:/usr/share/nginx/html:ro#' \
    "$REPO/nodered/docker-compose.yml" > "$OUT/docker-compose.yml"

if grep -q '^    build:' "$OUT/docker-compose.yml"; then
  echo "ERROR: quedo un 'build:' en el compose transformado"; exit 1
fi

cp "$SCRIPT_DIR/install.ps1" "$OUT/install.ps1"
cp "$SCRIPT_DIR/INSTALL.md" "$OUT/INSTALL.md"

echo "=== 5. Empaquetar zip ==="
ZIP="$REPO/weg-scada-$VER-prebuilt-windows.zip"
rm -f "$ZIP"
python3 - "$WORK" "$VER" "$ZIP" <<'PY'
import shutil, sys
work, ver, zip_path = sys.argv[1], sys.argv[2], sys.argv[3]
base = zip_path[:-4] if zip_path.endswith('.zip') else zip_path
shutil.make_archive(base, 'zip', root_dir=work, base_dir=f'weg-scada-{ver}')
PY

rm -rf "$WORK"
echo ""
echo "LISTO: $ZIP"
ls -lh "$ZIP" | awk '{print "  tamaño:", $5}'
