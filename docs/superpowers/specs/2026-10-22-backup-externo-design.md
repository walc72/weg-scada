# Módulo Backup externo — Diseño

Fecha: 2026-10-22 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-10-22-licencias-design.md` (módulo `backup`), servicio `nodered/weg-backup`.

## 1. Problema y objetivo

Hoy `weg-backup` hace un backup **mensual** de InfluxDB que queda **en la misma VM** (12 copias),
con un segundo destino opcional (`BACKUP_EXTERNAL`) configurable solo a mano en `.env`. La carpeta
`config/` (equipos, usuarios, licencia, install-id, marca, réplicas) **no se respalda**. Si se
pierde la VM de planta se pierde la configuración y hasta un mes de histórico propio.

Objetivo: backups de configuración e histórico, **cifrados**, con frecuencia elegible, enviados a
**Google Drive** y/o a **otro equipo por SFTP**, configurables desde el portal sin comandos, con
avisos si fallan y una **restauración guiada por consola** que sirve en una VM nueva.

### Decisiones tomadas

- Enfoque: autorización desde el portal (código de dispositivo de Google; clave SSH generada por la
  VM) y transporte con **rclone** dentro de `weg-backup`.
- Destinos: Google Drive y SFTP (como máximo uno de cada uno), activables por separado.
- Frecuencia elegible por parte en el portal; configuran **admin y superadmin**.
- Cifrado AES-256 con **frase del backup** cargada en el portal.
- Restauración solo por consola: `sudo weg-scada restore`.
- Corre **solo en planta** (no en la réplica).
- Módulo de licencia `backup`; sin el módulo, el comportamiento es el de hoy.

### Criterios de éxito

- Con Drive y/o SFTP configurados, los backups programados llegan cifrados al destino y las copias
  viejas se borran según la retención.
- Un fallo en cualquier destino genera un mail y un aviso en el portal.
- `sudo weg-scada restore <archivo>` en una instalación limpia deja los mismos equipos, usuarios,
  licencia válida e histórico.
- Sin el módulo `backup`, `weg-backup` hace exactamente lo de hoy.
- Ningún secreto (token de Google, clave SSH, frase) se devuelve por la API.

### Fuera de alcance

- Restaurar desde el portal.
- Otros destinos (S3, Dropbox, OneDrive…), aunque rclone los soporte.
- Backups incrementales; cada backup es completo.
- Backups de la réplica de oficina.
- Respaldar Grafana o la configuración del sistema operativo.

## 2. Qué se respalda

- **Configuración**: `tar.gz` de `/opt/weg-scada/config` completo (incluye `config.json`,
  `settings.json`, `license.key`, `install-id`, `branding.json`, `replicas.json`, `manual.json`,
  `backup.json` y `backup-secretos.json`). No incluye `.env` (se regenera al instalar).
- **Histórico**: `influx backup` del bucket (como hoy), en `tar.gz`.
- **Nombre**: `weg-<parte>-<instalación>-AAAAMMDD-HHMM.tar.gz.enc`, con `<parte>` ∈ {`config`,
  `historico`} e `<instalación>` = cliente de la licencia (minúsculas, solo `[a-z0-9-]`) + `-` +
  primeros 8 del install-id; sin licencia válida: `sin-licencia-<8>`.
- **Cifrado**: `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt` con la frase del backup. Sin
  frase cargada, los destinos externos no se activan; la copia local se guarda sin cifrar (como
  hoy) para no perder backups.

## 3. Programación y retención

`config/backup.json` (lo escribe la API; lo lee `weg-backup`):

```json
{
  "config":    { "frecuencia": "diaria",  "hora": "03:00", "copias": 30 },
  "historico": { "frecuencia": "semanal", "hora": "03:30", "copias": 12 },
  "drive": { "activo": true, "carpetaId": "…", "cuenta": "backups@…" },
  "sftp":  { "activo": true, "host": "192.168.3.50", "puerto": 22, "usuario": "weg",
             "carpeta": "/backups/agriplus", "huella": "SHA256:…" }
}
```

- `frecuencia` ∈ {`diaria`, `semanal` (domingo), `mensual` (día 1), `desactivada`}; `hora` local
  `HH:MM` (TZ del contenedor). Por defecto: config diaria 03:00, histórico semanal 03:30.
- `copias`: cuántas conservar **en la VM y en cada destino** (1–365). Por defecto 30 y 12.
- Sin `backup.json` o sin el módulo: modo actual (histórico mensual local, `BACKUP_KEEP`).
- El guardián de disco actual (`DISK_FLOOR_GB`) se mantiene para ambas partes.

## 4. Destinos

### 4.1 Google Drive

- **Preparación única del integrador**: proyecto de Google Cloud con Drive API, cliente OAuth tipo
  "TVs and Limited Input devices", pantalla de consentimiento en **Producción**. `GOOGLE_CLIENT_ID`
  y `GOOGLE_CLIENT_SECRET` como secrets del repo; el workflow de release los inyecta en la imagen
  de `weg-api` (build args → variables). Sin ellos, el botón de Drive se muestra deshabilitado con
  la explicación.
- **Conectar** (portal): `POST /api/backup/drive/conectar` inicia el flujo de dispositivo (scopes
  `https://www.googleapis.com/auth/drive.file openid email`), devuelve `user_code` y
  `verification_url`; la API consulta el token en segundo plano según `interval`. Al aprobar:
  guarda el refresh token, lee el email de la cuenta, crea la carpeta
  `WEG SCADA backups/<instalación>` (Drive API) y guarda `carpetaId` y `cuenta`.
  `GET /api/backup/drive/conectar` informa `pendiente | conectado | vencido | rechazado`.
- **Desconectar**: revoca el token en Google y lo borra.
- **Envío**: rclone backend `drive` con `client_id`, `client_secret`, `token` (JSON) y
  `root_folder_id = carpetaId`, `scope = drive.file`.

### 4.2 SFTP

- Campos: host, puerto (22), usuario, carpeta remota.
- **Clave**: la API genera un par ed25519 propio de la instalación la primera vez
  (`config/backup-ssh/id_ed25519`, permisos 600) y expone la pública en formato OpenSSH para copiar.
- **Huella**: `POST /api/backup/sftp/probar` conecta, devuelve la huella del host; el portal pide
  aceptarla y se guarda en `known_hosts` de `config/backup-ssh/`. Si cambia, el envío falla con
  `La huella SSH de <host> cambió; volvé a aceptarla en el portal`.
- **Envío**: rclone backend `sftp` con `key_file`, `known_hosts_file`, `host`, `port`, `user`.

### 4.3 Comunes

- `POST /api/backup/<destino>/probar`: sube `weg-prueba-<ts>.txt`, lo borra, devuelve OK o el error
  legible (permiso denegado, no se pudo conectar a host:puerto, cuota llena, token revocado).
- Secretos en `config/backup-secretos.json` (600): refresh token de Drive, frase del backup. Nunca
  se devuelven por la API (`GET` devuelve `{ fraseConfigurada: true }`, `drive.cuenta`, etc.).

## 5. Ejecución (`weg-backup`)

- Imagen: suma `rclone` y `openssl` (paquetes de Alpine). Monta `./config` (lectura/escritura) y
  sigue montando `/backups`.
- La API escribe en `backup.json` el campo `"modulo": true|false` (licencia con `backup`) al
  arrancar y cada vez que recarga la licencia; `weg-backup` (bash) no verifica licencias por su
  cuenta. Una licencia sin el módulo deja `"modulo": false` → modo actual.
- Reemplaza `cron` por un ciclo (`run.sh`) que cada minuto: lee `backup.json`, decide qué parte
  toca, procesa pedidos manuales
  (`config/backup-pedido.json`, que escribe la API: `{ partes: ["config"|"historico"], ts }`) y
  ejecuta.
- Una ejecución: generar → cifrar → guardar local → podar local → por destino activo: subir →
  podar remoto (`copias`) → registrar.
- Un solo backup a la vez; si toca otro durante una ejecución, se saltea y se registra.
- Estado en `config/backup-estado.json`: última ejecución por parte (fecha, tamaño, duración,
  resultado por destino `ok | error <mensaje> | omitido`), próxima programada, historial de las
  últimas 30 ejecuciones, `enCurso`.

## 6. Portal (Configuración → Backups)

Visible para admin y superadmin con el módulo `backup` y solo fuera del modo réplica.

- **Estado**: último backup por parte con resultado por destino; próximo programado; botones
  `Hacer backup ahora` (Configuración / Histórico / Todo) con avance.
- **Programación**: frecuencia, hora y copias por parte.
- **Cifrado**: campo para cargar o cambiar la frase (mínimo 12 caracteres, se pide dos veces);
  muestra `Configurada`; al cambiar avisa `Los backups anteriores siguen necesitando la frase
  anterior`.
- **Destinos**: Drive (Conectar/Desconectar, cuenta conectada, Probar) y SFTP (campos, clave
  pública con Copiar, Probar, aceptar huella), cada uno con su interruptor.
- **Historial**: últimas 30 ejecuciones.
- **Aviso** fijo para el admin si la última ejecución tuvo algún error.

## 7. Avisos por mail

Con el SMTP y los destinatarios de alertas existentes (`services/alerts.js`):
- Una ejecución con algún destino en error → mail `Backup de <parte> con errores en <instalación>`
  con el detalle.
- Sin un backup exitoso de una parte en el doble de su período → mail `Sin backup de <parte>
  desde <fecha>`.
- Un mail por problema hasta que se resuelva (no uno por minuto).

## 8. Restauración (`sudo weg-scada restore`)

Subcomando nuevo de `packaging/weg-scada`:

1. Sin argumento: lista backups locales (`/backups`) y remotos (si hay destinos configurados), por
   parte y fecha; con argumento: usa el archivo indicado.
2. Pide la frase, descifra a un temporal y verifica el `tar` antes de tocar nada.
3. Muestra qué reemplaza y pide escribir `RESTAURAR`.
4. Guarda la config actual en `~/pre-restore-<fecha>.tgz`, detiene los servicios.
5. Config: reemplaza `config/` (incluye install-id y license.key → la licencia vuelve a valer).
   Histórico: `influx restore` del bucket (reemplazando el existente).
6. Levanta los servicios y muestra un resumen (equipos, usuarios, licencia, rango del histórico).

## 9. Licencia

- Módulo `backup`. No cuenta equipos ni limita destinos.
- Sin el módulo: pestaña oculta, API de backup responde 403 en escrituras, `weg-backup` en modo
  actual.

## 10. Casos borde

- Disco bajo: se omite el backup y se avisa.
- Token de Drive revocado o cuota llena: falla ese destino, aviso, los demás siguen.
- Huella SSH cambiada: se frena ese destino, aviso.
- Histórico grande: rclone sube por partes y reintenta; un corte reintenta el archivo en la próxima.
- Sin frase: destinos externos inactivos; la pestaña lo indica.
- Frase cambiada: los backups nuevos usan la nueva; restaurar uno viejo pide la vieja.

## 11. Pruebas

- **Automáticas**: cálculo de "toca ahora" (diaria/semanal/mensual, hora, cambio de mes, TZ);
  nombres; retención local y remota; cifrado/descifrado de ida y vuelta y frase incorrecta;
  permisos de la API (operador 403, sin módulo 403, secretos nunca en respuestas); flujo de
  dispositivo de Google contra un servidor falso; formato OpenSSH de la clave pública; mails de
  aviso (uno por problema).
- **Integración (docker-in-docker)**: instalación limpia + contenedor SFTP de prueba (Alpine con
  openssh) → backup de config e histórico al SFTP, poda remota → `weg-scada restore` desde el
  archivo en una segunda instalación limpia: mismos equipos, usuarios, licencia válida e histórico.
- **Manual (usuario)**: conectar su Google Drive real con el código y ver los archivos.

## 12. Release

v1.5.0. Planta y después oficina con `sudo weg-scada update` (en oficina no cambia nada visible).
