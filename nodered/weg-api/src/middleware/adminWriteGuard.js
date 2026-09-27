'use strict';

const { requireAdmin } = require('./auth');
const { normPath } = require('./pathMatch');

// Guard de escritura: solo admin puede modificar configuración/setpoints.
// El operador tiene acceso de lectura a todo lo demás.
const WRITE_METHODS = new Set(['PUT', 'POST', 'DELETE', 'PATCH']);

function adminWriteGuard(req, res, next) {
  if (!WRITE_METHODS.has(req.method)) return next();
  const p = normPath(req.path);
  if (p.startsWith('/api/config') || p.startsWith('/api/setpoints')) return requireAdmin(req, res, next);
  next();
}

module.exports = { adminWriteGuard };
