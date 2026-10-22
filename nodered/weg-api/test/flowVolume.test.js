'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const configService = require('../src/services/config');
const reports = require('../src/services/reports');
const { flowVolumes } = reports;
const { BASE } = require('../src/services/license');

const LIC = { ...BASE, modulos: ['caudales'] };
const START = Date.parse('2026-10-01T00:00:00Z');
const config = {
  devices: [{ name: 'P1' }, { name: 'P2' }, { name: 'P3' }],
  flowmeters: [
    { name: 'FM-P1', bombas: ['P1'], enabled: true },
    { name: 'COL', bombas: ['P2', 'P3'], enabled: true },
  ],
};
const base = { config, lic: LIC, startMs: START };
const cnt = (o) => ({ first: 1000, last: 1500, firstTime: '2026-10-01T00:00:30Z', min: 1000, ...o });

test('sin modulo: vacio', () => {
  const r = flowVolumes({ ...base, lic: BASE, drivesIntegral: { P2: 10 } });
  assert.deepEqual(r, { drives: {}, flowmeters: [], totalM3: null });
});

test('bomba manual: volumen de la integral, fuente estimado', () => {
  const r = flowVolumes({ ...base, config: { devices: config.devices, flowmeters: [] }, drivesIntegral: { P2: 120.04 } });
  assert.deepEqual(r.drives.P2, { volumeM3: 120, source: 'estimado' });
  assert.equal(r.totalM3, 120);
});

test('caudalimetro con contador que cubre: totalizador', () => {
  const r = flowVolumes({ ...base, flowCounters: { COL: cnt() }, flowIntegral: { COL: { m3: 999, avg: 5, max: 9 } } });
  const col = r.flowmeters.find(f => f.name === 'COL');
  assert.equal(col.volumeM3, 500);
  assert.equal(col.source, 'totalizador');
  assert.deepEqual(col.bombas, ['P2', 'P3']);
  assert.equal(col.avgFlow, 5);
  assert.equal(col.maxFlow, 9);
});

test('contador que baja: integrado', () => {
  const r = flowVolumes({ ...base, flowCounters: { COL: cnt({ min: 3 }) }, flowIntegral: { COL: { m3: 321.5 } } });
  const col = r.flowmeters.find(f => f.name === 'COL');
  assert.equal(col.volumeM3, 321.5);
  assert.equal(col.source, 'integrado');
});

test('contador que no cubre (primer dato tarde): integrado', () => {
  const r = flowVolumes({ ...base, flowCounters: { COL: cnt({ firstTime: '2026-10-01T06:00:00Z' }) }, flowIntegral: { COL: { m3: 77 } } });
  const col = r.flowmeters.find(f => f.name === 'COL');
  assert.equal(col.volumeM3, 77);
  assert.equal(col.source, 'integrado');
});

test('bomba con caudalimetro propio toma su volumen y no se suma dos veces', () => {
  const r = flowVolumes({
    ...base,
    drivesIntegral: { P1: 480, P2: 100 },   // P1 tiene flow medido propio ademas
    flowCounters: { 'FM-P1': cnt() },
    flowIntegral: { COL: { m3: 50 } },
  });
  assert.deepEqual(r.drives.P1, { volumeM3: 500, source: 'totalizador' });
  assert.deepEqual(r.drives.P2, { volumeM3: 100, source: 'estimado' });
  // total = P2 manual (100) + FM-P1 (500) + COL (50); P1 no se repite
  assert.equal(r.totalM3, 650);
  assert.equal(r.drives.P3, undefined);
});

test('colector suma una vez al total y no aparece como bomba', () => {
  const r = flowVolumes({ ...base, config: { devices: config.devices, flowmeters: [config.flowmeters[1]] }, flowIntegral: { COL: { m3: 40 } } });
  assert.equal(r.totalM3, 40);
  assert.deepEqual(Object.keys(r.drives), []);
});

// Unidad: integral(unit:1h) sobre m3/h da m3 directo. 100 m3/h constantes
// durante 2 h = 200 m3 (lo que devuelve Influx), sin conversion extra.
test('integral de caudal constante en m3/h ya es m3', () => {
  const flowM3h = 100, hours = 2;
  const influxIntegral = flowM3h * hours;   // integral(unit: 1h)
  const r = flowVolumes({ ...base, config: { devices: config.devices, flowmeters: [] }, drivesIntegral: { P2: influxIntegral } });
  assert.equal(r.drives.P2.volumeM3, 200);
});

// ─── generateSummary contra un Influx falso ─────────────────────────
async function withFakeInflux(fn) {
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { bodies.push(b); res.writeHead(200); res.end(''); });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' }, devices: config.devices, flowmeters: config.flowmeters });
  try { return await fn(bodies); } finally { configService.get = orig; srv.close(); }
}

test('generateSummary sin modulo: misma forma y sin consultas de caudal', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    const s = await reports.generateSummary({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
    assert.deepEqual(Object.keys(s), ['from', 'to', 'bucket', 'drives', 'meters', 'loss', 'totals']);
    assert.deepEqual(Object.keys(s.totals), ['driveEnergyKwh']);
    assert.ok(!bodies.some(b => b.includes('flow')));
  });
});

test('generateSummary con modulo: flowmeters y total', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(() => LIC);
    try {
      const s = await reports.generateSummary({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
      assert.equal(s.flowmeters.length, 2);
      assert.equal(s.totals.volumeM3, 0);
      assert.ok(bodies.some(b => b.includes('flow_data')));
    } finally { reports.setLicenseGetter(null); }
  });
});
