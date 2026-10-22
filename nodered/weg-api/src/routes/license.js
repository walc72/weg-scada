'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const chokidar = require('chokidar');
const license = require('../services/license');
const { requireSuperadmin } = require('../middleware/auth');

const MAX_TEXT = 8192;

// Estado de la licencia en memoria; se recarga al escribir license.key o install-id.
// En la réplica la licencia viene de planta: no se ata a su install-id.
function createLicenseState({ configDir, isReplica = false, publicKey = license.PUBLIC_KEY, interval = 3000 }) {
  const opts = { checkInstall: !isReplica, publicKey };
  let lic = license.load(configDir, opts);
  const reload = () => { lic = license.load(configDir, opts); return lic; };
  return {
    isReplica,
    get: () => lic,
    reload,
    verifyText: (text) => license.verify(text, license.readInstallId(configDir), opts),
    watch() {
      // Se vigila el directorio (archivos que aún no existen no emiten 'add' de forma fiable)
      const mine = new Set(['license.key', 'install-id']);
      const onFile = (f) => { if (mine.has(path.basename(f))) reload(); };
      return chokidar.watch(configDir, { ignoreInitial: true, usePolling: true, interval, depth: 0 })
        .on('add', onFile)
        .on('change', onFile)
        .on('error', (err) => console.error('[LIC] Watch error:', err.message));
    },
  };
}

function createLicenseRouter({ state, getConfig, configDir }) {
  const router = express.Router();
  const bad = (res, motivo) => res.status(400).json({ error: 'Licencia inválida', motivo });

  router.get('/', (req, res) => {
    const { installId, ok, motivo, cliente, modulos, limites } = state.get();
    res.json({ installId, ok, motivo, cliente, modulos, limites, uso: license.usage(getConfig() || {}) });
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

module.exports = { createLicenseState, createLicenseRouter };
