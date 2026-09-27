# Réplica de oficina + Branding configurable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un servidor de oficina que replica en solo-lectura el SCADA de planta (en vivo + histórico real) vía una API de réplica pull, y branding (logo/nombre/subtítulo, logo en PDF) configurable por servidor.

**Architecture:** La `weg-api` de planta expone `/api/replica/*` (token propio) que sirve config, datos manuales y el histórico de InfluxDB en line protocol por ventanas de tiempo. En la oficina, un servicio nuevo `weg-replica` reemplaza al poller Modbus: tira del histórico (cursor persistido), puentea MQTT planta→local y sincroniza config/manual; la `weg-api` de oficina corre en `REPLICA_MODE` (rechaza escrituras de config). El branding vive en `config/branding.json` + archivo de logo, expuesto por `/api/branding` (GET público, PUT/DELETE admin).

**Tech Stack:** Node 20 (Express 4, `node:test` built-in, `mqtt` 5), InfluxDB 2.7 (Flux, CSV anotado, line protocol), Mosquitto 2, React 18 + Vite + Zustand + Tailwind, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-27-replica-branding-design.md`

## Global Constraints

- Repo: `C:\dev\weg-scada` (NO la copia vieja en OneDrive). Rama: `feat/replica-branding`.
- Esta máquina NO tiene Node ni Docker en Windows. Todo test/build corre en WSL con `node:20-alpine`.
  Comando canónico de tests de un paquete backend (desde Git Bash; `<pkg>` = `weg-api` o `weg-replica`):
  ```bash
  MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker run --rm -v /mnt/c/dev/weg-scada/nodered/<pkg>:/app -w /app node:20-alpine sh -c "npm install --no-audit --no-fund --loglevel=error && node --test test/"
  ```
  Build del frontend (NUNCA con pipe `| tail`: se traga el exit code de `tsc`):
  ```bash
  MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker run --rm -v /mnt/c/dev/weg-scada/frontend-react:/app -w /app -e VITE_DATA_MODE=live node:20-alpine sh -c "(npm ci || npm install) && npm run build"
  ```
- weg-api: **sin dependencias nuevas** (tests con `node:test` + `fetch` global de Node 20).
- weg-replica: única dependencia `mqtt@^5.10.0`. Dockerfile non-root uid 1001 (igual que el poller).
- Textos de UI en español rioplatense. Strings exactos:
  - 409 réplica: `Servidor réplica — los cambios se hacen en planta`
  - Nombre por defecto: `Planta de Bombeo`
  - Subtítulo por defecto: `Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.`
  - "Powered by Tecno Electric S.A." queda fijo.
- Logo: solo PNG o JPG (validado por magic bytes), máx. 1 MB (1048576 bytes).
- `REPLICA_TOKEN` vacío/ausente → `/api/replica/*` responde 404 (función apagada por defecto).
- `/points`: `windowSec` default 3600, máx 86400; `stop = min(since + windowSec, now − 10s)`.
- Headers de `/points`: `X-Next-Cursor` (ISO), `X-More` (`1`|`0`).
- Topic de estado de réplica: `weg/replica/status` (retain) con `{ lastSync, lagSec, live, error }`.
- Commits: mensajes sin comillas dobles; terminar con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Cualquier acción sobre la VM de planta (100.97.47.25) o sobre Proxmox requiere OK explícito del usuario en el momento.**

## Review Focus

1. **Nombres de equipo con espacios, `#`, comas o `=`** (`PM8000 #2`, `SAER 8`, `BRO7, BANCO`) → deben viajar escapados en line protocol y llegar idénticos a la oficina. Test en Task 1 (`escapes tag values with spaces, commas and equals`).
2. **Mismo nombre de campo con distinto tipo entre measurements** (`voltage` es `long` en `drive_data` y `double` en `meter_data`) → cada línea conserva el tipo de su tabla; Influx de oficina no debe rechazar la escritura por conflicto de tipo. Test en Task 1 (`keeps per-table field types`).
3. **Oficina apagada varios días (backlog grande)** → al volver, encadena ventanas sin esperar (`X-More: 1`) hasta ponerse al día y recién ahí pasa a esperar 30 s; el cursor avanza monótono. Test en Task 5 (`run catches up a backlog without idle waits`).
4. **Archivo que no es imagen renombrado a `.png`** (GIF, SVG, texto) → rechazado con `Formato no soportado (solo PNG o JPG)` aunque el MIME/extensión digan png. Test en Task 4 (`rejects non-image bytes even if declared as png`).
5. **Admin de la oficina intenta editar equipos/setpoints/lluvia** → 409 con mensaje claro (no se guarda para ser pisado 5 min después). Test en Task 3 (`blocks config, setpoints, manual writes`).

---

### Task 1: Conversión CSV anotado de Influx → line protocol (weg-api)

**Files:**
- Create: `nodered/weg-api/src/services/lineProtocol.js`
- Create: `nodered/weg-api/test/lineProtocol.test.js`
- Modify: `nodered/weg-api/package.json` (script `test`)

**Interfaces:**
- Produces:
  - `splitCsvLine(line: string): string[]`
  - `rfc3339ToNs(s: string): string` (ns desde epoch, como string decimal)
  - `parseAnnotatedCsv(csv: string): Array<{ measurement, tags: Record<string,string>, field, type, value: string, time: string /*ns*/ }>` — lanza si el CSV trae columna `error`.
  - `toLineProtocol(rows): string` — líneas unidas por `\n`, ordenadas por tiempo, campos del mismo punto fusionados.
  - `csvColumn(csv: string, name: string): string[]` — valores de una columna en todas las tablas.

- [ ] **Step 1: Agregar script de test a `nodered/weg-api/package.json`**

Reemplazar el bloque `scripts` por:
```json
  "scripts": {
    "start": "node src/server.js",
    "dev": "node --watch src/server.js",
    "test": "node --test test/"
  },
```

- [ ] **Step 2: Escribir los tests que fallan** — `nodered/weg-api/test/lineProtocol.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCsvLine, rfc3339ToNs, parseAnnotatedCsv, toLineProtocol, csvColumn } = require('../src/services/lineProtocol');

// Arma un bloque de CSV anotado (una "tabla" de Influx) con la forma real de /api/v2/query
function table(valueType, tagCols, rows) {
  const cols = ['', 'result', 'table', '_start', '_stop', '_time', '_value', '_field', '_measurement', ...tagCols];
  const types = ['#datatype', 'string', 'long', 'dateTime:RFC3339', 'dateTime:RFC3339', 'dateTime:RFC3339', valueType, 'string', 'string', ...tagCols.map(() => 'string')];
  const lines = [types.join(','), cols.join(',')];
  for (const r of rows) {
    lines.push(['', '_result', '0', '2026-09-27T00:00:00Z', '2026-09-27T01:00:00Z', r.time, r.value, r.field, r.m, ...tagCols.map(t => r.tags[t])].join(','));
  }
  return lines.join('\r\n');
}

const T1 = '2026-09-27T00:00:10Z';
const T2 = '2026-09-27T00:00:20.5Z';
const ns = (iso, frac = 0n) => String(BigInt(Date.parse(iso)) * 1000000n + frac);
const DRIVE_TAGS = ['index', 'ip', 'name', 'site', 'type'];
const saer8 = { index: '1', ip: '192.168.10.40', name: 'SAER 8', site: 'Agriplus', type: 'SSW900' };

test('splitCsvLine handles quoted commas and escaped quotes', () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
  assert.deepEqual(splitCsvLine('"x ""y"" z",'), ['x "y" z', '']);
});

test('rfc3339ToNs keeps sub-second precision', () => {
  assert.equal(rfc3339ToNs('2026-09-27T00:00:10Z'), ns('2026-09-27T00:00:10Z'));
  assert.equal(rfc3339ToNs('2026-09-27T00:00:20.5Z'), ns('2026-09-27T00:00:20Z', 500000000n));
  assert.equal(rfc3339ToNs('2026-09-27T00:00:20.123456789Z'), ns('2026-09-27T00:00:20Z', 123456789n));
  assert.throws(() => rfc3339ToNs('ayer'));
});

test('merges fields of the same point, keeps types, sorts by time', () => {
  const csv = [
    table('double', DRIVE_TAGS, [
      { time: T2, value: '13.25', field: 'current', m: 'drive_data', tags: saer8 },
      { time: T1, value: '12.5', field: 'current', m: 'drive_data', tags: saer8 },
    ]),
    '',
    table('long', DRIVE_TAGS, [{ time: T1, value: '1780', field: 'motor_speed', m: 'drive_data', tags: saer8 }]),
    '',
    table('boolean', DRIVE_TAGS, [{ time: T1, value: 'true', field: 'running', m: 'drive_data', tags: saer8 }]),
  ].join('\r\n');
  const lp = toLineProtocol(parseAnnotatedCsv(csv));
  assert.equal(lp, [
    `drive_data,index=1,ip=192.168.10.40,name=SAER\\ 8,site=Agriplus,type=SSW900 current=12.5,motor_speed=1780i,running=true ${ns(T1)}`,
    `drive_data,index=1,ip=192.168.10.40,name=SAER\\ 8,site=Agriplus,type=SSW900 current=13.25 ${ns('2026-09-27T00:00:20Z', 500000000n)}`,
  ].join('\n'));
});

test('keeps per-table field types (voltage long in drives, double in meters)', () => {
  const csv = [
    table('long', DRIVE_TAGS, [{ time: T1, value: '380', field: 'voltage', m: 'drive_data', tags: saer8 }]),
    '',
    table('double', ['ip', 'name', 'type'], [{ time: T1, value: '13200.75', field: 'voltage', m: 'meter_data', tags: { ip: '192.168.10.20', name: 'PM8000 #3', type: 'PM8000' } }]),
  ].join('\n');
  const lines = toLineProtocol(parseAnnotatedCsv(csv)).split('\n');
  assert.ok(lines.some(l => l.startsWith('drive_data,') && l.includes(' voltage=380i ')));
  assert.ok(lines.some(l => l.startsWith('meter_data,') && l.includes(' voltage=13200.75 ')));
});

test('escapes tag values with spaces, commas and equals', () => {
  const tags = { ip: '192.168.3.208', name: '"BRO7, BANCO=1"', type: 'PM8000' };
  const csv = table('double', ['ip', 'name', 'type'], [{ time: T1, value: '1', field: 'pf', m: 'meter_data', tags }]);
  assert.equal(toLineProtocol(parseAnnotatedCsv(csv)), `meter_data,ip=192.168.3.208,name=BRO7\\,\\ BANCO\\=1,type=PM8000 pf=1 ${ns(T1)}`);
});

test('string fields are quoted and escaped; non-finite doubles are dropped', () => {
  const csv = [
    table('string', ['name'], [{ time: T1, value: '"fallo ""F48"""', field: 'fault_text', m: 'drive_data', tags: { name: 'x' } }]),
    '',
    table('double', ['name'], [{ time: T1, value: 'NaN', field: 'torque', m: 'drive_data', tags: { name: 'x' } }]),
  ].join('\n');
  assert.equal(toLineProtocol(parseAnnotatedCsv(csv)), `drive_data,name=x fault_text="fallo \\"F48\\"" ${ns(T1)}`);
});

test('empty result gives empty string', () => {
  assert.equal(toLineProtocol(parseAnnotatedCsv('')), '');
  assert.equal(toLineProtocol(parseAnnotatedCsv('\r\n')), '');
});

test('influx error table throws', () => {
  const csv = '#datatype,string,string\n,error,reference\n,bucket not found,';
  assert.throws(() => parseAnnotatedCsv(csv), /bucket not found/);
});

test('csvColumn reads a column across tables', () => {
  const csv = '#datatype,string,long,dateTime:RFC3339\n,result,table,_time\n,_result,0,2026-09-08T10:00:00Z\n';
  assert.deepEqual(csvColumn(csv, '_time'), ['2026-09-08T10:00:00Z']);
  assert.deepEqual(csvColumn('', '_time'), []);
});
```

- [ ] **Step 3: Correr los tests y verificar que fallan**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: FAIL — `Cannot find module '../src/services/lineProtocol'`.

- [ ] **Step 4: Implementar** — `nodered/weg-api/src/services/lineProtocol.js`

```js
'use strict';

// Conversión de la respuesta CSV anotada de InfluxDB (/api/v2/query con
// dialect.annotations=["datatype"]) a line protocol, SIN pérdida: respeta el
// tipo de cada campo según la tabla (double / long / boolean / string) y el
// timestamp en ns. Lo usa la API de réplica para servir el histórico tal cual.

const NON_TAG_COLS = new Set(['', 'result', 'table', '_start', '_stop', '_time', '_value', '_field', '_measurement']);

// Divide una línea CSV respetando comillas RFC 4180 ("a,b" y "" escapado)
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// "2026-09-27T00:00:20.5Z" -> "1790467220500000000" (ns, string para no perder precisión)
function rfc3339ToNs(s) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(String(s));
  if (!m) throw new Error(`timestamp inválido: ${s}`);
  const sec = BigInt(Date.parse(m[1] + 'Z') / 1000);
  const frac = BigInt((m[2] || '').padEnd(9, '0'));
  return (sec * 1000000000n + frac).toString();
}

// Recorre las tablas del CSV anotado: llama onRow(obj, datatypes, header) por fila
function eachRow(csv, onRow) {
  let datatypes = null;
  let header = null;
  for (const raw of String(csv).split(/\r?\n/)) {
    if (raw.startsWith('#datatype')) { datatypes = splitCsvLine(raw); header = null; continue; }
    if (raw.startsWith('#')) continue;
    if (raw.trim() === '') { header = null; continue; }
    const cols = splitCsvLine(raw);
    if (!header) {
      header = cols;
      continue;
    }
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
    if (header.includes('error')) throw new Error(`InfluxDB: ${obj.error}`);
    onRow(obj, datatypes, header);
  }
}

function parseAnnotatedCsv(csv) {
  const rows = [];
  eachRow(csv, (obj, datatypes, header) => {
    const type = datatypes ? datatypes[header.indexOf('_value')] : 'double';
    const tags = {};
    for (const h of header) {
      if (!NON_TAG_COLS.has(h) && obj[h] !== '') tags[h] = obj[h];
    }
    rows.push({
      measurement: obj._measurement,
      tags,
      field: obj._field,
      type,
      value: obj._value,
      time: rfc3339ToNs(obj._time),
    });
  });
  return rows;
}

function csvColumn(csv, name) {
  const out = [];
  eachRow(csv, (obj) => { if (obj[name] !== undefined && obj[name] !== '') out.push(obj[name]); });
  return out;
}

const escMeasurement = (s) => String(s).replace(/[, ]/g, (c) => '\\' + c);
const escKey = (s) => String(s).replace(/[,= ]/g, (c) => '\\' + c);

// Valor de campo en line protocol según el tipo de Influx; null = descartar
function fieldValue(type, raw) {
  switch (type) {
    case 'long': return `${raw}i`;
    case 'unsignedLong': return `${raw}u`;
    case 'boolean': return raw === 'true' ? 'true' : 'false';
    case 'string': return `"${String(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    default: {
      const n = Number(raw);
      return raw !== '' && Number.isFinite(n) ? raw : null;
    }
  }
}

function toLineProtocol(rows) {
  const points = new Map(); // key -> { head, time, fields: [] }
  for (const r of rows) {
    const v = fieldValue(r.type, r.value);
    if (v === null) continue;
    const tagStr = Object.keys(r.tags).sort().map(k => `,${escKey(k)}=${escKey(r.tags[k])}`).join('');
    const head = escMeasurement(r.measurement) + tagStr;
    const key = `${head} ${r.time}`;
    let p = points.get(key);
    if (!p) { p = { head, time: r.time, fields: [] }; points.set(key, p); }
    p.fields.push(`${escKey(r.field)}=${v}`);
  }
  return [...points.values()]
    .sort((a, b) => (BigInt(a.time) < BigInt(b.time) ? -1 : BigInt(a.time) > BigInt(b.time) ? 1 : 0))
    .map(p => `${p.head} ${p.fields.join(',')} ${p.time}`)
    .join('\n');
}

module.exports = { splitCsvLine, rfc3339ToNs, parseAnnotatedCsv, toLineProtocol, csvColumn };
```

Nota: el `sort` de JS es estable, así que dos puntos con el mismo tiempo conservan el orden de aparición (el test del Step 2 depende de eso para `current` antes que `motor_speed`: el orden de campos es el de aparición en el CSV).

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api/package.json nodered/weg-api/src/services/lineProtocol.js nodered/weg-api/test/lineProtocol.test.js && git commit -F - <<'EOF'
feat(replica): conversion CSV anotado de Influx a line protocol sin perdida

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: API de réplica `/api/replica/*` (weg-api, planta)

**Files:**
- Create: `nodered/weg-api/src/services/influxRaw.js`
- Create: `nodered/weg-api/src/routes/replica.js`
- Create: `nodered/weg-api/test/replica.test.js`
- Modify: `nodered/weg-api/src/services/manual.js` (exportar `readAll`)
- Modify: `nodered/weg-api/src/server.js` (montar antes de `requireAuth`)
- Modify: `nodered/docker-compose.yml` (env `REPLICA_TOKEN` en weg-api)
- Modify: `nodered/.env.example` (documentar `REPLICA_TOKEN`)

**Interfaces:**
- Consumes (Task 1): `parseAnnotatedCsv`, `toLineProtocol`, `csvColumn` de `services/lineProtocol`.
- Produces:
  - `createReplicaRouter({ token, queryCsv, bucket, getConfig, getManual, now?, version? }): express.Router`
    - `queryCsv(flux: string): Promise<string>` (CSV anotado crudo)
    - `bucket(): string`, `getConfig(): object|null`, `getManual(): object`, `now(): number` (ms)
  - HTTP (consumido por Task 5):
    - `GET /api/replica/info` → `{ version, bucket, oldest: string|null, newest: string|null }`
    - `GET /api/replica/config` → JSON (sin `influxdb.token`)
    - `GET /api/replica/manual` → JSON
    - `GET /api/replica/points?since=<ISO>&windowSec=<n>` → `text/plain` + `X-Next-Cursor`, `X-More`
  - `influxRaw.queryAnnotatedCsv(flux, timeoutMs?)`, `influxRaw.bucket()`
  - `manual.readAll(): object`

- [ ] **Step 1: Escribir los tests que fallan** — `nodered/weg-api/test/replica.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createReplicaRouter = require('../src/routes/replica');

const NOW = Date.parse('2026-09-27T12:00:00Z');
const TOKEN = 'tok-123';
const CSV_POINT = [
  '#datatype,string,long,dateTime:RFC3339,dateTime:RFC3339,dateTime:RFC3339,double,string,string,string',
  ',result,table,_start,_stop,_time,_value,_field,_measurement,name',
  ',_result,0,2026-09-27T10:00:00Z,2026-09-27T11:00:00Z,2026-09-27T10:00:10Z,12.5,current,drive_data,SAER 8',
].join('\n');

async function serve(opts = {}) {
  const calls = [];
  const deps = {
    token: TOKEN,
    queryCsv: async (flux) => {
      calls.push(flux);
      if (flux.includes('min(column')) return '#datatype,string,long,dateTime:RFC3339\n,result,table,_time\n,_result,0,2026-09-08T10:00:00Z\n';
      if (flux.includes('max(column')) return '#datatype,string,long,dateTime:RFC3339\n,result,table,_time\n,_result,0,2026-09-27T11:59:50Z\n';
      return CSV_POINT;
    },
    bucket: () => 'weg_drives',
    getConfig: () => ({ devices: [{ name: 'SAER 8' }], influxdb: { url: 'http://influxdb:8086', org: 'o', bucket: 'weg_drives', token: 'SECRET' } }),
    getManual: () => ({ '2026-09-26': { rainMm: 3 } }),
    now: () => NOW,
    ...opts,
  };
  const app = express();
  app.use('/api/replica', createReplicaRouter(deps));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/replica`;
  const get = (p, token = TOKEN) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { get, calls, close: () => new Promise(r => server.close(r)) };
}

test('feature off without token → 404', async () => {
  const s = await serve({ token: '' });
  try { assert.equal((await s.get('/info')).status, 404); } finally { await s.close(); }
});

test('missing or wrong token → 401, then 429 after 10 failures', async () => {
  const s = await serve();
  try {
    assert.equal((await s.get('/info', null)).status, 401);
    assert.equal((await s.get('/info', 'nope')).status, 401);
    for (let i = 0; i < 8; i++) await s.get('/info', 'nope');
    assert.equal((await s.get('/info', 'nope')).status, 429);
  } finally { await s.close(); }
});

test('/config strips influx token; /manual returns the file', async () => {
  const s = await serve();
  try {
    const cfg = await (await s.get('/config')).json();
    assert.equal(cfg.devices[0].name, 'SAER 8');
    assert.equal(cfg.influxdb.token, undefined);
    assert.equal(cfg.influxdb.org, 'o');
    assert.deepEqual(await (await s.get('/manual')).json(), { '2026-09-26': { rainMm: 3 } });
  } finally { await s.close(); }
});

test('/info returns oldest/newest', async () => {
  const s = await serve();
  try {
    const info = await (await s.get('/info')).json();
    assert.equal(info.bucket, 'weg_drives');
    assert.equal(info.oldest, '2026-09-08T10:00:00Z');
    assert.equal(info.newest, '2026-09-27T11:59:50Z');
  } finally { await s.close(); }
});

test('/points invalid since → 400', async () => {
  const s = await serve();
  try { assert.equal((await s.get('/points?since=ayer')).status, 400); } finally { await s.close(); }
});

test('/points serves one window as line protocol with cursor and more=1', async () => {
  const s = await serve();
  try {
    const r = await s.get('/points?since=2026-09-27T10:00:00.000Z&windowSec=3600');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-27T11:00:00.000Z');
    assert.equal(r.headers.get('x-more'), '1');
    assert.match(await r.text(), /^drive_data,name=SAER\\ 8 current=12.5 \d+$/);
    const flux = s.calls.at(-1);
    assert.match(flux, /start: time\(v: "2026-09-27T10:00:00.000Z"\), stop: time\(v: "2026-09-27T11:00:00.000Z"\)/);
    assert.match(flux, /r._measurement == "drive_data" or r._measurement == "meter_data"/);
  } finally { await s.close(); }
});

test('/points clamps the window to now-10s and reports more=0', async () => {
  const s = await serve();
  try {
    const r = await s.get('/points?since=2026-09-27T11:30:00.000Z&windowSec=3600');
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-27T11:59:50.000Z');
    assert.equal(r.headers.get('x-more'), '0');
  } finally { await s.close(); }
});

test('/points with since at the horizon returns empty body and same cursor', async () => {
  const s = await serve();
  try {
    const before = s.calls.length;
    const r = await s.get('/points?since=2026-09-27T11:59:55.000Z');
    assert.equal(await r.text(), '');
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-27T11:59:55.000Z');
    assert.equal(r.headers.get('x-more'), '0');
    assert.equal(s.calls.length, before); // no consulta a Influx
  } finally { await s.close(); }
});

test('/points windowSec is capped at 86400', async () => {
  const s = await serve({ now: () => Date.parse('2026-12-01T00:00:00Z') });
  try {
    const r = await s.get('/points?since=2026-09-01T00:00:00.000Z&windowSec=999999');
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-02T00:00:00.000Z');
  } finally { await s.close(); }
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: FAIL — `Cannot find module '../src/routes/replica'`.

- [ ] **Step 3: Implementar `nodered/weg-api/src/services/influxRaw.js`**

```js
'use strict';

const http = require('http');
const configService = require('./config');

// Consulta Flux devolviendo el CSV anotado CRUDO (con #datatype). No usar
// reports.queryInflux para esto: redondea los valores a 2 decimales y pierde
// el tipo de cada campo. La réplica necesita los datos exactos.
function queryAnnotatedCsv(flux, timeoutMs = 30000) {
  const cfg = configService.get();
  if (!cfg || !cfg.influxdb) return Promise.reject(new Error('No InfluxDB config'));
  const influx = cfg.influxdb;
  const url = new URL(influx.url);
  const body = JSON.stringify({
    query: flux,
    type: 'flux',
    dialect: { annotations: ['datatype'], header: true, delimiter: ',' },
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 8086,
      path: `/api/v2/query?org=${encodeURIComponent(influx.org)}`,
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.INFLUXDB_TOKEN || influx.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/csv',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 200) resolve(text);
        else reject(new Error(`InfluxDB ${res.statusCode}: ${text.substring(0, 200)}`));
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('InfluxDB query timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function bucket() {
  const cfg = configService.get();
  return (cfg && cfg.influxdb && cfg.influxdb.bucket) || 'weg_drives';
}

module.exports = { queryAnnotatedCsv, bucket };
```

- [ ] **Step 4: Implementar `nodered/weg-api/src/routes/replica.js`**

```js
'use strict';

// API de réplica (solo lectura) para el servidor de oficina. Se monta ANTES de
// requireAuth: usa su propio token (REPLICA_TOKEN), independiente del login.
// Sin REPLICA_TOKEN la función está apagada y todo responde 404.
//
// El histórico se sirve por VENTANAS de tiempo: range(start: since, stop) con
// start inclusivo y stop exclusivo; el siguiente since es el stop anterior →
// sin huecos ni solapamiento, y nunca se parte un timestamp entre páginas.

const crypto = require('crypto');
const express = require('express');
const { parseAnnotatedCsv, toLineProtocol, csvColumn } = require('../services/lineProtocol');

const MEASUREMENTS = ['drive_data', 'meter_data'];
const SAFETY_LAG_MS = 10000;      // no servir el último ciclo del poller (puede estar a medias)
const DEFAULT_WINDOW_SEC = 3600;
const MAX_WINDOW_SEC = 86400;
const MAX_FAILED = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const iso = (ms) => new Date(ms).toISOString();

// Compara hashes (mismo largo) → timingSafeEqual sin filtrar el largo del token
function tokenMatches(input, expected) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function fluxRange(bucket, start, stop) {
  const filter = MEASUREMENTS.map(m => `r._measurement == "${m}"`).join(' or ');
  return `from(bucket: ${JSON.stringify(bucket)})
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => ${filter})`;
}

function createReplicaRouter({ token, queryCsv, bucket, getConfig, getManual, now = Date.now, version = '2.0.0' }) {
  const router = express.Router();
  const failed = new Map(); // ip -> { count, firstAt }

  router.use((req, res, next) => {
    if (!token) return res.status(404).json({ error: 'No encontrado' });
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const entry = failed.get(ip);
    if (entry && Date.now() - entry.firstAt > FAIL_WINDOW_MS) failed.delete(ip);
    const cur = failed.get(ip);
    if (cur && cur.count >= MAX_FAILED) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos — reintentar en 15 minutos' });
    }
    const h = req.headers.authorization || '';
    const got = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!got || !tokenMatches(got, token)) {
      if (cur) cur.count++; else failed.set(ip, { count: 1, firstAt: Date.now() });
      console.warn(`[REPLICA] Token inválido desde ${ip}`);
      return res.status(401).json({ error: 'No autorizado' });
    }
    failed.delete(ip);
    next();
  });

  router.get('/info', async (req, res, next) => {
    try {
      const b = bucket();
      const all = fluxRange(b, '0', `time(v: "${iso(now())}")`);
      const [firstCsv, lastCsv] = await Promise.all([
        queryCsv(`${all}\n  |> first()\n  |> keep(columns: ["_time"])\n  |> group()\n  |> min(column: "_time")`),
        queryCsv(`${all}\n  |> last()\n  |> keep(columns: ["_time"])\n  |> group()\n  |> max(column: "_time")`),
      ]);
      res.json({
        version,
        bucket: b,
        oldest: csvColumn(firstCsv, '_time')[0] || null,
        newest: csvColumn(lastCsv, '_time')[0] || null,
      });
    } catch (e) { next(e); }
  });

  router.get('/config', (req, res) => {
    const cfg = JSON.parse(JSON.stringify(getConfig() || {}));
    if (cfg.influxdb) delete cfg.influxdb.token;
    res.json(cfg);
  });

  router.get('/manual', (req, res) => {
    res.json(getManual() || {});
  });

  router.get('/points', async (req, res, next) => {
    const sinceMs = Date.parse(String(req.query.since || ''));
    if (!Number.isFinite(sinceMs)) return res.status(400).json({ error: 'since inválido (ISO 8601)' });
    let win = parseInt(req.query.windowSec, 10);
    if (!Number.isFinite(win) || win <= 0) win = DEFAULT_WINDOW_SEC;
    win = Math.min(win, MAX_WINDOW_SEC);

    const horizon = now() - SAFETY_LAG_MS;
    const stopMs = Math.min(sinceMs + win * 1000, horizon);
    res.type('text/plain');
    if (stopMs <= sinceMs) {
      res.set('X-Next-Cursor', iso(sinceMs));
      res.set('X-More', '0');
      return res.send('');
    }
    try {
      const csv = await queryCsv(fluxRange(bucket(), `time(v: "${iso(sinceMs)}")`, `time(v: "${iso(stopMs)}")`));
      const lp = toLineProtocol(parseAnnotatedCsv(csv));
      res.set('X-Next-Cursor', iso(stopMs));
      res.set('X-More', stopMs < horizon ? '1' : '0');
      res.send(lp);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = createReplicaRouter;
```

- [ ] **Step 5: Exportar `readAll` en `nodered/weg-api/src/services/manual.js`**

Cambiar la última línea:
```js
module.exports = { get, getWithStatus, set, localDateStr, closeTime, MANUAL_PATH };
```
por:
```js
// Archivo completo (todas las fechas) — lo sirve la API de réplica
function readAll() { return read(); }

module.exports = { get, getWithStatus, set, readAll, localDateStr, closeTime, MANUAL_PATH };
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: PASS (Task 1 + 9 tests nuevos).

- [ ] **Step 7: Montar el router en `nodered/weg-api/src/server.js`**

Agregar a los `require` (después de `const settingsRoutes = ...`):
```js
const createReplicaRouter = require('./routes/replica');
const influxRaw = require('./services/influxRaw');
const manualService = require('./services/manual');
```
Y reemplazar:
```js
// Middleware de auth (aplica a todo /api/* excepto login/logout/health)
app.use(requireAuth);
```
por:
```js
// API de réplica para el servidor de oficina: token propio (REPLICA_TOKEN),
// por eso va ANTES de requireAuth. Sin REPLICA_TOKEN responde 404.
app.use('/api/replica', createReplicaRouter({
  token: process.env.REPLICA_TOKEN || '',
  queryCsv: influxRaw.queryAnnotatedCsv,
  bucket: influxRaw.bucket,
  getConfig: configService.get,
  getManual: manualService.readAll,
}));

// Middleware de auth (aplica a todo /api/* excepto login/logout/health)
app.use(requireAuth);
```

- [ ] **Step 8: Env en compose y `.env.example`**

En `nodered/docker-compose.yml`, servicio `weg-api`, `environment:`, debajo de `- ALLOWED_ORIGIN=${ALLOWED_ORIGIN:-*}` agregar:
```yaml
      # Réplica de oficina: token de la API /api/replica (vacío = apagada)
      - REPLICA_TOKEN=${REPLICA_TOKEN:-}
```
Al final de `nodered/.env.example` agregar:
```bash

# =============================================================================
# Réplica de oficina (API /api/replica, solo lectura)
# =============================================================================
# En PLANTA: token que usa el servidor de oficina para leer. Vacío = apagada.
# Generar:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
REPLICA_TOKEN=
# En la OFICINA (docker-compose.replica.yml): URL de planta y el mismo token.
# REPLICA_SOURCE=http://100.97.47.25:9090
```

- [ ] **Step 9: Verificar que el server arranca (smoke de sintaxis)**

Run:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker run --rm -v /mnt/c/dev/weg-scada/nodered/weg-api:/app -w /app node:20-alpine sh -c "node -e \"require('./src/routes/replica'); require('./src/services/influxRaw'); console.log('ok')\""
```
Expected: `ok`.

- [ ] **Step 10: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api nodered/docker-compose.yml nodered/.env.example && git commit -F - <<'EOF'
feat(replica): API /api/replica de solo lectura con token propio

Sirve info, config (sin token de Influx), datos manuales y el historico en
line protocol por ventanas de tiempo. Apagada si no hay REPLICA_TOKEN.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Modo réplica en weg-api (oficina)

**Files:**
- Create: `nodered/weg-api/src/middleware/replicaMode.js`
- Create: `nodered/weg-api/test/replicaMode.test.js`
- Modify: `nodered/weg-api/src/server.js`
- Modify: `nodered/weg-api/src/middleware/auth.js` (`me` devuelve `replica`)

**Interfaces:**
- Produces:
  - `isReplicaMode(): boolean` (lee `REPLICA_MODE` ∈ `1|true|yes`)
  - `replicaWriteGuard(enabled: boolean): express middleware`
  - `GET /api/me` → `{ user, role, replica: boolean }` (consumido por Task 8)

- [ ] **Step 1: Escribir los tests que fallan** — `nodered/weg-api/test/replicaMode.test.js`

```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isReplicaMode, replicaWriteGuard } = require('../src/middleware/replicaMode');

function run(guard, method, path) {
  let status = null, body = null, nexted = false;
  const res = { status(s) { status = s; return this; }, json(b) { body = b; return this; } };
  guard({ method, path }, res, () => { nexted = true; });
  return { status, body, nexted };
}

test('isReplicaMode reads REPLICA_MODE', () => {
  const prev = process.env.REPLICA_MODE;
  try {
    process.env.REPLICA_MODE = '1'; assert.equal(isReplicaMode(), true);
    process.env.REPLICA_MODE = 'true'; assert.equal(isReplicaMode(), true);
    process.env.REPLICA_MODE = ''; assert.equal(isReplicaMode(), false);
    delete process.env.REPLICA_MODE; assert.equal(isReplicaMode(), false);
  } finally { if (prev === undefined) delete process.env.REPLICA_MODE; else process.env.REPLICA_MODE = prev; }
});

test('blocks config, setpoints, manual writes with 409', () => {
  const g = replicaWriteGuard(true);
  for (const [m, p] of [['PUT', '/api/config'], ['POST', '/api/config/devices'], ['DELETE', '/api/config/devices/SAER 1'],
    ['POST', '/api/config/scan-gateway'], ['PUT', '/api/setpoints/bulk'], ['PUT', '/api/reports/manual']]) {
    const r = run(g, m, p);
    assert.equal(r.status, 409, `${m} ${p}`);
    assert.equal(r.body.error, 'Servidor réplica — los cambios se hacen en planta');
    assert.equal(r.nexted, false);
  }
});

test('lets reads and local settings through', () => {
  const g = replicaWriteGuard(true);
  for (const [m, p] of [['GET', '/api/config'], ['GET', '/api/reports/manual'], ['POST', '/api/settings/users'],
    ['POST', '/api/reports/pdf'], ['PUT', '/api/branding']]) {
    assert.equal(run(g, m, p).nexted, true, `${m} ${p}`);
  }
});

test('disabled guard lets everything through', () => {
  assert.equal(run(replicaWriteGuard(false), 'PUT', '/api/config').nexted, true);
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: FAIL — `Cannot find module '../src/middleware/replicaMode'`.

- [ ] **Step 3: Implementar** — `nodered/weg-api/src/middleware/replicaMode.js`

```js
'use strict';

// Servidor RÉPLICA (oficina): la config de equipos, los setpoints y los datos
// manuales vienen de planta y weg-replica los pisa en cada sincronización →
// se rechazan esas escrituras en vez de guardarlas para perderlas después.
// Usuarios, SMTP y branding siguen siendo locales y editables.

const WRITE_METHODS = new Set(['PUT', 'POST', 'DELETE', 'PATCH']);
const MESSAGE = 'Servidor réplica — los cambios se hacen en planta';

function isReplicaMode() {
  return ['1', 'true', 'yes'].includes(String(process.env.REPLICA_MODE || '').toLowerCase());
}

function replicaWriteGuard(enabled) {
  return (req, res, next) => {
    if (!enabled || !WRITE_METHODS.has(req.method)) return next();
    const p = req.path;
    if (p.startsWith('/api/config') || p.startsWith('/api/setpoints') || p === '/api/reports/manual') {
      return res.status(409).json({ error: MESSAGE });
    }
    next();
  };
}

module.exports = { isReplicaMode, replicaWriteGuard, MESSAGE };
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: PASS.

- [ ] **Step 5: Cablear en `server.js`**

Agregar a los `require`:
```js
const { isReplicaMode, replicaWriteGuard } = require('./middleware/replicaMode');
```
Después de `const PORT = process.env.PORT || 3200;` agregar:
```js
const REPLICA_MODE = isReplicaMode();
```
Después de `app.get('/api/me', me);` agregar:
```js

// Servidor réplica: rechaza escrituras de lo que se sincroniza desde planta
app.use(replicaWriteGuard(REPLICA_MODE));
```
En el `app.listen`, reemplazar:
```js
  // Start alert monitoring
  alertService.start();
```
por:
```js
  // Start alert monitoring (en la réplica no: las alertas salen de planta)
  if (REPLICA_MODE) console.log('[API] Modo réplica: alertas desactivadas');
  else alertService.start();
```

- [ ] **Step 6: `me` incluye `replica` en `middleware/auth.js`**

Agregar arriba (después de `const settings = require('../services/settings');`):
```js
const { isReplicaMode } = require('./replicaMode');
```
Reemplazar el cuerpo de `me`:
```js
  res.json({ user: req.auth.user, role: req.auth.role });
```
por:
```js
  res.json({ user: req.auth.user, role: req.auth.role, replica: isReplicaMode() });
```

- [ ] **Step 7: Correr toda la suite**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: PASS (todas).

- [ ] **Step 8: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api && git commit -F - <<'EOF'
feat(replica): modo replica en weg-api (409 en escrituras de planta, sin alertas)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Branding backend (servicio, rutas, logo en PDF)

**Files:**
- Create: `nodered/weg-api/src/services/branding.js`
- Create: `nodered/weg-api/src/routes/branding.js`
- Create: `nodered/weg-api/test/branding.test.js`
- Modify: `nodered/weg-api/src/middleware/auth.js` (exportar `authenticate`)
- Modify: `nodered/weg-api/src/server.js` (montar ANTES de `express.json` global)
- Modify: `nodered/weg-api/src/services/reports.js:443-464` y `:722-754` (logo configurable)

**Interfaces:**
- Produces:
  - `branding.get(): { name, subtitle, logoUrl, customLogo }` — `logoUrl` = `/api/branding/logo?v=<mtimeMs>`
  - `branding.set({ name?, subtitle?, logo?: base64|dataURL }): same as get()` — lanza `Error` con mensaje para el usuario
  - `branding.reset(): same as get()`
  - `branding.logoPath(): string` (archivo configurado o `src/agriplus.png`)
  - `authenticate(req,res,next)` en `middleware/auth.js`
  - HTTP (consumido por Task 7): `GET /api/branding`, `GET /api/branding/logo`, `PUT /api/branding` (admin), `DELETE /api/branding` (admin)

- [ ] **Step 1: Escribir los tests que fallan** — `nodered/weg-api/test/branding.test.js`

```js
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'branding-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';
process.env.OPERADOR_USER = 'operador';
process.env.OPERADOR_PASSWORD = 'op-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const branding = require('../src/services/branding');
const brandingRoutes = require('../src/routes/branding');
const { login } = require('../src/middleware/auth');

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32, 1)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 2)]);

test('defaults when nothing configured', () => {
  branding.reset();
  const b = branding.get();
  assert.equal(b.name, 'Planta de Bombeo');
  assert.equal(b.subtitle, 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.');
  assert.equal(b.customLogo, false);
  assert.match(b.logoUrl, /^\/api\/branding\/logo\?v=\d+$/);
  assert.equal(branding.logoPath(), branding.DEFAULT_LOGO);
});

test('sets name and subtitle; rejects empty name and too long text', () => {
  branding.reset();
  assert.equal(branding.set({ name: '  Demo Tecno  ', subtitle: '' }).name, 'Demo Tecno');
  assert.equal(branding.get().subtitle, '');
  assert.throws(() => branding.set({ name: '   ' }), /no puede quedar vacío/);
  assert.throws(() => branding.set({ name: 'x'.repeat(61) }), /máximo 60/);
  assert.throws(() => branding.set({ subtitle: 'x'.repeat(201) }), /máximo 200/);
});

test('accepts PNG (data URL) and then JPG, removing the previous file', () => {
  branding.reset();
  branding.set({ logo: 'data:image/png;base64,' + PNG.toString('base64') });
  assert.equal(path.basename(branding.logoPath()), 'branding-logo.png');
  assert.equal(branding.get().customLogo, true);
  branding.set({ logo: JPG.toString('base64') });
  assert.equal(path.basename(branding.logoPath()), 'branding-logo.jpg');
  assert.equal(fs.existsSync(path.join(DIR, 'branding-logo.png')), false);
});

test('rejects non-image bytes even if declared as png', () => {
  const gif = Buffer.from('GIF89a' + 'x'.repeat(30));
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
  assert.throws(() => branding.set({ logo: 'data:image/png;base64,' + gif.toString('base64') }), /Formato no soportado \(solo PNG o JPG\)/);
  assert.throws(() => branding.set({ logo: svg.toString('base64') }), /Formato no soportado/);
});

test('rejects logos over 1 MB', () => {
  const big = Buffer.concat([PNG, Buffer.alloc(1024 * 1024)]);
  assert.throws(() => branding.set({ logo: big.toString('base64') }), /supera 1 MB/);
});

test('reset restores defaults and deletes the logo file', () => {
  branding.set({ name: 'X', logo: PNG.toString('base64') });
  const b = branding.reset();
  assert.equal(b.name, 'Planta de Bombeo');
  assert.equal(b.customLogo, false);
  assert.equal(fs.existsSync(path.join(DIR, 'branding-logo.png')), false);
});

test('routes: GET public, PUT needs admin, body up to 2 MB', async () => {
  branding.reset();
  const app = express();
  app.use('/api/branding', brandingRoutes);          // antes del json global, como en server.js
  app.use(express.json({ limit: '1mb' }));
  app.post('/api/login', login);
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = async (user, password) => (await (await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }),
  })).json()).token;
  const put = (token, body) => fetch(`${base}/api/branding`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await (await fetch(`${base}/api/branding`)).json()).name, 'Planta de Bombeo');
    const logo = await fetch(`${base}/api/branding/logo`);
    assert.equal(logo.status, 200);
    assert.equal(logo.headers.get('content-type'), 'image/png');

    assert.equal((await put(null, { name: 'X' })).status, 401);
    assert.equal((await put(await tokenFor('operador', 'op-pass'), { name: 'X' })).status, 403);

    const admin = await tokenFor('admin', 'admin-pass');
    const nearlyMb = Buffer.concat([PNG, Buffer.alloc(1000 * 1024)]).toString('base64'); // ~1,37 MB de JSON
    const ok = await put(admin, { name: 'Demo', logo: nearlyMb });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).name, 'Demo');

    const bad = await put(admin, { name: '' });
    assert.equal(bad.status, 400);

    const del = await fetch(`${base}/api/branding`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } });
    assert.equal((await del.json()).name, 'Planta de Bombeo');
  } finally { await new Promise(r => server.close(r)); }
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: FAIL — `Cannot find module '../src/services/branding'`.

- [ ] **Step 3: `authenticate` en `nodered/weg-api/src/middleware/auth.js`**

Reemplazar la función `requireAuth` completa por:
```js
// Valida el Bearer token SIN excepciones de rutas públicas. Para routers que se
// montan antes de requireAuth pero tienen operaciones protegidas (branding).
function authenticate(req, res, next) {
  const token = extractToken(req);
  const auth = token && validTokens.get(token);
  if (!auth) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.auth = auth; // { role, user }
  next();
}

function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  return authenticate(req, res, next);
}
```
Y la línea de export:
```js
module.exports = { requireAuth, requireAdmin, authenticate, login, logout, me };
```

- [ ] **Step 4: Implementar `nodered/weg-api/src/services/branding.js`**

```js
'use strict';

// Marca configurable por servidor: nombre, subtítulo y logo del login/encabezado,
// y logo de los reportes PDF. Local a cada instalación (NO se replica a la
// oficina). Se guarda en branding.json + branding-logo.(png|jpg), junto a
// config.json (volumen persistente).

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const DIR = path.dirname(CONFIG_PATH);
const BRANDING_PATH = path.join(DIR, 'branding.json');
const DEFAULT_LOGO = path.join(__dirname, '..', 'agriplus.png');
const MAX_LOGO_BYTES = 1024 * 1024;
const DEFAULTS = {
  name: 'Planta de Bombeo',
  subtitle: 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.',
};

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(BRANDING_PATH, 'utf8'));
    return (j && typeof j === 'object' && !Array.isArray(j)) ? j : {};
  } catch { return {}; }
}
function write(obj) {
  const tmp = BRANDING_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, BRANDING_PATH);
}
function removeFile(name) {
  if (!name) return;
  try { fs.unlinkSync(path.join(DIR, path.basename(name))); } catch { /* ya no existe */ }
}

// Tipo real por magic bytes (no confiar en extensión/MIME declarado).
// Solo PNG/JPG: pdfkit no soporta SVG ni GIF.
function detectImage(buf) {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

function logoPath() {
  const s = read();
  if (s.logoFile) {
    const p = path.join(DIR, path.basename(s.logoFile));
    if (fs.existsSync(p)) return p;
  }
  return DEFAULT_LOGO;
}

function get() {
  const s = read();
  const p = logoPath();
  let v = 0;
  try { v = Math.floor(fs.statSync(p).mtimeMs); } catch { /* sin archivo */ }
  return {
    name: s.name || DEFAULTS.name,
    subtitle: typeof s.subtitle === 'string' ? s.subtitle : DEFAULTS.subtitle,
    logoUrl: `/api/branding/logo?v=${v}`,
    customLogo: p !== DEFAULT_LOGO,
  };
}

function text(v, label, max) {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new Error(`${label} inválido`);
  const t = v.trim();
  if (t.length > max) throw new Error(`${label}: máximo ${max} caracteres`);
  return t;
}

function set(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('payload inválido');
  const s = read();
  const name = text(patch.name, 'Nombre', 60);
  const subtitle = text(patch.subtitle, 'Subtítulo', 200);
  if (name !== undefined) {
    if (!name) throw new Error('El nombre no puede quedar vacío');
    s.name = name;
  }
  if (subtitle !== undefined) s.subtitle = subtitle;

  if (patch.logo !== undefined) {
    if (typeof patch.logo !== 'string') throw new Error('logo inválido');
    const buf = Buffer.from(patch.logo.replace(/^data:[^;,]*;base64,/, ''), 'base64');
    if (!buf.length) throw new Error('El logo está vacío');
    if (buf.length > MAX_LOGO_BYTES) throw new Error('El logo supera 1 MB');
    const kind = detectImage(buf);
    if (!kind) throw new Error('Formato no soportado (solo PNG o JPG)');
    const file = `branding-logo.${kind}`;
    const tmp = path.join(DIR, file + '.tmp');
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, path.join(DIR, file));
    if (s.logoFile && s.logoFile !== file) removeFile(s.logoFile);
    s.logoFile = file;
  }
  write(s);
  return get();
}

function reset() {
  removeFile(read().logoFile);
  try { fs.unlinkSync(BRANDING_PATH); } catch { /* ya no existe */ }
  return get();
}

module.exports = { get, set, reset, logoPath, detectImage, DEFAULTS, DEFAULT_LOGO };
```

- [ ] **Step 5: Implementar `nodered/weg-api/src/routes/branding.js`**

```js
'use strict';

const express = require('express');
const branding = require('../services/branding');
const { authenticate, requireAdmin } = require('../middleware/auth');

// Se monta ANTES del express.json global (1 MB) porque el PUT trae el logo en
// base64 (~1,4 MB para 1 MB de imagen). El parser de 2 MB se aplica DESPUÉS de
// autenticar, así un anónimo no nos hace parsear 2 MB.
const router = express.Router();

// Público: el login lo necesita antes de autenticarse
router.get('/', (req, res) => res.json(branding.get()));

router.get('/logo', (req, res) => {
  res.set('Cache-Control', 'no-cache'); // revalida con ETag/Last-Modified (los pone sendFile)
  res.sendFile(branding.logoPath());
});

router.put('/', authenticate, requireAdmin, express.json({ limit: '2mb' }), (req, res) => {
  try {
    res.json(branding.set(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/', authenticate, requireAdmin, (req, res) => {
  res.json(branding.reset());
});

module.exports = router;
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: comando canónico con `<pkg>` = `weg-api`.
Expected: PASS (todas).

- [ ] **Step 7: Montar en `server.js`**

Agregar a los `require`:
```js
const brandingRoutes = require('./routes/branding');
```
Reemplazar:
```js
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
```
por:
```js
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));

// Branding: GET público (login), PUT/DELETE admin con su propio parser de 2 MB
// → va antes del express.json global de 1 MB.
app.use('/api/branding', brandingRoutes);

app.use(express.json({ limit: '1mb' }));
```

- [ ] **Step 8: Logo configurable en los PDF (`services/reports.js`)**

Arriba del archivo, después de `const manualService = require('./manual');`:
```js
const branding = require('./branding');
```
En `toSummaryPDF`, reemplazar:
```js
  const agriplusLogo = path.join(__dirname, '..', 'agriplus.png');
  const hasAgriplus = fs.existsSync(agriplusLogo);
```
por:
```js
  const logo = branding.logoPath();
  const hasLogo = fs.existsSync(logo);
```
y:
```js
    if (hasAgriplus) { try { doc.image(agriplusLogo, mL, 22, { height: 34 }); } catch (e) {} }
```
por:
```js
    // fit 120x34: el título empieza en mL+130; el logo por defecto (381x132) queda igual que antes
    if (hasLogo) { try { doc.image(logo, mL, 22, { fit: [120, 34] }); } catch (e) {} }
```
Hacer los mismos dos reemplazos en `toPDF` (ahí la línea del logo está indentada 6 espacios dentro de `drawHeader()`: `      if (hasAgriplus) { ... }` → `      if (hasLogo) { try { doc.image(logo, mL, 22, { fit: [120, 34] }); } catch (e) {} }`). Verificar después que no queden referencias:

Run: `grep -n "agriplusLogo\|hasAgriplus" /c/dev/weg-scada/nodered/weg-api/src/services/reports.js`
Expected: sin salida.

Si `path` ya no se usa en alguna de las dos funciones tras el cambio, dejar el `require('path')` igual (no romper nada por limpieza).

- [ ] **Step 9: Smoke del PDF con logo custom**

Crear `C:\Users\walc7\AppData\Local\Temp\claude\C--Users-walc7-OneDrive-Documentos-Projects-Agriplus\8852c69a-88c6-4923-916e-40bb7eed934b\scratchpad\pdf-smoke.js`:
```js
process.env.CONFIG_PATH = '/tmp/pdfsmoke/config.json';
require('fs').mkdirSync('/tmp/pdfsmoke', { recursive: true });
const fs = require('fs');
const branding = require('/app/src/services/branding');
const reports = require('/app/src/services/reports');
branding.set({ logo: fs.readFileSync('/app/src/images.png').toString('base64') });
reports.toPDF([{ _time: new Date().toISOString(), name: 'SAER 8', site: 'Agriplus', current: 1 }], 'Smoke').then(b => {
  fs.writeFileSync('/app/pdf-smoke.pdf', b);
  console.log('bytes', b.length, 'logo', branding.logoPath());
});
```
Run:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker run --rm -v /mnt/c/dev/weg-scada/nodered/weg-api:/app -v "/mnt/c/Users/walc7/AppData/Local/Temp/claude/C--Users-walc7-OneDrive-Documentos-Projects-Agriplus/8852c69a-88c6-4923-916e-40bb7eed934b/scratchpad:/s" -w /app node:20-alpine node /s/pdf-smoke.js
```
Expected: `bytes <n> logo /tmp/pdfsmoke/branding-logo.png` (`images.png` es un PNG 225x225; `toPDF` está exportado por `reports.js`). Abrir `C:\dev\weg-scada\nodered\weg-api\pdf-smoke.pdf` con Read y verificar el logo en el encabezado. Luego borrarlo: `rm /c/dev/weg-scada/nodered/weg-api/pdf-smoke.pdf`.

- [ ] **Step 10: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/weg-api && git commit -F - <<'EOF'
feat(branding): nombre, subtitulo y logo configurables (API y PDF)

GET /api/branding publico para el login; PUT/DELETE solo admin. Logo PNG/JPG
validado por magic bytes, max 1 MB, usado tambien en los reportes PDF.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Servicio `weg-replica` (oficina)

**Files:**
- Create: `nodered/weg-replica/package.json`
- Create: `nodered/weg-replica/Dockerfile`
- Create: `nodered/weg-replica/src/source.js`
- Create: `nodered/weg-replica/src/influx.js`
- Create: `nodered/weg-replica/src/cursor.js`
- Create: `nodered/weg-replica/src/history.js`
- Create: `nodered/weg-replica/src/files.js`
- Create: `nodered/weg-replica/src/live.js`
- Create: `nodered/weg-replica/src/index.js`
- Create: `nodered/weg-replica/test/history.test.js`
- Create: `nodered/weg-replica/test/files.test.js`
- Create: `nodered/weg-replica/test/live.test.js`

**Interfaces:**
- Consumes (Task 2): `GET /api/replica/{info,config,manual,points}` con `Authorization: Bearer <token>`; headers `X-Next-Cursor`, `X-More`.
- Produces:
  - `createSource({ baseUrl, token, fetchImpl?, timeoutMs? })` → `{ info(), config(): Promise<object>, manual(): Promise<object>, points(since, windowSec): Promise<{ body, next, more }> }`; errores HTTP con `err.status`.
  - `createInfluxWriter({ url, org, bucket, token, fetchImpl? })` → `write(lines: string): Promise<void>`
  - `createCursorStore(file)` → `{ load(): string|null, save(since: string): void }`
  - `createHistorySync({ source, write, cursor, sleep, onStatus?, windowSec?, log? })` → `{ step(): Promise<number /*ms a esperar*/>, run(): Promise<void>, stop() }`
  - `createFileSync({ source, configPath, manualPath, log? })` → `syncFiles(): Promise<{ config: boolean, manual: boolean }>`; `writeJsonIfChanged(file, obj): boolean`; `mergeConfig(remote, localFile): object`
  - `createLiveBridge({ remote, local, topic?, onStatus?, log? })` → `{ lastMessageAt(): number|null }`
  - MQTT `weg/replica/status` (retain): `{ lastSync: number|null /*ms*/, lagSec: number|null, live: boolean, error: string|null }` (consumido por Task 8)
  - HTTP interno `:3300/health`

- [ ] **Step 1: `package.json` y Dockerfile**

`nodered/weg-replica/package.json`:
```json
{
  "name": "weg-replica",
  "version": "1.0.0",
  "description": "Replica de oficina: trae historico, config y telemetria en vivo desde planta",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js",
    "test": "node --test test/"
  },
  "dependencies": {
    "mqtt": "^5.10.0"
  }
}
```
`nodered/weg-replica/Dockerfile`:
```dockerfile
FROM node:20-alpine
WORKDIR /app
# deps primero (capa estable, cache-friendly)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY src/ ./src/
# non-root (mismo uid que weg-api: comparten ./config) + /data para el cursor
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001 && mkdir -p /data && chown -R appuser /app /data
USER appuser
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget --spider -q http://127.0.0.1:3300/health || exit 1
CMD ["node", "src/index.js"]
```

- [ ] **Step 2: Escribir los tests que fallan**

`nodered/weg-replica/test/history.test.js`:
```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistorySync, IDLE_MS, MIN_BACKOFF_MS, MAX_BACKOFF_MS } = require('../src/history');

function memCursor(initial = null) {
  let v = initial; const saves = [];
  return { load: () => v, save: (s) => { v = s; saves.push(s); }, saves };
}
const quiet = { log() {}, error() {} };

test('first run starts at info.oldest and saves cursor after writing', async () => {
  const written = [];
  const cursor = memCursor();
  const source = {
    info: async () => ({ oldest: '2026-09-08T10:00:00Z' }),
    points: async (since, win) => { assert.equal(since, '2026-09-08T10:00:00Z'); assert.equal(win, 3600); return { body: 'L1', next: '2026-09-08T11:00:00.000Z', more: true }; },
  };
  const h = createHistorySync({ source, write: async (b) => written.push(b), cursor, sleep: async () => {}, log: quiet });
  assert.equal(await h.step(), 0);
  assert.deepEqual(written, ['L1']);
  assert.deepEqual(cursor.saves, ['2026-09-08T11:00:00.000Z']);
});

test('empty plant (no oldest) waits idle without saving', async () => {
  const cursor = memCursor();
  const h = createHistorySync({ source: { info: async () => ({ oldest: null }) }, write: async () => {}, cursor, sleep: async () => {}, log: quiet });
  assert.equal(await h.step(), IDLE_MS);
  assert.deepEqual(cursor.saves, []);
});

test('cursor does not advance if the local write fails', async () => {
  const cursor = memCursor('2026-09-27T10:00:00.000Z');
  const source = { points: async () => ({ body: 'L', next: '2026-09-27T11:00:00.000Z', more: false }) };
  const h = createHistorySync({ source, write: async () => { throw new Error('influx down'); }, cursor, sleep: async () => {}, log: quiet });
  await assert.rejects(h.step(), /influx down/);
  assert.deepEqual(cursor.saves, []);
});

test('up to date → idle wait; status reports lastSync and cursor', async () => {
  const statuses = [];
  const cursor = memCursor('2026-09-27T11:59:00.000Z');
  const source = { points: async () => ({ body: '', next: '2026-09-27T11:59:50.000Z', more: false }) };
  const h = createHistorySync({ source, write: async () => {}, cursor, sleep: async () => {}, onStatus: (s) => statuses.push(s), log: quiet });
  assert.equal(await h.step(), IDLE_MS);
  assert.equal(statuses.at(-1).cursor, '2026-09-27T11:59:50.000Z');
  assert.equal(statuses.at(-1).error, null);
  assert.equal(typeof statuses.at(-1).lastSync, 'number');
});

test('run catches up a backlog without idle waits, then idles', async () => {
  const cursor = memCursor('2026-09-20T00:00:00.000Z');
  let n = 0;
  const source = {
    points: async (since) => {
      n++;
      const next = new Date(Date.parse(since) + 3600e3).toISOString();
      return { body: `L${n}`, next, more: n < 5 };
    },
  };
  const waits = [];
  let h;
  const sleep = async (ms) => { waits.push(ms); if (ms === IDLE_MS) h.stop(); };
  h = createHistorySync({ source, write: async () => {}, cursor, sleep, log: quiet });
  await h.run();
  assert.equal(n, 5);
  assert.deepEqual(waits, [IDLE_MS]);                 // ninguna espera durante el catch-up
  assert.equal(cursor.load(), '2026-09-20T05:00:00.000Z');
  const times = cursor.saves.map(Date.parse);
  assert.ok(times.every((t, i) => i === 0 || t > times[i - 1]));  // monótono
});

test('run backs off exponentially on errors and waits max on 401', async () => {
  const errs = [new Error('ECONNREFUSED'), new Error('ECONNREFUSED'), Object.assign(new Error('401'), { status: 401 })];
  const source = { points: async () => { throw errs.shift(); } };
  const waits = [];
  let h;
  const sleep = async (ms) => { waits.push(ms); if (waits.length === 3) h.stop(); };
  h = createHistorySync({ source, write: async () => {}, cursor: memCursor('2026-09-27T00:00:00.000Z'), sleep, log: quiet });
  await h.run();
  assert.deepEqual(waits, [MIN_BACKOFF_MS, MIN_BACKOFF_MS * 2, MAX_BACKOFF_MS]);
});
```

`nodered/weg-replica/test/files.test.js`:
```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonIfChanged, mergeConfig, createFileSync } = require('../src/files');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'replica-files-'));
const quiet = { log() {}, error() {} };

test('writeJsonIfChanged writes only when content differs', () => {
  const f = path.join(tmp(), 'a.json');
  assert.equal(writeJsonIfChanged(f, { a: 1 }), true);
  const mtime = fs.statSync(f).mtimeMs;
  assert.equal(writeJsonIfChanged(f, { a: 1 }), false);
  assert.equal(fs.statSync(f).mtimeMs, mtime);
  assert.equal(writeJsonIfChanged(f, { a: 2 }), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: 2 });
});

test('mergeConfig keeps the local influxdb block', () => {
  const f = path.join(tmp(), 'config.json');
  fs.writeFileSync(f, JSON.stringify({ devices: [], influxdb: { url: 'http://influxdb:8086', org: 'oficina', bucket: 'weg_drives' } }));
  const out = mergeConfig({ devices: [{ name: 'SAER 8' }], influxdb: { url: 'x', org: 'tecnoelectric', bucket: 'b' } }, f);
  assert.equal(out.devices[0].name, 'SAER 8');
  assert.equal(out.influxdb.org, 'oficina');
});

test('mergeConfig with no local file takes the remote config', () => {
  const out = mergeConfig({ devices: [], influxdb: { org: 'tecnoelectric' } }, path.join(tmp(), 'nope.json'));
  assert.equal(out.influxdb.org, 'tecnoelectric');
});

test('syncFiles writes config and manual, second run is a no-op', async () => {
  const d = tmp();
  const source = { config: async () => ({ devices: [{ name: 'SAER 8' }] }), manual: async () => ({ '2026-09-26': { rainMm: 3 } }) };
  const sync = createFileSync({ source, configPath: path.join(d, 'config.json'), manualPath: path.join(d, 'manual.json'), log: quiet });
  assert.deepEqual(await sync(), { config: true, manual: true });
  assert.deepEqual(await sync(), { config: false, manual: false });
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'manual.json'), 'utf8'))['2026-09-26'].rainMm, 3);
});
```

`nodered/weg-replica/test/live.test.js`:
```js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('events');
const { createLiveBridge } = require('../src/live');

function fakeRemote() { const e = new EventEmitter(); e.subs = []; e.subscribe = (t) => e.subs.push(t); return e; }
function fakeLocal() { return { published: [], publish(t, p, o) { this.published.push({ t, p: String(p), o }); } }; }
const quiet = { log() {}, error() {} };

test('subscribes to weg/# on connect and reports live status', () => {
  const remote = fakeRemote(); const statuses = [];
  createLiveBridge({ remote, local: fakeLocal(), onStatus: (s) => statuses.push(s), log: quiet });
  remote.emit('connect');
  assert.deepEqual(remote.subs, ['weg/#']);
  remote.emit('close');
  assert.deepEqual(statuses, [{ live: true }, { live: false }]);
});

test('republishes every message with retain=true, including empty payloads', () => {
  const remote = fakeRemote(); const local = fakeLocal();
  const bridge = createLiveBridge({ remote, local, log: quiet });
  remote.emit('message', 'weg/drives/SAER 8', Buffer.from('{"current":12}'), { retain: false });
  remote.emit('message', 'weg/meters/PM8000', Buffer.from(''), { retain: true });
  assert.deepEqual(local.published, [
    { t: 'weg/drives/SAER 8', p: '{"current":12}', o: { qos: 0, retain: true } },
    { t: 'weg/meters/PM8000', p: '', o: { qos: 0, retain: true } },
  ]);
  assert.equal(typeof bridge.lastMessageAt(), 'number');
});

test('ignores weg/replica/* to avoid loops', () => {
  const remote = fakeRemote(); const local = fakeLocal();
  createLiveBridge({ remote, local, log: quiet });
  remote.emit('message', 'weg/replica/status', Buffer.from('{}'), {});
  assert.deepEqual(local.published, []);
});
```

- [ ] **Step 3: Correr y verificar que fallan**

Run: comando canónico con `<pkg>` = `weg-replica`.
Expected: FAIL — `Cannot find module '../src/history'` (y files, live).

- [ ] **Step 4: Implementar los módulos**

`nodered/weg-replica/src/history.js`:
```js
'use strict';

// Sincroniza el histórico de planta por ventanas de tiempo. El cursor solo
// avanza DESPUÉS de escribir OK en el Influx local → un corte nunca deja huecos
// (a lo sumo re-escribe una ventana, y en Influx eso es idempotente).

const IDLE_MS = 30000;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60000;

function createHistorySync({ source, write, cursor, sleep, onStatus = () => {}, windowSec = 3600, log = console }) {
  let stopped = false;

  // Una ventana; devuelve cuántos ms esperar antes de la próxima
  async function step() {
    let since = cursor.load();
    if (!since) {
      const info = await source.info();
      if (!info || !info.oldest) return IDLE_MS; // planta todavía sin datos
      since = info.oldest;
    }
    const page = await source.points(since, windowSec);
    await write(page.body);
    const next = page.next || since;
    if (next !== since) cursor.save(next);
    onStatus({ lastSync: Date.now(), cursor: next, error: null });
    return page.more ? 0 : IDLE_MS;
  }

  async function run() {
    let backoff = MIN_BACKOFF_MS;
    while (!stopped) {
      let wait;
      try {
        wait = await step();
        backoff = MIN_BACKOFF_MS;
      } catch (e) {
        log.error(`[HIST] ${e.message}`);
        onStatus({ error: e.message });
        wait = e.status === 401 ? MAX_BACKOFF_MS : backoff;
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
      if (wait && !stopped) await sleep(wait);
    }
  }

  return { step, run, stop() { stopped = true; } };
}

module.exports = { createHistorySync, IDLE_MS, MIN_BACKOFF_MS, MAX_BACKOFF_MS };
```

Nota sobre el test de backoff: la tercera espera es `MAX_BACKOFF_MS` por el 401; las dos primeras son 5000 y 10000. El `if (wait && !stopped)` hace que, al llamarse `stop()` dentro de `sleep`, el bucle termine en la siguiente vuelta.

`nodered/weg-replica/src/files.js`:
```js
'use strict';

const fs = require('fs');

// Escribe JSON (atómico) solo si cambió: evita disparar el watcher de weg-api
// cada 5 minutos sin motivo.
function writeJsonIfChanged(file, obj) {
  const next = JSON.stringify(obj, null, 2);
  let prev = null;
  try { prev = fs.readFileSync(file, 'utf8'); } catch { /* no existe todavía */ }
  if (prev === next) return false;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, next, { encoding: 'utf8' });
  fs.renameSync(tmp, file);
  return true;
}

// La config de planta pisa la local, salvo el bloque influxdb (url/org/bucket
// son de cada instalación).
function mergeConfig(remote, localFile) {
  let local = null;
  try { local = JSON.parse(fs.readFileSync(localFile, 'utf8')); } catch { /* sin config local */ }
  const out = { ...remote };
  if (local && local.influxdb) out.influxdb = local.influxdb;
  return out;
}

function createFileSync({ source, configPath, manualPath, log = console }) {
  return async function syncFiles() {
    const config = writeJsonIfChanged(configPath, mergeConfig(await source.config(), configPath));
    const manual = writeJsonIfChanged(manualPath, await source.manual());
    if (config) log.log('[FILES] config.json actualizado desde planta');
    if (manual) log.log('[FILES] manual.json actualizado desde planta');
    return { config, manual };
  };
}

module.exports = { writeJsonIfChanged, mergeConfig, createFileSync };
```

`nodered/weg-replica/src/live.js`:
```js
'use strict';

// Puente MQTT planta → broker local. Todo weg/# es retained en el poller de
// planta, pero el flag retain solo viaja en los mensajes retenidos iniciales:
// se republica SIEMPRE con retain=true para que el broker local tenga el último
// estado (y un payload vacío borre el retenido, igual que en planta).

function createLiveBridge({ remote, local, topic = 'weg/#', onStatus = () => {}, log = console }) {
  let lastMsgAt = null;
  remote.on('connect', () => {
    remote.subscribe(topic, { qos: 0 });
    onStatus({ live: true });
    log.log('[LIVE] Conectado a planta');
  });
  remote.on('close', () => onStatus({ live: false }));
  remote.on('error', (e) => log.error(`[LIVE] ${e.message}`));
  remote.on('message', (t, payload) => {
    if (t.startsWith('weg/replica/')) return; // estado propio: no re-publicar
    lastMsgAt = Date.now();
    local.publish(t, payload, { qos: 0, retain: true });
  });
  return { lastMessageAt: () => lastMsgAt };
}

module.exports = { createLiveBridge };
```

Nota: el test `subscribes to weg/# on connect` compara `remote.subs` con `['weg/#']`; el fake ignora el segundo argumento de `subscribe`.

`nodered/weg-replica/src/cursor.js`:
```js
'use strict';

const fs = require('fs');

// Cursor del histórico persistido en el volumen /data (sobrevive reinicios)
function createCursorStore(file) {
  return {
    load() {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return typeof j.since === 'string' ? j.since : null;
      } catch { return null; }
    },
    save(since) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ since, savedAt: new Date().toISOString() }));
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { createCursorStore };
```

`nodered/weg-replica/src/source.js`:
```js
'use strict';

// Cliente de la API de réplica de planta (/api/replica/*), con token propio
function createSource({ baseUrl, token, fetchImpl = fetch, timeoutMs = 60000 }) {
  async function get(path) {
    const r = await fetchImpl(`${baseUrl}/api/replica${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      const err = new Error(`GET ${path.split('?')[0]} → HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r;
  }
  return {
    async info() { return (await get('/info')).json(); },
    async config() { return (await get('/config')).json(); },
    async manual() { return (await get('/manual')).json(); },
    async points(since, windowSec) {
      const r = await get(`/points?since=${encodeURIComponent(since)}&windowSec=${windowSec}`);
      return { body: await r.text(), next: r.headers.get('x-next-cursor'), more: r.headers.get('x-more') === '1' };
    },
  };
}

module.exports = { createSource };
```

`nodered/weg-replica/src/influx.js`:
```js
'use strict';

// Escribe line protocol en el Influx local (precisión ns, igual que el poller)
function createInfluxWriter({ url, org, bucket, token, fetchImpl = fetch }) {
  return async function write(lines) {
    if (!lines || !lines.trim()) return;
    const r = await fetchImpl(`${url}/api/v2/write?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)}&precision=ns`, {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
      body: lines,
      signal: AbortSignal.timeout(30000),
    });
    if (r.status !== 204) throw new Error(`Influx write HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  };
}

module.exports = { createInfluxWriter };
```

`nodered/weg-replica/src/index.js`:
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

const env = (k, d) => process.env[k] || d;
const SOURCE = (env('REPLICA_SOURCE', '')).replace(/\/$/, '');
const TOKEN = env('REPLICA_TOKEN', '');
if (!SOURCE || !TOKEN) {
  console.error('[REPLICA] Faltan REPLICA_SOURCE / REPLICA_TOKEN');
  process.exit(1);
}
const CONFIG_PATH = env('CONFIG_PATH', '/app/config/config.json');
const MANUAL_PATH = path.join(path.dirname(CONFIG_PATH), 'manual.json');
const DATA_DIR = env('DATA_DIR', '/data');
const FILES_EVERY_MS = 5 * 60000;
const STATUS_EVERY_MS = 10000;

const status = { lastSync: null, cursor: null, live: false, error: null };
const setStatus = (patch) => Object.assign(status, patch);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function statusPayload() {
  const lagSec = status.cursor ? Math.round((Date.now() - Date.parse(status.cursor)) / 1000) : null;
  return { lastSync: status.lastSync, lagSec, live: status.live, error: status.error };
}

// ─── Histórico ───────────────────────────────────────────────────────
const source = createSource({ baseUrl: SOURCE, token: TOKEN });
const write = createInfluxWriter({
  url: env('INFLUXDB_URL', 'http://influxdb:8086'),
  org: env('INFLUXDB_ORG', 'tecnoelectric'),
  bucket: env('INFLUXDB_BUCKET', 'weg_drives'),
  token: env('INFLUXDB_TOKEN', ''),
});
const history = createHistorySync({
  source, write, sleep, onStatus: setStatus,
  cursor: createCursorStore(path.join(DATA_DIR, 'cursor.json')),
});

// ─── Config y datos manuales ─────────────────────────────────────────
const syncFiles = createFileSync({ source, configPath: CONFIG_PATH, manualPath: MANUAL_PATH });
async function filesLoop() {
  for (;;) {
    try { await syncFiles(); } catch (e) { console.error(`[FILES] ${e.message}`); }
    await sleep(FILES_EVERY_MS);
  }
}

// ─── En vivo ─────────────────────────────────────────────────────────
const local = mqtt.connect(env('MQTT_BROKER', 'mqtt://mosquitto:1883'), { clientId: 'weg-replica-local', reconnectPeriod: 5000 });
const remote = mqtt.connect(SOURCE.replace(/^http/, 'ws') + '/mqtt', {
  clientId: 'weg-replica-' + Math.random().toString(16).slice(2, 10),
  reconnectPeriod: 5000,
  connectTimeout: 10000,
});
createLiveBridge({ remote, local, onStatus: setStatus });

setInterval(() => {
  if (local.connected) local.publish('weg/replica/status', JSON.stringify(statusPayload()), { qos: 0, retain: true });
}, STATUS_EVERY_MS);

// ─── Health ──────────────────────────────────────────────────────────
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(statusPayload()));
  } else {
    res.writeHead(404);
    res.end();
  }
}).listen(3300, '0.0.0.0');

console.log(`[REPLICA] Origen ${SOURCE} → Influx/MQTT locales`);
history.run();
filesLoop();
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: comando canónico con `<pkg>` = `weg-replica`.
Expected: PASS (13 tests).

- [ ] **Step 6: Build de la imagen**

Run:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker build -t weg-replica:dev /mnt/c/dev/weg-scada/nodered/weg-replica
```
Expected: build OK. Y que arranca y falla limpio sin variables:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker run --rm weg-replica:dev
```
Expected: `[REPLICA] Faltan REPLICA_SOURCE / REPLICA_TOKEN` y exit 1.

- [ ] **Step 7: Commit** (sin `node_modules` ni `package-lock.json` generado por el test en el host si no se quiere versionar — el poller no versiona lock; seguir ese patrón)

```bash
cd /c/dev/weg-scada && git status --short nodered/weg-replica && git add nodered/weg-replica/package.json nodered/weg-replica/Dockerfile nodered/weg-replica/src nodered/weg-replica/test && git commit -F - <<'EOF'
feat(replica): servicio weg-replica (historico por cursor, MQTT en vivo, config)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Compose de oficina + documentación de despliegue

**Files:**
- Create: `nodered/docker-compose.replica.yml`
- Create: `docs/replica-oficina.md`

**Interfaces:**
- Consumes: imagen de `nodered/weg-replica` (Task 5); env `REPLICA_MODE` (Task 3); `REPLICA_TOKEN` (Task 2).
- Produces: `docker compose -f docker-compose.yml -f docker-compose.replica.yml ...` (usado en Tasks 9–10).

- [ ] **Step 1: `nodered/docker-compose.replica.yml`**

```yaml
# Servidor RÉPLICA (oficina): el mismo stack que planta, pero sin poller Modbus.
# Los datos llegan de planta vía weg-replica (API /api/replica + MQTT en vivo).
#
# Uso:  docker compose -f docker-compose.yml -f docker-compose.replica.yml up -d
# Ver docs/replica-oficina.md

services:
  modbus-poller:
    profiles: ["disabled"]   # la réplica NO habla Modbus con los equipos

  weg-api:
    environment:
      - REPLICA_MODE=1
      - DAILY_REPORT_ENABLED=false

  weg-replica:
    build: ./weg-replica
    container_name: weg-replica
    restart: unless-stopped
    networks:
      - weg-network
    volumes:
      - ./config:/app/config
      - replica-data:/data
    environment:
      - TZ=${TZ:-America/Argentina/Cordoba}
      - CONFIG_PATH=/app/config/config.json
      - REPLICA_SOURCE=${REPLICA_SOURCE}
      - REPLICA_TOKEN=${REPLICA_TOKEN}
      - MQTT_BROKER=mqtt://mosquitto:1883
      - INFLUXDB_URL=http://influxdb:8086
      - INFLUXDB_ORG=${INFLUXDB_ORG:-tecnoelectric}
      - INFLUXDB_BUCKET=${INFLUXDB_BUCKET:-weg_drives}
      - INFLUXDB_TOKEN=${INFLUXDB_TOKEN}
    depends_on:
      mosquitto:
        condition: service_healthy
      influxdb:
        condition: service_healthy
    deploy:
      resources:
        limits:
          memory: 128M
        reservations:
          memory: 32M

volumes:
  replica-data:
```

- [ ] **Step 2: Verificar el merge de compose**

Run:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c "cd /mnt/c/dev/weg-scada/nodered && docker compose -f docker-compose.yml -f docker-compose.replica.yml config --services && docker compose -f docker-compose.yml -f docker-compose.replica.yml config | grep -E 'REPLICA_MODE|DAILY_REPORT_ENABLED'"
```
Expected: la lista de servicios NO incluye `modbus-poller` e incluye `weg-replica`; aparecen `REPLICA_MODE: "1"` y `DAILY_REPORT_ENABLED: "false"`. Y con el compose solo (planta), `modbus-poller` sigue estando:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c "cd /mnt/c/dev/weg-scada/nodered && docker compose config --services"
```
Expected: incluye `modbus-poller`, NO incluye `weg-replica`.

Si `profiles` en el override no desactiva el servicio (versión de compose vieja), alternativa: en el override poner `modbus-poller: { entrypoint: ["true"], restart: "no" }` y documentarlo. Registrar cuál quedó.

- [ ] **Step 3: `docs/replica-oficina.md`**

```markdown
# Réplica de oficina

Servidor de solo lectura que muestra el SCADA de planta (en vivo + histórico)
para demos. Diseño: `docs/superpowers/specs/2026-09-27-replica-branding-design.md`.

## Cómo funciona

- Planta (`weg-vm`) expone `/api/replica/*` protegido con `REPLICA_TOKEN`.
- La oficina corre el mismo stack sin `modbus-poller` y con `weg-replica`, que:
  - trae el histórico de InfluxDB por ventanas de 1 h (cursor en el volumen `replica-data`);
  - puentea MQTT `weg/#` de planta al Mosquitto local (en vivo);
  - baja `config.json` y `manual.json` cada 5 min.
- La `weg-api` de oficina corre con `REPLICA_MODE=1`: equipos/setpoints/lluvia-río son solo
  lectura (409); usuarios, correo y marca son locales. Sin alertas ni reporte diario automático.
- La vista Forma de onda no funciona en la réplica (lee el medidor en vivo por Modbus).

## Planta (una vez)

1. Generar token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
2. Agregar `REPLICA_TOKEN=<token>` al `.env` de `~/weg-scada/nodered` en la VM.
3. `docker compose up -d --build --no-deps weg-api` (~10 s sin API).
4. Probar: `curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:9090/api/replica/info`

Revocar la oficina = cambiar `REPLICA_TOKEN` y repetir el paso 3.

## Oficina

1. VM Ubuntu 24.04 (2 vCPU, 4 GB, 40 GB) con Docker y Tailscale (tailnet de planta).
2. Copiar el repo a `~/weg-scada`; `.env` en `nodered/` a partir de `.env.example`, con:
   - `INFLUXDB_ORG=tecnoelectric`, `INFLUXDB_BUCKET=weg_drives`, `INFLUXDB_TOKEN`/`INFLUXDB_PASSWORD` nuevos;
   - `AUTH_PASSWORD_HASH` / `OPERADOR_PASSWORD_HASH` propios de la oficina;
   - `REPLICA_SOURCE=http://100.97.47.25:9090`, `REPLICA_TOKEN=<token de planta>`.
3. Frontend: copiar un `dist` de producción (`VITE_DATA_MODE=live`) a `frontend-react/dist`.
4. Primer arranque (weg-api necesita `config.json`):
   ```bash
   C="docker compose -f docker-compose.yml -f docker-compose.replica.yml"
   $C up -d --build influxdb mosquitto weg-replica
   until [ -s config/config.json ]; do sleep 5; done
   $C up -d --build
   ```
5. Ver estado: `docker logs -f weg-replica` y `curl -s http://127.0.0.1:3300/health` desde el contenedor
   (`docker exec weg-replica wget -qO- http://127.0.0.1:3300/health`).
```

- [ ] **Step 4: Commit**

```bash
cd /c/dev/weg-scada && git add nodered/docker-compose.replica.yml docs/replica-oficina.md && git commit -F - <<'EOF'
feat(replica): compose de oficina y guia de despliegue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Branding en el frontend (login, header, título, pestaña Marca)

**Files:**
- Create: `frontend-react/src/store/branding.ts`
- Create: `frontend-react/src/views/BrandingTab.tsx`
- Modify: `frontend-react/src/App.tsx` (cargar branding, logo del header)
- Modify: `frontend-react/src/views/Login.tsx:42-64` (logo, nombre, subtítulo)
- Modify: `frontend-react/src/views/Config.tsx:48-62` (pestaña "Marca")

**Interfaces:**
- Consumes (Task 4): `GET /api/branding` → `{ name, subtitle, logoUrl, customLogo }`; `PUT /api/branding` `{ name?, subtitle?, logo? }`; `DELETE /api/branding`.
- Produces: `useBrandingStore` con `{ name, subtitle, logoUrl, customLogo, load(), save(patch), reset() }`; `DEFAULT_BRANDING`.

- [ ] **Step 1: `frontend-react/src/store/branding.ts`**

```ts
import { create } from 'zustand'
import { authFetch } from './auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

export interface Branding {
  name: string
  subtitle: string
  logoUrl: string
  customLogo: boolean
}

export const DEFAULT_BRANDING: Branding = {
  name: 'Planta de Bombeo',
  subtitle: 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.',
  logoUrl: '/agriplus.png',
  customLogo: false,
}

type Result = { ok: boolean; error?: string }

interface BrandingState extends Branding {
  load: () => Promise<void>
  save: (patch: { name?: string; subtitle?: string; logo?: string }) => Promise<Result>
  reset: () => Promise<Result>
}

// El backend devuelve la URL con prefijo /api; respetar VITE_API_BASE si es otro
function fromServer(b: Partial<Branding>): Branding {
  const merged = { ...DEFAULT_BRANDING, ...b }
  return { ...merged, logoUrl: merged.logoUrl.replace(/^\/api(?=\/)/, API_BASE) }
}

function apply(b: Branding) {
  document.title = b.name
}

export const useBrandingStore = create<BrandingState>((set, get) => ({
  ...DEFAULT_BRANDING,

  // Público (sin token): el login lo necesita antes de autenticarse
  load: async () => {
    if (MODE === 'mock') { apply(get()); return }
    try {
      const r = await fetch(`${API_BASE}/branding`)
      if (!r.ok) return
      const b = fromServer(await r.json())
      set(b)
      apply(b)
    } catch { /* sin backend: quedan los valores por defecto */ }
  },

  save: async (patch) => {
    if (MODE === 'mock') {
      const b = { ...get(), ...(patch.name !== undefined ? { name: patch.name } : {}), ...(patch.subtitle !== undefined ? { subtitle: patch.subtitle } : {}) }
      set(b); apply(b)
      return { ok: true }
    }
    try {
      const r = await authFetch(`${API_BASE}/branding`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
      })
      const d = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, error: d?.error || `HTTP ${r.status}` }
      const b = fromServer(d)
      set(b); apply(b)
      return { ok: true }
    } catch (e: any) { return { ok: false, error: e.message } }
  },

  reset: async () => {
    if (MODE === 'mock') { set(DEFAULT_BRANDING); apply(DEFAULT_BRANDING); return { ok: true } }
    try {
      const r = await authFetch(`${API_BASE}/branding`, { method: 'DELETE' })
      const d = await r.json().catch(() => null)
      if (!r.ok) return { ok: false, error: d?.error || `HTTP ${r.status}` }
      const b = fromServer(d)
      set(b); apply(b)
      return { ok: true }
    } catch (e: any) { return { ok: false, error: e.message } }
  },
}))
```

- [ ] **Step 2: Login usa la marca (`views/Login.tsx`)**

Agregar el import:
```tsx
import { useBrandingStore } from '../store/branding'
```
Dentro de `Login()`, después de `const login = useAuthStore(s => s.login)`:
```tsx
  const { name, subtitle, logoUrl } = useBrandingStore()
```
Reemplazar en el panel de marca:
```tsx
          <img src="/agriplus.png" alt="Agriplus" className="h-14 w-auto block" />
```
por:
```tsx
          <img src={logoUrl} alt={name} className="h-14 w-auto max-w-[360px] object-contain block" />
```
Reemplazar:
```tsx
          <h1 className="text-6xl font-semibold leading-[1.08]">Planta de Bombeo</h1>
          <p className="text-xl leading-relaxed max-w-[480px]" style={{ color: '#8B97A9' }}>
            Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.
          </p>
```
por:
```tsx
          <h1 className="text-6xl font-semibold leading-[1.08] break-words">{name}</h1>
          {subtitle && (
            <p className="text-xl leading-relaxed max-w-[480px]" style={{ color: '#8B97A9' }}>
              {subtitle}
            </p>
          )}
```
Y en la marca mobile:
```tsx
          <img src="/agriplus.png" alt="Agriplus" className="h-16 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">Planta de Bombeo</h1>
```
por:
```tsx
          <img src={logoUrl} alt={name} className="h-16 w-auto max-w-[280px] object-contain" />
          <h1 className="text-2xl font-semibold tracking-tight text-center">{name}</h1>
```

- [ ] **Step 3: App carga la marca y la usa en el header (`App.tsx`)**

Agregar el import:
```tsx
import { useBrandingStore } from './store/branding'
```
Dentro de `App()`, después de `const visibleNav = navItems.filter(i => !i.adminOnly || isAdmin)`:
```tsx
  const logoUrl = useBrandingStore(s => s.logoUrl)
  const brandName = useBrandingStore(s => s.name)

  // Marca pública: se carga una vez, antes del login
  useEffect(() => { useBrandingStore.getState().load() }, [])
```
Reemplazar en el header:
```tsx
        <img src="/agriplus.png" alt="agriplus" className="h-8 w-auto" />
```
por:
```tsx
        <img src={logoUrl} alt={brandName} className="h-8 w-auto max-w-[160px] object-contain" />
```

- [ ] **Step 4: `frontend-react/src/views/BrandingTab.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { useBrandingStore, DEFAULT_BRANDING } from '../store/branding'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Loader2, Save, RotateCcw, Upload } from 'lucide-react'
import { toast } from 'sonner'

const MAX_LOGO_BYTES = 1024 * 1024

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(file)
  })
}

export default function BrandingTab() {
  const b = useBrandingStore()
  const [name, setName] = useState(b.name)
  const [subtitle, setSubtitle] = useState(b.subtitle)
  const [logo, setLogo] = useState<string | null>(null) // data URL pendiente de guardar
  const [saving, setSaving] = useState(false)

  useEffect(() => { setName(b.name); setSubtitle(b.subtitle) }, [b.name, b.subtitle])

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!['image/png', 'image/jpeg'].includes(f.type)) { toast.error('Solo PNG o JPG'); return }
    if (f.size > MAX_LOGO_BYTES) { toast.error('El logo supera 1 MB'); return }
    setLogo(await readAsDataUrl(f))
  }

  async function save() {
    if (!name.trim()) { toast.error('El nombre no puede quedar vacío'); return }
    setSaving(true)
    const r = await b.save({ name: name.trim(), subtitle: subtitle.trim(), ...(logo ? { logo } : {}) })
    setSaving(false)
    if (r.ok) { setLogo(null); toast.success('Marca guardada') }
    else toast.error(`No se pudo guardar: ${r.error}`)
  }

  async function restore() {
    if (!confirm('¿Restaurar nombre, subtítulo y logo por defecto?')) return
    setSaving(true)
    const r = await b.reset()
    setSaving(false)
    if (r.ok) { setLogo(null); toast.success('Marca restaurada') }
    else toast.error(`No se pudo restaurar: ${r.error}`)
  }

  return (
    <div className="max-w-2xl">
      <Card className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Logo y textos del login, del encabezado y de los reportes PDF. Solo afecta a este servidor.
        </p>
        <div>
          <Label>Nombre</Label>
          <Input value={name} maxLength={60} onChange={e => setName(e.target.value)} placeholder={DEFAULT_BRANDING.name} />
        </div>
        <div>
          <Label>Subtítulo del login</Label>
          <Input value={subtitle} maxLength={200} onChange={e => setSubtitle(e.target.value)} placeholder="(vacío = sin subtítulo)" />
        </div>
        <div className="space-y-2">
          <Label>Logo (PNG o JPG, máx. 1 MB)</Label>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="bg-white rounded-xl px-4 py-3 border">
              <img src={logo || b.logoUrl} alt="Logo" className="h-12 w-auto max-w-[240px] object-contain block" />
            </div>
            <label className="inline-flex items-center gap-1.5 text-sm cursor-pointer border border-input rounded-md px-3 h-9 hover:bg-muted">
              <Upload className="h-3.5 w-3.5" />Elegir archivo
              <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={pick} />
            </label>
            {logo && <span className="text-xs text-muted-foreground">sin guardar</span>}
          </div>
        </div>
        <div className="flex justify-between pt-1">
          <Button size="sm" variant="outline" disabled={saving} onClick={restore}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" />Restaurar por defecto
          </Button>
          <Button size="sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
            Guardar
          </Button>
        </div>
      </Card>
    </div>
  )
}
```

- [ ] **Step 5: Pestaña "Marca" en `views/Config.tsx`**

Agregar el import:
```tsx
import BrandingTab from './BrandingTab'
```
En el `TabsList`, después de `<TabsTrigger value="smtp">Correo</TabsTrigger>`:
```tsx
        <TabsTrigger value="brand">Marca</TabsTrigger>
```
Y después de `<TabsContent value="smtp"><SmtpTab /></TabsContent>`:
```tsx
      <TabsContent value="brand"><BrandingTab /></TabsContent>
```

- [ ] **Step 6: Build (typecheck + bundle)**

Run: comando canónico de build del frontend.
Expected: termina sin errores de `tsc`. Verificar que el bundle trae lo nuevo:
```bash
grep -c "Restaurar por defecto" /c/dev/weg-scada/frontend-react/dist/assets/*.js | grep -v ":0"
```
Expected: al menos un archivo con conteo ≥ 1.

- [ ] **Step 7: Commit**

```bash
cd /c/dev/weg-scada && git add frontend-react/src && git commit -F - <<'EOF'
feat(branding): login, header y titulo usan la marca; pestana Marca en Configuracion

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Frontend en modo réplica (solo lectura + etiqueta de estado)

**Files:**
- Create: `frontend-react/src/store/server.ts`
- Create: `frontend-react/src/components/ReplicaBadge.tsx`
- Modify: `frontend-react/src/store/drives.ts` (estado `replicaStatus`, suscripción)
- Modify: `frontend-react/src/App.tsx` (cargar `/api/me`, etiqueta "Réplica")
- Modify: `frontend-react/src/views/Config.tsx` (pestañas de planta solo lectura)

**Interfaces:**
- Consumes: `GET /api/me` → `{ replica: boolean }` (Task 3); MQTT `weg/replica/status` → `{ lastSync, lagSec, live, error }` (Task 5).
- Produces: `useServerStore` `{ replica: boolean, load() }`; `ReplicaStatus` y `replicaStatus` en `useDrivesStore`.

- [ ] **Step 1: `frontend-react/src/store/server.ts`**

```ts
import { create } from 'zustand'
import { authFetch } from './auth'

const API_BASE = (import.meta.env.VITE_API_BASE as string) || '/api'
const MODE = (import.meta.env.VITE_DATA_MODE as string) || 'mock'

// Datos del servidor al que estamos conectados (p.ej. si es la réplica de oficina)
interface ServerState {
  replica: boolean
  load: () => Promise<void>
}

export const useServerStore = create<ServerState>((set) => ({
  replica: false,
  load: async () => {
    if (MODE === 'mock') return
    try {
      const r = await authFetch(`${API_BASE}/me`)
      if (!r.ok) return
      const d = await r.json()
      set({ replica: !!d.replica })
    } catch { /* se queda en false */ }
  },
}))
```

- [ ] **Step 2: `replicaStatus` en `store/drives.ts`**

Arriba de `interface DrivesState`, agregar:
```ts
export interface ReplicaStatus {
  lastSync: number | null
  lagSec: number | null
  live: boolean
  error: string | null
}
```
En `interface DrivesState`, después de `connected: boolean`:
```ts
  replicaStatus: ReplicaStatus | null
```
En el estado inicial del `create<DrivesState>(...)` (línea ~114, `  connected: false,`), agregar debajo:
```ts
  replicaStatus: null,
```
Reemplazar:
```ts
      mqttClient?.subscribe(['weg/drives/+', 'weg/meters/+'])
```
por:
```ts
      mqttClient?.subscribe(['weg/drives/+', 'weg/meters/+', 'weg/replica/status'])
```
Y en el handler de `message`, reemplazar el cierre de la rama de medidores:
```ts
          set({ meters, meterHistory })
        }
      } catch (e) { console.debug('[MQTT] Failed to parse message:', e) }
```
por:
```ts
          set({ meters, meterHistory })
        } else if (topic === 'weg/replica/status') {
          set({ replicaStatus: data as ReplicaStatus })
        }
      } catch (e) { console.debug('[MQTT] Failed to parse message:', e) }
```
- [ ] **Step 3: Etiqueta "Réplica" en un componente propio + carga de `/api/me`**

La etiqueta se re-renderiza cada 5 s (`useNow`); va en su propio componente para no re-renderizar toda la `App`.

Crear `frontend-react/src/components/ReplicaBadge.tsx`:
```tsx
import { RefreshCw } from 'lucide-react'
import { cn } from '../lib/utils'
import { useNow } from '../lib/useNow'
import { useDrivesStore } from '../store/drives'

// Estado de sincronización de la réplica de oficina (topic weg/replica/status)
export default function ReplicaBadge() {
  const st = useDrivesStore(s => s.replicaStatus)
  const now = useNow(5000)
  const ago = st?.lastSync ? Math.max(0, Math.round((now - st.lastSync) / 1000)) : null
  const ok = !!st && st.live && !st.error && ago !== null && ago < 120
  const text = ago === null
    ? 'Réplica · sin sincronizar'
    : `Réplica · sincronizado hace ${ago < 60 ? `${ago} s` : `${Math.round(ago / 60)} min`}`
  return (
    <div
      className={cn('hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border',
        ok ? 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20'
           : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20')}
      title={st?.error ? `Último error: ${st.error}` : 'Servidor réplica: datos de planta, solo lectura'}
    >
      <RefreshCw className="h-3 w-3" />{text}
    </div>
  )
}
```
Imports en `App.tsx`:
```tsx
import { useServerStore } from './store/server'
import ReplicaBadge from './components/ReplicaBadge'
```
Dentro de `App()`, después del `useEffect` de branding del Task 7:
```tsx
  const replica = useServerStore(s => s.replica)

  useEffect(() => { if (authed) useServerStore.getState().load() }, [authed])
```
En el header, justo antes del comentario `{/* Conexión */}`:
```tsx
          {replica && <ReplicaBadge />}
```

- [ ] **Step 4: Configuración de planta en solo lectura (`views/Config.tsx`)**

Agregar el import:
```tsx
import { useServerStore } from '../store/server'
```
Dentro de `Config()`, después de `const store = useConfigStore()`:
```tsx
  const replica = useServerStore(s => s.replica)
```
Reemplazar:
```tsx
      <TabsContent value="devices"><DevicesTab /></TabsContent>
      <TabsContent value="zones"><ZonesTab /></TabsContent>
      <TabsContent value="balance"><LossTab /></TabsContent>
```
por:
```tsx
      {replica && (
        <div className="rounded-md border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-800 dark:text-sky-200">
          Servidor réplica: equipos, zonas y balance se sincronizan desde planta y son solo lectura.
          Usuarios, correo y marca son de este servidor.
        </div>
      )}
      {/* fieldset disabled deshabilita inputs/botones (incl. Switch/Select de Radix, que son <button>) */}
      <TabsContent value="devices"><fieldset disabled={replica} className="min-w-0"><DevicesTab /></fieldset></TabsContent>
      <TabsContent value="zones"><fieldset disabled={replica} className="min-w-0"><ZonesTab /></fieldset></TabsContent>
      <TabsContent value="balance"><fieldset disabled={replica} className="min-w-0"><LossTab /></fieldset></TabsContent>
```

- [ ] **Step 5: Build**

Run: comando canónico de build del frontend.
Expected: sin errores. Verificar:
```bash
grep -c "sincronizado hace" /c/dev/weg-scada/frontend-react/dist/assets/*.js | grep -v ":0"
```
Expected: ≥ 1.

- [ ] **Step 6: Commit**

```bash
cd /c/dev/weg-scada && git add frontend-react/src && git commit -F - <<'EOF'
feat(replica): frontend en modo replica (config de planta solo lectura, estado de sync)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Prueba punta a punta local (WSL: stack dev = planta, contenedores descartables = oficina)

**Files:**
- Create (scratchpad, no se versiona): `e2e-office.sh`, `e2e-check.sh`

**Interfaces:**
- Consumes: todo lo anterior. Stack dev local = proyecto compose `nodered` en WSL desde `/mnt/c/dev/weg-scada/nodered`.

- [ ] **Step 1: Levantar la "planta" local con el código nuevo**

Verificar el estado: `MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker ps --format '{{.Names}} {{.Status}}'`.
Agregar `REPLICA_TOKEN=e2e-local-token` a `C:\dev\weg-scada\nodered\.env` (leerlo antes; si ya hay `REPLICA_TOKEN`, reemplazar la línea). Luego:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c "cd /mnt/c/dev/weg-scada/nodered && docker compose up -d --build weg-api frontend"
```
(El dist del frontend ya quedó compilado en Task 8 dentro de `frontend-react/dist`.)
Expected: `weg-api` healthy. Probar:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c "curl -s -H 'Authorization: Bearer e2e-local-token' http://127.0.0.1:9090/api/replica/info; echo; curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9090/api/replica/info"
```
Expected: JSON con `oldest`/`newest` no nulos (si el Influx local tiene datos) y luego `401`.

- [ ] **Step 2: Levantar la "oficina" descartable**

Leer org y bucket del Influx local: `grep -A4 '"influxdb"' /c/dev/weg-scada/nodered/config/config.json`. Escribir en el scratchpad `e2e-office.sh` (LF) reemplazando `<ORG>` por ese org:
```bash
#!/bin/bash
set -e
WSLIP=$(hostname -I | awk '{print $1}')
docker rm -f office-influx office-mosquitto office-replica 2>/dev/null || true
docker network create weg-office 2>/dev/null || true
rm -rf /tmp/office-config && mkdir -p /tmp/office-config && chmod 777 /tmp/office-config
docker run -d --name office-influx --network weg-office \
  -e DOCKER_INFLUXDB_INIT_MODE=setup -e DOCKER_INFLUXDB_INIT_USERNAME=admin \
  -e DOCKER_INFLUXDB_INIT_PASSWORD=office-pass-123 -e DOCKER_INFLUXDB_INIT_ORG=<ORG> \
  -e DOCKER_INFLUXDB_INIT_BUCKET=weg_drives -e DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=office-token \
  influxdb:2.7
docker run -d --name office-mosquitto --network weg-office eclipse-mosquitto:2.0.21 mosquitto -c /mosquitto-no-auth.conf
until docker exec office-influx influx ping >/dev/null 2>&1; do sleep 2; done
docker build -q -t weg-replica:dev /mnt/c/dev/weg-scada/nodered/weg-replica
docker run -d --name office-replica --network weg-office -v /tmp/office-config:/app/config \
  -e REPLICA_SOURCE=http://$WSLIP:9090 -e REPLICA_TOKEN=e2e-local-token \
  -e MQTT_BROKER=mqtt://office-mosquitto:1883 -e INFLUXDB_URL=http://office-influx:8086 \
  -e INFLUXDB_ORG=<ORG> -e INFLUXDB_BUCKET=weg_drives -e INFLUXDB_TOKEN=office-token \
  weg-replica:dev
echo "oficina arriba, origen http://$WSLIP:9090"
```
Run: `MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash /mnt/c/Users/walc7/AppData/Local/Temp/claude/C--Users-walc7-OneDrive-Documentos-Projects-Agriplus/8852c69a-88c6-4923-916e-40bb7eed934b/scratchpad/e2e-office.sh`
Expected: `oficina arriba ...`. `docker logs office-replica` sin errores de auth; aparece `[LIVE] Conectado a planta`.

- [ ] **Step 3: Verificar histórico, config y en vivo**

Esperar a que termine el catch-up (`docker exec office-replica wget -qO- http://127.0.0.1:3300/health` → `lagSec` < 120). Escribir `e2e-check.sh`:
```bash
#!/bin/bash
STOP=$(date -u -d '-5 min' +%Y-%m-%dT%H:%M:%SZ)
Q="from(bucket:\"weg_drives\") |> range(start:0, stop:$STOP) |> filter(fn:(r)=> r._measurement==\"drive_data\" or r._measurement==\"meter_data\") |> count() |> group() |> sum()"
echo "planta:  $(docker exec weg-influxdb influx query "$Q" --raw | grep -v '^#' | tail -n +2 | awk -F, '{print $NF}' | tr -d '\r' | head -1)"
echo "oficina: $(docker exec office-influx influx query "$Q" --raw | grep -v '^#' | tail -n +2 | awk -F, '{print $NF}' | tr -d '\r' | head -1)"
echo "config:  $(ls -la /tmp/office-config/)"
echo "live:"; docker exec office-mosquitto mosquitto_sub -t 'weg/#' -C 3 -W 20 -v | cut -c1-120
```
Run: `MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c "bash /mnt/c/Users/walc7/AppData/Local/Temp/claude/C--Users-walc7-OneDrive-Documentos-Projects-Agriplus/8852c69a-88c6-4923-916e-40bb7eed934b/scratchpad/e2e-check.sh"`
Expected: conteos de planta y oficina **iguales**; `config.json` y `manual.json` presentes; 3 mensajes `weg/...` recibidos (si no hay equipos online en el stack local, al menos los retenidos). Si `docker exec weg-influxdb influx query` pide token, agregar `--token "$INFLUXDB_TOKEN"` leyéndolo del `.env`.

- [ ] **Step 4: Corte simulado (sin huecos)**

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker stop office-replica
```
Esperar 10 min (usar Monitor/ScheduleWakeup, no `sleep` en foreground), luego:
```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- docker start office-replica
```
Esperar `lagSec` < 120 y repetir `e2e-check.sh`. Expected: conteos iguales otra vez.

- [ ] **Step 5: Verificación visual (branding + modo réplica)**

En el navegador integrado, abrir `http://<WSLIP>:9090` (IP de `hostname -I`; si el relay de WSL falla, usar `python weg-scada/scripts/localhost-bridge.py` como indica la memoria). Checklist:
1. Login muestra "Planta de Bombeo" + logo por defecto (sin cambios visuales vs. antes).
2. Entrar como admin → Configuración → Marca: cambiar nombre, subtítulo y subir un PNG. Guardar. Cerrar sesión: el login muestra lo nuevo (desktop y mobile via `resize_window` preset mobile), el header y el título de la pestaña también.
3. Reportes → generar PDF: el encabezado trae el logo nuevo.
4. Probar subir un `.gif` renombrado a `.png` → toast de error del backend "Formato no soportado (solo PNG o JPG)".
5. Restaurar por defecto → vuelve todo.
6. Modo réplica en el stack local, solo para weg-api. No usar `docker-compose.replica.yml` acá, porque también apagaría el poller. En su lugar, crear en el scratchpad `e2e-replica-mode.yml`:
   ```yaml
   services:
     weg-api:
       environment:
         - REPLICA_MODE=1
   ```
   y correr `cd /mnt/c/dev/weg-scada/nodered && docker compose -f docker-compose.yml -f /mnt/c/Users/walc7/AppData/Local/Temp/claude/C--Users-walc7-OneDrive-Documentos-Projects-Agriplus/8852c69a-88c6-4923-916e-40bb7eed934b/scratchpad/e2e-replica-mode.yml up -d --no-deps weg-api`. Verificar: etiqueta "Réplica · sin sincronizar" en ámbar (en el stack local nadie publica `weg/replica/status`), banner de solo lectura en Configuración, inputs deshabilitados, y que un `PUT /api/config` con token de admin devuelva 409. Después volver con `docker compose up -d --no-deps weg-api` (sin el override).

- [ ] **Step 6: Limpieza**

```bash
MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash -c "docker rm -f office-influx office-mosquitto office-replica; docker network rm weg-office; rm -rf /tmp/office-config"
```
Restaurar branding por defecto en el stack local si quedó cambiado. No commitear nada del scratchpad. Anotar en el reporte de la tarea los conteos obtenidos.

---

### Task 10: Despliegue real (planta + VM de oficina en Proxmox)

**⚠ Cada paso que toca la VM de planta o Proxmox requiere OK explícito del usuario en el momento. No ejecutar sin él.**

**Files:** ninguno nuevo en el repo (usa `docs/replica-oficina.md`).

- [ ] **Step 1: Push de la rama y PR**

```bash
cd /c/dev/weg-scada && git push -u origin feat/replica-branding
gh pr create --title "Replica de oficina y branding configurable" --body-file - <<'EOF'
## Resumen
- API de réplica /api/replica (token propio, apagada por defecto) y servicio weg-replica para un servidor de oficina de solo lectura (histórico + en vivo + config).
- Modo réplica en weg-api y frontend (config de planta solo lectura, estado de sincronización).
- Branding configurable por servidor: nombre, subtítulo y logo del login/encabezado y logo de los PDF.

Spec: docs/superpowers/specs/2026-09-27-replica-branding-design.md
Plan: docs/superpowers/plans/2026-09-27-replica-branding.md

## Pruebas
- node --test en weg-api y weg-replica.
- E2E local: conteos de puntos iguales planta/oficina, corte de 10 min sin huecos, MQTT en vivo.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

- [ ] **Step 2: Desplegar en la VM de planta (PEDIR OK)**

Con el procedimiento de la memoria (cliente SSH de Windows, `ssh weg@100.97.47.25`, `~/weg-scada` NO es git):
1. Backup: `tar czf ~/weg-api-src-backup-$(date +%Y%m%d-%H%M).tgz -C ~/weg-scada/nodered weg-api/src docker-compose.yml`.
2. Verificar que los archivos a pisar de la VM coinciden con el commit base (`git show b02ac44:nodered/weg-api/src/server.js | ssh ... 'diff - ~/weg-scada/nodered/weg-api/src/server.js'`, idem `auth.js`, `manual.js`, `reports.js`, `docker-compose.yml`). Si difieren, PARAR y consultar.
3. Enviar por `tar | ssh` los archivos cambiados de `nodered/weg-api/src` + `docker-compose.yml` + `docker-compose.replica.yml` + `weg-replica/`.
4. Generar token en la VM y agregarlo a `.env`: `echo "REPLICA_TOKEN=$(openssl rand -hex 32)" >> ~/weg-scada/nodered/.env` (guardar el valor para la oficina, no pegarlo en el chat).
5. `cd ~/weg-scada/nodered && docker compose up -d --build --no-deps weg-api` (~10 s de corte de API).
6. Frontend: build de producción del Task 8 → reemplazar el CONTENIDO de `~/weg-scada/frontend-react/dist` (sudo, backup previo, `chown -R weg:weg`, `docker exec weg-frontend nginx -s reload`).
7. Verificar: `curl -s -H "Authorization: Bearer $T" http://127.0.0.1:9090/api/replica/info` → oldest ~2026-09-08; login OK; branding por defecto intacto; reporte PDF con logo Agriplus.

- [ ] **Step 3: Crear la VM de oficina en Proxmox (PEDIR acceso/OK)**

Necesita del usuario: acceso SSH al host Proxmox (o que cree él la VM desde la UI con Ubuntu 24.04 cloud image, 2 vCPU, 4 GB, 40 GB, y la clave pública del ssh-agent de Windows). Con acceso al host:
```bash
qm create 9100 --name weg-demo --memory 4096 --cores 2 --net0 virtio,bridge=vmbr0 --scsihw virtio-scsi-pci --ostype l26 --agent 1
qm importdisk 9100 noble-server-cloudimg-amd64.img <storage>
qm set 9100 --scsi0 <storage>:vm-9100-disk-0 --boot order=scsi0 --ide2 <storage>:cloudinit --ciuser weg --sshkeys <pubkey-file> --ipconfig0 ip=dhcp
qm resize 9100 scsi0 40G && qm start 9100
```
En la VM: instalar Docker (repo oficial) y Tailscale; `tailscale up` en la tailnet de planta (`pmeagriplus`), verificar `curl -s -o /dev/null -w '%{http_code}' http://100.97.47.25:9090/api/replica/info` → 401.

- [ ] **Step 4: Desplegar la oficina**

Seguir `docs/replica-oficina.md` sección Oficina (repo, `.env` fresco con credenciales propias guardadas como hash, `REPLICA_SOURCE`/`REPLICA_TOKEN`, dist de producción, arranque en dos fases).

- [ ] **Step 5: Verificación final**

1. Conteos de puntos planta vs. oficina (misma query que `e2e-check.sh`, con `stop` fijo) iguales.
2. Dashboard de la oficina se mueve en vivo; etiqueta "Réplica · sincronizado hace N s" en celeste.
3. Reporte diario del mismo día generado en planta y en oficina: mismos kWh, pérdida y horímetros.
4. Configuración → Marca en la oficina: cargar el logo/nombre para demos; la planta sigue con Agriplus.
5. Actualizar la memoria del proyecto (`pme-server-migracion-vm.md` / nueva `replica-oficina`) con: IP Tailscale de la VM de oficina, dónde está el token, cómo revocar.
