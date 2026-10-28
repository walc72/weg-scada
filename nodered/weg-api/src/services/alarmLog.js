'use strict';

// Historial de alarmas. Registra en InfluxDB (measurement alarm_events) el
// inicio y el fin de cada alarma por equipo: un punto por transición, tags
// device/type y fields status ("start"|"end") y text. Usa las mismas banderas
// que publica el poller y muestra el Dashboard, así el historial coincide con
// "Alarmas activas". Independiente del cooldown de avisos de alerts.js.

const http = require('http');
const configService = require('./config');
const { queryAnnotatedCsv, bucket } = require('./influxRaw');
const { parseAnnotatedCsv } = require('./lineProtocol');

const MEASUREMENT = 'alarm_events';
const MAX_PENDING = 1000;

// Alarmas activas de un equipo: { TIPO: texto }
function activeAlarms(d) {
  // sinEnlace llega ~60-90 s después de que el equipo cae: el texto se actualiza (evento "text").
  if (d.online === false) return { SIN_COMUNICACION: d.sinEnlace ? `Sin enlace (${d.sinEnlace})` : 'Comunicación perdida' };
  const out = {};
  if (d.hasFault) out.FALLA = d.faultText || 'Falla';
  if (d.hasAlarm) out.ALARMA_EQUIPO = d.alarmText || 'Alarma del equipo';
  if (d.alarmCurrentHigh) out.CORRIENTE_ALTA = `Corriente alta ${Math.round(d.current || 0)}A (>${d.spCurrentHigh})`;
  if (d.alarmTempHigh) {
    const t = d.type === 'SSW900' ? d.scrTemp : d.igbtTemp;
    out.TEMP_ALTA = `Temp alta ${Math.round(t || 0)}°C (>${d.spTempHigh})`;
  }
  if (d.alarmCommHigh) out.ERRORES_COMM = `Errores comm ${d.commErrors} (>${d.spCommErrorMax})`;
  return out;
}

// Compara el estado actual con las alarmas abiertas (Map "device|type" ->
// {device,type,text,start}); actualiza `open` y devuelve los eventos nuevos.
// Un equipo que deja de figurar (deshabilitado, fuera de licencia) cierra lo suyo.
function step(open, states, now) {
  const events = [];
  const seen = new Set();
  for (const [name, d] of states) {
    if (d.license === 'excedido') continue;
    for (const [type, text] of Object.entries(activeAlarms(d))) {
      const k = `${name}|${type}`;
      seen.add(k);
      if (open.has(k)) {
        const o = open.get(k);
        if (type === 'SIN_COMUNICACION' && o.text !== text) {
          o.text = text;
          events.push({ device: name, type, status: 'text', text, ts: now });
        }
        continue;
      }
      open.set(k, { device: name, type, text, start: now });
      events.push({ device: name, type, status: 'start', text, ts: now });
    }
  }
  for (const [k, a] of open) {
    if (seen.has(k)) continue;
    open.delete(k);
    events.push({ device: a.device, type: a.type, status: 'end', text: a.text, ts: now });
  }
  return events;
}

// Eventos (cualquier orden) -> intervalos {device,type,text,start,end|null}.
// Un evento "text" cambia el texto de la abierta. Tolera un "start" repetido (reinicio de la API) y un "end" huérfano.
function toIntervals(events) {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const open = new Map();
  const out = [];
  for (const e of sorted) {
    const k = `${e.device}|${e.type}`;
    if (e.status === 'start') {
      if (!open.has(k)) open.set(k, { device: e.device, type: e.type, text: e.text, start: e.ts, end: null });
    } else if (e.status === 'text') {
      if (open.has(k)) open.get(k).text = e.text;
    } else if (open.has(k)) {
      const a = open.get(k);
      a.end = e.ts;
      out.push(a);
      open.delete(k);
    }
  }
  return out.concat([...open.values()]);
}

// ─── InfluxDB ───────────────────────────────────────────────────────
const escTag = (s) => String(s).replace(/[,= ]/g, (c) => `\\${c}`);
const escStr = (s) => String(s).replace(/[\\"]/g, (c) => `\\${c}`);

function toLine(e) {
  return `${MEASUREMENT},device=${escTag(e.device)},type=${escTag(e.type)} status="${e.status}",text="${escStr(e.text)}" ${e.ts}`;
}

function writeEvents(events) {
  const cfg = configService.get();
  if (!cfg || !cfg.influxdb) return Promise.reject(new Error('No InfluxDB config'));
  const influx = cfg.influxdb;
  const url = new URL(influx.url);
  const body = events.map(toLine).join('\n');
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 8086,
      path: `/api/v2/write?org=${encodeURIComponent(influx.org)}&bucket=${encodeURIComponent(bucket())}&precision=ms`,
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.INFLUXDB_TOKEN || influx.token}`,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        if (res.statusCode === 204) resolve();
        else reject(new Error(`InfluxDB ${res.statusCode}: ${Buffer.concat(chunks).toString('utf8').substring(0, 200)}`));
      });
    });
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('InfluxDB write timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// Todos los eventos hasta `stopMs`. ponytail: lee desde el principio y arma los
// intervalos en memoria (son pocas transiciones); si crece a cientos de miles,
// acotar el rango y guardar las abiertas aparte.
async function readEvents(stopMs = Date.now()) {
  const flux = `from(bucket: ${JSON.stringify(bucket())})
  |> range(start: 0, stop: ${new Date(stopMs + 1).toISOString()})
  |> filter(fn: (r) => r._measurement == "${MEASUREMENT}")`;
  const byPoint = new Map();
  for (const r of parseAnnotatedCsv(await queryAnnotatedCsv(flux))) {
    const k = `${r.time}|${r.tags.device}|${r.tags.type}`;
    let e = byPoint.get(k);
    if (!e) {
      e = { device: r.tags.device, type: r.tags.type, ts: Number(BigInt(r.time) / 1000000n) };
      byPoint.set(k, e);
    }
    e[r.field] = r.value;
  }
  return [...byPoint.values()].filter((e) => ['start', 'end', 'text'].includes(e.status));
}

// ─── Servicio ───────────────────────────────────────────────────────
let open = null;   // null hasta leer de Influx las que quedaron abiertas
let pending = [];

async function tick() {
  try {
    if (!open) {
      open = new Map();
      for (const a of toIntervals(await readEvents())) {
        if (a.end === null) open.set(`${a.device}|${a.type}`, a);
      }
      console.log(`[ALARM-LOG] ${open.size} alarmas abiertas al arrancar`);
    }
  } catch (e) {
    open = null;
    console.error('[ALARM-LOG] No se pudo leer el historial:', e.message);
    return;
  }
  pending = pending.concat(step(open, configService.deviceStates, Date.now())).slice(-MAX_PENDING);
  if (!pending.length) return;
  const batch = pending;
  try {
    await writeEvents(batch);
    pending = pending.slice(batch.length);
  } catch (e) {
    console.error('[ALARM-LOG] Error escribiendo eventos (se reintenta):', e.message);
  }
}

let running = false;
function start() {
  console.log('[ALARM-LOG] Historial de alarmas activo (5s)');
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await tick(); } finally { running = false; }
  }, 5000);
}

async function history({ from, to, device } = {}) {
  const stop = Number.isFinite(to) ? to : Date.now();
  const start = Number.isFinite(from) ? from : 0;
  return toIntervals(await readEvents(stop))
    .filter((a) => a.start <= stop && (a.end === null || a.end >= start))
    .filter((a) => !device || a.device === device)
    .sort((a, b) => b.start - a.start);
}

module.exports = { start, history, activeAlarms, step, toIntervals, toLine, MEASUREMENT };
