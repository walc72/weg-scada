'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { createRegistry } = require('../src/services/replicas');
const { decodeCode } = require('../src/services/pairingCode');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'replicas-')), 'replicas.json');

test('create returns a one-time code; only the hash is stored', () => {
  const file = tmpFile();
  const reg = createRegistry({ file });
  const { replica, code } = reg.create({ name: ' Oficina Tecno ', plantUrl: 'http://100.97.47.25:9090/' });
  assert.equal(replica.name, 'Oficina Tecno');
  assert.equal(replica.status, 'nunca conectada');
  const c = decodeCode(code);
  assert.equal(c.url, 'http://100.97.47.25:9090');
  assert.equal(c.id, replica.id);
  const raw = fs.readFileSync(file, 'utf8');
  assert.ok(!raw.includes(c.token), 'token en claro en disco');
  assert.ok(raw.includes(crypto.createHash('sha256').update(c.token).digest('hex')));
  assert.equal(reg.hasActive(), true);
});

test('validates name and url', () => {
  const reg = createRegistry({ file: tmpFile() });
  assert.throws(() => reg.create({ name: '  ', plantUrl: 'http://x' }), /Nombre inválido/);
  assert.throws(() => reg.create({ name: 'x'.repeat(61), plantUrl: 'http://x' }), /Nombre inválido/);
  assert.throws(() => reg.create({ name: 'ok', plantUrl: 'ftp://x' }), /Dirección de planta inválida/);
  assert.throws(() => reg.create({ name: 'ok', plantUrl: 'nada' }), /Dirección de planta inválida/);
});

test('verify accepts the active token, records ip, rejects others', () => {
  let t = Date.parse('2026-09-27T12:00:00Z');
  const reg = createRegistry({ file: tmpFile(), now: () => t });
  const { code } = reg.create({ name: 'A', plantUrl: 'http://x:9090' });
  const tok = decodeCode(code).token;
  assert.equal(reg.verify('f'.repeat(64), '1.1.1.1'), null);
  assert.equal(reg.verify('corto', '1.1.1.1'), null);
  const r = reg.verify(tok, '100.92.46.17');
  assert.equal(r.status, 'activa');
  assert.equal(r.lastIp, '100.92.46.17');
  assert.equal(reg.list()[0].lastSeenAt, '2026-09-27T12:00:00.000Z');
});

test('lastSeenAt is throttled to once a minute unless the ip changes', () => {
  let t = Date.parse('2026-09-27T12:00:00Z');
  const reg = createRegistry({ file: tmpFile(), now: () => t });
  const tok = decodeCode(reg.create({ name: 'A', plantUrl: 'http://x' }).code).token;
  reg.verify(tok, 'ip1');
  t += 30000; reg.verify(tok, 'ip1');
  assert.equal(reg.list()[0].lastSeenAt, '2026-09-27T12:00:00.000Z');
  t += 1000; reg.verify(tok, 'ip2');
  assert.equal(reg.list()[0].lastIp, 'ip2');
  t += 61000; reg.verify(tok, 'ip2');
  assert.equal(reg.list()[0].lastSeenAt, '2026-09-27T12:01:32.000Z');
});

test('revoke blocks the token, keeps the entry, 404 for unknown id', () => {
  const reg = createRegistry({ file: tmpFile() });
  const { replica, code } = reg.create({ name: 'A', plantUrl: 'http://x' });
  const tok = decodeCode(code).token;
  assert.equal(reg.revoke(replica.id).status, 'revocada');
  assert.equal(reg.verify(tok, 'ip'), null);
  assert.equal(reg.list().length, 1);
  assert.equal(reg.hasActive(), false);
  assert.throws(() => reg.revoke('r_nope'), (e) => e.status === 404);
});

test('missing or corrupt file behaves as empty', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{roto');
  const reg = createRegistry({ file });
  assert.deepEqual(reg.list(), []);
  assert.equal(reg.hasActive(), false);
});
