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
  const source = { config: async () => ({ devices: [{ name: 'SAER 8' }] }), manual: async () => ({ '2026-09-26': { rainMm: 3 } }), license: async () => null };
  const sync = createFileSync({ source, configPath: path.join(d, 'config.json'), manualPath: path.join(d, 'manual.json'), log: quiet });
  assert.deepEqual(await sync(), { config: true, manual: true, license: false });
  assert.deepEqual(await sync(), { config: false, manual: false, license: false });
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'manual.json'), 'utf8'))['2026-09-26'].rainMm, 3);
});

const licSource = (license) => ({ config: async () => ({ devices: [] }), manual: async () => ({}), license });
const mk = (d, source, log = quiet) => createFileSync({ source, configPath: path.join(d, 'config.json'), manualPath: path.join(d, 'manual.json'), log });

test('syncFiles writes license.key (trimmed) next to config.json only when it changes', async () => {
  const d = tmp();
  const sync = mk(d, licSource(async () => 'abc.def\n'));
  assert.equal((await sync()).license, true);
  assert.equal(fs.readFileSync(path.join(d, 'license.key'), 'utf8'), 'abc.def');
  assert.equal((await sync()).license, false);
});

test('syncFiles: plant without license (null) keeps the existing license.key', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'license.key'), 'old.key');
  assert.equal((await mk(d, licSource(async () => null))()).license, false);
  assert.equal(fs.readFileSync(path.join(d, 'license.key'), 'utf8'), 'old.key');
});

test('syncFiles: 403 from license() logs and writes nothing', async () => {
  const d = tmp();
  const logs = [];
  const err = Object.assign(new Error('HTTP 403'), { status: 403 });
  const out = await mk(d, licSource(async () => { throw err; }), { log: (m) => logs.push(m) })();
  assert.deepEqual(out, { config: false, manual: false, license: false });
  assert.deepEqual(fs.readdirSync(d), []);
  assert.deepEqual(logs, ['[FILES] La licencia de planta no incluye réplica']);
});

test('syncFiles: other license() errors propagate', async () => {
  const d = tmp();
  await assert.rejects(mk(d, licSource(async () => { throw Object.assign(new Error('boom'), { status: 500 }); }))(), /boom/);
});

test('source.license(): text on 200, null on 404, error with status on 403', async () => {
  const { createSource } = require('../src/source');
  const mkSrc = (status, body) => createSource({ baseUrl: 'http://p', token: 't', fetchImpl: async () => ({ ok: status === 200, status, text: async () => body }) });
  assert.equal(await mkSrc(200, 'abc.def').license(), 'abc.def');
  assert.equal(await mkSrc(404, '').license(), null);
  await assert.rejects(mkSrc(403, '').license(), (e) => e.status === 403);
});
