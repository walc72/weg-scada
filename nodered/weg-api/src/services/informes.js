'use strict';

// Informes por bloques (Reportes → Informes). Un informe = plantilla (lista de
// bloques) + período. Cada bloque devuelve "partes" genéricas (kpis / tabla /
// gráfico / nota) que el portal, el PDF y el XLSX dibujan sin saber del bloque.
//
// Los números salen de reports.generateSummary (el mismo cálculo del resumen
// diario) y del registro de alarmas. El detalle por día reusa ese cálculo por
// día y guarda en disco los días ya cerrados.

const fs = require('fs');
const path = require('path');
const reports = require('./reports');
const alarmLog = require('./alarmLog');
const configService = require('./config');
const manualService = require('./manual');

const H = 3600 * 1000;
const MAX_DIAS_DETALLE = 93;          // por día / gráfico: hasta ~3 meses
const MAX_DIAS = 366;
const CACHE_DIR = path.join(process.env.REPORTS_DIR || '/app/reports', 'cache');
const CACHE_V = 1;
// ponytail: días cacheados a partir de anteayer (la réplica de oficina recibe datos atrasados); borrar el cache si cambia el cálculo (CACHE_V)
const DIAS_FIRMES = 2;

// ─── Catálogo ───────────────────────────────────────────────────────
const BLOQUES = {
  indicadores: 'Indicadores del período',
  grafico_dia: 'Energía y volumen por día',
  por_dia: 'Detalle por día',
  bombas: 'Disponibilidad por bomba',
  eventos: 'Eventos y alarmas',
  calidad: 'Calidad de energía',
  mantenimiento: 'Mantenimiento',
};
// periodo: sugerencia para el portal (hoy, ayer, 7d, mes, mes_anterior)
const PLANTILLAS = [
  { id: 'mensual', nombre: 'Mensual', periodo: 'mes_anterior', bloques: ['indicadores', 'grafico_dia', 'por_dia', 'bombas', 'eventos'] },
  { id: 'disponibilidad', nombre: 'Disponibilidad', periodo: 'mes', bloques: ['indicadores', 'bombas'] },
  { id: 'eventos', nombre: 'Eventos y alarmas', periodo: '7d', bloques: ['eventos'] },
  { id: 'calidad', nombre: 'Calidad de energía', periodo: 'mes', bloques: ['calidad'] },
  { id: 'mantenimiento', nombre: 'Mantenimiento', periodo: 'mes', bloques: ['mantenimiento'] },
];

// ─── Plantillas propias (por servidor: planta y oficina tienen las suyas) ──
// Son solo presentación (qué bloques y en qué orden), así que la réplica también puede guardarlas.
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const PROPIAS_PATH = path.join(path.dirname(CONFIG_PATH), 'informes.json');
const PERIODOS = ['hoy', 'ayer', '7d', 'mes', 'mes_anterior'];
const MAX_PROPIAS = 50;

function leerPropias(file = PROPIAS_PATH) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return Array.isArray(j.plantillas) ? j.plantillas : []; } catch { return []; }
}
function escribirPropias(lista, file) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ plantillas: lista }, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
// Fábrica primero (no editables), después las propias
function listarPlantillas(file = PROPIAS_PATH) {
  return [...PLANTILLAS.map((p) => ({ ...p, fabrica: true })), ...leerPropias(file).map((p) => ({ ...p, fabrica: false }))];
}
// Valida y normaliza lo que manda el portal; error con mensaje para el usuario
function validarPlantilla(b = {}) {
  const nombre = String(b.nombre || '').trim();
  if (!nombre || nombre.length > 60) throw new Error('Nombre inválido (1 a 60 caracteres)');
  const bloques = [...new Set(Array.isArray(b.bloques) ? b.bloques : [])].filter((x) => BLOQUES[x]);
  if (!bloques.length) throw new Error('Bloques inválidos: elegí al menos uno');
  const periodo = PERIODOS.includes(b.periodo) ? b.periodo : 'mes';
  return { nombre, periodo, bloques };
}
function guardarPlantilla(b, autor, file = PROPIAS_PATH) {
  const p = validarPlantilla(b);
  const lista = leerPropias(file);
  if (lista.some((x) => x.nombre.toLowerCase() === p.nombre.toLowerCase() && x.id !== b.id)) throw new Error('Nombre inválido: ya existe una plantilla con ese nombre');
  let id = b.id;
  if (id) {
    const i = lista.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('Plantilla inexistente');
    lista[i] = { ...lista[i], ...p, modificada: new Date().toISOString(), autor };
  } else {
    if (lista.length >= MAX_PROPIAS) throw new Error(`No se pueden superar ${MAX_PROPIAS} plantillas`);
    id = `p-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    lista.push({ id, ...p, creada: new Date().toISOString(), autor });
  }
  escribirPropias(lista, file);
  return lista.find((x) => x.id === id);
}
function borrarPlantilla(id, file = PROPIAS_PATH) {
  const lista = leerPropias(file);
  if (!lista.some((x) => x.id === id)) throw new Error('Plantilla inexistente');
  escribirPropias(lista.filter((x) => x.id !== id), file);
}

// ─── Utilidades puras (con test) ────────────────────────────────────
const r1 = (x, d = 1) => (x == null || !Number.isFinite(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const pad = (n) => String(n).padStart(2, '0');
const fechaLocal = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// Días locales (AAAA-MM-DD) que toca el período [desde, hasta)
function diasDelPeriodo(desdeMs, hastaMs) {
  const out = [];
  const d = new Date(desdeMs); d.setHours(0, 0, 0, 0);
  while (d.getTime() < hastaMs) { out.push(fechaLocal(d.getTime())); d.setDate(d.getDate() + 1); }
  return out;
}

// Horas de los intervalos (abiertos = hasta "ahora") recortados al período
function horasEn(intervalos, desdeMs, hastaMs, ahora = Date.now()) {
  let ms = 0;
  for (const a of intervalos) {
    const s = Math.max(a.start, desdeMs), e = Math.min(a.end == null ? ahora : a.end, hastaMs);
    if (e > s) ms += e - s;
  }
  return ms / H;
}

const ES_FALLA = (t) => t === 'FALLA' || t === 'DISPARO';
const TIPO = {
  FALLA: 'Falla', DISPARO: 'Disparo', BLOQUEO: 'Bloqueado', ALARMA_EQUIPO: 'Alarma del equipo',
  CORRIENTE_ALTA: 'Corriente alta', TEMP_ALTA: 'Temperatura alta', ERRORES_COMM: 'Errores de comunicación', SIN_COMUNICACION: 'Sin comunicación',
};
const tipoTxt = (t) => TIPO[t] || (String(t).startsWith('ALARMA_') ? 'Alarma del equipo' : t);

// Desbalance de tensión (NEMA): máxima desviación respecto del promedio, en %
function desbalance(fases) {
  const v = fases.filter((x) => Number.isFinite(x) && x > 0);
  if (v.length < 3) return null;
  const avg = v.reduce((s, x) => s + x, 0) / v.length;
  return r1((Math.max(...v.map((x) => Math.abs(x - avg))) / avg) * 100, 2);
}

// Medidor "principal": el del balance de pérdida, o el de mayor energía
function principal(meters, lossMeter) {
  if (lossMeter && lossMeter.main) { const m = meters.find((x) => x.name === lossMeter.main); if (m) return m; }
  return [...meters].sort((a, b) => (b.energyKwh || 0) - (a.energyKwh || 0))[0] || null;
}

// ─── Bloques: summary/alarmas → partes ──────────────────────────────
function bIndicadores(s, ctx) {
  const main = principal(s.meters || [], ctx.lossMeter);
  const horas = (s.drives || []).reduce((t, d) => t + (d.opHours || 0), 0);
  const vol = s.totals && s.totals.volumeM3;
  const eb = s.totals && s.totals.driveEnergyKwh;
  const kpis = [
    { label: 'ENERGÍA BOMBAS', valor: r1(eb, 0), unidad: 'kWh' },
    ...(main ? [{ label: `ENERGÍA ${main.displayName || main.name}`.toUpperCase(), valor: r1(main.energyKwh, 0), unidad: 'kWh' }] : []),
    ...(s.flowmeters ? [{ label: 'VOLUMEN BOMBEADO', valor: r1(vol, 0), unidad: 'm³' }, { label: 'kWh / m³', valor: vol ? r1(eb / vol, 3) : null, unidad: '', dec: 3 }] : []),
    { label: 'HORAS DE MARCHA', valor: r1(horas, 1), unidad: 'h', dec: 1 },
    ...(s.loss ? [{ label: 'PÉRDIDA', valor: r1(s.loss.energyKwh, 0), unidad: 'kWh' }] : []),
    ...(main && main.demandMax ? [{ label: 'DEMANDA MÁXIMA', valor: r1(main.demandMax.kw, 0), unidad: 'kW' }] : []),
    ...(ctx.lluvia != null ? [{ label: 'LLUVIA', valor: r1(ctx.lluvia, 1), unidad: 'mm', dec: 1 }] : []),
  ];
  return [{ kpis }];
}

function filasPorDia(dias, lossMeter) {
  const filas = dias.map(({ fecha, s, manual }) => {
    const main = principal(s.meters || [], lossMeter);
    const eb = s.totals && s.totals.driveEnergyKwh, vol = s.totals && s.totals.volumeM3;
    return [fecha, r1(eb, 1), main ? r1(main.energyKwh, 1) : null, r1(vol, 0), vol ? r1(eb / vol, 3) : null,
      r1((s.drives || []).reduce((t, d) => t + (d.opHours || 0), 0), 1), s.loss ? r1(s.loss.energyKwh, 1) : null,
      manual && manual.rainMm != null ? manual.rainMm : null, manual && manual.riverM != null ? manual.riverM : null]
  });
  const sum = (k) => { const v = filas.map((f) => f[k]).filter((x) => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0), 1) : null; };
  const total = ['TOTAL', sum(1), sum(2), sum(3), sum(3) ? r1(sum(1) / sum(3), 3) : null, sum(5), sum(6), sum(7), null];
  return { filas, total };
}

function bPorDia(dias, ctx) {
  const { filas, total } = filasPorDia(dias, ctx.lossMeter);
  return [{ tabla: {
    columnas: [{ label: 'Fecha' }, { label: 'Energía bombas kWh', dec: 1 }, { label: 'Energía principal kWh', dec: 1 }, { label: 'Volumen m³', dec: 0 },
      { label: 'kWh/m³', dec: 3 }, { label: 'Horas marcha', dec: 1 }, { label: 'Pérdida kWh', dec: 1 }, { label: 'Lluvia mm', dec: 1 }, { label: 'Río m', dec: 2 }],
    filas, total,
  } }];
}

function bGraficoDia(dias, ctx) {
  const { filas } = filasPorDia(dias, ctx.lossMeter);
  const series = [{ label: 'Energía bombas', unidad: 'kWh', valores: filas.map((f) => f[1]) }];
  if (filas.some((f) => f[3] != null)) series.push({ label: 'Volumen', unidad: 'm³', valores: filas.map((f) => f[3]) });
  return [{ grafico: { x: filas.map((f) => f[0].slice(5).split('-').reverse().join('/')), series } }];
}

function bBombas(s, alarmas, ctx) {
  const periodoH = (ctx.hasta - ctx.desde) / H;
  const filas = (s.drives || []).map((d) => {
    const mias = alarmas.filter((a) => a.device === d.name);
    const vol = d.volumeM3;
    return [d.name, r1(d.opHours, 1), periodoH ? r1(((d.opHours || 0) / periodoH) * 100, 1) : null,
      r1(horasEn(mias.filter((a) => ES_FALLA(a.type)), ctx.desde, ctx.hasta), 1),
      r1(horasEn(mias.filter((a) => a.type === 'SIN_COMUNICACION'), ctx.desde, ctx.hasta), 1),
      r1(d.energyKwh, 1), r1(vol, 0), vol ? r1(d.energyKwh / vol, 3) : null,
      mias.filter((a) => ES_FALLA(a.type) && a.start >= ctx.desde).length];
  });
  return [{ tabla: {
    columnas: [{ label: 'Bomba' }, { label: 'Horas marcha', dec: 1 }, { label: '% del período', dec: 1 }, { label: 'Horas en falla', dec: 1 },
      { label: 'Horas sin com.', dec: 1 }, { label: 'Energía kWh', dec: 1 }, { label: 'Volumen m³', dec: 0 }, { label: 'kWh/m³', dec: 3 }, { label: 'Fallas', dec: 0 }],
    filas,
  } }];
}

function bEventos(alarmas, ctx) {
  const enPeriodo = alarmas.filter((a) => a.start >= ctx.desde && a.start < ctx.hasta);
  const dur = (a) => horasEn([a], ctx.desde, ctx.hasta);
  const porTipo = new Map(), porEquipo = new Map();
  for (const a of enPeriodo) {
    const t = porTipo.get(a.type) || { n: 0, h: 0, max: 0 }; t.n++; t.h += dur(a); t.max = Math.max(t.max, dur(a)); porTipo.set(a.type, t);
    const e = porEquipo.get(a.device) || { n: 0, f: 0, hf: 0, hc: 0 }; e.n++;
    if (ES_FALLA(a.type)) { e.f++; e.hf += dur(a); }
    if (a.type === 'SIN_COMUNICACION') e.hc += dur(a);
    porEquipo.set(a.device, e);
  }
  const fallas = enPeriodo.filter((a) => ES_FALLA(a.type));
  const fmtF = (ms) => { const d = new Date(ms); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  return [
    { kpis: [
      { label: 'EVENTOS', valor: enPeriodo.length, unidad: '' },
      { label: 'FALLAS Y DISPAROS', valor: fallas.length, unidad: '' },
      { label: 'TIEMPO EN FALLA', valor: r1(fallas.reduce((t, a) => t + dur(a), 0), 1), unidad: 'h', dec: 1 },
      { label: 'SIN COMUNICACIÓN', valor: enPeriodo.filter((a) => a.type === 'SIN_COMUNICACION').length, unidad: '' },
    ] },
    { tabla: { titulo: 'Por tipo', columnas: [{ label: 'Tipo' }, { label: 'Cantidad', dec: 0 }, { label: 'Duración total h', dec: 1 }, { label: 'Duración máx. h', dec: 1 }],
      filas: [...porTipo].sort((a, b) => b[1].n - a[1].n).map(([t, v]) => [tipoTxt(t), v.n, r1(v.h, 1), r1(v.max, 1)]) } },
    { tabla: { titulo: 'Por equipo', columnas: [{ label: 'Equipo' }, { label: 'Eventos', dec: 0 }, { label: 'Fallas', dec: 0 }, { label: 'Horas en falla', dec: 1 }, { label: 'Horas sin com.', dec: 1 }],
      filas: [...porEquipo].sort((a, b) => b[1].n - a[1].n).slice(0, 20).map(([n, v]) => [ctx.nombre(n), v.n, v.f, r1(v.hf, 1), r1(v.hc, 1)]) } },
    { tabla: { titulo: 'Últimos eventos', columnas: [{ label: 'Inicio' }, { label: 'Equipo' }, { label: 'Tipo' }, { label: 'Detalle' }, { label: 'Duración h', dec: 2 }],
      filas: [...enPeriodo].sort((a, b) => b.start - a.start).slice(0, 30).map((a) => [fmtF(a.start), ctx.nombre(a.device), tipoTxt(a.type), a.text || '', r1(dur(a), 2)]) } },
  ];
}

function bCalidad(s) {
  const filas = (s.meters || []).map((m) => {
    const st = m.stats || {}, vf = st.vFases || {}, thd = st.thdI || {};
    const thdAvg = ['a', 'b', 'c'].map((f) => thd[f] && thd[f].avg).filter((x) => x != null);
    const thdMax = ['a', 'b', 'c'].map((f) => thd[f] && thd[f].max).filter((x) => x != null);
    const dm = m.demandMax;
    return [m.displayName || m.name, st.voltage && st.voltage.avg, st.voltage && st.voltage.min, st.voltage && st.voltage.max,
      desbalance(['ab', 'bc', 'ca'].map((f) => vf[f] && vf[f].avg)),
      st.pf && st.pf.avg, st.pf && st.pf.min, dm ? r1(dm.kw, 0) : null,
      dm && dm.from ? (() => { const d = new Date(dm.from); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`; })() : null,
      thdAvg.length ? r1(thdAvg.reduce((a, b) => a + b, 0) / thdAvg.length, 1) : null, thdMax.length ? r1(Math.max(...thdMax), 1) : null];
  });
  return [{ tabla: {
    columnas: [{ label: 'Medidor' }, { label: 'V prom kV', dec: 2 }, { label: 'V mín kV', dec: 2 }, { label: 'V máx kV', dec: 2 }, { label: 'Desbalance V %', dec: 2 },
      { label: 'FP prom', dec: 3 }, { label: 'FP mín', dec: 3 }, { label: 'Demanda máx kW', dec: 0 }, { label: 'Hora demanda' }, { label: 'THD-I prom %', dec: 1 }, { label: 'THD-I máx %', dec: 1 }],
    filas,
  } }, { nota: 'Desbalance y THD se registran desde la versión que agrega la lectura por fase al histórico; los días anteriores quedan en blanco.' }];
}

function bMantenimiento(s) {
  const partes = [{ tabla: { titulo: 'Bombas', columnas: [{ label: 'Bomba' }, { label: 'Horímetro inicio h', dec: 1 }, { label: 'Horímetro fin h', dec: 1 }, { label: 'Horas en el período', dec: 1 }, { label: 'Errores de com.', dec: 0 }],
    filas: (s.drives || []).map((d) => [d.name, d.runHoursStart, d.runHoursEnd, d.opHours, d.commErrors]) } }];
  if ((s.reconectadores || []).length) partes.push({ tabla: { titulo: 'Reconectadores', columnas: [{ label: 'Reconectador' }, { label: 'Operaciones', dec: 0 }, { label: 'Disparos', dec: 0 }, { label: 'Horas abierto', dec: 1 }, { label: 'Horas bloqueado', dec: 1 }],
    filas: s.reconectadores.map((d) => [d.name, d.operaciones, d.disparos, d.horasAbierto, d.horasBloqueado]) } });
  if ((s.reguladores || []).length) partes.push({ tabla: { titulo: 'Reguladores', columnas: [{ label: 'Regulador' }, { label: 'Cambios de tap', dec: 0 }, { label: 'Tap mín', dec: 0 }, { label: 'Tap máx', dec: 0 }, { label: '% automático', dec: 0 }],
    filas: s.reguladores.map((d) => [d.name, d.cambiosTap, d.tapMin, d.tapMax, d.pctAuto]) } });
  return partes;
}

// ─── Cálculo ────────────────────────────────────────────────────────
async function resumenDia(fecha, bucket) {
  const hoy = manualService.localDateStr();
  const firme = (Date.parse(`${hoy}T00:00:00`) - Date.parse(`${fecha}T00:00:00`)) / (24 * H) >= DIAS_FIRMES;
  const file = path.join(CACHE_DIR, bucket, `${fecha}.json`);
  if (firme) {
    try { const c = JSON.parse(fs.readFileSync(file, 'utf8')); if (c.v === CACHE_V) return c.s; } catch { /* no está */ }
  }
  const desde = Date.parse(`${fecha}T00:00:00`), hasta = Math.min(desde + 24 * H, Date.now());
  const s = await reports.generateSummary({ from: new Date(desde).toISOString(), to: new Date(hasta).toISOString(), bucket });
  if (firme && (s.drives || []).length) {
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ v: CACHE_V, s })); } catch (e) { console.error('[INFORMES] cache:', e.message); }
  }
  return s;
}

// De a 3 días en paralelo para no saturar InfluxDB
async function resumenesPorDia(fechas, bucket) {
  const out = [];
  for (let i = 0; i < fechas.length; i += 3) {
    const lote = fechas.slice(i, i + 3);
    const res = await Promise.all(lote.map((f) => resumenDia(f, bucket)));
    lote.forEach((f, k) => out.push({ fecha: f, s: res[k], manual: manualService.get(f) || {} }));
  }
  return out;
}

function plantillaDe(body) {
  if (Array.isArray(body.bloques) && body.bloques.length) {
    const bloques = body.bloques.filter((b) => BLOQUES[b]);
    if (!bloques.length) throw new Error('Bloques inválidos');
    return { id: 'personalizada', nombre: body.nombre || 'Informe', bloques };
  }
  const p = PLANTILLAS.find((x) => x.id === body.plantilla) || leerPropias().find((x) => x.id === body.plantilla);
  if (!p) throw new Error('Plantilla inexistente');
  return p;
}

async function generarInforme(body = {}) {
  const plantilla = plantillaDe(body);
  const desde = Date.parse(body.from), hasta = Math.min(Date.parse(body.to), Date.now());
  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) throw new Error('Período inválido');
  if ((hasta - desde) / (24 * H) > MAX_DIAS) throw new Error(`El período no puede superar ${MAX_DIAS} días`);
  const bucket = typeof body.bucket === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.bucket) ? body.bucket : 'weg_drives';
  const cfg = configService.get() || {};
  const nombres = {};
  for (const d of cfg.devices || []) if (d && d.name) nombres[d.name] = d.displayName || d.name;
  const fechas = diasDelPeriodo(desde, hasta);
  const lluvias = fechas.map((f) => (manualService.get(f) || {}).rainMm).filter((x) => typeof x === 'number');
  const ctx = { desde, hasta, lossMeter: cfg.lossMeter, nombre: (n) => nombres[n] || n, lluvia: lluvias.length ? lluvias.reduce((a, b) => a + b, 0) : null };

  const necesita = (...b) => b.some((x) => plantilla.bloques.includes(x));
  const s = await reports.generateSummary({ from: new Date(desde).toISOString(), to: new Date(hasta).toISOString(), bucket });
  const alarmas = necesita('bombas', 'eventos') ? await alarmLog.history({ from: desde, to: hasta }) : [];
  const detalle = necesita('por_dia', 'grafico_dia') && fechas.length <= MAX_DIAS_DETALLE;
  const dias = detalle ? await resumenesPorDia(fechas, bucket) : [];

  const bloques = plantilla.bloques.map((tipo) => {
    let partes;
    if (tipo === 'indicadores') partes = bIndicadores(s, ctx);
    else if (tipo === 'por_dia') partes = detalle ? bPorDia(dias, ctx) : [{ nota: `El detalle por día está disponible para períodos de hasta ${MAX_DIAS_DETALLE} días.` }];
    else if (tipo === 'grafico_dia') partes = detalle ? bGraficoDia(dias, ctx) : [{ nota: `El gráfico por día está disponible para períodos de hasta ${MAX_DIAS_DETALLE} días.` }];
    else if (tipo === 'bombas') partes = bBombas(s, alarmas, ctx);
    else if (tipo === 'eventos') partes = bEventos(alarmas, ctx);
    else if (tipo === 'calidad') partes = bCalidad(s);
    else partes = bMantenimiento(s);
    return { tipo, titulo: BLOQUES[tipo], partes };
  });
  return { plantilla: plantilla.id, titulo: PLANTILLAS.includes(plantilla) ? `Informe ${plantilla.nombre.toLowerCase()}` : plantilla.nombre, desde: new Date(desde).toISOString(), hasta: new Date(hasta).toISOString(), generado: new Date().toISOString(), bloques };
}

// ─── Salidas: XLSX y PDF ────────────────────────────────────────────
function aXLSX(inf) {
  const hojas = [];
  const usados = new Set();
  const nombreHoja = (t) => { let n = t.replace(/[\\/?*[\]:]/g, '').slice(0, 28), k = 2; const base = n; while (usados.has(n)) n = `${base.slice(0, 26)} ${k++}`; usados.add(n); return n; };
  for (const b of inf.bloques) {
    for (const p of b.partes) {
      if (p.kpis) hojas.push({ name: nombreHoja(b.titulo), headers: ['Indicador', 'Valor', 'Unidad'], rows: p.kpis.map((k) => [k.label, k.valor, k.unidad]) });
      if (p.tabla) hojas.push({ name: nombreHoja(p.tabla.titulo ? `${b.titulo} ${p.tabla.titulo}` : b.titulo), headers: p.tabla.columnas.map((c) => c.label), rows: [...p.tabla.filas, ...(p.tabla.total ? [p.tabla.total] : [])] });
      if (p.grafico) hojas.push({ name: nombreHoja(b.titulo), headers: ['Día', ...p.grafico.series.map((s) => `${s.label} ${s.unidad}`)], rows: p.grafico.x.map((x, i) => [x, ...p.grafico.series.map((s) => s.valores[i])]) });
    }
  }
  if (!hojas.length) hojas.push({ name: 'Informe', headers: ['Sin datos'], rows: [] });
  return reports.toXLSX(hojas);
}

const num = (v, d = 0) => (v == null || v === '' ? '—' : typeof v === 'number' ? v.toLocaleString('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d }) : String(v));
const fFecha = (iso) => { const d = new Date(iso); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function aPDF(inf, branding) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks = [];
  const NARANJA = '#E87722', OSC = '#333333', GRIS = '#888888';
  const logo = branding && branding.logoPath();
  return new Promise((resolve) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const mL = 36, W = doc.page.width - 72, bajo = () => doc.page.height - 50;
    if (logo && fs.existsSync(logo)) { try { doc.image(logo, mL, 22, { fit: [120, 34] }); } catch { /* sin logo */ } }
    doc.fontSize(16).fillColor(OSC).font('Helvetica-Bold').text(inf.titulo, mL + 130, 24, { width: W - 130 });
    doc.fontSize(9).fillColor(GRIS).font('Helvetica').text(`Período: ${fFecha(inf.desde)} — ${fFecha(inf.hasta)}   ·   Generado: ${fFecha(inf.generado)}`, mL + 130, 44, { width: W - 130 });
    doc.moveTo(mL, 62).lineTo(mL + W, 62).lineWidth(2).strokeColor(NARANJA).stroke();
    doc.y = 74;
    const espacio = (h) => { if (doc.y + h > bajo()) { doc.addPage(); doc.y = 40; } };
    const titulo = (t, tam = 10) => { espacio(60); doc.moveDown(0.5); doc.fontSize(tam).fillColor('#444').font('Helvetica-Bold').text(t.toUpperCase(), mL, doc.y); doc.y += 3; };

    function tabla(t) {
      const n = t.columnas.length, w0 = Math.min(0.24, Math.max(0.14, 1.6 / (n + 1))), wr = (1 - w0) / (n - 1 || 1);
      const ws = t.columnas.map((_, i) => (i === 0 ? w0 : wr) * W);
      const fila = (vals, y, i, cab, negrita) => {
        if (cab) doc.rect(mL, y, W, 20).fill(NARANJA); else if (i % 2) doc.rect(mL, y, W, 16).fill('#fafafa');
        let x = mL;
        vals.forEach((v, k) => {
          const txt = cab ? v : (typeof v === 'number' ? num(v, t.columnas[k].dec ?? 0) : num(v));
          doc.fontSize(7.5).fillColor(cab ? '#fff' : OSC).font(cab || negrita ? 'Helvetica-Bold' : 'Helvetica').text(txt, x + 4, y + (cab ? 5 : 4), { width: ws[k] - 8, align: k === 0 ? 'left' : 'right', lineBreak: false, ellipsis: true });
          x += ws[k];
        });
        return y + (cab ? 22 : 16);
      };
      const cab = t.columnas.map((c) => c.label);
      let y = fila(cab, doc.y, 0, true);
      const filas = t.filas.length ? t.filas : [['Sin datos', ...cab.slice(1).map(() => '')]];
      filas.forEach((r, i) => { if (y > bajo()) { doc.addPage(); y = fila(cab, 40, 0, true); } y = fila(r, y, i); });
      if (t.total) { if (y > bajo()) { doc.addPage(); y = fila(cab, 40, 0, true); } doc.moveTo(mL, y).lineTo(mL + W, y).lineWidth(1).strokeColor(OSC).stroke(); y = fila(t.total, y + 1, 0, false, true); }
      doc.y = y + 4;
    }
    function kpis(ks) {
      espacio(50);
      const n = Math.min(ks.length, 6), w = W / n, y0 = doc.y;
      ks.forEach((k, i) => {
        const x = mL + (i % n) * w, y = y0 + Math.floor(i / n) * 44;
        doc.rect(x, y, w - 6, 38).lineWidth(0.5).strokeColor('#cccccc').stroke();
        doc.fontSize(6.5).fillColor(GRIS).font('Helvetica').text(k.label, x + 6, y + 5, { width: w - 18, lineBreak: false, ellipsis: true });
        doc.fontSize(14).fillColor(OSC).font('Helvetica-Bold').text(`${num(k.valor, k.dec ?? 0)} ${k.unidad || ''}`, x + 6, y + 17, { width: w - 18, lineBreak: false });
      });
      doc.y = y0 + Math.ceil(ks.length / n) * 44 + 4;
    }
    function grafico(g) {
      espacio(170);
      const y0 = doc.y + 4, h = 130, s0 = g.series[0], max = Math.max(1, ...s0.valores.filter((v) => v != null));
      const bw = W / Math.max(1, g.x.length);
      doc.moveTo(mL, y0 + h).lineTo(mL + W, y0 + h).lineWidth(0.5).strokeColor('#999').stroke();
      g.x.forEach((x, i) => {
        const v = s0.valores[i] || 0, bh = (v / max) * (h - 12);
        doc.rect(mL + i * bw + bw * 0.15, y0 + h - bh, bw * 0.7, bh).fill('#4C8BD6');
        if (g.x.length <= 31) doc.fontSize(5.5).fillColor(GRIS).font('Helvetica').text(x, mL + i * bw, y0 + h + 2, { width: bw, align: 'center', lineBreak: false });
      });
      const s1 = g.series[1];
      if (s1) {
        const m1 = Math.max(1, ...s1.valores.filter((v) => v != null));
        const pts = s1.valores.map((v, i) => (v == null ? null : [mL + i * bw + bw / 2, y0 + h - (v / m1) * (h - 12)])).filter(Boolean);
        pts.forEach((p, i) => { if (i) doc.moveTo(pts[i - 1][0], pts[i - 1][1]).lineTo(p[0], p[1]).lineWidth(1.2).strokeColor('#C9932E').stroke(); });
      }
      doc.fontSize(7).fillColor(OSC).text(`■ ${s0.label} (${s0.unidad}, máx ${num(max, 0)})${s1 ? `     — ${s1.label} (${s1.unidad})` : ''}`, mL, y0 + h + 12);
      doc.y = y0 + h + 24;
    }

    for (const b of inf.bloques) {
      titulo(b.titulo, 11);
      for (const p of b.partes) {
        if (p.kpis) kpis(p.kpis);
        if (p.tabla) { if (p.tabla.titulo) titulo(p.tabla.titulo, 8.5); else espacio(60); tabla(p.tabla); }
        if (p.grafico) grafico(p.grafico);
        if (p.nota) { espacio(20); doc.fontSize(7.5).fillColor(GRIS).font('Helvetica-Oblique').text(p.nota, mL, doc.y, { width: W }); doc.y += 4; }
      }
    }
    doc.end();
  });
}

module.exports = {
  BLOQUES, PLANTILLAS, PERIODOS, generarInforme, aXLSX, aPDF,
  listarPlantillas, guardarPlantilla, borrarPlantilla, validarPlantilla,
  // para tests
  diasDelPeriodo, horasEn, desbalance, principal, filasPorDia, bBombas, bEventos, bIndicadores, plantillaDe,
};
