'use strict';

// Dibujo del unifilar: config/unifilar.json (separado de config.json).
// Versión = sha256 (16 hex) del contenido; el PUT trae la versión base y, si
// cambió, se rechaza con 409 (dos admins no se pisan).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT = {
  version: 1,
  colores: 'portal',
  dibujos: [{ id: 'general', nombre: 'Red general', tipo: 'general', nodos: [], conexiones: [] }],
};

const MAX_DIBUJOS = 64;
const MAX_NODOS = 1500;
const MAX_CONEXIONES = 3000;

const versionOf = (data) => crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 16);

// Keys fijas de `mostrar` por tipo (spec §3.5); reco y reg admiten además {med}/{senal}.
const KEYS = {
  reco: ['ia', 'ib', 'ic', 'va', 'vb', 'vc', 'operaciones'],
  reg: ['tap', 'v', 'i', 'vConsigna'],
  medidor: ['voltage', 'current', 'power', 'pf'],
  bomba: ['current', 'frequency', 'power'],
};
const LIBRES = new Set(['reco', 'reg']);
const CON_REF = new Set(['reco', 'medidor', 'bomba', 'caudalimetro', 'comm']);
const CON_NOMBRE = new Set(['fuente', 'trafo', 'seccionador', 'fusible', 'carga']);
const TIPOS = new Set([...CON_REF, ...CON_NOMBRE, 'reg', 'barra', 'texto', 'recuadro', 'sitio']);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, min = 1, max = 200) => typeof v === 'string' && v.length >= min && v.length <= max;
const isInt = (v) => Number.isInteger(v);

// Puntos de conexión de un nodo (spec §2.2)
function puntosDe(n) {
  switch (n.tipo) {
    case 'reco': case 'reg': case 'medidor': case 'trafo': case 'seccionador': case 'fusible': return ['a', 'b'];
    case 'bomba': case 'fuente': case 'carga': return ['a'];
    case 'barra': {
      if (!isInt(n.largo) || n.largo < 20) return [];
      return Array.from({ length: Math.floor(n.largo / 20) + 1 }, (_, i) => `p${i}`);
    }
    default: return [];
  }
}

function checkMostrar(n, at, err) {
  if (n.mostrar === undefined) return;
  if (!Array.isArray(n.mostrar)) return err(`${at}: mostrar debe ser una lista`);
  n.mostrar.forEach((m, i) => {
    const w = `${at}: mostrar[${i}]`;
    if (typeof m === 'string') {
      // caudalímetro: sin keys fijas definidas, cualquier nombre corto
      const ok = KEYS[n.tipo] ? KEYS[n.tipo].includes(m) : n.tipo === 'caudalimetro' && isStr(m, 1, 40);
      if (!ok) err(`${w} no es una medición válida para ${n.tipo}`);
    } else if (isObj(m) && LIBRES.has(n.tipo) && (('med' in m) !== ('senal' in m))) {
      const nombre = 'med' in m ? m.med : m.senal;
      if (!isStr(nombre, 1, 40)) err(`${w}: el nombre debe tener entre 1 y 40 caracteres`);
    } else err(`${w} inválido`);
  });
}

function checkVinculo(v, at, dib, general, err) {
  if (v === undefined) return;
  if (!isObj(v)) return err(`${at}: vinculo inválido`);
  if ('desde' in v) {
    if (dib.tipo !== 'sitio') return err(`${at}: vinculo.desde solo en dibujos de sitio`);
    if (!general || !general.nodos.some((x) => isObj(x) && x.id === v.desde)) err(`${at}: vinculo.desde no existe en el dibujo general`);
    return;
  }
  if (('ref' in v) === ('banco' in v)) return err(`${at}: vinculo lleva ref o banco, no ambos`);
  if (!isStr(v.ref ?? v.banco)) err(`${at}: vinculo.ref/banco inválido`);
  if (v.kind !== 'medidor' && v.kind !== 'reg') err(`${at}: vinculo.kind debe ser medidor o reg`);
  if (v.med !== undefined && !isStr(v.med, 1, 40)) err(`${at}: vinculo.med debe tener entre 1 y 40 caracteres`);
  if (typeof v.nominal !== 'number' || !(v.nominal > 0)) err(`${at}: vinculo.nominal debe ser un número positivo`);
  if (v.umbralPct !== undefined && !(typeof v.umbralPct === 'number' && v.umbralPct >= 0 && v.umbralPct <= 100)) err(`${at}: vinculo.umbralPct debe estar entre 0 y 100`);
}

function checkNodo(n, at, dib, general, sitios, err) {
  if (!TIPOS.has(n.tipo)) return err(`${at}: tipo desconocido`);
  if (!isInt(n.x) || !isInt(n.y)) err(`${at}: x e y deben ser enteros`);
  if (![0, 90, 180, 270].includes(n.rot)) err(`${at}: rot debe ser 0, 90, 180 o 270`);
  if (CON_REF.has(n.tipo) && !isStr(n.ref)) err(`${at}: ref requerido`);
  if (CON_NOMBRE.has(n.tipo) && !isStr(n.nombre, 0, 80)) err(`${at}: nombre inválido`);
  if (n.tipo === 'reg') {
    if (('ref' in n) === ('banco' in n)) err(`${at}: reg lleva ref o banco, no ambos`);
    else if (!isStr(n.ref ?? n.banco)) err(`${at}: ref/banco inválido`);
  }
  if ((n.tipo === 'seccionador' || n.tipo === 'fusible') && typeof n.cerrado !== 'boolean') err(`${at}: cerrado debe ser booleano`);
  if (n.tipo === 'barra' && !(isInt(n.largo) && n.largo % 10 === 0 && n.largo >= 40 && n.largo <= 2000)) err(`${at}: largo debe ser múltiplo de 10 entre 40 y 2000`);
  if (n.tipo === 'texto') {
    if (!isStr(n.texto, 1, 200)) err(`${at}: texto debe tener entre 1 y 200 caracteres`);
    if (![12, 16, 24].includes(n.tam)) err(`${at}: tam debe ser 12, 16 o 24`);
  }
  if (n.tipo === 'recuadro') {
    if (!isInt(n.ancho) || n.ancho <= 0 || !isInt(n.alto) || n.alto <= 0) err(`${at}: ancho y alto deben ser enteros positivos`);
    if (n.titulo !== undefined && !isStr(n.titulo, 0, 80)) err(`${at}: titulo inválido`);
  }
  if (n.tipo === 'sitio' && !sitios.has(n.dibujo)) err(`${at}: dibujo no apunta a un dibujo de sitio existente`);
  if (n.tipo === 'fuente') checkVinculo(n.vinculo, at, dib, general, err);
  checkMostrar(n, at, err);
}

// → string[] de errores ([] = válido)
function validateUnifilar(data) {
  const errors = [];
  const err = (m) => { if (errors.length < 50) errors.push(m); };
  if (!isObj(data)) return ['El unifilar debe ser un objeto'];
  if (data.version !== 1) err('version debe ser 1');
  if (data.colores !== undefined && data.colores !== 'portal' && data.colores !== 'ansi') err('colores debe ser portal o ansi');
  if (!Array.isArray(data.dibujos)) { err('dibujos debe ser una lista'); return errors; }
  if (data.dibujos.length > MAX_DIBUJOS) { err(`Máximo ${MAX_DIBUJOS} dibujos`); return errors; }
  const dibs = data.dibujos.filter(isObj);
  if (dibs.length !== data.dibujos.length) { err('Cada dibujo debe ser un objeto'); return errors; }

  const generales = dibs.filter((d) => d.tipo === 'general');
  if (generales.length !== 1) err('Debe haber exactamente un dibujo general');
  else if (generales[0].id !== 'general') err('El dibujo general debe tener id "general"');
  const general = generales.length === 1 && Array.isArray(generales[0].nodos) ? generales[0] : null;
  const sitios = new Set(dibs.filter((d) => d.tipo === 'sitio' && isStr(d.id, 1, 40)).map((d) => d.id));
  const ids = new Set();

  dibs.forEach((d, di) => {
    const dw = `dibujo ${isStr(d.id) ? d.id : di}`;
    if (d.tipo !== 'general' && d.tipo !== 'sitio') err(`${dw}: tipo debe ser general o sitio`);
    if (!isStr(d.id, 1, 40)) err(`${dw}: id inválido`);
    else if (ids.has(d.id)) err(`${dw}: id repetido`);
    else ids.add(d.id);
    if (!isStr(d.nombre, 1, 80)) err(`${dw}: nombre inválido`);
    if (!Array.isArray(d.nodos) || !Array.isArray(d.conexiones)) return err(`${dw}: nodos y conexiones deben ser listas`);
    if (d.nodos.length > MAX_NODOS) return err(`${dw}: máximo ${MAX_NODOS} nodos`);
    if (d.conexiones.length > MAX_CONEXIONES) return err(`${dw}: máximo ${MAX_CONEXIONES} conexiones`);

    const nodos = new Map();
    d.nodos.forEach((n, i) => {
      const at = `${dw}, nodo ${isObj(n) && isStr(n.id) ? n.id : i}`;
      if (!isObj(n)) return err(`${at}: inválido`);
      if (!isStr(n.id, 1, 40)) err(`${at}: id inválido`);
      else if (nodos.has(n.id)) err(`${at}: id repetido`);
      else nodos.set(n.id, n);
      checkNodo(n, at, d, general, sitios, err);
    });

    const cids = new Set();
    d.conexiones.forEach((c, i) => {
      const at = `${dw}, conexión ${isObj(c) && isStr(c.id) ? c.id : i}`;
      if (!isObj(c)) return err(`${at}: inválida`);
      if (!isStr(c.id, 1, 40)) err(`${at}: id inválido`);
      else if (cids.has(c.id)) err(`${at}: id repetido`);
      else cids.add(c.id);
      [['desde', c.desde], ['hasta', c.hasta]].forEach(([lado, e]) => {
        if (!Array.isArray(e) || e.length !== 2) return err(`${at}: ${lado} debe ser [nodo, punto]`);
        const n = nodos.get(e[0]);
        if (!n) return err(`${at}: ${lado} apunta a un nodo inexistente`);
        if (!puntosDe(n).includes(e[1])) err(`${at}: ${lado} apunta a un punto inexistente (${e[1]})`);
      });
      if (Array.isArray(c.desde) && Array.isArray(c.hasta) && c.desde[0] === c.hasta[0]) err(`${at}: une un nodo consigo mismo`);
    });
  });
  return errors;
}

function createUnifilarStore({ file }) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return DEFAULT; throw e; }
  };
  return {
    get() { const data = read(); return { version: versionOf(data), data }; },
    put(base, data) {
      if (base !== versionOf(read())) throw { status: 409, message: 'El unifilar cambió desde que lo abriste' };
      const errors = validateUnifilar(data);
      if (errors.length) throw { status: 400, errors };
      const tmp = `${file}.${process.pid}.tmp`;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(data));
      fs.renameSync(tmp, file);
      return { version: versionOf(data) };
    },
  };
}

module.exports = { DEFAULT, validateUnifilar, versionOf, createUnifilarStore, puntosDe };
