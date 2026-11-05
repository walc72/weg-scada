'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const chokidar = require('chokidar');
const license = require('../services/license');
const { requireSuperadmin } = require('../middleware/auth');

const MAX_TEXT = 8192;
const TICK_MS = 15 * 60 * 1000;
const HORA_URLS = ['https://www.google.com', 'https://www.cloudflare.com'];

// Hora del encabezado Date de un sitio HTTPS (TLS: no se falsifica con el reloj local). null sin internet.
async function horaInternet(urls = HORA_URLS, fetchFn = globalThis.fetch) {
  for (const u of urls) {
    try {
      const r = await fetchFn(u, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
      const t = Date.parse(r.headers.get('date'));
      if (Number.isFinite(t)) return t;
    } catch { /* probar el siguiente */ }
  }
  return null;
}

// Estado de la licencia en memoria; se recarga al escribir license.key o install-id.
// En la réplica la licencia viene de planta: no se ata a su install-id.
// Cada 15 min (tick): guarda la hora de confianza (reloj o internet, la mayor) y recarga, así los vencimientos aplican solos.
function createLicenseState({ configDir, isReplica = false, publicKey = license.PUBLIC_KEYS, interval = 3000, onReload = null, hora = horaInternet }) {
  const opts = { checkInstall: !isReplica, publicKey };
  let lic = license.load(configDir, opts);
  const notify = () => { if (onReload) { try { onReload(lic); } catch (e) { console.error('[LIC] onReload:', e.message); } } };
  const reload = () => { lic = license.load(configDir, opts); notify(); return lic; };
  notify();
  const tick = async () => {
    const net = await hora().catch(() => null);
    try { license.markNow(configDir, Math.max(Date.now(), net || 0)); } catch (e) { console.error('[LIC] reloj:', e.message); }
    return reload();
  };
  return {
    tick,
    isReplica,
    get: () => lic,
    reload,
    verifyText: (text) => license.verify(text, license.readInstallId(configDir), opts),
    watch() {
      const timer = setInterval(tick, TICK_MS);
      timer.unref();
      // Se vigila el directorio (archivos que aún no existen no emiten 'add' de forma fiable)
      const mine = new Set(['license.key', 'install-id']);
      const onFile = (f) => { if (mine.has(path.basename(f))) reload(); };
      const w = chokidar.watch(configDir, { ignoreInitial: true, usePolling: true, interval, depth: 0 })
        .once('ready', () => { tick(); }) // después del escaneo inicial: «reloj» no se escribe a mitad
        .on('add', onFile)
        .on('change', onFile)
        .on('unlink', onFile)
        .on('error', (err) => console.error('[LIC] Watch error:', err.message));
      const close = w.close.bind(w);
      w.close = () => { clearInterval(timer); return close(); };
      return w;
    },
  };
}

function createLicenseRouter({ state, getConfig, configDir }) {
  const router = express.Router();
  const bad = (res, motivo) => res.status(400).json({ error: 'Licencia inválida', motivo });

  router.get('/', (req, res) => {
    const lic = state.get();
    const { installId, ok, motivo, cliente, modulos, limites, vence, vencen, vencidos } = lic;
    res.json({ installId, ok, motivo, cliente, modulos, limites, vence, vencen, vencidos, uso: license.usage(getConfig() || {}, lic) });
  });

  router.put('/', requireSuperadmin, (req, res) => {
    if (state.isReplica) return res.status(403).json({ error: 'Servidor réplica — la licencia viene de planta' });
    const text = req.body && req.body.text;
    if (typeof text !== 'string' || text.length > MAX_TEXT) return bad(res, 'formato');
    const v = state.verifyText(text);
    if (!v.ok) return bad(res, v.motivo);
    const file = path.join(configDir, 'license.key');
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text.trim() + '\n');
    fs.renameSync(tmp, file);
    state.reload();
    res.json({ ok: true });
  });

  return router;
}

module.exports = { createLicenseState, createLicenseRouter, horaInternet };
