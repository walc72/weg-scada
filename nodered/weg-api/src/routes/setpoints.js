'use strict';

const router = require('express').Router();
const configService = require('../services/config');

// GET /api/setpoints — all setpoints (defaults + overrides + merged per device)
router.get('/', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });

  const sp = cfg.alarmSetpoints || { defaults: {}, overrides: {} };
  const merged = (cfg.devices || []).map(d => {
    const typeDef = sp.defaults[d.type] || {};
    const ovr = (sp.overrides || {})[d.name] || {};
    return {
      name: d.name,
      type: d.type,
      site: d.site,
      setpoints: { ...typeDef, ...ovr },
      hasOverride: Object.keys(ovr).length > 0
    };
  });

  res.json({ defaults: sp.defaults, overrides: sp.overrides, devices: merged });
});

// PUT /api/setpoints/defaults/:type — update defaults for a drive type
router.put('/defaults/:type', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  if (!cfg.alarmSetpoints) cfg.alarmSetpoints = { defaults: {}, overrides: {} };

  cfg.alarmSetpoints.defaults[req.params.type] = req.body;
  if (configService.save(cfg)) {
    res.json({ ok: true, type: req.params.type, setpoints: req.body });
  } else {
    res.status(500).json({ error: 'Cannot save' });
  }
});

// PUT /api/setpoints/device/:name — set override for a specific device
router.put('/device/:name', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  if (!cfg.alarmSetpoints) cfg.alarmSetpoints = { defaults: {}, overrides: {} };
  if (!cfg.alarmSetpoints.overrides) cfg.alarmSetpoints.overrides = {};

  cfg.alarmSetpoints.overrides[req.params.name] = req.body;
  if (configService.save(cfg)) {
    res.json({ ok: true, device: req.params.name, overrides: req.body });
  } else {
    res.status(500).json({ error: 'Cannot save' });
  }
});

// DELETE /api/setpoints/device/:name — remove override (back to defaults)
router.delete('/device/:name', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  if (cfg.alarmSetpoints && cfg.alarmSetpoints.overrides) {
    delete cfg.alarmSetpoints.overrides[req.params.name];
    configService.save(cfg);
  }
  res.json({ ok: true });
});

// PUT /api/setpoints/bulk — save all overrides at once (from UI)
router.put('/bulk', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  if (!cfg.alarmSetpoints) cfg.alarmSetpoints = { defaults: {}, overrides: {} };

  if (req.body.defaults) cfg.alarmSetpoints.defaults = req.body.defaults;
  if (req.body.overrides) cfg.alarmSetpoints.overrides = req.body.overrides;

  if (configService.save(cfg)) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Cannot save' });
  }
});

module.exports = router;
