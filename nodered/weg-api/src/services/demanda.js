'use strict';

// Demanda con uno o dos medidores (bloque Demanda de los informes) y registro de maniobras de seccionadores.
//
// maniobras.json: cambios de estado de los seccionadores del unifilar, con fecha. Los graba la maniobra
// desde la vista y el guardado del editor; un admin agrega o borra a mano (períodos anteriores al registro,
// o maniobras que nadie marcó). No se recorta con el historial del unifilar.
// demanda.json: medidores del bloque (1 o 2) y el seccionador de enlace. Con el seccionador cerrado el
// medidor B queda aguas abajo de A: total = A. Abierto (o sin seccionador): total = A + B.

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const MANIOBRAS_PATH = path.join(path.dirname(CONFIG_PATH), 'maniobras.json');
const DEMANDA_PATH = path.join(path.dirname(CONFIG_PATH), 'demanda.json');
const MAX_CAMBIOS = 5000;

function leerJson(file, def) {
  try { const j = JSON.parse(fs.readFileSync(file, 'utf8')); return j && typeof j === 'object' ? j : def; } catch { return def; }
}
function escribirJson(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.tmp', JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(file + '.tmp', file);
}

// ─── Maniobras ──────────────────────────────────────────────────────
const leerCambios = (file = MANIOBRAS_PATH) => [leerJson(file, {}).cambios].flatMap((l) => (Array.isArray(l) ? l : []))
  .filter((c) => c && Number.isFinite(Date.parse(c.fecha)))
  .sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha));

const nuevoId = () => `m-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// lista: [{ dibujo, nodo, nombre, cerrado, usuario, origen, fecha? }]
function registrar(lista, file = MANIOBRAS_PATH) {
  if (!lista.length) return [];
  const nuevos = lista.map((c) => ({
    id: nuevoId(), fecha: c.fecha || new Date().toISOString(), dibujo: String(c.dibujo), nodo: String(c.nodo),
    nombre: String(c.nombre || ''), cerrado: !!c.cerrado, usuario: String(c.usuario || ''), origen: c.origen || 'maniobra',
  }));
  escribirJson(file, { cambios: [...leerCambios(file), ...nuevos].sort((a, b) => Date.parse(a.fecha) - Date.parse(b.fecha)).slice(-MAX_CAMBIOS) });
  return nuevos;
}

function borrarCambio(id, file = MANIOBRAS_PATH) {
  const l = leerCambios(file);
  if (!l.some((c) => c.id === id)) throw new Error('Cambio inexistente');
  escribirJson(file, { cambios: l.filter((c) => c.id !== id) });
}

// Seccionadores de un unifilar: [{ dibujo, nodo, nombre, cerrado }]
function seccionadores(data) {
  const out = [];
  for (const d of (data && data.dibujos) || []) {
    for (const n of d.nodos || []) {
      if (n.tipo === 'seccionador') out.push({ dibujo: d.id, nodo: n.id, nombre: n.nombre || n.id, dibujoNombre: d.nombre || d.id, cerrado: !!n.cerrado });
    }
  }
  return out;
}

// Seccionadores que cambiaron de estado entre dos versiones del unifilar
function diffSeccionadores(antes, despues) {
  const prev = new Map(seccionadores(antes).map((s) => [`${s.dibujo}|${s.nodo}`, s]));
  return seccionadores(despues).filter((s) => { const p = prev.get(`${s.dibujo}|${s.nodo}`); return p && p.cerrado !== s.cerrado; });
}

const delSeccionador = (cambios, sec) => cambios.filter((c) => sec && c.dibujo === sec.dibujo && c.nodo === sec.nodo);

// ¿Cerrado en t? El último cambio hasta t; antes del primero, lo contrario del primero; sin cambios, el actual.
function estadoEn(cambios, t, actual) {
  let e = null;
  for (const c of cambios) { if (Date.parse(c.fecha) <= t) e = c.cerrado; else break; }
  if (e != null) return e;
  return cambios.length ? !cambios[0].cerrado : !!actual;
}

// ─── Configuración del bloque ───────────────────────────────────────
function leerConfig(file = DEMANDA_PATH) {
  const j = leerJson(file, {});
  const medidores = Array.isArray(j.medidores) ? j.medidores.filter((x) => typeof x === 'string').slice(0, 2) : [];
  const sec = j.seccionador && typeof j.seccionador === 'object' && j.seccionador.dibujo && j.seccionador.nodo
    ? { dibujo: String(j.seccionador.dibujo), nodo: String(j.seccionador.nodo) } : null;
  return { medidores, seccionador: medidores.length === 2 ? sec : null };
}

function validarConfig(b = {}) {
  const medidores = [...new Set(Array.isArray(b.medidores) ? b.medidores : [])].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim());
  if (medidores.length > 2) throw new Error('Medidores inválidos: elegí uno o dos');
  const s = b.seccionador;
  if (s != null && (typeof s !== 'object' || typeof s.dibujo !== 'string' || typeof s.nodo !== 'string' || !s.dibujo || !s.nodo)) throw new Error('Seccionador inválido');
  return { medidores, seccionador: medidores.length === 2 && s ? { dibujo: s.dibujo, nodo: s.nodo } : null };
}

function guardarConfig(b, file = DEMANDA_PATH) {
  const c = validarConfig(b);
  escribirJson(file, c);
  return c;
}

// ─── Total coincidente ──────────────────────────────────────────────
// rows: los de reports.meterDemand ({ _time, name, kw }), bloques de everySec. Se descartan el bloque en
// curso (como maxDemandBy) y los bloques sin dato de A, o sin dato de B cuando B suma.
// cerrado(t) → ¿B aguas abajo de A en el bloque que empieza en t? Devuelve [{ from, kw, cerrado }].
function totalPorBloque(rows, a, b, everySec, stopMs, cerrado = () => false) {
  const porT = new Map();
  for (const r of rows) {
    if (r.name !== a && r.name !== b) continue;
    const t = Date.parse(r._time);
    if (!Number.isFinite(t) || t + everySec * 1000 > stopMs) continue;
    const x = porT.get(t) || {};
    x[r.name === a ? 'a' : 'b'] = r.kw;
    porT.set(t, x);
  }
  const out = [];
  for (const [t, x] of [...porT].sort((p, q) => p[0] - q[0])) {
    if (x.a == null) continue;
    const c = cerrado(t);
    if (!c && x.b == null) continue;
    out.push({ from: t, kw: Math.round((c ? x.a : x.a + x.b) * 10) / 10, cerrado: c });
  }
  return out;
}

const maxDe = (bloques) => bloques.reduce((m, x) => (!m || x.kw > m.kw ? x : m), null);

// ─── Para el portal ─────────────────────────────────────────────────
const UNIFILAR_PATH = path.join(path.dirname(CONFIG_PATH), 'unifilar.json');
const seccionadoresActuales = (file = UNIFILAR_PATH) => seccionadores(leerJson(file, {}));

// Configuración, medidores y seccionadores para elegir, y los cambios del seccionador elegido
function vista(cfg = {}) {
  const config = leerConfig();
  const nombres = cfg.meterNames || {};
  const medidores = (cfg.meters || []).filter((m) => m && m.name).map((m) => ({ name: m.name, nombre: nombres[m.name] || m.displayName || m.name }));
  return { config, medidores, seccionadores: seccionadoresActuales(), cambios: config.seccionador ? delSeccionador(leerCambios(), config.seccionador) : [] };
}

// Período cargado a mano: el seccionador quedó `cerrado` desde `desde` (y volvió al estado contrario en `hasta`)
function agregarPeriodo(b = {}, usuario = '') {
  const desde = Date.parse(b.desde), hasta = b.hasta ? Date.parse(b.hasta) : null;
  if (!Number.isFinite(desde)) throw new Error('Fecha desde inválida');
  if (hasta != null && (!Number.isFinite(hasta) || hasta <= desde)) throw new Error('Fecha hasta inválida: tiene que ser posterior a desde');
  const sec = seccionadoresActuales().find((s) => s.dibujo === b.dibujo && s.nodo === b.nodo);
  if (!sec) throw new Error('Seccionador inexistente');
  const base = { dibujo: sec.dibujo, nodo: sec.nodo, nombre: sec.nombre, usuario, origen: 'manual' };
  return registrar([
    { ...base, cerrado: !!b.cerrado, fecha: new Date(desde).toISOString() },
    ...(hasta != null ? [{ ...base, cerrado: !b.cerrado, fecha: new Date(hasta).toISOString() }] : []),
  ]);
}

module.exports = {
  MANIOBRAS_PATH, DEMANDA_PATH, leerCambios, registrar, borrarCambio, seccionadores, diffSeccionadores, delSeccionador,
  estadoEn, leerConfig, validarConfig, guardarConfig, totalPorBloque, maxDe, seccionadoresActuales, vista, agregarPeriodo,
};
