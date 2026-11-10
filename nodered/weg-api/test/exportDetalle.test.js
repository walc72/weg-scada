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

const zlib = require('node:zlib');
function zipEntry(buf, name) {
  const i = buf.indexOf(Buffer.from(name));
  const h = i - 30;
  const csize = buf.readUInt32LE(h + 18);
  return zlib.inflateRawSync(buf.subarray(i + name.length, i + name.length + csize)).toString('utf8');
}
const tablasDemo = [
  { nombre: 'Caudal', headers: ['Fecha/Hora', 'Caudalímetro', 'Caudal (L/s)'], rows: [[new Date(), 'Q1', 10]] },
  { nombre: 'Bombas', headers: ['Fecha/Hora', 'Bomba', 'Sitio'], rows: [[new Date(), 'B1', 'S']] },
];

test('reportToXLSX: una hoja por tabla', () => {
  const wb = zipEntry(reports.reportToXLSX(tablasDemo, null), 'xl/workbook.xml');
  assert.ok(wb.includes('name="Caudal"'));
  assert.ok(wb.includes('name="Bombas"'));
});

test('toPDF: dos tablas resuelven un PDF', async () => {
  const buf = await reports.toPDF(tablasDemo, 'T');
  assert.equal(buf.subarray(0, 4).toString(), '%PDF');
});

test('reportToXLSX: sanea caracteres prohibidos en el nombre de hoja', () => {
  const wb = zipEntry(reports.toXLSX([{ name: 'a/b\\c?d*e[f]g:h', headers: ['A'], rows: [] }, { name: '', headers: ['A'], rows: [] }]), 'xl/workbook.xml');
  assert.ok(wb.includes('name="a-b-c-d-e-f-g-h"'));
  assert.ok(wb.includes('name="Hoja2"'));
});

test('tablasDetalle: caudal faltante da null, no 0', () => {
  const s = { drives: [{ _time: T, name: 'B1', flow: '' }, { _time: T, name: 'B2', flow: 36 }], flows: [{ _time: T, name: 'C', flow: '' }, { _time: T, name: 'C', flow: 36 }] };
  const [b, c] = tablasDetalle(s, { tipos: ['bombas', 'caudal'] });
  const i = b.headers.indexOf('Caudal estimado (L/s)');
  assert.deepEqual(b.rows.map(r => r[i]), [null, 10]);
  assert.deepEqual(c.rows.map(r => r[2]), [null, 10]);
  s.drives = [{ _time: T, name: 'B1', flow: '' }];
  assert.ok(!tablasDetalle(s, { tipos: ['bombas'] })[0].headers.includes('Caudal estimado (L/s)'));
});

test('tablasDetalle: descarta filas con _time inválido', () => {
  const s = { drives: [{ _time: '_time', name: 'x' }, { _time: T, name: 'B1' }] };
  assert.equal(tablasDetalle(s, { tipos: ['bombas'] })[0].rows.length, 1);
});

test('parseCSV: dos bloques con distinto encabezado', () => {
  const rows = reports.parseCSV(',result,table,_time,name,a\r\n,_result,0,2026-11-10T08:00:00Z,B1,1.5\r\n\r\n,result,table,_time,name,b\r\n,_result,1,2026-11-10T09:00:00Z,B2,7\r\n');
  assert.equal(rows.length, 2);
  assert.ok(rows.every(r => r._time !== '_time'));
  assert.deepEqual([rows[0].a, rows[1].b], [1.5, 7]);
});

const { ventanasExport, MAX_VENTANAS } = require('../src/services/exportar');
test('ventanasExport: relativos y absolutos', () => {
  const now = Date.parse('2026-11-10T00:00:00Z');
  assert.equal(ventanasExport('-24h', 'now()', 60, now), 1440);
  assert.equal(ventanasExport('2026-01-01T00:00:00Z', '2026-11-10T00:00:00Z', 60, now) > MAX_VENTANAS, true);
  assert.equal(ventanasExport('2026-01-01T00:00:00Z', '2026-11-10T00:00:00Z', 86400, now) < MAX_VENTANAS, true);
  assert.equal(ventanasExport('basura', undefined, 60, now), 60);
});

test('generateSeries con tipos: no consulta lo no pedido', async () => {
  const bodies = await seriesBodies({ tipos: ['caudal'] });
  assert.ok(!bodies.some(b => b.includes('drive_data') || b.includes('meter_data')));
});
