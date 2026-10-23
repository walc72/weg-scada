#!/bin/bash
# Funciones de weg-backup (las usan backup.sh y run.sh; las prueba test/run.sh).
#
# Estado: $CONFIG_DIR/backup-estado.json (lo escribe solo weg-backup; lo lee la API, 644)
#   {
#     "enCurso":  null | { "parte": "config"|"historico", "desde": ISO },
#     "ultima":   { "config": Run|null, "historico": Run|null },
#     "proxima":  { "config": ISO|null, "historico": ISO|null },   // null = desactivada
#     "historial": [ Run, … ]                                       // máx 30, más nuevo primero
#   }
#   Run = { "parte", "inicio": ISO, "fin": ISO, "ok": bool, "archivo": nombre|null,
#           "bytes": n, "cifrado": bool,
#           "destinos": { "local": "ok"|"error <msg>"|"omitido",
#                         "externo"?, "drive"?, "sftp"?: mismo formato },
#           "error"?: string }
#   ISO = UTC "AAAA-MM-DDTHH:MM:SSZ". "ultima.<parte>.inicio" es lo que decide "ya corrió este
#   horario" (sobrevive reinicios). Un Run fallido también cuenta: se reintenta en el próximo horario.
#   Errores de Run conocidos: "otro backup en curso" (salteado, local "omitido"), "interrumpido",
#   "espacio libre bajo …" (local "omitido"). destinos.externo (BACKUP_EXTERNAL) es "omitido" sin frase.
#   destinos.drive / destinos.sftp aparecen solo si backup.json los tiene "activo": true; sin frase
#   son "omitido" (nunca se sube nada sin cifrar). Run.ok = todos los destinos no omitidos en "ok".
#
# backup.json (lo escribe la API; sin secretos), destinos:
#   "drive": { "activo": bool, "carpetaId": id, "cuenta": email }
#   "sftp":  { "activo": bool, "host", "puerto": n (22), "usuario", "carpeta": ruta ("" = home) }
#
# backup-secretos.json (600; lo escribe SOLO la API; weg-backup lo lee):
#   { "frase": string, "drive": { "client_id", "client_secret" } }
# backup-drive-token.json (600): el token mismo, formato de rclone (oauth2.Token de Go)
#   { "access_token", "token_type": "Bearer", "refresh_token", "expiry": RFC3339 }
#   Lo crea la API al conectar Drive y lo borra al desconectar; weg-backup lo reescribe tras cada uso
#   si rclone refrescó el token (atómico, mismo dueño, 600), nunca lo recrea si no existe, y no lo
#   pisa si la API cambió la conexión mientras tanto (distinto refresh_token). refresh_token es
#   obligatorio. access_token vacío o expiry ausente → se fuerza un refresco (rclone descarta el
#   refresh_token si access_token viene vacío, por eso rclone_conf pone uno de relleno).
#
# Dueños: weg-backup corre como root y weg-api como 1001. Todo archivo de /config que weg-backup
# reemplaza conserva su dueño; los nuevos quedan API_UID:API_GID (1001) — ver own_like.
#
# Poda (local y remota): solo archivos con el nombre de instalación actual. Copias hechas con otro
# nombre (p. ej. "sin-licencia-…" antes de instalar la licencia) nunca se podan: se borran a mano.
#
# Prueba de destino (la API escribe backup-prueba.json; run.sh la procesa entre backups):
#   pedido:    { "destino": "drive"|"sftp", "ts": n }   (se borra al tomarlo)
#   resultado: backup-prueba-resultado.json (644) { "destino", "ts" (el del pedido), "ok": bool,
#              "error"?: msg, "huella"?: "SHA256:…", "knownHostsLine"?: líneas de known_hosts }
#   Sube y borra weg-prueba-<ts>.txt. SFTP sin la huella del host en backup-ssh/known_hosts: no se
#   conecta; corre ssh-keyscan y devuelve huella (de la clave ed25519 si la hay) + knownHostsLine
#   (todas las claves escaneadas, una por línea, para agregar tal cual a known_hosts) con ok:false.

CONFIG_DIR="${CONFIG_DIR:-/config}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
LOCK_DIR="${LOCK_DIR:-/tmp}"
RCLONE_TMP="${RCLONE_TMP:-/tmp}"
ESTADO="$CONFIG_DIR/backup-estado.json"
SECRETOS="$CONFIG_DIR/backup-secretos.json"
SSH_DIR="$CONFIG_DIR/backup-ssh"
DRIVE_TOKEN_FILE="$CONFIG_DIR/backup-drive-token.json"
API_UID="${API_UID:-1001}"; API_GID="${API_GID:-1001}"

log()      { echo "[$(date '+%F %T')] $*"; }

# own_like <tmp> <destino>: antes de reemplazar <destino> con mv, le da a <tmp> el dueño de <destino>
# (o API_UID:API_GID si es nuevo), para que weg-api (1001) lo pueda leer y reemplazar. Siempre 0:
# sin root (desarrollo) chown falla y no importa.
own_like() {
  if [ -e "$2" ]; then chown --reference="$2" "$1" 2>/dev/null; else chown "$API_UID:$API_GID" "$1" 2>/dev/null; fi
  return 0
}
# freeGB <dir> → GB libres en el disco de <dir> (vacío si no se puede medir).
freeGB()   { df -PBG "$1" 2>/dev/null | awk 'NR==2{gsub("G","",$4); print $4+0}'; }
iso()      { date -u -d "@$1" +%Y-%m-%dT%H:%M:%SZ; }
epoch_of() { date -d "$1" +%s 2>/dev/null; }

# Epoch de la hora programada (HH:MM local, TZ del contenedor) del día de <epoch>.
_sched() { date -d "$(date -d "@$2" +%F) $1" +%s 2>/dev/null; }
# ¿<epoch> cae en un día que corresponde a <frecuencia>?
_day_ok() {
  case "$1" in
    diaria)  return 0 ;;
    semanal) [ "$(date -d "@$2" +%w)" = 0 ] ;;    # domingo
    mensual) [ "$(date -d "@$2" +%d)" = 01 ] ;;   # día 1
    *) return 1 ;;
  esac
}

# valid_sched <frecuencia> <HH:MM> → 0 si es programable (desactivada o desconocida → 1).
valid_sched() {
  case "$1" in diaria|semanal|mensual) ;; *) return 1 ;; esac
  [[ "$2" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]
}

# due <frecuencia> <HH:MM> <ultimo_epoch|''> <ahora_epoch> → 0 si toca ejecutar ahora:
# el horario más reciente ya pasado no se ejecutó todavía (una vez por horario).
# Con último corrido: se recupera un horario perdido (contenedor apagado el domingo → corre el
# lunes). Sin último (recién configurado): solo cuenta el horario de hoy, sin corrida sorpresa.
due() {
  local freq="$1" hora="$2" last="$3" now="$4" d s="" day
  valid_sched "$freq" "$hora" || return 1
  for d in $(seq 0 $([ -z "$last" ] && echo 0 || echo 31)); do
    day="$(date -d "$(date -d "@$now" +%F) -$d days" +%F)"
    s="$(date -d "$day $hora" +%s 2>/dev/null)" || { s=""; continue; }
    if [ "$s" -le "$now" ] && _day_ok "$freq" "$s"; then break; fi
    s=""
  done
  [ -n "$s" ] || return 1
  [ -z "$last" ] || [ "$last" -lt "$s" ]
}

# next_due <frecuencia> <HH:MM> <ahora_epoch> → ISO del próximo horario (> ahora), o vacío.
next_due() {
  local freq="$1" hora="$2" now="$3" d day s
  valid_sched "$freq" "$hora" || return 0
  for d in $(seq 0 62); do
    day="$(date -d "$(date -d "@$now" +%F) +$d days" +%F)"
    s="$(date -d "$day $hora" +%s 2>/dev/null)" || continue
    if [ "$s" -gt "$now" ] && _day_ok "$freq" "$s"; then iso "$s"; return 0; fi
  done
}

# filename <parte> <instalacion> <epoch> <cifrado:0|1>
filename() {
  local n="weg-$1-$2-$(date -d "@$3" +%Y%m%d-%H%M).tar.gz"
  [ "$4" = 1 ] && n="$n.enc"
  echo "$n"
}

# installation_id → "<cliente-slug>-<8 del install-id>" o "sin-licencia-<8>".
# ponytail: no verifica la firma (solo nombra archivos; la API es la que valida la licencia).
installation_id() {
  local id short cliente
  id="$(cat "$CONFIG_DIR/install-id" 2>/dev/null | tr -d '[:space:]' | tr 'A-Z' 'a-z')"
  short="${id:0:8}"; [ -n "$short" ] || short=00000000
  cliente="$(license_cliente | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  if [ -n "$cliente" ]; then echo "$cliente-$short"; else echo "sin-licencia-$short"; fi
}

# license_cliente → cliente de license.key si es de este install-id (sin verificar firma), o vacío.
license_cliente() {
  local id p lid
  id="$(cat "$CONFIG_DIR/install-id" 2>/dev/null | tr -d '[:space:]' | tr 'A-Z' 'a-z')"
  p="$(cut -d. -f1 "$CONFIG_DIR/license.key" 2>/dev/null | head -n1 | tr -d '[:space:]' | tr '_-' '/+')"
  while [ $(( ${#p} % 4 )) != 0 ]; do p="$p="; done
  p="$(printf '%s' "$p" | base64 -d 2>/dev/null)"
  lid="$(jq -r '.installId // empty' <<<"$p" 2>/dev/null | tr 'A-Z' 'a-z')"
  [ -n "$id" ] && [ "$lid" = "$id" ] || return 0
  jq -r 'select(.v == 1) | .cliente // empty' <<<"$p" 2>/dev/null
  return 0
}

# ── Cifrado: la frase va por un descriptor (fd 3), nunca por argv ni entorno ──
has_frase() { jq -e '(.frase // "") | length > 0' "$SECRETOS" >/dev/null 2>&1; }
_frase()    { jq -j '.frase // ""' "$SECRETOS"; }
OSSL=(enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -pass fd:3)

encrypt() {
  openssl "${OSSL[@]}" -in "$1" -out "$2" 3< <(_frase) || { rm -f "$2"; return 1; }
}
# Además de openssl, exige que el resultado sea gzip válido (frase incorrecta → falla siempre).
decrypt() {
  if openssl "${OSSL[@]}" -d -in "$1" -out "$2" 3< <(_frase) 2>/dev/null && gzip -t "$2" 2>/dev/null; then return 0; fi
  rm -f "$2"; return 1
}

# prune_local <dir> <parte> <copias>: conserva las <copias> más nuevas (por fecha del nombre).
# Solo toca weg-<parte>-…-AAAAMMDD-HHMM.tar.gz[.enc]; nunca los weg-backup-AAAA-MM.tar.gz.
prune_local() {
  local dir="$1" parte="$2" copias="$3"
  ls -1 "$dir" 2>/dev/null \
    | sed -nE "s/^(weg-$parte-.+-([0-9]{8}-[0-9]{4})\.tar\.gz(\.enc)?)$/\2 \1/p" \
    | sort -r | tail -n +$((copias + 1)) | cut -d' ' -f2- \
    | while read -r f; do log "podar $dir/$f"; rm -f "$dir/$f"; done
}

# ── Estado ──
STATE_EMPTY='{"enCurso":null,"ultima":{"config":null,"historico":null},"proxima":{"config":null,"historico":null},"historial":[]}'
state_read() { jq -e . "$ESTADO" 2>/dev/null || echo "$STATE_EMPTY"; }

# state_update <filtro jq> [args jq…]: aplica y reescribe de forma atómica (bajo lock).
state_update() {
  (
    flock 7
    tmp="$ESTADO.$BASHPID.tmp"
    state_read | jq "$@" > "$tmp" && chmod 644 "$tmp" && own_like "$tmp" "$ESTADO" && mv -f "$tmp" "$ESTADO" || { rm -f "$tmp"; exit 1; }
  ) 7>"$LOCK_DIR/weg-backup-estado.lock"
}

# state_record_run <run-json> [keep]: "keep" no toca enCurso (salteado porque otro está corriendo).
state_record_run() {
  state_update --argjson r "$1" --arg k "${2:-}" \
    '.ultima[$r.parte] = $r | .historial = ([$r] + .historial)[:30] | if $k == "keep" then . else .enCurso = null end'
}

# last_epoch <parte> → epoch de ultima.<parte>.inicio, o vacío.
last_epoch() {
  local i; i="$(state_read | jq -r --arg p "$1" '.ultima[$p].inicio // empty')"
  [ -n "$i" ] && epoch_of "$i"
  return 0
}

# ── Destinos externos (rclone): remotos "drive" y "sftp" ──
_bj()      { jq -r "$1 // empty" "$CONFIG_DIR/backup.json" 2>/dev/null; }
_sj()      { jq -r "$1 // empty" "$SECRETOS" 2>/dev/null; }
_oneline() { [[ "$1" != *$'\n'* && "$1" != *$'\r'* ]]; }   # un salto de línea inyectaría claves en rclone.conf

# drive_ready → 0 si hay con qué armar el remoto (setea DRIVE_ID, DRIVE_SECRET, DRIVE_TOKEN, DRIVE_FOLDER).
drive_ready() {
  DRIVE_ID="$(_sj .drive.client_id)"; DRIVE_SECRET="$(_sj .drive.client_secret)"; DRIVE_FOLDER="$(_bj .drive.carpetaId)"
  DRIVE_TOKEN="$(jq -c 'select(type == "object" and ((.refresh_token // "") | length > 0))
    | if (.access_token // "") == "" then .access_token = "-" | .expiry = "2000-01-01T00:00:00Z" else . end
    | if (.expiry // "") == "" then .expiry = "2000-01-01T00:00:00Z" else . end
    | .token_type = (.token_type // "Bearer")' "$DRIVE_TOKEN_FILE" 2>/dev/null)"
  [ -n "$DRIVE_ID" ] && [ -n "$DRIVE_SECRET" ] && [ -n "$DRIVE_TOKEN" ] && [ -n "$DRIVE_FOLDER" ] \
    && _oneline "$DRIVE_ID$DRIVE_SECRET$DRIVE_FOLDER"
}

# sftp_ready → 0 si la config SFTP es válida (setea SFTP_HOST, SFTP_PORT, SFTP_USER, SFTP_DIR).
sftp_ready() {
  SFTP_HOST="$(_bj .sftp.host)"; SFTP_PORT="$(_bj .sftp.puerto)"; SFTP_USER="$(_bj .sftp.usuario)"
  SFTP_DIR="$(_bj .sftp.carpeta)"; SFTP_PORT="${SFTP_PORT:-22}"
  [[ "$SFTP_HOST" =~ ^[A-Za-z0-9._:-]+$ && "$SFTP_HOST" != -* ]] || return 1
  [[ "$SFTP_PORT" =~ ^[0-9]{1,5}$ ]] && [ "$SFTP_PORT" -ge 1 ] && [ "$SFTP_PORT" -le 65535 ] || return 1
  [[ "$SFTP_USER" =~ ^[A-Za-z0-9._@-]+$ && "$SFTP_USER" != -* ]] || return 1
  _oneline "$SFTP_DIR"
}

# Nombre del host en known_hosts ("host" en el 22, "[host]:puerto" si no).
_kh_name()   { if [ "$SFTP_PORT" = 22 ]; then echo "$SFTP_HOST"; else echo "[$SFTP_HOST]:$SFTP_PORT"; fi; }
known_host() { ssh-keygen -F "$(_kh_name)" -f "$SSH_DIR/known_hosts" >/dev/null 2>&1; }

# rclone_conf <out>: escribe la config (600) con los remotos que estén configurados. Con printf
# (builtin): los secretos no pasan por argv. Nunca se imprime.
rclone_conf() {
  local out="$1"
  ( umask 077; : >"$out" ) && chmod 600 "$out" || return 1
  {
    if drive_ready; then
      printf '[drive]\ntype = drive\nclient_id = %s\nclient_secret = %s\ntoken = %s\nscope = drive.file\nroot_folder_id = %s\nuse_trash = false\n\n' \
        "$DRIVE_ID" "$DRIVE_SECRET" "$DRIVE_TOKEN" "$DRIVE_FOLDER"
    fi
    if sftp_ready; then
      printf '[sftp]\ntype = sftp\nhost = %s\nport = %s\nuser = %s\nkey_file = %s\nknown_hosts_file = %s\nshell_type = none\n\n' \
        "$SFTP_HOST" "$SFTP_PORT" "$SFTP_USER" "$SSH_DIR/id_ed25519" "$SSH_DIR/known_hosts"
    fi
  } >"$out"
}

# rclone_open / rclone_close: config temporal en un directorio propio (700) bajo $RCLONE_TMP; rclone
# reescribe ahí el token refrescado. rclone_close corta un rclone en curso, devuelve el token a
# backup-drive-token.json y borra todo. --timeout es por inactividad: no corta subidas largas que avanzan.
RDIR=""; RCLONE_CONF=""; RC_PID=""; RTOK0=""
RC_FLAGS=(--contimeout 15s --timeout 5m --retries 3 --low-level-retries 10 --log-level ERROR)
RC_MAX=""       # prueba de destino: tope duro por llamada (s); vacío = sin tope
RC_DEADLINE=""  # prueba de destino: tope total (epoch); acorta la última llamada
RC_RC=0         # código de salida del último rc (124 = cortado por timeout)
rclone_open() {
  RDIR="$(mktemp -d "$RCLONE_TMP/weg-rclone.XXXXXX")" || return 1
  RCLONE_CONF="$RDIR/rclone.conf"
  rclone_conf "$RCLONE_CONF"
  RTOK0=""; if drive_ready; then RTOK0="$DRIVE_TOKEN"; fi
  return 0
}
rclone_close() {
  [ -n "$RDIR" ] || return 0
  if [ -n "$RC_PID" ]; then kill -TERM "$RC_PID" 2>/dev/null; wait "$RC_PID" 2>/dev/null; RC_PID=""; fi
  drive_token_writeback
  rm -rf "$RDIR"; RDIR=""; RCLONE_CONF=""
}

# rc <args…>: corre rclone con la config temporal; salida (stdout+stderr) en $RDIR/out. En segundo
# plano + wait para que un SIGTERM se atienda enseguida.
rc() {
  local s t w=()
  if [ -n "$RC_MAX" ]; then
    t="$RC_MAX"
    [ -n "$RC_DEADLINE" ] && [ $((RC_DEADLINE - $(date +%s))) -lt "$t" ] && t=$((RC_DEADLINE - $(date +%s)))
    if [ "$t" -le 0 ]; then : >"$RDIR/out"; RC_RC=124; return 124; fi
    w=(timeout "$t")
  fi
  # 9>&-: el lock de backup.sh no se hereda (un rclone huérfano no debe bloquear el próximo backup).
  "${w[@]}" rclone --config "$RCLONE_CONF" "${RC_FLAGS[@]}" "$@" >"$RDIR/out" 2>&1 </dev/null 9>&- & RC_PID=$!
  wait "$RC_PID"; s=$?; RC_PID=""; RC_RC=$s
  return "$s"
}

# drive_token_writeback: si rclone refrescó el token en su config, lo guarda en backup-drive-token.json.
# Solo un token completo (rclone deja uno sin refresh_token si no puede usarlo), solo si el archivo
# sigue existiendo (borrado = Drive desconectado) y con el mismo refresh_token (no reconectado).
# El token va por stdin, nunca por argv.
# ponytail: sin lock con la API (Node); la ventana es el mv de un archivo chico.
drive_token_writeback() {
  [ -n "$RTOK0" ] && [ -f "$RCLONE_CONF" ] || return 0
  local new rt0 tmp
  new="$(rclone config dump --config "$RCLONE_CONF" 2>/dev/null \
    | jq -c '.drive.token // empty | fromjson? | select((.access_token // "") != "" and (.refresh_token // "") != "")')"
  [ -n "$new" ] && [ "$new" != "$RTOK0" ] || return 0
  rt0="$(jq -r .refresh_token <<<"$RTOK0")"
  tmp="$DRIVE_TOKEN_FILE.weg-backup.$BASHPID.tmp"
  if ( umask 077; jq . <<<"$new" >"$tmp" ) && chmod 600 "$tmp" && own_like "$tmp" "$DRIVE_TOKEN_FILE" \
     && [ -f "$DRIVE_TOKEN_FILE" ] && [ "$(jq -r '.refresh_token // empty' "$DRIVE_TOKEN_FILE" 2>/dev/null)" = "$rt0" ] \
     && mv -f "$tmp" "$DRIVE_TOKEN_FILE"; then log "drive: token refrescado guardado"
  else rm -f "$tmp"; fi
}

# _rpath <remoto> <carpeta> <nombre> → "remoto:carpeta/nombre" ("" = raíz del remoto).
_rpath() { local b="$1:$2"; case "$b" in *: | */) echo "$b$3" ;; *) echo "$b/$3" ;; esac; }

# send <remoto> <archivo> <carpeta>
send() { rc copyto "$2" "$(_rpath "$1" "$3" "$(basename "$2")")"; }

# prune_remote <remoto> <carpeta> <parte> <instalacion> <copias>: conserva las <copias> más nuevas de
# weg-<parte>-<instalacion>-AAAAMMDD-HHMM.tar.gz[.enc] (la carpeta SFTP puede ser compartida).
prune_remote() {
  local r="$1" dir="$2" parte="$3" inst="$4" copias="$5" list f
  rc lsf --files-only "$r:$dir" || return 1
  list="$(grep -E "^weg-$parte-$inst-[0-9]{8}-[0-9]{4}\.tar\.gz(\.enc)?$" "$RDIR/out" | sort -r | tail -n +$((copias + 1)))"
  for f in $list; do
    log "podar $r:$dir/$f"
    rc deletefile "$(_rpath "$r" "$dir" "$f")" || return 1
  done
}

# rclone_error <etiqueta> <host> <puerto> <salida> [código] → mensaje legible (124 = cortado por timeout).
rclone_error() {
  local l="$1" h="$2" p="$3" s="${4,,}" line
  if [ "${5:-}" = 124 ]; then
    if [ "$l" = "Google Drive" ]; then echo "Google Drive no respondió (tiempo agotado)"
    else echo "No se pudo conectar a $h:$p (tiempo agotado)"; fi
    return
  fi
  case "$s" in
    *"key mismatch"*|*"host key has changed"*|*"identification has changed"*)
      echo "La huella SSH de $h cambió; volvé a aceptarla en el portal" ;;
    *"key is unknown"*) echo "Falta aceptar la huella SSH de $h" ;;
    *invalid_grant*|*"expired or revoked"*|*"no refresh token"*) echo "Google revocó el acceso; volvé a conectar Google Drive" ;;
    *storagequotaexceeded*|*"storage quota"*) echo "El Google Drive está lleno" ;;
    *"permission denied"*|*"unable to authenticate"*|*insufficientpermissions*|*insufficientfilepermissions*|*"access denied"*)
      echo "Permiso denegado en $l" ;;
    *"connection refused"*|*"i/o timeout"*|*"no route to host"*|*"no such host"*|*"network is unreachable"*|*"connection timed out"*|*"connection reset"*|*"deadline exceeded"*)
      echo "No se pudo conectar a $h:$p" ;;
    *)
      line="$(printf '%s\n' "$4" \
        | sed -E 's#^[0-9]{4}/[0-9]{2}/[0-9]{2} [0-9:]{8}( [A-Z]+ +:)? *##; s#^Attempt [0-9]+/[0-9]+ failed with [0-9]+ errors? and: ##
                  s#\?[^ "]*##g; s#upload_id=[^ &"]*##g' \
        | grep -v '^[[:space:]]*$' | tail -n1 | cut -c1-200)"
      echo "Error en $l: ${line:-falló sin detalle}" ;;
  esac
}

# Por destino: dest_config (setea ERR si falta algo), carpeta y mapeo de la última salida de rclone.
dest_config() {
  case "$1" in
    drive) drive_ready || { ERR="Google Drive no está conectado"; return 1; } ;;
    sftp)  sftp_ready  || { ERR="Falta configurar el servidor SFTP"; return 1; } ;;
    *) ERR="Destino desconocido"; return 1 ;;
  esac
}
dest_dir() { if [ "$1" = sftp ]; then printf '%s' "$SFTP_DIR"; fi; }   # drive: la raíz es carpetaId
dest_error() {
  if [ "$1" = drive ]; then rclone_error "Google Drive" www.googleapis.com 443 "$(cat "$RDIR/out" 2>/dev/null)" "$RC_RC"
  else rclone_error "SFTP $SFTP_HOST" "$SFTP_HOST" "$SFTP_PORT" "$(cat "$RDIR/out" 2>/dev/null)" "$RC_RC"; fi
}

# enviar <destino> <archivo> <parte> <instalacion> <copias>: sube y poda; RES = ok | error <msg>.
# Requiere rclone_open.
enviar() {
  local d="$1" dir
  if ! dest_config "$d"; then RES="error $ERR"; return; fi
  if [ "$d" = sftp ] && ! known_host; then RES="error Falta aceptar la huella SSH de $SFTP_HOST"; return; fi
  dir="$(dest_dir "$d")"
  if ! send "$d" "$2" "$dir"; then RES="error $(dest_error "$d")"; return; fi
  if ! prune_remote "$d" "$dir" "$3" "$4" "$5"; then RES="error $(dest_error "$d")"; return; fi
  RES=ok
}

# prueba_destino <destino> → setea P_OK (true|false), P_ERR, P_HUELLA, P_KH. Sube y borra
# weg-prueba-<P_TS>.txt. SFTP sin huella aceptada: ssh-keyscan y no se conecta más.
prueba_destino() {
  local d="$1" lines pick f
  P_OK=false; P_ERR=""; P_HUELLA=""; P_KH=""
  if ! dest_config "$d"; then P_ERR="$ERR"; return; fi
  if [ "$d" = sftp ] && ! known_host; then
    lines="$(timeout 15 ssh-keyscan -T 10 -p "$SFTP_PORT" "$SFTP_HOST" 2>/dev/null | grep -v '^#' | grep -v '^[[:space:]]*$')"
    if [ -z "$lines" ]; then P_ERR="No se pudo conectar a $SFTP_HOST:$SFTP_PORT"; return; fi
    pick="$(grep -m1 ' ssh-ed25519 ' <<<"$lines")"; [ -n "$pick" ] || pick="$(head -n1 <<<"$lines")"
    P_HUELLA="$(ssh-keygen -lf /dev/stdin <<<"$pick" 2>/dev/null | awk '{print $2}')"
    P_KH="$lines"
    P_ERR="Falta aceptar la huella SSH de $SFTP_HOST"
    return
  fi
  rclone_open || { P_ERR="Error en $d: no se pudo preparar rclone"; return; }
  f="$RDIR/weg-prueba-$P_TS.txt"
  echo "Prueba de conexión de weg-scada ($(iso "$(date +%s)"))" >"$f"
  if send "$d" "$f" "$(dest_dir "$d")" && rc deletefile "$(_rpath "$d" "$(dest_dir "$d")" "$(basename "$f")")"; then P_OK=true
  else P_ERR="$(dest_error "$d")"; fi
  rclone_close
}
