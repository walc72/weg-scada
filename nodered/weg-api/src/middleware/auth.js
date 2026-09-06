'use strict';

const crypto = require('crypto');

// Token store en memoria (se pierde al reiniciar, forza re-login)
const validTokens = new Set();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const tokenTimers = new Map();

const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

// Rate limit de login por IP: bloquea fuerza bruta sobre la credencial unica
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

// Rutas que NO requieren auth
const PUBLIC_PATHS = new Set(['/', '/health', '/api/login']);

function issueToken() {
  const token = crypto.randomBytes(32).toString('hex');
  validTokens.add(token);
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

// Comparacion en tiempo constante para no filtrar la password por timing
function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) {
    // Comparar igual para mantener tiempo constante
    crypto.timingSafeEqual(bb, bb);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

function login(req, res) {
  const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Demasiados intentos fallidos — reintentar en 15 minutos' });
  }
  const { user, password } = req.body || {};
  if (!AUTH_PASSWORD) {
    return res.status(500).json({ error: 'AUTH_PASSWORD no configurado en el servidor' });
  }
  const userOk = safeEqual(user, AUTH_USER);
  const passOk = safeEqual(password, AUTH_PASSWORD);
  if (!userOk || !passOk) {
    recordFailure(ip);
    console.warn(`[AUTH] Login fallido desde ${ip}`);
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
  failedAttempts.delete(ip);
  const token = issueToken();
  res.json({ token, expiresIn: TOKEN_TTL_MS / 1000 });
}

function logout(req, res) {
  const token = extractToken(req);
  if (token) revokeToken(token);
  res.json({ ok: true });
}

function extractToken(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  // Fallback query param para SSE (EventSource no permite headers)
  if (req.query && req.query.token) return req.query.token;
  return null;
}

function requireAuth(req, res, next) {
  if (PUBLIC_PATHS.has(req.path)) return next();
  const token = extractToken(req);
  if (!token || !validTokens.has(token)) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  next();
}

module.exports = { requireAuth, login, logout };
