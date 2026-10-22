#!/bin/bash
# Ciclo de weg-backup (reemplaza a cron): cada minuto decide qué toca y llama a backup.sh.
#   Sin /config/backup.json o "modulo" != true → modo actual: día 1 a las 03:00, backup.sh legacy.
#   Con módulo → config/historico según backup.json + pedidos manuales (backup-pedido.json).
#   Con licencia ("modulo": true) también atiende las pruebas de destino (backup-prueba.json).
# backup.sh se ejecuta de a uno (en serie acá; y con lock por si alguien lo corre a mano).
# Es PID 1 del contenedor: atiende SIGTERM (docker stop) y se lo pasa al backup en curso.
set -uo pipefail
HERE="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
# shellcheck source=lib.sh
source "$HERE/lib.sh"
BACKUP_SH="${BACKUP_SH:-$HERE/backup.sh}"
LEGACY_LAST=""   # último intento del modo actual (en memoria; tras reiniciar manda el archivo del mes)
CHILD=""         # PID del backup.sh en curso
declare -A WARNED=()   # último horario inválido avisado por parte (avisa una vez por cambio)

# Módulo activo = licencia ("modulo": true, lo escribe la API) Y el admin ya configuró alguna parte.
# Un backup.json con solo {"modulo": true} sigue en modo actual (la planta no cambia sola).
modulo_on() { jq -e '.modulo == true and (has("config") or has("historico"))' "$CONFIG_DIR/backup.json" >/dev/null 2>&1; }

# En segundo plano + wait: así un SIGTERM se atiende enseguida aunque el backup tarde.
run_backup() {
  "$BACKUP_SH" "$1" </dev/null & CHILD=$!
  wait "$CHILD"
  CHILD=""
}

on_term() {
  log "señal de parada recibida"
  if [ -n "$CHILD" ]; then kill -TERM "$CHILD" 2>/dev/null; wait "$CHILD"; fi
  exit 0
}

legacy_cycle() {
  local now="$1" f last="$LEGACY_LAST" m
  f="$BACKUP_DIR/weg-backup-$(date -d "@$now" +%Y-%m).tar.gz"
  if [ -f "$f" ]; then m="$(stat -c %Y "$f")"; { [ -z "$last" ] || [ "$m" -gt "$last" ]; } && last="$m"; fi
  if due mensual 03:00 "$last" "$now"; then
    LEGACY_LAST="$now"
    run_backup legacy
  fi
}

cycle() {
  local now="$1" parte freq hora prox cur p pedido
  # Prueba de destino de la API (con licencia, aunque no haya partes configuradas): entre backups.
  if [ -f "$CONFIG_DIR/backup-prueba.json" ] && jq -e '.modulo == true' "$CONFIG_DIR/backup.json" >/dev/null 2>&1; then
    run_backup prueba
  fi
  if ! modulo_on; then legacy_cycle "$now"; return; fi

  for parte in config historico; do
    freq="$(jq -r --arg p "$parte" '.[$p].frecuencia // empty' "$CONFIG_DIR/backup.json")"
    hora="$(jq -r --arg p "$parte" '.[$p].hora // empty' "$CONFIG_DIR/backup.json")"
    if [ "$parte" = config ]; then freq="${freq:-diaria}"; hora="${hora:-03:00}"
    else freq="${freq:-semanal}"; hora="${hora:-03:30}"; fi

    if [ "$freq" != desactivada ] && ! valid_sched "$freq" "$hora"; then
      [ "${WARNED[$parte]:-}" = "$freq $hora" ] || log "AVISO: horario inválido para $parte (frecuencia '$freq', hora '$hora'); no se programa"
      WARNED[$parte]="$freq $hora"
    else
      WARNED[$parte]=""
    fi

    prox="$(next_due "$freq" "$hora" "$now")"
    cur="$(state_read | jq -r --arg p "$parte" '.proxima[$p] // ""')"
    [ "$prox" = "$cur" ] || state_update '.proxima[$p] = (if $v == "" then null else $v end)' --arg p "$parte" --arg v "$prox"

    if due "$freq" "$hora" "$(last_epoch "$parte")" "$now"; then run_backup "$parte"; fi
  done

  # Pedido manual de la API: { "partes": ["config"|"historico"], "ts": … }. Se borra al tomarlo.
  pedido="$CONFIG_DIR/backup-pedido.json"
  if [ -f "$pedido" ]; then
    p="$(jq -r '.partes[]? | strings' "$pedido" 2>/dev/null)"
    rm -f "$pedido"
    while read -r parte; do
      case "$parte" in
        config|historico) log "pedido manual: $parte"; run_backup "$parte" ;;
        "") ;;
        *) log "AVISO: pedido con parte desconocida '$parte'; se ignora" ;;
      esac
    done <<<"$p"
  fi
}

# Al arrancar no hay ningún backup corriendo: lo que quedó de uno cortado (SIGKILL, OOM, corte
# de luz) se limpia. Temporales en /backups (.tmp-config-*, .tmp-historico-*, .tmp-weg-*, y los
# .tmp-AAAA-MM del modo actual), configs temporales de rclone y un enCurso viejo.
clear_stale() {
  local t
  for t in "$BACKUP_DIR"/.tmp-* "$ESTADO".*.tmp "$SECRETOS".*.tmp "$CONFIG_DIR"/backup-prueba-resultado.json.*.tmp \
           "$RCLONE_TMP"/weg-rclone.*; do
    [ -e "$t" ] && { log "limpiando temporal de un backup cortado: $t"; rm -rf "$t"; }
  done
  [ -f "$ESTADO" ] || return 0
  [ "$(state_read | jq -c .enCurso)" = null ] || state_update '.enCurso = null'
}

main() {
  trap on_term TERM INT
  clear_stale
  log "ciclo de backup activo (cada 60 s). Backups en $BACKUP_DIR"
  while true; do
    cycle "$(date +%s)"
    sleep 60 & wait $!
  done
}

[ "${BASH_SOURCE[0]}" = "$0" ] && main
