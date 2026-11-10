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
