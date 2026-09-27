'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function freshConfigService(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-'));
  process.env.CONFIG_PATH = path.join(dir, 'config.json'); // no existe
  if (env.REPLICA_MODE === undefined) delete process.env.REPLICA_MODE; else process.env.REPLICA_MODE = env.REPLICA_MODE;
  delete require.cache[require.resolve('../src/services/config')];
  return require('../src/services/config');
}

test('replica mode without config.json returns an empty skeleton', () => {
  const cfg = freshConfigService({ REPLICA_MODE: '1' }).get();
  assert.deepEqual(cfg.devices, []);
  assert.deepEqual(cfg.meters, []);
  assert.deepEqual(cfg.gateways, []);
  assert.equal(cfg.mqtt.statusTopic, 'weg/status');
  assert.equal(cfg.influxdb.bucket, 'weg_drives');
});

test('plant without config.json still returns null (no masking)', () => {
  assert.equal(freshConfigService({}).get(), null);
});

// Oficina recién enlazada: config.json aparece (tmp + rename) DESPUÉS de arrancar
// con el esqueleto → chokidar emite 'add', no 'change'. Tiene que recargar.
test('replica reloads when config.json appears after boot', async () => {
  const svc = freshConfigService({ REPLICA_MODE: '1' });
  assert.deepEqual(svc.get().devices, []);
  const w = svc.watchConfigFile({ interval: 200 });
  await new Promise(r => w.on('ready', r));
  // como en la realidad: el archivo aparece un rato después de arrancar (si se
  // escribe en el mismo instante del 'ready', el polling lo toma como inicial)
  await new Promise(r => setTimeout(r, 500));
  const tmp = process.env.CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ devices: [{ name: 'SAER 8' }], mqtt: {}, influxdb: {} }));
  fs.renameSync(tmp, process.env.CONFIG_PATH);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline && svc.get().devices.length === 0) await new Promise(r => setTimeout(r, 100));
  await w.close();
  assert.equal(svc.get().devices[0].name, 'SAER 8');
});
