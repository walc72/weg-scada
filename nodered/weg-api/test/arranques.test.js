'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const configService = require('../src/services/config');
const { arranquesPor } = require('../src/services/informes');

test('arranquesPor: un tramo por día, sin regrupar, suma por bomba', async () => {
  const bodies = [];
  const srv = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c);
    req.on('end', () => {
      bodies.push(b);
      res.writeHead(200);
      // dos series de la misma bomba (otro tag) y otra bomba
      res.end(',result,table,name,site,_value\n,,0,B1,S1,2\n,,1,B1,S2,1\n,,2,B2,S1,4\n');
    });
  });
  await new Promise(r => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try {
    const desde = Date.parse('2026-10-01T03:00:00Z');
    const out = await arranquesPor(desde, desde + 3 * 86400e3 - 1, 'weg_drives');
    assert.equal(bodies.length, 3);
    assert.deepEqual(out, { B1: 9, B2: 12 });
    assert.ok(!bodies[0].includes('group('), 'regrupar el mes entero llevaba influxd al tope de memoria');
    // el tramo arranca 10 min antes y solo cuenta flancos desde su inicio
    assert.ok(bodies[1].includes('range(start: 2026-10-02T02:50:00.000Z, stop: 2026-10-03T03:00:00.000Z)'));
    assert.ok(bodies[1].includes('r._time >= 2026-10-02T03:00:00.000Z'));
  } finally { configService.get = orig; srv.close(); }
});
