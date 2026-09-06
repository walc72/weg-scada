'use strict';

// ─── Validacion de esquema de config.json ────────────────────────────
// Sin esto, un PUT malformado se escribia a disco tal cual; el poller lo
// recargaba, fallaba en cfg.devices.length y caia a un default con lista
// de dispositivos vacia — todo el polling se detenia en silencio.

const DEVICE_TYPES = new Set(['CFW900', 'SSW900']);

function isNonEmptyString(v, max = 64) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function isHost(v) {
  // IPv4 o hostname simple; suficiente para red industrial
  return isNonEmptyString(v, 253) && /^[a-zA-Z0-9._-]+$/.test(v);
}

function isPort(v) {
  return v === undefined || (Number.isInteger(v) && v >= 1 && v <= 65535);
}

function isUnitId(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && v <= 255);
}

function isOffset(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && v <= 65535);
}

function validateDevice(d, i, errors) {
  const tag = `devices[${i}]`;
  if (!d || typeof d !== 'object' || Array.isArray(d)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(d.name)) errors.push(`${tag}: name requerido (string no vacio, max 64)`);
  if (!DEVICE_TYPES.has(d.type)) errors.push(`${tag} (${d.name}): type debe ser CFW900 o SSW900`);
  if (!isHost(d.ip)) errors.push(`${tag} (${d.name}): ip invalida`);
  if (!isPort(d.port)) errors.push(`${tag} (${d.name}): port invalido (1-65535)`);
  if (!isUnitId(d.unitId)) errors.push(`${tag} (${d.name}): unitId invalido (0-255)`);
  if (!isOffset(d.regOffset)) errors.push(`${tag} (${d.name}): regOffset invalido`);
  if (!isOffset(d.statusOffset)) errors.push(`${tag} (${d.name}): statusOffset invalido`);
  if (d.enabled !== undefined && typeof d.enabled !== 'boolean') errors.push(`${tag} (${d.name}): enabled debe ser boolean`);
}

function validateGateway(g, i, errors) {
  const tag = `gateways[${i}]`;
  if (!g || typeof g !== 'object' || Array.isArray(g)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(g.name)) errors.push(`${tag}: name requerido`);
  if (!isHost(g.ip)) errors.push(`${tag} (${g.name}): ip invalida`);
  if (!isPort(g.port)) errors.push(`${tag} (${g.name}): port invalido`);
}

function validateMeter(m, i, errors) {
  const tag = `meters[${i}]`;
  if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(m.name)) errors.push(`${tag}: name requerido`);
  if (!isNonEmptyString(m.type, 32)) errors.push(`${tag} (${m.name}): type requerido`);
  if (!isHost(m.ip)) errors.push(`${tag} (${m.name}): ip invalida`);
  if (!isPort(m.port)) errors.push(`${tag} (${m.name}): port invalido`);
  if (!isUnitId(m.unitId)) errors.push(`${tag} (${m.name}): unitId invalido`);
  if (m.regs !== undefined) {
    if (!m.regs || typeof m.regs !== 'object' || Array.isArray(m.regs)) {
      errors.push(`${tag} (${m.name}): regs debe ser un objeto`);
    } else {
      for (const [k, v] of Object.entries(m.regs)) {
        if (!Number.isInteger(v) || v < 0) errors.push(`${tag} (${m.name}): regs.${k} debe ser entero >= 0`);
      }
    }
  }
  if (m.waveform !== undefined) {
    const wf = m.waveform;
    if (!wf || typeof wf !== 'object' || Array.isArray(wf)) {
      errors.push(`${tag} (${m.name}): waveform debe ser un objeto`);
    } else {
      if (wf.freqReg !== undefined && (!Number.isInteger(wf.freqReg) || wf.freqReg < 1)) {
        errors.push(`${tag} (${m.name}): waveform.freqReg invalido`);
      }
      if (wf.numHarmonics !== undefined && (!Number.isInteger(wf.numHarmonics) || wf.numHarmonics < 1 || wf.numHarmonics > 63)) {
        errors.push(`${tag} (${m.name}): waveform.numHarmonics debe ser 1-63`);
      }
      if (wf.channels !== undefined) {
        if (!wf.channels || typeof wf.channels !== 'object' || Array.isArray(wf.channels)) {
          errors.push(`${tag} (${m.name}): waveform.channels debe ser un objeto`);
        } else {
          for (const [k, v] of Object.entries(wf.channels)) {
            if (!Number.isInteger(v) || v < 1) errors.push(`${tag} (${m.name}): waveform.channels.${k} invalido`);
          }
        }
      }
    }
  }
}

// Devuelve una lista de errores; vacia si la config es valida.
function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return ['la config debe ser un objeto JSON'];
  }

  if (!Array.isArray(cfg.devices)) {
    errors.push('devices debe ser un array');
  } else {
    cfg.devices.forEach((d, i) => validateDevice(d, i, errors));
    const names = cfg.devices.map(d => d && d.name).filter(Boolean);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) errors.push(`nombres de dispositivos duplicados: ${[...new Set(dupes)].join(', ')}`);
  }

  if (cfg.gateways !== undefined) {
    if (!Array.isArray(cfg.gateways)) errors.push('gateways debe ser un array');
    else cfg.gateways.forEach((g, i) => validateGateway(g, i, errors));
  }

  if (cfg.meters !== undefined) {
    if (!Array.isArray(cfg.meters)) errors.push('meters debe ser un array');
    else cfg.meters.forEach((m, i) => validateMeter(m, i, errors));
  }

  if (cfg.pollIntervalMs !== undefined && (!Number.isInteger(cfg.pollIntervalMs) || cfg.pollIntervalMs < 500)) {
    errors.push('pollIntervalMs debe ser entero >= 500');
  }
  if (cfg.influxWriteIntervalMs !== undefined && (!Number.isInteger(cfg.influxWriteIntervalMs) || cfg.influxWriteIntervalMs < 1000)) {
    errors.push('influxWriteIntervalMs debe ser entero >= 1000');
  }

  for (const key of ['mqtt', 'influxdb', 'alarmSetpoints', 'gaugeZones', 'meterNames']) {
    if (cfg[key] !== undefined && (cfg[key] === null || typeof cfg[key] !== 'object' || Array.isArray(cfg[key]))) {
      errors.push(`${key} debe ser un objeto`);
    }
  }

  return errors;
}

module.exports = { validateConfig, validateDevice, validateGateway };
