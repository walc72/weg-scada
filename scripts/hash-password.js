'use strict';
// Genera un hash scrypt para una password, en el formato que espera weg-api:
//   scrypt$<saltHex>$<hashHex>
// Uso:  node scripts/hash-password.js 'mi-password-secreta'
// Pegar el resultado en AUTH_PASSWORD_HASH u OPERADOR_PASSWORD_HASH del .env
// (y dejar el AUTH_PASSWORD / OPERADOR_PASSWORD en texto plano vacío).

const crypto = require('crypto');

const pass = process.argv[2];
if (!pass) {
  console.error("Uso: node scripts/hash-password.js '<password>'");
  process.exit(1);
}

const salt = crypto.randomBytes(16);
const KEYLEN = 32;
const hash = crypto.scryptSync(String(pass), salt, KEYLEN);
console.log(`scrypt$${salt.toString('hex')}$${hash.toString('hex')}`);
