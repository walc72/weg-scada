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
