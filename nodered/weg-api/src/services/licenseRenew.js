'use strict';

// Renovación de licencias emitidas por el panel (license.wleenk.com): si la licencia trae `lid`,
// cada 6 h se manda al servidor y se guarda la que devuelve (extensiones, módulos nuevos o la baja,
// que llega como una licencia ya vencida). Sin internet no pasa nada: sigue la que hay.
// Las firmadas a mano (sin `lid`) no se tocan.

const fs = require('fs');
const path = require('path');
const license = require('./license');

const DEFAULT_URL = 'https://license.wleenk.com';
const EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_MS = 60 * 1000;

function createLicenseRenew({ configDir, state, url = process.env.LICENSE_SERVER_URL ?? DEFAULT_URL, hostname = '', fetchFn = globalThis.fetch, log = console }) {
  const file = path.join(configDir, 'license.key');
  const read = () => { try { return fs.readFileSync(file, 'utf8').trim(); } catch { return ''; } };

  // Devuelve 'sin-gestion' | 'igual' | 'actualizada' | 'rechazada' | 'error'
  async function renewOnce() {
    const text = read();
    const d = text && license.decode(text);
    if (!url || !d || !d.payload || !d.payload.lid) return 'sin-gestion';
    let r;
    try {
      r = await fetchFn(url.replace(/\/$/, '') + '/v1/weg/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license: text, hostname: String(hostname || '').slice(0, 255) }),
        signal: AbortSignal.timeout(15000),
      });
    } catch (e) { log.warn(`[LIC] renovación: sin conexión (${e.message})`); return 'error'; }
    const body = await r.json().catch(() => null);
    if (!r.ok || !body || typeof body.license !== 'string') {
      log.warn(`[LIC] renovación: el servidor respondió ${r.status} ${(body && body.error) || ''}`);
      return 'error';
    }
    const nuevo = body.license.trim();
    if (nuevo === text) return 'igual';
    // Solo se acepta si es para esta instalación y con firma válida (vigente o ya vencida = baja).
    const v = state.verifyText(nuevo);
    if (!v.ok && v.motivo !== 'vencida') { log.warn(`[LIC] renovación: licencia recibida inválida (${v.motivo})`); return 'rechazada'; }
    fs.writeFileSync(file + '.tmp', nuevo + '\n');
    fs.renameSync(file + '.tmp', file);
    state.reload();
    log.log(`[LIC] licencia renovada desde ${url} (${body.status || 'ok'})`);
    return 'actualizada';
  }

  return {
    renewOnce,
    start() {
      if (!url) return;
      const run = () => renewOnce().catch((e) => log.error('[LIC] renovación:', e.message));
      setTimeout(run, FIRST_MS).unref();
      setInterval(run, EVERY_MS).unref();
    },
  };
}

module.exports = { createLicenseRenew, DEFAULT_URL };
