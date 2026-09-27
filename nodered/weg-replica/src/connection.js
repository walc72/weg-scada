'use strict';

const fs = require('fs');

// Conexión a planta: config/replica.json (enlazada desde la UI) o, como
// respaldo, REPLICA_SOURCE/REPLICA_TOKEN del .env. Sin ninguna → null.
function loadConnection({ file, env }) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j && j.source && j.token) {
      return { source: String(j.source).replace(/\/+$/, ''), token: String(j.token), name: j.name || '', from: 'file' };
    }
  } catch { /* sin archivo o corrupto */ }
  if (env.REPLICA_SOURCE && env.REPLICA_TOKEN) {
    return { source: String(env.REPLICA_SOURCE).replace(/\/+$/, ''), token: String(env.REPLICA_TOKEN), name: '', from: 'env' };
  }
  return null;
}

module.exports = { loadConnection };
