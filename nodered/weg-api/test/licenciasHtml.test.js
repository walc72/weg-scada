'use strict';

// Núcleo de scripts/licencias.html (<script id="core">) ejecutado en vm con el webcrypto de Node.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const tool = require('../../../scripts/license.js');
const license = require('../src/services/license');

const html = fs.readFileSync(path.join(__dirname, '../../../scripts/licencias.html'), 'utf8');
const ctx = { crypto: crypto.webcrypto, TextEncoder, TextDecoder, atob, btoa };
vm.runInNewContext(/<script id="core">([\s\S]*?)<\/script>/.exec(html)[1], ctx);
const L = ctx.LicCore;

const ID = '123e4567-e89b-12d3-a456-426614174000';
const ID2 = 'abcdef01-e89b-12d3-a456-426614174000';
const PASS = 'frase-de-paso-larga';
const plain = (x) => JSON.parse(JSON.stringify(x)); // objetos del otro realm
const fields = (extra = {}) => ({ cliente: 'Agriplus', installId: ID, modulos: ['medidores', 'caudales'], A: 0, B: 20, C: 1, ...extra });

function newKey() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lichtml-'));
  const pub = tool.keygen({ dir, passphrase: PASS });
  return { pub, pem: fs.readFileSync(path.join(dir, 'private.pem'), 'utf8') };
}
const K = newKey();

// PKCS#8 cifrado armado a mano, para PRF/cifrados que Node no exporta.
const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  const len = body.length < 128 ? [body.length] : body.length < 256 ? [0x81, body.length] : [0x82, body.length >> 8, body.length & 255];
  return Buffer.concat([Buffer.from([tag, ...len]), body]);
};
const seq = (...p) => tlv(0x30, ...p);
const oid = (hex) => tlv(0x06, Buffer.from(hex, 'hex'));
function encryptedPem(pass, { cipher, cipherOid, keyLen, ivLen = 16, prf = null, prfOid = null }) {
  const der = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'der' });
  const salt = crypto.randomBytes(8);
  const iv = crypto.randomBytes(ivLen);
  const key = crypto.pbkdf2Sync(pass, salt, 2048, keyLen, prf || 'sha1');
  const c = crypto.createCipheriv(cipher, key, iv);
  const data = Buffer.concat([c.update(der), c.final()]);
  const kdfParams = [tlv(0x04, salt), tlv(0x02, Buffer.from([0x08, 0x00]))];
  if (prfOid) kdfParams.push(seq(oid(prfOid), Buffer.from([0x05, 0x00])));
  const out = seq(
    seq(oid('2a864886f70d01050d'), seq(seq(oid('2a864886f70d01050c'), seq(...kdfParams)), seq(oid(cipherOid), tlv(0x04, iv)))),
    tlv(0x04, data),
  );
  const pem = `-----BEGIN ENCRYPTED PRIVATE KEY-----\n${out.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END ENCRYPTED PRIVATE KEY-----\n`;
  crypto.createPrivateKey({ key: pem, format: 'pem', passphrase: pass }); // la propia Node lo acepta
  return pem;
}

const rejectsWith = (p, message) => assert.rejects(p, (e) => { assert.equal(e.message, message); return true; });

test('PUBLIC_KEY y MODULES iguales a license.js', () => {
  assert.equal(L.PUBLIC_KEY, license.PUBLIC_KEY);
  assert.deepEqual(plain(L.MODULES), license.MODULES);
  assert.equal(L.MODULE_LABELS.replica, 'Réplica de oficina');
  assert.equal(L.localDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('openPrivateKey: frase correcta, incorrecta, vacía', async () => {
  const key = await L.openPrivateKey(K.pem, PASS);
  assert.equal(key.type, 'private');
  assert.equal(key.extractable, false);
  await rejectsWith(L.openPrivateKey(K.pem, 'otra-frase-cualquiera'), 'Frase de paso incorrecta');
  await rejectsWith(L.openPrivateKey(K.pem, ''), 'Frase de paso incorrecta');
});

test('openPrivateKey: formatos no soportados', async () => {
  const bare = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem' });
  await rejectsWith(L.openPrivateKey('basura', PASS), 'Formato de clave no soportado');
  await rejectsWith(L.openPrivateKey(bare, PASS), 'Formato de clave no soportado');
  const des = encryptedPem(PASS, { cipher: 'des-ede3-cbc', cipherOid: '2a864886f70d0307', keyLen: 24, ivLen: 8 });
  await rejectsWith(L.openPrivateKey(des, PASS), 'Formato de clave no soportado');
});

test('openPrivateKey: aes-128 de Node, aes-192 con HMAC-SHA1 y SHA-512', async () => {
  const k128 = crypto.generateKeyPairSync('ed25519').privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-128-cbc', passphrase: PASS });
  assert.equal((await L.openPrivateKey(k128, PASS)).type, 'private');
  const sha1 = encryptedPem(PASS, { cipher: 'aes-192-cbc', cipherOid: '608648016503040116', keyLen: 24 });
  assert.equal((await L.openPrivateKey(sha1, PASS)).type, 'private');
  await rejectsWith(L.openPrivateKey(sha1, 'mala'), 'Frase de paso incorrecta');
  const sha512 = encryptedPem(PASS, { cipher: 'aes-256-cbc', cipherOid: '60864801650304012a', keyLen: 32, prf: 'sha512', prfOid: '2a864886f70d020b' });
  assert.equal((await L.openPrivateKey(sha512, PASS)).type, 'private');
});

test('signLicense igual byte a byte a la herramienta de comandos y aceptada por verify', async () => {
  const key = await L.openPrivateKey(K.pem, PASS);
  for (const cliente of ['Agriplus', 'Agrocaraya Ñandú']) {
    const f = fields({ cliente, installId: ID.toUpperCase(), modulos: ['medidores', 'caudales', 'backup'] });
    const text = await L.signLicense(key, f, '2026-10-22');
    const ref = tool.signLicense({ keyPem: K.pem, passphrase: PASS, ...f, id: f.installId, today: '2026-10-22' });
    assert.equal(text, ref);
    const r = license.verify(text, ID, { publicKey: K.pub });
    assert.equal(r.ok, true);
    assert.equal(r.cliente, cliente);
  }
});

test('signLicense ordena los módulos como MODULES y valida', async () => {
  const key = await L.openPrivateKey(K.pem, PASS);
  const text = await L.signLicense(key, fields({ modulos: ['backup', 'medidores'] }), '2026-10-22');
  assert.deepEqual(license.decode(text).payload.modulos, ['medidores', 'backup']);
  await rejectsWith(L.signLicense(key, fields({ cliente: ' ' }), '2026-10-22'), 'El cliente es obligatorio');
});

test('verifyText: válida, otra pública, otra instalación, formato', async () => {
  const key = await L.openPrivateKey(K.pem, PASS);
  const text = await L.signLicense(key, fields(), '2026-10-22');
  const ok = await L.verifyText(text, K.pub, ID.toUpperCase());
  assert.equal(ok.ok, true);
  assert.equal(ok.motivo, null);
  assert.deepEqual(plain(ok.payload), { v: 1, installId: ID, cliente: 'Agriplus', emitida: '2026-10-22', modulos: ['medidores', 'caudales'], limites: { A: 0, B: 20, C: 1 } });
  assert.equal((await L.verifyText(text, K.pub)).ok, true);
  const other = await L.verifyText(text); // pública de producción
  assert.equal(other.motivo, 'firma');
  assert.equal(other.payload.cliente, 'Agriplus');
  assert.equal((await L.verifyText(text, K.pub, ID2)).motivo, 'otra-instalacion');
  assert.equal((await L.verifyText('hola', K.pub)).motivo, 'formato');
  assert.equal((await L.verifyText('aG9sYQ.aG9sYQ', K.pub)).motivo, 'formato');
});

test('validate devuelve los mensajes de la herramienta de comandos', () => {
  assert.deepEqual(plain(L.validate(fields())), []);
  assert.deepEqual(plain(L.validate({ cliente: '', installId: 'x', modulos: ['medidores', 'nada'], A: -1, B: 1.5, C: 2 })), [
    'ID de instalación inválido: x', 'El cliente es obligatorio', 'Módulo desconocido: nada', 'Límite inválido: A', 'Límite inválido: B',
  ]);
});

test('CSV: ida y vuelta con comas, comillas y saltos de línea', () => {
  const rows = [
    { fecha: '2026-10-22', cliente: 'Agro, "S.A."\nnorte', installId: ID, modulos: ['medidores', 'backup'], A: 0, B: 20, C: 1, licencia: 'abc.def' },
    { fecha: '2026-10-23', cliente: 'Otro', installId: ID2, modulos: [], A: 2, B: 2, C: 2, licencia: '' },
  ];
  const text = L.serializeCsv(rows);
  assert.ok(text.startsWith('fecha,cliente,installId,modulos,A,B,C,licencia\n'));
  assert.ok(text.endsWith('\n'));
  assert.deepEqual(plain(L.parseCsv(text)), { rows, legacy: false, headerOk: true });
  assert.equal(L.serializeCsv([]), 'fecha,cliente,installId,modulos,A,B,C,licencia\n');
});

test('CSV: cabecera vieja, BOM, CRLF y finales mezclados', () => {
  const old = '﻿fecha,cliente,installId,modulos,A,B,C\r\n2026-10-01,"Agro\r\nSur",' + ID + ',medidores|caudales,0,18,1\r\n2026-10-02,Otro,' + ID2 + ',,1,2,3';
  const r = plain(L.parseCsv(old));
  assert.equal(r.legacy, true);
  assert.deepEqual(r.rows, [
    { fecha: '2026-10-01', cliente: 'Agro\r\nSur', installId: ID, modulos: ['medidores', 'caudales'], A: 0, B: 18, C: 1, licencia: '' },
    { fecha: '2026-10-02', cliente: 'Otro', installId: ID2, modulos: [], A: 1, B: 2, C: 3, licencia: '' },
  ]);
  assert.ok(L.serializeCsv(r.rows).startsWith('fecha,cliente,installId,modulos,A,B,C,licencia\n'));
  // Cabecera ya migrada por la herramienta: filas viejas de 7 columnas y nuevas de 8, \n y \r\n mezclados.
  const mixed = 'fecha,cliente,installId,modulos,A,B,C,licencia\n2026-10-01,Agro,' + ID + ',medidores,0,1,0\r\n2026-10-02,Agro,' + ID + ',medidores,0,2,0,x.y\n\n';
  const m = plain(L.parseCsv(mixed));
  assert.equal(m.legacy, false);
  assert.deepEqual(m.rows.map((x) => [x.B, x.licencia]), [[1, ''], [2, 'x.y']]);
  assert.deepEqual(plain(L.parseCsv('')), { rows: [], legacy: false, headerOk: true });
  assert.equal(r.headerOk, true);
  assert.equal(m.headerOk, true);
});

test('parseCsv: headerOk falso con otra cabecera; filas cortas dan 0, no NaN', () => {
  assert.equal(L.parseCsv('a,b,c\n1,2,3\n').headerOk, false);
  assert.equal(L.parseCsv('fecha,cliente,installId,modulos,A,B\n').headerOk, false);
  const r = L.parseCsv('fecha,cliente,installId,modulos,A,B,C\n2026-10-01,X,' + ID + ',medidores,5\n');
  assert.deepEqual(plain(r.rows[0]), { fecha: '2026-10-01', cliente: 'X', installId: ID, modulos: ['medidores'], A: 5, B: 0, C: 0, licencia: '' });
});

test('openPrivateKey: errores que no son de frase dan el mensaje de navegador', async () => {
  const bad = { crypto: {}, TextEncoder, TextDecoder, atob, btoa };
  vm.runInNewContext(/<script id="core">([\s\S]*?)<\/script>/.exec(html)[1], bad);
  await rejectsWith(bad.LicCore.openPrivateKey(K.pem, PASS), 'Este navegador no soporta Ed25519; usá Edge o Chrome actualizados');
});

test('latestByInstall: una por (cliente, id), gana la última del archivo, orden A-Z', () => {
  const row = (cliente, installId, fecha, B) => ({ fecha, cliente, installId, modulos: [], A: 0, B, C: 0, licencia: '' });
  const out = plain(L.latestByInstall([
    row('Zeta', ID, '2026-10-01', 1),
    row('agro', ID, '2026-10-22', 1),
    row('agro', ID, '2026-10-22', 2),
    row('agro', ID2, '2026-10-20', 3),
    row('Ñandú', ID, '2026-10-01', 4),
  ]));
  assert.deepEqual(out.map((r) => [r.cliente, r.installId, r.B]), [['agro', ID, 2], ['agro', ID2, 3], ['Ñandú', ID, 4], ['Zeta', ID, 1]]);
});

test('fileName: caracteres raros y sufijo cuando existe', () => {
  const n1 = L.fileName('Agro, S.A./x', ID, '2026-10-22', new Set());
  assert.equal(n1, 'Agro__S_A__x_123e4567_2026-10-22.txt');
  assert.equal(L.fileName('Agro, S.A./x', ID, '2026-10-22', new Set([n1])), 'Agro__S_A__x_123e4567_2026-10-22-2.txt');
  assert.equal(L.fileName('Agro, S.A./x', ID, '2026-10-22', new Set([n1, 'Agro__S_A__x_123e4567_2026-10-22-2.txt'])), 'Agro__S_A__x_123e4567_2026-10-22-3.txt');
  assert.equal(L.fileName('Agrocaraya Ñandú', ID, '2026-10-22', new Set()), 'Agrocaraya_Ñandú_123e4567_2026-10-22.txt');
});

test('dos firmas el mismo día al mismo cliente: -2 y la lista toma la segunda', async () => {
  const key = await L.openPrivateKey(K.pem, PASS);
  const existing = new Set();
  let csv = '';
  for (const B of [18, 23]) {
    const f = fields({ B });
    const licencia = await L.signLicense(key, f, '2026-10-22');
    existing.add(L.fileName(f.cliente, f.installId, '2026-10-22', existing));
    const { rows } = L.parseCsv(csv);
    csv = L.serializeCsv([...rows, { fecha: '2026-10-22', ...f, licencia }]);
  }
  assert.deepEqual([...existing], ['Agriplus_123e4567_2026-10-22.txt', 'Agriplus_123e4567_2026-10-22-2.txt']);
  const list = L.latestByInstall(L.parseCsv(csv).rows);
  assert.equal(list.length, 1);
  assert.equal(list[0].B, 23);
  assert.equal(license.decode(list[0].licencia).payload.limites.B, 23);
});

test('diffSummary: límites y módulos; licencia nueva', () => {
  const prev = { modulos: ['medidores', 'backup'], A: 0, B: 18, C: 1 };
  const next = { modulos: ['medidores', 'generadores'], A: 0, B: 23, C: 1 };
  assert.deepEqual(plain(L.diffSummary(prev, next)), ['B 18 → 23', '+ Generadores', '− Backup en la nube']);
  assert.deepEqual(plain(L.diffSummary(prev, prev)), []);
  assert.deepEqual(plain(L.diffSummary(null, next)), ['Nueva licencia', '+ Medidores de energía', '+ Generadores', 'A 0', 'B 23', 'C 1']);
});
