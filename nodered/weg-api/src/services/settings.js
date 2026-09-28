'use strict';

// Ajustes administrables desde la UI (usuarios y SMTP). Se guardan en un archivo
// SEPARADO de config.json (que se sirve entero por GET /api/config), para no
// exponer secretos. Las contraseñas de usuario se guardan como hash scrypt; la
// password del SMTP se guarda pero NUNCA se devuelve por la API. Las variables
// de entorno siguen como fallback (bootstrap): settings.json las sobreescribe.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const SETTINGS_PATH = path.join(path.dirname(CONFIG_PATH), 'settings.json');
// superadmin: todo + Marca, Conexión y Réplicas. Es una sola cuenta: no se crea
// desde la UI, no se elimina y solo la modifica el propio superadmin.
const ROLES = ['superadmin', 'admin', 'operador'];
const EDITABLE_ROLES = ['admin', 'operador'];   // los que se asignan desde la UI

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
    return (j && typeof j === 'object' && !Array.isArray(j)) ? j : {};
  } catch { return {}; }
}
function write(obj) {
  const tmp = SETTINGS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, SETTINGS_PATH);
}

function hashPassword(pass) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pass), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// ─── Usuarios ────────────────────────────────────────────────────────
// Lista de usuarios { user, role, hash } en settings.json. Formato viejo: una
// entrada por rol, a veces sin `user` o sin `hash` (se completaban con el .env).
// El .env (AUTH_*, OPERADOR_*, SUPERADMIN_*) es el arranque: aporta el usuario
// de un rol solo mientras settings no tenga ninguno de ese rol.
function envUser(role) {
  const e = process.env;
  if (role === 'superadmin') return { user: e.SUPERADMIN_USER || 'superadmin', role, plain: e.SUPERADMIN_PASSWORD || '', hash: e.SUPERADMIN_PASSWORD_HASH || '' };
  if (role === 'admin') return { user: e.AUTH_USER || 'admin', role, plain: e.AUTH_PASSWORD || '', hash: e.AUTH_PASSWORD_HASH || '' };
  return { user: e.OPERADOR_USER || 'operador', role, plain: e.OPERADOR_PASSWORD || '', hash: e.OPERADOR_PASSWORD_HASH || '' };
}

const MAX_USERS = 50;
const USER_RE = /^[\p{L}\p{N}._@-]{2,40}$/u;
const sameName = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const httpError = (status, msg) => Object.assign(new Error(msg), { status });

// Usuarios efectivos, con secretos (para el login y para editar). Los que no
// tienen ninguna credencial se descartan, salvo el superadmin (siempre existe,
// aunque sea sin contraseña hasta que se configure).
function usersFrom(s) {
  const out = [];
  const seen = new Set();
  const add = (u) => {
    const key = u.user.toLowerCase();
    if (seen.has(key)) return;
    if (u.role !== 'superadmin' && !u.plain && !u.hash) return;
    if (u.role === 'superadmin' && out.some(x => x.role === 'superadmin')) return;
    seen.add(key); out.push(u);
  };
  const saved = Array.isArray(s.users) ? s.users : [];
  for (const u of saved) {
    if (!u || !ROLES.includes(u.role)) continue;
    const env = envUser(u.role);
    const user = (typeof u.user === 'string' && u.user.trim()) || env.user;
    // Entrada sin hash: vale la contraseña del .env de su rol
    add({ user, role: u.role, plain: u.hash ? '' : env.plain, hash: u.hash || env.hash });
  }
  // .env como arranque. Una vez guardada la lista en formato nuevo (usersV2),
  // solo el superadmin se sigue tomando del .env (si no hay uno guardado).
  for (const r of ROLES) {
    if (s.usersV2 && r !== 'superadmin') continue;
    if (!saved.some(u => u && u.role === r)) add(envUser(r));
  }
  return out;
}

function getUsersFull() {
  return usersFrom(read()).filter(u => u.plain || u.hash);
}

// Lista pública (sin secretos). Incluye el superadmin aunque falte configurarlo.
function listUsers() {
  return usersFrom(read()).map(u => ({ user: u.user, role: u.role, hasPassword: !!(u.plain || u.hash) }));
}

function findUser(user) {
  return usersFrom(read()).find(u => sameName(u.user, user)) || null;
}

// Guarda la lista completa en formato nuevo: todas las entradas con user y
// hash (las contraseñas del .env se guardan hasheadas al materializarlas).
// El superadmin sin contraseña propia se guarda sin hash, así sigue valiendo la
// del .env si después se la ponen ahí.
function saveUsers(list) {
  const s = read();
  s.users = list.map(u => {
    if (u.role === 'superadmin' && !u.hash) return { user: u.user, role: u.role };
    return { user: u.user, role: u.role, hash: u.hash || hashPassword(u.plain) };
  });
  s.usersV2 = true;
  write(s);
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 4) throw httpError(400, 'La contraseña debe tener al menos 4 caracteres');
  if (password.length > 200) throw httpError(400, 'Contraseña demasiado larga');
}
function checkName(user, list, except) {
  if (typeof user !== 'string' || !USER_RE.test(user.trim())) {
    throw httpError(400, 'Usuario inválido (2 a 40 caracteres: letras, números, punto, guion, _ o @)');
  }
  if (list.some(u => u !== except && sameName(u.user, user.trim()))) throw httpError(409, `Ya existe el usuario "${user.trim()}"`);
}

// Reglas de permisos (actor = { user, role } de la sesión):
// - solo admin/superadmin gestionan usuarios (lo exige la ruta);
// - el superadmin no se crea, no se elimina ni cambia de rol, y solo él lo edita;
// - nadie se elimina ni se cambia el rol a sí mismo (evita quedarse afuera).
function createUser(actor, { user, role, password } = {}) {
  const list = usersFrom(read());
  if (!EDITABLE_ROLES.includes(role)) throw httpError(400, 'Rol inválido (admin | operador)');
  checkName(user, list);
  checkPassword(password);
  if (list.length >= MAX_USERS) throw httpError(400, `Máximo ${MAX_USERS} usuarios`);
  list.push({ user: user.trim(), role, plain: '', hash: hashPassword(password) });
  saveUsers(list);
  return user.trim();
}

function updateUser(actor, target, { user, role, password } = {}) {
  const list = usersFrom(read());
  const u = list.find(x => sameName(x.user, target));
  if (!u) throw httpError(404, 'Usuario no encontrado');
  const self = sameName(u.user, actor.user);
  if (u.role === 'superadmin' && actor.role !== 'superadmin') throw httpError(403, 'El superadmin solo lo modifica el propio superadmin');
  if (role !== undefined && role !== u.role) {
    if (u.role === 'superadmin') throw httpError(400, 'El superadmin no cambia de rol');
    if (!EDITABLE_ROLES.includes(role)) throw httpError(400, 'Rol inválido (admin | operador)');
    if (self) throw httpError(400, 'No podés cambiar tu propio rol');
  }
  if (user !== undefined && !sameName(user, u.user)) checkName(user, list, u);
  if (password !== undefined && password !== '') checkPassword(password);

  const before = { user: u.user, role: u.role };
  if (typeof user === 'string' && user.trim()) u.user = user.trim();
  if (role !== undefined && u.role !== 'superadmin') u.role = role;
  let passwordChanged = false;
  if (typeof password === 'string' && password.length) { u.hash = hashPassword(password); u.plain = ''; passwordChanged = true; }
  saveUsers(list);
  return { before, after: { user: u.user, role: u.role }, passwordChanged };
}

function deleteUser(actor, target) {
  const list = usersFrom(read());
  const u = list.find(x => sameName(x.user, target));
  if (!u) throw httpError(404, 'Usuario no encontrado');
  if (u.role === 'superadmin') throw httpError(403, 'El superadmin no se puede eliminar');
  if (sameName(u.user, actor.user)) throw httpError(400, 'No podés eliminar tu propio usuario');
  saveUsers(list.filter(x => x !== u));
  return u.user;
}

// Alta/cambio del superadmin por consola (arranque): no pasa por la UI.
function setSuperadmin(user, password) {
  const list = usersFrom(read());
  const u = list.find(x => x.role === 'superadmin');
  checkName(user, list, u);
  checkPassword(password);
  u.user = user.trim(); u.hash = hashPassword(password); u.plain = '';
  saveUsers(list);
}

// ─── SMTP ────────────────────────────────────────────────────────────
function envSmtp() {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    to: process.env.DAILY_REPORT_EMAIL || process.env.ALERT_EMAIL || '',
    secure: false,
  };
}

// Config completa (con password) — solo para uso interno (enviar correo)
function getSmtpFull() {
  const s = read();
  return { ...envSmtp(), ...(s.smtp || {}) };
}

// Config pública (sin password; con flag hasPassword)
function getSmtpPublic() {
  const c = getSmtpFull();
  return { host: c.host, port: c.port, user: c.user, from: c.from, to: c.to, secure: !!c.secure, hasPassword: !!c.pass };
}

// Opciones de nodemailer. `secure` (TLS implícito) solo vale en 465; en 587/25
// el servidor espera texto plano + STARTTLS y forzar TLS da
// "ssl3_get_record:wrong version number". Se deriva del puerto; el flag
// guardado solo decide en puertos no estándar.
function smtpTransportOptions() {
  const c = getSmtpFull();
  const port = parseInt(c.port, 10) || 587;
  const secure = port === 465 ? true : (port === 587 || port === 25) ? false : !!c.secure;
  return { host: c.host, port, secure, requireTLS: !secure && port !== 25, auth: { user: c.user, pass: c.pass } };
}

function setSmtp(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('payload invalido');
  const s = read();
  const next = { ...(s.smtp || {}) };
  for (const k of ['host', 'user', 'from', 'to']) {
    if (typeof patch[k] === 'string') next[k] = patch[k].trim();
  }
  if (patch.port !== undefined) next.port = parseInt(patch.port, 10) || 587;
  if (patch.secure !== undefined) next.secure = !!patch.secure;
  if (typeof patch.pass === 'string' && patch.pass.length) next.pass = patch.pass; // solo si viene
  s.smtp = next;
  write(s);
}

module.exports = { ROLES, listUsers, getUsersFull, findUser, createUser, updateUser, deleteUser, setSuperadmin, getSmtpPublic, getSmtpFull, smtpTransportOptions, setSmtp, hashPassword, SETTINGS_PATH };
