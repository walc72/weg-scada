#!/usr/bin/env bash
# =============================================================================
# WEG SCADA — instalador (Ubuntu / Debian)
#
#   curl -fsSL https://github.com/walc72/weg-scada/releases/latest/download/install.sh | sudo bash
#
# Instala Docker si falta, baja el release, genera las claves internas, crea
# los usuarios y levanta todo en /opt/weg-scada. Para actualizar después:
#   sudo weg-scada update
#
# Instalación desatendida (sin preguntas), con variables de entorno:
#   WEG_VERSION (por defecto, el último release)   WEG_DIR (/opt/weg-scada)
#   WEG_MODE=planta|replica   WEG_TZ   WEG_TAILSCALE=si|no
#   WEG_SUPERADMIN_USER  WEG_SUPERADMIN_PASSWORD  WEG_ADMIN_USER  WEG_ADMIN_PASSWORD
#   WEG_PACKAGE=/ruta/weg-scada-<ver>.tar.gz   (usar un paquete local en vez de bajarlo)
# =============================================================================
set -euo pipefail

REPO="walc72/weg-scada"
DIR="${WEG_DIR:-/opt/weg-scada}"

c_ok=$'\e[32m'; c_warn=$'\e[33m'; c_err=$'\e[31m'; c_b=$'\e[1m'; c_0=$'\e[0m'
say()  { echo "${c_b}==>${c_0} $*"; }
ok()   { echo "${c_ok}✔${c_0} $*"; }
warn() { echo "${c_warn}!${c_0} $*"; }
die()  { echo "${c_err}✘ $*${c_0}" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Correlo con sudo:  curl -fsSL https://github.com/$REPO/releases/latest/download/install.sh | sudo bash"

# Con `curl | bash` la entrada estándar es el script: las preguntas van a /dev/tty.
TTY=""
if { : </dev/tty; } 2>/dev/null; then TTY=/dev/tty; fi

ask() {           # ask VAR "pregunta" "default"
  local var=$1 q=$2 def=${3:-} ans
  if [ -n "${!var:-}" ]; then return; fi
  [ -n "$TTY" ] || { printf -v "$var" '%s' "$def"; return; }
  read -r -p "$q${def:+ [$def]}: " ans <"$TTY"
  printf -v "$var" '%s' "${ans:-$def}"
}
ask_secret() {    # ask_secret VAR "pregunta"
  local var=$1 q=$2 a b
  if [ -n "${!var:-}" ]; then return; fi
  [ -n "$TTY" ] || die "Falta $var (instalación sin terminal)"
  while true; do
    read -r -s -p "$q: " a <"$TTY"; echo
    if [ ${#a} -lt 6 ]; then warn "Mínimo 6 caracteres"; continue; fi
    read -r -s -p "Repetir: " b <"$TTY"; echo
    [ "$a" = "$b" ] && break
    warn "No coinciden, de nuevo"
  done
  printf -v "$var" '%s' "$a"
}
gen() { openssl rand -hex "${1:-24}"; }
json_str() { local s=${1//\\/\\\\}; s=${s//\"/\\\"}; printf '"%s"' "$s"; }

echo
echo "${c_b}WEG SCADA — instalación${c_0}"
echo

# ─── Instalación existente ──────────────────────────────────────────────
if [ -f "$DIR/.env" ]; then
  die "Ya hay una instalación en $DIR. Para actualizarla:  sudo weg-scada update"
fi

# ─── Dependencias básicas ───────────────────────────────────────────────
if ! command -v curl >/dev/null || ! command -v openssl >/dev/null; then
  command -v apt-get >/dev/null || die "Instalá curl y openssl y volvé a correr el instalador"
  say "Instalando curl y openssl"
  apt-get update -qq && apt-get install -y -qq curl openssl ca-certificates >/dev/null
fi

# ─── Versión ────────────────────────────────────────────────────────────
VER="${WEG_VERSION:-}"
if [ -z "$VER" ]; then
  VER=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)
  [ -n "$VER" ] || die "No se pudo averiguar el último release (¿hay internet?)"
fi
ok "Versión $VER"

# ─── Preguntas ──────────────────────────────────────────────────────────
DEF_TZ=$(timedatectl show -p Timezone --value 2>/dev/null || true)
[ -n "$DEF_TZ" ] && [ "$DEF_TZ" != "Etc/UTC" ] && [ "$DEF_TZ" != "UTC" ] || DEF_TZ="America/Argentina/Cordoba"

if [ -z "${WEG_MODE:-}" ]; then
  echo "¿Qué servidor es?"
  echo "  1) Planta  — lee los equipos por Modbus (bombas y medidores)"
  echo "  2) Réplica de oficina — copia de solo lectura que se sincroniza desde una planta"
  ask WEG_MODE "Elegí 1 o 2" "1"
fi
case "$WEG_MODE" in
  1|planta)  MODE=planta ;;
  2|replica) MODE=replica ;;
  *) die "Opción inválida: $WEG_MODE" ;;
esac
ask WEG_TZ "Zona horaria" "$DEF_TZ"
[ -f "/usr/share/zoneinfo/$WEG_TZ" ] || warn "No encuentro la zona horaria $WEG_TZ en este sistema; la uso igual"

echo
echo "Superadmin: el único que ve Marca, Conexión y Réplicas (no se puede eliminar)."
ask WEG_SUPERADMIN_USER "Usuario superadmin" "superadmin"
ask_secret WEG_SUPERADMIN_PASSWORD "Contraseña del superadmin"
echo
echo "Administrador: maneja la configuración y los usuarios."
ask WEG_ADMIN_USER "Usuario administrador" "admin"
[ "$WEG_ADMIN_USER" != "$WEG_SUPERADMIN_USER" ] || die "El administrador tiene que tener otro usuario que el superadmin"
ask_secret WEG_ADMIN_PASSWORD "Contraseña del administrador"
echo
ask WEG_TAILSCALE "¿Instalar Tailscale para acceso remoto? (si/no)" "si"

# ─── Docker ─────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null; then
  say "Instalando Docker (script oficial get.docker.com)"
  curl -fsSL https://get.docker.com | sh >/dev/null
  systemctl enable --now docker >/dev/null 2>&1 || true
fi
docker compose version >/dev/null 2>&1 || die "Falta el plugin 'docker compose' (instalá docker-compose-plugin)"
ok "Docker $(docker version -f '{{.Server.Version}}' 2>/dev/null || echo '?')"

# ─── Tailscale (opcional) ───────────────────────────────────────────────
case "$WEG_TAILSCALE" in
  s|si|sí|y|yes)
    if ! command -v tailscale >/dev/null; then
      say "Instalando Tailscale (script oficial tailscale.com)"
      curl -fsSL https://tailscale.com/install.sh | sh >/dev/null
    fi
    ok "Tailscale instalado — la conexión se hace desde Configuración → Conexión"
    ;;
esac
mkdir -p /var/run/tailscale   # weg-agent lo monta aunque no haya Tailscale

# ─── Archivos del release ───────────────────────────────────────────────
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
if [ -n "${WEG_PACKAGE:-}" ]; then          # paquete local (pruebas / sin GitHub)
  cp "$WEG_PACKAGE" "$TMP/pkg.tgz"
else
  say "Descargando weg-scada $VER"
  curl -fsSL "https://github.com/$REPO/releases/download/$VER/weg-scada-$VER.tar.gz" -o "$TMP/pkg.tgz" \
    || die "No se pudo bajar el paquete del release $VER"
fi
tar xzf "$TMP/pkg.tgz" -C "$TMP"
mkdir -p "$DIR"
cp -r "$TMP/weg-scada/." "$DIR/"
cd "$DIR"
mkdir -p config reports backups
if [ "$MODE" = planta ] && [ ! -f config/config.json ]; then cp config.template.json config/config.json; fi
chown -R 1001:1001 config reports      # weg-api / poller / réplica corren como uid 1001

# ─── .env (claves internas generadas acá) ───────────────────────────────
umask 077
{
  echo "# Generado por install.sh el $(date '+%Y-%m-%d %H:%M'). Referencia de variables: .env.example"
  echo "WEG_VERSION=$VER"
  echo "COMPOSE_PROJECT_NAME=weg-scada"
  if [ "$MODE" = replica ]; then echo "COMPOSE_FILE=docker-compose.yml:docker-compose.replica.yml"; fi
  echo "TZ=$WEG_TZ"
  echo "INFLUXDB_USERNAME=admin"
  echo "INFLUXDB_PASSWORD=$(gen 16)"
  echo "INFLUXDB_ORG=tecnoelectric"
  echo "INFLUXDB_BUCKET=weg_drives"
  echo "INFLUXDB_TOKEN=$(gen 32)"
  echo "INFLUXDB_RETENTION=1095d"
  echo "GF_ADMIN_USER=admin"
  echo "GF_ADMIN_PASSWORD=$(gen 12)"
  echo "AGENT_TOKEN=$(gen 32)"
  echo "DAILY_REPORT_ENABLED=true"
  echo "DAILY_REPORT_HOUR=6"
  echo "# Usuarios: se crean en config/settings.json (no van acá)"
  echo "AUTH_PASSWORD="
  echo "# Correo de Grafana (opcional; el SMTP del SCADA se configura en Configuración → Correo)"
  echo "GF_SMTP_USER="
  echo "GF_SMTP_PASSWORD="
  echo "GF_SMTP_FROM="
} > .env
umask 022
ok "Claves internas generadas en $DIR/.env"

# ─── Imágenes ───────────────────────────────────────────────────────────
say "Descargando imágenes (puede tardar unos minutos)"
# Baja todo lo que pueda (una falla no cancela las demás) y después verifica
# que estén todas: sirve también si alguna ya estaba cargada en el equipo.
docker compose pull -q --ignore-pull-failures 2>&1 | grep -vi 'warn' || true
missing=""
for img in $(docker compose config --images); do docker image inspect "$img" >/dev/null 2>&1 || missing="$missing $img"; done
[ -z "$missing" ] || die "Faltan imágenes:$missing. Si el error dice 'denied', los paquetes de ghcr.io todavía no son públicos."
ok "Imágenes listas"

# ─── Usuarios ───────────────────────────────────────────────────────────
say "Creando usuarios"
if ! out=$(printf '{"superadmin":{"user":%s,"password":%s},"admin":{"user":%s,"password":%s}}' \
  "$(json_str "$WEG_SUPERADMIN_USER")" "$(json_str "$WEG_SUPERADMIN_PASSWORD")" \
  "$(json_str "$WEG_ADMIN_USER")" "$(json_str "$WEG_ADMIN_PASSWORD")" \
  | docker compose run --rm -T --no-deps weg-api node src/cli/init-users.js 2>&1); then
  echo "$out" | tail -5; die "No se pudieron crear los usuarios"
fi
unset WEG_SUPERADMIN_PASSWORD WEG_ADMIN_PASSWORD
ok "Usuarios: $WEG_SUPERADMIN_USER (superadmin), $WEG_ADMIN_USER (admin)"

# ─── Arranque ───────────────────────────────────────────────────────────
say "Levantando servicios"
docker compose up -d --quiet-pull >/dev/null 2>&1 || docker compose up -d
for _ in $(seq 1 60); do
  st=$(docker inspect -f '{{.State.Health.Status}}' weg-api 2>/dev/null || true)
  [ "$st" = healthy ] && break
  sleep 3
done
[ "${st:-}" = healthy ] && ok "weg-api en marcha" || warn "weg-api todavía no responde; revisá con:  sudo weg-scada status"

install -m 755 "$DIR/weg-scada" /usr/local/bin/weg-scada

# ─── Resumen ────────────────────────────────────────────────────────────
# IPs del equipo, sin las redes internas de Docker
IPS=$(ip -4 -o addr show scope global 2>/dev/null | grep -vE ' (docker[0-9]*|br-[0-9a-f]+|veth[^ ]*) ' \
  | awk '{print $4}' | cut -d/ -f1 | head -3 | tr '\n' ' ')
IPS=${IPS% }
echo
echo "${c_ok}${c_b}Listo: WEG SCADA $VER instalado en $DIR ($MODE)${c_0}"
echo
for ip in ${IPS:-localhost}; do echo "  SCADA:   http://$ip"; done
echo "  Grafana: http://${IPS%% *}:3000  (usuario admin; la contraseña está en $DIR/.env, GF_ADMIN_PASSWORD)"
echo
if [ "$MODE" = planta ]; then
  echo "Siguiente paso: entrá como $WEG_ADMIN_USER y cargá bombas y medidores en Configuración → Dispositivos."
else
  echo "Siguiente paso: entrá como $WEG_SUPERADMIN_USER y en Configuración → Conexión pegá el código de enlace"
  echo "que se genera en la planta (Configuración → Réplicas)."
fi
echo "Comandos: sudo weg-scada status | logs | update | restart"
echo
