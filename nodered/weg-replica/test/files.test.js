'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { writeJsonIfChanged, mergeConfig, createFileSync } = require('../src/files');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'replica-files-'));
const quiet = { log() {}, error() {} };

test('writeJsonIfChanged writes only when content differs', () => {
  const f = path.join(tmp(), 'a.json');
  assert.equal(writeJsonIfChanged(f, { a: 1 }), true);
  const mtime = fs.statSync(f).mtimeMs;
  assert.equal(writeJsonIfChanged(f, { a: 1 }), false);
  assert.equal(fs.statSync(f).mtimeMs, mtime);
  assert.equal(writeJsonIfChanged(f, { a: 2 }), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { a: 2 });
});

test('mergeConfig keeps the local influxdb block', () => {
  const f = path.join(tmp(), 'config.json');
  fs.writeFileSync(f, JSON.stringify({ devices: [], influxdb: { url: 'http://influxdb:8086', org: 'oficina', bucket: 'weg_drives' } }));
  const out = mergeConfig({ devices: [{ name: 'SAER 8' }], influxdb: { url: 'x', org: 'tecnoelectric', bucket: 'b' } }, f);
  assert.equal(out.devices[0].name, 'SAER 8');
  assert.equal(out.influxdb.org, 'oficina');
});

test('mergeConfig with no local file takes the remote config', () => {
  const out = mergeConfig({ devices: [], influxdb: { org: 'tecnoelectric' } }, path.join(tmp(), 'nope.json'));
  assert.equal(out.influxdb.org, 'tecnoelectric');
});

test('syncFiles writes config and manual, second run is a no-op', async () => {
  const d = tmp();
  const source = { config: async () => ({ devices: [{ name: 'SAER 8' }] }), manual: async () => ({ '2026-09-26': { rainMm: 3 } }) };
  const sync = createFileSync({ source, configPath: path.join(d, 'config.json'), manualPath: path.join(d, 'manual.json'), log: quiet });
  assert.deepEqual(await sync(), { config: true, manual: true });
  assert.deepEqual(await sync(), { config: false, manual: false });
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'manual.json'), 'utf8'))['2026-09-26'].rainMm, 3);
});
