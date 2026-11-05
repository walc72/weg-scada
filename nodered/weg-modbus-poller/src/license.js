'use strict';

// Licencias firmadas con Ed25519. Texto: base64url(JSON) + "." + base64url(firma del JSON).
// Una licencia inválida o ausente cae en BASE. El mismo archivo se copia a otros paquetes.

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MODULES = ['medidores', 'caudales', 'unifilar', 'generadores', 'comunicaciones', 'replica', 'backup'];
const BASE = { modulos: [], limites: { A: 2, B: 2, C: 2 } };
// Clave pública de producción (la privada vive solo en la PC del integrador).
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEATdlsqvekSVWEByvxgisk/cnuVY6ReY9job3J2wW8T70=
-----END PUBLIC KEY-----
`;
// Clave del servidor de licencias (license.wleenk.com, archivo weg-private.pem del VPS).
// Distinta de la del integrador: si el VPS se compromete se rota solo esta, con una versión nueva.
const SERVER_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEASYp6Jfw87XQl5SezfdvxgtOJrHQPsTX7wIphGZBT3Rw=
-----END PUBLIC KEY-----
`;
const PUBLIC_KEYS = [PUBLIC_KEY, SERVER_PUBLIC_KEY];

const encode = (payload, sig) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url') + '.' + Buffer.from(sig).toString('base64url');

function decode(text) {
  const m = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(text).trim());
  if (!m) return null;
  try {
    const json = Buffer.from(m[1], 'base64url').toString('utf8');
    return { payload: JSON.parse(json), json, sig: Buffer.from(m[2], 'base64url') };
  } catch { return null; }
}

function sign(payload, privateKey) {
  const json = JSON.stringify(payload);
  return encode(payload, crypto.sign(null, Buffer.from(json, 'utf8'), privateKey));
}

// Vencimientos opcionales (ISO, firmados): `vence` es de toda la licencia (vencida → BASE) y
// `vencen` {modulo: ISO} de módulos de prueba (vencido → se quita). Sin fecha = permanente.
// now: hora de confianza (ver trustedNow), nunca solo el reloj del sistema.
// publicKey: una clave o una lista (por defecto la del integrador y la del servidor de licencias).
function verify(text, installId, { checkInstall = true, publicKey = PUBLIC_KEYS, now = Date.now() } = {}) {
  const fail = (motivo, vence = null) => ({ ok: false, motivo, cliente: null, modulos: BASE.modulos, limites: BASE.limites, vence, vencen: {}, vencidos: [], equipos: null });
  const t = String(text == null ? '' : text).trim();
  if (!t) return fail('sin-licencia');
  const d = decode(t);
  if (!d || !d.payload || typeof d.payload !== 'object') return fail('formato');
  if (d.payload.v !== 1) return fail('version');
  let good = false;
  for (const k of [].concat(publicKey || [])) {
    try { if (crypto.verify(null, Buffer.from(d.json, 'utf8'), k, d.sig)) { good = true; break; } } catch { /* otra clave */ }
  }
  if (!good) return fail('firma');
  const p = d.payload;
  const norm = (x) => String(x == null ? '' : x).trim().toLowerCase();
  if (checkInstall && (!norm(installId) || norm(p.installId) !== norm(installId))) return fail('otra-instalacion');
  const fecha = (x) => { const t = Date.parse(x); return Number.isFinite(t) ? t : -Infinity; }; // fecha ilegible = vencida
  if (p.vence != null && now > fecha(p.vence)) return fail('vencida', p.vence);
  const vencen = {};
  const vencidos = [];
  const mods = (Array.isArray(p.modulos) ? p.modulos : []).filter((m) => MODULES.includes(m)).filter((m) => {
    const v = p.vencen && p.vencen[m];
    if (v == null) return true;
    if (now > fecha(v)) { vencidos.push(m); return false; }
    vencen[m] = v;
    return true;
  });
  const lim = p.limites || {};
  const n = (k) => (Number.isFinite(lim[k]) && lim[k] > 0 ? Math.floor(lim[k]) : 0);
  // equipos (opcional): cupo por tipo de equipo; si viene, reemplaza a los niveles A/B/C.
  let equipos = null;
  if (p.equipos && typeof p.equipos === 'object') {
    equipos = {};
    for (const k of TIPOS) equipos[k] = Number.isFinite(p.equipos[k]) && p.equipos[k] > 0 ? Math.floor(p.equipos[k]) : 0;
  }
  return {
    ok: true,
    motivo: null,
    cliente: p.cliente || null,
    modulos: mods,
    limites: { A: n('A'), B: n('B'), C: n('C') },
    vence: p.vence == null ? null : p.vence,
    vencen,
    vencidos,
    equipos,
  };
}

function readInstallId(dir) {
  try { return fs.readFileSync(path.join(dir, 'install-id'), 'utf8').trim() || null; } catch { return null; }
}

function ensureInstallId(dir) {
  const cur = readInstallId(dir);
  if (cur) return cur;
  const id = crypto.randomUUID();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'install-id'), id + '\n');
  return id;
}

// Hora de confianza: la mayor entre el reloj, la última guardada en «reloj» y la modificación
// de los archivos de dir. Atrasar el reloj no hace retroceder el tiempo de la licencia.
// ponytail: root puede borrar «reloj» y tocar fechas de archivos; la barrera real es no darle root al cliente.
const RELOJ = 'reloj';
function trustedNow(dir, now = Date.now()) {
  let t = now;
  try {
    for (const f of fs.readdirSync(dir)) {
      try { const st = fs.statSync(path.join(dir, f)); if (st.isFile()) t = Math.max(t, st.mtimeMs); } catch { /* borrado entre medio */ }
    }
  } catch { /* sin dir */ }
  try { const v = Number(fs.readFileSync(path.join(dir, RELOJ), 'utf8')); if (Number.isFinite(v)) t = Math.max(t, v); } catch { /* sin archivo */ }
  return t;
}

// Guarda t si es mayor que lo guardado (t: hora del sistema o de internet).
function markNow(dir, t) {
  const file = path.join(dir, RELOJ);
  let cur = -Infinity;
  try { cur = Number(fs.readFileSync(file, 'utf8')); } catch { /* primera vez */ }
  if (!Number.isFinite(t) || !(t > cur)) return;
  fs.writeFileSync(file + '.tmp', String(Math.round(t)) + '\n');
  fs.renameSync(file + '.tmp', file);
}

function load(dir, opts = {}) {
  const installId = readInstallId(dir);
  let text = '';
  try { text = fs.readFileSync(path.join(dir, 'license.key'), 'utf8'); } catch { /* sin archivo */ }
  return { installId, ...verify(text, installId, { now: trustedNow(dir), ...opts }) };
}

// Tipos de equipo para el cupo por tipo (kind interno → nombre en la licencia).
const TIPO = { device: 'variadores', meter: 'medidores', flowmeter: 'caudalimetros', reco: 'reconectadores', reg: 'reguladores', gen: 'generadores', comm: 'comunicaciones' };
const TIPOS = Object.values(TIPO);

const tier = (kind, item) => (kind === 'flowmeter' || kind === 'comm' ? 'A' : kind === 'gen' || (kind === 'meter' && item && item.waveform) ? 'C' : 'B');

const on = (x) => x && x.enabled !== false;
const list = (config, k) => (config && Array.isArray(config[k]) ? config[k] : []).filter(on);
const hasModule = (lic, name) => !!(lic && Array.isArray(lic.modulos) && lic.modulos.includes(name));
// Cupo que aplica: por tipo si la licencia trae equipos, si no por nivel.
const porTipo = (lic) => !!(lic && lic.equipos);
const bucket = (lic, kind, item) => (porTipo(lic) ? TIPO[kind] : tier(kind, item));
const cupos = (lic) => (porTipo(lic) ? lic.equipos : (lic && lic.limites) || {});

// Recorre los equipos que cuentan (habilitados y con su módulo).
function each(config, lic, fn) {
  for (const d of list(config, 'devices')) fn('device', d, 'devices');
  if (!lic || hasModule(lic, 'medidores')) for (const m of list(config, 'meters')) fn('meter', m, 'meters');
  if (!lic || hasModule(lic, 'unifilar')) { for (const x of list(config, 'reconectadores')) fn('reco', x, 'reconectadores'); for (const x of list(config, 'reguladores')) fn('reg', x, 'reguladores'); }
  if (!lic || hasModule(lic, 'generadores')) for (const x of list(config, 'generadores')) fn('gen', x, 'generadores');
  if (!lic || hasModule(lic, 'caudales')) for (const f of list(config, 'flowmeters')) fn('flowmeter', f, 'flowmeters');
  if (!lic || hasModule(lic, 'comunicaciones')) for (const c of list(config, 'comms')) fn('comm', c, 'comms');
}

// lic (opcional): sin módulo medidores los medidores no se leen, no cuentan.
function usage(config, lic = null) {
  const u = { A: 0, B: 0, C: 0 };
  each(config, lic, (kind, it) => { u[tier(kind, it)]++; });
  return u;
}

// Uso por tipo de equipo (mismas reglas que usage).
function usageTipos(config, lic = null) {
  const u = Object.fromEntries(TIPOS.map((k) => [k, 0]));
  each(config, lic, (kind) => { u[TIPO[kind]]++; });
  return u;
}

// Primeros N de cada nivel: devices, meters (módulo medidores), flowmeters (caudales), comms (comunicaciones).
// Cupo por tipo si la licencia trae equipos; si no, por nivel A/B/C.
function allowed(config, lic) {
  const left = { A: 0, B: 0, C: 0, ...cupos(lic) };
  const out = { devices: new Set(), meters: new Set(), flowmeters: new Set(), comms: new Set(), reconectadores: new Set(), reguladores: new Set(), generadores: new Set() };
  each(config, lic || BASE, (kind, it, key) => {
    const b = bucket(lic, kind, it);
    if (left[b] > 0) { left[b]--; out[key].add(it.name); }
  });
  return out;
}

// prev: config anterior; solo se rechaza lo que aumenta el exceso (tras bajar la licencia se puede editar lo demás).
function check(config, lic, prev = null) {
  const errs = [];
  const tipos = porTipo(lic);
  const count = tipos ? usageTipos : usage;
  const u = count(config, lic);
  const pu = prev ? count(prev, lic) : null;
  const lim = cupos(lic);
  for (const t of tipos ? TIPOS : ['A', 'B', 'C']) {
    const max = lim[t] || 0;
    if (u[t] > max && (!pu || u[t] > pu[t])) errs.push(`Límite de la licencia: ${tipos ? t : 'nivel ' + t} ${u[t]}/${max}`);
  }
  const nm = list(config, 'meters').length;
  if (nm > 0 && !hasModule(lic, 'medidores') && (!prev || nm > list(prev, 'meters').length)) {
    errs.push('La licencia no incluye el módulo medidores');
  }
  const nf = list(config, 'flowmeters').length;
  if (nf > 0 && !hasModule(lic, 'caudales') && (!prev || nf > list(prev, 'flowmeters').length)) {
    errs.push('La licencia no incluye el módulo caudales');
  }
  const nc = list(config, 'comms').length;
  if (nc > 0 && !hasModule(lic, 'comunicaciones') && (!prev || nc > list(prev, 'comms').length)) {
    errs.push('La licencia no incluye el módulo comunicaciones');
  }
  const nu = list(config, 'reconectadores').length + list(config, 'reguladores').length;
  if (nu > 0 && !hasModule(lic, 'unifilar') && (!prev || nu > list(prev, 'reconectadores').length + list(prev, 'reguladores').length)) {
    errs.push('La licencia no incluye el módulo unifilar');
  }
  const ng = list(config, 'generadores').length;
  if (ng > 0 && !hasModule(lic, 'generadores') && (!prev || ng > list(prev, 'generadores').length)) {
    errs.push('La licencia no incluye el módulo generadores');
  }
  return errs;
}

module.exports = { MODULES, BASE, PUBLIC_KEY, SERVER_PUBLIC_KEY, PUBLIC_KEYS, encode, decode, sign, verify, readInstallId, ensureInstallId, trustedNow, markNow, load, tier, usage, usageTipos, allowed, hasModule, check, TIPOS };
