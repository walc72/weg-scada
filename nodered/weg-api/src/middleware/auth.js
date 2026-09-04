'use strict';

const crypto = require('crypto');

// Token store en memoria (se pierde al reiniciar, forza re-login)
const validTokens = new Set();
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas
const tokenTimers = new Map();

const AUTH_USER = process.env.AUTH_USER || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || '';

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

function login(req, res) {
  const { user, password } = req.body || {};
  if (!AUTH_PASSWORD) {
    return res.status(500).json({ error: 'AUTH_PASSWORD no configurado en el servidor' });
  }
  if (user !== AUTH_USER || password !== AUTH_PASSWORD) {
    return res.status(401).json({ error: 'Credenciales invalidas' });
  }
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
