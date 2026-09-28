'use strict';

// Express enruta sin distinguir mayúsculas y tolera la barra final
// (/api/CONFIG/devices/ llega al mismo handler que /api/config/devices).
// Los guards que deciden por path tienen que normalizar igual, o se saltean.
function normPath(p) {
  return String(p || '').toLowerCase().replace(/\/+$/, '') || '/';
}

module.exports = { normPath };
