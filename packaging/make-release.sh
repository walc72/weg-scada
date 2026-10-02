#!/bin/bash
# =============================================================================
# Arma el paquete de instalación de un release (lo corre el workflow
# .github/workflows/release.yml; también sirve local para probar).
#
# Uso:    bash packaging/make-release.sh <version> [out_dir]
# Salida: <out_dir>/weg-scada-<version>.tar.gz  y  <out_dir>/install.sh
#
# El paquete trae el docker-compose con las imágenes publicadas en ghcr.io
# (sin build:), las configs de nginx/mosquitto/grafana, la plantilla de
# config.json, el .env de ejemplo y el comando `weg-scada`.
# =============================================================================
set -euo pipefail

VER="${1:?uso: make-release.sh <version> [out_dir]}"
OUTDIR="${2:-dist-release}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
N="$REPO/nodered"
WORK="$(mktemp -d)"
PKG="$WORK/weg-scada"
mkdir -p "$PKG" "$OUTDIR"

# build: ./<dir>  ->  image: <registro>/weg-scada-<nombre>:<versión>
# El frontend pasa de nginx + dist montado a la imagen con el build adentro.
transform() {
  awk '
    BEGIN {
      img["./weg-api"] = "api"; img["./weg-modbus-poller"] = "poller"; img["./weg-agent"] = "agent";
      img["./weg-backup"] = "backup"; img["./weg-replica"] = "replica";
      ref = "${WEG_REGISTRY:-ghcr.io/walc72}/weg-scada-%s:${WEG_VERSION:?falta WEG_VERSION en .env}"
    }
    { sub(/\r$/, "") }                       # checkout con CRLF (Windows)
    /^  [a-z0-9-]+:/ { svc = $1 }
    /^    build: / {
      dir = $2
      if (!(dir in img)) { print "servicio sin imagen publicada: " dir > "/dev/stderr"; exit 1 }
      printf "    image: " ref "\n", img[dir]; next
    }
    svc == "frontend:" && /^    image: nginx/ { printf "    image: " ref "\n", "frontend"; next }
    /frontend-react\/dist/ { next }
    { print }
  ' "$1"
}

transform "$N/docker-compose.yml" > "$PKG/docker-compose.yml"
transform "$N/docker-compose.replica.yml" > "$PKG/docker-compose.replica.yml"
if grep -nE '^\s+build:|\.\./' "$PKG/docker-compose.yml" "$PKG/docker-compose.replica.yml"; then
  echo "ERROR: quedó un build: o una ruta fuera del paquete en el compose" >&2; exit 1
fi

cp -r "$N/nginx" "$N/mosquitto" "$N/grafana" "$PKG/"
cp "$N/.env.example" "$PKG/.env.example"
cp "$REPO/packaging/config.template.json" "$PKG/config.template.json"
cp "$REPO/packaging/weg-scada" "$PKG/weg-scada"
chmod +x "$PKG/weg-scada"
echo "$VER" > "$PKG/VERSION"

tar czf "$OUTDIR/weg-scada-$VER.tar.gz" -C "$WORK" weg-scada
cp "$REPO/packaging/install.sh" "$OUTDIR/install.sh"
rm -rf "$WORK"
echo "Paquete: $OUTDIR/weg-scada-$VER.tar.gz"
