'use strict';

const router = require('express').Router();
const configService = require('../services/config');

// GET /api/config — full config
router.get('/', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  res.json(cfg);
});

// PUT /api/config — save full config
router.put('/', (req, res) => {
  if (configService.save(req.body)) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Cannot save config' });
  }
});

// GET /api/config/devices — device list
router.get('/devices', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  res.json(cfg.devices || []);
});

// PUT /api/config/devices — update device list
router.put('/devices', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });

  cfg.devices = req.body;
  if (configService.save(cfg)) {
    res.json({ ok: true, count: cfg.devices.length });
  } else {
    res.status(500).json({ error: 'Cannot save config' });
  }
});

// POST /api/config/devices — add a device
router.post('/devices', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });

  const dev = req.body;
  if (!dev.name || !dev.type) return res.status(400).json({ error: 'name and type required' });

  // Check duplicate
  if (cfg.devices.find(d => d.name === dev.name)) {
    return res.status(409).json({ error: 'Device already exists' });
  }

  cfg.devices.push(dev);
  if (configService.save(cfg)) {
    res.status(201).json(dev);
  } else {
    res.status(500).json({ error: 'Cannot save config' });
  }
});

// DELETE /api/config/devices/:name — remove a device
router.delete('/devices/:name', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });

  const idx = cfg.devices.findIndex(d => d.name === req.params.name);
  if (idx === -1) return res.status(404).json({ error: 'Device not found' });

  cfg.devices.splice(idx, 1);

  // Also clean setpoint overrides
  if (cfg.alarmSetpoints && cfg.alarmSetpoints.overrides) {
    delete cfg.alarmSetpoints.overrides[req.params.name];
  }

  if (configService.save(cfg)) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Cannot save config' });
  }
});

// GET /api/config/gateways
router.get('/gateways', (req, res) => {
  const cfg = configService.get();
  res.json(cfg.gateways || []);
});

// PUT /api/config/gateways
router.put('/gateways', (req, res) => {
  const cfg = configService.get();
  cfg.gateways = req.body;
  configService.save(cfg);
  res.json({ ok: true });
});

module.exports = router;
