'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
process.env.AUTH_USER = 'admin';
process.env.AUTH_PASSWORD = 'admin-pass';
process.env.OPERADOR_USER = 'operador';
process.env.OPERADOR_PASSWORD = 'op-pass';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { DEFAULT, validateUnifilar, versionOf, createUnifilarStore } = require('../src/services/unifilar');
const createUnifilarRouter = require('../src/routes/unifilar');
const { login } = require('../src/middleware/auth');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'unifilar-')), 'unifilar.json');
const clone = (o) => JSON.parse(JSON.stringify(o));

// fuente → barra → reco → bomba
const valido = () => ({
  version: 1, colores: 'portal',
  dibujos: [{
    id: 'general', nombre: 'Red general', tipo: 'general',
    nodos: [
      { id: 'n1', tipo: 'fuente', x: 0, y: 0, rot: 0, nombre: 'Red' },
      { id: 'n2', tipo: 'barra', x: 0, y: 40, rot: 0, largo: 40 },
      { id: 'n3', tipo: 'reco', x: 0, y: 80, rot: 0, ref: 'Reco 1', mostrar: ['ia', { med: 'Potencia activa' }, { senal: 'Motor' }] },
      { id: 'n4', tipo: 'bomba', x: 0, y: 120, rot: 0, ref: 'SAER 1', mostrar: ['current'] },
    ],
    conexiones: [
      { id: 'c1', desde: ['n1', 'a'], hasta: ['n2', 'p0'] },
      { id: 'c2', desde: ['n2', 'p1'], hasta: ['n3', 'a'] },
      { id: 'c3', desde: ['n3', 'b'], hasta: ['n4', 'a'] },
    ],
  }],
});

test('sin archivo devuelve el default y una versión de 16 hex', () => {
  const s = createUnifilarStore({ file: tmpFile() });
  const r = s.get();
  assert.deepEqual(r.data, DEFAULT);
  assert.match(r.version, /^[0-9a-f]{16}$/);
  assert.deepEqual(validateUnifilar(DEFAULT), []);
});

test('put con la versión actual guarda y get lo devuelve igual', () => {
  const file = tmpFile();
  const s = createUnifilarStore({ file });
  const { version } = s.put(s.get().version, valido());
  const r = s.get();
  assert.equal(r.version, version);
  assert.deepEqual(r.data, valido());
  assert.deepEqual(fs.readdirSync(path.dirname(file)).sort(), ['unifilar-historial', 'unifilar.json']); // sin tmp huérfano
});

test('put con versión vieja → 409 y el archivo no cambia', () => {
  const file = tmpFile();
  const s = createUnifilarStore({ file });
  const v0 = s.get().version;
  s.put(v0, valido());
  const antes = fs.readFileSync(file, 'utf8');
  const d = valido(); d.colores = 'ansi';
  assert.throws(() => s.put(v0, d), (e) => e.status === 409 && e.message === 'El unifilar cambió desde que lo abriste');
  assert.equal(fs.readFileSync(file, 'utf8'), antes);
});

test('put inválido → 400 con errores y no escribe', () => {
  const file = tmpFile();
  const s = createUnifilarStore({ file });
  const d = valido(); d.dibujos[0].nodos[2].rot = 45;
  assert.throws(() => s.put(s.get().version, d), (e) => e.status === 400 && e.errors.length > 0);
  assert.equal(fs.existsSync(file), false);
});

test('dibujo válido sin errores', () => assert.deepEqual(validateUnifilar(valido()), []));

test('reglas de validación (una por regla)', () => {
  const casos = {
    'dos generales': (d) => d.dibujos.push({ id: 'otro', nombre: 'x', tipo: 'general', nodos: [], conexiones: [] }),
    'id de nodo repetido': (d) => { d.dibujos[0].nodos[1].id = 'n1'; },
    'punto inexistente (p9 en barra de largo 40)': (d) => { d.dibujos[0].conexiones[0].hasta = ['n2', 'p9']; },
    'nodo inexistente en conexión': (d) => { d.dibujos[0].conexiones[0].hasta = ['zz', 'a']; },
    'rot 45': (d) => { d.dibujos[0].nodos[0].rot = 45; },
    'reg con ref y banco': (d) => d.dibujos[0].nodos.push({ id: 'n5', tipo: 'reg', x: 0, y: 0, rot: 0, ref: 'R', banco: 'B' }),
    'reg sin ref ni banco': (d) => d.dibujos[0].nodos.push({ id: 'n5', tipo: 'reg', x: 0, y: 0, rot: 0 }),
    'mostrar med vacío': (d) => { d.dibujos[0].nodos[2].mostrar = [{ med: '' }]; },
    'mostrar med de 41 caracteres': (d) => { d.dibujos[0].nodos[2].mostrar = [{ med: 'x'.repeat(41) }]; },
    'mostrar key que no es del tipo': (d) => { d.dibujos[0].nodos[2].mostrar = ['tap']; },
    'sitio.dibujo inexistente': (d) => d.dibujos[0].nodos.push({ id: 'n5', tipo: 'sitio', x: 0, y: 0, rot: 0, dibujo: 'nope' }),
    '65 dibujos': (d) => { for (let i = 0; i < 64; i++) d.dibujos.push({ id: `s${i}`, nombre: 's', tipo: 'sitio', nodos: [], conexiones: [] }); },
    '1501 nodos': (d) => { for (let i = 0; i < 1497; i++) d.dibujos[0].nodos.push({ id: `t${i}`, tipo: 'texto', x: 0, y: 0, rot: 0, texto: 't', tam: 12 }); },
    'barra con largo no múltiplo de 10': (d) => { d.dibujos[0].nodos[1].largo = 45; },
    'vinculo con ref y banco': (d) => { d.dibujos[0].nodos[0].vinculo = { ref: 'a', banco: 'b', kind: 'reg', nominal: 100 }; },
    'vinculo desde en el general': (d) => { d.dibujos[0].nodos[0].vinculo = { desde: 'n2' }; },
    'colores desconocidos': (d) => { d.colores = 'rojo'; },
  };
  for (const [nombre, mutar] of Object.entries(casos)) {
    const d = valido(); mutar(d);
    assert.ok(validateUnifilar(d).length > 0, nombre);
  }
});

test('vinculos válidos: por med, por banco y desde un nodo del general', () => {
  const d = valido();
  d.dibujos[0].nodos[0].vinculo = { ref: 'Reg 1', kind: 'reg', med: 'Tensión fuente', nominal: 13200, umbralPct: 50 };
  d.dibujos.push({
    id: 's1', nombre: 'Sitio 1', tipo: 'sitio',
    nodos: [{ id: 'f1', tipo: 'fuente', x: 0, y: 0, rot: 0, nombre: 'Ingreso', vinculo: { desde: 'n3' } },
      { id: 'f2', tipo: 'fuente', x: 0, y: 0, rot: 0, nombre: 'Banco', vinculo: { banco: 'RUA-01 Tapelectro', kind: 'reg', nominal: 13200 } }],
    conexiones: [],
  });
  d.dibujos[0].nodos.push({ id: 'n5', tipo: 'sitio', x: 0, y: 0, rot: 0, dibujo: 's1' },
    { id: 'n6', tipo: 'reg', x: 0, y: 0, rot: 0, banco: 'Toshiba' });
  assert.deepEqual(validateUnifilar(d), []);
  d.dibujos[1].nodos[0].vinculo = { desde: 'no-existe' };
  assert.ok(validateUnifilar(d).length > 0);
});

test('ref/banco inexistentes en la config no son error (la validación no mira la config)', () => {
  const d = valido();
  d.dibujos[0].nodos[2].ref = 'Equipo borrado';
  d.dibujos[0].nodos.push({ id: 'n5', tipo: 'reg', x: 0, y: 0, rot: 0, banco: 'Banco borrado', mostrar: [{ med: 'Nada' }] });
  assert.deepEqual(validateUnifilar(d), []);
});

test('conexiones: barra de largo 100 tiene p0..p5', () => {
  const d = valido();
  d.dibujos[0].nodos[1].largo = 100;
  d.dibujos[0].conexiones[0].hasta = ['n2', 'p5'];
  assert.deepEqual(validateUnifilar(d), []);
  d.dibujos[0].conexiones[0].hasta = ['n2', 'p6'];
  assert.ok(validateUnifilar(d).length > 0);
});

// --- rutas ---------------------------------------------------------------

async function serve({ modulos = ['unifilar'], isReplica = false } = {}) {
  const store = createUnifilarStore({ file: tmpFile() });
  const app = express();
  app.use('/api/unifilar', createUnifilarRouter({ store, getLicense: () => ({ modulos }), isReplica })); // antes del json global, como en server.js
  app.use(express.json({ limit: '1mb' }));
  app.post('/api/login', login);
  const server = await new Promise((r) => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokenFor = async (user, password) => (await (await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user, password }),
  })).json()).token;
  const call = (method, token, body) => fetch(`${base}/api/unifilar`, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const get = (sub, token) => fetch(`${base}/api/unifilar${sub}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { store, call, get, admin: () => tokenFor('admin', 'admin-pass'), op: () => tokenFor('operador', 'op-pass'), close: () => new Promise((r) => server.close(r)) };
}

test('rutas: GET autenticado, PUT solo admin, 409 y 400', async () => {
  const s = await serve();
  try {
    assert.equal((await s.call('GET', null)).status, 401);
    const op = await s.op(); const admin = await s.admin();
    const g = await s.call('GET', op);
    assert.equal(g.status, 200);
    const { version } = await g.json();
    assert.equal((await s.call('PUT', op, { base: version, data: valido() })).status, 403);
    const ok = await s.call('PUT', admin, { base: version, data: valido() });
    assert.equal(ok.status, 200);
    assert.match((await ok.json()).version, /^[0-9a-f]{16}$/);
    const viejo = await s.call('PUT', admin, { base: version, data: valido() });
    assert.equal(viejo.status, 409);
    assert.equal((await viejo.json()).error, 'El unifilar cambió desde que lo abriste');
    const nuevo = (await (await s.call('GET', admin)).json()).version;
    const malo = valido(); malo.dibujos[0].nodos[0].rot = 45;
    const r400 = await s.call('PUT', admin, { base: nuevo, data: malo });
    assert.equal(r400.status, 400);
    assert.ok((await r400.json()).errors.length > 0);
    assert.equal((await s.call('PUT', admin, '{roto')).status, 400);
  } finally { await s.close(); }
});

test('rutas: sin módulo unifilar → 403', async () => {
  const s = await serve({ modulos: ['medidores'] });
  try {
    assert.equal((await s.call('GET', await s.admin())).status, 403);
    assert.equal((await s.call('PUT', await s.admin(), { base: 'x', data: valido() })).status, 403);
  } finally { await s.close(); }
});

test('rutas: cuerpo de 2,1 MB → 413 y de ~1,5 MB pasa el parser', async () => {
  const s = await serve();
  try {
    const admin = await s.admin();
    const r = await s.call('PUT', admin, 'x'.repeat(2.1 * 1024 * 1024));
    assert.equal(r.status, 413);
    assert.ok((await r.json()).error);
    const { version } = await (await s.call('GET', admin)).json();
    const d = valido();
    for (let k = 0; k < 4; k++) {
      const nodos = [];
      for (let i = 0; i < 1400; i++) nodos.push({ id: `t${i}`, tipo: 'texto', x: 0, y: 0, rot: 0, texto: 'x'.repeat(190), tam: 12 });
      d.dibujos.push({ id: `s${k}`, nombre: 's', tipo: 'sitio', nodos, conexiones: [] });
    }
    assert.ok(JSON.stringify({ base: version, data: d }).length > 1024 * 1024);
    const big = await s.call('PUT', admin, { base: version, data: d });
    assert.equal(big.status, 200); // > 1 MB, < 2 MB
  } finally { await s.close(); }
});

test('rutas: modo réplica rechaza el PUT y deja leer', async () => {
  const s = await serve({ isReplica: true });
  try {
    const admin = await s.admin();
    const { version } = await (await s.call('GET', admin)).json();
    const r = await s.call('PUT', admin, { base: version, data: valido() });
    assert.equal(r.status, 403);
    assert.match((await r.json()).error, /réplica/);
    assert.equal(versionOf((await (await s.call('GET', admin)).json()).data), version);
  } finally { await s.close(); }
});

test('archivo dañado: GET devuelve DEFAULT con aviso y el PUT lo sobrescribe', () => {
  for (const raw of ['{roto', '[1,2]', '{"version":2}']) {
    const file = tmpFile();
    fs.writeFileSync(file, raw);
    const s = createUnifilarStore({ file });
    const r = s.get();
    assert.deepEqual(r.data, DEFAULT);
    assert.match(r.warning, /dañado/);
    assert.match(r.version, /^[0-9a-f]{16}$/);
    s.put(r.version, valido());
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), valido());
    assert.equal(s.get().warning, undefined);
  }
});

test('archivo con estructura válida pero reglas incumplidas: se sirve tal cual con aviso y se puede corregir', () => {
  const file = tmpFile();
  const malo = valido();
  malo.dibujos[0].nodos[0].rot = 45;
  fs.writeFileSync(file, JSON.stringify(malo));
  const s = createUnifilarStore({ file });
  const r = s.get();
  assert.deepEqual(r.data, malo); // no se pierde el dibujo
  assert.match(r.warning, /tiene errores/);
  assert.equal(r.version, versionOf(malo));
  s.put(r.version, valido());
  assert.equal(s.get().warning, undefined);
});

test('nginx: /api/ admite cuerpos de 2 MB (PUT del unifilar)', () => {
  const conf = fs.readFileSync(path.join(__dirname, '../../nginx/frontend.conf'), 'utf8');
  assert.match(conf, /location \/api\/ \{[^}]*client_max_body_size 2m;/);
});

// --- historial -------------------------------------------------------------

test('historial: cada guardado queda con fecha, usuario y elementos; más nuevo primero', () => {
  const file = tmpFile();
  const s = createUnifilarStore({ file });
  assert.deepEqual(s.historial(), []);
  const v1 = s.put(s.get().version, valido(), 'admin').version;
  const d2 = valido(); d2.dibujos[0].nodos.push({ id: 'n5', tipo: 'texto', x: 0, y: 0, rot: 0, texto: 'x', tam: 12 });
  const v2 = s.put(v1, d2, 'ana').version;
  const h = s.historial();
  assert.equal(h.length, 2);
  assert.deepEqual(h.map((x) => [x.version, x.usuario, x.elementos]), [[v2, 'ana', 5], [v1, 'admin', 4]]);
  assert.match(h[0].id, /^\d{13}-[0-9a-f]{16}$/);
  assert.ok(Date.parse(h[0].fecha) >= Date.parse(h[1].fecha));
  assert.deepEqual(s.versionGuardada(h[1].id).data, valido());
  assert.ok(fs.existsSync(path.join(path.dirname(file), 'unifilar-historial')));
});

test('historial: se poda a las últimas N y un guardado rechazado no deja copia', () => {
  const s = createUnifilarStore({ file: tmpFile(), max: 3 });
  let v = s.get().version;
  for (let i = 0; i < 5; i++) {
    const d = valido(); d.dibujos[0].nombre = `Red ${i}`;
    v = s.put(v, d, 'admin').version;
  }
  assert.equal(s.historial().length, 3);
  assert.equal(s.versionGuardada(s.historial()[0].id).data.dibujos[0].nombre, 'Red 4');
  assert.throws(() => s.put('vieja', valido(), 'admin'), { status: 409 });
  const malo = valido(); malo.dibujos[0].nodos[0].rot = 45;
  assert.throws(() => s.put(v, malo, 'admin'), { status: 400 });
  assert.equal(s.historial().length, 3);
});

test('historial: id inválido → 400 (sin salir de la carpeta) e inexistente → 404', () => {
  const s = createUnifilarStore({ file: tmpFile() });
  for (const id of ['../unifilar', '..%2Funifilar', 'x', '1234567890123-zzzzzzzzzzzzzzzz']) assert.throws(() => s.versionGuardada(id), { status: 400 });
  assert.throws(() => s.versionGuardada('1234567890123-0123456789abcdef'), { status: 404 });
});

test('rutas: historial solo admin, réplica 403, versión por id', async () => {
  const s = await serve();
  try {
    const admin = await s.admin(); const op = await s.op();
    const { version } = await (await s.call('GET', admin)).json();
    await s.call('PUT', admin, { base: version, data: valido() });
    assert.equal((await s.get('/historial', op)).status, 403);
    const r = await s.get('/historial', admin);
    assert.equal(r.status, 200);
    const [h] = await r.json();
    assert.equal(h.usuario, 'admin');
    const v = await s.get(`/historial/${h.id}`, admin);
    assert.equal(v.status, 200);
    assert.deepEqual((await v.json()).data, valido());
    assert.equal((await s.get('/historial/nada', admin)).status, 400);
    assert.equal((await s.get('/historial/1234567890123-0123456789abcdef', admin)).status, 404);
  } finally { await s.close(); }
  const rep = await serve({ isReplica: true });
  try { assert.equal((await rep.get('/historial', await rep.admin())).status, 403); } finally { await rep.close(); }
});

// --- TC / TP y conexiones de medición -------------------------------------

test('TC en serie, TP y medidor con punto m: s↔m válido, s↔línea y s↔s no', () => {
  const d = valido();
  d.dibujos[0].nodos.push(
    { id: 't1', tipo: 'tc', x: 100, y: 0, rot: 0, nombre: '', relacion: '200/5 A' },
    { id: 't2', tipo: 'tp', x: 200, y: 0, rot: 0, nombre: 'TP barra', relacion: '13200/110 V' },
    { id: 'm1', tipo: 'medidor', x: 300, y: 0, rot: 0, ref: 'PM 1' },
  );
  d.dibujos[0].conexiones.push(
    { id: 'k1', desde: ['n2', 'p0'], hasta: ['t1', 'a'] },
    { id: 'k2', desde: ['t1', 's'], hasta: ['m1', 'm'] },
    { id: 'k3', desde: ['n2', 'p1'], hasta: ['t2', 'a'] },
    { id: 'k4', desde: ['m1', 'm'], hasta: ['t2', 's'] },
  );
  assert.deepEqual(validateUnifilar(d), []);
  const mal = (desde, hasta) => { const x = clone(d); x.dibujos[0].conexiones.push({ id: 'kx', desde, hasta }); return validateUnifilar(x); };
  assert.ok(mal(['t1', 's'], ['n2', 'p2']).some((e) => /medición/.test(e)));
  assert.ok(mal(['t1', 's'], ['t2', 's']).some((e) => /medición/.test(e)));
  assert.ok(mal(['m1', 'm'], ['n4', 'a']).some((e) => /medición/.test(e)));
  const larga = clone(d); larga.dibujos[0].nodos.find((n) => n.id === 't1').relacion = 'x'.repeat(41);
  assert.ok(validateUnifilar(larga).some((e) => /relacion/.test(e)));
});

// --- enlaces de datos (equipo de comunicación ↔ equipo) --------------------

test('enlace de datos: d↔d válido entre comm y medidor/bomba/reco/caudalímetro; d con otro punto no', () => {
  const d = valido();
  d.dibujos[0].nodos.push(
    { id: 'r1', tipo: 'comm', x: 100, y: 0, rot: 0, ref: 'Radio 1' },
    { id: 'm1', tipo: 'medidor', x: 200, y: 0, rot: 0, ref: 'PM 1' },
    { id: 'q1', tipo: 'caudalimetro', x: 300, y: 0, rot: 0, ref: 'TUF 1' },
  );
  d.dibujos[0].conexiones.push(
    { id: 'd1', desde: ['r1', 'd'], hasta: ['m1', 'd'] },
    { id: 'd2', desde: ['n4', 'd'], hasta: ['r1', 'd'] },
    { id: 'd3', desde: ['r1', 'd'], hasta: ['n3', 'd'] },
    { id: 'd4', desde: ['q1', 'd'], hasta: ['r1', 'd'] },
  );
  assert.deepEqual(validateUnifilar(d), []);
  const mal = (desde, hasta) => { const x = clone(d); x.dibujos[0].conexiones.push({ id: 'kx', desde, hasta }); return validateUnifilar(x); };
  assert.ok(mal(['r1', 'd'], ['m1', 'a']).some((e) => /datos/.test(e)));
  assert.ok(mal(['m1', 'd'], ['n2', 'p2']).some((e) => /datos/.test(e)));
  assert.ok(mal(['m1', 'm'], ['r1', 'd']).some((e) => /datos|medición/.test(e)));
});

// --- lados de los bornes y posición del texto -------------------------------

test('lados y posTexto: válidos y rechazos', () => {
  const d = valido();
  const reco = d.dibujos[0].nodos[2];
  reco.lados = { a: 'izquierda', b: 'derecha', d: 'arriba' };
  reco.posTexto = 'arriba';
  d.dibujos[0].nodos[3].posTexto = { dx: 60, dy: -30 };
  assert.deepEqual(validateUnifilar(d), []);
  const con = (f) => { const x = clone(d); f(x.dibujos[0].nodos); return validateUnifilar(x); };
  assert.ok(con((ns) => { ns[2].lados.a = 'diagonal'; }).some((e) => /lados/.test(e)));
  assert.ok(con((ns) => { ns[2].lados.zz = 'arriba'; }).some((e) => /lados/.test(e)));
  assert.ok(con((ns) => { ns[1].lados = { p0: 'arriba' }; }).some((e) => /lados/.test(e))); // barra: sin lados
  assert.ok(con((ns) => { ns[2].posTexto = 'centro'; }).some((e) => /posTexto/.test(e)));
  assert.ok(con((ns) => { ns[3].posTexto = { dx: 1.5, dy: 0 }; }).some((e) => /posTexto/.test(e)));
  assert.ok(con((ns) => { ns[3].posTexto = { dx: 5000, dy: 0 }; }).some((e) => /posTexto/.test(e)));
});

// --- puertos del sitio: entrada/salida y bornes del bloque -------------------

test('bloque de sitio con entrada (a) y salida (b); Entrada y Salida del sitio solo en dibujos de sitio, una de cada una', () => {
  const d = valido();
  d.dibujos.push({ id: 's1', nombre: 'Norte', tipo: 'sitio', nodos: [
    { id: 'e', tipo: 'entrada', x: 0, y: 0, rot: 0, nombre: 'Entrada' },
    { id: 'o', tipo: 'salida', x: 0, y: 100, rot: 0, nombre: 'Salida' },
  ], conexiones: [{ id: 'k', desde: ['e', 'a'], hasta: ['o', 'a'] }] });
  d.dibujos[0].nodos.push({ id: 'bs', tipo: 'sitio', x: 200, y: 0, rot: 0, dibujo: 's1' });
  d.dibujos[0].conexiones.push({ id: 'ka', desde: ['n2', 'p1'], hasta: ['bs', 'a'] }, { id: 'kb', desde: ['bs', 'b'], hasta: ['n4', 'a'] });
  assert.deepEqual(validateUnifilar(d), []);
  const con = (f) => { const x = clone(d); f(x); return validateUnifilar(x); };
  assert.ok(con((x) => x.dibujos[0].nodos.push({ id: 'e2', tipo: 'entrada', x: 0, y: 0, rot: 0, nombre: '' })).some((e) => /sitio/.test(e)));
  assert.ok(con((x) => x.dibujos[1].nodos.push({ id: 'e3', tipo: 'entrada', x: 0, y: 0, rot: 0, nombre: '' })).some((e) => /una/.test(e)));
  assert.deepEqual(con((x) => { x.dibujos[0].nodos.find((n) => n.id === 'bs').lados = { a: 'izquierda', b: 'derecha' }; }), []); // el bloque acepta lados
  assert.ok(con((x) => { x.dibujos[0].nodos.find((n) => n.id === 'bs').lados = { d: 'izquierda' }; }).some((e) => /lados/.test(e)));
});
