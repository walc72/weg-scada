'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const configService = require('../src/services/config');
const reports = require('../src/services/reports');

// Influx falso: anota cada consulta y responde vacío
async function withFakeInflux(fn) {
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { bodies.push(b); res.writeHead(200); res.end(''); });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try { return await fn(bodies); } finally { configService.get = orig; srv.close(); }
}

const de = (bodies, txt) => bodies.filter(b => b.includes(txt)).length;

test('tipos: solo consulta lo pedido', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    await reports.generateSeries({ tipos: ['marcha'] });
    assert.equal(bodies.length, 1);
    assert.equal(de(bodies, '_field == "running"'), 1);

    bodies.length = 0;
    await reports.generateSeries({ tipos: ['demanda'] });
    assert.equal(bodies.length, 1);
    assert.ok(bodies[0].includes('meter_data') && bodies[0].includes('_field == "power"'));

    bodies.length = 0;
    await reports.generateSeries({ tipos: ['bombas'] });
    assert.equal(bodies.length, 1);
    assert.equal(de(bodies, 'drive_data'), 1);
  });
});

test('sin tipos: trae todo (bombas, medidores, marcha y demanda)', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    await reports.generateSeries({});
    assert.equal(bodies.length, 4);
  });
});

test('exportación (tipos sin marcha ni demanda) no las consulta', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    await reports.generateSeries({ tipos: ['bombas', 'medidores'] });
    assert.equal(bodies.length, 2);
    assert.equal(de(bodies, '"running"'), 0);
  });
});

test('caché de /series: pedidos iguales (a 5 s) consultan una vez; tipos distintos, no', async () => {
  const { seriesCacheada } = require('../src/routes/reports');
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    const t = Math.floor(Date.now() / 5000) * 5000;
    const iso = (ms) => new Date(ms).toISOString();
    const pedido = (dt, tipos) => ({ from: iso(t - 3600e3 + dt), to: iso(t + dt), windowSec: 10, tipos });
    const [a, b] = await Promise.all([seriesCacheada(pedido(0, ['bombas'])), seriesCacheada(pedido(1200, ['bombas']))]);
    assert.equal(a, b);
    assert.equal(bodies.length, 1);
    await seriesCacheada(pedido(0, ['medidores']));
    assert.equal(bodies.length, 2);
  });
});

test('runningCount: sin map sobre los crudos (agrega en Influx) y con ceros', async () => {
  await withFakeInflux(async (bodies) => {
    await reports.runningCount('-31d', 'now()', 300, 'weg_drives');
    assert.equal(bodies.length, 1);
    const q = bodies[0];
    assert.ok(!q.includes('if r._value then'), 'el map sobre los crudos impedía agregar en el almacenamiento');
    assert.ok(q.includes('r._value == true') && q.includes('fn: count') && q.includes('union(tables: [todos, marcha])'));
  });
});

test('queryInflux: respeta el timeout pedido', async () => {
  const srv = http.createServer(() => { /* nunca responde */ });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try {
    const t = Date.now();
    await assert.rejects(reports.queryInflux('x', 150), /timeout/);
    assert.ok(Date.now() - t < 2000);
  } finally { configService.get = orig; srv.closeAllConnections(); srv.close(); }
});

test('planVivo: parte solo rangos de más de 1 h que llegan a ahora, alineado a la ventana', () => {
  const now = Date.parse('2026-11-11T12:00:07Z');
  const iso = (ms) => new Date(ms).toISOString();
  const p = reports.planVivo(iso(now - 24 * 3600e3), iso(now), 216, now);
  assert.ok(p);
  assert.equal(Date.parse(p.corte) % 216000, 0);
  assert.ok(Date.parse(p.corte) <= now - 3600e3 && Date.parse(p.corte) > now - 3600e3 - 216000);
  assert.equal(Date.parse(p.inicio) % 216000, 0);
  assert.equal(reports.planVivo('-1h', 'now()', 10, now), null);                     // ya es fino
  assert.equal(reports.planVivo(iso(now - 3600e3), iso(now), 30, now), null);        // 1 h justa
  assert.equal(reports.planVivo(iso(now - 48 * 3600e3), iso(now - 24 * 3600e3), 216, now), null); // no llega a ahora
  assert.ok(reports.planVivo('-7d', 'now()', 1512, now));
});

test('vivo: tramo viejo con banda (mean/min/max) y última hora a 10 s; sin vivo, igual que antes', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    const to = new Date().toISOString(), from = new Date(Date.now() - 24 * 3600e3).toISOString();
    await reports.generateSeries({ from, to, windowSec: 216, tipos: ['bombas'] });
    assert.equal(bodies.length, 1);
    bodies.length = 0;
    const r = await reports.generateSeries({ from, to, windowSec: 216, tipos: ['bombas'], vivo: true });
    assert.equal(de(bodies, 'fn: mean'), 2);   // viejo + fino
    assert.equal(de(bodies, 'fn: min'), 1);
    assert.equal(de(bodies, 'fn: max'), 1);
    assert.equal(de(bodies, 'every: 10s'), 1);
    assert.ok(r.vivoDesde);
    // el tramo viejo queda en caché: el segundo pedido solo consulta la última hora
    bodies.length = 0;
    await reports.generateSeries({ from, to, windowSec: 216, tipos: ['bombas'], vivo: true });
    assert.equal(bodies.length, 1);
    assert.equal(de(bodies, 'every: 10s'), 1);
  });
});

test('vivo: la banda une min y max a la fila del promedio (por _time, name y site)', async () => {
  const csv = (v) => `,result,table,_time,name,site,current\n,_result,0,2026-11-11T10:00:00Z,SAER 1,A,${v}\n`;
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      res.writeHead(200);
      res.end(b.includes('fn: min') ? csv(10) : b.includes('fn: max') ? csv(90) : b.includes('fn: mean') && !b.includes('every: 10s') ? csv(50) : '');
    });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try {
    reports.setLicenseGetter(null);
    const to = new Date().toISOString(), from = new Date(Date.now() - 30 * 3600e3).toISOString();
    const r = await reports.generateSeries({ from, to, windowSec: 270, tipos: ['bombas'], vivo: true });
    assert.equal(r.drives.length, 1);
    assert.equal(r.drives[0].current, 50);
    assert.equal(r.drives[0].current_min, 10);
    assert.equal(r.drives[0].current_max, 90);
  } finally { configService.get = orig; srv.close(); }
});
