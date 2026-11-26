'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const configService = require('../src/services/config');
const reports = require('../src/services/reports');
const ds = require('../src/services/downsample');

const DIA = 86400000;

test('fluxAgregar: sin running, tap con max, resto con mean, a float y sin devolver filas', () => {
  const f = ds.fluxAgregar('time(v: "2026-11-01T00:00:00.000Z")', 'time(v: "2026-11-02T00:00:00.000Z")');
  assert.ok(f.includes('r._field != "running"'));
  assert.ok(!f.includes('types.isNumeric'), 'filtrar por valor impide agregar en el almacenamiento (73 s por día)');
  assert.ok(f.includes('r._field == "tap"') && f.includes('fn: max'));
  assert.ok(f.includes('r._field != "tap"') && f.includes('fn: mean'));
  // una sola escritura: en una tarea dos to() dan dos resultados "_result" y la corrida falla
  assert.equal(f.split(`to(bucket: "${ds.BUCKET_5M}")`).length - 1, 1);
  assert.ok(f.includes('union(tables: [tap, resto])'));
  assert.ok(f.includes('float(v: r._value)') && f.includes('filter(fn: (r) => false)'));
  assert.ok(!f.includes('flow_data'), 'el caudal queda en crudo (validez por error/online)');
});

test('tarea: ventanas completas (stop truncado a 5 min) y rehace 30 min', () => {
  assert.ok(ds.FLUX_TAREA.includes('option task = { name: "weg_drives_5m", every: 5m'));
  assert.ok(ds.FLUX_TAREA.includes('stop = date.truncate(t: now(), unit: 5m)'));
  assert.ok(ds.FLUX_TAREA.includes('range(start: date.sub(d: 30m, from: stop), stop: stop)'));
  // los import van antes que el option
  assert.ok(ds.FLUX_TAREA.indexOf('import "date"') < ds.FLUX_TAREA.indexOf('option task'));
});

test('rellenar: de a un día, del más nuevo al más viejo, hasta el primer dato', async () => {
  ds.usarEstado({});
  const ahora = Date.parse('2026-11-26T12:00:00Z');
  const primero = ahora - 2.5 * DIA;
  const consultas = [];
  const query = async (q) => {
    consultas.push(q);
    return q.includes('first()') ? [{ _time: new Date(primero).toISOString() }] : [];
  };
  const orig = require('fs').writeFileSync;
  require('fs').writeFileSync = () => {};   // sin escribir downsample.json en el disco
  const origRen = require('fs').renameSync; require('fs').renameSync = () => {};
  try {
    await ds.rellenar(query, { pausaMs: 0, ahora });
  } finally { require('fs').writeFileSync = orig; require('fs').renameSync = origRen; }
  // keep antes de group: si no, _value float e int chocan (pasó en planta)
  const pd = consultas.find(q => q.includes('first()'));
  assert.ok(pd.indexOf('keep(columns: ["_time"])') < pd.indexOf('|> group()'));
  const tramos = consultas.filter(q => q.includes('to(bucket'));
  assert.equal(tramos.length, 3);
  assert.ok(tramos[0].includes(`time(v: "${new Date(ahora).toISOString()}")`), 'empieza por lo más nuevo');
  assert.ok(ds.cubre(primero) && !ds.cubre(primero - 1));
});

test('asegurar: bucket inexistente (Influx responde 404) → crea bucket y tarea', async () => {
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      pedidos.push(`${req.method} ${req.url.split('?')[0]}`);
      const json = (code, o) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.method === 'GET' && req.url.startsWith('/api/v2/buckets')) return json(404, { code: 'not found', message: 'bucket "weg_drives_5m" not found' });
      if (req.method === 'GET' && req.url.startsWith('/api/v2/orgs')) return json(200, { orgs: [{ id: 'o1' }] });
      if (req.method === 'GET' && req.url.startsWith('/api/v2/tasks')) return json(200, { tasks: [] });
      json(201, {});
    });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try {
    assert.equal(await ds.asegurar(), true);
    assert.ok(pedidos.includes('POST /api/v2/buckets') && pedidos.includes('POST /api/v2/tasks'));
  } finally { configService.get = orig; srv.close(); }
});

// Influx falso: anota de qué bucket lee cada consulta
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

test('generateSeries: rangos largos cubiertos salen del bucket de 5 min; cortos o sin cubrir, del crudo', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    const ahora = Date.now();
    const desde = (ms) => new Date(ahora - ms).toISOString();
    const de5m = () => bodies.filter(b => b.includes(`from(bucket: "${ds.BUCKET_5M}")`)).length;

    ds.usarEstado({ desde: new Date(ahora - 40 * DIA).toISOString(), completo: true });
    await reports.generateSeries({ from: desde(30 * DIA), windowSec: 3600, tipos: ['bombas', 'medidores', 'marcha'] });
    assert.equal(de5m(), 2, 'bombas y medidores del de 5 min');
    assert.ok(bodies.some(b => b.includes('"running"') && b.includes('from(bucket: "weg_drives")')), 'marcha en crudo');

    bodies.length = 0;
    await reports.generateSeries({ from: desde(DIA), windowSec: 216, tipos: ['bombas'] });
    assert.equal(de5m(), 0, '24 h (puntos de menos de 5 min): crudo');

    bodies.length = 0;
    ds.usarEstado({ desde: new Date(ahora - 3 * DIA).toISOString() });
    await reports.generateSeries({ from: desde(30 * DIA), windowSec: 3600, tipos: ['bombas'] });
    assert.equal(de5m(), 0, 'el de 5 min todavía no cubre el inicio: crudo');
    ds.usarEstado({});
  });
});
