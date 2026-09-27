'use strict';

// Registro de réplicas de la PLANTA (config/replicas.json, no se sirve por
// /api/config). Un token por réplica; en disco solo su SHA-256. Se relee en
// cada operación (archivo chico) → revocar aplica en el acto.

const fs = require('fs');
const crypto = require('crypto');
const { encodeCode } = require('./pairingCode');

const SEEN_THROTTLE_MS = 60000;
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');

function createRegistry({ file, now = Date.now }) {
  function read() {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      return j && Array.isArray(j.replicas) ? j : { replicas: [] };
    } catch { return { replicas: [] }; }
  }
  function write(db) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { encoding: 'utf8' });
    fs.renameSync(tmp, file);
  }
  const iso = () => new Date(now()).toISOString();
  const status = (r) => (r.revokedAt ? 'revocada' : r.lastSeenAt ? 'activa' : 'nunca conectada');
  const pub = (r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, lastIp: r.lastIp, revokedAt: r.revokedAt, status: status(r) });

  return {
    list() { return read().replicas.map(pub); },

    hasActive() { return read().replicas.some(r => !r.revokedAt); },

    // Hay réplicas registradas (aunque estén revocadas): la API sigue encendida
    // para que una revocada reciba 401 y no un 404 engañoso.
    hasAny() { return read().replicas.length > 0; },

    create({ name, plantUrl }) {
      const n = typeof name === 'string' ? name.trim() : '';
      if (!n || n.length > 60) throw new Error('Nombre inválido (1 a 60 caracteres)');
      let u;
      try { u = new URL(String(plantUrl)); } catch { throw new Error('Dirección de planta inválida'); }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Dirección de planta inválida');
      const token = crypto.randomBytes(32).toString('hex');
      const r = {
        id: 'r_' + crypto.randomBytes(6).toString('hex'),
        name: n, tokenHash: sha(token), createdAt: iso(),
        lastSeenAt: null, lastIp: null, revokedAt: null,
      };
      const db = read();
      db.replicas.push(r);
      write(db);
      const url = String(plantUrl).replace(/\/+$/, '');
      return { replica: pub(r), code: encodeCode({ url, token, name: n, id: r.id }) };
    },

    revoke(id) {
      const db = read();
      const r = db.replicas.find(x => x.id === id);
      if (!r) { const e = new Error('Réplica no encontrada'); e.status = 404; throw e; }
      if (!r.revokedAt) { r.revokedAt = iso(); write(db); }
      return pub(r);
    },

    // Réplica activa dueña del token (y registra la conexión), o null
    verify(token, ip) {
      const h = Buffer.from(sha(token), 'hex');
      const db = read();
      let match = null;
      for (const r of db.replicas) {
        if (typeof r.tokenHash !== 'string' || r.tokenHash.length !== 64) continue;
        const same = crypto.timingSafeEqual(h, Buffer.from(r.tokenHash, 'hex'));
        if (same && !r.revokedAt) match = r;
      }
      if (!match) return null;
      const last = match.lastSeenAt ? Date.parse(match.lastSeenAt) : 0;
      const theIp = ip || null;
      if (now() - last >= SEEN_THROTTLE_MS || match.lastIp !== theIp) {
        match.lastSeenAt = iso();
        match.lastIp = theIp;
        write(db);
      }
      return pub(match);
    },
  };
}

module.exports = { createRegistry };
