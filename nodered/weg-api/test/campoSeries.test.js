'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const configService = require('../src/services/config');
const reports = require('../src/services/reports');
const { BASE } = require('../src/services/license');

const HDR = ',result,table,_time,name,kind,';
// Influx falso: tap (fn: max) y el resto (fn: mean) responden CSV distintos
async function withFakeInflux(fn) {
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      bodies.push(b);
      res.writeHead(200);
      if (!b.includes('campo_data')) return res.end('');
      const T = '2026-10-01T00:01:00Z';
      res.end(b.includes('fn: max')
        ? `${HDR}tap\n,,0,${T},R1,reg,3\n`
        : `${HDR}ia\n,,0,${T},R1,reg,12.5\n`);
    });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try { return await fn(bodies); } finally { configService.get = orig; srv.close(); }
}

test('sin modulo unifilar: sin campo y sin consultas campo_data', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(null);
    const s = await reports.generateSeries({});
    assert.equal(s.campo, undefined);
    assert.ok(!bodies.some(b => b.includes('campo_data')));
  });
});

test('con modulo: tap (max) e ia (mean) se unen por _time|name', async () => {
  await withFakeInflux(async (bodies) => {
    reports.setLicenseGetter(() => ({ ...BASE, modulos: ['unifilar'] }));
    try {
      const s = await reports.generateSeries({});
      const qs = bodies.filter(b => b.includes('campo_data'));
      assert.ok(qs.some(b => b.includes('_field == "tap"') && b.includes('fn: max')));
      assert.ok(qs.some(b => b.includes('_field != "tap"') && b.includes('fn: mean')));
      assert.equal(s.campo.length, 1);
      assert.equal(s.campo[0].tap, 3);
      assert.equal(s.campo[0].ia, 12.5);
      assert.equal(s.campo[0].name, 'R1');
    } finally { reports.setLicenseGetter(null); }
  });
});
