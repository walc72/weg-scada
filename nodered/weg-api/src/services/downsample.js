'use strict';

// Bucket promediado a 5 min (weg_drives_5m) para los gráficos de rangos largos (48 h, 7 y 30 días):
// ~20 veces menos puntos que los crudos. Lo llena una tarea de InfluxDB cada 5 min (corre adentro de
// influxd, aunque la API esté caída) y, una sola vez, un relleno del histórico de a un día, del más
// nuevo al más viejo, por la cola de consultas de la API (de a una, con pausa).
// Qué entra: drive_data, meter_data y campo_data menos running (booleano; la marcha queda en crudo; el
// caudal también, su validez depende de error/online). tap con max (paso discreto), el resto con mean.
// downsample.json (junto a config.json) guarda desde cuándo el bucket está completo: antes de esa
// fecha se sigue consultando el crudo.

const fs = require('fs');
const path = require('path');
const http = require('http');
const configService = require('./config');

const ORIGEN = 'weg_drives';
const BUCKET_5M = 'weg_drives_5m';
const TAREA = 'weg_drives_5m';
const PASO_MS = 5 * 60000;
const DIA_MS = 86400000;
const RETENCION_S = 1095 * 86400;   // la misma que el crudo por defecto (INFLUXDB_RETENTION)
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const ESTADO_PATH = path.join(path.dirname(CONFIG_PATH), 'downsample.json');

let estado = leer();
function leer() {
  try { const j = JSON.parse(fs.readFileSync(ESTADO_PATH, 'utf8')); return j && typeof j === 'object' ? j : {}; } catch { return {}; }
}
function guardar(e) {
  estado = e;
  try { fs.writeFileSync(ESTADO_PATH + '.tmp', JSON.stringify(e)); fs.renameSync(ESTADO_PATH + '.tmp', ESTADO_PATH); } catch (err) {
    console.error('[5M] No se pudo guardar el estado:', err.message);
  }
}
// Solo para tests
function usarEstado(e) { estado = e || {}; }

// ¿El bucket de 5 min tiene todo desde startMs?
function cubre(startMs) {
  const desde = Date.parse(estado.desde);
  return Number.isFinite(desde) && Number.isFinite(startMs) && startMs >= desde;
}

const iso = (ms) => new Date(ms).toISOString();

// Agrega [start, stop) (expresiones Flux) y lo escribe en el bucket de 5 min. Todo a float (el mean ya
// lo es; así un campo que llega a veces entero no choca de tipo). Devuelve 0 filas: to() devuelve lo
// escrito y en el relleno serían ~150 mil filas por día para tirar.
function fluxAgregar(start, stop, cabecera = '') {
  const escribir = `  |> map(fn: (r) => ({ r with _value: float(v: r._value) }))
  |> to(bucket: "${BUCKET_5M}")
  |> filter(fn: (r) => false)`;
  // running es el único campo no numérico que escribe el poller (campo_data guarda los booleanos como
  // 0/1). Se excluye por nombre y no con types.isNumeric: filtrar por valor impide que Influx agregue en
  // el almacenamiento (un día tardaba 73 s en planta; por nombre, 5 s).
  return `import "date"
${cabecera}
datos = from(bucket: "${ORIGEN}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "drive_data" or r._measurement == "meter_data" or r._measurement == "campo_data")
  |> filter(fn: (r) => r._field != "running")
datos
  |> filter(fn: (r) => r._field == "tap")
  |> aggregateWindow(every: 5m, fn: max, createEmpty: false)
${escribir}
datos
  |> filter(fn: (r) => r._field != "tap")
  |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
${escribir}
`;
}

// Tarea: cada 5 min rehace los últimos 30 min (datos que llegan tarde, p. ej. la cola del poller),
// solo ventanas completas (el stop truncado a 5 min: una ventana a medias dejaría un punto a deshora).
// ponytail: un corte de Influx de más de 30 min deja ese hueco en el bucket de 5 min; rellenar() lo cubre si hace falta.
const FLUX_TAREA = fluxAgregar('date.sub(d: 30m, from: stop)', 'stop',
  `option task = { name: "${TAREA}", every: 5m, offset: 1m }
stop = date.truncate(t: now(), unit: 5m)`);

// ─── API HTTP de InfluxDB (buckets y tareas) ───
function api(method, ruta, body) {
  const cfg = configService.get();
  if (!cfg || !cfg.influxdb) return Promise.reject(new Error('No InfluxDB config'));
  const url = new URL(cfg.influxdb.url);
  const datos = body ? JSON.stringify(body) : null;
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname, port: url.port || 8086, path: ruta, method,
      headers: { 'Authorization': `Token ${process.env.INFLUXDB_TOKEN || cfg.influxdb.token}`, ...(datos ? { 'Content-Type': 'application/json' } : {}) },
    }, (res) => {
      let t = ''; res.on('data', (c) => t += c);
      res.on('end', () => {
        if (res.statusCode >= 300) return reject(new Error(`InfluxDB ${res.statusCode}: ${t.slice(0, 200)}`));
        try { resolve(t ? JSON.parse(t) : {}); } catch (e) { reject(e); }
      });
    });
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    if (datos) req.write(datos);
    req.end();
  });
}

// Crea el bucket y la tarea si faltan (o actualiza la tarea si cambió). true si el bucket es nuevo.
async function asegurar() {
  const org = configService.get().influxdb.org;
  const qOrg = `org=${encodeURIComponent(org)}`;
  let nuevo = false;
  // Influx 2.9 contesta 404 (no una lista vacía) si el bucket pedido por nombre no existe
  const bs = await api('GET', `/api/v2/buckets?${qOrg}&name=${BUCKET_5M}`).catch((e) => (/ 404:/.test(e.message) ? {} : Promise.reject(e)));
  if (!(bs.buckets || []).length) {
    const orgs = await api('GET', `/api/v2/orgs?${qOrg}`);
    const orgID = orgs.orgs && orgs.orgs[0] && orgs.orgs[0].id;
    if (!orgID) throw new Error(`No existe la organización ${org}`);
    await api('POST', '/api/v2/buckets', { orgID, name: BUCKET_5M, retentionRules: [{ type: 'expire', everySeconds: RETENCION_S }] });
    nuevo = true;
  }
  const ts = await api('GET', `/api/v2/tasks?${qOrg}&name=${TAREA}`);
  const t = (ts.tasks || [])[0];
  if (!t) await api('POST', '/api/v2/tasks', { org, flux: FLUX_TAREA, status: 'active' });
  else if (t.flux !== FLUX_TAREA || t.status !== 'active') await api('PATCH', `/api/v2/tasks/${t.id}`, { flux: FLUX_TAREA, status: 'active' });
  return nuevo;
}

// Primer dato crudo (ms) de lo que entra al bucket de 5 min, o null si no hay
async function primerDato(query) {
  const filas = await query(`from(bucket: "${ORIGEN}")
  |> range(start: 0)
  |> filter(fn: (r) => r._measurement == "drive_data" or r._measurement == "meter_data" or r._measurement == "campo_data")
  |> first()
  |> group()
  |> keep(columns: ["_time"])
  |> sort(columns: ["_time"])
  |> limit(n: 1)`, 60000);
  const t = filas[0] && Date.parse(filas[0]._time);
  return Number.isFinite(t) ? t : null;
}

// Relleno del histórico, de a un día, del más nuevo al más viejo. Retoma donde quedó (estado.desde).
async function rellenar(query, { pausaMs = 2000, ahora = Date.now() } = {}) {
  const primero = await primerDato(query);
  let hasta = Number.isFinite(Date.parse(estado.desde)) ? Date.parse(estado.desde) : Math.floor(ahora / PASO_MS) * PASO_MS;
  const inicio = primero == null ? hasta : Math.floor(primero / PASO_MS) * PASO_MS;
  while (hasta > inicio) {
    const desde = Math.max(inicio, hasta - DIA_MS);
    await query(fluxAgregar(`time(v: "${iso(desde)}")`, `time(v: "${iso(hasta)}")`), 120000);
    hasta = desde;
    guardar({ desde: iso(desde), completo: false });
    if (pausaMs) await new Promise((r) => setTimeout(r, pausaMs));
  }
  guardar({ desde: iso(hasta), completo: true });
}

// Arranque: bucket + tarea, y el relleno si falta. Reintenta cada 10 min si Influx no responde.
function start(query) {
  const correr = async () => {
    try {
      if (await asegurar()) guardar({});   // bucket nuevo (o borrado a mano): el relleno empieza de cero
      if (!estado.completo) {
        console.log('[5M] Rellenando el bucket de 5 min…');
        await rellenar(query);
        console.log(`[5M] Bucket de 5 min completo desde ${estado.desde}`);
      }
    } catch (e) {
      console.error('[5M]', e.message);
      setTimeout(correr, 10 * 60000).unref();
    }
  };
  correr();
}

module.exports = { BUCKET_5M, cubre, start, rellenar, asegurar, fluxAgregar, FLUX_TAREA, usarEstado };
