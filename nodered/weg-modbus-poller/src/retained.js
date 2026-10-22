'use strict';

// Tópicos retenidos que hay que borrar al recargar la config. Un retenido
// huérfano deja un equipo "fantasma" en pantalla para siempre (y se copia a la
// réplica de oficina), así que se limpian las bombas borradas y los medidores
// borrados o desactivados (también los caudalímetros). (Las bombas desactivadas las limpia el ciclo de poll.)

function sanitizeTopic(name) {
  return String(name).replace(/[# +/]/g, '_');
}

const POLLED_METER_TYPES = new Set(['PM8000', 'PM7400']);
const activeMeters = (cfg) => new Set((cfg.meters || [])
  .filter((m) => m.enabled !== false && POLLED_METER_TYPES.has(m.type))
  .map((m) => m.name));
const activeFlowmeters = (cfg) => new Set((cfg.flowmeters || []).filter((f) => f.enabled !== false).map((f) => f.name));

function topicsToClear(oldCfg, newCfg) {
  const prefix = (newCfg.mqtt && newCfg.mqtt.topicPrefix) || 'weg/drives';
  const out = [];
  const newDevices = new Set((newCfg.devices || []).map((d) => d.name));
  for (const d of oldCfg.devices || []) {
    if (!newDevices.has(d.name)) out.push(`${prefix}/${sanitizeTopic(d.name)}`);
  }
  const now = activeMeters(newCfg);
  for (const name of activeMeters(oldCfg)) {
    if (!now.has(name)) out.push(`weg/meters/${sanitizeTopic(name)}`);
  }
  const fmNow = activeFlowmeters(newCfg);
  for (const name of activeFlowmeters(oldCfg)) {
    if (!fmNow.has(name)) out.push(`weg/flow/${sanitizeTopic(name)}`);
  }
  return out;
}

// Equipos habilitados que la licencia no deja leer: se publican como "excedido".
function excededTopics(cfg, allowed) {
  const prefix = (cfg.mqtt && cfg.mqtt.topicPrefix) || 'weg/drives';
  const out = [];
  for (const d of cfg.devices || []) {
    if (d.enabled !== false && !allowed.devices.has(d.name)) out.push({ topic: `${prefix}/${sanitizeTopic(d.name)}`, name: d.name, kind: 'device' });
  }
  for (const name of activeMeters(cfg)) {
    if (!allowed.meters.has(name)) out.push({ topic: `weg/meters/${sanitizeTopic(name)}`, name, kind: 'meter' });
  }
  for (const name of activeFlowmeters(cfg)) {
    if (!(allowed.flowmeters && allowed.flowmeters.has(name))) out.push({ topic: `weg/flow/${sanitizeTopic(name)}`, name, kind: 'flowmeter' });
  }
  return out;
}

module.exports = { sanitizeTopic, topicsToClear, excededTopics };
