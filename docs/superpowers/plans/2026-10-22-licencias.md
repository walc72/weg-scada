# Licencias por módulo y por dispositivo — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada instalación lee una licencia Ed25519 firmada que habilita módulos y limita la cantidad de dispositivos por nivel A/B/C, aplicada en weg-api, el poller y el portal.

**Architecture:** Un módulo `license.js` sin dependencias (verificar, contar, seleccionar) copiado idéntico en weg-api y el poller. weg-api expone `/api/license` y rechaza configs que superan la licencia; el poller solo lee los equipos permitidos. La réplica baja la licencia de planta. Una herramienta local firma licencias con la clave privada del integrador.

**Tech Stack:** Node (crypto Ed25519 nativo, `node:test`), Express, chokidar, React + Zustand + TypeScript.

**Spec:** `docs/superpowers/specs/2026-10-22-licencias-design.md`

## Global Constraints

- Sin dependencias nuevas: solo `crypto`, `fs`, `path` de Node y lo ya instalado (chokidar, express).
- Formato del texto: `base64url(JSON) + "." + base64url(firma Ed25519 del JSON)`.
- Módulos válidos: `medidores`, `caudales`, `unifilar`, `generadores`, `comunicaciones`, `replica`, `backup`.
- Niveles: variador = B; medidor = B, o C si tiene `waveform`; nivel ausente en `limites` = 0.
- Se cuentan solo equipos con `enabled !== false`.
- Modo base: `modulos: []`, `limites: { A: 2, B: 2, C: 2 }`.
- Motivos: `sin-licencia`, `formato`, `firma`, `version`, `otra-instalacion`.
- Archivos en `config/`: `install-id`, `license.key`. Nunca se sirven por `GET /api/config`.
- Nunca se borra config ni histórico por la licencia.
- Mensaje de límite en API: `Límite de la licencia: nivel B 21/20`.
- Commits por bash (heredoc), sin comillas dobles en mensajes vía PowerShell; terminar con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests: `cd nodered/weg-api && npm test`, `cd nodered/weg-modbus-poller && npm test`, `cd nodered/weg-replica && npm test`. Frontend: `npm run build` (incluye `tsc -b`) sin pipe, en el contenedor node:20-alpine de WSL.

## Review Focus

- `license.key` pegado desde Windows con `\r\n` o espacios al final → debe verificar igual (test en Task 1).
- `install-id` creado con `uuidgen | tee` termina en `\n` → se recorta al leer (test en Task 1).
- Un variador y un medidor con el mismo nombre → la selección se hace por lista, no por nombre global (test en Task 1).
- Config sin `meters` o sin `devices` (instalación nueva, réplica esqueleto) → uso 0, sin excepciones (test en Task 1).
- Licencia de una versión más nueva con un módulo desconocido → se ignora ese módulo y el resto vale (test en Task 1).

---

### Task 1: `license.js` en weg-api

**Files:**
- Create: `nodered/weg-api/src/services/license.js`
- Test: `nodered/weg-api/test/license.test.js`

**Interfaces:**
- Produces (todo exportado):
  - `MODULES: string[]`, `BASE: { modulos: [], limites: { A: 2, B: 2, C: 2 } }`
  - `PUBLIC_KEY: string | null` (PEM; `null` hasta la Task 9)
  - `encode(payloadObj, signatureBuf) -> string`, `decode(text) -> { payload, json, sig } | null` (`json` = string exacto firmado)
  - `sign(payloadObj, privateKey: KeyObject) -> string`
  - `verify(text, installId, { checkInstall = true, publicKey = PUBLIC_KEY } = {}) -> { ok, motivo, cliente, modulos, limites }` (si `ok` es false, `modulos`/`limites` = `BASE`)
  - `readInstallId(configDir) -> string | null`, `ensureInstallId(configDir) -> string` (crea UUID v4 si falta)
  - `load(configDir, opts) -> { installId, ...verify }` (lee `license.key`; sin archivo → `motivo: 'sin-licencia'`)
  - `tier(kind: 'device' | 'meter', item) -> 'A' | 'B' | 'C'`
  - `usage(config) -> { A, B, C }`
  - `allowed(config, lic) -> { devices: Set<string>, meters: Set<string> }` (primeros N de cada nivel en orden: primero `devices`, luego `meters`; medidores solo si `hasModule(lic, 'medidores')`)
  - `hasModule(lic, name) -> boolean`
  - `check(config, lic) -> string[]` (errores; vacío si la config entra en la licencia)

- [ ] **Step 1: Escribir los tests**

Generar claves con `crypto.generateKeyPairSync('ed25519')`; `pub` = PEM de la pública. `ID = '7f3c2a9e-1b4d-4c6e-9f0a-2b3c4d5e6f70'`. Payload base `P = { v: 1, installId: ID, cliente: 'Agriplus', emitida: '2026-10-22', modulos: ['medidores'], limites: { A: 0, B: 20, C: 1 } }`.

```js
test('licencia válida', () => {
  const r = verify(sign(P, priv), ID, { publicKey: pub });
  assert.equal(r.ok, true); assert.equal(r.cliente, 'Agriplus');
  assert.deepEqual(r.modulos, ['medidores']); assert.deepEqual(r.limites, { A: 0, B: 20, C: 1 });
});
test('tolera \\r\\n y espacios', () => assert.equal(verify('  ' + sign(P, priv) + '\r\n', ID, { publicKey: pub }).ok, true));
test('byte cambiado → firma', () => { /* cambiar un char del payload base64 por otro válido */ assert.equal(r.motivo, 'firma'); });
test('otra instalación', () => assert.equal(verify(sign(P, priv), 'otro-id', { publicKey: pub }).motivo, 'otra-instalacion'));
test('checkInstall false acepta otro ID', () => assert.equal(verify(sign(P, priv), 'otro', { publicKey: pub, checkInstall: false }).ok, true));
test('otra clave → firma', ...);           // firmar con otro par
test('basura → formato', () => assert.equal(verify('hola', ID, { publicKey: pub }).motivo, 'formato'));
test('v desconocido → version', ...);      // P con v: 2
test('vacío → sin-licencia', () => assert.equal(verify('', ID, { publicKey: pub }).motivo, 'sin-licencia'));
test('inválida cae en BASE', () => assert.deepEqual(verify('hola', ID, { publicKey: pub }).limites, { A: 2, B: 2, C: 2 }));
test('PUBLIC_KEY null → firma', () => assert.equal(verify(sign(P, priv), ID, { publicKey: null }).motivo, 'firma'));
test('módulo desconocido se ignora', () => assert.deepEqual(verify(sign({ ...P, modulos: ['medidores', 'futuro'] }, priv), ID, { publicKey: pub }).modulos, ['medidores']));
test('install-id con \\n se recorta', () => { /* escribir ID + '\n' en tmpdir */ assert.equal(readInstallId(dir), ID); });
test('ensureInstallId crea UUID v4 una sola vez', () => { const a = ensureInstallId(dir); assert.match(a, /^[0-9a-f-]{36}$/); assert.equal(ensureInstallId(dir), a); });
test('tier', () => { assert.equal(tier('device', {}), 'B'); assert.equal(tier('meter', {}), 'B'); assert.equal(tier('meter', { waveform: {} }), 'C'); });
test('usage ignora deshabilitados y listas ausentes', () => {
  assert.deepEqual(usage({}), { A: 0, B: 0, C: 0 });
  assert.deepEqual(usage({ devices: [{ name: 'a' }, { name: 'b', enabled: false }], meters: [{ name: 'm', waveform: {} }] }), { A: 0, B: 1, C: 1 });
});
test('allowed: 22 variadores, límite B 20 → 20 primeros', () => {
  const devices = Array.from({ length: 22 }, (_, i) => ({ name: 'd' + i }));
  const a = allowed({ devices }, { modulos: [], limites: { B: 20 } });
  assert.equal(a.devices.size, 20); assert.equal(a.devices.has('d20'), false);
});
test('allowed: mismo nombre en variador y medidor no se pisa', () => {
  const a = allowed({ devices: [{ name: 'X' }], meters: [{ name: 'X' }] }, { modulos: ['medidores'], limites: { B: 1 } });
  assert.equal(a.devices.has('X'), true); assert.equal(a.meters.has('X'), false);
});
test('allowed: sin módulo medidores no hay medidores', () => assert.equal(allowed({ meters: [{ name: 'm' }] }, { modulos: [], limites: { B: 5 } }).meters.size, 0));
test('check', () => {
  assert.deepEqual(check({ devices: [{ name: 'a' }, { name: 'b' }] }, { modulos: [], limites: { B: 1 } }), ['Límite de la licencia: nivel B 2/1']);
  assert.match(check({ meters: [{ name: 'm' }] }, { modulos: [], limites: { B: 5 } })[0], /medidores/);
});
```

- [ ] **Step 2: Correr y ver que fallan** — `cd nodered/weg-api && node --test test/license.test.js` → FAIL (`Cannot find module '../src/services/license'`).

- [ ] **Step 3: Implementar `license.js`**

`verify`: `text.trim()`; vacío → `sin-licencia`; `decode` null o JSON inválido → `formato`; `payload.v !== 1` → `version`; `crypto.verify(null, Buffer.from(json), publicKey, sig)` falso o `publicKey` null → `firma`; `checkInstall && payload.installId !== installId` → `otra-instalacion`. `modulos` filtrado por `MODULES`; `limites` normalizado a enteros ≥ 0 con 0 por defecto. Mensaje de `check` sin módulo: `La licencia no incluye el módulo medidores`.

- [ ] **Step 4: Correr y ver que pasan** — mismo comando → PASS; luego `npm test` completo → PASS.

- [ ] **Step 5: Commit** — `feat(license): verificacion, conteo y seleccion de equipos`.

---

### Task 2: Copia en el poller + test de igualdad

**Files:**
- Create: `nodered/weg-modbus-poller/src/license.js` (copia exacta de la Task 1)
- Test: `nodered/weg-modbus-poller/test/license-copy.test.js`

**Interfaces:**
- Consumes: `nodered/weg-api/src/services/license.js` (Task 1).
- Produces: mismo módulo en `require('./license')` del poller.

- [ ] **Step 1: Test**

```js
test('license.js del poller es idéntico al de weg-api', () => {
  const a = fs.readFileSync(path.join(__dirname, '../src/license.js'));
  const b = fs.readFileSync(path.join(__dirname, '../../weg-api/src/services/license.js'));
  assert.ok(a.equals(b), 'copiar nodered/weg-api/src/services/license.js al poller');
});
```

- [ ] **Step 2:** `cd nodered/weg-modbus-poller && node --test test/license-copy.test.js` → FAIL (ENOENT).
- [ ] **Step 3:** `cp nodered/weg-api/src/services/license.js nodered/weg-modbus-poller/src/license.js`.
- [ ] **Step 4:** mismo comando → PASS. Verificar que `.gitattributes` no cambie los finales de línea de una copia y no de la otra (`git diff --stat` tras commit, ambos LF).
- [ ] **Step 5: Commit** — `feat(poller): copia de license.js con test de igualdad`.

---

### Task 3: weg-api — ID de instalación, carga y `/api/license`

**Files:**
- Create: `nodered/weg-api/src/routes/license.js`
- Modify: `nodered/weg-api/src/server.js` (arranque y montaje junto a las demás rutas, ~línea 100)
- Test: `nodered/weg-api/test/licenseRoute.test.js`

**Interfaces:**
- Consumes: `ensureInstallId`, `load`, `verify`, `usage` (Task 1); `requireSuperadmin` de `middleware/auth.js`.
- Produces:
  - `createLicenseState({ configDir, isReplica, publicKey }) -> { get(): lic, reload(): lic, watch(): FSWatcher }`, exportado desde `routes/license.js` (no desde `services/license.js`, para no tocar la copia compartida). `lic` = resultado de `load` con `checkInstall: !isReplica`.
  - `createLicenseRouter({ state, getConfig, configDir }) -> express.Router` con `GET /` y `PUT /`.
  - `server.js` exporta nada nuevo; pasa `licenseState.get` a las Tasks 4 y 6.

- [ ] **Step 1: Tests** (estilo de `adminWriteGuard.test.js`: app express efímera, `req.auth` inyectado, tmpdir como `configDir`, clave de prueba vía `publicKey`)

- `GET /` como operador → 200 con `{ installId, ok: false, motivo: 'sin-licencia', modulos: [], limites: { A: 2, B: 2, C: 2 }, uso: { A: 0, B: 1, C: 0 } }` (config con 1 variador).
- `PUT /` como admin → 403.
- `PUT /` como superadmin con `{ text: 'basura' }` → 400 `{ error: 'Licencia inválida', motivo: 'formato' }` y `license.key` no existe.
- `PUT /` como superadmin con texto válido → 200, `license.key` contiene el texto recortado y el siguiente `GET` da `ok: true`.
- `PUT /` con body sin `text` o `text` > 8 KB → 400.

- [ ] **Step 2:** `node --test test/licenseRoute.test.js` → FAIL.
- [ ] **Step 3:** Implementar. `PUT` escribe con tmp + rename y llama `state.reload()`. `watch()` usa chokidar sobre `license.key` e `install-id` con `add` y `change` (mismas opciones que `watchConfigFile` en `services/config.js`). En `server.js`: `ensureInstallId(CONFIG_DIR)` solo si no es réplica, crear el state, `watch()`, montar `app.use('/api/license', createLicenseRouter(...))`.
- [ ] **Step 4:** test → PASS; `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(api): id de instalacion y /api/license`.

---

### Task 4: weg-api — aplicar límites y módulos

**Files:**
- Modify: `nodered/weg-api/src/routes/config.js` (`PUT /` ~l.61, `PUT /devices` ~l.81, `POST /devices` ~l.99)
- Modify: `nodered/weg-api/src/routes/waveform.js`
- Modify: `nodered/weg-api/src/routes/replica.js` (`createReplicaRouter`, l.41)
- Modify: `nodered/weg-api/src/server.js` (pasar `getLicense`)
- Test: `nodered/weg-api/test/licenseEnforce.test.js`, ampliar `nodered/weg-api/test/replica.test.js`

**Interfaces:**
- Consumes: `check`, `hasModule` (Task 1); `state.get` (Task 3).
- Produces:
  - `config.js` exporta además `setLicenseGetter(fn)` (el router es un singleton; por defecto devuelve `BASE`).
  - `requireModule(getLicense, name) -> middleware` en `nodered/weg-api/src/middleware/requireModule.js`: 403 `{ error: 'La licencia no incluye el módulo <name>' }`.
  - `createReplicaRouter({ ..., getLicense, getLicenseText })`: todo el router pasa por `requireModule(getLicense, 'replica')`; nueva ruta `GET /license` → `text/plain` con el contenido de `license.key` (o 404 si no hay).

- [ ] **Step 1: Tests**
  - `PUT /api/config` con 3 variadores y licencia `{ limites: { B: 2 } }` → 400 con `details: ['Límite de la licencia: nivel B 3/2']`; con 2 → 200.
  - `POST /api/config/devices` que llevaría a B 3/2 → 400.
  - `PUT /api/config` agregando un medidor sin módulo `medidores` → 400.
  - `requireModule`: sin `medidores` → 403 en `/api/waveform/X`; con el módulo → pasa.
  - Réplica: sin módulo `replica` → `/api/replica/config` 403; con módulo → 200, y `/api/replica/license` devuelve el texto.
- [ ] **Step 2:** tests → FAIL.
- [ ] **Step 3:** Implementar. En los handlers de config, después de `validateConfig`, armar la config resultante y sumar `check(next, getLicense())` a los errores (mismo formato 400 `{ error: 'Config invalida', details }`). En `server.js`: `setLicenseGetter(licenseState.get)`, `app.use('/api/waveform', requireModule(licenseState.get, 'medidores'), waveformRoutes)`, y `getLicense`/`getLicenseText` al router de réplica.
- [ ] **Step 4:** tests → PASS; `npm test` completo → PASS (los tests existentes de réplica deben pasar una licencia con `replica`).
- [ ] **Step 5: Commit** — `feat(api): limites de licencia en config, waveform y replica`.

---

### Task 5: Poller — leer solo lo permitido

**Files:**
- Modify: `nodered/weg-modbus-poller/src/index.js` (`getGroups` l.129, `syncDisabled` l.110, hot reload l.494)
- Modify: `nodered/weg-modbus-poller/src/retained.js`
- Test: `nodered/weg-modbus-poller/test/retained.test.js` (ampliar)

**Interfaces:**
- Consumes: `load`, `allowed` (Task 2).
- Produces: `excededTopics(config, allowedSets) -> { topic, name }[]` en `retained.js`: tópico `${prefix}/${sanitizeTopic(name)}` para variadores y `weg/meters/${sanitizeTopic(name)}` para medidores, solo equipos habilitados fuera del permitido.

- [ ] **Step 1: Test** — config con 3 variadores habilitados y 1 deshabilitado, `allowed.devices = {d0, d1}` → `excededTopics` devuelve solo `weg/drives/d2`; con un medidor fuera → incluye `weg/meters/m0`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar. `let lic = license.load(CONFIG_DIR)` al arrancar; `getGroups` filtra `devs`/`meters` por `allowed(config, lic)`. Por cada `excededTopics` publicar retenido `{ name, online: false, license: 'excedido', ts: Date.now() }` una vez por cambio (recordar el set publicado). Watcher chokidar sobre `license.key` e `install-id` (`add`/`change`) que recarga `lic`; los equipos que vuelven a estar permitidos se leen en la próxima vuelta y su publicación normal pisa el retenido.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(poller): leer solo los equipos que entran en la licencia`.

---

### Task 6: Réplica — usar la licencia de planta

**Files:**
- Modify: `nodered/weg-replica/src/source.js` (agregar `license()`), `nodered/weg-replica/src/files.js` (`createFileSync`, l.28), donde se crea `createFileSync` en `nodered/weg-replica/src/index.js`
- Test: `nodered/weg-replica/test/files.test.js` (ampliar)

**Interfaces:**
- Consumes: `GET /api/replica/license` (Task 4); `createLicenseState({ isReplica: true })` (Task 3) ya verifica con `checkInstall: false`.
- Produces: `createFileSync({ source, configPath, manualPath, licensePath })` escribe `license.key` si cambió; respuesta 404 de planta → no escribe nada; 403 de planta → log `La licencia de planta no incluye réplica` y no toca archivos.

- [ ] **Step 1: Tests** — source falso con `license()` → `'abc.def'`: se escribe `license.key`; segunda vuelta igual → no reescribe; `license()` que lanza 403 → no escribe config ni license.
- [ ] **Step 2:** `cd nodered/weg-replica && npm test` → FAIL.
- [ ] **Step 3:** Implementar. `source.license()` pide texto plano (no JSON). `licensePath = path.join(path.dirname(configPath), 'license.key')`.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** — `feat(replica): bajar la licencia de planta`.

---

### Task 7: Frontend

**Files:**
- Create: `frontend-react/src/store/license.ts`, `frontend-react/src/views/LicenciaTab.tsx`
- Modify: `frontend-react/src/types.ts` (tipo `License`; `license?: 'excedido'` en el tipo runtime de variador y de medidor), `frontend-react/src/App.tsx` (nav l.41, banner), `frontend-react/src/views/Config.tsx` (pestaña, botones "Agregar Bomba" l.608 y "Agregar Medidor" l.857), `frontend-react/src/views/Dashboard.tsx` (tarjetas de medidores l.140 y l.207), `frontend-react/src/components/DriveCard.tsx`, `frontend-react/src/components/PM8000Card.tsx`, `frontend-react/src/mock/*` (licencia completa en modo mock)

**Interfaces:**
- Consumes: `GET /api/license`, `PUT /api/license` (Task 3) vía `apiJson` de `lib/api.ts`.
- Produces: `useLicense` (Zustand) con `{ lic: License | null, load(): Promise<void>, save(text): Promise<void>, hasModule(name): boolean, full(tier): boolean }`. `hasModule` devuelve `true` mientras `lic` es `null` (evita parpadeo al cargar).

- [ ] **Step 1:** `License` en `types.ts`: `{ installId: string | null; ok: boolean; motivo?: string; cliente?: string; modulos: string[]; limites: Record<'A'|'B'|'C', number>; uso: Record<'A'|'B'|'C', number> }`.
- [ ] **Step 2:** Store + `load()` después del login (donde `App.tsx` ya carga la config).
- [ ] **Step 3:** Nav: ítems con `module?: string`; Forma de Onda `module: 'medidores'`; filtrar con `hasModule`. Banner existente (`components/Banner.tsx`) con `Sin licencia (<motivo>)` cuando `lic && !lic.ok`. En réplica el texto es `La licencia de planta no incluye réplica o todavía no se bajó`.
- [ ] **Step 4:** Dashboard oculta tarjetas de medidores sin `medidores`. `DriveCard`/`PM8000Card` muestran la etiqueta `Fuera de licencia` cuando `license === 'excedido'`.
- [ ] **Step 5:** `LicenciaTab`: ID con botón Copiar (`navigator.clipboard.writeText` con fallback a seleccionar), cliente, módulos, uso `B 18/20`. Superadmin: textarea + botón `Guardar licencia`, error con el motivo del 400. Pestaña `Licencia` visible para admin y superadmin; en réplica, solo lectura.
- [ ] **Step 6:** Botones "Agregar Bomba" y "Agregar Medidor" deshabilitados con `title="Límite de la licencia: nivel B 20/20"` cuando `full('B')` (medidor: también sin `medidores`).
- [ ] **Step 7:** Build en WSL sin pipe → OK; `grep -c "Fuera de licencia" dist/assets/index-*.js` ≥ 1. Preview mock: menú y pestaña Licencia se ven.
- [ ] **Step 8: Commit** — `feat(ui): licencia en el portal`.

---

### Task 8: Herramienta de firma

**Files:**
- Create: `scripts/license.js`
- Test: `nodered/weg-api/test/licenseTool.test.js`

**Interfaces:**
- Consumes: `sign`, `decode`, `verify`, `MODULES` (Task 1) vía `require('../nodered/weg-api/src/services/license')`.
- Produces (exportado además del CLI): `keygen({ dir, passphrase })`, `signLicense({ keyPem, passphrase, id, cliente, modulos, A, B, C, today }) -> string`, `appendIssued(dir, row)`, `show(text, publicKey?) -> string`.

- [ ] **Step 1: Tests** — `keygen` en tmpdir crea `private.pem` cifrado (`-----BEGIN ENCRYPTED PRIVATE KEY-----`) y se niega a sobrescribirlo; `signLicense` con frase correcta produce un texto que `verify` acepta con la pública; frase incorrecta lanza; módulo `unifilr` lanza `Módulo desconocido: unifilr`; id inválido lanza; `appendIssued` agrega una línea CSV `2026-10-22,Agriplus,<id>,medidores|caudales,0,20,1`.
- [ ] **Step 2:** `node --test test/licenseTool.test.js` → FAIL.
- [ ] **Step 3:** Implementar. Clave privada exportada `pkcs8` + `cipher: 'aes-256-cbc'` + `passphrase`. CLI con `process.argv`; la frase se pide con `readline` sin eco (nunca por argumento). `sign` agrega a `emitidas.csv` en la carpeta de la clave. `show` busca la pública en `license.js`.
- [ ] **Step 4:** test → PASS.
- [ ] **Step 5: Commit** — `feat(scripts): herramienta de firma de licencias`.

---

### Task 9: Clave real, prueba de instalación y release

Pasos con el usuario; ningún agente corre `keygen` ni ve la frase de paso.

- [ ] **Step 1:** El usuario corre `node scripts/license.js keygen --out C:\licencias-weg` y guarda `private.pem` + frase en el gestor de contraseñas y en un USB.
- [ ] **Step 2:** Pegar la clave pública que mostró en `PUBLIC_KEY` de `nodered/weg-api/src/services/license.js` y copiar el archivo al poller. `npm test` en weg-api y poller → PASS (incluye el test de igualdad). Commit `feat(license): clave publica de produccion`.
- [ ] **Step 3:** Prueba docker-in-docker en WSL (scripts del scratchpad `inst-test.sh`/`inst-verify.sh`, publicando antes una imagen `edge` por workflow_dispatch): instalación limpia → modo base, banner `Sin licencia`, ID visible; pegar una licencia firmada para ese ID → aparecen los módulos; pegar una con `B 1` → los variadores de más se ven `Fuera de licencia` y la config queda intacta.
- [ ] **Step 4:** PR a master. Tras el merge, el usuario crea el tag `v1.3.0`.
- [ ] **Step 5:** Migración según la sección 7 de la spec (primero planta, después oficina), verificando antes que cada VM corre master.
