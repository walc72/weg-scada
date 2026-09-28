'use strict';

// Sincroniza el histórico de planta por ventanas de tiempo. El cursor solo
// avanza DESPUÉS de escribir OK en el Influx local → un corte nunca deja huecos
// (a lo sumo re-escribe una ventana, y en Influx eso es idempotente).

const IDLE_MS = 30000;
const MIN_BACKOFF_MS = 5000;
const MAX_BACKOFF_MS = 5 * 60000;

function createHistorySync({ source, write, cursor, sleep, onStatus = () => {}, windowSec = 3600, log = console }) {
  let stopped = false;

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
      // 400/422: Influx rechazó líneas (y escribió las válidas). Reintentar la
      // misma ventana no lo arregla nunca: se registra y se sigue.
      if (e.status !== 400 && e.status !== 422) throw e;
      rejected = `Influx rechazó datos de la ventana desde ${since}: ${e.message}`;
      log.error(`[HIST] ${rejected}`);
    }
    const next = page.next || since;
    if (next !== since) cursor.save(next);
    onStatus({ lastSync: Date.now(), cursor: next, error: rejected });
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
