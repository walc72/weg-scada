'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sshKey = require('../src/services/sshKey');

test('ensure crea clave ed25519 valida (privada PKCS#8 600, publica OpenSSH) y no regenera', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-ssh-'));
  const dir = path.join(base, 'backup-ssh');
  try {
    const { publicKey } = sshKey.ensure(dir, 'weg-scada-acme-1a2b3c4d');
    assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(dir, 'id_ed25519')).mode & 0o777, 0o600);
    const [tipo, b64, comentario] = publicKey.split(' ');
    assert.equal(tipo, 'ssh-ed25519');
    assert.equal(comentario, 'weg-scada-acme-1a2b3c4d');
    const blob = Buffer.from(b64, 'base64');
    assert.equal(blob.readUInt32BE(0), 11);
    assert.equal(blob.subarray(4, 15).toString(), 'ssh-ed25519');
    assert.equal(blob.readUInt32BE(15), 32);
    assert.equal(blob.length, 51);
    // la publica corresponde a la privada
    const pem = fs.readFileSync(path.join(dir, 'id_ed25519'), 'utf8');
    assert.match(pem, /^-----BEGIN PRIVATE KEY-----/);
    const priv = crypto.createPrivateKey(pem);
    assert.deepEqual(crypto.createPublicKey(priv).export({ type: 'spki', format: 'der' }).subarray(-32), blob.subarray(19));
    assert.equal(fs.readFileSync(path.join(dir, 'id_ed25519.pub'), 'utf8'), publicKey + '\n');
    // idempotente
    assert.equal(sshKey.ensure(dir, 'otro-comentario').publicKey, publicKey);
    assert.equal(fs.readFileSync(path.join(dir, 'id_ed25519'), 'utf8'), pem);
    // falta solo la publica: se deriva de la misma privada
    fs.unlinkSync(path.join(dir, 'id_ed25519.pub'));
    assert.equal(sshKey.ensure(dir, 'weg-scada-acme-1a2b3c4d').publicKey, publicKey);
    // privada corrupta: no se pisa
    fs.writeFileSync(path.join(dir, 'id_ed25519'), 'basura');
    assert.throws(() => sshKey.ensure(dir));
    assert.equal(fs.readFileSync(path.join(dir, 'id_ed25519'), 'utf8'), 'basura');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});
