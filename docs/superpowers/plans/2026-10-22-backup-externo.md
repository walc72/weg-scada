# Módulo Backup externo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Backups cifrados de configuración e histórico con frecuencia elegible, enviados a Google Drive y/o SFTP, configurables desde el portal, con avisos y restauración guiada por consola.

**Architecture:** `weg-backup` (bash + rclone + openssl) pasa de cron mensual a un ciclo de 1 min que lee `config/backup.json`, ejecuta y escribe `config/backup-estado.json`; pedidos manuales y pruebas de destino llegan por archivos que escribe la API. La API (`routes/backup.js`) maneja la configuración, la frase, el flujo de dispositivo de Google, la clave SSH y los avisos. El portal agrega la pestaña Backups. `weg-scada restore` restaura desde un archivo.

**Tech Stack:** bash (Alpine), rclone, openssl, influx CLI; Node 20 (Express, crypto, https, `node:test`); React + TS.

**Spec:** `docs/superpowers/specs/2026-10-22-backup-externo-design.md`

## Global Constraints

- Archivos en `config/`: `backup.json` (sin secretos, incluye `"modulo": true|false`), `backup-secretos.json` (600; refresh token de Drive, frase), `backup-ssh/id_ed25519` (600), `backup-ssh/id_ed25519.pub`, `backup-ssh/known_hosts`, `backup-estado.json`, `backup-pedido.json`, `backup-prueba.json` / `backup-prueba-resultado.json`.
- Nombre: `weg-<config|historico>-<instalación>-AAAAMMDD-HHMM.tar.gz.enc` (`.tar.gz` sin frase, solo local).
- Cifrado: `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt`; frase ≥ 12 caracteres.
- Frecuencias: `diaria | semanal (domingo) | mensual (día 1) | desactivada`; hora `HH:MM` local; copias 1–365; defaults config diaria 03:00 30 copias, histórico semanal 03:30 12 copias.
- Sin `backup.json` o `modulo:false`: comportamiento actual (histórico mensual día 1 03:00 local, `BACKUP_KEEP`, `BACKUP_EXTERNAL`).
- Google: scopes `https://www.googleapis.com/auth/drive.file openid email`; `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` por env de weg-api (build args en release).
- Permisos API: lectura y escritura para admin y superadmin; operador 403; sin módulo `backup` 403 en escrituras; en modo réplica 403. Secretos nunca en respuestas.
- Mensajes exactos: `Los backups anteriores siguen necesitando la frase anterior`, `La huella SSH de <host> cambió; volvé a aceptarla en el portal`.
- Sin dependencias npm nuevas. Tests Node: `nodetest.sh <pkg> <files|test/>`; tests bash: `nodered/weg-backup/test/run.sh` en `alpine` con bash. Commits por heredoc con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- Instalación actual de planta (licencia con `backup` pero sin `backup.json`): `weg-backup` sigue haciendo el mensual local igual que hoy hasta que el admin configure algo (test Task 1).
- Cambio de mes, horario y TZ: un backup diario a las 03:00 corre una sola vez por día aunque el ciclo se reinicie a las 03:00:30 (test Task 1).
- Un destino caído no frena a los otros ni a la copia local (test Task 2).
- La frase nunca aparece en logs, `ps` ni respuestas (pasarla por variable de entorno/archivo a openssl, no por argumento) (test Task 1 y Task 3).
- Restaurar en una instalación limpia deja la licencia válida (install-id restaurado) (prueba Task 8).

---

### Task 1: `weg-backup` — ciclo, local y cifrado

**Files:**
- Create: `nodered/weg-backup/lib.sh` (funciones puras), `nodered/weg-backup/run.sh` (ciclo), `nodered/weg-backup/test/run.sh`
- Modify: `nodered/weg-backup/backup.sh` (pasa a usar `lib.sh`; genera una parte), `nodered/weg-backup/entrypoint.sh` (lanza `run.sh` en vez de `crond`), `nodered/weg-backup/Dockerfile` (openssl, rclone, openssh-client; sin crontab), `nodered/docker-compose.yml` (monta `./config:/config` en weg-backup), `.github/workflows/ci.yml` (paso que corre `nodered/weg-backup/test/run.sh` en un contenedor `alpine` con `bash`)

**Interfaces (lib.sh):**
- `due <frecuencia> <HH:MM> <ultimo_epoch|''> <ahora_epoch>` → exit 0 si toca (pasó la hora de hoy, es el día que corresponde y no corrió desde esa hora de hoy).
- `filename <parte> <instalacion> <epoch> <cifrado:0|1>` → nombre.
- `installation_id` (lee `/config/license.key` y `/config/install-id`; cliente slug + 8 del id; sin licencia `sin-licencia-<8>`).
- `encrypt <in> <out>` / `decrypt <in> <out>` con la frase desde `/config/backup-secretos.json` vía `-pass file:` o `env:`.
- `prune_local <dir> <parte> <copias>`.
- `state_set …` / helpers para escribir `backup-estado.json` (con `jq`; agregar `jq` a la imagen).

- [ ] **Step 1: Tests** (`test/run.sh`, asserts simples): `due` diaria antes/después de la hora, ya corrida hoy, semanal domingo vs lunes, mensual día 1 vs 2, cambio de mes; `filename` con y sin cifrado; `installation_id` con licencia y sin ella; `encrypt`/`decrypt` ida y vuelta y frase incorrecta falla; `prune_local` conserva N; la frase no aparece en la línea de comando (`ps`) durante `encrypt`.
- [ ] **Step 2:** `wsl … docker run --rm -v /mnt/c/dev/weg-scada:/repo alpine:3.20 sh -c "apk add -q bash openssl jq coreutils && bash /repo/nodered/weg-backup/test/run.sh"` → FAIL.
- [ ] **Step 3: Implementar.** `run.sh`: cada 60 s lee `/config/backup.json`; si no existe o `modulo != true`, modo actual (mensual día 1 03:00 con `backup.sh historico` y `BACKUP_EXTERNAL`); si no, por cada parte con `due`, ejecuta; procesa `backup-pedido.json` (lo borra al tomarlo). Un lock evita dos ejecuciones. `backup.sh <parte>`: genera (tar de `/config` excluyendo `backup-pedido.json`, `backup-estado.json` y temporales; o `influx backup`), cifra si hay frase, guarda en `/backups`, poda, registra en estado. El guardián de disco se mantiene.
- [ ] **Step 4:** tests → PASS.
- [ ] **Step 5: Commit** — `feat(backup): ciclo programable, backup de config y cifrado`.

---

### Task 2: `weg-backup` — destinos con rclone

**Files:**
- Modify: `nodered/weg-backup/lib.sh`, `nodered/weg-backup/backup.sh`, `nodered/weg-backup/run.sh`; Test: `nodered/weg-backup/test/run.sh`

**Interfaces:**
- `rclone_conf <out>` genera `rclone.conf` temporal (600) desde `backup.json` + secretos: remoto `drive` (`type=drive`, `client_id`/`client_secret`/`token` leídos de `backup-secretos.json` — la API los copia ahí al conectar Drive, ver Task 4 —, `scope=drive.file`, `root_folder_id`) y `sftp` (`type=sftp`, `host`, `port`, `user`, `key_file=/config/backup-ssh/id_ed25519`, `known_hosts_file=/config/backup-ssh/known_hosts`).
- `send <remoto> <archivo> <carpeta>` y `prune_remote <remoto> <carpeta> <parte> <copias>` (listar `weg-<parte>-*`, ordenar por nombre, borrar los viejos).
- Pruebas de destino: `backup-prueba.json` `{ destino, ts }` → sube y borra `weg-prueba-<ts>.txt`; para SFTP sin huella aceptada, corre `ssh-keyscan` y devuelve la huella SHA256; escribe `backup-prueba-resultado.json` `{ destino, ok, error?, huella?, ts }`.
- Errores legibles mapeados desde la salida de rclone: permiso denegado, no se pudo conectar a host:puerto, cuota llena, token revocado, huella cambiada (mensaje exacto de Global Constraints).

- [ ] **Step 1: Tests:** `rclone_conf` con cada destino y con ninguno; mapeo de mensajes de error a partir de salidas de ejemplo de rclone; `prune_remote` con un remoto `local` de rclone (directorio temporal) conservando N; `send` a un remoto `local` OK; un destino que falla no impide el siguiente ni la copia local (estado registra `ok` local y `error` en el destino).
- [ ] **Step 2:** FAIL (en el contenedor de test agregar `rclone`). **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(backup): envio a Google Drive y SFTP con rclone`.

---

### Task 3: API — configuración, frase, pedidos, estado

**Files:**
- Create: `nodered/weg-api/src/routes/backup.js`, `nodered/weg-api/src/services/backupStore.js`
- Modify: `nodered/weg-api/src/server.js` (montar `/api/backup`; escribir `modulo` en `backup.json` al arrancar y en cada recarga de licencia — engancharse al `watch` de `createLicenseState`)
- Test: `nodered/weg-api/test/backupRoute.test.js`

**Interfaces:**
- `GET /api/backup` → `{ modulo, config:{…}, historico:{…}, drive:{activo,cuenta,disponible}, sftp:{activo,host,puerto,usuario,carpeta,huella,clavePublica}, fraseConfigurada, estado }` (estado = `backup-estado.json`).
- `PUT /api/backup` → valida programación (frecuencia, hora, copias) y SFTP (host, puerto, usuario, carpeta absoluta); no acepta secretos.
- `PUT /api/backup/frase` `{ frase }` (≥ 12) → guarda en secretos; respuesta `{ ok, aviso? }` con el aviso exacto si ya había frase.
- `POST /api/backup/ahora` `{ partes }` → escribe `backup-pedido.json`.
- `POST /api/backup/:destino/probar` → escribe `backup-prueba.json`, espera el resultado hasta 60 s, lo devuelve. `POST /api/backup/sftp/huella` `{ huella }` → agrega a `known_hosts` (la línea completa la entrega `weg-backup` en el resultado de la prueba).
- Permisos según Global Constraints.

- [ ] **Step 1: Tests:** GET sin secretos (nunca aparece la frase ni tokens aunque estén en `backup-secretos.json`); PUT valida; frase corta 400; frase con aviso; operador 403; sin módulo 403 en escrituras; réplica 403; `ahora` escribe el pedido; `modulo` se refleja al cambiar la licencia (con el watcher de la licencia de prueba).
- [ ] **Step 2:** FAIL. **Step 3:** implementar (archivos con tmp+rename; secretos con modo 600). **Step 4:** suite weg-api → PASS.
- [ ] **Step 5: Commit** — `feat(api): configuracion y estado de backups`.

---

### Task 4: API — Google Drive y clave SSH

**Files:**
- Create: `nodered/weg-api/src/services/googleDevice.js`, `nodered/weg-api/src/services/sshKey.js`
- Modify: `nodered/weg-api/src/routes/backup.js`, `nodered/weg-api/Dockerfile` (ARG/ENV `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`), `.github/workflows/release.yml` (build-args desde `secrets.GOOGLE_CLIENT_ID`/`secrets.GOOGLE_CLIENT_SECRET` solo para la imagen `api`). Decisión: las credenciales viven solo en la imagen de la API; al conectar Drive la API copia `client_id`, `client_secret` y el token a `backup-secretos.json`, de donde los lee `weg-backup`.
- Test: `nodered/weg-api/test/googleDevice.test.js`, `test/sshKey.test.js`

**Interfaces:**
- `googleDevice.start({ clientId, scopes, endpoint }) -> { deviceCode, userCode, verificationUrl, interval, expiresIn }`; `poll(...) -> { status: 'pendiente'|'conectado'|'vencido'|'rechazado', tokens? }`; `userEmail(accessToken)`; `createFolder(accessToken, name, parentId?) -> id`; `revoke(token)`. Endpoints configurables para tests (servidor falso).
- Rutas: `POST /api/backup/drive/conectar` → `{ userCode, verificationUrl }` y sondeo en segundo plano; `GET /api/backup/drive/conectar` → estado; `POST /api/backup/drive/desconectar`.
- `sshKey.ensure(dir) -> { publicKey }` (ed25519 con `crypto.generateKeyPairSync`, privada PKCS#8 PEM 600, pública `ssh-ed25519 <base64> weg-scada-<instalación>`).

- [ ] **Step 1: Tests:** flujo completo contra un servidor HTTP falso (pendiente → slow_down → conectado; access_denied → rechazado; expired_token → vencido); crea carpeta `WEG SCADA backups/<instalación>`; desconectar revoca y borra; sin `GOOGLE_CLIENT_ID` → `disponible:false`; clave pública OpenSSH válida (parsea con `crypto.createPublicKey({ key, format: 'jwk' })` tras decodificar, o verificar el blob: tipo `ssh-ed25519` + 32 bytes); `ensure` no regenera si existe.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS.
- [ ] **Step 5: Commit** — `feat(api): Google Drive por codigo de dispositivo y clave SSH`.

---

### Task 5: Avisos por mail

**Files:**
- Modify: `nodered/weg-api/src/services/alerts.js` (o nuevo `services/backupAlerts.js` que use el transporte existente); `server.js` (vigilar `backup-estado.json`)
- Test: `nodered/weg-api/test/backupAlerts.test.js`

**Interfaces:**
- `evaluateBackup(estado, cfg, now, sent) -> { mails: [{ asunto, cuerpo }], sent }` (puro): error en algún destino → `Backup de <parte> con errores en <instalación>`; sin éxito en 2× período → `Sin backup de <parte> desde <fecha>`; un mail por problema (clave por parte+destino+tipo) hasta que se resuelva.

- [ ] **Step 1: Tests** de `evaluateBackup` (error, sin backup, repetido no reenvía, resuelto y vuelve a fallar sí reenvía, sin módulo nada). **Step 2:** FAIL. **Step 3:** implementar y cablear. **Step 4:** PASS. **Step 5: Commit** — `feat(api): avisos por mail de backups`.

---

### Task 6: Portal — pestaña Backups

**Files:**
- Create: `frontend-react/src/views/BackupsTab.tsx` (y subcomponentes si crece)
- Modify: `frontend-react/src/views/Config.tsx` (pestaña visible para admin/superadmin, con módulo `backup`, fuera de réplica), `frontend-react/src/types.ts`, `frontend-react/src/App.tsx` (aviso fijo si la última ejecución tuvo error), mock

- [ ] **Step 1:** Estado, Hacer backup ahora (con avance consultando `GET /api/backup` cada 3 s mientras `enCurso`), Programación, Cifrado (dos campos, aviso exacto al cambiar), Drive (Conectar → código grande + `google.com/device` + espera; cuenta; Desconectar; Probar; deshabilitado si `disponible:false` con explicación), SFTP (campos, clave pública con Copiar, Probar, aceptar huella), Historial.
- [ ] **Step 2:** Build (`frontbuild.sh "Hacer backup ahora"`, buscar en todos los assets) → `✓ built`.
- [ ] **Step 3: Commit** — `feat(ui): pestaña Backups`.

---

### Task 7: `weg-scada restore`

**Files:**
- Modify: `packaging/weg-scada` (subcomando `restore [archivo]`, ayuda en el encabezado), `nodered/weg-backup/lib.sh` si se reusa `decrypt` (el subcomando corre dentro del contenedor `weg-backup` con `docker compose run`/`exec`)
- Test: `nodered/weg-backup/test/run.sh` (restauración de config en un directorio temporal)

- [ ] **Step 1:** Implementar según spec §8: listar locales (`/backups`) y remotos (`rclone lsf`) si hay destinos; con archivo, usarlo (copiarlo a `/backups` del contenedor); pedir frase sin eco; descifrar a temporal y `tar -t`; mostrar resumen y pedir `RESTAURAR`; `~/pre-restore-<fecha>.tgz`; `docker compose stop` de todo menos influxdb y weg-backup; config: reemplazar `config/` y `chown -R 1001`; histórico: `influx bucket delete` del bucket actual y `influx restore --bucket <bucket>` desde el backup descifrado (no `--full`, que pisaría tokens y usuarios de la instalación nueva); `docker compose up -d`; resumen.
- [ ] **Step 2:** Tests de las partes puras (descifrar + verificar tar, reemplazo de config en temporal). **Step 3:** Commit — `feat(cli): weg-scada restore`.

---

### Task 8: Integración, Google Cloud y release (con el usuario)

- [ ] **Step 1 (usuario, guiado):** crear proyecto en Google Cloud, habilitar Drive API, pantalla de consentimiento externa en Producción con scope `drive.file`, cliente OAuth "TVs and Limited Input devices"; cargar `GOOGLE_CLIENT_ID` y `GOOGLE_CLIENT_SECRET` como secrets del repo.
- [ ] **Step 2:** imagen `edge` y docker-in-docker: instalación limpia A + contenedor SFTP de prueba (Alpine + openssh, usuario con la clave pública que muestra el portal); licencia de prueba con `backup` (firmada por el usuario); configurar SFTP, aceptar huella, frase; `Hacer backup ahora` → archivos `.enc` en el SFTP; repetir hasta superar `copias` → poda remota. Instalación limpia B: copiar el `.enc` de config e histórico y `sudo weg-scada restore <archivo>` → mismos equipos, usuarios, licencia válida (install-id de A) e histórico.
- [ ] **Step 3 (usuario):** conectar su Google Drive real en la instalación de prueba y ver los archivos en `WEG SCADA backups/<instalación>`.
- [ ] **Step 4:** PR (checks en verde **justo antes** del merge), tag `v1.5.0` (usuario), update planta y oficina con backup de config previo.
