'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const reports = require('../src/services/reports');
const { totalsLine } = require('../src/services/dailyReport');

const T0 = Date.parse('2026-11-07T03:00:00Z');

test('alinearHoras ubica cada fila en su hora y descarta fuera de rango', () => {
  const rows = [
    { _time: '2026-11-07T03:00:00Z', v: 5 },
    { _time: '2026-11-07T05:00:00Z', v: 7 },
    { _time: '2026-11-07T06:00:00Z', v: 9 },
    { _time: '2026-11-07T02:59:00Z', v: 1 },
    { _time: '_time', v: 3 },
  ];
  assert.deepEqual(reports.alinearHoras(rows, T0, 3, (r) => r.v), [5, null, 7]);
});

test('alinearHoras con max: el mayor de cada hora (demanda de 15 min)', () => {
  const rows = [
    { _time: '2026-11-07T03:00:00Z', kw: 10 },
    { _time: '2026-11-07T03:15:00Z', kw: 30 },
    { _time: '2026-11-07T03:45:00Z', kw: 20 },
    { _time: '2026-11-07T04:30:00Z', kw: 4 },
  ];
  assert.deepEqual(reports.alinearHoras(rows, T0, 2, (r) => r.kw, Math.max), [30, 4]);
});

test('inicioHora: inicio del período truncado a la hora', () => {
  const now = Date.parse('2026-11-07T15:37:00Z');
  assert.equal(new Date(reports.inicioHora('-24h', now)).toISOString(), '2026-11-06T15:00:00.000Z');
  assert.equal(reports.inicioHora('2026-11-07T03:00:00Z', now), T0);
});

test('totalsLine: costo de bombas solo con costos', () => {
  const s = { totals: { driveEnergyKwh: 10 }, costos: { moneda: 'Gs', costoBombas: 1234567 } };
  assert.ok(totalsLine(s).includes('Costo bombas: <strong>1.234.567 Gs</strong>'));
  assert.ok(!totalsLine({ totals: { driveEnergyKwh: 10 } }).includes('Costo'));
  assert.ok(!totalsLine({ totals: { driveEnergyKwh: 10 }, costos: { moneda: 'Gs', costoBombas: null } }).includes('Costo'));
});

const stats = { current: { avg: 1 }, power: { avg: 2 }, temp: { avg: 3 }, cosPhi: {}, frequency: {} };
const conCostos = (vol) => ({
  drives: [{ name: 'B1', type: 'CFW900', energyKwh: 100, volumeM3: vol ? 50 : undefined, stats }],
  meters: [], totals: { driveEnergyKwh: 100, ...(vol ? { volumeM3: 50 } : {}) },
  ...(vol ? { flowmeters: [] } : {}),
  costos: { moneda: 'Gs', bombas: { B1: { sitio: '', franjas: [], costo: 50000, porLitro: 1 } }, costoBombas: 50000, sitios: [], notas: [] },
});

for (const vol of [false, true]) {
  test(`PDF y XLSX con costos no fallan (volumen: ${vol})`, async () => {
    const pdf = await reports.toSummaryPDF(conCostos(vol));
    assert.ok(Buffer.isBuffer(pdf) && pdf.length > 0);
    const xlsx = reports.reportToXLSX(null, conCostos(vol));
    assert.ok(Buffer.isBuffer(xlsx) && xlsx.length > 0);
  });
}

test('quierePorHora: explícito manda; si no, solo con tarifas', () => {
  assert.equal(reports.quierePorHora(undefined, true), true);
  assert.equal(reports.quierePorHora(undefined, false), false);
  assert.equal(reports.quierePorHora({ porHora: false }, true), false);
  assert.equal(reports.quierePorHora({ porHora: true }, false), true);
  assert.equal(reports.quierePorHora({}, () => true), true);
});
