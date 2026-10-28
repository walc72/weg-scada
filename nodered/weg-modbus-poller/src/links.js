'use strict';

// Enlace de comunicaciones (radio/router en comms[]) por el que llega cada
// equipo de campo. Si el equipo no responde y su enlace está caído, se publica
// `sinEnlace: <nombre>` para que la tarjeta muestre la causa.

const LISTS = { device: 'devices', meter: 'meters', flowmeter: 'flowmeters' };

// device con gateway → enlace del gateway; enlace que no está en comms[] → null
function linkOf(item, kind, config) {
  let name = item.enlace;
  if (kind === 'device' && item.gateway != null) {
    const gw = (config.gateways || []).find((g) => g.name === item.gateway);
    name = gw && gw.enlace;
  }
  if (!name || !(config.comms || []).some((c) => c.name === name)) return null;
  return name;
}

// commState: (nombre) => estado del tracker | undefined
function withLink(data, item, kind, config, commState) {
  const { sinEnlace, ...rest } = data;
  const link = data.online === false ? linkOf(item, kind, config) : null;
  const st = link && commState(link);
  return st && st.online === false ? { ...rest, sinEnlace: link } : rest;
}

function dependents(name, config) {
  const out = [];
  for (const [kind, key] of Object.entries(LISTS)) {
    // desactivados no: su retenido ya se limpió y no hay que revivirlo
    for (const item of config[key] || []) if (item.enabled !== false && linkOf(item, kind, config) === name) out.push({ kind, item });
  }
  return out;
}

module.exports = { linkOf, withLink, dependents };
