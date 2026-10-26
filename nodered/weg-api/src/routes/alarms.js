'use strict';

const router = require('express').Router();
const alarmLog = require('../services/alarmLog');

const MAX_ROWS = 5000;

// GET /api/alarms?from=<ms>&to=<ms>&device=<nombre> — historial de alarmas
// (inicio/fin) que se solapan con el rango; más recientes primero.
router.get('/', async (req, res) => {
  const num = (v) => (v === undefined || v === '' ? undefined : Number(v));
  const from = num(req.query.from);
  const to = num(req.query.to);
  if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to))) {
    return res.status(400).json({ error: 'from/to deben ser milisegundos' });
  }
  try {
    const rows = await alarmLog.history({ from, to, device: req.query.device || undefined });
    res.json({ alarms: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS });
  } catch (e) {
    res.status(502).json({ error: `No se pudo leer el historial: ${e.message}` });
  }
});

module.exports = router;
