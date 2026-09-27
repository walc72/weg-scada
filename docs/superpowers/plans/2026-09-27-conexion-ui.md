# Conexión desde Configuración — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Operar desde Configuración el Tailscale del servidor (link + QR), los códigos de enlace de réplicas en planta (crear/listar/revocar) y la conexión de la oficina a planta (pegar código, probar, estado), sin SSH.

**Architecture:** Un contenedor mínimo con privilegios `weg-agent` habla con el `tailscaled` del sistema por su socket y expone solo status/login/logout (red interna + `AGENT_TOKEN`); `weg-api` lo usa desde endpoints admin. En planta, un registro `config/replicas.json` (hash del token por réplica) alimenta la auth de `/api/replica/*`. En oficina, `config/replica.json` guarda la conexión y `weg-replica` la relee cada 10 s (con el `.env` como respaldo).

**Tech Stack:** Node 20 (Express 4, `node:test`, `child_process`), CLI `tailscale` 1.102.4, React 18 + Vite + Zustand, `qrcode` (npm), Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-27-conexion-ui-design.md`

## Global Constraints

- Repo `C:\dev\weg-scada`, rama `feat/conexion-ui` (sale de `feat/replica-branding`, PR #54).
- Tests backend (desde Git Bash; `<pkg>` = `weg-api` | `weg-replica` | `weg-agent`):
  ```bash
  MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- sh /mnt/c/Users/walc7/AppData/Local/Temp/claude/C--Users-walc7-OneDrive-Documentos-Projects-Agriplus/8852c69a-88c6-4923-916e-40bb7eed934b/scratchpad/run-tests.sh <pkg>
  ```
  (el script corre `npm install` + `timeout 180 node --test test/` en `node:20-alpine`).
- Build frontend (sin pipe que trague el exit code):
  ```bash
  MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- sh /mnt/c/Users/walc7/AppData/Local/Temp/claude/C--Users-walc7-OneDrive-Documentos-Projects-Agriplus/8852c69a-88c6-4923-916e-40bb7eed934b/scratchpad/build-front.sh
  ```
- weg-api y weg-replica: sin dependencias nuevas. weg-agent: sin dependencias npm. Frontend: agrega `qrcode` y `@types/qrcode`.
- Strings exactos:
  - Código: prefijo `WEGR1-`, payload base64url de `{ v:1, u, t, n, i }`, token 64 hex.
  - `Código de enlace inválido`
  - `Agente del sistema no disponible`
  - `Solo disponible en planta` / `Solo disponible en un servidor réplica`
  - `Réplica heredada (.env)`; revocarla → 409 `La réplica heredada se quita borrando REPLICA_TOKEN del .env de planta`
  - `Tailscale no está instalado en el servidor`
  - `Nombre inválido (minúsculas, números y guiones)` (regex `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`)
- Throttle de `lastSeenAt`: 60 s por réplica (o cambio de IP). Relectura de `replica.json` en weg-replica: cada 10 s. Polling de UI: 3 s (login Tailscale), 5 s (estado de sync).
- Umbral de atraso del badge: `lagSec > 120`.
- Todo endpoint nuevo de weg-api es solo admin.
- **Acciones sobre la VM de planta, la VM de oficina o Proxmox requieren OK explícito del usuario. Nunca llamar login/logout de Tailscale sobre un servidor real sin que el usuario lo pida en ese momento (en WSL local solo `status`).**
- Commits sin comillas dobles; terminar con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Oficina recién instalada sin `config.json`** (enlazada desde la UI, no por `.env`) → weg-api tiene que arrancar, `/api/config` responder un esqueleto vacío y la pestaña Conexión verse. Test en Task 4 (`replica mode without config.json returns an empty skeleton`).
2. **Código pegado con espacios/saltos de línea o truncado** → se acepta con espacios; truncado da `Código de enlace inválido`, nunca un 500. Test en Task 1 (`trims whitespace` / `rejects truncated`).
3. **Token de réplica revocado usado de nuevo** → 401 inmediato aunque el proceso de weg-api no se haya reiniciado. Test en Task 3 (`revoked replica gets 401 without restart`).
4. **`tailscale up` falla al toque** (prefs anteriores incompatibles) → la UI recibe el mensaje del CLI (409), no se queda esperando 15 s ni lanza otro `up`. Test en Task 6 (`surfaces a fast up failure`).
5. **Oficina re-enlazada a la misma planta con un código nuevo** → conserva el cursor (no re-descarga todo); a otra planta → lo reinicia. Test en Task 7 (`cursor survives a token change but not a source change`).

---

### Task 1: Código de enlace (weg-api)

**Files:**
- Create: `nodered/weg-api/src/services/pairingCode.js`
- Create: `nodered/weg-api/test/pairingCode.test.js`

**Interfaces:**
- Produces: `encodeCode({ url, token, name, id }): string`, `decodeCode(code): { url, token, name, id }` (lanza `Error('Código de enlace inválido')`).

- [ ] **Step 1: Test que falla** — `nodered/weg-api/test/pairingCode.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeCode, decodeCode } = require('../src/services/pairingCode');

const TOKEN = 'a'.repeat(64);

test('round trip and trailing slash trimmed', () => {
  const code = encodeCode({ url: 'http://100.97.47.25:9090/', token: TOKEN, name: 'Oficina', id: 'r_1' });
  assert.match(code, /^WEGR1-[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCode(code), { url: 'http://100.97.47.25:9090', token: TOKEN, name: 'Oficina', id: 'r_1' });
});

test('trims whitespace and newlines around the code', () => {
  const code = encodeCode({ url: 'http://x:9090', token: TOKEN, name: 'n', id: 'i' });
  assert.equal(decodeCode(`  \n${code}\r\n `).url, 'http://x:9090');
});

test('rejects wrong prefix, truncated, bad json, wrong version, bad token, non-http url', () => {
  const good = encodeCode({ url: 'http://x:9090', token: TOKEN, name: 'n', id: 'i' });
  const b64 = (o) => 'WEGR1-' + Buffer.from(JSON.stringify(o)).toString('base64url');
  for (const bad of [
    'hola', '', null, good.replace('WEGR1-', 'WEGR2-'), good.slice(0, 20),
    'WEGR1-' + Buffer.from('{no json').toString('base64url'),
    b64({ v: 2, u: 'http://x', t: TOKEN }),
    b64({ v: 1, u: 'http://x', t: 'corto' }),
    b64({ v: 1, u: 'ftp://x', t: TOKEN }),
    b64({ v: 1, u: 'no es url', t: TOKEN }),
  ]) {
    assert.throws(() => decodeCode(bad), /Código de enlace inválido/, String(bad));
  }
});
```

- [ ] **Step 2: Correr y ver que falla** — `run-tests.sh weg-api`. Expected: `Cannot find module '../src/services/pairingCode'`.

- [ ] **Step 3: Implementar** — `nodered/weg-api/src/services/pairingCode.js`

```js
'use strict';

// Código de enlace planta → réplica. Lo genera la planta al registrar una
// réplica y se pega en la oficina: "WEGR1-" + base64url(JSON {v,u,t,n,i}).
// Contiene el token en claro: se muestra una sola vez.

const PREFIX = 'WEGR1-';
const TOKEN_RE = /^[0-9a-f]{64}$/;

function encodeCode({ url, token, name, id }) {
  const json = JSON.stringify({ v: 1, u: url, t: token, n: name, i: id });
  return PREFIX + Buffer.from(json, 'utf8').toString('base64url');
}

function decodeCode(code) {
  const bad = () => new Error('Código de enlace inválido');
  const s = String(code == null ? '' : code).trim();
  if (!s.startsWith(PREFIX)) throw bad();
  let obj;
  try { obj = JSON.parse(Buffer.from(s.slice(PREFIX.length), 'base64url').toString('utf8')); } catch { throw bad(); }
  if (!obj || obj.v !== 1 || typeof obj.u !== 'string' || typeof obj.t !== 'string' || !TOKEN_RE.test(obj.t)) throw bad();
  let u;
  try { u = new URL(obj.u); } catch { throw bad(); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw bad();
  return {
    url: obj.u.replace(/\/+$/, ''),
    token: obj.t,
    name: typeof obj.n === 'string' ? obj.n : '',
    id: typeof obj.i === 'string' ? obj.i : '',
  };
}

module.exports = { encodeCode, decodeCode, PREFIX };
```

- [ ] **Step 4: Correr y ver que pasa** — `run-tests.sh weg-api`. Expected: todo PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api/src/services/pairingCode.js nodered/weg-api/test/pairingCode.test.js && git commit -q -F - <<'EOF'
feat(conexion): codigo de enlace WEGR1 (encode/decode)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Registro de réplicas (weg-api, planta)

**Files:**
- Create: `nodered/weg-api/src/services/replicas.js`
- Create: `nodered/weg-api/test/replicas.test.js`

**Interfaces:**
- Consumes: `encodeCode` (Task 1).
- Produces: `createRegistry({ file, now? })` → `{ list(), hasActive(), create({ name, plantUrl }) → { replica, code }, revoke(id) → replica, verify(token, ip) → replica|null }`. Réplica pública: `{ id, name, createdAt, lastSeenAt, lastIp, revokedAt, status }`, `status ∈ 'activa'|'nunca conectada'|'revocada'`.

- [ ] **Step 1: Test que falla** — `nodered/weg-api/test/replicas.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRegistry } = require('../src/services/replicas');
const { decodeCode } = require('../src/services/pairingCode');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'replicas-')), 'replicas.json');

test('create returns a one-time code; only the hash is stored', () => {
  const file = tmpFile();
  const reg = createRegistry({ file });
  const { replica, code } = reg.create({ name: ' Oficina Tecno ', plantUrl: 'http://100.97.47.25:9090/' });
  assert.equal(replica.name, 'Oficina Tecno');
  assert.equal(replica.status, 'nunca conectada');
  const c = decodeCode(code);
  assert.equal(c.url, 'http://100.97.47.25:9090');
  assert.equal(c.id, replica.id);
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes(c.token), 'token en claro en disco');
  assert.ok(raw.includes(crypto.createHash('sha256').update(c.token).digest('hex')));
  assert.equal(reg.hasActive(), true);
});

test('validates name and url', () => {
  const reg = createRegistry({ file: tmpFile() });
  assert.throws(() => reg.create({ name: '  ', plantUrl: 'http://x' }), /Nombre inválido/);
  assert.throws(() => reg.create({ name: 'x'.repeat(61), plantUrl: 'http://x' }), /Nombre inválido/);
  assert.throws(() => reg.create({ name: 'ok', plantUrl: 'ftp://x' }), /Dirección de planta inválida/);
  assert.throws(() => reg.create({ name: 'ok', plantUrl: 'nada' }), /Dirección de planta inválida/);
});

test('verify accepts the active token, records ip, rejects others', () => {
  let t = Date.parse('2026-09-27T12:00:00Z');
  const reg = createRegistry({ file: tmpFile(), now: () => t });
  const { code } = reg.create({ name: 'A', plantUrl: 'http://x:9090' });
  const tok = decodeCode(code).token;
  assert.equal(reg.verify('f'.repeat(64), '1.1.1.1'), null);
  assert.equal(reg.verify('corto', '1.1.1.1'), null);
  const r = reg.verify(tok, '100.92.46.17');
  assert.equal(r.status, 'activa');
  assert.equal(r.lastIp, '100.92.46.17');
  assert.equal(reg.list()[0].lastSeenAt, '2026-09-27T12:00:00.000Z');
});

test('lastSeenAt is throttled to once a minute unless the ip changes', () => {
  let t = Date.parse('2026-09-27T12:00:00Z');
  const reg = createRegistry({ file: tmpFile(), now: () => t });
  const tok = decodeCode(reg.create({ name: 'A', plantUrl: 'http://x' }).code).token;
  reg.verify(tok, 'ip1');
  t += 30000; reg.verify(tok, 'ip1');
  assert.equal(reg.list()[0].lastSeenAt, '2026-09-27T12:00:00.000Z');
  t += 1000; reg.verify(tok, 'ip2');
  assert.equal(reg.list()[0].lastIp, 'ip2');
  t += 61000; reg.verify(tok, 'ip2');
  assert.equal(reg.list()[0].lastSeenAt, '2026-09-27T12:01:32.000Z');
});

test('revoke blocks the token, keeps the entry, 404 for unknown id', () => {
  const reg = createRegistry({ file: tmpFile() });
  const { replica, code } = reg.create({ name: 'A', plantUrl: 'http://x' });
  const tok = decodeCode(code).token;
  assert.equal(reg.revoke(replica.id).status, 'revocada');
  assert.equal(reg.verify(tok, 'ip'), null);
  assert.equal(reg.list().length, 1);
  assert.equal(reg.hasActive(), false);
  assert.throws(() => reg.revoke('r_nope'), (e) => e.status === 404);
});

test('missing or corrupt file behaves as empty', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{roto');
  const reg = createRegistry({ file });
  assert.deepEqual(reg.list(), []);
  assert.equal(reg.hasActive(), false);
});
```

- [ ] **Step 2: Correr y ver que falla** — `run-tests.sh weg-api`. Expected: `Cannot find module '../src/services/replicas'`.

- [ ] **Step 3: Implementar** — `nodered/weg-api/src/services/replicas.js`

```js
'use strict';

// Registro de réplicas de la PLANTA (config/replicas.json, no se sirve por
// /api/config). Un token por réplica; en disco solo su SHA-256. Se relee en
// cada operación (archivo chico) → revocar aplica en el acto.

const fs = require('fs');
const crypto = require('crypto');
const { encodeCode } = require('./pairingCode');

const SEEN_THROTTLE_MS = 60000;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function createRegistry({ file, now = Date.now }) {
  function read() {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      return j && Array.isArray(j.replicas) ? j : { replicas: [] };
    } catch { return { replicas: [] }; }
  }
  function write(db) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { encoding: 'utf8' });
    fs.renameSync(tmp, file);
  }
  const iso = () => new Date(now()).toISOString();
  const status = (r) => (r.revokedAt ? 'revocada' : r.lastSeenAt ? 'activa' : 'nunca conectada');
  const pub = (r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, lastIp: r.lastIp, revokedAt: r.revokedAt, status: status(r) });

  return {
    list() { return read().replicas.map(pub); },

    hasActive() { return read().replicas.some(r => !r.revokedAt); },

    create({ name, plantUrl }) {
      const n = typeof name === 'string' ? name.trim() : '';
      if (!n || n.length > 60) throw new Error('Nombre inválido (1 a 60 caracteres)');
      let u;
      try { u = new URL(String(plantUrl)); } catch { throw new Error('Dirección de planta inválida'); }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Dirección de planta inválida');
      const token = crypto.randomBytes(32).toString('hex');
      const r = {
        id: 'r_' + crypto.randomBytes(6).toString('hex'),
        name: n, tokenHash: sha(token), createdAt: iso(),
        lastSeenAt: null, lastIp: null, revokedAt: null,
      };
      const db = read();
      db.replicas.push(r);
      write(db);
      const url = String(plantUrl).replace(/\/+$/, '');
      return { replica: pub(r), code: encodeCode({ url, token, name: n, id: r.id }) };
    },

    revoke(id) {
      const db = read();
      const r = db.replicas.find(x => x.id === id);
      if (!r) { const e = new Error('Réplica no encontrada'); e.status = 404; throw e; }
      if (!r.revokedAt) { r.revokedAt = iso(); write(db); }
      return pub(r);
    },

    // Réplica activa dueña del token (y registra la conexión), o null
    verify(token, ip) {
      const h = Buffer.from(sha(token), 'hex');
      const db = read();
      let match = null;
      for (const r of db.replicas) {
        if (typeof r.tokenHash !== 'string' || r.tokenHash.length !== 64) continue;
        const same = crypto.timingSafeEqual(h, Buffer.from(r.tokenHash, 'hex'));
        if (same && !r.revokedAt) match = r;
      }
      if (!match) return null;
      const last = match.lastSeenAt ? Date.parse(match.lastSeenAt) : 0;
      const theIp = ip || null;
      if (now() - last >= SEEN_THROTTLE_MS || match.lastIp !== theIp) {
        match.lastSeenAt = iso();
        match.lastIp = theIp;
        write(db);
      }
      return pub(match);
    },
  };
}

module.exports = { createRegistry };
```

- [ ] **Step 4: Correr y ver que pasa** — `run-tests.sh weg-api`. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api/src/services/replicas.js nodered/weg-api/test/replicas.test.js && git commit -q -F - <<'EOF'
feat(conexion): registro de replicas en planta (token por replica, revocacion)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Auth de `/api/replica/*` con el registro + rutas de planta `/api/replicas`

**Files:**
- Modify: `nodered/weg-api/src/routes/replica.js` (middleware de auth)
- Create: `nodered/weg-api/src/routes/replicas.js`
- Modify: `nodered/weg-api/test/replica.test.js` (tests nuevos al final)
- Create: `nodered/weg-api/test/replicasRoute.test.js`
- Modify: `nodered/weg-api/src/server.js`

**Interfaces:**
- Consumes: `createRegistry` (Task 2).
- Produces:
  - `createReplicaRouter({ token, registry?, ... })` — acepta token heredado **o** `registry.verify(token, ip)`; habilitado si `token || registry.hasActive()`.
  - `createReplicasRouter({ registry, isReplica, legacyToken })` → `GET /`, `POST /`, `DELETE /:id` (consumido por Task 8).

- [ ] **Step 1: Tests que fallan** — agregar al final de `nodered/weg-api/test/replica.test.js`:

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createRegistry } = require('../src/services/replicas');
const { decodeCode } = require('../src/services/pairingCode');

test('registry: 404 with no replicas, 200 with a code token, legacy token still works', async () => {
  const registry = createRegistry({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-')), 'replicas.json') });
  const off = await serve({ token: '', registry });
  try { assert.equal((await off.get('/info', 'x')).status, 404); } finally { await off.close(); }

  const tok = decodeCode(registry.create({ name: 'A', plantUrl: 'http://x' }).code).token;
  const s = await serve({ token: TOKEN, registry });
  try {
    assert.equal((await s.get('/config', tok)).status, 200);
    assert.equal((await s.get('/config', TOKEN)).status, 200);
    assert.equal((await s.get('/config', 'f'.repeat(64))).status, 401);
    assert.equal(registry.list()[0].status, 'activa');
  } finally { await s.close(); }
});

test('revoked replica gets 401 without restart', async () => {
  const registry = createRegistry({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-')), 'replicas.json') });
  const { replica, code } = registry.create({ name: 'A', plantUrl: 'http://x' });
  registry.create({ name: 'B', plantUrl: 'http://x' });
  const tok = decodeCode(code).token;
  const s = await serve({ token: '', registry });
  try {
    assert.equal((await s.get('/config', tok)).status, 200);
    registry.revoke(replica.id);
    assert.equal((await s.get('/config', tok)).status, 401);
  } finally { await s.close(); }
});
```

`nodered/weg-api/test/replicasRoute.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const createReplicasRouter = require('../src/routes/replicas');
const { createRegistry } = require('../src/services/replicas');

async function serve({ role = 'admin', isReplica = false, legacyToken = '' } = {}) {
  const registry = createRegistry({ file: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rs-')), 'replicas.json') });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/replicas', createReplicasRouter({ registry, isReplica, legacyToken }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/replicas`;
  const call = (method, p = '', body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { call, registry, close: () => new Promise(r => server.close(r)) };
}

test('admin creates, lists and revokes; code only in the create response', async () => {
  const s = await serve();
  try {
    const cr = await s.call('POST', '', { name: 'Oficina', plantUrl: 'http://100.97.47.25:9090' });
    assert.equal(cr.status, 200);
    const body = await cr.json();
    assert.match(body.code, /^WEGR1-/);
    const list = await (await s.call('GET')).json();
    assert.equal(list.replicas.length, 1);
    assert.equal(JSON.stringify(list).includes(body.code), false);
    const del = await s.call('DELETE', '/' + body.replica.id);
    assert.equal((await del.json()).status, 'revocada');
    assert.equal((await s.call('DELETE', '/r_nope')).status, 404);
  } finally { await s.close(); }
});

test('bad input → 400', async () => {
  const s = await serve();
  try { assert.equal((await s.call('POST', '', { name: '', plantUrl: 'http://x' })).status, 400); } finally { await s.close(); }
});

test('legacy .env token appears as a non-revocable entry', async () => {
  const s = await serve({ legacyToken: 'x'.repeat(64) });
  try {
    const list = await (await s.call('GET')).json();
    assert.deepEqual(list.replicas.map(r => r.name), ['Réplica heredada (.env)']);
    const del = await s.call('DELETE', '/env');
    assert.equal(del.status, 409);
    assert.match((await del.json()).error, /REPLICA_TOKEN del \.env de planta/);
  } finally { await s.close(); }
});

test('operador → 403; replica server → 409', async () => {
  const op = await serve({ role: 'operador' });
  try { assert.equal((await op.call('GET')).status, 403); } finally { await op.close(); }
  const rep = await serve({ isReplica: true });
  try {
    const r = await rep.call('GET');
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'Solo disponible en planta');
  } finally { await rep.close(); }
});
```

- [ ] **Step 2: Correr y ver que falla** — `run-tests.sh weg-api`. Expected: los dos tests nuevos de `replica.test.js` fallan (404/401 con registry ignorado) y `replicasRoute.test.js` con `Cannot find module '../src/routes/replicas'`.

- [ ] **Step 3: Auth con registro en `routes/replica.js`**

Cambiar la firma:
```js
function createReplicaRouter({ token, queryCsv, bucket, getConfig, getManual, now = Date.now, version = '2.0.0' }) {
```
por:
```js
function createReplicaRouter({ token, registry = null, queryCsv, bucket, getConfig, getManual, now = Date.now, version = '2.0.0' }) {
```
Y reemplazar en el middleware:
```js
    if (!token) return res.status(404).json({ error: 'No encontrado' });
```
por:
```js
    // Habilitada si hay token heredado (.env) o alguna réplica registrada activa
    if (!token && !(registry && registry.hasActive())) return res.status(404).json({ error: 'No encontrado' });
```
y:
```js
    if (!got || !tokenMatches(got, token)) {
```
por:
```js
    const legacyOk = !!token && !!got && tokenMatches(got, token);
    const replicaOk = !legacyOk && !!got && !!registry && !!registry.verify(got, ip);
    if (!legacyOk && !replicaOk) {
```
Actualizar el comentario de cabecera: `// Token: REPLICA_TOKEN del .env (heredado) o el de una réplica registrada (config/replicas.json).`

- [ ] **Step 4: `nodered/weg-api/src/routes/replicas.js`**

```js
'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

// Gestión de réplicas en PLANTA: crear (devuelve el código de enlace una sola
// vez), listar y revocar. La réplica heredada del .env se muestra pero no se
// revoca desde acá.
function createReplicasRouter({ registry, isReplica, legacyToken }) {
  const router = express.Router();
  router.use(requireAdmin);
  router.use((req, res, next) => {
    if (isReplica) return res.status(409).json({ error: 'Solo disponible en planta' });
    next();
  });

  router.get('/', (req, res) => {
    const replicas = registry.list();
    if (legacyToken) replicas.unshift({ id: 'env', name: 'Réplica heredada (.env)', legacy: true, status: 'activa', createdAt: null, lastSeenAt: null, lastIp: null, revokedAt: null });
    res.json({ replicas });
  });

  router.post('/', (req, res) => {
    try {
      const { name, plantUrl } = req.body || {};
      res.json(registry.create({ name, plantUrl }));
    } catch (e) { res.status(400).json({ error: e.message }); }
  });

  router.delete('/:id', (req, res) => {
    if (req.params.id === 'env') {
      return res.status(409).json({ error: 'La réplica heredada se quita borrando REPLICA_TOKEN del .env de planta' });
    }
    try { res.json(registry.revoke(req.params.id)); }
    catch (e) { res.status(e.status || 400).json({ error: e.message }); }
  });

  return router;
}

module.exports = createReplicasRouter;
```

- [ ] **Step 5: Correr y ver que pasa** — `run-tests.sh weg-api`. Expected: PASS.

- [ ] **Step 6: Cablear en `server.js`**

Requires nuevos (junto a los otros):
```js
const path = require('path');
const createReplicasRouter = require('./routes/replicas');
const { createRegistry } = require('./services/replicas');
```
Después de `const REPLICA_MODE = isReplicaMode();`:
```js
const CONFIG_DIR = path.dirname(process.env.CONFIG_PATH || '/app/config/config.json');
const replicaRegistry = createRegistry({ file: path.join(CONFIG_DIR, 'replicas.json') });
```
En `app.use('/api/replica', createReplicaRouter({ ... }))` agregar `registry: replicaRegistry,` después de `token: ...`.
Después de `app.use('/api/settings', settingsRoutes);`:
```js
app.use('/api/replicas', createReplicasRouter({
  registry: replicaRegistry, isReplica: REPLICA_MODE, legacyToken: process.env.REPLICA_TOKEN || '',
}));
```
Verificar: `node --check src/server.js` en el contenedor (como en tareas previas).

- [ ] **Step 7: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api && git commit -q -F - <<'EOF'
feat(conexion): /api/replica acepta tokens de replicas registradas; /api/replicas en planta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Oficina — `/api/replica-link` y arranque sin `config.json`

**Files:**
- Create: `nodered/weg-api/src/services/replicaLink.js`
- Create: `nodered/weg-api/src/routes/replicaLink.js`
- Create: `nodered/weg-api/test/replicaLink.test.js`
- Create: `nodered/weg-api/test/configSkeleton.test.js`
- Modify: `nodered/weg-api/src/services/config.js` (esqueleto en réplica + guard MQTT)
- Modify: `nodered/weg-api/src/server.js`

**Interfaces:**
- Consumes: `decodeCode` (Task 1).
- Produces:
  - `createLinkStore({ file })` → `{ read(): {source,token,name,id,pairedAt}|null, save(obj), remove() }`
  - `testLink(code, { fetchImpl?, timeoutMs? })` → `{ ok:true, name, source, oldest, newest, _conn:{url,token,name,id} } | { ok:false, error }`
  - `createReplicaLinkRouter({ store, isReplica, envSource, test?, fetchImpl?, healthUrl })` → `GET /`, `POST /test`, `PUT /`, `DELETE /`, `GET /status` (consumido por Task 8).

- [ ] **Step 1: Tests que fallan** — `nodered/weg-api/test/replicaLink.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const { createLinkStore, testLink } = require('../src/services/replicaLink');
const createReplicaLinkRouter = require('../src/routes/replicaLink');
const { encodeCode } = require('../src/services/pairingCode');

const TOKEN = 'b'.repeat(64);
const CODE = encodeCode({ url: 'http://planta:9090', token: TOKEN, name: 'Oficina', id: 'r_1' });
const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'link-')), 'replica.json');
const jsonRes = (status, obj) => ({ ok: status < 400, status, json: async () => obj });

test('testLink: ok, 401 revoked, 404 disabled, network error, bad code', async () => {
  const ok = await testLink(CODE, { fetchImpl: async (url, init) => {
    assert.equal(url, 'http://planta:9090/api/replica/info');
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    return jsonRes(200, { oldest: '2026-09-08T00:00:00Z', newest: '2026-09-27T00:00:00Z' });
  } });
  assert.equal(ok.ok, true);
  assert.equal(ok.oldest, '2026-09-08T00:00:00Z');
  assert.match((await testLink(CODE, { fetchImpl: async () => jsonRes(401, {}) })).error, /revocado/);
  assert.match((await testLink(CODE, { fetchImpl: async () => jsonRes(404, {}) })).error, /no tiene la réplica habilitada/);
  assert.match((await testLink(CODE, { fetchImpl: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }); } })).error, /ECONNREFUSED/);
  assert.equal((await testLink('basura')).error, 'Código de enlace inválido');
});

test('store round trip and remove', () => {
  const store = createLinkStore({ file: tmpFile() });
  assert.equal(store.read(), null);
  store.save({ source: 'http://p', token: TOKEN, name: 'n', id: 'i', pairedAt: 'x' });
  assert.equal(store.read().token, TOKEN);
  store.remove();
  assert.equal(store.read(), null);
});

async function serve({ role = 'admin', isReplica = true, envSource = '', test: t, health } = {}) {
  const store = createLinkStore({ file: tmpFile() });
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/replica-link', createReplicaLinkRouter({
    store, isReplica, envSource, healthUrl: 'http://weg-replica:3300/health',
    test: t || (async (code) => (code === CODE
      ? { ok: true, name: 'Oficina', source: 'http://planta:9090', oldest: 'o', newest: 'n', _conn: { url: 'http://planta:9090', token: TOKEN, name: 'Oficina', id: 'r_1' } }
      : { ok: false, error: 'Código de enlace inválido' })),
    fetchImpl: health || (async () => jsonRes(200, { configured: true, live: true, lagSec: 12 })),
  }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/replica-link`;
  const call = (method, p = '', body) => fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { call, store, close: () => new Promise(r => server.close(r)) };
}

test('save, get masked (never the token), sameSource, delete', async () => {
  const s = await serve({ envSource: 'http://planta:9090' });
  try {
    const before = await (await s.call('GET')).json();
    assert.equal(before.fromEnv, true);
    const put = await (await s.call('PUT', '', { code: CODE })).json();
    assert.equal(put.sameSource, true);
    const got = await (await s.call('GET')).json();
    assert.equal(got.source, 'http://planta:9090');
    assert.equal(got.tokenMasked, '…bbbb');
    assert.equal(JSON.stringify(got).includes(TOKEN), false);
    assert.equal(s.store.read().token, TOKEN);
    assert.equal((await s.call('DELETE')).status, 200);
    assert.equal(s.store.read(), null);
  } finally { await s.close(); }
});

test('test and put with a bad code → 400; test never returns the token', async () => {
  const s = await serve();
  try {
    const t = await (await s.call('POST', '/test', { code: CODE })).json();
    assert.equal(t.ok, true);
    assert.equal(JSON.stringify(t).includes(TOKEN), false);
    assert.equal((await s.call('PUT', '', { code: 'x' })).status, 400);
  } finally { await s.close(); }
});

test('status proxies weg-replica /health; 502 if down', async () => {
  const up = await serve();
  try { assert.equal((await (await up.call('GET', '/status')).json()).lagSec, 12); } finally { await up.close(); }
  const down = await serve({ health: async () => { throw new Error('ECONNREFUSED'); } });
  try { assert.equal((await down.call('GET', '/status')).status, 502); } finally { await down.close(); }
});

test('plant server → 409; operador → 403', async () => {
  const p = await serve({ isReplica: false });
  try {
    const r = await p.call('GET');
    assert.equal(r.status, 409);
    assert.equal((await r.json()).error, 'Solo disponible en un servidor réplica');
  } finally { await p.close(); }
  const op = await serve({ role: 'operador' });
  try { assert.equal((await op.call('GET')).status, 403); } finally { await op.close(); }
});
```

`nodered/weg-api/test/configSkeleton.test.js`:

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshConfigService(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  process.env.CONFIG_PATH = path.join(dir, 'config.json'); // no existe
  if (env.REPLICA_MODE === undefined) delete process.env.REPLICA_MODE; else process.env.REPLICA_MODE = env.REPLICA_MODE;
  delete require.cache[require.resolve('../src/services/config')];
  return require('../src/services/config');
}

test('replica mode without config.json returns an empty skeleton', () => {
  const cfg = freshConfigService({ REPLICA_MODE: '1' }).get();
  assert.deepEqual(cfg.devices, []);
  assert.deepEqual(cfg.meters, []);
  assert.deepEqual(cfg.gateways, []);
  assert.equal(cfg.mqtt.statusTopic, 'weg/status');
  assert.equal(cfg.influxdb.bucket, 'weg_drives');
});

test('plant without config.json still returns null (no masking)', () => {
  assert.equal(freshConfigService({}).get(), null);
});
```

- [ ] **Step 2: Correr y ver que falla** — `run-tests.sh weg-api`. Expected: `Cannot find module '../src/services/replicaLink'` y el test del esqueleto falla (`get()` devuelve null).

- [ ] **Step 3: `nodered/weg-api/src/services/replicaLink.js`**

```js
'use strict';

// Conexión de la OFICINA a planta (config/replica.json). El token va en claro
// (se usa para autenticar contra planta) y solo vive en este archivo; la API
// nunca lo devuelve. weg-replica relee el archivo cada 10 s.

const fs = require('fs');
const { decodeCode } = require('./pairingCode');

function createLinkStore({ file }) {
  return {
    read() {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return j && j.source && j.token ? j : null;
      } catch { return null; }
    },
    save(obj) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, file);
    },
    remove() {
      try { fs.unlinkSync(file); } catch { /* ya no existe */ }
    },
  };
}

// Prueba un código contra la planta. _conn lleva el token: solo para uso interno.
async function testLink(code, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  let c;
  try { c = decodeCode(code); } catch (e) { return { ok: false, error: e.message }; }
  try {
    const r = await fetchImpl(`${c.url}/api/replica/info`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.status === 401) return { ok: false, error: 'La planta rechazó el código (revocado o inválido)' };
    if (r.status === 404) return { ok: false, error: 'La planta no tiene la réplica habilitada' };
    if (!r.ok) return { ok: false, error: `La planta respondió HTTP ${r.status}` };
    const info = await r.json();
    return { ok: true, name: c.name, source: c.url, oldest: info.oldest || null, newest: info.newest || null, _conn: c };
  } catch (e) {
    if (e && e.name === 'TimeoutError') return { ok: false, error: 'Sin respuesta de la planta (timeout)' };
    const why = (e && e.cause && e.cause.code) || (e && e.message) || 'error';
    return { ok: false, error: `No se pudo conectar con la planta: ${why}` };
  }
}

const mask = (t) => (t ? '…' + String(t).slice(-4) : null);

module.exports = { createLinkStore, testLink, mask };
```

- [ ] **Step 4: `nodered/weg-api/src/routes/replicaLink.js`**

```js
'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { testLink, mask } = require('../services/replicaLink');

function publicResult(r) {
  const { _conn, ...rest } = r;
  return rest;
}

function createReplicaLinkRouter({ store, isReplica, envSource, test = testLink, fetchImpl = fetch, healthUrl }) {
  const router = express.Router();
  router.use(requireAdmin);
  router.use((req, res, next) => {
    if (!isReplica) return res.status(409).json({ error: 'Solo disponible en un servidor réplica' });
    next();
  });

  router.get('/', (req, res) => {
    const l = store.read();
    if (l) return res.json({ configured: true, fromEnv: false, source: l.source, name: l.name, id: l.id, pairedAt: l.pairedAt, tokenMasked: mask(l.token) });
    if (envSource) return res.json({ configured: true, fromEnv: true, source: envSource, name: '(.env)', id: null, pairedAt: null, tokenMasked: '…' });
    res.json({ configured: false });
  });

  router.post('/test', async (req, res) => {
    res.json(publicResult(await test((req.body || {}).code)));
  });

  router.put('/', async (req, res) => {
    const r = await test((req.body || {}).code);
    if (!r.ok) return res.status(400).json({ error: r.error });
    const prev = store.read();
    const prevSource = prev ? prev.source : envSource || null;
    const c = r._conn;
    store.save({ source: c.url, token: c.token, name: c.name, id: c.id, pairedAt: new Date().toISOString() });
    res.json({ ...publicResult(r), sameSource: prevSource === c.url });
  });

  router.delete('/', (req, res) => {
    store.remove();
    res.json({ ok: true });
  });

  router.get('/status', async (req, res) => {
    try {
      const r = await fetchImpl(healthUrl, { signal: AbortSignal.timeout(5000) });
      res.json(await r.json());
    } catch {
      res.status(502).json({ error: 'El servicio de réplica no responde' });
    }
  });

  return router;
}

module.exports = createReplicaLinkRouter;
```

- [ ] **Step 5: Esqueleto de config en réplica (`services/config.js`)**

Agregar después de `let mqttClient = null;`:
```js
// Réplica recién instalada: todavía no bajó config.json de planta (se enlaza
// desde la UI). Esqueleto vacío en memoria (no se guarda) para que la API y la
// pantalla de Conexión funcionen. En planta NO: ahí un config faltante es un error.
function replicaSkeleton() {
  return {
    pollIntervalMs: 2000, influxWriteIntervalMs: 10000,
    mqtt: { broker: 'mqtt://weg-mosquitto:1883', topicPrefix: 'weg/drives', statusTopic: 'weg/status' },
    influxdb: { url: 'http://weg-influxdb:8086', org: process.env.INFLUXDB_ORG || 'tecnoelectric', bucket: process.env.INFLUXDB_BUCKET || 'weg_drives', token: '' },
    alarmSetpoints: {}, gateways: [], devices: [], meters: [], gaugeZones: {},
  };
}
const isReplica = () => ['1', 'true', 'yes'].includes(String(process.env.REPLICA_MODE || '').toLowerCase());
```
En `load()`, reemplazar el `catch`:
```js
  } catch (e) {
    console.error(`[CFG] Load failed: ${e.message}`);
    return null;
  }
```
por:
```js
  } catch (e) {
    if (e.code === 'ENOENT' && isReplica()) {
      config = replicaSkeleton();
      console.log('[CFG] Réplica sin config.json todavía: esqueleto vacío hasta enlazar con planta');
      return config;
    }
    console.error(`[CFG] Load failed: ${e.message}`);
    return null;
  }
```
(Si en `load()` el `console.log` de éxito usa `config.devices.length`, no cambia.) Y en `connectMQTT`:
```js
    mqttClient.subscribe(cfg.mqtt.statusTopic || 'weg/status');
```
por:
```js
    mqttClient.subscribe((cfg && cfg.mqtt && cfg.mqtt.statusTopic) || 'weg/status');
```

- [ ] **Step 6: Correr y ver que pasa** — `run-tests.sh weg-api`. Expected: PASS.

- [ ] **Step 7: Cablear en `server.js`**

Requires:
```js
const createReplicaLinkRouter = require('./routes/replicaLink');
const { createLinkStore } = require('./services/replicaLink');
```
Después de montar `/api/replicas`:
```js
app.use('/api/replica-link', createReplicaLinkRouter({
  store: createLinkStore({ file: path.join(CONFIG_DIR, 'replica.json') }),
  isReplica: REPLICA_MODE,
  envSource: process.env.REPLICA_SOURCE || '',
  healthUrl: process.env.REPLICA_HEALTH_URL || 'http://weg-replica:3300/health',
}));
```
Nota: `REPLICA_SOURCE` llega a weg-api solo si el compose de oficina lo pasa (Task 9).

- [ ] **Step 8: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api && git commit -q -F - <<'EOF'
feat(conexion): /api/replica-link en oficina y arranque de replica sin config.json

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: `/api/system/tailscale` (weg-api → agente)

**Files:**
- Create: `nodered/weg-api/src/services/agentClient.js`
- Create: `nodered/weg-api/src/routes/system.js`
- Create: `nodered/weg-api/test/system.test.js`
- Modify: `nodered/weg-api/src/server.js`

**Interfaces:**
- Produces: `createAgentClient({ baseUrl, token, fetchImpl?, timeoutMs? })` → `{ status(), login(hostname), logout() }` (errores con `status`; red caída → 502 `Agente del sistema no disponible`); `createSystemRouter({ agent })` → `GET /tailscale`, `POST /tailscale/login`, `POST /tailscale/logout`.
- Consumes (Task 6, HTTP): `weg-agent` `/tailscale/*` con `Authorization: Bearer <AGENT_TOKEN>`.

- [ ] **Step 1: Test que falla** — `nodered/weg-api/test/system.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAgentClient } = require('../src/services/agentClient');
const createSystemRouter = require('../src/routes/system');

test('agent client sends the bearer token and maps errors', async () => {
  const calls = [];
  const ok = createAgentClient({ baseUrl: 'http://weg-agent:3400', token: 'T', fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ state: 'Running' }) };
  } });
  assert.equal((await ok.status()).state, 'Running');
  await ok.login('weg-demo');
  assert.equal(calls[0].url, 'http://weg-agent:3400/tailscale/status');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer T');
  assert.equal(calls[1].init.method, 'POST');
  assert.deepEqual(JSON.parse(calls[1].init.body), { hostname: 'weg-demo' });

  const down = createAgentClient({ baseUrl: 'http://x', token: 'T', fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  await assert.rejects(down.status(), (e) => e.status === 502 && e.message === 'Agente del sistema no disponible');

  const bad = createAgentClient({ baseUrl: 'http://x', token: 'T', fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ error: 'Nombre inválido (minúsculas, números y guiones)' }) }) });
  await assert.rejects(bad.login('X'), (e) => e.status === 400 && /Nombre inválido/.test(e.message));
});

async function serve(role, agent) {
  const app = express();
  app.use(express.json());
  app.use((req, res, next) => { req.auth = { role, user: role }; next(); });
  app.use('/api/system', createSystemRouter({ agent }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/system`;
  return { call: (m, p, b) => fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }), close: () => new Promise(r => server.close(r)) };
}

test('router: admin only, proxies, forwards agent errors', async () => {
  const agent = {
    status: async () => ({ state: 'NeedsLogin' }),
    login: async (h) => ({ state: 'NeedsLogin', authUrl: 'https://login.tailscale.com/a/x', hostname: h }),
    logout: async () => { throw Object.assign(new Error('Agente del sistema no disponible'), { status: 502 }); },
  };
  const op = await serve('operador', agent);
  try { assert.equal((await op.call('GET', '/tailscale')).status, 403); } finally { await op.close(); }
  const s = await serve('admin', agent);
  try {
    assert.equal((await (await s.call('GET', '/tailscale')).json()).state, 'NeedsLogin');
    assert.equal((await (await s.call('POST', '/tailscale/login', { hostname: 'weg-demo' })).json()).hostname, 'weg-demo');
    assert.equal((await s.call('POST', '/tailscale/logout')).status, 502);
  } finally { await s.close(); }
});
```

- [ ] **Step 2: Correr y ver que falla** — `run-tests.sh weg-api`. Expected: `Cannot find module '../src/services/agentClient'`.

- [ ] **Step 3: `nodered/weg-api/src/services/agentClient.js`**

```js
'use strict';

// Cliente del weg-agent (contenedor con privilegios que opera el Tailscale del
// sistema). Red interna de Docker + AGENT_TOKEN; el token no sale de weg-api.
function createAgentClient({ baseUrl, token, fetchImpl = fetch, timeoutMs = 25000 }) {
  async function call(method, path, body) {
    let r;
    try {
      r = await fetchImpl(baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      const e = new Error('Agente del sistema no disponible');
      e.status = 502;
      throw e;
    }
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const e = new Error((data && data.error) || `Agente HTTP ${r.status}`);
      e.status = r.status >= 500 ? 502 : r.status;
      throw e;
    }
    return data;
  }
  return {
    status: () => call('GET', '/tailscale/status'),
    login: (hostname) => call('POST', '/tailscale/login', { hostname }),
    logout: () => call('POST', '/tailscale/logout'),
  };
}

module.exports = { createAgentClient };
```

- [ ] **Step 4: `nodered/weg-api/src/routes/system.js`**

```js
'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');

// Operaciones de sistema (solo admin): Tailscale del servidor vía weg-agent.
function createSystemRouter({ agent }) {
  const router = express.Router();
  router.use(requireAdmin);
  const wrap = (fn) => async (req, res) => {
    try { res.json(await fn(req)); }
    catch (e) { res.status(e.status || 500).json({ error: e.message }); }
  };
  router.get('/tailscale', wrap(() => agent.status()));
  router.post('/tailscale/login', wrap((req) => agent.login((req.body || {}).hostname)));
  router.post('/tailscale/logout', wrap(() => agent.logout()));
  return router;
}

module.exports = createSystemRouter;
```

- [ ] **Step 5: Correr y ver que pasa** — `run-tests.sh weg-api`. Expected: PASS.

- [ ] **Step 6: Cablear en `server.js`**

Requires:
```js
const createSystemRouter = require('./routes/system');
const { createAgentClient } = require('./services/agentClient');
```
Después de `/api/replica-link`:
```js
app.use('/api/system', createSystemRouter({
  agent: createAgentClient({ baseUrl: process.env.AGENT_URL || 'http://weg-agent:3400', token: process.env.AGENT_TOKEN || '' }),
}));
```
`node --check src/server.js`.

- [ ] **Step 7: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api && git commit -q -F - <<'EOF'
feat(conexion): /api/system/tailscale (proxy admin al weg-agent)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Servicio `weg-agent`

**Files:**
- Create: `nodered/weg-agent/package.json`
- Create: `nodered/weg-agent/Dockerfile`
- Create: `nodered/weg-agent/.dockerignore`
- Create: `nodered/weg-agent/src/tailscale.js`
- Create: `nodered/weg-agent/src/server.js`
- Create: `nodered/weg-agent/src/index.js`
- Create: `nodered/weg-agent/test/tailscale.test.js`
- Create: `nodered/weg-agent/test/server.test.js`

**Interfaces:**
- Produces (HTTP, consumido por Task 5): `GET /health` (sin token), `GET /tailscale/status`, `POST /tailscale/login { hostname }`, `POST /tailscale/logout` → `{ state, tailnet, user, ip, hostname, authUrl }`.
- Internas: `parseStatus(json|null)`, `createTailscale({ run, spawnUp, socketExists, sleep?, loginWaitMs? })`, `createAgentServer({ token, tailscale, log? })`.
- `spawnUp(args)` devuelve un EventEmitter que emite `'done' (code, stderrText)` al terminar.

- [ ] **Step 1: package, Dockerfile, .dockerignore**

`nodered/weg-agent/package.json`:
```json
{
  "name": "weg-agent",
  "version": "1.0.0",
  "description": "Agente con privilegios minimos: opera el Tailscale del sistema para weg-api",
  "main": "src/index.js",
  "scripts": { "start": "node src/index.js", "test": "node --test test/" }
}
```
`nodered/weg-agent/.dockerignore`:
```
node_modules
test
```
`nodered/weg-agent/Dockerfile`:
```dockerfile
FROM node:20-alpine
# CLI de Tailscale (misma versión que el tailscaled de las VMs): solo cliente,
# habla con el daemon del sistema por el socket montado.
ARG TS_VERSION=1.102.4
RUN wget -qO- https://pkgs.tailscale.com/stable/tailscale_${TS_VERSION}_amd64.tgz | tar xz -C /tmp \
  && mv /tmp/tailscale_${TS_VERSION}_amd64/tailscale /usr/local/bin/tailscale \
  && rm -rf /tmp/tailscale_*
WORKDIR /app
COPY package.json ./
COPY src/ ./src/
# Corre como root a propósito: operar tailscaled (login/logout) exige root o
# "operator". Mitigación: sin puertos publicados, AGENT_TOKEN, tres operaciones fijas.
EXPOSE 3400
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget --spider -q http://127.0.0.1:3400/health || exit 1
CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Tests que fallan**

`nodered/weg-agent/test/tailscale.test.js`:
```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { parseStatus, createTailscale } = require('../src/tailscale');

const RUNNING = {
  BackendState: 'Running', AuthURL: '',
  Self: { HostName: 'weg-demo', UserID: 42, TailscaleIPs: ['100.92.46.17', 'fd7a::1'] },
  User: { 42: { LoginName: 'walc72@gmail.com' } },
  CurrentTailnet: { Name: 'walc72@gmail.com' },
};
const NEEDS = { BackendState: 'NeedsLogin', AuthURL: '', Self: { HostName: 'weg-demo' } };
const WITH_URL = { ...NEEDS, AuthURL: 'https://login.tailscale.com/a/abc' };

test('parseStatus maps running, needs-login and unavailable', () => {
  assert.deepEqual(parseStatus(RUNNING), { state: 'Running', tailnet: 'walc72@gmail.com', user: 'walc72@gmail.com', ip: '100.92.46.17', hostname: 'weg-demo', authUrl: null });
  assert.equal(parseStatus(WITH_URL).authUrl, 'https://login.tailscale.com/a/abc');
  assert.equal(parseStatus(null).state, 'Unavailable');
});

function fakeTs({ statuses, exists = true, upExit }) {
  const seq = [...statuses];
  const spawned = [];
  const ts = createTailscale({
    socketExists: () => exists,
    run: async (args) => {
      if (args[0] === 'logout') return { stdout: '' };
      const s = seq.length > 1 ? seq.shift() : seq[0];
      return { stdout: JSON.stringify(s) };
    },
    spawnUp: (args) => {
      const c = new EventEmitter();
      spawned.push(args);
      if (upExit) setImmediate(() => c.emit('done', upExit.code, upExit.stderr));
      return c;
    },
    // cede un turno de macrotarea (como el sleep real) para que corra el setImmediate de 'done'
    sleep: () => new Promise(r => setImmediate(r)),
    loginWaitMs: 200,
  });
  return { ts, spawned };
}

test('login spawns up once and returns the auth url', async () => {
  const { ts, spawned } = fakeTs({ statuses: [NEEDS, NEEDS, WITH_URL] });
  const st = await ts.login('weg-demo');
  assert.equal(st.authUrl, 'https://login.tailscale.com/a/abc');
  assert.deepEqual(spawned, [['up', '--hostname=weg-demo', '--timeout=0']]);
  await ts.login('weg-demo');
  assert.equal(spawned.length, 1, 'no lanza un segundo up mientras el primero sigue');
});

test('login when already running does nothing', async () => {
  const { ts, spawned } = fakeTs({ statuses: [RUNNING] });
  assert.equal((await ts.login('weg-demo')).state, 'Running');
  assert.equal(spawned.length, 0);
});

test('invalid hostname → 400; no tailscale → 409', async () => {
  const { ts } = fakeTs({ statuses: [NEEDS] });
  await assert.rejects(ts.login('Weg Demo'), (e) => e.status === 400 && /Nombre inválido/.test(e.message));
  const none = fakeTs({ statuses: [NEEDS], exists: false });
  await assert.rejects(none.ts.login('weg-demo'), (e) => e.status === 409 && e.message === 'Tailscale no está instalado en el servidor');
  assert.equal((await none.ts.status()).state, 'Unavailable');
});

test('surfaces a fast up failure', async () => {
  const { ts } = fakeTs({ statuses: [NEEDS], upExit: { code: 1, stderr: 'Error: changing settings via tailscale up requires mentioning all non-default flags' } });
  await assert.rejects(ts.login('weg-demo'), (e) => e.status === 409 && /non-default flags/.test(e.message));
});
```

`nodered/weg-agent/test/server.test.js`:
```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createAgentServer } = require('../src/server');

async function serve(token, tailscale) {
  const server = createAgentServer({ token, tailscale, log: { error() {} } });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, p, { tok = token, body } = {}) => fetch(base + p, { method: m, headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return { call, close: () => new Promise(r => server.close(r)) };
}
const ts = {
  status: async () => ({ state: 'Running' }),
  login: async (h) => { if (h === 'BAD') throw Object.assign(new Error('Nombre inválido (minúsculas, números y guiones)'), { status: 400 }); return { state: 'NeedsLogin', hostname: h }; },
  logout: async () => ({ state: 'NeedsLogin' }),
};

test('health is public; everything else needs the token', async () => {
  const s = await serve('T', ts);
  try {
    assert.equal((await s.call('GET', '/health', { tok: '' })).status, 200);
    assert.equal((await s.call('GET', '/tailscale/status', { tok: '' })).status, 401);
    assert.equal((await s.call('GET', '/tailscale/status', { tok: 'X' })).status, 401);
    assert.equal((await (await s.call('GET', '/tailscale/status')).json()).state, 'Running');
    assert.equal((await (await s.call('POST', '/tailscale/login', { body: { hostname: 'weg-demo' } })).json()).hostname, 'weg-demo');
    assert.equal((await s.call('POST', '/tailscale/login', { body: { hostname: 'BAD' } })).status, 400);
    assert.equal((await s.call('POST', '/tailscale/logout')).status, 200);
    assert.equal((await s.call('GET', '/otra')).status, 404);
  } finally { await s.close(); }
});

test('no AGENT_TOKEN configured → 503', async () => {
  const s = await serve('', ts);
  try { assert.equal((await s.call('GET', '/tailscale/status', { tok: 'x' })).status, 503); } finally { await s.close(); }
});
```

- [ ] **Step 3: Correr y ver que falla** — `run-tests.sh weg-agent`. Expected: `Cannot find module '../src/tailscale'` y `'../src/server'`.

- [ ] **Step 4: `nodered/weg-agent/src/tailscale.js`**

```js
'use strict';

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function parseStatus(j) {
  if (!j) return { state: 'Unavailable', tailnet: null, user: null, ip: null, hostname: null, authUrl: null };
  const self = j.Self || {};
  const u = j.User && self.UserID != null ? j.User[String(self.UserID)] : null;
  return {
    state: j.BackendState || 'NoState',
    tailnet: (j.CurrentTailnet && j.CurrentTailnet.Name) || null,
    user: (u && u.LoginName) || null,
    ip: (self.TailscaleIPs || []).find(ip => ip.includes('.')) || null,
    hostname: self.HostName || null,
    authUrl: j.AuthURL || null,
  };
}

const err = (status, message) => Object.assign(new Error(message), { status });

// run(args) → { stdout } (execFile); spawnUp(args) → EventEmitter 'done'(code, stderr)
function createTailscale({ run, spawnUp, socketExists, sleep = (ms) => new Promise(r => setTimeout(r, ms)), loginWaitMs = 15000 }) {
  let upChild = null;
  let upError = null;

  async function status() {
    if (!socketExists()) return parseStatus(null);
    try {
      const { stdout } = await run(['status', '--json']);
      return parseStatus(JSON.parse(stdout));
    } catch (e) {
      if (e && e.stdout) { try { return parseStatus(JSON.parse(e.stdout)); } catch { /* sigue */ } }
      return parseStatus(null);
    }
  }

  async function login(hostname) {
    if (!HOSTNAME_RE.test(String(hostname || ''))) throw err(400, 'Nombre inválido (minúsculas, números y guiones)');
    if (!socketExists()) throw err(409, 'Tailscale no está instalado en el servidor');
    let st = await status();
    if (st.state === 'Running') return st;
    if (!upChild) {
      upError = null;
      const child = spawnUp(['up', `--hostname=${hostname}`, '--timeout=0']);
      upChild = child;
      child.on('done', (code, stderr) => {
        if (upChild === child) upChild = null;
        if (code) upError = String(stderr || `tailscale up salió con código ${code}`).trim().split('\n').slice(-3).join(' ');
      });
    }
    const deadline = Date.now() + loginWaitMs;
    while (Date.now() < deadline) {
      await sleep(500);
      if (upError) throw err(409, upError);
      st = await status();
      if (st.authUrl || st.state === 'Running') return st;
    }
    return st;
  }

  async function logout() {
    if (!socketExists()) throw err(409, 'Tailscale no está instalado en el servidor');
    await run(['logout']);
    return status();
  }

  return { status, login, logout };
}

module.exports = { parseStatus, createTailscale, HOSTNAME_RE };
```

Nota sobre el test `surfaces a fast up failure`: `spawnUp` del fake emite `done` en `setImmediate`; el `sleep` fake también resuelve con `setImmediate` (encolado después), así que en la primera vuelta ya está `upError`.

- [ ] **Step 5: `nodered/weg-agent/src/server.js`**

```js
'use strict';

const http = require('http');
const crypto = require('crypto');

function tokenMatches(input, expected) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function readJson(req, limit = 10 * 1024) {
  return new Promise((resolve) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size <= limit) chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// Solo tres operaciones fijas; sin ejecución de comandos arbitrarios.
function createAgentServer({ token, tailscale, log = console }) {
  return http.createServer(async (req, res) => {
    const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const url = (req.url || '').split('?')[0];
    if (req.method === 'GET' && url === '/health') return send(200, { ok: true });
    if (!token) return send(503, { error: 'AGENT_TOKEN no configurado' });
    const h = req.headers.authorization || '';
    const got = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!got || !tokenMatches(got, token)) return send(401, { error: 'No autorizado' });
    try {
      if (req.method === 'GET' && url === '/tailscale/status') return send(200, await tailscale.status());
      if (req.method === 'POST' && url === '/tailscale/login') return send(200, await tailscale.login((await readJson(req)).hostname));
      if (req.method === 'POST' && url === '/tailscale/logout') return send(200, await tailscale.logout());
      return send(404, { error: 'No encontrado' });
    } catch (e) {
      log.error(`[AGENT] ${e.message}`);
      return send(e.status || 500, { error: e.message });
    }
  });
}

module.exports = { createAgentServer };
```

- [ ] **Step 6: `nodered/weg-agent/src/index.js`**

```js
'use strict';

const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { EventEmitter } = require('events');
const { createTailscale } = require('./tailscale');
const { createAgentServer } = require('./server');

const SOCK = process.env.TS_SOCKET || '/var/run/tailscale/tailscaled.sock';
const TOKEN = process.env.AGENT_TOKEN || '';
if (!TOKEN) console.error('[AGENT] AGENT_TOKEN vacío: todas las operaciones responden 503');

const run = (args) => new Promise((resolve, reject) => {
  execFile('tailscale', [`--socket=${SOCK}`, ...args], { timeout: 15000 }, (e, stdout, stderr) => {
    if (e) return reject(Object.assign(e, { stdout, stderr }));
    resolve({ stdout });
  });
});

const spawnUp = (args) => {
  const ev = new EventEmitter();
  const child = spawn('tailscale', [`--socket=${SOCK}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stdout.on('data', (d) => process.stdout.write(`[TS up] ${d}`));
  child.stderr.on('data', (d) => { stderr += d; process.stdout.write(`[TS up] ${d}`); });
  child.on('close', (code) => ev.emit('done', code, stderr));
  child.on('error', (e) => ev.emit('done', 1, e.message));
  return ev;
};

const tailscale = createTailscale({ run, spawnUp, socketExists: () => fs.existsSync(SOCK) });
createAgentServer({ token: TOKEN, tailscale }).listen(3400, '0.0.0.0', () => {
  console.log(`[AGENT] Escuchando :3400 (socket ${SOCK})`);
});
```

- [ ] **Step 7: Correr y ver que pasa** — `run-tests.sh weg-agent`. Expected: PASS (7 tests).

- [ ] **Step 8: Build de la imagen**

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker build -q -t weg-agent:dev /mnt/c/dev/weg-scada/nodered/weg-agent
```
Expected: build OK. Smoke solo de lectura contra el Tailscale de WSL (NO login/logout):
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- sh -c 'docker rm -f agent-smoke >/dev/null 2>&1; docker run -d --name agent-smoke -e AGENT_TOKEN=t -v /var/run/tailscale:/var/run/tailscale weg-agent:dev >/dev/null; sleep 3; docker exec agent-smoke wget -qO- --header "Authorization: Bearer t" http://127.0.0.1:3400/tailscale/status; echo; docker rm -f agent-smoke >/dev/null'
```
Expected: JSON con `state: "Running"` y el tailnet de la VM WSL.

- [ ] **Step 9: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-agent/package.json nodered/weg-agent/Dockerfile nodered/weg-agent/.dockerignore nodered/weg-agent/src nodered/weg-agent/test && git commit -q -F - <<'EOF'
feat(conexion): servicio weg-agent (status/login/logout de Tailscale del sistema)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: `weg-replica` configurable desde archivo

**Files:**
- Create: `nodered/weg-replica/src/connection.js`
- Create: `nodered/weg-replica/src/manager.js`
- Modify: `nodered/weg-replica/src/cursor.js` (cursor ligado a la planta)
- Modify: `nodered/weg-replica/src/index.js` (sin `exit(1)`, runtime reiniciable)
- Create: `nodered/weg-replica/test/connection.test.js`

**Interfaces:**
- Produces: `loadConnection({ file, env }) → { source, token, name, from: 'file'|'env' } | null`; `createCursorStore(file, source)`; `createManager({ load, start, log? })` → `{ tick(): boolean, connection(): string|null }`; `/health` agrega `configured`, `source`.
- Consumes: `config/replica.json` escrito por Task 4.

- [ ] **Step 1: Test que falla** — `nodered/weg-replica/test/connection.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadConnection } = require('../src/connection');
const { createManager } = require('../src/manager');
const { createCursorStore } = require('../src/cursor');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'conn-'));
const quiet = { log() {}, error() {} };

test('file wins over env; env is the fallback; nothing → null', () => {
  const d = tmp(); const file = path.join(d, 'replica.json');
  const env = { REPLICA_SOURCE: 'http://env:9090/', REPLICA_TOKEN: 'e' };
  assert.equal(loadConnection({ file, env: {} }), null);
  assert.deepEqual(loadConnection({ file, env }), { source: 'http://env:9090', token: 'e', name: '', from: 'env' });
  fs.writeFileSync(file, JSON.stringify({ source: 'http://file:9090', token: 'f', name: 'Oficina' }));
  assert.deepEqual(loadConnection({ file, env }), { source: 'http://file:9090', token: 'f', name: 'Oficina', from: 'file' });
  fs.writeFileSync(file, '{roto');
  assert.equal(loadConnection({ file, env }).from, 'env');
});

test('manager starts, keeps, restarts and stops runtimes as the connection changes', () => {
  let conn = null; const events = [];
  const m = createManager({ load: () => conn, start: (c) => { events.push(`start ${c.source} ${c.token}`); return { stop: () => events.push(`stop ${c.token}`) }; }, log: quiet });
  assert.equal(m.tick(), false);
  conn = { source: 'http://a', token: '1', from: 'file' };
  assert.equal(m.tick(), true);
  assert.equal(m.tick(), false);
  conn = { source: 'http://a', token: '2', from: 'file' };
  m.tick();
  conn = null;
  m.tick();
  assert.deepEqual(events, ['start http://a 1', 'stop 1', 'start http://a 2', 'stop 2']);
  assert.equal(m.connection(), null);
});

test('cursor survives a token change but not a source change', () => {
  const file = path.join(tmp(), 'cursor.json');
  createCursorStore(file, 'http://a').save('2026-09-20T00:00:00.000Z');
  assert.equal(createCursorStore(file, 'http://a').load(), '2026-09-20T00:00:00.000Z');
  assert.equal(createCursorStore(file, 'http://b').load(), null);
  fs.writeFileSync(file, JSON.stringify({ since: '2026-09-01T00:00:00.000Z' })); // cursor viejo sin source
  assert.equal(createCursorStore(file, 'http://a').load(), '2026-09-01T00:00:00.000Z');
});
```

- [ ] **Step 2: Correr y ver que falla** — `run-tests.sh weg-replica`. Expected: `Cannot find module '../src/connection'`.

- [ ] **Step 3: `nodered/weg-replica/src/connection.js`**

```js
'use strict';

const fs = require('fs');

// Conexión a planta: config/replica.json (enlazada desde la UI) o, como
// respaldo, REPLICA_SOURCE/REPLICA_TOKEN del .env. Sin ninguna → null.
function loadConnection({ file, env }) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && j.source && j.token) {
      return { source: String(j.source).replace(/\/+$/, ''), token: String(j.token), name: j.name || '', from: 'file' };
    }
  } catch { /* sin archivo o corrupto */ }
  if (env.REPLICA_SOURCE && env.REPLICA_TOKEN) {
    return { source: String(env.REPLICA_SOURCE).replace(/\/+$/, ''), token: String(env.REPLICA_TOKEN), name: '', from: 'env' };
  }
  return null;
}

module.exports = { loadConnection };
```

`nodered/weg-replica/src/manager.js`:
```js
'use strict';

// Arranca/para el runtime de réplica cuando cambia la conexión (source o token)
function createManager({ load, start, log = console }) {
  let current = null;
  let key = null;
  function tick() {
    const conn = load();
    const k = conn ? `${conn.source}|${conn.token}` : null;
    if (k === key) return false;
    if (current) { current.stop(); current = null; }
    key = k;
    if (conn) {
      log.log(`[REPLICA] Conexión: ${conn.source} (${conn.from})`);
      current = start(conn);
    } else {
      log.log('[REPLICA] Sin configurar: esperando el código de enlace desde Configuración');
    }
    return true;
  }
  return { tick, connection: () => key };
}

module.exports = { createManager };
```

`nodered/weg-replica/src/cursor.js` — reemplazar el archivo por:
```js
'use strict';

const fs = require('fs');

// Cursor del histórico persistido en /data. Va ligado a la planta de origen:
// si la réplica se enlaza a otra planta, arranca de cero. Un cursor viejo sin
// `source` (versión anterior) se acepta.
function createCursorStore(file, source) {
  return {
    load() {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof j.since !== 'string') return null;
        if (j.source && source && j.source !== source) return null;
        return j.since;
      } catch { return null; }
    },
    save(since) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ since, source, savedAt: new Date().toISOString() }));
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { createCursorStore };
```

- [ ] **Step 4: Correr y ver que pasa** — `run-tests.sh weg-replica`. Expected: PASS (los 13 previos + 3).

- [ ] **Step 5: `nodered/weg-replica/src/index.js` reiniciable**

Reemplazar el archivo completo por:
```js
'use strict';

const http = require('http');
const path = require('path');
const mqtt = require('mqtt');
const { createSource } = require('./source');
const { createInfluxWriter } = require('./influx');
const { createCursorStore } = require('./cursor');
const { createHistorySync } = require('./history');
const { createFileSync } = require('./files');
const { createLiveBridge } = require('./live');
const { loadConnection } = require('./connection');
const { createManager } = require('./manager');

const env = (k, d) => process.env[k] || d;
const CONFIG_PATH = env('CONFIG_PATH', '/app/config/config.json');
const CONFIG_DIR = path.dirname(CONFIG_PATH);
const LINK_FILE = path.join(CONFIG_DIR, 'replica.json');
const MANUAL_PATH = path.join(CONFIG_DIR, 'manual.json');
const DATA_DIR = env('DATA_DIR', '/data');
const FILES_EVERY_MS = 5 * 60000;
const STATUS_EVERY_MS = 10000;
const RELOAD_EVERY_MS = 10000;

const status = { configured: false, source: null, lastSync: null, cursor: null, live: false, error: null };
const setStatus = (patch) => Object.assign(status, patch);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function statusPayload() {
  const lagSec = status.cursor ? Math.round((Date.now() - Date.parse(status.cursor)) / 1000) : null;
  return { configured: status.configured, source: status.source, lastSync: status.lastSync, lagSec, live: status.live, error: status.error };
}

const write = createInfluxWriter({
  url: env('INFLUXDB_URL', 'http://influxdb:8086'),
  org: env('INFLUXDB_ORG', 'tecnoelectric'),
  bucket: env('INFLUXDB_BUCKET', 'weg_drives'),
  token: env('INFLUXDB_TOKEN', ''),
});
const local = mqtt.connect(env('MQTT_BROKER', 'mqtt://mosquitto:1883'), { clientId: 'weg-replica-local', reconnectPeriod: 5000 });

// Runtime de una conexión: histórico + archivos + en vivo. stop() lo corta.
function start(conn) {
  let stopped = false;
  setStatus({ configured: true, source: conn.source, lastSync: null, cursor: null, live: false, error: null });
  const source = createSource({ baseUrl: conn.source, token: conn.token });
  const history = createHistorySync({
    source, write, sleep, onStatus: (p) => { if (!stopped) setStatus(p); },
    cursor: createCursorStore(path.join(DATA_DIR, 'cursor.json'), conn.source),
  });
  history.run();

  const syncFiles = createFileSync({ source, configPath: CONFIG_PATH, manualPath: MANUAL_PATH });
  (async () => {
    while (!stopped) {
      try { await syncFiles(); } catch (e) { console.error(`[FILES] ${e.message}`); }
      await sleep(FILES_EVERY_MS);
    }
  })();

  const remote = mqtt.connect(conn.source.replace(/^http/, 'ws') + '/mqtt', {
    clientId: 'weg-replica-' + Math.random().toString(16).slice(2, 10),
    reconnectPeriod: 5000,
    connectTimeout: 10000,
  });
  createLiveBridge({ remote, local, onStatus: (p) => { if (!stopped) setStatus(p); } });

  return {
    stop() {
      stopped = true;
      history.stop();
      remote.end(true);
      setStatus({ configured: false, source: null, live: false });
    },
  };
}

const manager = createManager({ load: () => loadConnection({ file: LINK_FILE, env: process.env }), start });
manager.tick();
setInterval(() => { try { manager.tick(); } catch (e) { console.error(`[REPLICA] ${e.message}`); } }, RELOAD_EVERY_MS);

setInterval(() => {
  if (local.connected) local.publish('weg/replica/status', JSON.stringify(statusPayload()), { qos: 0, retain: true });
}, STATUS_EVERY_MS);

http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusPayload()));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3300, '0.0.0.0');

console.log('[REPLICA] Iniciado');
```

- [ ] **Step 6: Build y smoke sin configuración**

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- sh -c 'docker build -q -t weg-replica:dev /mnt/c/dev/weg-scada/nodered/weg-replica >/dev/null && docker rm -f rep-smoke >/dev/null 2>&1; docker run -d --name rep-smoke weg-replica:dev >/dev/null; sleep 4; docker logs rep-smoke 2>&1 | tail -3; docker exec rep-smoke wget -qO- http://127.0.0.1:3300/health; echo; docker rm -f rep-smoke >/dev/null'
```
Expected: `[REPLICA] Sin configurar: esperando el código de enlace desde Configuración` y health con `"configured":false`; el contenedor NO termina.

- [ ] **Step 7: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-replica/src nodered/weg-replica/test && git commit -q -F - <<'EOF'
feat(conexion): weg-replica lee la conexion de config/replica.json y se reconfigura en caliente

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Frontend — pestañas Conexión y Réplicas, badge con atraso

**Files:**
- Modify: `frontend-react/package.json` / `package-lock.json` (dep `qrcode`, dev `@types/qrcode`)
- Create: `frontend-react/src/lib/api.ts`
- Create: `frontend-react/src/views/ConexionTab.tsx`
- Create: `frontend-react/src/views/ReplicasTab.tsx`
- Modify: `frontend-react/src/views/Config.tsx` (tabs)
- Modify: `frontend-react/src/components/ReplicaBadge.tsx` (lagSec)

**Interfaces:**
- Consumes: `/api/system/tailscale*` (Task 5), `/api/replicas*` (Task 3), `/api/replica-link*` (Task 4), `useServerStore().replica`.

- [ ] **Step 1: Dependencias**

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker run --rm -v /mnt/c/dev/weg-scada/frontend-react:/app -w /app node:20-alpine sh -c "npm install --no-audit --no-fund --loglevel=error qrcode@^1.5.4 && npm install --no-audit --no-fund --loglevel=error -D @types/qrcode@^1.5.5"
```
Expected: `package.json` con `qrcode` en dependencies y `@types/qrcode` en devDependencies.

- [ ] **Step 2: `frontend-react/src/lib/api.ts`**

```ts
import { authFetch } from '../store/auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'

// JSON autenticado; lanza Error con el mensaje del backend si no es 2xx
export async function apiJson<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const r = await authFetch(`${API_BASE}${path}`, { ...init, headers })
  const d = await r.json().catch(() => null)
  if (!r.ok) throw new Error(d?.error || `HTTP ${r.status}`)
  return d as T
}
```

- [ ] **Step 3: `frontend-react/src/views/ConexionTab.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { apiJson } from '../lib/api'
import { useServerStore } from '../store/server'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Loader2, Link2, Unlink, PlugZap, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

type TsStatus = { state: string; tailnet: string | null; user: string | null; ip: string | null; hostname: string | null; authUrl: string | null }

const TS_LABEL: Record<string, { text: string; cls: string }> = {
  Running: { text: 'Conectado', cls: 'bg-green-500/15 text-green-700 dark:text-green-300' },
  NeedsLogin: { text: 'Esperando login', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  Stopped: { text: 'Detenido', cls: 'bg-muted text-muted-foreground' },
  NoState: { text: 'Iniciando', cls: 'bg-muted text-muted-foreground' },
  Unavailable: { text: 'No disponible', cls: 'bg-muted text-muted-foreground' },
}

function TailscaleCard({ replica }: { replica: boolean }) {
  const [st, setSt] = useState<TsStatus | null>(null)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [hostname, setHostname] = useState('')
  const [qr, setQr] = useState('')

  async function load() {
    try { const s = await apiJson<TsStatus>('/system/tailscale'); setSt(s); setErr('') }
    catch (e: any) { setErr(e.message) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => { if (st?.hostname && !hostname) setHostname(st.hostname) }, [st?.hostname])

  // Login pendiente: refrescar cada 3 s hasta que quede conectado
  const pending = !!st && st.state !== 'Running' && !!st.authUrl
  useEffect(() => {
    if (!pending) return
    const id = setInterval(load, 3000)
    return () => clearInterval(id)
  }, [pending])

  useEffect(() => {
    if (!st?.authUrl) { setQr(''); return }
    QRCode.toDataURL(st.authUrl, { width: 180, margin: 1 }).then(setQr).catch(() => setQr(''))
  }, [st?.authUrl])

  async function connect() {
    setBusy(true)
    try {
      const h = (hostname || st?.hostname || (replica ? 'weg-replica' : 'weg-planta')).trim().toLowerCase()
      setSt(await apiJson<TsStatus>('/system/tailscale/login', { method: 'POST', body: JSON.stringify({ hostname: h }) }))
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  async function disconnect() {
    const extra = replica ? '' : '\n\nEsto corta las réplicas y el acceso remoto a la planta.'
    if (!confirm(`¿Desconectar este servidor de Tailscale?${extra}`)) return
    if (!confirm('Confirmá de nuevo: se desconecta de Tailscale.')) return
    setBusy(true)
    try { setSt(await apiJson<TsStatus>('/system/tailscale/logout', { method: 'POST' })); toast.success('Desconectado de Tailscale') }
    catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  const label = TS_LABEL[st?.state || ''] || { text: st?.state || '…', cls: 'bg-muted text-muted-foreground' }

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <PlugZap className="h-4 w-4 text-primary" />
        <div className="font-semibold">Tailscale</div>
        <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${label.cls}`}>{label.text}</span>
      </div>
      {err && <div className="text-sm text-destructive">{err}</div>}
      {st?.state === 'Running' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Tailnet: </span><strong>{st.tailnet || '—'}</strong></div>
          <div><span className="text-muted-foreground">IP: </span><span className="font-mono">{st.ip || '—'}</span></div>
          <div><span className="text-muted-foreground">Nombre: </span>{st.hostname || '—'}</div>
          <div><span className="text-muted-foreground">Cuenta: </span>{st.user || '—'}</div>
        </div>
      )}
      {st && st.state !== 'Running' && st.state !== 'Unavailable' && (
        <div className="space-y-3">
          {!st.authUrl && (
            <div className="flex items-end gap-2">
              <div className="flex-1"><Label>Nombre del equipo en Tailscale</Label><Input value={hostname} onChange={e => setHostname(e.target.value)} placeholder={replica ? 'weg-replica' : 'weg-planta'} /></div>
              <Button size="sm" disabled={busy} onClick={connect}>{busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Link2 className="h-3.5 w-3.5 mr-1" />}Conectar</Button>
            </div>
          )}
          {st.authUrl && (
            <div className="flex flex-wrap items-center gap-4">
              {qr && <img src={qr} alt="QR de login de Tailscale" className="rounded-md border bg-white p-1" />}
              <div className="space-y-2 text-sm min-w-0">
                <p>Abrí el link (o escaneá el QR) e iniciá sesión con la cuenta del tailnet correcto.</p>
                <a href={st.authUrl} target="_blank" rel="noreferrer" className="break-all text-primary underline">{st.authUrl}</a>
                <p className="text-xs text-muted-foreground flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" />Esperando la aprobación…</p>
              </div>
            </div>
          )}
        </div>
      )}
      {st?.state === 'Unavailable' && <p className="text-sm text-muted-foreground">Tailscale no está instalado en este servidor.</p>}
      {st?.state === 'Running' && (
        <div className="flex justify-end"><Button size="sm" variant="outline" disabled={busy} onClick={disconnect}><Unlink className="h-3.5 w-3.5 mr-1" />Desconectar</Button></div>
      )}
    </Card>
  )
}

type LinkInfo = { configured: boolean; fromEnv?: boolean; source?: string; name?: string; pairedAt?: string | null; tokenMasked?: string | null }
type SyncStatus = { configured: boolean; source: string | null; lastSync: number | null; lagSec: number | null; live: boolean; error: string | null }
type TestResult = { ok: boolean; error?: string; name?: string; source?: string; oldest?: string | null; newest?: string | null }

function fmtLag(s: number | null) {
  if (s == null) return '—'
  if (s < 120) return `${s} s`
  if (s < 7200) return `${Math.round(s / 60)} min`
  if (s < 172800) return `${Math.round(s / 3600)} h`
  return `${Math.round(s / 86400)} días`
}

function PlantLinkCard() {
  const [link, setLink] = useState<LinkInfo | null>(null)
  const [sync, setSync] = useState<SyncStatus | null>(null)
  const [code, setCode] = useState('')
  const [test, setTest] = useState<TestResult | null>(null)
  const [busy, setBusy] = useState(false)
  const mounted = useRef(true)

  async function loadLink() { try { setLink(await apiJson<LinkInfo>('/replica-link')) } catch (e: any) { toast.error(e.message) } }
  async function loadSync() { try { const s = await apiJson<SyncStatus>('/replica-link/status'); if (mounted.current) setSync(s) } catch { if (mounted.current) setSync(null) } }
  useEffect(() => {
    mounted.current = true
    loadLink(); loadSync()
    const id = setInterval(loadSync, 5000)
    return () => { mounted.current = false; clearInterval(id) }
  }, [])

  async function doTest() {
    setBusy(true)
    try { setTest(await apiJson<TestResult>('/replica-link/test', { method: 'POST', body: JSON.stringify({ code }) })) }
    catch (e: any) { setTest({ ok: false, error: e.message }) }
    finally { setBusy(false) }
  }

  async function save() {
    if (link?.configured && test?.source && link.source !== test.source &&
        !confirm(`Este código es de otra planta (${test.source}). El histórico nuevo se va a mezclar con el anterior. ¿Continuar?`)) return
    setBusy(true)
    try {
      await apiJson('/replica-link', { method: 'PUT', body: JSON.stringify({ code }) })
      toast.success('Conectado a planta. La sincronización arranca en unos segundos.')
      setCode(''); setTest(null); loadLink()
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  async function unlink() {
    if (!confirm('¿Desvincular de planta? Se corta la sincronización; el histórico copiado queda.')) return
    try { await apiJson('/replica-link', { method: 'DELETE' }); toast.success('Desvinculado'); loadLink() }
    catch (e: any) { toast.error(e.message) }
  }

  const ago = sync?.lastSync ? Math.max(0, Math.round((Date.now() - sync.lastSync) / 1000)) : null

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Link2 className="h-4 w-4 text-primary" />
        <div className="font-semibold">Planta</div>
        {link?.configured
          ? <Badge variant="secondary" className="ml-auto">{link.fromEnv ? 'Enlazada por .env' : `Enlazada: ${link.name}`}</Badge>
          : <Badge variant="outline" className="ml-auto">Sin enlazar</Badge>}
      </div>
      {link?.configured && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Dirección: </span><span className="font-mono">{link.source}</span></div>
          <div><span className="text-muted-foreground">Token: </span><span className="font-mono">{link.tokenMasked}</span></div>
          <div><span className="text-muted-foreground">En vivo: </span>{sync?.live ? 'conectado' : 'desconectado'}</div>
          <div><span className="text-muted-foreground">Última sync: </span>{ago == null ? '—' : `hace ${fmtLag(ago)}`}</div>
          <div><span className="text-muted-foreground">Atraso: </span>{fmtLag(sync?.lagSec ?? null)}</div>
          {sync?.error && <div className="sm:col-span-2 text-destructive">Último error: {sync.error}</div>}
        </div>
      )}
      <div className="space-y-2">
        <Label>{link?.configured ? 'Cambiar código de enlace' : 'Código de enlace (se genera en la planta, Configuración → Réplicas)'}</Label>
        <textarea value={code} onChange={e => { setCode(e.target.value); setTest(null) }} rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono" placeholder="WEGR1-…" />
        {test && (test.ok
          ? <div className="text-sm text-green-700 dark:text-green-300">OK: {test.name} · {test.source} · histórico desde {test.oldest ? new Date(test.oldest).toLocaleDateString() : '—'}</div>
          : <div className="text-sm text-destructive">{test.error}</div>)}
        <div className="flex justify-between">
          {link?.configured && !link.fromEnv
            ? <Button size="sm" variant="outline" onClick={unlink}><Unlink className="h-3.5 w-3.5 mr-1" />Desvincular</Button>
            : <span />}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy || !code.trim()} onClick={doTest}>Probar conexión</Button>
            <Button size="sm" disabled={busy || !test?.ok} onClick={save}>{busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}Guardar y conectar</Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

export default function ConexionTab() {
  const replica = useServerStore(s => s.replica)
  if (MODE === 'mock') return <div className="text-sm text-muted-foreground py-8 text-center">No disponible en modo demo.</div>
  return (
    <div className="space-y-4 max-w-2xl">
      <TailscaleCard replica={replica} />
      {replica && <PlantLinkCard />}
    </div>
  )
}
```

- [ ] **Step 4: `frontend-react/src/views/ReplicasTab.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { apiJson } from '../lib/api'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Plus, Copy, Ban, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

type Replica = { id: string; name: string; status: string; createdAt: string | null; lastSeenAt: string | null; lastIp: string | null; legacy?: boolean }

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : '—')

export default function ReplicasTab() {
  const [rows, setRows] = useState<Replica[]>([])
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [plantUrl, setPlantUrl] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() { try { setRows((await apiJson<{ replicas: Replica[] }>('/replicas')).replicas) } catch (e: any) { toast.error(e.message) } }
  useEffect(() => { if (MODE !== 'mock') load() }, [])

  async function openNew() {
    setName(''); setCode(''); setOpen(true)
    const port = window.location.port ? `:${window.location.port}` : ''
    setPlantUrl(`${window.location.protocol}//${window.location.hostname}${port}`)
    try {
      const ts = await apiJson<{ state: string; ip: string | null }>('/system/tailscale')
      if (ts.state === 'Running' && ts.ip) setPlantUrl(`http://${ts.ip}${port || ':80'}`)
    } catch { /* sin agente: queda la dirección actual */ }
  }

  async function create() {
    setBusy(true)
    try {
      const r = await apiJson<{ code: string }>('/replicas', { method: 'POST', body: JSON.stringify({ name, plantUrl }) })
      setCode(r.code); load()
    } catch (e: any) { toast.error(e.message) }
    finally { setBusy(false) }
  }

  async function revoke(r: Replica) {
    if (!confirm(`¿Revocar "${r.name}"? Deja de poder leer datos de la planta al instante.`)) return
    try { await apiJson(`/replicas/${r.id}`, { method: 'DELETE' }); toast.success('Réplica revocada'); load() }
    catch (e: any) { toast.error(e.message) }
  }

  if (MODE === 'mock') return <div className="text-sm text-muted-foreground py-8 text-center">No disponible en modo demo.</div>

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Servidores de solo lectura que copian los datos de esta planta.</p>
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" />Nueva réplica</Button>
      </div>
      {rows.length === 0 && <Card className="p-6 text-sm text-muted-foreground text-center">No hay réplicas.</Card>}
      {rows.map(r => (
        <Card key={r.id} className="p-4 flex flex-wrap items-center gap-3">
          <div className="min-w-0">
            <div className="font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">Última conexión: {fmt(r.lastSeenAt)}{r.lastIp ? ` · desde ${r.lastIp}` : ''}</div>
          </div>
          <Badge variant={r.status === 'revocada' ? 'outline' : 'secondary'} className="ml-auto">{r.status}</Badge>
          {!r.legacy && r.status !== 'revocada' && (
            <Button size="sm" variant="outline" onClick={() => revoke(r)}><Ban className="h-3.5 w-3.5 mr-1" />Revocar</Button>
          )}
        </Card>
      ))}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva réplica</DialogTitle></DialogHeader>
          {!code ? (
            <div className="space-y-3">
              <div><Label>Nombre</Label><Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder="Oficina Tecno" /></div>
              <div><Label>Dirección con la que la réplica llega a esta planta</Label><Input value={plantUrl} onChange={e => setPlantUrl(e.target.value)} className="font-mono" /></div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">Pegá este código en la réplica (Configuración → Conexión). <strong>Se muestra una sola vez.</strong></p>
              <textarea readOnly value={code} rows={4} className="w-full rounded-md border border-input bg-muted px-3 py-2 text-xs font-mono" />
            </div>
          )}
          <DialogFooter>
            {!code
              ? <Button size="sm" disabled={busy || !name.trim() || !plantUrl.trim()} onClick={create}>{busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}Generar código</Button>
              : <Button size="sm" onClick={() => { navigator.clipboard.writeText(code).then(() => toast.success('Código copiado'), () => toast.error('No se pudo copiar')) }}><Copy className="h-3.5 w-3.5 mr-1" />Copiar código</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
```

(`Dialog` es `DialogPrimitive.Root` de Radix: acepta `open`/`onOpenChange`. `Badge` tiene variantes `secondary` y `outline`.)

- [ ] **Step 5: Tabs en `views/Config.tsx`**

Imports:
```tsx
import ConexionTab from './ConexionTab'
import ReplicasTab from './ReplicasTab'
```
En el `TabsList`, después de `<TabsTrigger value="brand">Marca</TabsTrigger>`:
```tsx
        <TabsTrigger value="conexion">Conexión</TabsTrigger>
        {!replica && <TabsTrigger value="replicas">Réplicas</TabsTrigger>}
```
Y después de `<TabsContent value="brand"><BrandingTab /></TabsContent>`:
```tsx
      <TabsContent value="conexion"><ConexionTab /></TabsContent>
      {!replica && <TabsContent value="replicas"><ReplicasTab /></TabsContent>}
```

- [ ] **Step 6: Badge con atraso (`components/ReplicaBadge.tsx`)**

Reemplazar desde `const ago = ...` hasta el cierre de `const text = ...` por:
```tsx
  const ago = st?.lastSync ? Math.max(0, Math.round((now - st.lastSync) / 1000)) : null
  const behind = st?.lagSec != null && st.lagSec > 120
  const ok = !!st && st.live && !st.error && ago !== null && ago < 120 && !behind
  const fmt = (s: number) => (s < 7200 ? `${Math.round(s / 60)} min` : s < 172800 ? `${Math.round(s / 3600)} h` : `${Math.round(s / 86400)} días`)
  const text = ago === null
    ? 'Réplica · sin sincronizar'
    : behind
      ? `Réplica · poniéndose al día · atraso ${fmt(st!.lagSec!)}`
      : `Réplica · sincronizado hace ${ago < 60 ? `${ago} s` : `${Math.round(ago / 60)} min`}`
```
Y agregar `configured: boolean; source: string | null` opcionales a `ReplicaStatus` en `store/drives.ts`:
```ts
  configured?: boolean
  source?: string | null
```

- [ ] **Step 7: Build** — comando canónico de build. Expected: exit 0. Verificar bundle: `grep -l "Código de enlace" /c/dev/weg-scada/frontend-react/dist/assets/*.js`.

- [ ] **Step 8: Commit**

```bash
cd /c/dev/weg-scada && git add frontend-react/package.json frontend-react/package-lock.json frontend-react/src && git commit -q -F - <<'EOF'
feat(conexion): pestanas Conexion (Tailscale con QR, enlace a planta) y Replicas; badge con atraso

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Compose, `.env.example` y documentación

**Files:**
- Modify: `nodered/docker-compose.yml` (servicio `weg-agent`, env de weg-api)
- Modify: `nodered/docker-compose.replica.yml` (env de weg-api en oficina)
- Modify: `nodered/.env.example`
- Modify: `docs/replica-oficina.md`

- [ ] **Step 1: `docker-compose.yml`**

En `weg-api` → `environment`, después de `- REPLICA_TOKEN=${REPLICA_TOKEN:-}`:
```yaml
      # Agente del sistema (Tailscale desde Configuración)
      - AGENT_TOKEN=${AGENT_TOKEN:-}
      - AGENT_URL=http://weg-agent:3400
```
Agregar el servicio (después del bloque de `weg-api`):
```yaml
  ##########################################################################
  # WEG AGENT - privilegios mínimos: opera el Tailscale del sistema
  # (status/login/logout) para Configuración → Conexión. Sin puertos
  # publicados; solo weg-api lo llama, con AGENT_TOKEN.
  ##########################################################################
  weg-agent:
    build: ./weg-agent
    container_name: weg-agent
    restart: unless-stopped
    networks:
      - weg-network
    volumes:
      - /var/run/tailscale:/var/run/tailscale
    environment:
      - AGENT_TOKEN=${AGENT_TOKEN:-}
    deploy:
      resources:
        limits:
          memory: 64M
```

- [ ] **Step 2: `docker-compose.replica.yml`** — en `weg-api` → `environment`, agregar:
```yaml
      # Para mostrar la conexión heredada del .env en Configuración → Conexión
      - REPLICA_SOURCE=${REPLICA_SOURCE:-}
      - REPLICA_HEALTH_URL=http://weg-replica:3300/health
```
y en `weg-replica` → `environment` cambiar `- REPLICA_SOURCE=${REPLICA_SOURCE}` / `- REPLICA_TOKEN=${REPLICA_TOKEN}` por `${REPLICA_SOURCE:-}` / `${REPLICA_TOKEN:-}` (ahora son opcionales).

- [ ] **Step 3: `.env.example`** — al final:
```bash

# =============================================================================
# Agente del sistema (Configuración → Conexión: Tailscale desde la web)
# =============================================================================
# Secreto entre weg-api y weg-agent. Generar:
#   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AGENT_TOKEN=
```
Y en el bloque de réplica, agregar el comentario: `# Nuevo: las réplicas se enlazan desde Configuración (código de enlace); REPLICA_TOKEN/REPLICA_SOURCE quedan como método heredado.`

- [ ] **Step 4: `docs/replica-oficina.md`** — reemplazar las secciones "Planta (una vez)" y "Oficina" por:

```markdown
## Enlazar una réplica (desde la web)

1. **Planta** → Configuración → Réplicas → **Nueva réplica**: nombre + dirección con la que la réplica
   llega a la planta (se prellena con la IP de Tailscale). Copiar el **código de enlace** (se muestra
   una sola vez).
2. **Oficina** → Configuración → Conexión:
   - Tarjeta **Tailscale** → Conectar → abrir el link o escanear el QR **con la cuenta del tailnet
     correcto** (en una ventana privada si el navegador tiene otra sesión de Tailscale abierta). La
     tarjeta muestra el tailnet en el que quedó.
   - Tarjeta **Planta** → pegar el código → Probar conexión → Guardar y conectar.
3. Revocar: Planta → Réplicas → Revocar (corta el acceso al instante).

## Instalar una oficina nueva

1. VM Ubuntu 24.04 con Docker y Tailscale **instalado** (no hace falta loguearlo: se hace desde la web).
2. Copiar el repo a `~/weg-scada`; `.env` a partir de `.env.example` con secretos propios
   (`INFLUXDB_*`, `AUTH_PASSWORD_HASH`, `OPERADOR_PASSWORD_HASH`, `AGENT_TOKEN`) e
   `INFLUXDB_ORG=tecnoelectric`, `INFLUXDB_BUCKET=weg_drives`.
3. `mkdir -p nodered/config && sudo chown -R 1001:65533 nodered/config`
4. Frontend de producción en `frontend-react/dist`.
5. `docker compose -f docker-compose.yml -f docker-compose.replica.yml up -d --build`
6. Entrar como admin y enlazar desde Configuración → Conexión.

Heredado: `REPLICA_SOURCE`/`REPLICA_TOKEN` en el `.env` siguen funcionando si no hay enlace guardado.
```

- [ ] **Step 5: Verificar compose**

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c "cd /mnt/c/dev/weg-scada/nodered && docker compose config --services 2>/dev/null | tr '\n' ' '; echo; docker compose -f docker-compose.yml -f docker-compose.replica.yml config --services 2>/dev/null | tr '\n' ' '"
```
Expected: planta con `weg-agent` y `modbus-poller`; réplica con `weg-agent` y `weg-replica`, sin `modbus-poller`.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/docker-compose.yml nodered/docker-compose.replica.yml nodered/.env.example docs/replica-oficina.md && git commit -q -F - <<'EOF'
feat(conexion): servicio weg-agent en compose, AGENT_TOKEN y guia de enlace desde la web

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 10: E2E local (WSL)

- [ ] **Step 1: Planta local** — agregar al `.env` local `AGENT_TOKEN=e2e-agent` (líneas marcadas `# e2e local`), `docker compose up -d --build weg-api weg-agent` y recargar nginx. Verificar con admin (credenciales del `.env` local, sin mostrarlas): `GET /api/system/tailscale` → `state: Running` (tailnet de WSL; **no** llamar login/logout). `POST /api/replicas` → código `WEGR1-…`. `GET /api/replicas` → la réplica, sin el código.
- [ ] **Step 2: Oficina descartable** — red `weg-office`, `office-influx`, `office-mosquitto` (como en la E2E anterior), `office-replica` (imagen nueva, SIN `REPLICA_SOURCE`/`TOKEN`, volumen `/tmp/office-config`) y `office-api` (imagen `nodered-weg-api`, `REPLICA_MODE=1`, `CONFIG_PATH=/app/config/config.json` con el mismo volumen, `AUTH_USER=admin`, `AUTH_PASSWORD=office-e2e`, `REPLICA_HEALTH_URL=http://office-replica:3300/health`, `INFLUXDB_TOKEN=office-token`, `MQTT_BROKER=mqtt://office-mosquitto:1883`, puerto `127.0.0.1:3299:3200`).
  Expected: `office-api` arranca sin `config.json` (log del esqueleto), `office-replica` en "Sin configurar".
- [ ] **Step 3: Enlazar vía API** — login admin en `office-api` → `POST /api/replica-link/test {code}` (ok) → `PUT /api/replica-link {code}` → dentro de 20 s `office-replica` loguea `Conexión: http://<wslip>:9090 (file)`; `/api/replica-link/status` → `configured: true`, luego `lagSec` < 120; conteos iguales (script `e2e-check.sh`).
- [ ] **Step 4: Revocar** — en planta `DELETE /api/replicas/<id>` → en ≤ 30 s `office-replica` status `error` con 401; `POST /api/replica-link/test` → "La planta rechazó el código (revocado o inválido)".
- [ ] **Step 5: UI** — con el navegador integrado en `http://127.0.0.1:9090` (planta local): pestañas Conexión (tarjeta Tailscale en `Conectado`, sin tocar botones) y Réplicas (lista con la revocada). Inyectar token de sesión por `sessionStorage` si el panel no dibuja (como en la E2E anterior).
- [ ] **Step 6: Limpieza** — borrar contenedores/red de oficina, `/tmp/office-config`, réplicas de prueba (`config/replicas.json` local), líneas `# e2e local` del `.env`; `docker compose up -d weg-api`.

---

### Task 11: Despliegue (requiere OK del usuario)

- [ ] **Step 1:** Push de `feat/conexion-ui` y PR contra `master` (depende de #54; indicar en la descripción).
- [ ] **Step 2 (PEDIR OK): Planta** — backup de `weg-api/src`, compose y `.env`; verificar que la VM coincide con `feat/replica-branding` HEAD (salvo CRLF); subir `weg-api/src`, `weg-agent/`, compose; generar `AGENT_TOKEN` en `.env` (sin mostrarlo); `docker compose up -d --build weg-api weg-agent`; frontend in-place. Verificar: `GET /api/system/tailscale` (admin) → `Running`, tailnet `pmeagriplus@gmail.com`, IP 100.97.47.25; Réplicas lista la "Réplica heredada (.env)".
- [ ] **Step 3 (PEDIR OK): Oficina** — mismo procedimiento con el override de réplica (+ `weg-replica` nuevo). Verificar: Conexión → Tailscale `Running` en `walc72@gmail.com`; Planta "Enlazada por .env"; sync sigue.
- [ ] **Step 4 (con el usuario):** migrar la oficina a código: crear réplica "Oficina Tecno" en planta, pegar en oficina, confirmar sync; recién entonces ofrecer quitar `REPLICA_TOKEN` del `.env` de planta y de oficina.
