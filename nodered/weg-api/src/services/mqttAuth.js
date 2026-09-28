'use strict';

const crypto = require('crypto');

function sameToken(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

// Credencial del websocket /mqtt → identidad (para poder cortar por quién es)
function createMqttValidator({ isSessionToken, registry, legacyToken }) {
  return (credential, ip) => {
    if (!credential) return null;
    if (isSessionToken(credential)) return `session:${credential}`;
    if (legacyToken && sameToken(credential, legacyToken)) return 'replica:env';
    const r = registry ? registry.verify(credential, ip) : null;
    return r ? `replica:${r.id}` : null;
  };
}

module.exports = { createMqttValidator };
