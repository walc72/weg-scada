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

function verify(text, installId, { checkInstall = true, publicKey = PUBLIC_KEY } = {}) {
  const fail = (motivo) => ({ ok: false, motivo, cliente: null, modulos: BASE.modulos, limites: BASE.limites });
  const t = String(text == null ? '' : text).trim();
  if (!t) return fail('sin-licencia');
  const d = decode(t);
  if (!d || !d.payload || typeof d.payload !== 'object') return fail('formato');
  if (d.payload.v !== 1) return fail('version');
  let good = false;
  if (publicKey) { try { good = crypto.verify(null, Buffer.from(d.json, 'utf8'), publicKey, d.sig); } catch { good = false; } }
  if (!good) return fail('firma');
  const p = d.payload;
  const norm = (x) => String(x == null ? '' : x).trim().toLowerCase();
  if (checkInstall && (!norm(installId) || norm(p.installId) !== norm(installId))) return fail('otra-instalacion');
  const lim = p.limites || {};
  const n = (k) => (Number.isFinite(lim[k]) && lim[k] > 0 ? Math.floor(lim[k]) : 0);
  return {
    ok: true,
    motivo: null,
    cliente: p.cliente || null,
    modulos: (Array.isArray(p.modulos) ? p.modulos : []).filter((m) => MODULES.includes(m)),
    limites: { A: n('A'), B: n('B'), C: n('C') },
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

function load(dir, opts) {
  const installId = readInstallId(dir);
  let text = '';
  try { text = fs.readFileSync(path.join(dir, 'license.key'), 'utf8'); } catch { /* sin archivo */ }
  return { installId, ...verify(text, installId, opts) };
}

const tier = (kind, item) => (kind === 'flowmeter' || kind === 'comm' ? 'A' : kind === 'meter' && item && item.waveform ? 'C' : 'B');

const on = (x) => x && x.enabled !== false;
const list = (config, k) => (config && Array.isArray(config[k]) ? config[k] : []).filter(on);
const hasModule = (lic, name) => !!(lic && Array.isArray(lic.modulos) && lic.modulos.includes(name));

// lic (opcional): sin módulo medidores los medidores no se leen, no cuentan.
function usage(config, lic = null) {
  const u = { A: 0, B: 0, C: 0 };
  for (const d of list(config, 'devices')) u[tier('device', d)]++;
  if (!lic || hasModule(lic, 'medidores')) for (const m of list(config, 'meters')) u[tier('meter', m)]++;
  if (!lic || hasModule(lic, 'caudales')) for (const f of list(config, 'flowmeters')) u[tier('flowmeter', f)]++;
  if (!lic || hasModule(lic, 'comunicaciones')) for (const c of list(config, 'comms')) u[tier('comm', c)]++;
  return u;
}

// Primeros N de cada nivel: devices, meters (módulo medidores), flowmeters (caudales), comms (comunicaciones).
function allowed(config, lic) {
  const left = { A: 0, B: 0, C: 0, ...((lic && lic.limites) || {}) };
  const out = { devices: new Set(), meters: new Set(), flowmeters: new Set(), comms: new Set() };
  const take = (items, kind, set) => {
    for (const it of items) {
      const t = tier(kind, it);
      if (left[t] > 0) { left[t]--; set.add(it.name); }
    }
  };
  take(list(config, 'devices'), 'device', out.devices);
  if (hasModule(lic, 'medidores')) take(list(config, 'meters'), 'meter', out.meters);
  if (hasModule(lic, 'caudales')) take(list(config, 'flowmeters'), 'flowmeter', out.flowmeters);
  if (hasModule(lic, 'comunicaciones')) take(list(config, 'comms'), 'comm', out.comms);
  return out;
}

// prev: config anterior; solo se rechaza lo que aumenta el exceso (tras bajar la licencia se puede editar lo demás).
function check(config, lic, prev = null) {
  const errs = [];
  const u = usage(config, lic);
  const pu = prev ? usage(prev, lic) : null;
  const lim = (lic && lic.limites) || {};
  for (const t of ['A', 'B', 'C']) {
    const max = lim[t] || 0;
    if (u[t] > max && (!pu || u[t] > pu[t])) errs.push(`Límite de la licencia: nivel ${t} ${u[t]}/${max}`);
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
  return errs;
}

module.exports = { MODULES, BASE, PUBLIC_KEY, encode, decode, sign, verify, readInstallId, ensureInstallId, load, tier, usage, allowed, hasModule, check };
