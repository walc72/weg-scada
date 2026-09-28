'use strict';

// Código de enlace planta → réplica. Lo genera la planta al registrar una
// réplica y se pega en la oficina: "WEGR1-" + base64url(JSON {v,u,t,n,i}).
// Contiene el token en claro: se muestra una sola vez.

const PREFIX = 'WEGR1-';
const TOKEN_RE = /^[0-9a-f]{64}$/;

function encodeCode({ url, token, name, id }) {
  const json = JSON.stringify({ v: 1, u: url, t: token, n: name, i: id });
  return PREFIX + Buffer.from(json, 'utf8').toString('base64url');
}

function decodeCode(code) {
  const bad = () => new Error('Código de enlace inválido');
  const s = String(code == null ? '' : code).trim();
  if (!s.startsWith(PREFIX)) throw bad();
  let obj;
  try { obj = JSON.parse(Buffer.from(s.slice(PREFIX.length), 'base64url').toString('utf8')); } catch { throw bad(); }
  if (!obj || obj.v !== 1 || typeof obj.u !== 'string' || typeof obj.t !== 'string' || !TOKEN_RE.test(obj.t)) throw bad();
  let u;
  try { u = new URL(obj.u); } catch { throw bad(); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw bad();
  return {
    url: obj.u.replace(/\/+$/, ''),
    token: obj.t,
    name: typeof obj.n === 'string' ? obj.n : '',
    id: typeof obj.i === 'string' ? obj.i : '',
  };
}

module.exports = { encodeCode, decodeCode, PREFIX };
