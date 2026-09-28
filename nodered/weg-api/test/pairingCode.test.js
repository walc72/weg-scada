'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeCode, decodeCode } = require('../src/services/pairingCode');

const TOKEN = 'a'.repeat(64);

test('round trip and trailing slash trimmed', () => {
  const code = encodeCode({ url: 'http://100.97.47.25:9090/', token: TOKEN, name: 'Oficina', id: 'r_1' });
  assert.match(code, /^WEGR1-[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeCode(code), { url: 'http://100.97.47.25:9090', token: TOKEN, name: 'Oficina', id: 'r_1' });
});

test('trims whitespace and newlines around the code', () => {
  const code = encodeCode({ url: 'http://x:9090', token: TOKEN, name: 'n', id: 'i' });
  assert.equal(decodeCode(`  \n${code}\r\n `).url, 'http://x:9090');
});

test('rejects wrong prefix, truncated, bad json, wrong version, bad token, non-http url', () => {
  const good = encodeCode({ url: 'http://x:9090', token: TOKEN, name: 'n', id: 'i' });
  const b64 = (o) => 'WEGR1-' + Buffer.from(JSON.stringify(o)).toString('base64url');
  for (const bad of [
    'hola', '', null, good.replace('WEGR1-', 'WEGR2-'), good.slice(0, 20),
    'WEGR1-' + Buffer.from('{no json').toString('base64url'),
    b64({ v: 2, u: 'http://x', t: TOKEN }),
    b64({ v: 1, u: 'http://x', t: 'corto' }),
    b64({ v: 1, u: 'ftp://x', t: TOKEN }),
    b64({ v: 1, u: 'no es url', t: TOKEN }),
  ]) {
    assert.throws(() => decodeCode(bad), /Código de enlace inválido/, String(bad));
  }
});
