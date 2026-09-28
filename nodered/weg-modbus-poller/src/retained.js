'use strict';

// Tópicos retenidos que hay que borrar al recargar la config. Un retenido
// huérfano deja un equipo "fantasma" en pantalla para siempre (y se copia a la
// réplica de oficina), así que se limpian las bombas borradas y los medidores
// borrados o desactivados. (Las bombas desactivadas las limpia el ciclo de poll.)

function sanitizeTopic(name) {
  return String(name).replace(/[# +/]/g, '_');
}

const POLLED_METER_TYPES = new Set(['PM8000', 'PM7400']);
const activeMeters = (cfg) => new Set((cfg.meters || [])
  .filter((m) => m.enabled !== false && POLLED_METER_TYPES.has(m.type))
  .map((m) => m.name));

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
  return out;
}

module.exports = { sanitizeTopic, topicsToClear };
