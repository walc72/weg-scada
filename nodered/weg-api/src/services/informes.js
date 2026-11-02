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
const CACHE_V = 2;   // 2: horas de marcha sin saltos del horímetro
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
  comparativo: 'Comparativo con el período anterior',
  arranques: 'Arranques por bomba',
  demanda: 'Demanda',
  perdidas: 'Pérdidas por día',
  lluvia: 'Lluvia y bombeo',
};
// periodo: sugerencia para el portal (hoy, ayer, 7d, mes, mes_anterior)
const PLANTILLAS = [
  { id: 'mensual', nombre: 'Mensual', periodo: 'mes_anterior', bloques: ['indicadores', 'comparativo', 'grafico_dia', 'por_dia', 'bombas', 'eventos'] },
  { id: 'disponibilidad', nombre: 'Disponibilidad', periodo: 'mes', bloques: ['indicadores', 'bombas', 'arranques'] },
  { id: 'eventos', nombre: 'Eventos y alarmas', periodo: '7d', bloques: ['eventos'] },
  { id: 'calidad', nombre: 'Calidad de energía', periodo: 'mes', bloques: ['calidad'] },
  { id: 'mantenimiento', nombre: 'Mantenimiento', periodo: 'mes', bloques: ['mantenimiento', 'arranques'] },
  { id: 'comparativo', nombre: 'Comparativo mensual', periodo: 'mes_anterior', bloques: ['comparativo'] },
  { id: 'demanda', nombre: 'Demanda', periodo: 'mes', bloques: ['demanda'] },
  { id: 'perdidas', nombre: 'Pérdidas', periodo: 'mes', bloques: ['perdidas'] },
  { id: 'lluvia', nombre: 'Lluvia y bombeo', periodo: 'mes', bloques: ['lluvia'] },
];

// ─── Plantillas propias (por servidor: planta y oficina tienen las suyas) ──
// Son solo presentación (qué bloques y en qué orden), así que la réplica también puede guardarlas.
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const PROPIAS_PATH = path.join(path.dirname(CONFIG_PATH), 'informes.json');
const PERIODOS = ['hoy', 'ayer', '7d', 'mes', 'mes_anterior'];
const MAX_PROPIAS = 50;

// informes.json = { plantillas: [...], suscripciones: [...] }; se escribe completo (tmp + rename)
function leerArchivo(file = PROPIAS_PATH) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { plantillas: Array.isArray(j.plantillas) ? j.plantillas : [], suscripciones: Array.isArray(j.suscripciones) ? j.suscripciones : [] };
  } catch { return { plantillas: [], suscripciones: [] }; }
}
function escribirArchivo(obj, file = PROPIAS_PATH) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
const leerPropias = (file = PROPIAS_PATH) => leerArchivo(file).plantillas;
const escribirPropias = (lista, file = PROPIAS_PATH) => escribirArchivo({ ...leerArchivo(file), plantillas: lista }, file);
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
  // borra también sus suscripciones
  const a = leerArchivo(file);
  escribirArchivo({ plantillas: lista.filter((x) => x.id !== id), suscripciones: a.suscripciones.filter((x) => x.plantilla !== id) }, file);
}

// ─── Suscripciones: envío programado por correo ─────────────────────
// diaria → el día anterior; semanal (dia 1=lunes..7=domingo) → los 7 días previos;
// mensual → el mes anterior, el día 1. "slot" = período al que corresponde el envío.
const FRECUENCIAS = ['diaria', 'semanal', 'mensual'];
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

function slotDe(sus, ahora = Date.now()) {
  const [hh, mm] = String(sus.hora || '07:00').split(':').map(Number);
  const hoy = new Date(ahora); hoy.setHours(0, 0, 0, 0);
  let base, desde, slot;
  if (sus.frecuencia === 'mensual') {
    base = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    desde = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    slot = `${base.getFullYear()}-${pad(base.getMonth() + 1)}`;
  } else if (sus.frecuencia === 'semanal') {
    const dow = ((hoy.getDay() + 6) % 7) + 1;              // 1 = lunes … 7 = domingo
    base = new Date(hoy); base.setDate(hoy.getDate() - ((dow - (sus.dia || 1) + 7) % 7));
    desde = new Date(base); desde.setDate(base.getDate() - 7);
    slot = fechaLocal(base.getTime());
  } else {
    base = hoy;
    desde = new Date(hoy); desde.setDate(hoy.getDate() - 1);
    slot = fechaLocal(base.getTime());
  }
  const programado = new Date(base); programado.setHours(hh || 0, mm || 0, 0, 0);
  return { slot, programado: programado.getTime(), desde: desde.getTime(), hasta: base.getTime() };
}
const vencida = (sus, ahora = Date.now()) => {
  if (sus.activa === false) return false;
  const s = slotDe(sus, ahora);
  return ahora >= s.programado && sus.ultimoSlot !== s.slot;
};
// Próximo envío (ms): el del período actual si todavía no salió, si no el siguiente
function proximoEnvio(sus, ahora = Date.now()) {
  const s = slotDe(sus, ahora);
  if (sus.ultimoSlot !== s.slot && s.programado > ahora - 60_000) return s.programado;
  if (sus.ultimoSlot !== s.slot) return ahora;
  const sig = sus.frecuencia === 'mensual' ? 32 : sus.frecuencia === 'semanal' ? 7 : 1;
  for (let d = 1; d <= sig + 1; d++) {
    const t = slotDe(sus, s.programado + d * 24 * H);
    if (t.slot !== s.slot) return t.programado;
  }
  return null;
}

function validarSuscripcion(b = {}, file = PROPIAS_PATH) {
  if (!listarPlantillas(file).some((p) => p.id === b.plantilla)) throw new Error('Plantilla inexistente');
  const frecuencia = FRECUENCIAS.includes(b.frecuencia) ? b.frecuencia : null;
  if (!frecuencia) throw new Error('Frecuencia inválida');
  const hora = /^([01]\d|2[0-3]):[0-5]\d$/.test(b.hora || '') ? b.hora : null;
  if (!hora) throw new Error('Hora inválida (HH:MM)');
  const dia = frecuencia === 'semanal' ? Number(b.dia) : null;
  if (frecuencia === 'semanal' && !(dia >= 1 && dia <= 7)) throw new Error('Día de la semana inválido');
  const destinatarios = [...new Set((Array.isArray(b.destinatarios) ? b.destinatarios : String(b.destinatarios || '').split(/[\s,;]+/))
    .map((x) => String(x).trim().toLowerCase()).filter(Boolean))];
  if (!destinatarios.length || destinatarios.length > 20 || !destinatarios.every((x) => EMAIL_RE.test(x))) throw new Error('Destinatarios inválidos (1 a 20 correos)');
  return { plantilla: b.plantilla, frecuencia, hora, dia, destinatarios, activa: b.activa !== false };
}

// Al crear o cambiar la programación no se manda lo ya pasado: el primer envío es el próximo
function guardarSuscripcion(b, autor, file = PROPIAS_PATH, ahora = Date.now()) {
  const v = validarSuscripcion(b, file);
  const a = leerArchivo(file);
  const marcar = (x) => { const s = slotDe(x, ahora); return ahora >= s.programado ? s.slot : null; };
  let id = b.id;
  if (id) {
    const i = a.suscripciones.findIndex((x) => x.id === id);
    if (i < 0) throw new Error('Suscripción inexistente');
    const prev = a.suscripciones[i];
    // cambio de programación o reanudar una pausada: no se manda lo que pasó mientras tanto
    const cambio = ['frecuencia', 'hora', 'dia'].some((k) => prev[k] !== v[k]) || (prev.activa === false && v.activa);
    a.suscripciones[i] = { ...prev, ...v, ...(cambio ? { ultimoSlot: marcar(v) } : {}), modificada: new Date(ahora).toISOString(), autor };
  } else {
    if (a.suscripciones.length >= MAX_PROPIAS) throw new Error(`No se pueden superar ${MAX_PROPIAS} suscripciones`);
    id = `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    a.suscripciones.push({ id, ...v, ultimoSlot: marcar(v), creada: new Date(ahora).toISOString(), autor });
  }
  escribirArchivo(a, file);
  return a.suscripciones.find((x) => x.id === id);
}
function borrarSuscripcion(id, file = PROPIAS_PATH) {
  const a = leerArchivo(file);
  if (!a.suscripciones.some((x) => x.id === id)) throw new Error('Suscripción inexistente');
  escribirArchivo({ ...a, suscripciones: a.suscripciones.filter((x) => x.id !== id) }, file);
}
function listarSuscripciones(file = PROPIAS_PATH, ahora = Date.now()) {
  return leerArchivo(file).suscripciones.map((x) => ({ ...x, proximo: x.activa === false ? null : proximoEnvio(x, ahora) }));
}
function marcarEnvio(id, cambios, file = PROPIAS_PATH) {
  const a = leerArchivo(file);
  const i = a.suscripciones.findIndex((x) => x.id === id);
  if (i < 0) return;
  a.suscripciones[i] = { ...a.suscripciones[i], ...cambios };
  escribirArchivo(a, file);
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

// Período anterior al [desde, hasta): meses enteros → los meses previos; un mes en curso →
// el mismo tramo del mes anterior; cualquier otro → la misma duración justo antes
function periodoAnterior(desde, hasta) {
  const d = new Date(desde), h = new Date(hasta);
  const cero = (x) => x.getHours() === 0 && x.getMinutes() === 0;
  if (d.getDate() === 1 && cero(d)) {
    const meses = (h.getFullYear() - d.getFullYear()) * 12 + h.getMonth() - d.getMonth();
    const pd = new Date(d.getFullYear(), d.getMonth() - Math.max(1, meses), 1).getTime();
    if (meses >= 1 && h.getDate() === 1 && cero(h)) return [pd, desde];
    return [pd, Math.min(pd + (hasta - desde), desde)];
  }
  return [desde - (hasta - desde), desde];
}

// Números de un resumen que se comparan entre períodos
function cifras(s, lossMeter, lluvia) {
  const main = principal(s.meters || [], lossMeter);
  const eb = s.totals && s.totals.driveEnergyKwh, vol = s.totals && s.totals.volumeM3;
  return [
    ['Energía bombas', 'kWh', 0, eb],
    ['Energía principal', 'kWh', 0, main && main.energyKwh],
    ['Volumen bombeado', 'm³', 0, vol],
    ['kWh / m³', '', 3, vol ? eb / vol : null],
    ['Horas de marcha', 'h', 1, (s.drives || []).reduce((t, x) => t + (x.opHours || 0), 0)],
    ['Pérdida', 'kWh', 0, s.loss && s.loss.energyKwh],
    ['Demanda máxima', 'kW', 0, main && main.demandMax && main.demandMax.kw],
    ['Lluvia', 'mm', 1, lluvia],
  ];
}

function bComparativo(s, sPrev, ctx) {
  const a = cifras(s, ctx.lossMeter, ctx.lluvia), b = cifras(sPrev, ctx.lossMeter, ctx.lluviaPrev);
  const filas = a.map(([label, u, dec, v], i) => {
    const p = b[i][3];
    if (v == null && p == null) return null;
    const dif = v != null && p != null ? v - p : null;
    return [u ? `${label} (${u})` : label, r1(v, dec), r1(p, dec), r1(dif, dec), dif != null && p ? r1((dif / Math.abs(p)) * 100, 1) : null, dec];
  }).filter(Boolean);
  const f = (ms) => fechaLocal(ms).split('-').reverse().join('/');
  // decFilas: decimales por fila (kWh/m³ lleva 3); la variación % siempre 1
  return [
    { tabla: { columnas: [{ label: 'Indicador' }, { label: 'Período' }, { label: 'Anterior' }, { label: 'Diferencia' }, { label: 'Variación %', dec: 1 }],
      filas: filas.map((f) => f.slice(0, 5)), decFilas: filas.map((f) => f[5]) } },
    { nota: `Período anterior: ${f(ctx.desdePrev)} al ${f(ctx.hastaPrev - 1)}.` },
  ];
}

// Arranques por bomba: flancos de subida del campo `running` en el período
async function arranquesPor(desde, hasta, bucket) {
  const q = `from(bucket: "${bucket}")
  |> range(start: ${new Date(desde).toISOString()}, stop: ${new Date(hasta).toISOString()})
  |> filter(fn: (r) => r._measurement == "drive_data" and r._field == "running")
  |> map(fn: (r) => ({ r with _value: if r._value then 1 else 0 }))
  |> group(columns: ["name"])
  |> difference()
  |> filter(fn: (r) => r._value == 1)
  |> count()`;
  const out = {};
  for (const r of await reports.queryInflux(q)) if (r.name != null) out[r.name] = Number(r._value);
  return out;
}

function bArranques(s, arranques, ctx) {
  const dias = Math.max(1, (ctx.hasta - ctx.desde) / (24 * H));
  const filas = (s.drives || []).map((d) => {
    const n = arranques[d.name] || 0;
    return [d.name, n, r1(n / dias, 1), r1(d.opHours, 1), n ? r1((d.opHours || 0) / n, 2) : null];
  });
  const total = filas.reduce((t, f) => t + f[1], 0);
  const mas = [...filas].sort((a, b) => b[1] - a[1])[0];
  return [
    { kpis: [
      { label: 'ARRANQUES', valor: total, unidad: '' },
      { label: 'POR DÍA', valor: r1(total / dias, 1), unidad: '', dec: 1 },
      ...(mas && mas[1] ? [{ label: `MÁS ARRANQUES: ${mas[0]}`.toUpperCase(), valor: mas[1], unidad: '' }] : []),
    ] },
    { tabla: { columnas: [{ label: 'Bomba' }, { label: 'Arranques', dec: 0 }, { label: 'Por día', dec: 1 }, { label: 'Horas marcha', dec: 1 }, { label: 'Marcha promedio h', dec: 2 }], filas } },
    { nota: 'Muchos arranques con marchas cortas aceleran el desgaste del motor y del arrancador.' },
  ];
}

const diaCorto = (fecha) => fecha.slice(5).split('-').reverse().join('/');
const horaDe = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function bDemanda(s, dias, ctx) {
  const main = principal(s.meters || [], ctx.lossMeter);
  if (!main) return [{ nota: 'No hay medidores con datos en el período.' }];
  const dm = main.demandMax, horas = (ctx.hasta - ctx.desde) / H;
  const prom = main.stats && main.stats.power && main.stats.power.avg;
  const partes = [{ kpis: [
    { label: `DEMANDA MÁXIMA ${main.displayName || main.name}`.toUpperCase(), valor: dm ? r1(dm.kw, 0) : null, unidad: 'kW' },
    { label: 'FECHA Y HORA', valor: dm ? `${diaCorto(fechaLocal(Date.parse(dm.from)))} ${horaDe(dm.from)}` : null, unidad: '' },
    { label: 'POTENCIA PROMEDIO', valor: r1(prom, 0), unidad: 'kW' },
    { label: 'FACTOR DE CARGA', valor: dm && dm.kw && horas ? r1(((main.energyKwh || 0) / (dm.kw * horas)) * 100, 1) : null, unidad: '%', dec: 1 },
  ] }];
  if (!ctx.detalle) return [...partes, { nota: `El detalle por día está disponible para períodos de hasta ${MAX_DIAS_DETALLE} días.` }];
  const porDia = dias.map(({ fecha, s: sd }) => {
    const m = (sd.meters || []).find((x) => x.name === main.name);
    return { fecha, d: m && m.demandMax, e: m && m.energyKwh };
  });
  partes.push({ grafico: { x: porDia.map((x) => diaCorto(x.fecha)), series: [
    { label: 'Demanda máxima', unidad: 'kW', valores: porDia.map((x) => (x.d ? r1(x.d.kw, 0) : null)) },
    { label: 'Energía', unidad: 'kWh', valores: porDia.map((x) => r1(x.e, 0)) },
  ] } });
  partes.push({ tabla: { titulo: 'Días de mayor demanda', columnas: [{ label: 'Fecha' }, { label: 'Hora' }, { label: `Demanda ${dm ? dm.minutes : 15} min kW`, dec: 0 }],
    filas: porDia.filter((x) => x.d).sort((a, b) => b.d.kw - a.d.kw).slice(0, 5).map((x) => [x.fecha.split('-').reverse().join('/'), `${horaDe(x.d.from)}–${horaDe(x.d.to)}`, r1(x.d.kw, 0)]) } });
  return partes;
}

function bPerdidas(dias, ctx) {
  if (!ctx.lossMeter || !ctx.lossMeter.main) return [{ nota: 'Para este bloque hay que configurar el balance de pérdida (medidor principal y los que restan) en Configuración.' }];
  if (!ctx.detalle) return [{ nota: `El detalle por día está disponible para períodos de hasta ${MAX_DIAS_DETALLE} días.` }];
  const filas = dias.map(({ fecha, s }) => {
    const l = s.loss || {}, main = (s.meters || []).find((m) => m.name === ctx.lossMeter.main);
    const e = main && main.energyKwh;
    return [fecha, r1(e, 1), r1(l.energyKwh, 1), l.energyKwh != null && e ? r1((l.energyKwh / e) * 100, 2) : null, r1(l.avgKw, 1), r1(l.maxKw, 1)];
  });
  const sum = (k) => { const v = filas.map((f) => f[k]).filter((x) => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0), 1) : null; };
  const eT = sum(1), lT = sum(2), pct = lT != null && eT ? r1((lT / eT) * 100, 2) : null;
  const peor = filas.filter((f) => f[2] != null).sort((a, b) => b[2] - a[2])[0];
  return [
    { kpis: [
      { label: 'PÉRDIDA TOTAL', valor: lT, unidad: 'kWh' },
      { label: 'PÉRDIDA SOBRE EL PRINCIPAL', valor: pct, unidad: '%', dec: 2 },
      ...(peor ? [{ label: `DÍA DE MAYOR PÉRDIDA (${peor[0].split('-').reverse().join('/')})`, valor: peor[2], unidad: 'kWh' }] : []),
    ] },
    { grafico: { x: filas.map((f) => diaCorto(f[0])), series: [
      { label: 'Pérdida', unidad: 'kWh', valores: filas.map((f) => f[2]) },
      { label: 'Pérdida', unidad: '%', valores: filas.map((f) => f[3]) },
    ] } },
    { tabla: { columnas: [{ label: 'Fecha' }, { label: 'Energía principal kWh', dec: 1 }, { label: 'Pérdida kWh', dec: 1 }, { label: 'Pérdida %', dec: 2 }, { label: 'Pot. media kW', dec: 1 }, { label: 'Pot. máx kW', dec: 1 }],
      filas, total: ['TOTAL', eT, lT, pct, null, null] } },
  ];
}

function bLluvia(dias, ctx) {
  if (!ctx.detalle) return [{ nota: `El detalle por día está disponible para períodos de hasta ${MAX_DIAS_DETALLE} días.` }];
  const { filas: pd } = filasPorDia(dias, ctx.lossMeter);
  // [fecha, lluvia, río, volumen, energía, horas]
  const filas = pd.map((f) => [f[0], f[7], f[8], f[3], f[1], f[5]]);
  const lluvias = filas.map((f) => f[1]).filter((x) => x != null), rios = filas.map((f) => f[2]).filter((x) => x != null);
  const conVol = filas.some((f) => f[3] != null);
  const sum = (k) => { const v = filas.map((f) => f[k]).filter((x) => x != null); return v.length ? r1(v.reduce((a, b) => a + b, 0), 1) : null; };
  return [
    { kpis: [
      { label: 'LLUVIA TOTAL', valor: lluvias.length ? r1(lluvias.reduce((a, b) => a + b, 0), 1) : null, unidad: 'mm', dec: 1 },
      { label: 'DÍAS CON LLUVIA', valor: lluvias.filter((x) => x > 0).length, unidad: '' },
      { label: 'RÍO MÍN / MÁX', valor: rios.length ? `${num(Math.min(...rios), 2)} / ${num(Math.max(...rios), 2)}` : null, unidad: 'm' },
    ] },
    { grafico: { x: filas.map((f) => diaCorto(f[0])), series: [
      { label: 'Lluvia', unidad: 'mm', valores: filas.map((f) => f[1]) },
      conVol ? { label: 'Volumen', unidad: 'm³', valores: filas.map((f) => f[3]) } : { label: 'Energía bombas', unidad: 'kWh', valores: filas.map((f) => f[4]) },
    ] } },
    { tabla: { columnas: [{ label: 'Fecha' }, { label: 'Lluvia mm', dec: 1 }, { label: 'Río m', dec: 2 }, { label: 'Volumen m³', dec: 0 }, { label: 'Energía bombas kWh', dec: 1 }, { label: 'Horas marcha', dec: 1 }],
      filas, total: ['TOTAL', sum(1), null, sum(3), sum(4), sum(5)] } },
    { nota: 'La lluvia y la altura del río salen de la carga manual del resumen diario.' },
  ];
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
  const lluviaDe = (fs_) => { const v = fs_.map((f) => (manualService.get(f) || {}).rainMm).filter((x) => typeof x === 'number'); return v.length ? v.reduce((a, b) => a + b, 0) : null; };
  const ctx = { desde, hasta, lossMeter: cfg.lossMeter, nombre: (n) => nombres[n] || n, lluvia: lluviaDe(fechas) };

  const necesita = (...b) => b.some((x) => plantilla.bloques.includes(x));
  const resumen = (a, b) => reports.generateSummary({ from: new Date(a).toISOString(), to: new Date(b).toISOString(), bucket });
  const s = await resumen(desde, hasta);
  const alarmas = necesita('bombas', 'eventos') ? await alarmLog.history({ from: desde, to: hasta }) : [];
  const detalle = necesita('por_dia', 'grafico_dia', 'demanda', 'perdidas', 'lluvia') && fechas.length <= MAX_DIAS_DETALLE;
  ctx.detalle = detalle;
  const dias = detalle ? await resumenesPorDia(fechas, bucket) : [];
  let sPrev = null, arranques = {};
  if (necesita('comparativo')) {
    [ctx.desdePrev, ctx.hastaPrev] = periodoAnterior(desde, hasta);
    sPrev = await resumen(ctx.desdePrev, ctx.hastaPrev);
    ctx.lluviaPrev = lluviaDe(diasDelPeriodo(ctx.desdePrev, ctx.hastaPrev));
  }
  if (necesita('arranques')) arranques = await arranquesPor(desde, hasta, bucket).catch((e) => { console.error('[INFORMES] arranques:', e.message); return {}; });

  const bloques = plantilla.bloques.map((tipo) => {
    let partes;
    if (tipo === 'indicadores') partes = bIndicadores(s, ctx);
    else if (tipo === 'por_dia') partes = detalle ? bPorDia(dias, ctx) : [{ nota: `El detalle por día está disponible para períodos de hasta ${MAX_DIAS_DETALLE} días.` }];
    else if (tipo === 'grafico_dia') partes = detalle ? bGraficoDia(dias, ctx) : [{ nota: `El gráfico por día está disponible para períodos de hasta ${MAX_DIAS_DETALLE} días.` }];
    else if (tipo === 'bombas') partes = bBombas(s, alarmas, ctx);
    else if (tipo === 'eventos') partes = bEventos(alarmas, ctx);
    else if (tipo === 'calidad') partes = bCalidad(s);
    else if (tipo === 'comparativo') partes = bComparativo(s, sPrev, ctx);
    else if (tipo === 'arranques') partes = bArranques(s, arranques, ctx);
    else if (tipo === 'demanda') partes = bDemanda(s, dias, ctx);
    else if (tipo === 'perdidas') partes = bPerdidas(dias, ctx);
    else if (tipo === 'lluvia') partes = bLluvia(dias, ctx);
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
  const NARANJA = require('./branding').get().colorInforme, OSC = '#333333', GRIS = '#888888';  // color de Configuración → Marca
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
      const fila = (vals, y, i, cab, negrita, decF) => {
        if (cab) doc.rect(mL, y, W, 20).fill(NARANJA); else if (i % 2) doc.rect(mL, y, W, 16).fill('#fafafa');
        let x = mL;
        vals.forEach((v, k) => {
          const txt = cab ? v : (typeof v === 'number' ? num(v, t.columnas[k].dec ?? decF ?? 0) : num(v));
          doc.fontSize(7.5).fillColor(cab ? '#fff' : OSC).font(cab || negrita ? 'Helvetica-Bold' : 'Helvetica').text(txt, x + 4, y + (cab ? 5 : 4), { width: ws[k] - 8, align: k === 0 ? 'left' : 'right', lineBreak: false, ellipsis: true });
          x += ws[k];
        });
        return y + (cab ? 22 : 16);
      };
      const cab = t.columnas.map((c) => c.label);
      let y = fila(cab, doc.y, 0, true);
      const filas = t.filas.length ? t.filas : [['Sin datos', ...cab.slice(1).map(() => '')]];
      filas.forEach((r, i) => { if (y > bajo()) { doc.addPage(); y = fila(cab, 40, 0, true); } y = fila(r, y, i, false, false, t.decFilas && t.decFilas[i]); });
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

// ─── Envío ──────────────────────────────────────────────────────────
// Genera el informe del período de la suscripción y lo manda en PDF con el SMTP de Configuración → Correo
async function enviarSuscripcion(sus, { manual = false } = {}) {
  const settings = require('./settings');
  const nodemailer = require('nodemailer');
  const branding = require('./branding');
  const smtp = settings.getSmtpFull();
  if (!smtp.user || !smtp.pass) throw new Error('SMTP no configurado (Configuración → Correo)');
  const s = slotDe(sus);
  const inf = await generarInforme({ plantilla: sus.plantilla, from: new Date(s.desde).toISOString(), to: new Date(s.hasta).toISOString() });
  const pdf = await aPDF(inf, branding);
  const marca = branding.get() || {};
  const planta = marca.name || 'Planta de Bombeo';
  const per = `${fFecha(inf.desde).slice(0, 10)} al ${fFecha(new Date(s.hasta - 1).toISOString()).slice(0, 10)}`;
  const slug = inf.titulo.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'informe';
  const archivo = `${slug}_${fechaLocal(Date.parse(inf.desde))}.pdf`;
  await nodemailer.createTransport(settings.smtpTransportOptions()).sendMail({
    from: `"Monitoreo - ${planta}" <${smtp.from || smtp.user}>`,
    to: sus.destinatarios.join(', '),
    subject: `[Monitoreo - ${planta}] ${inf.titulo} — ${per}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:620px">
      <h2 style="color:${marca.colorInforme};margin-bottom:4px">${inf.titulo}</h2>
      <p style="color:#555">Adjunto el informe del período <strong>${per}</strong>.</p>
      <p style="color:#999;font-size:11px">${manual ? 'Envío manual' : `Suscripción ${sus.frecuencia}`} · Generado automáticamente${marca.footer ? ` · Powered by ${branding.esc(marca.footer)}` : ''}</p>
    </div>`,
    attachments: [{ filename: archivo, content: pdf, contentType: 'application/pdf' }],
  });
  return { ok: true, periodo: per, to: sus.destinatarios };
}

// Cada minuto: manda las suscripciones vencidas. El período queda marcado aunque falle
// (no reintenta cada minuto); el error se ve en el portal y se puede reenviar a mano.
let enCurso = false;
async function revisarSuscripciones(ahora = Date.now()) {
  if (enCurso) return;
  enCurso = true;
  try {
    for (const sus of leerArchivo().suscripciones.filter((x) => vencida(x, ahora))) {
      const slot = slotDe(sus, ahora).slot;
      try {
        await enviarSuscripcion(sus);
        marcarEnvio(sus.id, { ultimoSlot: slot, ultimoEnvio: new Date().toISOString(), ultimoError: null });
        console.log(`[INFORMES] Enviado ${sus.plantilla} (${sus.frecuencia}) a ${sus.destinatarios.length} destinatario(s)`);
      } catch (e) {
        marcarEnvio(sus.id, { ultimoSlot: slot, ultimoError: `${new Date().toISOString()} ${e.message}` });
        console.error('[INFORMES] Error al enviar suscripción:', e.message);
      }
    }
  } finally { enCurso = false; }
}
function iniciarSuscripciones() {
  setInterval(() => { revisarSuscripciones().catch((e) => console.error('[INFORMES]', e.message)); }, 60_000).unref();
}

module.exports = {
  BLOQUES, PLANTILLAS, PERIODOS, FRECUENCIAS, generarInforme, aXLSX, aPDF,
  listarSuscripciones, guardarSuscripcion, borrarSuscripcion, enviarSuscripcion, marcarEnvio, iniciarSuscripciones,
  slotDe, vencida, proximoEnvio, validarSuscripcion,
  listarPlantillas, guardarPlantilla, borrarPlantilla, validarPlantilla,
  // para tests
  diasDelPeriodo, horasEn, desbalance, principal, filasPorDia, bBombas, bEventos, bIndicadores, plantillaDe,
  periodoAnterior, bComparativo, bArranques, bDemanda, bPerdidas, bLluvia,
};
