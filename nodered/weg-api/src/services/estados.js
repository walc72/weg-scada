'use strict';

// Línea de tiempo de estados de un equipo (detalle del motor / regulador / reconectador).
// Se arma en ranuras de `every` segundos: cada ranura toma el estado de su muestra en el
// histórico, y los registros de alarma mandan encima (sin comunicación > falla/disparo).
// Ranuras sin muestra ni alarma quedan como "sin_datos". Ranuras iguales seguidas se unen.

const reports = require('./reports');
const alarmLog = require('./alarmLog');
const configService = require('./config');

const MAX_DIAS = 31;
// Resolución según el largo del período: ≤ 1 día cada minuto, ≤ 7 días cada 5 min, si no cada 15 min
const everyPara = (ms) => (ms <= 864e5 ? 60 : ms <= 7 * 864e5 ? 300 : 900);

// Tipo de equipo según la configuración
function tipoDe(name, cfg = configService.get() || {}) {
  if ((cfg.devices || []).some((d) => d && d.name === name)) return 'motor';
  if ((cfg.reconectadores || []).some((d) => d && d.name === name)) return 'reco';
  if ((cfg.reguladores || []).some((d) => d && d.name === name)) return 'reg';
  return null;
}

// Estado de una muestra del histórico (null = no se puede decir)
function estadoMuestra(tipo, m) {
  if (tipo === 'motor') return m.running == null ? null : m.running ? 'marcha' : 'parada';
  if (tipo === 'reco') {
    if (m.bloqueo) return 'bloqueado';
    return m.estado == null ? null : m.estado ? 'cerrado' : 'abierto';
  }
  if (tipo === 'reg') return m.auto == null ? null : m.auto ? 'auto' : 'manual';
  return null;
}

// muestras: [{ t (ms, inicio de la ventana), ...campos }]; alarmas: [{ type, start, end }]
function linea({ tipo, muestras, alarmas, desde, hasta, every, ahora = Date.now() }) {
  const paso = every * 1000;
  const porRanura = new Map();
  for (const m of muestras) porRanura.set(Math.floor((m.t - desde) / paso), m);
  const cubre = (tipos, t) => alarmas.some((a) => tipos.includes(a.type) && a.start <= t && (a.end == null ? ahora : a.end) > t);
  const falla = tipo === 'reco' ? 'disparo' : 'falla';
  const tramos = [];
  for (let i = 0, t = desde; t < hasta; i++, t += paso) {
    const medio = Math.min(t + paso / 2, hasta - 1);
    const m = porRanura.get(i);
    let e;
    if (cubre(['SIN_COMUNICACION'], medio)) e = 'sin_com';
    else if (cubre(['FALLA', 'DISPARO'], medio)) e = falla;
    else e = (m && estadoMuestra(tipo, m)) || 'sin_datos';
    const fin = Math.min(t + paso, hasta);
    const ult = tramos[tramos.length - 1];
    if (ult && ult.estado === e) ult.hasta = fin;
    else tramos.push({ desde: t, hasta: fin, estado: e });
  }
  const resumen = {};
  for (const x of tramos) resumen[x.estado] = Math.round(((resumen[x.estado] || 0) + (x.hasta - x.desde) / 36e5) * 100) / 100;
  return { tramos, resumen };
}

// Muestras de InfluxDB: último valor de cada ventana (los booleanos como 1/0)
async function muestrasDe(tipo, name, desde, hasta, every, bucket = 'weg_drives') {
  const medida = tipo === 'motor' ? 'drive_data' : 'campo_data';
  const campos = tipo === 'motor' ? ['running'] : tipo === 'reco' ? ['estado', 'bloqueo'] : ['auto'];
  const filtro = campos.map((c) => `r._field == "${c}"`).join(' or ');
  const nombre = String(name).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const q = `from(bucket: "${bucket}")
  |> range(start: ${new Date(desde).toISOString()}, stop: ${new Date(hasta).toISOString()})
  |> filter(fn: (r) => r._measurement == "${medida}" and r.name == "${nombre}" and (${filtro}))
  |> map(fn: (r) => ({ r with _value: float(v: r._value) }))
  |> aggregateWindow(every: ${every}s, fn: last, createEmpty: false, timeSrc: "_start")
  |> keep(columns: ["_time", "_field", "_value"])`;
  const filas = await reports.queryInflux(q);
  const porT = new Map();
  for (const r of filas) {
    const t = Date.parse(r._time), v = Number(r._value);
    if (!Number.isFinite(t) || !r._field || !Number.isFinite(v)) continue;
    const m = porT.get(t) || { t };
    m[r._field] = v >= 0.5 ? 1 : 0;
    porT.set(t, m);
  }
  return [...porT.values()];
}

async function estados({ name, from, to }) {
  const tipo = tipoDe(name);
  if (!tipo) throw Object.assign(new Error('Equipo inexistente'), { status: 404 });
  const hasta = Math.min(Number.isFinite(Date.parse(to)) ? Date.parse(to) : Date.now(), Date.now());
  const desde = Number.isFinite(Date.parse(from)) ? Date.parse(from) : hasta - 864e5;
  if (hasta <= desde || hasta - desde > MAX_DIAS * 864e5) throw Object.assign(new Error(`Período inválido (hasta ${MAX_DIAS} días)`), { status: 400 });
  const every = everyPara(hasta - desde);
  const desdeAl = Math.floor(desde / (every * 1000)) * every * 1000;   // ventanas alineadas al reloj, como las de Influx
  const [muestras, alarmas] = await Promise.all([
    muestrasDe(tipo, name, desdeAl, hasta, every),
    alarmLog.history({ from: desdeAl, to: hasta, device: name }),
  ]);
  return { name, tipo, desde: desdeAl, hasta, every, ...linea({ tipo, muestras, alarmas, desde: desdeAl, hasta, every }) };
}

module.exports = { estados, linea, estadoMuestra, tipoDe, everyPara };
