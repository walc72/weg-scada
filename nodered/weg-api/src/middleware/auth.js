'use strict';

const crypto = require('crypto');

// ─── Token store en memoria (se pierde al reiniciar → fuerza re-login) ───
// token -> { role, user }
const validTokens = new Map();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const tokenTimers = new Map();

// ─── Usuarios y roles ────────────────────────────────────────────────────
// Dos roles: 'admin' (todo, incluida Configuración) y 'operador' (ve
// dashboards/históricos/reportes, sin escribir configuración).
// Cada credencial admite password en texto plano (AUTH_PASSWORD) o, preferido,
// hash scrypt (AUTH_PASSWORD_HASH con formato "scrypt$<saltHex>$<hashHex>").
function buildUsers() {
  const list = [];
  if (process.env.AUTH_PASSWORD || process.env.AUTH_PASSWORD_HASH) {
    list.push({
      user: process.env.AUTH_USER || 'admin',
      role: 'admin',
      plain: process.env.AUTH_PASSWORD || '',
      hash: process.env.AUTH_PASSWORD_HASH || '',
    });
  }
  if (process.env.OPERADOR_PASSWORD || process.env.OPERADOR_PASSWORD_HASH) {
    list.push({
      user: process.env.OPERADOR_USER || 'operador',
      role: 'operador',
      plain: process.env.OPERADOR_PASSWORD || '',
      hash: process.env.OPERADOR_PASSWORD_HASH || '',
    });
  }
  return list;
}
const USERS = buildUsers();

// ─── Rate limit de login por IP (fuerza bruta) ───
const MAX_FAILED = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map(); // ip -> { count, firstAt }

function isRateLimited(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failedAttempts.delete(ip);
    return false;
  }
  return entry.count >= MAX_FAILED;
}

function recordFailure(ip) {
  const entry = failedAttempts.get(ip);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    failedAttempts.set(ip, { count: 1, firstAt: Date.now() });
  } else {
    entry.count++;
  }
}

const PUBLIC_PATHS = new Set(['/', '/health', '/api/login']);

function issueToken(role, user) {
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.set(token, { role, user });
  const timer = setTimeout(() => {
    validTokens.delete(token);
    tokenTimers.delete(token);
  }, TOKEN_TTL_MS);
  tokenTimers.set(token, timer);
  return token;
}

function revokeToken(token) {
  validTokens.delete(token);
  const t = tokenTimers.get(token);
  if (t) { clearTimeout(t); tokenTimers.delete(token); }
}

// Comparacion en tiempo constante para no filtrar por timing
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    crypto.timingSafeEqual(bb, bb); // mantener tiempo constante
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

// Verifica password contra hash scrypt ("scrypt$salt$hash") o texto plano
function verifyPassword(input, plain, hash) {
  if (hash) {
    const parts = String(hash).split('$');
    if (parts.length === 3 && parts[0] === 'scrypt') {
      try {
        const salt = Buffer.from(parts[1], 'hex');
        const expected = Buffer.from(parts[2], 'hex');
        const derived = crypto.scryptSync(String(input), salt, expected.length);
        return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
      } catch { return false; }
    }
    return false;
  }
  return safeEqual(input, plain);
}

function login(req, res) {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos — reintentar en 15 minutos' });
  }
  if (USERS.length === 0) {
    return res.status(500).json({ error: 'No hay credenciales configuradas en el servidor (AUTH_PASSWORD / OPERADOR_PASSWORD)' });
  }
  const { user, password } = req.body || {};

  // Recorre todos los usuarios (tiempo ~constante, sin enumeración por timing)
  let matched = null;
  for (const u of USERS) {
    const userOk = safeEqual(user, u.user);
    const passOk = verifyPassword(password, u.plain, u.hash);
    if (userOk && passOk) matched = u;
  }

  if (!matched) {
    recordFailure(ip);
    console.warn(`[AUTH] Login fallido desde ${ip}`);
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  failedAttempts.delete(ip);
  const token = issueToken(matched.role, matched.user);
  res.json({ token, role: matched.role, user: matched.user, expiresIn: TOKEN_TTL_MS / 1000 });
}

function logout(req, res) {
  const token = extractToken(req);
  if (token) revokeToken(token);
  res.json({ ok: true });
}

// Devuelve la identidad del token actual (para restaurar rol tras recargar)
function me(req, res) {
  if (!req.auth) return res.status(401).json({ error: 'No autorizado' });
  res.json({ user: req.auth.user, role: req.auth.role });
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  const token = extractToken(req);
  const auth = token && validTokens.get(token);
  if (!auth) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.auth = auth; // { role, user }
  next();
}

// Exige rol admin (para escrituras de configuración)
function requireAdmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'admin') {
    return res.status(403).json({ error: 'Requiere rol administrador' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin, login, logout, me };
