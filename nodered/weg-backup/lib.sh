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
#           "destinos": { "local": "ok"|"error <msg>"|"omitido", "externo"?: …, … },
#           "error"?: string }
#   ISO = UTC "AAAA-MM-DDTHH:MM:SSZ". "ultima.<parte>.inicio" es lo que decide "ya corrió este
#   horario" (sobrevive reinicios). Un Run fallido también cuenta: se reintenta en el próximo horario.
#   Errores de Run conocidos: "otro backup en curso" (salteado, local "omitido"), "interrumpido",
#   "espacio libre bajo …" (local "omitido"). destinos.externo (BACKUP_EXTERNAL) es "omitido" sin frase.

CONFIG_DIR="${CONFIG_DIR:-/config}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
LOCK_DIR="${LOCK_DIR:-/tmp}"
ESTADO="$CONFIG_DIR/backup-estado.json"
SECRETOS="$CONFIG_DIR/backup-secretos.json"

log()      { echo "[$(date '+%F %T')] $*"; }
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
  local id short p cliente lid
  id="$(cat "$CONFIG_DIR/install-id" 2>/dev/null | tr -d '[:space:]' | tr 'A-Z' 'a-z')"
  short="${id:0:8}"; [ -n "$short" ] || short=00000000
  p="$(cut -d. -f1 "$CONFIG_DIR/license.key" 2>/dev/null | head -n1 | tr -d '[:space:]' | tr '_-' '/+')"
  while [ $(( ${#p} % 4 )) != 0 ]; do p="$p="; done
  p="$(printf '%s' "$p" | base64 -d 2>/dev/null)"
  cliente="$(jq -r 'select(.v == 1) | .cliente // empty' <<<"$p" 2>/dev/null)"
  lid="$(jq -r '.installId // empty' <<<"$p" 2>/dev/null | tr 'A-Z' 'a-z')"
  cliente="$(printf '%s' "$cliente" | tr 'A-Z' 'a-z' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"
  if [ -n "$cliente" ] && [ -n "$id" ] && [ "$lid" = "$id" ]; then echo "$cliente-$short"
  else echo "sin-licencia-$short"; fi
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
    state_read | jq "$@" > "$tmp" && chmod 644 "$tmp" && mv -f "$tmp" "$ESTADO" || { rm -f "$tmp"; exit 1; }
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
