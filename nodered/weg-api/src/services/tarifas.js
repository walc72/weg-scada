'use strict';
/**
 * Tarifas eléctricas: archivo tarifas.json, validación, versión vigente y franja horaria.
 * (El costeo se agrega más abajo, en su propia sección.)
 *
 * @typedef {{ dias: number[], desde: number, hasta: number }} Tramo
 * @typedef {{ nombre: string, precioKwh: number, tramos: Tramo[] }} Franja
 * @typedef {{ reservadaKw: number, precioKw: number, precioExcesoKw: number }} Reserva
 * @typedef {{ desde: string, franjas: Franja[], resto: { nombre: string, precioKwh: number },
 *   potencia: null | ({ modo: 'unica' } & Reserva) | { modo: 'diferencial', punta: Reserva, fuera: Reserva } }} Version
 * @typedef {{ id: string, nombre: string, versiones: Version[] }} Tarifa
 * @typedef {{ moneda: string, tarifas: Tarifa[], asignacion: Record<string, { tarifa: string|null, medidor: string|null }> }} Archivo
 */
const fs = require('fs');
const path = require('path');

// ─── Archivo ────────────────────────────────────────────────────────────────
const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const TARIFAS_PATH = path.join(path.dirname(CONFIG_PATH), 'tarifas.json');
const VACIO = { moneda: 'Gs', tarifas: [], asignacion: {} };

function leer(file = TARIFAS_PATH) {
  try {
    return validar(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    if (e.code !== 'ENOENT') console.error('[TARIFAS] no se pudo leer', file, '-', e.message);
    return structuredClone(VACIO);
  }
}
function escribirArchivo(obj, file = TARIFAS_PATH) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}
function guardar(entrada, file = TARIFAS_PATH) {
  const a = validar(entrada);
  escribirArchivo(a, file);
  return a;
}

// ─── Validación ─────────────────────────────────────────────────────────────
const MAX_TARIFAS = 20, MAX_VERSIONES = 50, MAX_FRANJAS = 6;
const DIAS = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const esNum = (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const texto = (s, max) => (typeof s === 'string' && s.trim().length >= 1 && s.trim().length <= max ? s.trim() : null);
const obj = (o) => (o && typeof o === 'object' && !Array.isArray(o) ? o : {});

function validarReserva(p, etiqueta) {
  if (![p.reservadaKw, p.precioKw, p.precioExcesoKw].every(esNum)) throw new Error(`${etiqueta}: la potencia reservada y los precios tienen que ser números mayores o iguales a 0`);
  return { reservadaKw: p.reservadaKw, precioKw: p.precioKw, precioExcesoKw: p.precioExcesoKw };
}
function validarPotencia(p, etiqueta) {
  if (p == null) return null;
  if (p.modo === 'unica') return { modo: 'unica', ...validarReserva(p, etiqueta) };
  if (p.modo === 'diferencial') return { modo: 'diferencial', punta: validarReserva(obj(p.punta), etiqueta + ' (punta)'), fuera: validarReserva(obj(p.fuera), etiqueta + ' (fuera de punta)') };
  throw new Error(`${etiqueta}: modo de potencia desconocido`);
}
function validarFranja(f, etiqueta) {
  const nombre = texto(f.nombre, 30);
  if (!nombre) throw new Error(`${etiqueta}: cada franja necesita un nombre de 1 a 30 caracteres`);
  if (!esNum(f.precioKwh)) throw new Error(`${etiqueta}: el precio de la franja "${nombre}" tiene que ser un número mayor o igual a 0`);
  const tramos = (Array.isArray(f.tramos) ? f.tramos : []).map((t) => {
    t = obj(t);
    const dias = Array.isArray(t.dias) ? t.dias : [];
    if (!dias.length || !dias.every((d) => Number.isInteger(d) && d >= 1 && d <= 7) || new Set(dias).size !== dias.length)
      throw new Error(`${etiqueta}: los días de la franja "${nombre}" tienen que ser únicos, de 1 (lunes) a 7 (domingo), y no pueden estar vacíos`);
    if (!Number.isInteger(t.desde) || !Number.isInteger(t.hasta) || t.desde < 0 || t.hasta > 24 || t.desde >= t.hasta)
      throw new Error(`${etiqueta}: la hora de la franja "${nombre}" tiene que ser entera, de 0 a 24, con desde menor que hasta`);
    return { dias: [...dias].sort((a, b) => a - b), desde: t.desde, hasta: t.hasta };
  });
  return { nombre, precioKwh: f.precioKwh, tramos };
}
function validarVersion(v, etiqueta) {
  if (typeof v.desde !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.desde) || Number.isNaN(Date.parse(v.desde)))
    throw new Error(`${etiqueta}: la fecha "desde" tiene que tener formato AAAA-MM-DD`);
  etiqueta = `${etiqueta}, versión ${v.desde}`;
  const franjasIn = Array.isArray(v.franjas) ? v.franjas : [];
  if (franjasIn.length > MAX_FRANJAS) throw new Error(`${etiqueta}: máximo ${MAX_FRANJAS} franjas`);
  const franjas = franjasIn.map((f) => validarFranja(obj(f), etiqueta));
  // grilla 7×24: cada hora puede pertenecer a una sola franja
  const grilla = Array.from({ length: 7 }, () => Array(24).fill(-1));
  franjas.forEach((f, i) => f.tramos.forEach((t) => t.dias.forEach((d) => {
    for (let h = t.desde; h < t.hasta; h++) {
      if (grilla[d - 1][h] >= 0) throw new Error(`${etiqueta}: la franja "${f.nombre}" se superpone con "${franjas[grilla[d - 1][h]].nombre}" (${DIAS[d]}, ${h} h)`);
      grilla[d - 1][h] = i;
    }
  })));
  const resto = obj(v.resto);
  const nombreResto = texto(resto.nombre, 30);
  if (!nombreResto) throw new Error(`${etiqueta}: el resto necesita un nombre de 1 a 30 caracteres`);
  if (!esNum(resto.precioKwh)) throw new Error(`${etiqueta}: el precio del resto tiene que ser un número mayor o igual a 0`);
  return { desde: v.desde, franjas, resto: { nombre: nombreResto, precioKwh: resto.precioKwh }, potencia: validarPotencia(v.potencia, etiqueta) };
}
const generarId = () => `t-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6).padEnd(4, '0')}`;

/** Normaliza y valida un archivo de tarifas; lanza Error con un mensaje para el usuario. */
function validar(entrada) {
  const o = obj(entrada);
  const moneda = o.moneda == null ? 'Gs' : texto(o.moneda, 8);
  if (!moneda) throw new Error('La moneda tiene que tener de 1 a 8 caracteres');
  const tarifasIn = Array.isArray(o.tarifas) ? o.tarifas : [];
  if (tarifasIn.length > MAX_TARIFAS) throw new Error(`Máximo ${MAX_TARIFAS} tarifas`);
  const nombres = new Set(), ids = new Set();
  const tarifas = tarifasIn.map((t) => {
    t = obj(t);
    const nombre = texto(t.nombre, 60);
    if (!nombre) throw new Error('Cada tarifa necesita un nombre de 1 a 60 caracteres');
    if (nombres.has(nombre.toLowerCase())) throw new Error(`Tarifa "${nombre}": ya existe una tarifa con ese nombre`);
    nombres.add(nombre.toLowerCase());
    let id = typeof t.id === 'string' && /^t-[a-z0-9]{4,20}$/.test(t.id) && !ids.has(t.id) ? t.id : generarId();
    while (ids.has(id)) id = generarId();
    ids.add(id);
    const vIn = Array.isArray(t.versiones) ? t.versiones : [];
    if (vIn.length < 1 || vIn.length > MAX_VERSIONES) throw new Error(`La tarifa "${nombre}" tiene que tener de 1 a ${MAX_VERSIONES} versiones`);
    const versiones = vIn.map((v) => validarVersion(obj(v), `Tarifa "${nombre}"`)).sort((a, b) => a.desde.localeCompare(b.desde));
    for (let i = 1; i < versiones.length; i++)
      if (versiones[i].desde === versiones[i - 1].desde) throw new Error(`Tarifa "${nombre}": versión repetida (${versiones[i].desde})`);
    return { id, nombre, versiones };
  });
  const asignacion = {};
  for (const [k, a] of Object.entries(obj(o.asignacion))) {
    const x = obj(a), sitio = k.trim() || 'Sin sitio';
    if (x.tarifa != null && !ids.has(x.tarifa)) throw new Error(`La asignación de "${sitio}" apunta a una tarifa inexistente`);
    if (x.medidor != null && typeof x.medidor !== 'string') throw new Error(`El medidor de "${sitio}" tiene que ser un texto`);
    asignacion[k.trim()] = { tarifa: x.tarifa ?? null, medidor: x.medidor ?? null };
  }
  return { moneda, tarifas, asignacion };
}

// ─── Vigencia y franja ──────────────────────────────────────────────────────
/** Fecha local AAAA-MM-DD de un instante en ms. */
function fechaLocal(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Última versión con desde <= fecha, o null si la fecha es anterior a todas. */
function versionVigente(tarifa, fecha) {
  let r = null;
  for (const v of tarifa.versiones) if (v.desde <= fecha && (!r || v.desde > r.desde)) r = v;
  return r;
}
/** Índice de la franja de `version.franjas` que cubre el instante (hora local), -1 = resto. */
function franjaDe(version, ms) {
  const d = new Date(ms), dia = ((d.getDay() + 6) % 7) + 1, h = d.getHours();
  return version.franjas.findIndex((f) => f.tramos.some((t) => t.dias.includes(dia) && h >= t.desde && h < t.hasta));
}

module.exports = { TARIFAS_PATH, VACIO, leer, validar, guardar, versionVigente, franjaDe, fechaLocal };
