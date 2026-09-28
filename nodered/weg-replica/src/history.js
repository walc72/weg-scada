'use strict';

// Sincroniza el histórico de planta por ventanas de tiempo. El cursor solo
// avanza DESPUÉS de escribir OK en el Influx local → un corte nunca deja huecos
// (a lo sumo re-escribe una ventana, y en Influx eso es idempotente).

const IDLE_MS = 30000;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60000;

const isRejected = (e) => e && (e.status === 400 || e.status === 422);

function createHistorySync({ source, write, cursor, sleep, onStatus = () => {}, windowSec = 3600, log = console }) {
  let stopped = false;
  let droppedLines = 0;

  // Escribe un lote; si Influx lo rechaza (400/422) lo parte en mitades para
  // descartar solo las líneas malas (un error de sintaxis rechaza el lote
  // ENTERO). Devuelve las líneas descartadas. Otros errores se propagan.
  async function writeResilient(lines) {
    if (!lines.length) return [];
    try {
      await write(lines.join('\n'));
      return [];
    } catch (e) {
      if (!isRejected(e)) throw e;
      if (lines.length === 1) return lines;
      const mid = Math.ceil(lines.length / 2);
      return [...await writeResilient(lines.slice(0, mid)), ...await writeResilient(lines.slice(mid))];
    }
  }

  // Una ventana; devuelve cuántos ms esperar antes de la próxima
  async function step() {
    let since = cursor.load();
    if (!since) {
      const info = await source.info();
      if (!info || !info.oldest) return IDLE_MS; // planta todavía sin datos
      since = info.oldest;
    }
    const page = await source.points(since, windowSec);
    let rejected = null;
    try {
      await write(page.body);
    } catch (e) {
      // 400/422: reintentar la misma ventana no lo arregla nunca. Se descartan
      // solo las líneas que Influx rechaza y se sigue (si no, queda trabada).
      if (!isRejected(e)) throw e;
      const bad = await writeResilient(String(page.body || '').split('\n').filter(Boolean));
      droppedLines += bad.length;
      rejected = `Influx rechazó ${bad.length} línea(s) de la ventana desde ${since}: ${e.message}`;
      log.error(`[HIST] ${rejected}${bad.length ? ` — primera: ${bad[0].slice(0, 200)}` : ''}`);
    }
    const next = page.next || since;
    if (next !== since) cursor.save(next);
    onStatus({ lastSync: Date.now(), cursor: next, error: rejected, droppedLines });
    return page.more ? 0 : IDLE_MS;
  }

  async function run() {
    let backoff = MIN_BACKOFF_MS;
    while (!stopped) {
      let wait;
      try {
        wait = await step();
        backoff = MIN_BACKOFF_MS;
      } catch (e) {
        log.error(`[HIST] ${e.message}`);
        onStatus({ error: e.message });
        wait = e.status === 401 ? MAX_BACKOFF_MS : backoff;
        backoff = Math.min(backoff * 2, MAX_BACKOFF_MS);
      }
      if (wait && !stopped) await sleep(wait);
    }
  }

  return { step, run, stop() { stopped = true; } };
}

module.exports = { createHistorySync, IDLE_MS, MIN_BACKOFF_MS, MAX_BACKOFF_MS };
