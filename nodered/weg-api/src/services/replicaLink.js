'use strict';

// Conexión de la OFICINA a planta (config/replica.json). El token va en claro
// (se usa para autenticar contra planta) y solo vive en este archivo; la API
// nunca lo devuelve. weg-replica relee el archivo cada 10 s.

const fs = require('fs');
const { decodeCode } = require('./pairingCode');

function createLinkStore({ file }) {
  return {
    read() {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return j && j.source && j.token ? j : null;
      } catch { return null; }
    },
    save(obj) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tmp, file);
    },
    remove() {
      try { fs.unlinkSync(file); } catch { /* ya no existe */ }
    },
  };
}

// Prueba un código contra la planta. _conn lleva el token: solo para uso interno.
async function testLink(code, { fetchImpl = fetch, timeoutMs = 15000 } = {}) {
  let c;
  try { c = decodeCode(code); } catch (e) { return { ok: false, error: e.message }; }
  try {
    const r = await fetchImpl(`${c.url}/api/replica/info`, {
      headers: { Authorization: `Bearer ${c.token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (r.status === 401) return { ok: false, error: 'La planta rechazó el código (revocado o inválido)' };
    if (r.status === 404) return { ok: false, error: 'La planta no tiene la réplica habilitada' };
    if (!r.ok) return { ok: false, error: `La planta respondió HTTP ${r.status}` };
    const info = await r.json();
    return { ok: true, name: c.name, source: c.url, oldest: info.oldest || null, newest: info.newest || null, _conn: c };
  } catch (e) {
    if (e && e.name === 'TimeoutError') return { ok: false, error: 'Sin respuesta de la planta (timeout)' };
    const why = (e && e.cause && e.cause.code) || (e && e.message) || 'error';
    return { ok: false, error: `No se pudo conectar con la planta: ${why}` };
  }
}

const mask = (t) => (t ? '…' + String(t).slice(-4) : null);

module.exports = { createLinkStore, testLink, mask };
