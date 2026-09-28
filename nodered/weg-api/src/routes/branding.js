'use strict';

const express = require('express');
const branding = require('../services/branding');
const { authenticate, requireSuperadmin } = require('../middleware/auth');

// Se monta ANTES del express.json global (1 MB) porque el PUT trae el logo en
// base64 (~1,4 MB para 1 MB de imagen). El parser de 2 MB se aplica DESPUÉS de
// autenticar, así un anónimo no nos hace parsear 2 MB.
const router = express.Router();

// Público: el login lo necesita antes de autenticarse
router.get('/', (req, res) => res.json(branding.get()));

router.get('/logo', (req, res) => {
  res.set('Cache-Control', 'no-cache'); // revalida con ETag/Last-Modified (los pone sendFile)
  res.sendFile(branding.logoPath());
});

router.put('/', authenticate, requireSuperadmin, express.json({ limit: '2mb' }), (req, res) => {
  try {
    res.json(branding.set(req.body));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/', authenticate, requireSuperadmin, (req, res) => {
  res.json(branding.reset());
});

module.exports = router;
