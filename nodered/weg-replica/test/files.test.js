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
  const source = { config: async () => ({ devices: [{ name: 'SAER 8' }] }), manual: async () => ({ '2026-09-26': { rainMm: 3 } }), license: async () => null, unifilar: async () => null };
  const sync = createFileSync({ source, configPath: path.join(d, 'config.json'), manualPath: path.join(d, 'manual.json'), log: quiet });
  assert.deepEqual(await sync(), { config: true, manual: true, license: false, unifilar: false });
  assert.deepEqual(await sync(), { config: false, manual: false, license: false, unifilar: false });
  assert.equal(JSON.parse(fs.readFileSync(path.join(d, 'manual.json'), 'utf8'))['2026-09-26'].rainMm, 3);
});

const licSource = (license) => ({ config: async () => ({ devices: [] }), manual: async () => ({}), license, unifilar: async () => null });
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

test('syncFiles: 403 from license() logs, removes license.key, touches nothing else', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'license.key'), 'old.key');
  const logs = [];
  const err = Object.assign(new Error('HTTP 403'), { status: 403 });
  const out = await mk(d, licSource(async () => { throw err; }), { log: (m) => logs.push(m) })();
  assert.deepEqual(out, { config: false, manual: false, license: false, unifilar: false });
  assert.deepEqual(fs.readdirSync(d), []);
  assert.deepEqual(logs, ['[FILES] La licencia de planta no incluye réplica']);
});

test('syncFiles: non-403 license() error is logged, license.key kept, config and manual still sync', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'license.key'), 'old.key');
  const errs = [];
  const log = { log() {}, error: (m) => errs.push(m) };
  const out = await mk(d, licSource(async () => { throw Object.assign(new Error('boom'), { status: 500 }); }), log)();
  assert.deepEqual(out, { config: true, manual: true, license: false, unifilar: false });
  assert.equal(fs.readFileSync(path.join(d, 'license.key'), 'utf8'), 'old.key');
  assert.deepEqual(errs, ['[FILES] No se pudo bajar la licencia: boom']);
});

test('syncFiles: empty/whitespace license body keeps the existing license.key', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'license.key'), 'old.key');
  assert.equal((await mk(d, licSource(async () => ' \n'))()).license, false);
  assert.equal(fs.readFileSync(path.join(d, 'license.key'), 'utf8'), 'old.key');
});

test('source.license(): text on 200, null on 404, error with status on 403', async () => {
  const { createSource } = require('../src/source');
  const mkSrc = (status, body) => createSource({ baseUrl: 'http://p', token: 't', fetchImpl: async () => ({ ok: status === 200, status, text: async () => body }) });
  assert.equal(await mkSrc(200, 'abc.def').license(), 'abc.def');
  assert.equal(await mkSrc(404, '').license(), null);
  await assert.rejects(mkSrc(403, '').license(), (e) => e.status === 403);
});

const uniSource = (unifilar) => ({ config: async () => ({ devices: [] }), manual: async () => ({}), license: async () => null, unifilar });

test('syncFiles: unifilar.json se escribe y la segunda vez no se reescribe', async () => {
  const d = tmp();
  const f = path.join(d, 'unifilar.json');
  const sync = mk(d, uniSource(async () => ({ version: 1, dibujos: [] })));
  assert.equal((await sync()).unifilar, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { version: 1, dibujos: [] });
  fs.utimesSync(f, 1000, 1000);
  const m = fs.statSync(f).mtimeMs;
  assert.equal((await sync()).unifilar, false);
  assert.equal(fs.statSync(f).mtimeMs, m);
});

test('syncFiles: unifilar() null (404) no toca el local', async () => {
  const d = tmp();
  fs.writeFileSync(path.join(d, 'unifilar.json'), '{"local":1}');
  assert.equal((await mk(d, uniSource(async () => null))()).unifilar, false);
  assert.equal(fs.readFileSync(path.join(d, 'unifilar.json'), 'utf8'), '{"local":1}');
});

test('syncFiles: error de unifilar() se loguea y config/manual siguen', async () => {
  const d = tmp();
  const errs = [];
  const out = await mk(d, uniSource(async () => { throw new Error('boom'); }), { log() {}, error: (m) => errs.push(m) })();
  assert.deepEqual(out, { config: true, manual: true, license: false, unifilar: false });
  assert.match(errs[0], /unifilar/);
});

test('source.unifilar(): JSON en 200, null en 404, error en 500', async () => {
  const { createSource } = require('../src/source');
  const mkSrc = (status, body) => createSource({ baseUrl: 'http://p', token: 't', fetchImpl: async () => ({ ok: status === 200, status, json: async () => body }) });
  assert.deepEqual(await mkSrc(200, { version: 1 }).unifilar(), { version: 1 });
  assert.equal(await mkSrc(404, null).unifilar(), null);
  await assert.rejects(mkSrc(500, null).unifilar(), (e) => e.status === 500);
});
