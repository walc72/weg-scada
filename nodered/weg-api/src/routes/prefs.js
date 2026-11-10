'use strict';

// Preferencias del usuario de la sesión (cualquier rol). Siempre se opera sobre
// req.auth.user. El predeterminado del Dashboard solo lo cambia un admin.
const router = require('express').Router();
const prefs = require('../services/prefs');
const { requireAdmin } = require('../middleware/auth');

const fail = (res, e) => res.status(e.status || 400).json({ error: e.message });
const hacer = (fn) => (req, res) => {
  try { fn(req); res.json({ ok: true }); } catch (e) { fail(res, e); }
};

router.get('/', (req, res) => res.json(prefs.getDe(req.auth.user)));

// Antes que /:clave
router.put('/defecto/dashboard', requireAdmin, hacer((req) => prefs.setDefecto(req.body)));
router.delete('/defecto/dashboard', requireAdmin, hacer(() => prefs.borrarDefecto()));

router.put('/:clave', hacer((req) => prefs.set(req.auth.user, req.params.clave, req.body)));
router.delete('/:clave', hacer((req) => prefs.borrar(req.auth.user, req.params.clave)));

module.exports = router;
