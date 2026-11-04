'use strict';

// Resumen para las tarjetas de motores del Dashboard: desde cuándo cada bomba está en su
// estado actual (marcha / parada / falla / sin comunicación) y su corriente de la última
// hora (un valor por minuto). Misma línea de estados que el detalle del motor (estados.js);
// un corte de comunicación toma el inicio real de la alarma abierta aunque pase las 24 h.

const reports = require('./reports');
const alarmLog = require('./alarmLog');
const configService = require('./config');
const { linea } = require('./estados');

const VENTANA_MS = 864e5;     // historia mirada para «desde»
const EVERY = 60;             // s por ranura
const SERIE_MIN = 60;         // minutos de corriente
const CACHE_MS = 60e3;

// devs: [{ name }]; run: Map name -> [{ t, running }]; cur: Map name -> Map(t -> A); alarmas: intervalos de alarmLog
function armar({ devs, run, cur, alarmas, desde, ahora }) {
  const out = {};
  const min0 = Math.floor(ahora / 60e3) * 60e3 - (SERIE_MIN - 1) * 60e3;
  for (const { name } of devs) {
    const al = alarmas.filter((a) => a.device === name);
    const { tramos } = linea({ tipo: 'motor', muestras: run.get(name) || [], alarmas: al, desde, hasta: ahora, every: EVERY, ahora });
    let ult = tramos[tramos.length - 1];
    // La ranura en curso puede no tener muestra todavía: no es un cambio de estado
    if (ult && ult.estado === 'sin_datos' && tramos.length > 1 && ahora - ult.desde < 5 * 60e3) ult = tramos[tramos.length - 2];
    if (!ult) continue;
    let t = ult.desde;
    let mas24h = t <= desde;
    if (ult.estado === 'sin_com') {
      const a = al.find((x) => x.type === 'SIN_COMUNICACION' && x.end == null);
      if (a) { t = a.start; mas24h = false; }   // inicio real, aunque sea de hace días
    }
    const c = cur.get(name) || new Map();
    out[name] = {
      estado: ult.estado,
      desde: t,
      mas24h,
      corriente: Array.from({ length: SERIE_MIN }, (_, i) => c.get(min0 + i * 60e3) ?? null),
    };
  }
  return out;
}

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

async function filas(campo, desde, hasta, every, fn) {
  const q = `from(bucket: "weg_drives")
  |> range(start: ${new Date(desde).toISOString()}, stop: ${new Date(hasta).toISOString()})
  |> filter(fn: (r) => r._measurement == "drive_data" and r._field == "${campo}")
  |> map(fn: (r) => ({ r with _value: float(v: r._value) }))
  |> aggregateWindow(every: ${every}s, fn: ${fn}, createEmpty: false, timeSrc: "_start")
  |> keep(columns: ["_time", "_value", "name"])`;
  return reports.queryInflux(q);
}

let cache = null;
async function tarjetas(ahora = Date.now()) {
  if (cache && ahora - cache.t < CACHE_MS) return cache.data;
  const cfg = configService.get() || {};
  const devs = (cfg.devices || []).filter((d) => d && d.enabled !== false && !d.fueraServicio);
  const desde = Math.floor((ahora - VENTANA_MS) / (EVERY * 1000)) * EVERY * 1000;
  const desdeSerie = Math.floor(ahora / 60e3) * 60e3 - (SERIE_MIN - 1) * 60e3;
  const [fr, fc, alarmas] = await Promise.all([
    filas('running', desde, ahora, EVERY, 'last'),
    filas('current', desdeSerie, ahora, 60, 'mean'),
    alarmLog.history({ from: desde, to: ahora }),
  ]);
  const run = new Map(), cur = new Map();
  for (const r of fr) {
    const t = Date.parse(r._time), v = Number(r._value);
    if (!r.name || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    if (!run.has(r.name)) run.set(r.name, []);
    run.get(r.name).push({ t, running: v >= 0.5 ? 1 : 0 });
  }
  for (const r of fc) {
    const t = Date.parse(r._time), v = Number(r._value);
    if (!r.name || !Number.isFinite(t) || !Number.isFinite(v)) continue;
    if (!cur.has(r.name)) cur.set(r.name, new Map());
    cur.get(r.name).set(t, Math.round(v * 10) / 10);
  }
  const data = armar({ devs, run, cur, alarmas, desde, ahora });
  cache = { t: ahora, data };
  return data;
}

module.exports = { tarjetas, armar, SERIE_MIN };
