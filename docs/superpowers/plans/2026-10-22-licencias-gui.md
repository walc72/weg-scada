# Herramienta gráfica de licencias — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página local `scripts/licencias.html` que firma y modifica licencias con la clave del integrador, guarda cada licencia en `emitidas.csv` y como `.txt`, y es compatible byte a byte con `scripts/license.js`.

**Architecture:** Un solo HTML sin dependencias. La lógica sin DOM vive en `<script id="core">` y expone `window.LicCore`; las pruebas de Node extraen ese bloque y lo corren en `vm` con `crypto.webcrypto`. La interfaz usa File System Access (`showDirectoryPicker`) sobre `C:\licencias-weg`. La herramienta de comandos pasa a escribir el mismo CSV.

**Tech Stack:** HTML/CSS/JS sin librerías, WebCrypto (PBKDF2, AES-CBC, Ed25519), File System Access API, IndexedDB; Node 20 `node:test` + `vm` para pruebas.

**Spec:** `docs/superpowers/specs/2026-10-22-licencias-gui-design.md`

## Global Constraints

- Sin dependencias ni recursos externos en el HTML (ni CDN, ni fuentes remotas). Funciona abierto como `file://` en Edge/Chrome.
- Payload en este orden exacto: `{ v: 1, installId, cliente, emitida, modulos, limites: { A, B, C } }`. Texto: `base64url(JSON) + "." + base64url(firma Ed25519 de los bytes UTF-8 del JSON)`, sin padding `=`.
- Módulos válidos: `medidores`, `caudales`, `unifilar`, `generadores`, `comunicaciones`, `replica`, `backup`.
- ID: UUID `8-4-4-4-12` hex, insensible a mayúsculas, se guarda en minúsculas.
- `emitida`: fecha local `YYYY-MM-DD` (en la página y en `scripts/license.js`).
- CSV: cabecera `fecha,cliente,installId,modulos,A,B,C,licencia`; módulos unidos con `|`; RFC 4180.
- La clave pública del HTML es idéntica a `PUBLIC_KEY` de `nodered/weg-api/src/services/license.js` (test).
- `nodered/weg-api/src/services/license.js` y la copia del poller NO se modifican.
- Mensajes exactos: `Frase de paso incorrecta`, `Formato de clave no soportado`, `No encuentro private.pem en esta carpeta`, `La firma no coincide con la clave pública del SCADA`, `Todavía no hay licencias emitidas`.
- UI en español con voseo; la frase de paso nunca se guarda (ni IndexedDB ni localStorage); la CryptoKey se importa como no extraíble.
- Tests: `MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash <scratchpad>/nodetest.sh nodered/weg-api <archivos|test/>`. Commits por bash heredoc con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- `emitidas.csv` actual tiene la cabecera vieja y 2 filas "Prueba" sin texto → la migración agrega la columna sin perder filas (test en Task 1 y Task 2).
- Cliente con coma, comillas o acentos (`"Agro, S.A."`, `Agrocaraya Ñandú`) → CSV y nombre de archivo correctos; el JSON firmado conserva los acentos (UTF-8) y `verify` lo acepta (test en Task 2).
- Clave con parámetros PBES2 distintos (PRF SHA-1, AES-128) → se abre si es soportado o da `Formato de clave no soportado`, nunca una excepción cruda (test en Task 2).
- Firmar dos veces el mismo día para el mismo cliente → segundo `.txt` con `-2` y la lista muestra la última (la de mayor posición en el CSV, no solo por fecha) (test en Task 2).
- Frase vacía o PEM que no es `ENCRYPTED PRIVATE KEY` (clave sin cifrar) → mensaje claro (test en Task 2).

---

### Task 1: `scripts/license.js` — fecha local y columna `licencia`

**Files:**
- Modify: `scripts/license.js` (`appendIssued` l.43-47, fecha en l.126)
- Test: `nodered/weg-api/test/licenseTool.test.js`

**Interfaces:**
- Produces: `localDate(d = new Date()) -> 'YYYY-MM-DD'` exportado; `appendIssued(dir, { fecha, cliente, installId, modulos, A, B, C, licencia })` escribe la columna `licencia` y migra una cabecera vieja.

- [ ] **Step 1: Tests**
  - `localDate(new Date(2026, 9, 22, 23, 30))` → `'2026-10-22'`.
  - `appendIssued` en carpeta vacía → archivo `fecha,cliente,installId,modulos,A,B,C,licencia\n2026-10-22,Agriplus,<id>,medidores|caudales,0,20,1,<texto>\n`.
  - Con un `emitidas.csv` de cabecera vieja y 2 filas → la cabecera pasa a la nueva, las 2 filas quedan iguales (sin columna extra o con `,` final vacío: elegir una y que la Task 2 la lea igual; usar **sin** columna extra, el lector trata la falta como vacío), y la nueva fila tiene el texto.
  - Ajustar el test existente de `appendIssued` a la cabecera nueva.
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/licenseTool.test.js` → FAIL.
- [ ] **Step 3:** Implementar; el CLI `sign` pasa `fecha: localDate()` y `licencia: text`.
- [ ] **Step 4:** test → PASS; suite completa → PASS.
- [ ] **Step 5: Commit** — `feat(scripts): fecha local y texto de la licencia en emitidas.csv`.

---

### Task 2: Núcleo de la página (`<script id="core">`)

**Files:**
- Create: `scripts/licencias.html` (en esta tarea: estructura HTML mínima + el bloque `core`; la interfaz es la Task 3)
- Test: `nodered/weg-api/test/licenciasHtml.test.js`

**Interfaces:**
- Produces `window.LicCore` (todas async donde usan WebCrypto):
  - `MODULES: string[]`, `MODULE_LABELS: Record<string,string>` (`medidores: 'Medidores de energía'`, `caudales: 'Caudales'`, `unifilar: 'Unifilar'`, `generadores: 'Generadores'`, `comunicaciones: 'Comunicaciones'`, `replica: 'Réplica de oficina'`, `backup: 'Backup en la nube'`)
  - `PUBLIC_KEY: string` (PEM, igual a license.js)
  - `localDate(d?) -> string`
  - `openPrivateKey(pem: string, passphrase: string) -> Promise<CryptoKey>` — errores `Frase de paso incorrecta`, `Formato de clave no soportado`
  - `validate(fields) -> string[]` (fields `{ cliente, installId, modulos, A, B, C }`; mismos mensajes que `signLicense` de scripts/license.js: `ID de instalación inválido: <id>`, `El cliente es obligatorio`, `Módulo desconocido: <m>`, `Límite inválido: <t>`)
  - `signLicense(key: CryptoKey, fields, today) -> Promise<string>` (normaliza id a minúsculas, mantiene el orden de módulos de `MODULES`)
  - `verifyText(text, publicPem = PUBLIC_KEY, installId = null) -> Promise<{ ok, motivo, payload }>` (motivos `formato`, `firma`, `otra-instalacion`)
  - `parseCsv(text) -> { rows: object[], legacy: boolean }`, `serializeCsv(rows) -> string` (siempre cabecera nueva, `\n` al final)
  - `latestByInstall(rows) -> object[]` (una por `(cliente, installId)`, la última en orden de archivo; orden de salida: cliente A-Z)
  - `fileName(cliente, installId, fecha, existing: Set<string>) -> string`
  - `diffSummary(prev | null, next) -> string[]` (`'B 18 → 23'`, `'+ Generadores'`, `'− Backup en la nube'`; con `prev` null: `'Nueva licencia'` y una línea por módulo y límite)
- La exposición es `globalThis.LicCore = {...}` para que funcione igual en el navegador y en `vm`.

- [ ] **Step 1: Tests** (cargar: leer el HTML, extraer el contenido de `<script id="core">…</script>`, `vm.runInNewContext(code, { crypto: require('node:crypto').webcrypto, TextEncoder, TextDecoder, atob, btoa, globalThis: ctx })` o equivalente; tomar `LicCore`):
  - `openPrivateKey` con un PEM de `tool.keygen` (Task 1 tool) y la frase correcta firma; con otra frase rechaza `Frase de paso incorrecta`; con `'basura'` o un PEM sin cifrar rechaza `Formato de clave no soportado`; frase vacía → `Frase de paso incorrecta`.
  - Clave exportada por Node con `cipher: 'aes-128-cbc'` → se abre (o, si se decide no soportarla, `Formato de clave no soportado`; documentar cuál en el código).
  - `signLicense` produce exactamente el mismo texto que `tool.signLicense` para el mismo payload y clave (Ed25519 es determinista).
  - Ese texto lo acepta `license.verify(text, ID, { publicKey: pubDePrueba })`; con cliente `Agrocaraya Ñandú` también.
  - `verifyText` con otra pública → `firma`; con otro ID → `otra-instalacion`; `'hola'` → `formato`.
  - `validate` devuelve los mensajes exactos.
  - CSV: ida y vuelta con cliente `Agro, "S.A."\nnorte`; un CSV de cabecera vieja → `legacy: true`, filas con `licencia: ''`; `serializeCsv` escribe la cabecera nueva.
  - `latestByInstall`: dos filas del mismo `(cliente, id)` con la misma fecha → gana la segunda.
  - `fileName('Agro, S.A./x', id, '2026-10-22', new Set())` → `Agro__S_A__x_<8>_2026-10-22.txt`; con ese nombre en `existing` → `..._2026-10-22-2.txt`.
  - `diffSummary` para cambios de límites y módulos.
  - `LicCore.PUBLIC_KEY === license.PUBLIC_KEY`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/licenciasHtml.test.js` → FAIL.
- [ ] **Step 3: Implementar el bloque `core`.** Lector DER mínimo (TLV, longitudes cortas y largas). Estructura esperada: `EncryptedPrivateKeyInfo { AlgorithmIdentifier { 1.2.840.113549.1.5.13 (PBES2), { keyDerivationFunc { 1.2.840.113549.1.5.12 (PBKDF2), { salt OCTET STRING, iterations INTEGER, [keyLength], [prf AlgorithmIdentifier] } }, encryptionScheme { aes-256-cbc 2.16.840.1.101.3.4.1.42 | aes-128-cbc …1.2, IV OCTET STRING } } }, encryptedData OCTET STRING }`. PRF ausente = HMAC-SHA1 (1.2.840.113549.2.7); hmacWithSHA256 = 1.2.840.113549.2.9. `deriveBits` PBKDF2 → `importKey('raw', …, 'AES-CBC')` → `decrypt` (falla de padding → `Frase de paso incorrecta`) → `importKey('pkcs8', …, { name: 'Ed25519' }, false, ['sign'])`. base64url sin padding con `btoa`/`atob`.
- [ ] **Step 4:** test → PASS; suite completa → PASS.
- [ ] **Step 5: Commit** — `feat(scripts): nucleo de licencias.html (firma, CSV, historial)`.

---

### Task 3: Interfaz de la página

**Files:**
- Modify: `scripts/licencias.html` (agregar `<style>`, el markup y `<script id="ui">`; el bloque `core` no cambia salvo que un test lo exija)

**Interfaces:**
- Consumes: `LicCore` (Task 2).

- [ ] **Step 1:** Estructura, según spec §3:
  - Encabezado "Licencias WEG SCADA" y dos pestañas: **Emitir** y **Verificar**.
  - Emitir, paso 1: botón `Elegir carpeta` (`showDirectoryPicker({ mode: 'readwrite' })`); guardar el handle en IndexedDB (`licencias-weg` / store `handles` / key `dir`); en aperturas siguientes, botón `Usar <nombre de carpeta>` que llama `requestPermission({ mode: 'readwrite' })`. Sin `showDirectoryPicker` (Firefox) → aviso `Abrí esta página con Edge o Chrome`. Sin `private.pem` → `No encuentro private.pem en esta carpeta`.
  - Paso 2: campo frase (`type=password`, autocomplete off) + botón `Desbloquear` → `openPrivateKey`; error en rojo bajo el campo.
  - Paso 3: tabla de `latestByInstall` (cliente, ID corto con `title` completo, fecha, módulos con etiquetas, `A/B/C`, botón `Modificar`), botón `Nueva licencia`; vacía → `Todavía no hay licencias emitidas`.
  - Formulario: cliente, ID (bloqueado al modificar), casillas por `MODULE_LABELS`, A/B/C numéricos; errores de `validate` en vivo; recuadro con `diffSummary`; botón `Firmar y guardar` (deshabilitado con errores).
  - Al firmar: `signLicense` → `verifyText(text, LicCore.PUBLIC_KEY, id)`; si no `ok` → `La firma no coincide con la clave pública del SCADA` y no se escribe nada. Si ok: escribir `licencias/<fileName>` (crear subcarpeta), después leer+agregar+escribir `emitidas.csv` con `serializeCsv`; mostrar el texto con `Copiar` (clipboard con alternativa de seleccionar) y `Guardado en licencias\<nombre>`; refrescar la tabla. Error de escritura → mostrarlo y dejar el texto visible.
  - Verificar: textarea + botón `Verificar` → cliente, ID, fecha, módulos, límites y `Firma válida` / `Firma inválida` / `No es una licencia (formato)` (con `verifyText(text)` sin installId).
  - Pie: `licencias.html v1`.
- [ ] **Step 2:** Estilo: tokens en `:root` con los colores del portal (primario `hsl(221 83% 53%)`), modo oscuro con `prefers-color-scheme`, tipografía del sistema, ancho máximo ~960px, usable a 400px. Foco visible, labels en todos los campos.
- [ ] **Step 3: Verificación en el navegador** (panel del navegador de la app, `file:///C:/dev/weg-scada/scripts/licencias.html`): la página carga sin errores de consola, la pestaña Verificar acepta una licencia real (ej. la licencia "Prueba" completa del 2026-10-22 de la prueba de instalación: `eyJ2Ijox…AQ` → `Firma válida`) y rechaza la misma con un carácter cambiado. El selector de carpetas no se puede probar acá (diálogo de Windows).
- [ ] **Step 4:** Suite de weg-api completa → PASS (el test de la Task 2 sigue leyendo el bloque `core`).
- [ ] **Step 5: Commit** — `feat(scripts): interfaz de licencias.html`.

---

### Task 4: Entrega en la PC del integrador

- [ ] **Step 1:** Copiar `scripts/licencias.html` a `C:\licencias-weg\licencias.html` (sin tocar `private.pem` ni `emitidas.csv`).
- [ ] **Step 2 (usuario):** abrir con doble clic en Edge, `Elegir carpeta` → `C:\licencias-weg`, desbloquear con la frase, ver las 2 filas "Prueba", `Modificar` una (ej. B 5 → 6), firmar; comprobar el `.txt` en `licencias\`, la fila nueva en `emitidas.csv` y `Firma válida` en Verificar.
- [ ] **Step 3:** Push de `feat/licencias` y actualizar la descripción del PR #77 con la herramienta gráfica.
