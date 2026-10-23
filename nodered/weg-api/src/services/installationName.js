'use strict';

// Mismo nombre que installation_id de nodered/weg-backup/lib.sh:
// "<cliente-slug>-<8 del install-id>" o "sin-licencia-<8>". No verifica la firma (solo nombra).

const fs = require('fs');
const path = require('path');

function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
const lower = (s) => s.replace(/[A-Z]/g, (c) => c.toLowerCase()); // solo ASCII, como tr 'A-Z' 'a-z'

function installationName(configDir) {
  const id = lower(read(path.join(configDir, 'install-id')).replace(/\s/g, ''));
  const short = id.slice(0, 8) || '00000000';
  let payload = null;
  try {
    const p = read(path.join(configDir, 'license.key')).split('\n')[0].split('.')[0].replace(/\s/g, '');
    payload = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
  } catch { /* licencia ausente o ilegible */ }
  const ok = payload && payload.v === 1 && typeof payload.cliente === 'string';
  const cliente = ok ? lower(payload.cliente).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') : '';
  const lid = ok && typeof payload.installId === 'string' ? lower(payload.installId) : '';
  return cliente && id && lid === id ? `${cliente}-${short}` : `sin-licencia-${short}`;
}

module.exports = { installationName };
