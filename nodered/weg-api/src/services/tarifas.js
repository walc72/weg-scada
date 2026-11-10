'use strict';
/**
 * Tarifas eléctricas: archivo tarifas.json, validación, versión vigente y franja horaria.
 * Costeo de energía y potencia (costear / aplicar) en su propia sección, al final.
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
    // Sin validar: un archivo que no cumple las reglas se conserva tal cual, para que un guardado posterior no lo pise con vacío
    const j = obj(JSON.parse(fs.readFileSync(file, 'utf8')));
    return {
      ...j,
      moneda: typeof j.moneda === 'string' ? j.moneda : 'Gs',
      tarifas: Array.isArray(j.tarifas) ? j.tarifas : [],
      asignacion: obj(j.asignacion),
    };
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
  const tp = obj(o.perdidas).tarifa ?? null;
  if (tp != null && !ids.has(tp)) throw new Error('La tarifa para pérdidas no existe');
  return { moneda, tarifas, asignacion, perdidas: { tarifa: tp } };
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

// ─── Costeo ─────────────────────────────────────────────────────────────────
const { aLitros } = require('./flowConfig');
const HORA = 3600000;
const arr = (a) => (Array.isArray(a) ? a : []);
const r1 = (n) => Math.round(n * 10) / 10;
const r4 = (n) => Math.round(n * 1e4) / 1e4;
const numero = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);
const fechaDMA = (ms) => fechaLocal(ms).split('-').reverse().join('/');
const horasDelMes = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() * 24; };

// El archivo llega de leer() sin validar: se copia descartando lo inutilizable en lugar de fallar
function sanearReserva(p) {
  p = obj(p);
  return [p.reservadaKw, p.precioKw, p.precioExcesoKw].every(esNum) ? { reservadaKw: p.reservadaKw, precioKw: p.precioKw, precioExcesoKw: p.precioExcesoKw } : null;
}
function sanearPotencia(p) {
  p = obj(p);
  if (p.modo === 'unica') { const r = sanearReserva(p); return r && { modo: 'unica', ...r }; }
  if (p.modo === 'diferencial') {
    const punta = sanearReserva(p.punta), fuera = sanearReserva(p.fuera);
    return punta && fuera ? { modo: 'diferencial', punta, fuera } : null;
  }
  return null;
}
function sanearTarifa(t) {
  t = obj(t);
  const versiones = [];
  for (const v of arr(t.versiones).map(obj)) {
    const resto = obj(v.resto);
    if (typeof v.desde !== 'string' || !esNum(resto.precioKwh)) continue; // versión sin precio base: se ignora
    const franjas = arr(v.franjas).map(obj).filter((f) => esNum(f.precioKwh)).map((f) => ({
      nombre: String(f.nombre ?? '').trim() || 'Franja',
      precioKwh: f.precioKwh,
      tramos: arr(f.tramos).map(obj).filter((tr) => Array.isArray(tr.dias)),
    }));
    versiones.push({ desde: v.desde, franjas, resto: { nombre: String(resto.nombre ?? '').trim() || 'Resto', precioKwh: resto.precioKwh }, potencia: sanearPotencia(v.potencia) });
  }
  return { nombre: String(t.nombre ?? ''), versiones };
}

// Acumulador de kWh y costo por franja
const nuevoAcum = () => ({ franjas: new Map(), costo: 0, horas: 0 });
function franjasDe(acum) {
  return [...acum.franjas.values()]
    .sort((a, b) => a.esResto - b.esResto) // el resto al final
    .map((f) => ({ nombre: f.nombre, kwh: r1(f.kwh), costo: Math.round(f.costo) }));
}

/** Costea kWh por hora con la tarifa; las horas sin versión vigente llaman a `sinVersion(ms)` y no se costean. */
function costearEnergia(kwhHora, horaInicio, tarifa, sinVersion, acum = nuevoAcum(), escala = 1) {
  arr(kwhHora).forEach((kwh, h) => {
    if (numero(kwh) == null) return; // hora sin datos: no se interpola
    const ms = horaInicio + h * HORA;
    const v = versionVigente(tarifa, fechaLocal(ms));
    if (!v) return sinVersion(ms);
    const i = franjaDe(v, ms), f = i >= 0 ? v.franjas[i] : v.resto;
    const x = acum.franjas.get(f.nombre) || { nombre: f.nombre, kwh: 0, costo: 0, esResto: i < 0 };
    x.kwh += kwh * escala;
    x.costo += kwh * escala * f.precioKwh;
    acum.franjas.set(f.nombre, x);
    acum.costo += kwh * escala * f.precioKwh;
    acum.horas++;
  });
  return acum;
}

/** Factor para que la energía por hora del medidor sume lo que marca su contador. */
function escalaContador(m) {
  const suma = arr(m.kwhHora).reduce((s, k) => s + (numero(k) ?? 0), 0);
  return m.energySource === 'contador' && suma > 0 && numero(m.energyKwh) != null ? m.energyKwh / suma : 1;
}

const excesoDe = (kw, r) => Math.max(0, kw - r.reservadaKw) * r.precioExcesoKw;

/** Reservada prorrateada hora a hora y exceso por mes calendario (con la versión de la última hora del mes en el período). */
function costearPotencia(meter, horaInicio, tarifa) {
  const n = Math.max(arr(meter.kwhHora).length, arr(meter.kwMaxHora).length);
  const meses = new Map(); // año*12+mes → { primera, ultima, version, max: [punta, fuera] }
  let reservada = 0;
  for (let h = 0; h < n; h++) {
    const ms = horaInicio + h * HORA, d = new Date(ms), clave = d.getFullYear() * 12 + d.getMonth();
    const v = versionVigente(tarifa, fechaLocal(ms));
    const mes = meses.get(clave) || { primera: ms, max: [0, 0] };
    mes.ultima = ms;
    mes.version = v;
    meses.set(clave, mes);
    if (!v) continue;
    const kw = numero(arr(meter.kwMaxHora)[h]);
    if (kw != null) { const lado = franjaDe(v, ms) >= 0 ? 0 : 1; mes.max[lado] = Math.max(mes.max[lado], kw); }
    const p = v.potencia;
    if (p) reservada += (p.modo === 'unica' ? p.reservadaKw * p.precioKw : p.punta.reservadaKw * p.punta.precioKw + p.fuera.reservadaKw * p.fuera.precioKw) / horasDelMes(ms);
  }
  let exceso = 0, mesParcial = false;
  for (const mes of meses.values()) {
    const p = mes.version?.potencia;
    if (!p) continue;
    exceso += p.modo === 'unica' ? excesoDe(Math.max(...mes.max), p) : excesoDe(mes.max[0], p.punta) + excesoDe(mes.max[1], p.fuera);
    const d = new Date(mes.primera);
    if (mes.primera > new Date(d.getFullYear(), d.getMonth(), 1).getTime() || mes.ultima + HORA < new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()) mesParcial = true;
  }
  return { reservada: Math.round(reservada), exceso: Math.round(exceso), mesParcial };
}

/**
 * Costos del período: por bomba (energía por franja) y por sitio (energía del medidor o de sus bombas + potencia).
 * `sitioDe(nombreEquipo)` devuelve el sitio ya recortado. null si no hay tarifas o el summary no trae horaInicio.
 */
function costear(summary, archivo, sitioDe) {
  const a = obj(archivo), s = obj(summary), horaInicio = numero(s.horaInicio);
  if (!arr(a.tarifas).length || horaInicio == null) return null;
  const tarifas = new Map(arr(a.tarifas).map((t) => [obj(t).id, sanearTarifa(t)]));
  const asignacion = new Map(Object.entries(obj(a.asignacion)).map(([k, v]) => [k.trim(), obj(v)]));
  // sin entrada propia, el sitio usa la de "" (Sin sitio) si existe
  const claveDe = (sitio) => (asignacion.has(sitio) ? sitio : asignacion.has('') ? '' : null);
  const tarifaDe = (clave) => (clave == null ? null : tarifas.get(asignacion.get(clave).tarifa) || null);
  const notas = new Set(), avisados = new Set(), sinTarifa = new Set();
  const avisar = (sitio) => (ms) => {
    if (avisados.has(sitio)) return;
    avisados.add(sitio);
    notas.add(`Sin tarifa vigente para ${sitio || 'Sin sitio'} el ${fechaDMA(ms)}`);
  };

  const bombas = {}, bombasPorClave = new Map();
  for (const d of arr(s.drives).map(obj).filter((x) => typeof x.name === 'string')) {
    const sitio = String(sitioDe(d.name) ?? '').trim(), clave = claveDe(sitio), tarifa = tarifaDe(clave);
    let franjas = [], costo = null;
    if (tarifa) {
      const acum = costearEnergia(d.kwhHora, horaInicio, tarifa, avisar(sitio));
      franjas = franjasDe(acum);
      if (acum.horas) costo = Math.round(acum.costo);
      bombasPorClave.set(clave, [...(bombasPorClave.get(clave) || []), { d, sitio }]);
    } else sinTarifa.add(sitio || 'Sin sitio');
    const litros = aLitros(d.volumeM3);
    bombas[d.name] = { sitio, franjas, costo, porLitro: costo != null && litros > 0 ? r4(costo / litros) : null };
  }

  const medidores = new Map(arr(s.meters).map(obj).map((m) => [m.name, m]));
  const sitios = [];
  for (const [clave, asig] of asignacion) {
    const tarifa = tarifaDe(clave);
    if (!tarifa) continue;
    const medidor = typeof asig.medidor === 'string' ? asig.medidor : null;
    const m = medidor != null ? medidores.get(medidor) : null;
    const acum = nuevoAcum();
    let pot = { reservada: 0, exceso: 0, mesParcial: false }, fp = null;
    if (m && Array.isArray(m.kwhHora)) {
      costearEnergia(m.kwhHora, horaInicio, tarifa, avisar(clave), acum, escalaContador(m));
      pot = costearPotencia(m, horaInicio, tarifa);
      fp = numero(m.stats?.pf?.avg);
      // períodos > 31 días: la demanda sale en bloques de 60 min (reports.demandPlan)
      const min = m.demandMax && m.demandMax.minutes;
      if (min && min !== 15) notas.add(`Demanda en bloques de ${min} min (período largo): el exceso puede diferir de la factura, que usa 15 min.`);
    } else {
      // sin medidor: la energía del sitio es la de sus bombas y no hay cargo por potencia
      if (medidor != null) notas.add(`Medidor ${medidor} sin datos`);
      for (const { d, sitio } of bombasPorClave.get(clave) || []) costearEnergia(d.kwhHora, horaInicio, tarifa, avisar(sitio), acum);
    }
    const energia = acum.horas ? Math.round(acum.costo) : null;
    const fpBajo = fp != null && fp < 0.92;
    if (fpBajo) notas.add(`Factor de potencia medio de ${medidor} = ${fp.toFixed(2).replace('.', ',')} (menor a 0,92): ANDE aplica un recargo sobre la energía (pliego 4.5).`);
    sitios.push({
      sitio: clave, tarifa: tarifa.nombre, medidor, franjas: franjasDe(acum), energia,
      reservada: pot.reservada, exceso: pot.exceso,
      total: energia == null && !pot.reservada && !pot.exceso ? null : (energia ?? 0) + pot.reservada + pot.exceso,
      fp, fpBajo, mesParcial: pot.mesParcial,
    });
  }
  const perdidas = costearPerdidas(s, medidores, horaInicio, tarifas.get(obj(a.perdidas).tarifa), notas);
  if (sitios.some((x) => x.mesParcial)) notas.add('Mes parcial: el exceso usa la demanda máxima del tramo informado.');
  if (sinTarifa.size) notas.add(`Sin tarifa asignada: ${[...sinTarifa].join(', ')}`);

  const costosBombas = Object.values(bombas).map((b) => b.costo).filter((c) => c != null);
  return {
    moneda: typeof a.moneda === 'string' ? a.moneda : 'Gs',
    bombas,
    costoBombas: costosBombas.length ? costosBombas.reduce((x, y) => x + y, 0) : null,
    sitios,
    perdidas,
    notas: [...notas],
  };
}

/**
 * Pérdida con el mismo balance que summary.loss (principal − Σ restan), hora a hora y con cada medidor
 * escalado a su contador, así el total coincide con la pérdida del resumen. Se costea solo energía.
 */
function costearPerdidas(s, medidores, horaInicio, tarifa, notas) {
  const l = obj(s.loss);
  if (typeof l.main !== 'string') return null;
  if (!tarifa) { notas.add('Pérdidas sin costear: elegí la "Tarifa para pérdidas" en Configuración → Tarifas.'); return null; }
  const main = medidores.get(l.main);
  if (!main || !Array.isArray(main.kwhHora)) { notas.add(`Pérdidas sin costear: el medidor principal ${l.main} no tiene datos`); return null; }
  const restan = arr(l.subtract).map((n) => medidores.get(n)).filter((m) => m && Array.isArray(m.kwhHora));
  const eMain = escalaContador(main), eRestan = restan.map(escalaContador);
  // hora sin dato del principal: no se costea; un medidor que resta sin dato cuenta 0 (como computeLoss)
  const kwhHora = main.kwhHora.map((k, h) => (numero(k) == null ? null
    : k * eMain - restan.reduce((t, m, i) => t + (numero(m.kwhHora[h]) ?? 0) * eRestan[i], 0)));
  const acum = costearEnergia(kwhHora, horaInicio, tarifa, (ms) => notas.add(`Sin tarifa vigente para pérdidas el ${fechaDMA(ms)}`));
  if (!acum.horas) return null;
  const franjas = franjasDe(acum);
  return { tarifa: tarifa.nombre, kwh: r1(franjas.reduce((t, f) => t + f.kwh, 0)), costo: Math.round(acum.costo), franjas };
}

/** (nombreEquipo) => sitio recortado, según devices[] y meters[] de la config ('' si falta). */
function sitioDeCfg(cfg) {
  const m = new Map();
  for (const x of [...arr(obj(cfg).devices), ...arr(obj(cfg).meters)].map(obj))
    if (typeof x.name === 'string') m.set(x.name, typeof x.site === 'string' ? x.site.trim() : '');
  return (nombre) => m.get(nombre) ?? '';
}

/** Agrega summary.costos (si hay tarifas) y quita los arreglos por hora, que solo sirven para costear. */
function aplicar(summary, archivo = leer(), cfg = require('./config').get()) {
  // Un error de costeo nunca bloquea el reporte: sale sin costos
  try {
    const costos = costear(summary, archivo, sitioDeCfg(cfg));
    if (costos) summary.costos = costos;
  } catch (e) {
    console.error('[REPORT] tarifas:', e.message);
  }
  delete summary.horaInicio;
  for (const x of [...arr(summary.drives), ...arr(summary.meters)]) {
    if (!x || typeof x !== 'object') continue;
    delete x.kwhHora;
    delete x.kwMaxHora;
  }
  return summary;
}

module.exports = { TARIFAS_PATH, VACIO, leer, validar, guardar, versionVigente, franjaDe, fechaLocal, costear, aplicar, sitioDeCfg };
