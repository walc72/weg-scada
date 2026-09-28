'use strict';

// Arranca/para el runtime de réplica cuando cambia la conexión (source o token)
function createManager({ load, start, log = console }) {
  let current = null;
  let key = null;
  function tick() {
    const conn = load();
    const k = conn ? `${conn.source}|${conn.token}` : null;
    if (k === key) return false;
    if (current) { current.stop(); current = null; }
    key = k;
    if (conn) {
      log.log(`[REPLICA] Conexión: ${conn.source} (${conn.from})`);
      current = start(conn);
    } else {
      log.log('[REPLICA] Sin configurar: esperando el código de enlace desde Configuración');
    }
    return true;
  }
  return { tick, connection: () => key };
}

module.exports = { createManager };
