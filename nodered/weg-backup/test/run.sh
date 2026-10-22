#!/bin/bash
# Tests de weg-backup (bash puro). Correr en alpine con: bash openssl jq coreutils procps
#   bash nodered/weg-backup/test/run.sh
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
export TZ=America/Asuncion
T=0; P=0; F=0
ok()   { T=$((T+1)); P=$((P+1)); echo "ok $T - $1"; }
bad()  { T=$((T+1)); F=$((F+1)); echo "not ok $T - $1"; }
check() { local name="$1"; shift; if "$@"; then ok "$name"; else bad "$name"; fi; }
nope()  { local name="$1"; shift; if "$@"; then bad "$name"; else ok "$name"; fi; }
eq()    { if [ "$2" == "$3" ]; then ok "$1"; else bad "$1 (esperado '$3', obtenido '$2')"; fi; }
at()    { date -d "$1" +%s; }   # hora local (TZ) -> epoch

W="$(mktemp -d)"; trap 'rm -rf "$W"' EXIT
export CONFIG_DIR="$W/config" BACKUP_DIR="$W/backups" LOCK_DIR="$W/lock"
mkdir -p "$CONFIG_DIR" "$BACKUP_DIR" "$LOCK_DIR"
# shellcheck source=../lib.sh
source "$HERE/lib.sh"

# ── due ──
# 2026-10-22 es jueves; 2026-10-25 domingo; 2026-10-26 lunes.
nope  "diaria antes de la hora"        due diaria 03:00 "" "$(at '2026-10-22 02:59')"
check "diaria después de la hora"      due diaria 03:00 "" "$(at '2026-10-22 03:00:30')"
nope  "diaria ya corrida hoy (reinicio 03:00:30)" due diaria 03:00 "$(at '2026-10-22 03:00:05')" "$(at '2026-10-22 03:00:30')"
check "diaria corrida ayer"            due diaria 03:00 "$(at '2026-10-21 03:00:05')" "$(at '2026-10-22 03:01')"
check "diaria corrida hoy antes de la hora (manual)" due diaria 03:00 "$(at '2026-10-22 01:00')" "$(at '2026-10-22 03:01')"
check "semanal domingo"                due semanal 03:30 "" "$(at '2026-10-25 03:31')"
nope  "semanal lunes"                  due semanal 03:30 "" "$(at '2026-10-26 03:31')"
check "mensual día 1"                  due mensual 03:00 "$(at '2026-10-01 03:00')" "$(at '2026-11-01 03:05')"
nope  "mensual día 2"                  due mensual 03:00 "" "$(at '2026-11-02 03:05')"
check "cambio de mes (diaria 31→1)"    due diaria 03:00 "$(at '2026-10-31 03:00')" "$(at '2026-11-01 03:01')"
nope  "desactivada"                    due desactivada 03:00 "" "$(at '2026-10-22 23:00')"
nope  "hora inválida"                  due diaria 3am "" "$(at '2026-10-22 23:00')"
eq    "next_due diaria (pasada la hora → mañana)" "$(next_due diaria 03:00 "$(at '2026-10-22 04:00')")" "$(iso "$(at '2026-10-23 03:00')")"
eq    "next_due semanal"               "$(next_due semanal 03:30 "$(at '2026-10-22 04:00')")" "$(iso "$(at '2026-10-25 03:30')")"
eq    "next_due mensual"               "$(next_due mensual 03:00 "$(at '2026-10-22 04:00')")" "$(iso "$(at '2026-11-01 03:00')")"
eq    "next_due desactivada"           "$(next_due desactivada 03:00 "$(at '2026-10-22 04:00')")" ""
eq    "next_due frecuencia desconocida" "$(next_due anual 03:00 "$(at '2026-10-22 04:00')")" ""
nope  "frecuencia desconocida"         due anual 03:00 "" "$(at '2026-10-22 23:00')"
# Recuperar horario perdido (había corrida previa)
LASTSUN="$(at '2026-10-18 03:30:10')"
check "semanal: apagado todo el domingo → corre el lunes" due semanal 03:30 "$LASTSUN" "$(at '2026-10-26 08:00')"
nope  "semanal: recuperado una sola vez" due semanal 03:30 "$(at '2026-10-26 08:00:05')" "$(at '2026-10-26 09:00')"
nope  "semanal: semana normal, lunes nada" due semanal 03:30 "$(at '2026-10-25 03:30:10')" "$(at '2026-10-26 08:00')"
nope  "semanal: semana normal, sábado nada" due semanal 03:30 "$(at '2026-10-25 03:30:10')" "$(at '2026-10-31 23:59')"
check "mensual: apagado el día 1 → corre el 3" due mensual 03:00 "$(at '2026-10-01 03:00')" "$(at '2026-11-03 10:00')"
nope  "diaria: ayer corrió, hoy antes de hora nada" due diaria 03:00 "$(at '2026-10-21 03:00:05')" "$(at '2026-10-22 02:00')"
check "diaria: ayer no corrió (apagado) → corre antes de la hora de hoy" due diaria 03:00 "$(at '2026-10-20 03:00:05')" "$(at '2026-10-22 02:00')"
eq    "iso ida y vuelta"               "$(epoch_of "$(iso 1793000000)")" "1793000000"

# ── filename ──
E="$(at '2026-10-22 03:00')"
eq "filename cifrado"    "$(filename config agriplus-1a2b3c4d "$E" 1)" "weg-config-agriplus-1a2b3c4d-20261022-0300.tar.gz.enc"
eq "filename sin cifrar" "$(filename historico agriplus-1a2b3c4d "$E" 0)" "weg-historico-agriplus-1a2b3c4d-20261022-0300.tar.gz"

# ── installation_id ──
b64u() { printf '%s' "$1" | base64 | tr -d '=\n' | tr '/+' '_-'; }
echo "1a2b3c4d-5e6f-4000-8000-000000000000" > "$CONFIG_DIR/install-id"
eq "sin licencia" "$(installation_id)" "sin-licencia-1a2b3c4d"
echo "$(b64u '{"v":1,"cliente":"Agro Plus S.A.","installId":"1A2B3C4D-5e6f-4000-8000-000000000000"}').$(b64u firma)" > "$CONFIG_DIR/license.key"
eq "con licencia" "$(installation_id)" "agro-plus-s-a-1a2b3c4d"
echo "$(b64u '{"v":1,"cliente":"Otro","installId":"99999999-0000-0000-0000-000000000000"}').$(b64u firma)" > "$CONFIG_DIR/license.key"
eq "licencia de otra instalación" "$(installation_id)" "sin-licencia-1a2b3c4d"
echo "basura" > "$CONFIG_DIR/license.key"
eq "licencia ilegible" "$(installation_id)" "sin-licencia-1a2b3c4d"
rm -f "$CONFIG_DIR/license.key" "$CONFIG_DIR/install-id"
eq "sin install-id" "$(installation_id)" "sin-licencia-00000000"

# ── encrypt / decrypt ──
FRASE='frase-secreta-de-prueba-123'
nope "has_frase sin archivo" has_frase
echo '{"frase":""}' > "$CONFIG_DIR/backup-secretos.json"
nope "has_frase vacía" has_frase
jq -n --arg f "$FRASE" '{frase:$f}' > "$CONFIG_DIR/backup-secretos.json"
check "has_frase" has_frase
mkdir -p "$W/src"; head -c 200000 /dev/urandom > "$W/src/datos.bin"
tar czf "$W/plano.tar.gz" -C "$W/src" .
check "encrypt"            encrypt "$W/plano.tar.gz" "$W/c.enc"
check "decrypt ida y vuelta" decrypt "$W/c.enc" "$W/d.tar.gz"
check "mismo contenido"    cmp -s "$W/plano.tar.gz" "$W/d.tar.gz"
check "formato openssl (Salted__)" [ "$(head -c 8 "$W/c.enc")" == "Salted__" ]
jq -n '{frase:"otra-frase-distinta-456"}' > "$CONFIG_DIR/backup-secretos.json"
nope "decrypt con frase incorrecta falla" decrypt "$W/c.enc" "$W/x.tar.gz"
check "frase incorrecta no deja archivo" [ ! -e "$W/x.tar.gz" ]
jq -n --arg f "$FRASE" '{frase:$f}' > "$CONFIG_DIR/backup-secretos.json"

# La frase no aparece en la línea de comando ni en el entorno de ningún proceso.
head -c 30000000 /dev/urandom > "$W/grande.bin"
encrypt "$W/grande.bin" "$W/grande.enc" & epid=$!
seen=0; leak=0
while kill -0 "$epid" 2>/dev/null; do
  a="$(ps -eo args=)"            # comparar en bash: un grep con la frase saldría en ps
  [[ "$a" == *"openssl enc"* ]] && seen=1
  [[ "$a" == *"$FRASE"* ]] && leak=1
  for e in /proc/[0-9]*/environ; do [[ "$(tr '\0' '\n' 2>/dev/null < "$e")" == *"$FRASE"* ]] && leak=1; done
done
wait "$epid"
check "se observó openssl corriendo" [ "$seen" = 1 ]
check "la frase no aparece en ps ni environ" [ "$leak" = 0 ]
rm -f "$W/grande.bin" "$W/grande.enc"

# ── prune_local ──
P_D="$W/prune"; mkdir -p "$P_D"
for d in 01 02 03 04 05; do touch "$P_D/weg-config-x-1111aaaa-202610${d}-0300.tar.gz.enc"; done
touch "$P_D/weg-config-y-2222bbbb-20261006-0300.tar.gz"           # otra instalación, más nueva
touch "$P_D/weg-historico-x-1111aaaa-20261001-0300.tar.gz.enc"    # otra parte
touch "$P_D/weg-backup-2026-01.tar.gz" "$P_D/weg-backup-2026-02.tar.gz"   # legacy
prune_local "$P_D" config 3
eq "prune_local conserva N (los más nuevos)" "$(ls "$P_D" | grep '^weg-config-' | sort | tr '\n' ' ')" \
  "weg-config-x-1111aaaa-20261004-0300.tar.gz.enc weg-config-x-1111aaaa-20261005-0300.tar.gz.enc weg-config-y-2222bbbb-20261006-0300.tar.gz "
check "prune_local no toca otra parte" [ -e "$P_D/weg-historico-x-1111aaaa-20261001-0300.tar.gz.enc" ]
check "prune_local no toca legacy" [ -e "$P_D/weg-backup-2026-01.tar.gz" -a -e "$P_D/weg-backup-2026-02.tar.gz" ]

# ── estado ──
rm -f "$CONFIG_DIR/backup-estado.json"
eq "estado vacío" "$(state_read | jq -c .)" '{"enCurso":null,"ultima":{"config":null,"historico":null},"proxima":{"config":null,"historico":null},"historial":[]}'
for i in $(seq 1 32); do
  state_record_run "$(jq -nc --argjson i "$i" '{parte:"config",inicio:"2026-10-22T06:00:00Z",fin:"2026-10-22T06:00:01Z",ok:true,archivo:("f\($i)"),bytes:1,cifrado:true,destinos:{local:"ok"}}')"
done
eq "historial máx 30, más nuevo primero" "$(state_read | jq -c '[(.historial|length), .historial[0].archivo, .historial[29].archivo]')" '[30,"f32","f3"]'
eq "ultima.config" "$(state_read | jq -r .ultima.config.archivo)" "f32"
eq "last_epoch" "$(last_epoch config)" "$(epoch_of 2026-10-22T06:00:00Z)"
eq "last_epoch sin datos" "$(last_epoch historico)" ""
check "estado legible por la API (644)" [ "$(stat -c %a "$CONFIG_DIR/backup-estado.json")" = 644 ]

# ── backup.sh (modo módulo) ──
rm -f "$CONFIG_DIR/backup-estado.json"
echo '{"modulo":true,"config":{"frecuencia":"diaria","hora":"03:00","copias":2}}' > "$CONFIG_DIR/backup.json"
echo "1a2b3c4d-5e6f-4000-8000-000000000000" > "$CONFIG_DIR/install-id"
echo '{"x":1}' > "$CONFIG_DIR/config.json"
echo '{}' > "$CONFIG_DIR/backup-pedido.json"; echo '{}' > "$CONFIG_DIR/backup-prueba.json"
echo '{}' > "$CONFIG_DIR/backup-prueba-resultado.json"; echo tmp > "$CONFIG_DIR/algo.tmp"
export DISK_FLOOR_GB=0 INFLUXDB_TOKEN=tok
bash "$HERE/backup.sh" config >/dev/null; rc=$?
eq "backup.sh config sale 0" "$rc" 0
f="$(ls "$BACKUP_DIR" | grep '^weg-config-sin-licencia-1a2b3c4d-.*\.tar\.gz\.enc$')"
check "archivo de config cifrado en /backups" [ -n "$f" ]
decrypt "$BACKUP_DIR/$f" "$W/cfg.tar.gz"
list="$(tar tzf "$W/cfg.tar.gz" | sed 's#^\./##' | sort | tr '\n' ' ')"
check "tar incluye config.json y secretos" bash -c "[[ '$list' == *config.json* && '$list' == *backup-secretos.json* && '$list' == *install-id* ]]"
nope  "tar excluye pedido/estado/prueba/tmp" bash -c "[[ '$list' == *pedido* || '$list' == *estado* || '$list' == *prueba* || '$list' == *.tmp* ]]"
eq "estado: run ok cifrado" "$(state_read | jq -c '.ultima.config | [.ok,.cifrado,.destinos.local,.archivo,(.bytes>0)]')" "[true,true,\"ok\",\"$f\",true]"
eq "estado: enCurso limpio" "$(state_read | jq -c .enCurso)" "null"
check "sin temporales en /backups" bash -c "! ls -A '$BACKUP_DIR' | grep -q tmp"

# historico sin frase (stub de influx), poda por copias
rm -f "$CONFIG_DIR/backup-secretos.json"
cat > "$W/fake-influx.sh" <<'EOF'
#!/bin/bash
echo "datos influx" > "$1/influx.bin"
EOF
chmod +x "$W/fake-influx.sh"; export INFLUX_BACKUP_CMD="$W/fake-influx.sh"
bash "$HERE/backup.sh" historico >/dev/null
h="$(ls "$BACKUP_DIR" | grep '^weg-historico-.*\.tar\.gz$')"
check "historico sin frase → .tar.gz" [ -n "$h" ]
check "historico contiene el backup de influx" bash -c "tar xzOf '$BACKUP_DIR/$h' ./influx.bin | grep -q 'datos influx'"
eq "estado: historico cifrado:false" "$(state_read | jq -c '.ultima.historico|[.ok,.cifrado]')" "[true,false]"
for d in 01 02 03; do touch "$BACKUP_DIR/weg-config-viejo-00000000-202601${d}-0300.tar.gz.enc"; done
bash "$HERE/backup.sh" config >/dev/null
eq "poda local por copias (2)" "$(ls "$BACKUP_DIR" | grep -c '^weg-config-')" 2

# BACKUP_EXTERNAL con el módulo: solo archivos cifrados
EXT="$W/ext"; mkdir -p "$EXT"
BACKUP_EXTERNAL="$EXT" bash "$HERE/backup.sh" config >/dev/null
eq "externo sin frase → omitido" "$(state_read | jq -r .ultima.config.destinos.externo)" "omitido"
eq "externo sin frase → no copia nada" "$(ls -A "$EXT")" ""
BACKUP_EXTERNAL="$EXT" bash "$HERE/backup.sh" historico >/dev/null
eq "externo historico sin frase → omitido" "$(state_read | jq -r .ultima.historico.destinos.externo)" "omitido"
jq -n --arg f "$FRASE" '{frase:$f}' > "$CONFIG_DIR/backup-secretos.json"
BACKUP_EXTERNAL="$EXT" bash "$HERE/backup.sh" config >/dev/null
eq "externo cifrado → ok" "$(state_read | jq -r .ultima.config.destinos.externo)" "ok"
check "externo cifrado → copiado .enc" bash -c "ls '$EXT' | grep -q '^weg-config-.*\.tar\.gz\.enc$'"
eq "externo cifrado → solo .enc" "$(ls "$EXT" | grep -vc '\.enc$')" 0
rm -f "$CONFIG_DIR/backup-secretos.json"

# influx falla → registra error
export INFLUX_BACKUP_CMD=false
bash "$HERE/backup.sh" historico >/dev/null; rc=$?
check "historico con influx caído sale != 0" [ "$rc" != 0 ]
eq "estado: error registrado" "$(state_read | jq -c '.historial[0]|[.parte,.ok,(.error|length>0)]')" '["historico",false,true]'
export INFLUX_BACKUP_CMD="$W/fake-influx.sh"

# guardián de disco
DISK_FLOOR_GB=999999 bash "$HERE/backup.sh" config >/dev/null; rc=$?
eq "disco bajo → exit 2" "$rc" 2
eq "disco bajo → registrado y local omitido" "$(state_read | jq -c '.historial[0]|[.ok,.destinos.local]')" '[false,"omitido"]'

# lock: un solo backup a la vez
exec 8>"$LOCK_DIR/weg-backup.lock"; flock 8
state_update '.enCurso = {parte:"historico", desde:"2026-10-22T06:00:00Z"}'
bash "$HERE/backup.sh" config >/dev/null; rc=$?
eq "con lock tomado se saltea (exit 3)" "$rc" 3
eq "salteado → registrado" "$(state_read | jq -c '.historial[0]|[.parte,.ok,.destinos.local,.error]')" '["config",false,"omitido","otro backup en curso"]'
eq "salteado → no toca el enCurso del otro" "$(state_read | jq -r .enCurso.parte)" "historico"
exec 8>&-
state_update '.enCurso = null'

# interrupción (docker stop) a mitad: limpia temporales y registra
cat > "$W/slow-influx.sh" <<'EOF'
#!/bin/bash
echo x > "$1/influx.bin"; sleep 2
EOF
chmod +x "$W/slow-influx.sh"
INFLUX_BACKUP_CMD="$W/slow-influx.sh" bash "$HERE/backup.sh" historico >/dev/null & bpid=$!
sleep 0.7; kill -TERM "$bpid"; wait "$bpid"; rc=$?
eq "interrumpido → exit 143" "$rc" 143
eq "interrumpido → sin temporales" "$(ls -A "$BACKUP_DIR" | grep -c '^\.tmp-')" 0
eq "interrumpido → registrado" "$(state_read | jq -c '.historial[0]|[.parte,.ok,.error]')" '["historico",false,"interrumpido"]'
eq "interrumpido → enCurso limpio" "$(state_read | jq -c .enCurso)" "null"

# ── backup.sh legacy (modo actual) ──
L="$W/legacy"; mkdir -p "$L/b" "$L/ext"
for m in 01 02 03; do touch -d "2026-${m}-01 03:00" "$L/b/weg-backup-2026-${m}.tar.gz"; done
antes="$(state_read | md5sum)"
BACKUP_DIR="$L/b" BACKUP_KEEP=2 BACKUP_EXTERNAL="$L/ext" bash "$HERE/backup.sh" legacy >/dev/null; rc=$?
eq "legacy sale 0" "$rc" 0
check "legacy: weg-backup-AAAA-MM.tar.gz" [ -f "$L/b/weg-backup-$(date +%Y-%m).tar.gz" ]
eq "legacy: BACKUP_KEEP=2" "$(ls "$L/b" | grep -c '^weg-backup-')" 2
check "legacy: copia en BACKUP_EXTERNAL" [ -f "$L/ext/weg-backup-$(date +%Y-%m).tar.gz" ]
eq "legacy: no escribe estado" "$(state_read | md5sum)" "$antes"

# ── run.sh (ciclo) ──
cat > "$W/fake-backup.sh" <<EOF
#!/bin/bash
echo "\$*" >> "$W/calls"
EOF
chmod +x "$W/fake-backup.sh"; export BACKUP_SH="$W/fake-backup.sh"
calls() { cat "$W/calls" 2>/dev/null | tr '\n' ' '; }
# shellcheck source=../run.sh
source "$HERE/run.sh"

# legacy: sin backup.json
rm -f "$CONFIG_DIR/backup.json" "$W/calls"; LEGACY_LAST=""
BACKUP_DIR="$L/b2"; mkdir -p "$BACKUP_DIR"
cycle "$(at '2026-11-01 02:59')"; eq "legacy: antes de las 03:00 nada" "$(calls)" ""
cycle "$(at '2026-11-01 03:00:30')"; eq "legacy: día 1 03:00 → backup.sh legacy" "$(calls)" "legacy "
cycle "$(at '2026-11-01 03:01:30')"; eq "legacy: una sola vez" "$(calls)" "legacy "
# reinicio del contenedor (memoria perdida) con el archivo del mes ya hecho
LEGACY_LAST=""; touch -d '2026-11-01 03:00:40' "$BACKUP_DIR/weg-backup-2026-11.tar.gz"
cycle "$(at '2026-11-01 03:02')"; eq "legacy: tras reinicio no repite" "$(calls)" "legacy "
cycle "$(at '2026-11-02 03:00:30')"; eq "legacy: día 2 nada" "$(calls)" "legacy "
# modulo:false también es legacy, y un pedido no se procesa
echo '{"modulo":false,"config":{"frecuencia":"diaria","hora":"03:00"}}' > "$CONFIG_DIR/backup.json"
echo '{"partes":["config"]}' > "$CONFIG_DIR/backup-pedido.json"
rm -f "$W/calls"; LEGACY_LAST=""; rm -f "$BACKUP_DIR"/*
cycle "$(at '2026-12-01 03:00:30')"; eq "modulo:false → legacy" "$(calls)" "legacy "
check "modulo:false no consume el pedido" [ -f "$CONFIG_DIR/backup-pedido.json" ]
# licencia con módulo pero sin nada configurado todavía (la API solo escribió "modulo") → legacy
echo '{"modulo":true}' > "$CONFIG_DIR/backup.json"
rm -f "$W/calls"; LEGACY_LAST=""; rm -f "$BACKUP_DIR"/*
cycle "$(at '2027-01-01 03:00:30')"; eq "modulo:true sin partes → legacy" "$(calls)" "legacy "

# módulo activo
BACKUP_DIR="$W/backups"
echo '{"modulo":true,"config":{"frecuencia":"diaria","hora":"03:00","copias":30},"historico":{"frecuencia":"semanal","hora":"03:30"}}' > "$CONFIG_DIR/backup.json"
rm -f "$CONFIG_DIR/backup-pedido.json" "$CONFIG_DIR/backup-estado.json" "$W/calls"
cycle "$(at '2026-10-25 02:00')"; eq "módulo: antes de hora nada" "$(calls)" ""
eq "módulo: proxima config" "$(state_read | jq -r .proxima.config)" "$(iso "$(at '2026-10-25 03:00')")"
eq "módulo: proxima historico" "$(state_read | jq -r .proxima.historico)" "$(iso "$(at '2026-10-25 03:30')")"
cycle "$(at '2026-10-25 03:00:10')"; eq "módulo: 03:00 config" "$(calls)" "config "
# el stub no registra; simulamos el registro y un reinicio a las 03:00:30
state_record_run "$(jq -nc --arg i "$(iso "$(at '2026-10-25 03:00:10')")" '{parte:"config",inicio:$i,fin:$i,ok:true,archivo:"a",bytes:1,cifrado:true,destinos:{local:"ok"}}')"
cycle "$(at '2026-10-25 03:00:30')"; eq "módulo: no repite tras reinicio" "$(calls)" "config "
cycle "$(at '2026-10-25 03:31')"; eq "módulo: domingo 03:30 historico" "$(calls)" "config historico "
echo '{"partes":["historico","config"],"ts":1}' > "$CONFIG_DIR/backup-pedido.json"
rm -f "$W/calls"
state_record_run "$(jq -nc --arg i "$(iso "$(at '2026-10-25 03:31')")" '{parte:"historico",inicio:$i,fin:$i,ok:true,archivo:"h",bytes:1,cifrado:true,destinos:{local:"ok"}}')"
cycle "$(at '2026-10-25 10:00')"; eq "pedido manual procesado" "$(calls)" "historico config "
check "pedido borrado al tomarlo" [ ! -e "$CONFIG_DIR/backup-pedido.json" ]
echo '{"partes":["rm -rf /"],"ts":1}' > "$CONFIG_DIR/backup-pedido.json"; rm -f "$W/calls"
cycle "$(at '2026-10-25 10:01')"; eq "pedido con parte inválida se ignora" "$(calls)" ""
# enCurso viejo se limpia al arrancar
state_update '.enCurso = {parte:"config", desde:"x"}'
mkdir -p "$BACKUP_DIR/.tmp-historico-123" "$BACKUP_DIR/.tmp-2026-11"
touch "$BACKUP_DIR/.tmp-config-55.tar.gz" "$BACKUP_DIR/.tmp-weg-config-x-20261025-0300.tar.gz.enc" "$CONFIG_DIR/backup-estado.json.77.tmp"
touch "$BACKUP_DIR/weg-config-keep-11111111-20261025-0300.tar.gz.enc"
clear_stale; eq "clear_stale limpia enCurso" "$(state_read | jq -c .enCurso)" "null"
eq "clear_stale borra temporales de un backup cortado" "$(ls -A "$BACKUP_DIR" | grep -c '^\.tmp-')" 0
check "clear_stale borra estado .tmp" [ ! -e "$CONFIG_DIR/backup-estado.json.77.tmp" ]
check "clear_stale no toca backups" [ -e "$BACKUP_DIR/weg-config-keep-11111111-20261025-0300.tar.gz.enc" ]

# horario inválido: un aviso por cambio, no por minuto
echo '{"modulo":true,"config":{"frecuencia":"diaria","hora":"25:00"},"historico":{"frecuencia":"desactivada"}}' > "$CONFIG_DIR/backup.json"
out="$( cycle "$(at '2026-10-25 10:02')"; cycle "$(at '2026-10-25 10:03')" )"
eq "horario inválido avisa una vez" "$(grep -c 'horario inválido para config' <<<"$out")" 1
eq "desactivada no avisa" "$(grep -c 'historico' <<<"$out")" 0
echo '{"modulo":true,"config":{"frecuencia":"anual","hora":"03:00"},"historico":{"frecuencia":"desactivada"}}' > "$CONFIG_DIR/backup.json"
out="$( WARNED[config]="diaria 25:00"; cycle "$(at '2026-10-25 10:04')"; cycle "$(at '2026-10-25 10:05')" )"
eq "cambio a otro valor inválido avisa de nuevo (una vez)" "$(grep -c "frecuencia 'anual'" <<<"$out")" 1
eq "proxima null si inválido/desactivada" "$(state_read | jq -c '[.proxima.config,.proxima.historico]')" "[null,null]"

# run.sh como PID 1: SIGTERM corta rápido y se reenvía al backup en curso
cat > "$W/slow-backup.sh" <<EOF
#!/bin/bash
trap 'echo term >> "$W/term"; exit 143' TERM
echo start >> "$W/term"
sleep 30 & wait \$!
EOF
chmod +x "$W/slow-backup.sh"; rm -f "$W/term"
echo '{"modulo":true,"config":{"frecuencia":"desactivada"},"historico":{"frecuencia":"desactivada"}}' > "$CONFIG_DIR/backup.json"
echo '{"partes":["config"]}' > "$CONFIG_DIR/backup-pedido.json"
BACKUP_SH="$W/slow-backup.sh" bash "$HERE/run.sh" >/dev/null & rpid=$!
for i in $(seq 1 50); do grep -q start "$W/term" 2>/dev/null && break; sleep 0.1; done
t0=$(date +%s%N); kill -TERM "$rpid"; wait "$rpid"; rc=$?; ms=$(( ($(date +%s%N) - t0) / 1000000 ))
eq "SIGTERM → run.sh sale 0" "$rc" 0
check "SIGTERM → sale en menos de 3 s (${ms} ms)" [ "$ms" -lt 3000 ]
check "SIGTERM reenviado al backup en curso" grep -q term "$W/term"
# y en reposo (durmiendo entre ciclos) también
rm -f "$CONFIG_DIR/backup-pedido.json"
BACKUP_SH="$W/slow-backup.sh" bash "$HERE/run.sh" >/dev/null & rpid=$!
sleep 1; t0=$(date +%s%N); kill -TERM "$rpid"; wait "$rpid"; rc=$?; ms=$(( ($(date +%s%N) - t0) / 1000000 ))
check "SIGTERM en reposo → sale rápido (${ms} ms, rc $rc)" [ "$rc" = 0 -a "$ms" -lt 3000 ]

echo "# tests $T"
echo "# pass $P"
echo "# fail $F"
[ "$F" = 0 ]
