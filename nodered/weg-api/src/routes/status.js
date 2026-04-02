'use strict';

const router = require('express').Router();
const configService = require('../services/config');
const alertService = require('../services/alerts');

// GET /api/status — live status summary
router.get('/', (req, res) => {
  res.json(configService.getLiveStatus());
});

// GET /api/status/:name — single device status
router.get('/device/:name', (req, res) => {
  const state = configService.getDeviceState(req.params.name);
  if (!state) return res.status(404).json({ error: 'Device not found or no data yet' });
  res.json(state);
});

// GET /api/status/alerts — alert history
router.get('/alerts', (req, res) => {
  res.json(alertService.getHistory());
});

module.exports = router;
