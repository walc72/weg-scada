'use strict';

const router = require('express').Router();
const net = require('net');
const configService = require('../services/config');

// ─── Modbus TCP helpers ──────────────────────────────────────────────────────

function modbusReadHolding(ip, port, unitId, startReg, count, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port, timeout: timeoutMs });
    const txId = Math.floor(Math.random() * 0xFFFF);
    const req = Buffer.alloc(12);
    req.writeUInt16BE(txId, 0);      // Transaction ID
    req.writeUInt16BE(0, 2);          // Protocol ID
    req.writeUInt16BE(6, 4);          // Length
    req.writeUInt8(unitId, 6);        // Unit ID
    req.writeUInt8(3, 7);             // Function code: Read Holding Registers
    req.writeUInt16BE(startReg, 8);   // Start address
    req.writeUInt16BE(count, 10);     // Register count

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => socket.write(req));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout')); });
    socket.on('error', reject);
    socket.on('data', (data) => {
      socket.destroy();
      if (data.length < 9 || data[7] !== 3) return reject(new Error('bad response'));
      const byteCount = data[8];
      const regs = [];
      for (let i = 0; i < byteCount / 2; i++) {
        regs.push(data.readUInt16BE(9 + i * 2));
      }
      resolve(regs);
    });
  });
}

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
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array of devices' });

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
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  res.json(cfg.gateways || []);
});

// PUT /api/config/gateways
router.put('/gateways', (req, res) => {
  const cfg = configService.get();
  if (!cfg) return res.status(500).json({ error: 'Cannot read config' });
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected array of gateways' });
  cfg.gateways = req.body;
  if (configService.save(cfg)) {
    res.json({ ok: true });
  } else {
    res.status(500).json({ error: 'Cannot save config' });
  }
});

// POST /api/config/scan-gateway
// Escanea un gateway PLC buscando SSW900 en slots 0-5 (regOffset 0,70,140...)
// Devuelve los slots detectados con sus offsets sugeridos
router.post('/scan-gateway', async (req, res) => {
  const { ip, port = 502, unitId = 1 } = req.body;
  if (!ip) return res.status(400).json({ error: 'ip required' });

  const MAX_SLOTS = 6;
  const REGS_PER_DRIVE = 70;
  const STATUS_BASE = 140;   // PLC %MW donde inicia el bloque de estado del primer drive
  const STATUS_STRIDE = 12;  // registros de estado por drive

  const results = [];

  for (let slot = 0; slot < MAX_SLOTS; slot++) {
    const regOffset = slot * REGS_PER_DRIVE;
    const statusOffset = STATUS_BASE + slot * STATUS_STRIDE;

    try {
      // Leer bloque de datos (70 registros) del slot
      const dataRegs = await modbusReadHolding(ip, port, unitId, regOffset, 70);
      // Leer bloque de estado (12 registros) del slot
      const statusRegs = await modbusReadHolding(ip, port, unitId, statusOffset, 12).catch(() => null);

      // Indicadores de vida: corriente (regs 24-25), tensión (reg 4), horas (regs 42-43)
      const current = ((dataRegs[24] || 0) + ((dataRegs[25] || 0) << 16)) / 10;
      const voltage = (dataRegs[4] || 0) / 10;
      const hoursPowered = ((dataRegs[42] || 0) + ((dataRegs[43] || 0) << 16)) / 3600;
      const statusWord = statusRegs ? (statusRegs[1] || 0) : 0;
      const sswStatus = statusRegs ? (statusRegs[0] || 0) : 0;

      // Un slot tiene drive si: tiene horas encendido, o tensión, o corriente, o statusWord != 0
      const hasLife = hoursPowered > 0 || voltage > 0 || current > 0 || statusWord !== 0;
      // Un slot vacío: todos los registros clave son 0
      const allZero = dataRegs.slice(0, 50).every(r => r === 0);

      const SSW_STATES = ['READY','INITIAL_TEST','FAULT','RAMP_UP','FULL_VOLTAGE','BYPASS',
        'RESERVED','RAMP_DOWN','BRAKING','FWD_REV','JOG','START_DELAY','RESTART_DELAY',
        'GENERAL_DISABLED','CONFIGURATION'];

      results.push({
        slot,
        regOffset,
        statusOffset,
        detected: hasLife || !allZero,
        current: +current.toFixed(1),
        voltage: +voltage.toFixed(1),
        hoursPowered: +hoursPowered.toFixed(1),
        statusWord,
        sswStatus,
        statusText: SSW_STATES[sswStatus] || 'UNKNOWN',
      });
    } catch (e) {
      // Si el slot falla completamente (timeout), no hay más drives
      results.push({ slot, regOffset, statusOffset, detected: false, error: e.message });
      if (slot > 0) break; // Solo el primer slot sin respuesta detiene el scan
    }
  }

  res.json({ ip, port, unitId, slots: results });
});

module.exports = router;
