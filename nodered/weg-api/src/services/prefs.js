'use strict';

// Preferencias por usuario (layout del Dashboard, Mis gráficos). prefs.json junto
// a config.json: { usuarios: { <nombre en minúsculas>: { dashboard, misGraficos } },
// defecto: { dashboard } }. Validación solo estructural; el saneo semántico
// (tipos de gadget conocidos, licencia) lo hace el frontend.

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const PREFS_PATH = path.join(path.dirname(CONFIG_PATH), 'prefs.json');
const CLAVES = ['dashboard', 'misGraficos'];
const MAX_BYTES = 65536;
const ANCHOS = [4, 6, 8, 12];

const httpError = (msg) => Object.assign(new Error(msg), { status: 400 });
const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const key = (u) => String(u).toLowerCase();

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(PREFS_PATH, 'utf8'));
    if (!esObjeto(j)) return { usuarios: {}, defecto: {} };
    return { usuarios: esObjeto(j.usuarios) ? j.usuarios : {}, defecto: esObjeto(j.defecto) ? j.defecto : {} };
  } catch { return { usuarios: {}, defecto: {} }; }
}
function write(obj) {
  const tmp = PREFS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, PREFS_PATH);
}

function validarDashboard(v) {
  if (!esObjeto(v) || v.v !== 1) throw httpError('Dashboard: versión no soportada');
  if (!Array.isArray(v.items) || v.items.length > 30) throw httpError('Dashboard: máximo 30 gadgets');
  for (const it of v.items) {
    if (!esObjeto(it)) throw httpError('Dashboard: gadget inválido');
    for (const c of ['id', 'tipo']) {
      if (typeof it[c] !== 'string' || !it[c] || it[c].length > 40) throw httpError(`Dashboard: ${c} inválido`);
    }
    if (!ANCHOS.includes(it.ancho)) throw httpError('Dashboard: ancho inválido (4, 6, 8 o 12)');
    if (it.opciones !== undefined && !esObjeto(it.opciones)) throw httpError('Dashboard: opciones inválidas');
  }
}

function validarMisGraficos(v) {
  if (!Array.isArray(v)) throw httpError('Mis gráficos: tiene que ser una lista');
  if (v.length > 50) throw httpError('Mis gráficos: máximo 50 gráficos');
  for (const g of v) {
    if (!esObjeto(g)) throw httpError('Mis gráficos: gráfico inválido');
    if (g.trazas !== undefined && (!Array.isArray(g.trazas) || g.trazas.length > 12)) throw httpError('Mis gráficos: máximo 12 trazas por gráfico');
    for (const [c, val] of Object.entries(g)) {
      if (typeof val === 'string' && val.length > 200) throw httpError(`Mis gráficos: ${c} demasiado largo`);
    }
  }
}

const VALIDAR = { dashboard: validarDashboard, misGraficos: validarMisGraficos };

function chequear(clave, valor) {
  if (!CLAVES.includes(clave)) throw httpError('Clave de preferencia inválida');
  if (Buffer.byteLength(JSON.stringify(valor) || '') > MAX_BYTES) throw httpError('Preferencia demasiado grande (máx. 64 KB)');
  VALIDAR[clave](valor);
}

function getDe(user) {
  const s = read();
  const u = s.usuarios[key(user)] || {};
  return { dashboard: u.dashboard ?? null, misGraficos: u.misGraficos ?? null, defecto: { dashboard: s.defecto.dashboard ?? null } };
}

function set(user, clave, valor) {
  chequear(clave, valor);
  const s = read();
  s.usuarios[key(user)] = { ...s.usuarios[key(user)], [clave]: valor };
  write(s);
}

function borrar(user, clave) {
  if (!CLAVES.includes(clave)) throw httpError('Clave de preferencia inválida');
  const s = read();
  const u = s.usuarios[key(user)];
  if (!u) return;
  delete u[clave];
  if (!Object.keys(u).length) delete s.usuarios[key(user)];
  write(s);
}

function setDefecto(layout) {
  chequear('dashboard', layout);
  const s = read();
  s.defecto.dashboard = layout;
  write(s);
}

function borrarDefecto() {
  const s = read();
  delete s.defecto.dashboard;
  write(s);
}

function renombrar(antes, despues) {
  const a = key(antes), d = key(despues);
  const s = read();
  if (a === d || !s.usuarios[a]) return;
  s.usuarios[d] = s.usuarios[a];
  delete s.usuarios[a];
  write(s);
}

function borrarUsuario(user) {
  const s = read();
  if (!s.usuarios[key(user)]) return;
  delete s.usuarios[key(user)];
  write(s);
}

module.exports = { getDe, set, borrar, setDefecto, borrarDefecto, renombrar, borrarUsuario, validarDashboard, validarMisGraficos, PREFS_PATH };
