'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const zlib = require('node:zlib');
const configService = require('../src/services/config');
const reports = require('../src/services/reports');
const { campoSummary } = reports;

const config = {
  reconectadores: [{ name: 'Reco 1', modelo: 'NOJA' }, { name: 'Reco 2' }, { name: 'Reco off', enabled: false }],
  reguladores: [{ name: 'Reg 1', modelo: 'Cooper' }, { name: 'Reg 2' }],
};

test('reconectador: horas, operaciones, disparos', () => {
  const s = campoSummary({
    config,
    mean: { 'Reco 1': { ia: 10.04, ib: 11, ic: 12, va: 100, vb: 110 } },
    sums: { 'Reco 1': { estado: 3, bloqueo: 1 } },
    counts: { 'Reco 1': { estado: 4, bloqueo: 4, auto: 4 } },
    max: { 'Reco 1': { ia: 20, ib: 21, ic: 22 } },
    opsFL: { 'Reco 1': { first: 100, last: 104 } },
    windows: { 'Reco 1': 1440 },
    starts: { 'Reco 1': { DISPARO: 2, BLOQUEO: 1 } },
  });
  const r = s.reconectadores.find(x => x.name === 'Reco 1');
  assert.equal(r.horasDatos, 24);
  assert.equal(r.horasAbierto, 6);
  assert.equal(r.horasBloqueado, 6);
  assert.equal(r.operaciones, 4);
  assert.equal(r.vAvg, 105);
  assert.deepEqual(r.ia, { avg: 10, max: 20 });
  assert.equal(r.disparos, 2);
  assert.equal(r.modelo, 'NOJA');
});

test('reconectador: operaciones null si falta last; sin datos: nulls y contadores 0; deshabilitado sin fila', () => {
  const s = campoSummary({ config, opsFL: { 'Reco 1': { first: 5 } }, windows: { 'Reco 1': 60 } });
  assert.equal(s.reconectadores.length, 2);
  assert.equal(s.reconectadores[0].operaciones, null);
  const r = s.reconectadores[1];
  assert.equal(r.horasDatos, null);
  assert.equal(r.vAvg, null);
  assert.equal(r.horasAbierto, null);
  assert.equal(r.ia.avg, null);
  assert.equal(r.disparos, 0);
});

test('regulador: pctAuto, alarmas, cambios de tap; sin datos', () => {
  const s = campoSummary({
    config,
    mean: { 'Reg 1': { v: 7600.04, i: 50 } },
    sums: { 'Reg 1': { auto: 1 } },
    counts: { 'Reg 1': { auto: 2 } },
    min: { 'Reg 1': { tap: -3, v: 7500 } },
    max: { 'Reg 1': { tap: 4, v: 7700, i: 80 } },
    windows: { 'Reg 1': 60 },
    tapChanges: { 'Reg 1': 7 },
    starts: { 'Reg 1': { ALARMA_5: 1, ALARMA_6: 2, DISPARO: 9 } },
  });
  const r = s.reguladores[0];
  assert.equal(r.pctAuto, 50);
  assert.equal(r.alarmas, 3);
  assert.equal(r.cambiosTap, 7);
  assert.equal(r.tapMin, -3);
  assert.deepEqual(r.v, { avg: 7600, min: 7500, max: 7700 });
  const e = s.reguladores[1];
  assert.equal(e.cambiosTap, null);
  assert.equal(e.pctAuto, null);
  assert.equal(e.alarmas, 0);
});

test('fracciones si/no exactas (sum/count) en rangos largos', () => {
  // 720 h a 1/min: mean redondeado a 2 decimales daria 28.8 / 14.4
  const s = campoSummary({
    config,
    sums: { 'Reco 1': { estado: 41400, bloqueo: 900 }, 'Reg 1': { auto: 21600 } },
    counts: { 'Reco 1': { estado: 43200, bloqueo: 43200 }, 'Reg 1': { auto: 43200 } },
    windows: { 'Reco 1': 43200, 'Reg 1': 43200 },
  });
  assert.equal(s.reconectadores[0].horasAbierto, 30);
  assert.equal(s.reconectadores[0].horasBloqueado, 15);
  assert.equal(s.reguladores[0].pctAuto, 50);
  const z = campoSummary({ config, sums: { 'Reco 1': { estado: 0 } }, counts: { 'Reco 1': { estado: 0 } }, windows: { 'Reco 1': 60 } });
  assert.equal(z.reconectadores[0].horasAbierto, null);
});

test('config sin reguladores: sin clave', () => {
  const s = campoSummary({ config: { reconectadores: config.reconectadores } });
  assert.ok(!('reguladores' in s));
  assert.deepEqual(Object.keys(campoSummary({ config: {} })), []);
});

test('generateSummary sin el modulo: sin claves ni consultas a campo_data', async () => {
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { bodies.push(b); res.writeHead(200); res.end(''); });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' }, ...config });
  try {
    reports.setLicenseGetter(null);
    const s = await reports.generateSummary({ from: '2026-10-01T00:00:00Z', to: '2026-10-02T00:00:00Z' });
    assert.ok(!('reconectadores' in s) && !('reguladores' in s));
    assert.ok(!bodies.some(b => b.includes('campo_data')));
  } finally { configService.get = orig; srv.close(); }
});

// Lee una entrada del zip por su nombre (local header + deflate raw)
function zipEntry(buf, name) {
  const i = buf.indexOf(Buffer.from(name));
  const h = i - 30;
  const csize = buf.readUInt32LE(h + 18);
  return zlib.inflateRawSync(buf.subarray(i + name.length, i + name.length + csize)).toString('utf8');
}

test('reportToXLSX: hojas Reconectadores y Reguladores', () => {
  const summary = { drives: [], meters: [], ...campoSummary({ config, windows: { 'Reco 1': 60 } }) };
  const wb = zipEntry(reports.reportToXLSX(null, summary), 'xl/workbook.xml');
  assert.ok(wb.includes('name="Reconectadores"'));
  assert.ok(wb.includes('name="Reguladores"'));
});

test('toSummaryPDF resuelve un PDF con las secciones', async () => {
  const summary = { drives: [], meters: [], totals: {}, ...campoSummary({ config, windows: { 'Reco 1': 60 } }) };
  const buf = await reports.toSummaryPDF(summary);
  assert.ok(Buffer.isBuffer(buf));
  assert.equal(buf.subarray(0, 4).toString(), '%PDF');
});
