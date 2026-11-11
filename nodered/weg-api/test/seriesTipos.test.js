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
