'use strict';

const crypto = require('crypto');
const settings = require('../services/settings');
const { isReplicaMode } = require('./replicaMode');

// ─── Token store en memoria (se pierde al reiniciar → fuerza re-login) ───
// token -> { role, user }
const validTokens = new Map();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const tokenTimers = new Map();

// Avisos de revocación (logout o vencimiento): el proxy de /mqtt corta los
// websockets abiertos con ese token.
const revokeListeners = new Set();
function onTokenRevoked(fn) { revokeListeners.add(fn); }
function notifyRevoked(token) {
  for (const fn of revokeListeners) { try { fn(token); } catch (e) { console.error(`[AUTH] ${e.message}`); } }
}
function isSessionToken(token) { return !!token && validTokens.has(token); }

// ─── Usuarios y roles ────────────────────────────────────────────────────
// Tres roles: 'superadmin' (todo + Marca, Conexión y Réplicas; una sola
// cuenta, protegida), 'admin' (Configuración y usuarios) y 'operador' (ve
// dashboards/históricos/reportes, sin escribir configuración). Los usuarios
// se resuelven en cada login desde el servicio settings (settings.json sobre
// las variables de entorno), así el alta/cambio desde la UI toma efecto sin
// reiniciar. Cada credencial admite texto plano (env) o hash scrypt.

// ─── Rate limit de login (fuerza bruta) ───
// En la VM muchos clientes llegan con la misma IP (gateway de Docker / SNAT de
// Tailscale), así que el límite fino es por IP + usuario: 10 contraseñas malas
// bloquean a ESE usuario, no a todos. Un tope más alto por IP frena a quien
// prueba muchos nombres distintos. Un acierto solo limpia su propio contador.
const MAX_FAILED = 10;
const MAX_FAILED_PER_IP = 50;
const WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map(); // clave -> { count, firstAt }

const userKey = (ip, user) => `${ip}|${String(user || '').trim().toLowerCase()}`;
const ipKey = (ip) => `${ip}|*`;

function overLimit(key, max) {
  const entry = failedAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    failedAttempts.delete(key);
    return false;
  }
  return entry.count >= max;
}

function isRateLimited(ip, user) {
  return overLimit(userKey(ip, user), MAX_FAILED) || overLimit(ipKey(ip), MAX_FAILED_PER_IP);
}

function bump(key) {
  const entry = failedAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > WINDOW_MS) {
    failedAttempts.set(key, { count: 1, firstAt: Date.now() });
  } else {
    entry.count++;
  }
}

function recordFailure(ip, user) {
  bump(userKey(ip, user));
  bump(ipKey(ip));
}

const PUBLIC_PATHS = new Set(['/', '/health', '/api/login']);

function issueToken(role, user) {
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.set(token, { role, user });
  const timer = setTimeout(() => {
    validTokens.delete(token);
    tokenTimers.delete(token);
    notifyRevoked(token);
  }, TOKEN_TTL_MS);
  timer.unref(); // no mantener vivo el proceso solo por el vencimiento de un token
  tokenTimers.set(token, timer);
  return token;
}

function revokeToken(token) {
  const existed = validTokens.delete(token);
  const t = tokenTimers.get(token);
  if (t) { clearTimeout(t); tokenTimers.delete(token); }
  if (existed) notifyRevoked(token);
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
  const { user, password } = req.body || {};
  if (isRateLimited(ip, user)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos — reintentar en 15 minutos' });
  }
  const USERS = settings.getUsersFull();  // dinámico: settings.json sobre env
  if (USERS.length === 0) {
    return res.status(500).json({ error: 'No hay credenciales configuradas en el servidor (AUTH_PASSWORD / OPERADOR_PASSWORD)' });
  }

  // Recorre todos los usuarios (tiempo ~constante, sin enumeración por timing)
  let matched = null;
  for (const u of USERS) {
    const userOk = safeEqual(user, u.user);
    const passOk = verifyPassword(password, u.plain, u.hash);
    if (userOk && passOk) matched = u;
  }

  if (!matched) {
    recordFailure(ip, user);
    console.warn(`[AUTH] Login fallido desde ${ip}`);
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  failedAttempts.delete(userKey(ip, user));
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
  res.json({ user: req.auth.user, role: req.auth.role, replica: isReplicaMode() });
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  if (req.query && req.query.token) return req.query.token;
  return null;
}

// Valida el Bearer token SIN excepciones de rutas públicas. Para routers que se
// montan antes de requireAuth pero tienen operaciones protegidas (branding).
function authenticate(req, res, next) {
  const token = extractToken(req);
  const auth = token && validTokens.get(token);
  if (!auth) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.auth = auth; // { role, user }
  next();
}

function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  return authenticate(req, res, next);
}

const isAdminRole = (role) => role === 'admin' || role === 'superadmin';

// Exige rol admin o superadmin (para escrituras de configuración)
function requireAdmin(req, res, next) {
  if (!req.auth || !isAdminRole(req.auth.role)) {
    return res.status(403).json({ error: 'Requiere rol administrador' });
  }
  next();
}

// Exige superadmin (Marca, Conexión, Réplicas)
function requireSuperadmin(req, res, next) {
  if (!req.auth || req.auth.role !== 'superadmin') {
    return res.status(403).json({ error: 'Requiere rol superadmin' });
  }
  next();
}

// Cierra las sesiones de un usuario (eliminado, o con rol/nombre/contraseña
// cambiados) salvo `exceptToken` (la sesión de quien hace el cambio).
function revokeUserSessions(user, exceptToken = null) {
  const name = String(user).toLowerCase();
  for (const [token, a] of [...validTokens]) {
    if (token !== exceptToken && String(a.user).toLowerCase() === name) revokeToken(token);
  }
}

// Actualiza la identidad de una sesión viva (el usuario se renombró a sí mismo).
function renameSession(token, user) {
  const a = token && validTokens.get(token);
  if (a) a.user = user;
}

module.exports = {
  requireAuth, requireAdmin, requireSuperadmin, isAdminRole, authenticate, login, logout, me,
  extractToken, revokeUserSessions, renameSession, isSessionToken, onTokenRevoked,
};
