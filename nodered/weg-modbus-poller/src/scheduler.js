'use strict';

// Planificador por conexión. Antes había un único ciclo que esperaba a TODOS
// los grupos: un gateway RS-485 lento (ADAM con 5 arrancadores, ~9 s por
// vuelta) frenaba a todos los equipos, que se actualizaban cada ~9 s y el
// dashboard los marcaba "desactualizados". Ahora cada conexión (ip:port) corre
// a su propio ritmo: la que tarda más no demora a las demás.
//
// tick() se llama seguido (p.ej. cada 250 ms): arranca cada grupo que no esté
// corriendo y al que ya le toque. Los grupos se recalculan en cada tick, así
// un cambio de config (altas/bajas de equipos) se toma solo.

function createScheduler({ intervalMs, getGroups, runGroup, onCycle = null, now = Date.now }) {
  const state = new Map(); // key -> { busy, nextAt, cycleMs }

  function tick() {
    const groups = getGroups();
    for (const k of state.keys()) if (!groups.has(k) && !state.get(k).busy) state.delete(k);
    const t = now();
    const interval = typeof intervalMs === 'function' ? intervalMs() : intervalMs;
    for (const [k, payload] of groups) {
      let s = state.get(k);
      if (!s) { s = { busy: false, nextAt: 0, cycleMs: null }; state.set(k, s); }
      if (s.busy || t < s.nextAt) continue;
      s.busy = true;
      const t0 = t;
      Promise.resolve()
        .then(() => runGroup(k, payload, s))
        .catch((e) => console.error(`[POLL] ${k}: ${e.message}`))
        .finally(() => {
          const dt = now() - t0;
          // Duración típica de la vuelta (promedio móvil): se publica con cada
          // equipo para que el dashboard sepa cada cuánto esperar datos.
          s.cycleMs = s.cycleMs == null ? dt : Math.round(s.cycleMs * 0.7 + dt * 0.3);
          s.busy = false;
          // Ritmo fijo desde el inicio; si la vuelta tardó más, la próxima sale ya
          s.nextAt = t0 + interval;
          if (onCycle) onCycle(k, dt, s);
        });
    }
  }

  return { tick, state, cycleMs: (k) => (state.get(k) || {}).cycleMs };
}

// Cuántas lecturas fallidas seguidas hacen falta para dar un equipo por caído.
// Antes alcanzaba una: un timeout suelto lo mostraba OFFLINE un ciclo.
const OFFLINE_AFTER = 3;

// Qué hacer con un equipo según sus fallas seguidas (0 = la lectura anduvo):
//   'online'  → publicar la lectura nueva
//   'hold'    → falla suelta: no publicar nada (queda el último dato, que el
//               dashboard ve envejecer) ni escribir en InfluxDB
//   'offline' → publicar estado OFFLINE
function commDecision(failures, wasOnline, threshold = OFFLINE_AFTER) {
  if (failures === 0) return 'online';
  if (wasOnline && failures < threshold) return 'hold';
  return 'offline';
}

// Reintento espaciado de equipos caídos. Detrás de un gateway RS-485 cada
// equipo que no contesta cuesta la espera completa del gateway (~2 s en el
// ADAM) en CADA vuelta, y eso frena a los que sí andan. Una vez confirmado
// OFFLINE, se lo vuelve a probar cada `retryMs` (por defecto 30 s).
const OFFLINE_RETRY_MS = 30000;
function createRetryGate(retryMs = OFFLINE_RETRY_MS) {
  const nextAt = new Map();
  return {
    // ¿saltear la lectura de este equipo en esta vuelta?
    skip: (name, now = Date.now()) => nextAt.has(name) && now < nextAt.get(name),
    offline: (name, now = Date.now()) => nextAt.set(name, now + retryMs),
    online: (name) => nextAt.delete(name),
  };
}

module.exports = { createScheduler, commDecision, OFFLINE_AFTER, createRetryGate, OFFLINE_RETRY_MS };
