'use strict';

// Puente MQTT planta → broker local. Todo weg/# es retained en el poller de
// planta, pero el flag retain solo viaja en los mensajes retenidos iniciales:
// se republica SIEMPRE con retain=true para que el broker local tenga el último
// estado (y un payload vacío borre el retenido, igual que en planta).
//
// Equipos fantasma: si la oficina estaba desconectada cuando la planta borró o
// desactivó un equipo, ese borrado no llega nunca. Por eso, SETTLE_MS después
// de cada conexión, se borran en el broker local los retenidos de equipos y
// medidores que la planta no mandó (la planta publica todos cada ~2 s).

const SETTLE_MS = 15000;
const PRUNABLE = /^weg\/(drives|meters)\//;

function createLiveBridge({ remote, local, topic = 'weg/#', onStatus = () => {}, log = console,
  settleMs = SETTLE_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  let lastMsgAt = null;
  const localRetained = new Set(); // equipos/medidores con retenido en el broker local
  let seen = null;                 // tópicos recibidos de planta desde la última conexión
  let timer = null;

  if (typeof local.subscribe === 'function') {
    local.subscribe('weg/drives/+');
    local.subscribe('weg/meters/+');
    local.on('message', (t, payload) => {
      if (!PRUNABLE.test(t)) return;
      if (payload && payload.length) localRetained.add(t); else localRetained.delete(t);
    });
  }

  function prune() {
    timer = null;
    if (!seen) return;
    for (const t of [...localRetained]) {
      if (seen.has(t)) continue;
      local.publish(t, '', { qos: 0, retain: true });
      localRetained.delete(t);
      log.log(`[LIVE] ${t} ya no existe en planta: borrado`);
    }
  }

  remote.on('connect', () => {
    remote.subscribe(topic, { qos: 0 });
    onStatus({ live: true });
    log.log('[LIVE] Conectado a planta');
    seen = new Set();
    if (timer) clearTimer(timer);
    timer = setTimer(prune, settleMs);
  });
  remote.on('close', () => {
    onStatus({ live: false });
    seen = null;
    if (timer) { clearTimer(timer); timer = null; }
  });
  remote.on('error', (e) => log.error(`[LIVE] ${e.message}`));
  remote.on('message', (t, payload) => {
    if (t.startsWith('weg/replica/')) return; // estado propio: no re-publicar
    lastMsgAt = Date.now();
    if (seen && payload && payload.length) seen.add(t);
    local.publish(t, payload, { qos: 0, retain: true });
  });
  return { lastMessageAt: () => lastMsgAt };
}

module.exports = { createLiveBridge };
