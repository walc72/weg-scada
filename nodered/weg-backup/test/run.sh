#!/bin/bash
# Tests de weg-backup (bash puro). Correr en alpine con: bash openssl jq coreutils procps rclone openssh-client
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

# ── Destinos externos (rclone) ──
export RCLONE_TMP="$W/rtmp"; mkdir -p "$RCLONE_TMP" "$SSH_DIR"
BJ="$CONFIG_DIR/backup.json"; SJ="$CONFIG_DIR/backup-secretos.json"; TF="$CONFIG_DIR/backup-drive-token.json"
dump() { rclone config dump --config "$1" 2>/dev/null; }
TOK='{"access_token":"ya29.fake-access","token_type":"Bearer","refresh_token":"1//fake-refresh","expiry":"2026-10-22T07:00:00Z"}'
secretos() { jq -n --arg f "$FRASE" '{frase:$f, drive:{client_id:"cid.apps.googleusercontent.com", client_secret:"GOCSPX-fake-secret"}}' > "$SJ"; chmod 600 "$SJ";
            jq . <<<"$TOK" > "$TF"; chmod 600 "$TF"; }

# rclone_conf
echo '{"modulo":true}' > "$BJ"; rm -f "$SJ" "$TF"
rclone_conf "$W/c0.conf"
eq "rclone_conf sin destinos → sin remotos" "$(dump "$W/c0.conf" | jq -c keys)" '[]'
eq "rclone_conf 600" "$(stat -c %a "$W/c0.conf")" 600
secretos
echo '{"modulo":true,"drive":{"activo":true,"carpetaId":"1AbCfolder","cuenta":"a@b.c"}}' > "$BJ"
rclone_conf "$W/c1.conf"
eq "rclone_conf drive" "$(dump "$W/c1.conf" | jq -c '.drive | [.type,.client_id,.client_secret,.scope,.root_folder_id,.use_trash]')" \
  '["drive","cid.apps.googleusercontent.com","GOCSPX-fake-secret","drive.file","1AbCfolder","false"]'
eq "rclone_conf drive: token JSON" "$(dump "$W/c1.conf" | jq -c '.drive.token | fromjson')" "$(jq -c . <<<"$TOK")"
eq "rclone_conf drive: token en una línea" "$(grep -c '^token = {.*}$' "$W/c1.conf")" 1
eq "rclone_conf solo drive" "$(dump "$W/c1.conf" | jq -c keys)" '["drive"]'
eq "rclone_conf 600 (drive)" "$(stat -c %a "$W/c1.conf")" 600
jq '.access_token = "" | del(.expiry)' "$TF" > "$W/s" && mv "$W/s" "$TF"
rclone_conf "$W/c2.conf"
eq "token sin access_token → relleno y vencido (fuerza refresco)" \
  "$(dump "$W/c2.conf" | jq -c '.drive.token | fromjson | [.access_token,.expiry,.refresh_token]')" '["-","2000-01-01T00:00:00Z","1//fake-refresh"]'
jq 'del(.refresh_token)' "$TF" > "$W/s" && mv "$W/s" "$TF"
rclone_conf "$W/c3.conf"
eq "drive sin refresh_token → sin remoto" "$(dump "$W/c3.conf" | jq -c keys)" '[]'
secretos
echo '{"modulo":true,"sftp":{"activo":true,"host":"nas.local","puerto":2222,"usuario":"weg","carpeta":"backups/planta"}}' > "$BJ"
rclone_conf "$W/c4.conf"
eq "rclone_conf sftp (sin carpetaId no hay drive)" "$(dump "$W/c4.conf" | jq -c keys)" '["sftp"]'
eq "rclone_conf sftp" "$(dump "$W/c4.conf" | jq -c '.sftp | [.type,.host,.port,.user,.key_file,.known_hosts_file,.shell_type]')" \
  "[\"sftp\",\"nas.local\",\"2222\",\"weg\",\"$SSH_DIR/id_ed25519\",\"$SSH_DIR/known_hosts\",\"none\"]"
echo '{"sftp":{"activo":true,"host":"nas.local\nkey_file = /etc/shadow","usuario":"weg"}}' > "$BJ"
rclone_conf "$W/c5.conf"
eq "host con salto de línea → sin remoto" "$(dump "$W/c5.conf" | jq -c keys)" '[]'
nope "no se inyecta nada en la config" grep -q shadow "$W/c5.conf"
echo '{"sftp":{"activo":true,"host":"-oProxyCommand=x","usuario":"weg"}}' > "$BJ"
nope "host que parece opción → inválido" sftp_ready
echo '{"sftp":{"activo":true,"host":"nas.local","usuario":"weg","puerto":70000}}' > "$BJ"
nope "puerto fuera de rango → inválido" sftp_ready
echo '{"sftp":{"activo":true,"host":"nas.local","usuario":"weg"}}' > "$BJ"
check "puerto por defecto 22" bash -c "source '$HERE/lib.sh'; sftp_ready && [ \"\$SFTP_PORT\" = 22 ] && [ \"\$(_kh_name)\" = nas.local ]"

# rclone_open / rclone_close: config temporal privada, borrada al cerrar; devuelve el token refrescado
echo '{"modulo":true,"drive":{"activo":true,"carpetaId":"1AbCfolder"},"sftp":{"activo":true,"host":"nas.local","puerto":2222,"usuario":"weg","carpeta":"backups"}}' > "$BJ"
rclone_open; rd="$RDIR"
eq "rclone_open bajo RCLONE_TMP" "$(dirname "$rd")" "$RCLONE_TMP"
eq "rclone_open: directorio 700" "$(stat -c %a "$rd")" 700
eq "rclone_open: config 600" "$(stat -c %a "$RCLONE_CONF")" 600
eq "rclone_open: ambos remotos" "$(dump "$RCLONE_CONF" | jq -c keys)" '["drive","sftp"]'
rclone_close
check "rclone_close borra la config" [ ! -e "$rd" ]
eq "sin refresco → token intacto" "$(jq -c . "$TF")" "$(jq -c . <<<"$TOK")"
NEW='{"access_token":"ya29.nuevo","token_type":"Bearer","refresh_token":"1//fake-refresh","expiry":"2026-10-22T08:00:00.123Z"}'
chown 1234:1234 "$TF"; sj_md5="$(md5sum < "$SJ")"
rclone_open; sed -i "s|^token = .*|token = $NEW|" "$RCLONE_CONF"   # lo que hace rclone al refrescar
rclone_close >/dev/null
eq "token refrescado → vuelve a backup-drive-token.json" "$(jq -c . "$TF")" "$NEW"
eq "token sigue 600" "$(stat -c %a "$TF")" 600
eq "token conserva el dueño (la API lo tiene que poder leer)" "$(stat -c %u:%g "$TF")" "1234:1234"
eq "backup-secretos.json idéntico (solo lo escribe la API)" "$(md5sum < "$SJ")" "$sj_md5"
check "sin temporales del token" bash -c "! ls -A '$CONFIG_DIR' | grep -q 'weg-backup.*tmp'"
rclone_open; sed -i 's|^token = .*|token = {"access_token":"","token_type":"Bearer","expiry":"2026-10-22T08:00:00Z"}|' "$RCLONE_CONF"
rclone_close
eq "token sin refresh_token (refresco fallido) → no se guarda" "$(jq -c . "$TF")" "$NEW"
rclone_open
jq '.refresh_token = "1//reconectado"' "$TF" > "$W/s" && mv "$W/s" "$TF"   # la API reconectó Drive
sed -i 's|^token = .*|token = {"access_token":"ya29.viejo","token_type":"Bearer","refresh_token":"1//fake-refresh","expiry":"2026-10-22T09:00:00Z"}|' "$RCLONE_CONF"
rclone_close
eq "Drive reconectado durante el run → no se pisa" "$(jq -r .refresh_token "$TF")" "1//reconectado"
rclone_open; rm -f "$TF"   # la API desconectó Drive durante el run
sed -i 's|^token = .*|token = {"access_token":"ya29.otro","token_type":"Bearer","refresh_token":"1//reconectado","expiry":"2026-10-22T09:00:00Z"}|' "$RCLONE_CONF"
rclone_close
check "Drive desconectado durante el run → no se recrea el token" [ ! -e "$TF" ]
secretos

# Dueños de lo que weg-backup escribe en /config (corre como root; la API es 1001)
rm -f "$CONFIG_DIR/backup-estado.json"; state_update '.'
eq "estado nuevo → 1001:1001" "$(stat -c %u:%g "$CONFIG_DIR/backup-estado.json")" "1001:1001"
chown 1234:1234 "$CONFIG_DIR/backup-estado.json"; state_update '.'
eq "estado existente conserva el dueño" "$(stat -c %u:%g "$CONFIG_DIR/backup-estado.json")" "1234:1234"
chown 0:0 "$CONFIG_DIR/backup-estado.json"

# rclone_error: salidas reales de rclone/ssh → mensaje legible
while IFS='|' read -r lbl host port want sample; do
  eq "rclone_error → $want" "$(rclone_error "$lbl" "$host" "$port" "$sample")" "$want"
done <<'X'
SFTP nas.local|nas.local|2222|La huella SSH de nas.local cambió; volvé a aceptarla en el portal|2026/10/22 03:00:01 Failed to create file system for "sftp:backups": NewFs: couldn't connect SSH: ssh: handshake failed: knownhosts: key mismatch
SFTP nas.local|nas.local|2222|Falta aceptar la huella SSH de nas.local|2026/10/22 03:00:01 Failed to create file system for "sftp:backups": NewFs: couldn't connect SSH: ssh: handshake failed: knownhosts: key is unknown
SFTP nas.local|nas.local|2222|Permiso denegado en SFTP nas.local|2026/10/22 03:00:01 Failed to create file system for "sftp:backups": NewFs: couldn't connect SSH: ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey], no supported methods remain
SFTP nas.local|nas.local|2222|Permiso denegado en SFTP nas.local|2026/10/22 03:00:02 ERROR : weg-config-x.tar.gz.enc: Failed to copy: Update Create failed: sftp: "Permission denied" (SSH_FX_PERMISSION_DENIED)
SFTP nas.local|nas.local|2222|No se pudo conectar a nas.local:2222|2026/10/22 03:00:01 Failed to create file system for "sftp:backups": NewFs: couldn't connect SSH: dial tcp 192.168.10.5:2222: connect: connection refused
SFTP nas.local|nas.local|2222|No se pudo conectar a nas.local:2222|2026/10/22 03:00:16 Failed to create file system for "sftp:backups": NewFs: couldn't connect SSH: dial tcp 192.168.10.5:2222: i/o timeout
SFTP nas.local|nas.local|2222|No se pudo conectar a nas.local:2222|2026/10/22 03:00:01 Failed to create file system for "sftp:backups": NewFs: couldn't connect SSH: dial tcp 192.168.10.5:2222: connect: no route to host
Google Drive|www.googleapis.com|443|No se pudo conectar a www.googleapis.com:443|2026/10/22 03:00:01 Failed to copyto: Post "https://www.googleapis.com/upload/drive/v3/files": dial tcp: lookup www.googleapis.com on 127.0.0.11:53: no such host
Google Drive|www.googleapis.com|443|El Google Drive está lleno|2026/10/22 03:00:05 ERROR : weg-historico-x.tar.gz.enc: Failed to copy: googleapi: Error 403: The user's Drive storage quota has been exceeded., storageQuotaExceeded
Google Drive|www.googleapis.com|443|Google revocó el acceso; volvé a conectar Google Drive|2026/10/22 03:00:01 Failed to copyto: couldn't fetch token: invalid_grant: maybe token is revoked or expired?: oauth2: "invalid_grant" "Token has been expired or revoked."
Google Drive|www.googleapis.com|443|Google revocó el acceso; volvé a conectar Google Drive|2026/10/22 03:00:01 ERROR : : error listing: couldn't list directory: token expired and there's no refresh token - manually refresh with "rclone config reconnect drive:"
Google Drive|www.googleapis.com|443|Permiso denegado en Google Drive|2026/10/22 03:00:03 ERROR : weg-config-x.tar.gz.enc: Failed to copy: googleapi: Error 403: The user does not have sufficient permissions for file 1AbCfolder., insufficientFilePermissions
X
eq "rclone_error genérico: última línea sin prefijos" \
  "$(rclone_error "Google Drive" www.googleapis.com 443 $'2026/10/22 03:00:05 ERROR : Attempt 1/3 failed with 1 errors and: googleapi: Error 404: File not found: 1AbCfolder., notFound\n2026/10/22 03:00:06 Failed to copyto: googleapi: Error 404: File not found: 1AbCfolder., notFound\n')" \
  "Error en Google Drive: Failed to copyto: googleapi: Error 404: File not found: 1AbCfolder., notFound"
eq "rclone_error genérico: máx 200 caracteres" "$(rclone_error X h 1 "$(printf 'x%.0s' $(seq 1 500))" | wc -c)" 213
eq "rclone_error sin salida" "$(rclone_error "SFTP h" h 22 "")" "Error en SFTP h: falló sin detalle"
eq "rclone_error genérico: sin query string ni upload_id" \
  "$(rclone_error "Google Drive" www.googleapis.com 443 '2026/10/22 03:10:00 Failed to copyto: Post "https://www.googleapis.com/upload/drive/v3/files?alt=json&uploadType=resumable&upload_id=ADPycdv-secreto": unexpected EOF')" \
  'Error en Google Drive: Failed to copyto: Post "https://www.googleapis.com/upload/drive/v3/files": unexpected EOF'

# send / prune_remote contra remotos locales (rclone alias en lugar de drive/sftp: sin red)
RR="$W/remotos"; mkdir -p "$RR/drive" "$RR/sftp"
export RCLONE_CONFIG_DRIVE_TYPE=alias RCLONE_CONFIG_DRIVE_REMOTE="$RR/drive"
export RCLONE_CONFIG_SFTP_TYPE=alias RCLONE_CONFIG_SFTP_REMOTE="$RR/sftp"
SD="$RR/sftp/backups"; mkdir -p "$SD"
echo hola > "$W/weg-config-x-1111aaaa-20261022-0300.tar.gz.enc"
rclone_open
check "send a remoto local" send sftp "$W/weg-config-x-1111aaaa-20261022-0300.tar.gz.enc" backups
check "send: archivo en el remoto" [ "$(cat "$SD/weg-config-x-1111aaaa-20261022-0300.tar.gz.enc")" = hola ]
check "send a la raíz (drive: carpeta = carpetaId)" send drive "$W/weg-config-x-1111aaaa-20261022-0300.tar.gz.enc" ""
check "send drive: archivo en la raíz" [ -f "$RR/drive/weg-config-x-1111aaaa-20261022-0300.tar.gz.enc" ]
for d in 01 02 03 04 05; do touch "$SD/weg-config-x-1111aaaa-202610${d}-0300.tar.gz.enc"; done
touch "$SD/weg-config-y-2222bbbb-20261030-0300.tar.gz.enc" "$SD/weg-historico-x-1111aaaa-20261001-0300.tar.gz.enc" "$SD/notas.txt"
check "prune_remote" prune_remote sftp backups config x-1111aaaa 3 >/dev/null
eq "prune_remote conserva N (más nuevos, de esta instalación)" "$(ls "$SD" | grep '^weg-config-x-' | sort | tr '\n' ' ')" \
  "weg-config-x-1111aaaa-20261004-0300.tar.gz.enc weg-config-x-1111aaaa-20261005-0300.tar.gz.enc weg-config-x-1111aaaa-20261022-0300.tar.gz.enc "
check "prune_remote no toca otra instalación, otra parte ni otros archivos" \
  [ -e "$SD/weg-config-y-2222bbbb-20261030-0300.tar.gz.enc" -a -e "$SD/weg-historico-x-1111aaaa-20261001-0300.tar.gz.enc" -a -e "$SD/notas.txt" ]
rclone_close
eq "_rpath" "$(_rpath sftp /srv/b f) $(_rpath sftp /srv/b/ f) $(_rpath drive '' f)" "sftp:/srv/b/f sftp:/srv/b/f drive:f"

# backup.sh config con Drive + SFTP
ssh-keygen -q -t ed25519 -N '' -C '' -f "$W/hostkey"
echo "[nas.local]:2222 $(cut -d' ' -f1,2 "$W/hostkey.pub")" > "$SSH_DIR/known_hosts"
INST="sin-licencia-1a2b3c4d"
cfg_dest() { jq -n --argjson dr "$1" --argjson sf "$2" '{modulo:true, config:{frecuencia:"diaria",hora:"03:00",copias:2},
  drive:{activo:$dr, carpetaId:"1AbCfolder", cuenta:"a@b.c"}, sftp:{activo:$sf, host:"nas.local", puerto:2222, usuario:"weg", carpeta:"backups"}}' > "$BJ"; }
cfg_dest true true; secretos
rm -rf "$BACKUP_DIR"/* "$RR/drive"/* "$SD"/*; rm -f "$CONFIG_DIR/backup-estado.json"
for d in 01 02 03; do touch "$RR/drive/weg-config-$INST-202601${d}-0300.tar.gz.enc"; done
out="$(bash "$HERE/backup.sh" config)"; rc=$?
eq "Drive+SFTP: sale 0" "$rc" 0
eq "Drive+SFTP: estado" "$(state_read | jq -c '.ultima.config | [.ok, .destinos]')" '[true,{"local":"ok","drive":"ok","sftp":"ok"}]'
f="$(state_read | jq -r .ultima.config.archivo)"
check "Drive: subido" cmp -s "$BACKUP_DIR/$f" "$RR/drive/$f"
check "SFTP: subido a la carpeta" cmp -s "$BACKUP_DIR/$f" "$SD/$f"
eq "Drive: poda remota por copias (2)" "$(ls "$RR/drive" | grep -c "^weg-config-$INST-")" 2
check "Drive: conserva el recién subido" [ -e "$RR/drive/$f" ]
eq "sin configs temporales de rclone" "$(ls -A "$RCLONE_TMP")" ""
nope "log sin secretos" grep -qE "fake-refresh|fake-access|GOCSPX|$FRASE" <<<"$out"

# un destino que falla no frena al otro ni a la copia local
touch "$W/no-es-dir"; rm -rf "$SD"/*
out="$(RCLONE_CONFIG_DRIVE_REMOTE="$W/no-es-dir/x" bash "$HERE/backup.sh" config)"; rc=$?
eq "Drive caído: sale 1" "$rc" 1
eq "Drive caído: local ok, sftp ok, run no ok" "$(state_read | jq -c '.ultima.config | [.ok, .destinos.local, .destinos.sftp]')" '[false,"ok","ok"]'
check "Drive caído: error legible en el estado" bash -c "[[ \"\$(jq -r .ultima.config.destinos.drive '$CONFIG_DIR/backup-estado.json')\" == 'error Error en Google Drive: '*'not a directory' ]]"
f="$(state_read | jq -r .ultima.config.archivo)"
check "Drive caído: igual subió a SFTP" [ -e "$SD/$f" ]
check "Drive caído: copia local" [ -e "$BACKUP_DIR/$f" ]
eq "Drive caído: sin configs temporales" "$(ls -A "$RCLONE_TMP")" ""

# docker stop durante la subida a SFTP: el Run registra archivo, bytes y lo ya enviado
mkdir -p "$W/slowbin"; REAL_RCLONE="$(command -v rclone)"
cat > "$W/slowbin/rclone" <<EOF
#!/bin/bash
if [[ " \$* " == *" copyto "* && " \$* " == *" sftp:"* ]]; then echo subiendo > "$W/subiendo"; sleep 30 & wait \$!; exit 1; fi
exec "$REAL_RCLONE" "\$@"
EOF
chmod +x "$W/slowbin/rclone"; rm -f "$W/subiendo"
PATH="$W/slowbin:$PATH" bash "$HERE/backup.sh" config >/dev/null & bpid=$!
for i in $(seq 1 100); do [ -e "$W/subiendo" ] && break; sleep 0.1; done
t0=$(date +%s%N); kill -TERM "$bpid"; wait "$bpid"; rc=$?; ms=$(( ($(date +%s%N) - t0) / 1000000 ))
eq "TERM en la subida → exit 143" "$rc" 143
check "TERM en la subida → corta enseguida (${ms} ms)" [ "$ms" -lt 3000 ]
eq "TERM en la subida → Run con archivo y destinos ya resueltos" \
  "$(state_read | jq -c '.ultima.config | [.ok, (.archivo != null), (.bytes > 0), .destinos, .error]')" \
  '[false,true,true,{"local":"ok","drive":"ok","sftp":"error interrumpido"},"interrumpido"]'
eq "TERM en la subida → sin configs temporales" "$(ls -A "$RCLONE_TMP")" ""
eq "TERM en la subida → enCurso limpio" "$(state_read | jq -c .enCurso)" "null"

# SFTP sin huella aceptada: no se conecta, error claro; Drive sigue
mv "$SSH_DIR/known_hosts" "$W/kh.bak"
bash "$HERE/backup.sh" config >/dev/null
eq "SFTP sin huella → error, Drive ok" "$(state_read | jq -c '.ultima.config.destinos | [.drive,.sftp]')" '["ok","error Falta aceptar la huella SSH de nas.local"]'
mv "$W/kh.bak" "$SSH_DIR/known_hosts"

# sin frase: destinos externos omitidos (nada sin cifrar sale de la planta)
rm -f "$SJ"; rm -rf "$RR/drive"/* "$SD"/*
bash "$HERE/backup.sh" config >/dev/null; rc=$?
eq "sin frase: sale 0" "$rc" 0
eq "sin frase: drive/sftp omitidos" "$(state_read | jq -c '.ultima.config | [.ok,.destinos]')" '[true,{"local":"ok","drive":"omitido","sftp":"omitido"}]'
eq "sin frase: nada subido" "$(ls -A "$RR/drive" "$SD" | grep -c weg-)" 0
# inactivos: no aparecen
secretos; cfg_dest false false
bash "$HERE/backup.sh" config >/dev/null
eq "destinos inactivos no aparecen" "$(state_read | jq -c .ultima.config.destinos)" '{"local":"ok"}'
# activo pero sin conectar
cfg_dest true false; rm -f "$TF"
bash "$HERE/backup.sh" config >/dev/null
eq "Drive activo sin conectar" "$(state_read | jq -r .ultima.config.destinos.drive)" "error Google Drive no está conectado"
secretos

# ── Prueba de destino ──
PR="$CONFIG_DIR/backup-prueba-resultado.json"
cfg_dest true true; rm -rf "$RR/drive"/* "$SD"/*; rm -f "$PR"
echo '{"destino":"drive","ts":1761100000000}' > "$CONFIG_DIR/backup-prueba.json"
bash "$HERE/backup.sh" prueba >/dev/null
eq "prueba drive ok" "$(jq -c . "$PR")" '{"destino":"drive","ts":1761100000000,"ok":true}'
check "prueba: pedido borrado" [ ! -e "$CONFIG_DIR/backup-prueba.json" ]
eq "prueba: el archivo de prueba se borra" "$(ls -A "$RR/drive")" ""
eq "prueba: resultado 644" "$(stat -c %a "$PR")" 644
eq "prueba: resultado nuevo → 1001:1001" "$(stat -c %u:%g "$PR")" "1001:1001"
echo '{"destino":"sftp","ts":1761100000001}' > "$CONFIG_DIR/backup-prueba.json"
bash "$HERE/backup.sh" prueba >/dev/null
eq "prueba sftp ok" "$(jq -c '[.ok,.ts]' "$PR")" '[true,1761100000001]'
echo '{"destino":"sftp","ts":2}' > "$CONFIG_DIR/backup-prueba.json"
RCLONE_CONFIG_SFTP_REMOTE="$W/no-es-dir/x" bash "$HERE/backup.sh" prueba >/dev/null
check "prueba sftp con error" bash -c "[[ \"\$(jq -c '[.ok,.error]' '$PR')\" == '[false,\"Error en SFTP nas.local: '* ]]"
# SFTP sin huella aceptada → ssh-keyscan (stub) y huella, sin conectar
mkdir -p "$W/bin"; ssh-keygen -q -t ecdsa -N '' -C '' -f "$W/hostkey2"
cat > "$W/bin/ssh-keyscan" <<EOF
#!/bin/bash
echo "\$*" > "$W/keyscan-args"
echo "# nas.local:2222 SSH-2.0-OpenSSH_9.6" >&2
echo "[nas.local]:2222 $(cut -d' ' -f1,2 "$W/hostkey2.pub")"
echo "[nas.local]:2222 $(cut -d' ' -f1,2 "$W/hostkey.pub")"
EOF
chmod +x "$W/bin/ssh-keyscan"
rm -f "$SSH_DIR/known_hosts"
echo '{"destino":"sftp","ts":3}' > "$CONFIG_DIR/backup-prueba.json"
PATH="$W/bin:$PATH" bash "$HERE/backup.sh" prueba >/dev/null
eq "huella: ok false + error" "$(jq -c '[.ok,.error]' "$PR")" '[false,"Falta aceptar la huella SSH de nas.local"]'
eq "huella SHA256 de la clave ed25519" "$(jq -r .huella "$PR")" "$(ssh-keygen -lf "$W/hostkey.pub" | awk '{print $2}')"
eq "knownHostsLine: todas las claves escaneadas" "$(jq -r .knownHostsLine "$PR" | wc -l)" 2
eq "ssh-keyscan con timeout y puerto" "$(cat "$W/keyscan-args")" "-T 10 -p 2222 nas.local"
eq "sin huella no sube nada" "$(ls -A "$SD")" ""
jq -r .knownHostsLine "$PR" > "$SSH_DIR/known_hosts"   # lo que hará la API al aceptar
echo '{"destino":"sftp","ts":4}' > "$CONFIG_DIR/backup-prueba.json"
bash "$HERE/backup.sh" prueba >/dev/null
eq "huella aceptada → prueba ok" "$(jq -c '[.ok,.ts]' "$PR")" '[true,4]'
printf '#!/bin/bash\nexit 0\n' > "$W/bin/ssh-keyscan"; rm -f "$SSH_DIR/known_hosts"
echo '{"destino":"sftp","ts":5}' > "$CONFIG_DIR/backup-prueba.json"
PATH="$W/bin:$PATH" bash "$HERE/backup.sh" prueba >/dev/null
eq "keyscan sin respuesta → no se pudo conectar" "$(jq -r .error "$PR")" "No se pudo conectar a nas.local:2222"
echo '{"destino":"ftp","ts":6}' > "$CONFIG_DIR/backup-prueba.json"
bash "$HERE/backup.sh" prueba >/dev/null
eq "destino desconocido" "$(jq -c . "$PR")" '{"destino":"ftp","ts":6,"ok":false,"error":"Destino desconocido"}'
rm -f "$TF"
echo '{"destino":"drive","ts":7}' > "$CONFIG_DIR/backup-prueba.json"
bash "$HERE/backup.sh" prueba >/dev/null
eq "prueba drive sin conectar" "$(jq -r .error "$PR")" "Google Drive no está conectado"
eq "prueba: sin configs temporales" "$(ls -A "$RCLONE_TMP")" ""
unset RCLONE_CONFIG_DRIVE_TYPE RCLONE_CONFIG_DRIVE_REMOTE RCLONE_CONFIG_SFTP_TYPE RCLONE_CONFIG_SFTP_REMOTE
rm -f "$SJ" "$TF" "$PR" "$BJ"

# ── restore-cli.sh (weg-scada restore) ──
R="$W/rst"; RC="$R/config"; RB="$R/backups"; mkdir -p "$RC" "$RB" "$R/lock"
rcli() { CONFIG_DIR="$RC" BACKUP_DIR="$RB" LOCK_DIR="$R/lock" RCLONE_TMP="$RCLONE_TMP" bash "$HERE/restore-cli.sh" "$@"; }
eq "bk_info config cifrado" "$(bash -c "source '$HERE/restore-cli.sh'; bk_info weg-config-agro-1a2b3c4d-20261022-0300.tar.gz.enc")" \
  "$(printf 'config\t20261022-0300\t2026-10-22 03:00')"
eq "bk_info legacy (histórico mensual)" "$(bash -c "source '$HERE/restore-cli.sh'; bk_info weg-backup-2025-01.tar.gz" | cut -f1,2)" "$(printf 'historico\t20250100-0000')"
nope "bk_info rechaza otros nombres" bash -c "source '$HERE/restore-cli.sh'; bk_info ../weg-config-a-1-20261022-0300.tar.gz"

# list: locales + remoto (sftp por alias), más nuevo primero por parte; remoto caído = aviso
for f in weg-config-a-1a2b3c4d-20261020-0300.tar.gz.enc weg-config-a-1a2b3c4d-20261022-0300.tar.gz.enc \
         weg-historico-a-1a2b3c4d-20261001-0300.tar.gz.enc weg-backup-2025-01.tar.gz notas.txt; do echo x > "$RB/$f"; done
mkdir -p "$RB/.tmp-restore-9-config"
RS="$W/rremote"; mkdir -p "$RS/sub" "$RC/backup-ssh"
echo x > "$RS/sub/weg-config-a-1a2b3c4d-20261023-0300.tar.gz.enc"; echo x > "$RS/sub/weg-config-a-1a2b3c4d-20261022-0300.tar.gz.enc"
echo x > "$RS/sub/otra-cosa.zip"
ssh-keygen -q -t ed25519 -N '' -f "$R/hk" >/dev/null && echo "nas.local $(cut -d' ' -f1,2 "$R/hk.pub")" > "$RC/backup-ssh/known_hosts"
echo '{"drive":{"activo":true},"sftp":{"activo":true,"host":"nas.local","usuario":"weg","carpeta":"sub"}}' > "$RC/backup.json"
out="$(RCLONE_CONFIG_SFTP_TYPE=alias RCLONE_CONFIG_SFTP_REMOTE="$RS" rcli list 2>"$R/err")"; rc=$?
eq "list: sale 0 con un destino sin conectar" "$rc" 0
check "list: aviso del destino caído" grep -q 'AVISO: drive: Google Drive no está conectado' "$R/err"
eq "list: orden y origen" "$(cut -f1,4,5 <<<"$out" | tr '\t' ' ')" "config sftp weg-config-a-1a2b3c4d-20261023-0300.tar.gz.enc
config local weg-config-a-1a2b3c4d-20261022-0300.tar.gz.enc
config local weg-config-a-1a2b3c4d-20261020-0300.tar.gz.enc
historico local weg-historico-a-1a2b3c4d-20261001-0300.tar.gz.enc
historico local weg-backup-2025-01.tar.gz"
check "fetch sftp" env RCLONE_CONFIG_SFTP_TYPE=alias RCLONE_CONFIG_SFTP_REMOTE="$RS" CONFIG_DIR="$RC" BACKUP_DIR="$RB" RCLONE_TMP="$RCLONE_TMP" \
  bash "$HERE/restore-cli.sh" fetch sftp weg-config-a-1a2b3c4d-20261023-0300.tar.gz.enc >/dev/null
check "fetch: archivo local" [ -f "$RB/weg-config-a-1a2b3c4d-20261023-0300.tar.gz.enc" ]
nope "fetch: nombre con ruta → rechazado" rcli fetch sftp ../../etc/passwd 2>/dev/null
rm -rf "$RC"/* "$RB"/*; rm -rf "$RB/.tmp-restore-9-config"
eq "list vacía sin backups ni destinos" "$(rcli list 2>&1)" ""

# verify de un backup de config cifrado (instalación nueva: sin backup-secretos.json)
SRC="$R/src"; mkdir -p "$SRC/backup-ssh"
echo '{"devices":[{"id":1},{"id":2}],"meters":[{"id":3}],"flowmeters":[]}' > "$SRC/config.json"
echo '{"users":[{"user":"super","role":"superadmin"},{"user":"ana","role":"admin","hash":"h"}],"usersV2":true}' > "$SRC/settings.json"
echo "1a2b3c4d-5e6f-4000-8000-000000000000" > "$SRC/install-id"
echo "$(b64u '{"v":1,"cliente":"Agro Plus S.A.","installId":"1a2b3c4d-5e6f-4000-8000-000000000000"}').$(b64u firma)" > "$SRC/license.key"
echo clave > "$SRC/backup-ssh/id_ed25519"; chmod 600 "$SRC/backup-ssh/id_ed25519"
tar czf "$R/plain.tgz" -C "$SRC" .
CB=weg-config-agro-plus-s-a-1a2b3c4d-20261022-0300.tar.gz.enc
jq -n --arg f "$FRASE" '{frase:$f}' > "$SJ"; encrypt "$R/plain.tgz" "$RB/$CB"; rm -f "$SJ"
T1=.tmp-restore-42-config
out="$(printf 'mala\n' | rcli verify "$CB" "$T1" 2>&1)"; rc=$?
eq "verify: frase incorrecta → 2" "$rc" 2
eq "verify: mensaje frase incorrecta" "$out" "Frase incorrecta o archivo dañado"
check "verify: frase incorrecta no deja temporales" [ ! -e "$RB/$T1" ]
out="$(printf '%s\n' "$FRASE" | rcli verify "$CB" "$T1" 2>&1)"; rc=$?
eq "verify: ok" "$rc" 0
check "verify: lista archivos" grep -qx '  backup-ssh/id_ed25519' <<<"$out"
check "verify: equipos" grep -qx 'Equipos: 2 variadores, 1 medidores, 0 caudalímetros' <<<"$out"
check "verify: usuarios" grep -qx 'Usuarios: 2 (super \[superadmin\], ana \[admin\])' <<<"$out"
check "verify: licencia" grep -qx 'Licencia: Agro Plus S.A. (install-id 1a2b3c4d)' <<<"$out"
eq "verify: temporal privado" "$(stat -c %a "$RB/$T1")" 700
nope "verify: config en un temporal de histórico → rechazado" rcli verify "$CB" .tmp-restore-42-historico </dev/null 2>/dev/null
nope "verify: temporal con ruta → rechazado" rcli verify "$CB" ../../tmp/x </dev/null 2>/dev/null
echo basura > "$RB/weg-config-a-1-20261022-0300.tar.gz"
out="$(rcli verify weg-config-a-1-20261022-0300.tar.gz .tmp-restore-43-config </dev/null 2>&1)"; rc=$?
eq "verify: sin cifrar dañado → 2" "$rc" 2

# legacy (sin cifrar, sin frase) y manifest de influx
mkdir -p "$R/lg"; echo datos > "$R/lg/20250101T000000Z.1.tar.gz"
tar czf "$RB/weg-backup-2025-01.tar.gz" -C "$R/lg" .
out="$(rcli verify weg-backup-2025-01.tar.gz .tmp-restore-44-historico </dev/null 2>&1)"; rc=$?
eq "verify legacy sin manifest → 2" "$rc" 2
check "verify legacy sin manifest: mensaje" grep -q 'no parece un backup de InfluxDB' <<<"$out"
echo '{"buckets":[{"bucketName":"weg_drives","organizationName":"tecnoelectric","retentionPolicies":[{"shardGroups":[{"startTime":"2025-01-06T00:00:00Z","endTime":"2025-01-13T00:00:00Z"},{"startTime":"2024-12-30T00:00:00Z","endTime":"2025-01-06T00:00:00Z"}]}]}]}' \
  > "$R/lg/20250101T000000Z.manifest"
tar czf "$RB/weg-backup-2025-01.tar.gz" -C "$R/lg" .
out="$(rcli verify weg-backup-2025-01.tar.gz .tmp-restore-44-historico </dev/null 2>&1)"; rc=$?
eq "verify legacy: ok sin frase" "$rc" 0
check "verify legacy: bucket" grep -qx 'Bucket: weg_drives (org tecnoelectric)' <<<"$out"
check "verify legacy: rango" grep -qx 'Datos: entre 2024-12-30 y 2025-01-13 (aprox., por semanas)' <<<"$out"

# apply-config: reemplaza todo /config, saca pedidos/pruebas, dueño 1001, borra el temporal
echo '{"devices":[]}' > "$RC/config.json"; echo otra > "$RC/install-id"; echo viejo > "$RC/sobra.json"
echo '{}' > "$RB/$T1/x/backup-pedido.json"; echo '{}' > "$RB/$T1/x/backup-prueba-resultado.json"
check "apply-config" rcli apply-config "$T1" >/dev/null
eq "apply-config: mismos archivos que el backup" "$(cd "$RC" && find . -type f | sort | tr '\n' ' ')" "$(cd "$SRC" && find . -type f | sort | tr '\n' ' ')"
eq "apply-config: install-id del backup" "$(cat "$RC/install-id")" "1a2b3c4d-5e6f-4000-8000-000000000000"
eq "apply-config: dueño 1001" "$(find "$RC" ! -user 1001 | wc -l)" 0
eq "apply-config: clave SSH 600" "$(stat -c %a "$RC/backup-ssh/id_ed25519")" 600
check "apply-config: borra el temporal" [ ! -e "$RB/$T1" ]
nope "apply-config sin verificar antes → error" rcli apply-config "$T1" 2>/dev/null
check "summary de la config restaurada" bash -c "CONFIG_DIR='$RC' INFLUXDB_TOKEN= bash '$HERE/restore-cli.sh' summary | grep -qx 'Licencia: Agro Plus S.A. (install-id 1a2b3c4d)'"
rcli cleanup 44
eq "cleanup borra los temporales de ese id" "$(ls -A "$RB" | grep -c '^\.tmp-restore-44')" 0

# config sin config.json válido: no se acepta (vaciaría config/); una réplica sin enlazar trae replica.json
mkdir -p "$R/nocfg"; echo id > "$R/nocfg/install-id"; tar czf "$RB/weg-config-a-1-20261022-0400.tar.gz" -C "$R/nocfg" .
out="$(rcli verify weg-config-a-1-20261022-0400.tar.gz .tmp-restore-45-config </dev/null 2>&1)"; rc=$?
eq "verify: config sin config.json → 2" "$rc" 2
eq "verify: config sin config.json, mensaje" "$out" "El backup de config no trae un config.json válido"
check "verify: config sin config.json no deja temporal" [ ! -e "$RB/.tmp-restore-45-config" ]
echo '{}' > "$R/nocfg/replica.json"; tar czf "$RB/weg-config-a-1-20261022-0400.tar.gz" -C "$R/nocfg" .
check "verify: réplica sin config.json → ok" rcli verify weg-config-a-1-20261022-0400.tar.gz .tmp-restore-45-config </dev/null >/dev/null
rcli cleanup 45

# check-name: explica cómo se llaman (p. ej. la copia "(1)" de Drive)
out="$(rcli check-name 'weg-config-a-1-20261022-0300.tar.gz (1).enc' 2>&1)"; rc=$?
eq "check-name rechaza '(1)'" "$rc" 1
check "check-name sugiere renombrar" grep -q 'renombralo al original' <<<"$out"
check "check-name acepta un nombre válido" rcli check-name weg-backup-2025-01.tar.gz

# espacio libre (freeGB simulado): piso + bytes redondeados a GB
ns() { bash -c "source '$HERE/restore-cli.sh'; freeGB() { echo 20; }; FLOOR=15; need_space /x $1 prueba" 2>&1; }
check "need_space alcanza (4 GB + 15 ≤ 20)" ns $((4 * 1073741824))
out="$(ns $((5 * 1073741824 + 1)))"; rc=$?
eq "need_space no alcanza (6 GB + 15 > 20) → 1" "$rc" 1
check "need_space: mensaje" grep -q 'hay 20 GB y hacen falta 21 GB' <<<"$out"
check "need_space sin poder medir no frena" bash -c "source '$HERE/restore-cli.sh'; freeGB() { :; }; need_space /x 999999999999 prueba"
out="$(DISK_FLOOR_GB=99999999 rcli verify weg-backup-2025-01.tar.gz .tmp-restore-46-historico </dev/null 2>&1)"; rc=$?
eq "verify histórico sin espacio → 1" "$rc" 1
check "verify histórico sin espacio: mensaje" grep -q 'espacio libre insuficiente' <<<"$out"
check "verify histórico sin espacio: nada creado" [ ! -e "$RB/.tmp-restore-46-historico" ]

# recuperación de un bucket temporal que quedó de un intento anterior
ra() { bash -c "source '$HERE/restore-cli.sh'; recover_action $1 $2"; }
eq "recover: sin actual + temporal → rename (nunca borrar)" "$(ra 0 1)" rename
eq "recover: actual + temporal → delete-tmp" "$(ra 1 1)" delete-tmp
eq "recover: sin temporal → none" "$(ra 1 0) $(ra 0 0)" "none none"

# wait-idle: con un backup en curso (lock tomado) espera y, vencido el plazo, falla
flock "$R/lock/weg-backup.lock" sleep 2 & lpid=$!; sleep 0.3
out="$(LOCK_WAIT=1 rcli wait-idle 2>&1)"; rc=$?
eq "wait-idle con backup en curso → 1" "$rc" 1
check "wait-idle: mensaje" grep -q 'hay un backup en curso' <<<"$out"
wait "$lpid" 2>/dev/null   # el lock lo tiene el sleep: esperar a que termine
check "wait-idle libre → 0" rcli wait-idle

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
# prueba de destino: con licencia, aunque no haya partes configuradas
echo '{"destino":"sftp","ts":1}' > "$CONFIG_DIR/backup-prueba.json"; rm -f "$W/calls"
cycle "$(at '2026-10-25 10:01:30')"; eq "prueba de destino → backup.sh prueba" "$(calls)" "prueba "
cp "$CONFIG_DIR/backup.json" "$W/bj.bak"; echo '{"modulo":true}' > "$CONFIG_DIR/backup.json"; rm -f "$W/calls"
cycle "$(at '2026-10-25 10:01:40')"; eq "prueba sin partes configuradas (antes del legacy)" "$(calls)" "prueba "
echo '{"modulo":false}' > "$CONFIG_DIR/backup.json"; rm -f "$W/calls"
cycle "$(at '2026-10-25 10:01:50')"; eq "prueba sin licencia → no se procesa" "$(calls)" ""
mv "$W/bj.bak" "$CONFIG_DIR/backup.json"; rm -f "$CONFIG_DIR/backup-prueba.json"
# enCurso viejo se limpia al arrancar
state_update '.enCurso = {parte:"config", desde:"x"}'
mkdir -p "$RCLONE_TMP/weg-rclone.abc123"; touch "$TF.weg-backup.9.tmp"
mkdir -p "$BACKUP_DIR/.tmp-historico-123" "$BACKUP_DIR/.tmp-2026-11"
touch "$BACKUP_DIR/.tmp-config-55.tar.gz" "$BACKUP_DIR/.tmp-weg-config-x-20261025-0300.tar.gz.enc" "$CONFIG_DIR/backup-estado.json.77.tmp"
touch "$BACKUP_DIR/weg-config-keep-11111111-20261025-0300.tar.gz.enc"
clear_stale; eq "clear_stale limpia enCurso" "$(state_read | jq -c .enCurso)" "null"
eq "clear_stale borra temporales de un backup cortado" "$(ls -A "$BACKUP_DIR" | grep -c '^\.tmp-')" 0
check "clear_stale borra estado .tmp" [ ! -e "$CONFIG_DIR/backup-estado.json.77.tmp" ]
check "clear_stale no toca backups" [ -e "$BACKUP_DIR/weg-config-keep-11111111-20261025-0300.tar.gz.enc" ]
check "clear_stale borra configs de rclone y token .tmp" [ ! -e "$RCLONE_TMP/weg-rclone.abc123" -a ! -e "$TF.weg-backup.9.tmp" ]

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

# Pruebas y pedidos del portal se atienden enseguida (cada WAIT_STEP), no al minuto
cat > "$W/fast-backup.sh" <<EOF
#!/bin/bash
echo "\$1" >> "$W/calls"; rm -f "$CONFIG_DIR/backup-prueba.json"
EOF
chmod +x "$W/fast-backup.sh"; rm -f "$W/calls" "$CONFIG_DIR/backup-pedido.json"
WAIT_STEP=0.2 BACKUP_SH="$W/fast-backup.sh" bash "$HERE/run.sh" >/dev/null & rpid=$!
sleep 0.5; echo '{"destino":"sftp","ts":2}' > "$CONFIG_DIR/backup-prueba.json"
for i in $(seq 1 20); do grep -q prueba "$W/calls" 2>/dev/null && break; sleep 0.1; done
check "prueba atendida dentro del paso de espera (no a los 60 s)" grep -q prueba "$W/calls"
echo '{"partes":["config"],"ts":3}' > "$CONFIG_DIR/backup-pedido.json"
for i in $(seq 1 20); do grep -q config "$W/calls" 2>/dev/null && break; sleep 0.1; done
check "pedido manual atendido dentro del paso de espera" grep -q config "$W/calls"
kill -TERM "$rpid"; wait "$rpid"

# Tope de tiempo de la prueba: rclone colgado → 124 → mensaje "tiempo agotado"
mkdir -p "$W/fakebin"; printf '#!/bin/sh\nsleep 10\n' > "$W/fakebin/rclone"; chmod +x "$W/fakebin/rclone"
RDIR="$(mktemp -d)"; SFTP_HOST=nas.local; SFTP_PORT=2222
t0=$(date +%s); PATH="$W/fakebin:$PATH" RC_MAX=1 rc lsf x:; rc=$?
eq "rc con RC_MAX corta a rclone colgado (124)" "$rc" 124
check "rc con RC_MAX corta en ~1 s" [ $(( $(date +%s) - t0 )) -lt 4 ]
eq "dest_error sftp tras timeout" "$(dest_error sftp)" "No se pudo conectar a nas.local:2222 (tiempo agotado)"
eq "dest_error drive tras timeout" "$(dest_error drive)" "Google Drive no respondió (tiempo agotado)"
RC_MAX=20 RC_DEADLINE=$(( $(date +%s) - 1 )) rc lsf x:; eq "rc pasado el tope total no corre rclone (124)" "$?" 124
eq "rclone_error 124 sftp" "$(rclone_error "SFTP h" h 22 "" 124)" "No se pudo conectar a h:22 (tiempo agotado)"
rm -rf "$RDIR"; RDIR=""; RC_RC=0

echo "# tests $T"
echo "# pass $P"
echo "# fail $F"
[ "$F" = 0 ]
