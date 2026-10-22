'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-route-'));
process.env.CONFIG_PATH = path.join(dir, 'config.json');
const configService = require('../src/services/config');
const router = require('../src/routes/config');

const dev = n => ({ name: n, type: 'SSW900', ip: '10.0.0.1', port: 502, unitId: 1 });

test('DELETE rechazado por validacion deja intacta la config en memoria', async () => {
  // pollIntervalMs invalido ya presente en disco: toda validacion completa falla
  const cfg = { pollIntervalMs: 100, devices: [dev('A'), dev('B')],
    flowmeters: [{ name: 'F', type: 'TUF2000', ip: '10.0.0.2', port: 502, unitId: 1, bombas: ['A', 'B'], enabled: true }] };
  fs.writeFileSync(process.env.CONFIG_PATH, JSON.stringify(cfg));
  configService.load();
  const before = JSON.stringify(configService.get());
  const app = express();
  app.use(express.json());
  app.use('/api/config', router);
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/config/devices/A`, { method: 'DELETE' });
    assert.equal(res.status, 400);
    assert.equal(JSON.stringify(configService.get()), before);
  } finally { await new Promise(r => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); }
});
