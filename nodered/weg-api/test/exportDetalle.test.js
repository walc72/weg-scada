'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { aCSV } = require('../src/services/exportar');
const { zip } = require('../src/services/zip');
const http = require('node:http');
const configService = require('../src/services/config');
const reports = require('../src/services/reports');

test('aCSV: BOM, coma decimal, comillas, fecha local y nulos', () => {
  const out = aCSV(['A', 'B'], [[12.5, null], [0, 'x;y'], ['di"jo', new Date(2026, 10, 10, 8, 5)]]);
  assert.equal(out, '﻿A;B\r\n12,5;\r\n0;"x;y"\r\n"di""jo";10/11/2026 08:05');
  assert.equal(aCSV(['A'], [[NaN], [Infinity], ['1.5']]), '﻿A\r\n\r\n\r\n1.5');
});

test('zip: arma un ZIP con el nombre del archivo', () => {
  const z = zip({ 'a.csv': 'hola' });
  assert.equal(z.subarray(0, 2).toString(), 'PK');
  assert.ok(z.includes('a.csv'));
});

async function seriesBodies(opts) {
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => { bodies.push(b); res.writeHead(200); res.end(''); });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try { await reports.generateSeries(opts); } finally { configService.get = orig; srv.close(); }
  return bodies;
}
const drivesQ = (bodies) => bodies.filter(b => b.includes('drive_data') && b.includes('motor_temp'));

test('generateSeries: ventana de 1 dia alineada a medianoche local', async () => {
  const qs = drivesQ(await seriesBodies({ windowSec: 86400 }));
  assert.equal(qs.length, 1);
  assert.ok(qs[0].includes('every: 86400s'));
  assert.ok(qs[0].includes(`offset: ${new Date().getTimezoneOffset() * 60}s`));
  assert.ok(qs[0].includes('timeSrc: "_start"'));
});

test('generateSeries: ventana de 900 s sin offset', async () => {
  const bodies = await seriesBodies({ windowSec: 900 });
  assert.equal(drivesQ(bodies).length, 1);
  assert.ok(!bodies.some(b => b.includes('offset:')));
});

const { opcionesExport, tablasDetalle } = require('../src/services/exportar');

test('opcionesExport: defaults, orden fijo de tipos y resolución válida', () => {
  const d = opcionesExport({});
  assert.deepEqual(d.tipos, ['bombas']);
  assert.equal(d.resolucion, 60);
  const o = opcionesExport({ tipos: ['caudal', 'x', 'bombas'], resolucion: 900, devices: ['B1'], fields: 'no' });
  assert.deepEqual(o.tipos, ['bombas', 'caudal']);
  assert.equal(o.resolucion, 900);
  assert.deepEqual(o.devices, ['B1']);
  assert.deepEqual(o.fields, []);
  assert.equal(opcionesExport({ resolucion: 120 }).resolucion, 60);
});

const T = '2026-11-10T08:00:00Z';
const serie = () => ({
  drives: [{ _time: T, name: 'B1', site: 'S', current: 1, power: 2, result: '_result', table: 0 }, { _time: T, name: 'B2', site: 'S', current: 3, power: 4 }],
  meters: [{ _time: T, name: 'M1', current: 1, voltage: 2, power: 3, pf: 0.9 }],
  flows: [{ _time: T, name: 'C1', flow: 36 }],
  campo: [{ _time: T, name: 'E1', kind: 'rtu', ia: 1, tap: 2 }, { _time: T, name: 'E2', kind: 'rtu', ia: 3, x1: 5 }],
});

test('tablasDetalle: cuatro tipos en orden, L/s y Date', () => {
  const t = tablasDetalle(serie(), { tipos: ['bombas', 'medidores', 'caudal', 'campo'], devices: [], fields: [] });
  assert.deepEqual(t.map(x => x.nombre), ['Bombas', 'Medidores', 'Caudal', 'Campo']);
  assert.ok(t[0].rows[0][0] instanceof Date);
  assert.equal(t[2].rows[0][2], 10);
  assert.deepEqual(t[3].headers.slice(3), ['Ia (A)', 'Tap', 'x1']);
  assert.deepEqual(t[3].rows[1].slice(3), [3, null, 5]);
});

test('tablasDetalle: filtros, campos y tablas vacías', () => {
  const s = serie();
  const b = tablasDetalle(s, { tipos: ['bombas'], devices: ['B1'], fields: ['power', 'zzz'] })[0];
  assert.deepEqual(b.headers, ['Fecha/Hora', 'Bomba', 'Sitio', 'Potencia (kW)']);
  assert.equal(b.rows.length, 1);
  delete s.flows;
  assert.deepEqual(tablasDetalle(s, { tipos: ['caudal'], devices: [], fields: [] }), []);
  assert.deepEqual(tablasDetalle(s, { tipos: ['bombas'], devices: ['nada'], fields: [] }), []);
});
