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
const CON_NOMBRE = new Set(['fuente', 'trafo', 'seccionador', 'fusible', 'carga', 'tc', 'tp', 'entrada', 'salida']);
const TIPOS = new Set([...CON_REF, ...CON_NOMBRE, 'reg', 'barra', 'texto', 'recuadro', 'sitio']);
// Puntos de medición: secundario de TC/TP (s) y entrada del medidor (m); solo se unen entre sí
const MEDICION = new Set(['s', 'm']);
const LADOS = ['arriba', 'abajo', 'izquierda', 'derecha'];
const SIN_ESCALA = new Set(['barra', 'texto', 'recuadro', 'sitio']);  // tienen su propio tamaño (o ancho fijo)
const LETRAS = ['chico', 'grande', 'muy-grande'];  // tamaño de letra de nombre/mediciones (sin campo = normal)
const TAMS_TEXTO = [12, 16, 20, 24, 32, 48];
// Punto de datos (d): enlace de comunicación entre un equipo de comunicación y los equipos; solo d↔d
const clase = (p) => (p === 'd' ? 'datos' : MEDICION.has(p) ? 'medicion' : 'potencia');

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStr = (v, min = 1, max = 200) => typeof v === 'string' && v.length >= min && v.length <= max;
const isInt = (v) => Number.isInteger(v);

// Puntos de conexión de un nodo (spec §2.2)
function puntosDe(n) {
  switch (n.tipo) {
    case 'reco': case 'reg': return ['a', 'b', 'd'];
    case 'trafo': case 'seccionador': case 'fusible': return ['a', 'b'];
    case 'medidor': return ['a', 'b', 'm', 'd'];
    case 'tc': return ['a', 'b', 's'];
    case 'tp': return ['a', 's'];
    case 'bomba': return ['a', 'd'];
    case 'caudalimetro': case 'comm': return ['d'];
    case 'fuente': case 'carga': case 'entrada': case 'salida': return ['a'];
    case 'sitio': return ['a', 'b']; // bloque: entrada arriba, salida abajo
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
  if ((n.tipo === 'tc' || n.tipo === 'tp') && n.relacion !== undefined && !isStr(n.relacion, 0, 40)) err(`${at}: relacion debe tener hasta 40 caracteres`);
  if (n.tipo === 'barra' && !(isInt(n.largo) && n.largo % 10 === 0 && n.largo >= 40 && n.largo <= 2000)) err(`${at}: largo debe ser múltiplo de 10 entre 40 y 2000`);
  if (n.tipo === 'texto') {
    if (!isStr(n.texto, 1, 200)) err(`${at}: texto debe tener entre 1 y 200 caracteres`);
    if (!TAMS_TEXTO.includes(n.tam)) err(`${at}: tam debe ser ${TAMS_TEXTO.join(', ')}`);
  }
  if (n.tipo === 'recuadro') {
    if (!isInt(n.ancho) || n.ancho <= 0 || !isInt(n.alto) || n.alto <= 0) err(`${at}: ancho y alto deben ser enteros positivos`);
    if (n.titulo !== undefined && !isStr(n.titulo, 0, 80)) err(`${at}: titulo inválido`);
  }
  if (n.tipo === 'sitio' && !sitios.has(n.dibujo)) err(`${at}: dibujo no apunta a un dibujo de sitio existente`);
  if (n.tipo === 'fuente') checkVinculo(n.vinculo, at, dib, general, err);
  checkMostrar(n, at, err);
  // lados de los bornes (punto → lado, relativo al símbolo sin girar); la barra no tiene
  if (n.lados !== undefined) {
    const pts = n.tipo === 'barra' ? [] : puntosDe(n);
    if (!isObj(n.lados) || Object.entries(n.lados).some(([p, l]) => !pts.includes(p) || !LADOS.includes(l))) err(`${at}: lados inválido (punto del símbolo → arriba, abajo, izquierda o derecha)`);
  }
  // tamaño del símbolo: 0,5 a 3 en pasos de 0,25 (1 = 48 px)
  if (n.escala !== undefined && (SIN_ESCALA.has(n.tipo) || typeof n.escala !== 'number' || n.escala < 0.5 || n.escala > 3 || !Number.isInteger(n.escala * 4))) {
    err(`${at}: escala debe ser de 0,5 a 3 en pasos de 0,25 (solo en símbolos)`);
  }
  // tamaño de letra: no en la barra (sin texto) ni en el texto suelto (usa tam)
  if (n.letra !== undefined && (n.tipo === 'barra' || n.tipo === 'texto' || !LETRAS.includes(n.letra))) {
    err(`${at}: letra debe ser chico, grande o muy-grande (no en barra ni texto)`);
  }
  // posición del texto: un lado o un desplazamiento libre {dx, dy} en px
  if (n.posTexto !== undefined) {
    const p = n.posTexto, libre = isObj(p) && [p.dx, p.dy].every((v) => isInt(v) && Math.abs(v) <= 1000);
    if (!LADOS.includes(p) && !libre) err(`${at}: posTexto debe ser arriba, abajo, izquierda, derecha o {dx, dy} enteros`);
  }
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
    // puertos del sitio: Entrada y Salida solo dentro de un dibujo de sitio, una de cada una
    for (const tipo of ['entrada', 'salida']) {
      const k = d.nodos.filter((n) => isObj(n) && n.tipo === tipo).length;
      if (k && d.tipo !== 'sitio') err(`${dw}: la ${tipo} del sitio solo va en un dibujo de sitio`);
      else if (k > 1) err(`${dw}: solo puede haber una ${tipo} del sitio`);
    }

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
      if (Array.isArray(c.desde) && Array.isArray(c.hasta)) {
        const a = clase(c.desde[1]), b = clase(c.hasta[1]);
        if ((a === 'datos') !== (b === 'datos')) err(`${at}: un enlace de datos va de un punto de datos (d) a otro`);
        else if (a !== b || (a === 'medicion' && c.desde[1] === c.hasta[1])) err(`${at}: una conexión de medición va del secundario de un TC/TP (s) a un medidor (m)`);
      }
    });
  });
  return errors;
}

// Historial: cada guardado deja <ms>-<versión>.json con quién y cuándo; se conservan las últimas `max`
const ID_HISTORIAL = /^\d{13}-[0-9a-f]{16}$/;

function createUnifilarStore({ file, historialDir = path.join(path.dirname(file), 'unifilar-historial'), max = 30 }) {
  const ids = () => {
    try { return fs.readdirSync(historialDir).map((f) => f.replace(/\.json$/, '')).filter((id) => ID_HISTORIAL.test(id)).sort().reverse(); } catch { return []; }
  };
  // Si falla el historial no se pierde el guardado: se registra y sigue
  const anotar = (data, version, usuario) => {
    try {
      fs.mkdirSync(historialDir, { recursive: true });
      const fecha = new Date();
      const elementos = data.dibujos.reduce((t, d) => t + d.nodos.length, 0);
      fs.writeFileSync(path.join(historialDir, `${fecha.getTime()}-${version}.json`), JSON.stringify({ fecha: fecha.toISOString(), usuario, version, elementos, data }));
      for (const id of ids().slice(max)) fs.unlinkSync(path.join(historialDir, `${id}.json`));
    } catch (e) { console.error('[unifilar] historial:', e.message); }
  };
  const leer = (id) => {
    if (typeof id !== 'string' || !ID_HISTORIAL.test(id)) throw { status: 400, message: 'Versión inválida' };
    try { return JSON.parse(fs.readFileSync(path.join(historialDir, `${id}.json`), 'utf8')); } catch (e) {
      if (e.code === 'ENOENT') throw { status: 404, message: 'Esa versión ya no está en el historial' };
      throw e;
    }
  };
  // Archivo dañado (JSON roto o sin la estructura mínima): se muestra el DEFAULT con la versión
  // del texto crudo, así un admin puede sobrescribirlo desde la UI. Con estructura válida pero
  // reglas incumplidas (p. ej. validación más estricta en una versión nueva) se sirve tal cual,
  // con aviso, para corregirlo en el editor sin perder el dibujo.
  const read = () => {
    let raw;
    try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code === 'ENOENT') return { data: DEFAULT, version: versionOf(DEFAULT) }; throw e; }
    try {
      const data = JSON.parse(raw);
      const estructura = isObj(data) && Array.isArray(data.dibujos)
        && data.dibujos.every((d) => isObj(d) && Array.isArray(d.nodos) && Array.isArray(d.conexiones))
        && data.dibujos.some((d) => d.tipo === 'general');
      if (!estructura) throw new Error('forma inválida');
      const errores = validateUnifilar(data);
      if (errores.length) {
        console.error('[unifilar] archivo con errores:', errores.slice(0, 5).join('; '));
        return { data, version: versionOf(data), warning: `El unifilar guardado tiene errores; corregilos en el editor: ${errores.slice(0, 3).join('; ')}` };
      }
      return { data, version: versionOf(data) };
    } catch (e) {
      console.error('[unifilar] archivo dañado:', e.message);
      return {
        data: DEFAULT, version: crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16),
        warning: 'El unifilar guardado está dañado; se muestra vacío',
      };
    }
  };
  return {
    get() { return read(); },
    historial() {
      return ids().map((id) => { try { const { fecha, usuario, version, elementos } = leer(id); return { id, fecha, usuario, version, elementos }; } catch { return null; } }).filter(Boolean);
    },
    versionGuardada(id) {
      const { fecha, usuario, version, data } = leer(id);
      return { fecha, usuario, version, data };
    },
    put(base, data, usuario = '') {
      if (base !== read().version) throw { status: 409, message: 'El unifilar cambió desde que lo abriste' };
      const errors = validateUnifilar(data);
      if (errors.length) throw { status: 400, errors };
      const tmp = `${file}.${process.pid}.tmp`;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      try {
        fs.writeFileSync(tmp, JSON.stringify(data));
        fs.renameSync(tmp, file);
      } catch (e) {
        try { fs.unlinkSync(tmp); } catch { /* no existía */ }
        throw e;
      }
      const version = versionOf(data);
      anotar(data, version, usuario);
      return { version };
    },
  };
}

module.exports = { DEFAULT, validateUnifilar, versionOf, createUnifilarStore, puntosDe };
