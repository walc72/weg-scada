'use strict';

// Clave SSH ed25519 de la instalación para SFTP (la usa weg-backup/rclone desde backup-ssh/).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { writeAtomic } = require('./backupStore');

function toOpenSsh(publicKey, comment) {
  const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(-32);
  const str = Buffer.from('ssh-ed25519');
  const len = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const blob = Buffer.concat([len(str.length), str, len(raw.length), raw]);
  return `ssh-ed25519 ${blob.toString('base64')} ${comment}`;
}

// Crea backup-ssh (700) con id_ed25519 (600) e id_ed25519.pub si faltan; nunca regenera una clave existente.
function ensure(dir, comment = 'weg-scada') {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  const priv = path.join(dir, 'id_ed25519');
  const pub = path.join(dir, 'id_ed25519.pub');
  let key;
  try { key = crypto.createPrivateKey(fs.readFileSync(priv)); } catch (e) {
    if (e.code !== 'ENOENT') throw e; // ilegible/corrupta: nunca se pisa
  }
  if (!key) {
    key = crypto.generateKeyPairSync('ed25519').privateKey;
    writeAtomic(priv, key.export({ type: 'pkcs8', format: 'pem' }), 0o600);
  }
  // La pública siempre sale de la privada; se reescribe si no coincide.
  let publicKey = toOpenSsh(crypto.createPublicKey(key), comment);
  let cur = '';
  try { cur = fs.readFileSync(pub, 'utf8').trim(); } catch { /* falta */ }
  const [t, b] = cur.split(' ');
  if (t === 'ssh-ed25519' && b === publicKey.split(' ')[1]) publicKey = cur; // conserva el comentario existente
  else writeAtomic(pub, publicKey + '\n', 0o644);
  return { publicKey };
}

module.exports = { ensure, toOpenSsh };
