'use strict';

// Puente MQTT planta → broker local. Todo weg/# es retained en el poller de
// planta, pero el flag retain solo viaja en los mensajes retenidos iniciales:
// se republica SIEMPRE con retain=true para que el broker local tenga el último
// estado (y un payload vacío borre el retenido, igual que en planta).

function createLiveBridge({ remote, local, topic = 'weg/#', onStatus = () => {}, log = console }) {
  let lastMsgAt = null;
  remote.on('connect', () => {
    remote.subscribe(topic, { qos: 0 });
    onStatus({ live: true });
    log.log('[LIVE] Conectado a planta');
  });
  remote.on('close', () => onStatus({ live: false }));
  remote.on('error', (e) => log.error(`[LIVE] ${e.message}`));
  remote.on('message', (t, payload) => {
    if (t.startsWith('weg/replica/')) return; // estado propio: no re-publicar
    lastMsgAt = Date.now();
    local.publish(t, payload, { qos: 0, retain: true });
  });
  return { lastMessageAt: () => lastMsgAt };
}

module.exports = { createLiveBridge };
