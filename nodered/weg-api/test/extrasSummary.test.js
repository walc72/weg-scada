'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const configService = require('../src/services/config');
const reports = require('../src/services/reports');
const { extrasSummary } = reports;
const { BASE } = require('../src/services/license');

const config = {
  reconectadores: [{ name: 'R1', mapa: [
    { key: 'med', nombre: 'Temp Aceite', unidad: '°C', decimales: 1 },
    { key: 'med', nombre: 'Energía', unidad: 'kWh', decimales: 0 },
    { key: 'med', nombre: 'Energía', unidad: 'kWh', decimales: 0 },
    { key: 'senal', nombre: 'Puerta' },
    { key: 'ia' },
  ] }],
  reguladores: [{ name: 'G1', enabled: false, mapa: [{ key: 'med', nombre: 'X' }] }, { name: 'G2', mapa: [{ key: 'med', nombre: 'Humedad', unidad: '%' }] }],
};

test('med redondeada, suma con delta, senal pctActiva, sin datos null, deshabilitados fuera', () => {
  const r = extrasSummary({
    config,
    mean: { R1: { x_temp_aceite: 45.123, x_energia: 1274.4 } },
    min: { R1: { x_temp_aceite: 40.06, x_energia: 1270 } },
    max: { R1: { x_temp_aceite: 50.99, x_energia: 1278 } },
    fl: { R1: { x_energia: { first: 1270, last: 1278 } } },
    sums: { R1: { s_puerta: 41400 } }, counts: { R1: { s_puerta: 43200 } },
  });
  assert.equal(r.length, 4);
  assert.deepEqual(r[0], { equipo: 'R1', kind: 'reconectador', nombre: 'Temp Aceite', unidad: '°C', decimales: 1, tipo: 'med', avg: 45.1, min: 40.1, max: 51 });
  assert.equal(r[1].delta, 8);
  assert.equal(r[2].pctActiva, 95.8);
  assert.deepEqual([r[3].equipo, r[3].avg, r[3].min, r[3].max], ['G2', null, null, null]);
  assert.ok(!('delta' in r[0]));
});

const lic = { ...BASE, modulos: ['unifilar'] };
async function run(cfg, fn) {
  const bodies = [];
  const srv = http.createServer((req, res) => { let b = ''; req.on('data', c => b += c); req.on('end', () => { bodies.push(b); res.writeHead(200); res.end(''); }); });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' }, ...cfg });
  reports.setLicenseGetter(() => lic);
  try { return await fn(bodies); } finally { reports.setLicenseGetter(null); configService.get = orig; srv.close(); }
}

test('sin extras no hay summary.extras ni consultas x_/s_', async () => {
  await run({ reconectadores: [{ name: 'R1', mapa: [{ key: 'ia' }] }] }, async (bodies) => {
    const s = await reports.generateSummary({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
    assert.ok(!('extras' in s));
    assert.ok(!bodies.some(b => /"x_|"s_/.test(b)));
  });
});

test('con extras: summary.extras y consultas x_/s_', async () => {
  await run(config, async (bodies) => {
    const s = await reports.generateSummary({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
    assert.equal(s.extras.length, 4);
    assert.ok(bodies.some(b => b.includes('x_temp_aceite')) && bodies.some(b => b.includes('s_puerta')));
  });
});

function zipEntry(buf, name) {
  const i = buf.indexOf(Buffer.from(name)); const h = i - 30;
  return zlib.inflateRawSync(buf.subarray(i + name.length, i + name.length + buf.readUInt32LE(h + 18))).toString('utf8');
}

test('XLSX y PDF con mediciones adicionales', async () => {
  const summary = { drives: [], meters: [], totals: {}, extras: extrasSummary({ config }) };
  const wb = zipEntry(reports.reportToXLSX(null, summary), 'xl/workbook.xml');
  assert.ok(wb.includes('name="Mediciones adicionales"'));
  const buf = await reports.toSummaryPDF(summary);
  assert.equal(buf.subarray(0, 4).toString(), '%PDF');
});

test('med sin decimales: 0 decimales por defecto', () => {
  const cfg = { reguladores: [{ name: 'G', mapa: [{ key: 'med', nombre: 'Pot' }] }] };
  const r = extrasSummary({ config: cfg, mean: { G: { x_pot: 20996.4 } } });
  assert.equal(r[0].decimales, 0);
  assert.equal(r[0].avg, 20996);
});
