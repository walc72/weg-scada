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
const ROLES = ['admin', 'operador'];

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
function envUser(role) {
  if (role === 'admin') {
    return { user: process.env.AUTH_USER || 'admin', role, plain: process.env.AUTH_PASSWORD || '', hash: process.env.AUTH_PASSWORD_HASH || '' };
  }
  return { user: process.env.OPERADOR_USER || 'operador', role, plain: process.env.OPERADOR_PASSWORD || '', hash: process.env.OPERADOR_PASSWORD_HASH || '' };
}

// Usuarios efectivos (settings sobre env). Incluye secretos (para el login).
function getUsersFull() {
  const s = read();
  const byRole = {};
  for (const r of ROLES) byRole[r] = envUser(r);
  if (Array.isArray(s.users)) {
    for (const u of s.users) {
      if (u && ROLES.includes(u.role)) {
        byRole[u.role] = {
          user: (u.user && u.user.trim()) || byRole[u.role].user,
          role: u.role,
          plain: '',                              // settings nunca guarda texto plano
          hash: u.hash || byRole[u.role].hash,
        };
      }
    }
  }
  // Solo devolver usuarios con alguna credencial (plain de env o hash)
  return ROLES.map(r => byRole[r]).filter(u => u.plain || u.hash);
}

// Lista pública (sin secretos) — incluye si tiene contraseña configurada
function listUsers() {
  const full = getUsersFull();
  return ROLES.map(r => {
    const u = full.find(x => x.role === r) || envUser(r);
    return { role: r, user: u.user, hasPassword: !!(u.plain || u.hash) };
  });
}

function setUser(role, user, password) {
  if (!ROLES.includes(role)) throw new Error('rol invalido (admin | operador)');
  if (user !== undefined && (typeof user !== 'string' || !user.trim())) throw new Error('usuario invalido');
  if (password !== undefined && typeof password !== 'string') throw new Error('password invalida');
  const s = read();
  if (!Array.isArray(s.users)) s.users = [];
  let entry = s.users.find(u => u && u.role === role);
  if (!entry) { entry = { role }; s.users.push(entry); }
  if (typeof user === 'string' && user.trim()) entry.user = user.trim();
  if (typeof password === 'string' && password.length) entry.hash = hashPassword(password);
  write(s);
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

module.exports = { listUsers, getUsersFull, setUser, getSmtpPublic, getSmtpFull, smtpTransportOptions, setSmtp, hashPassword, SETTINGS_PATH };
