'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const tool = require('../../../scripts/license.js');
const license = require('../src/services/license');

const ID = '123e4567-e89b-12d3-a456-426614174000';
const PASS = 'frase-de-paso-larga';
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lictool-'));
const base = (keyPem, extra = {}) => ({ keyPem, passphrase: PASS, id: ID, cliente: 'Agriplus', modulos: ['medidores', 'caudales'], A: 0, B: 20, C: 1, today: '2026-10-22', ...extra });

test('keygen crea clave cifrada y no la sobrescribe', () => {
  const dir = path.join(tmp(), 'sub');
  const pub = tool.keygen({ dir, passphrase: PASS });
  assert.match(pub, /BEGIN PUBLIC KEY/);
  assert.match(fs.readFileSync(path.join(dir, 'private.pem'), 'utf8'), /-----BEGIN ENCRYPTED PRIVATE KEY-----/);
  assert.throws(() => tool.keygen({ dir, passphrase: PASS }), /Ya existe .*private\.pem; no se sobrescribe/);
});

test('signLicense produce texto que verify acepta', () => {
  const dir = tmp();
  const pub = tool.keygen({ dir, passphrase: PASS });
  const keyPem = fs.readFileSync(path.join(dir, 'private.pem'), 'utf8');
  const text = tool.signLicense(base(keyPem));
  const r = license.verify(text, ID, { publicKey: pub });
  assert.equal(r.ok, true);
  assert.equal(r.cliente, 'Agriplus');
  assert.deepEqual(r.modulos, ['medidores', 'caudales']);
  assert.deepEqual(r.limites, { A: 0, B: 20, C: 1 });
  assert.equal(license.decode(text).payload.emitida, '2026-10-22');
});

test('signLicense valida entradas', () => {
  const dir = tmp();
  tool.keygen({ dir, passphrase: PASS });
  const keyPem = fs.readFileSync(path.join(dir, 'private.pem'), 'utf8');
  assert.throws(() => tool.signLicense(base(keyPem, { passphrase: 'otra-frase-larga' })), /Frase de paso incorrecta/);
  assert.throws(() => tool.signLicense(base(keyPem, { modulos: ['unifilr'] })), /Módulo desconocido: unifilr/);
  assert.throws(() => tool.signLicense(base(keyPem, { id: 'abc' })), /ID de instalación inválido: abc/);
  assert.throws(() => tool.signLicense(base(keyPem, { B: -1 })), /Límite inválido: B/);
  assert.throws(() => tool.signLicense(base(keyPem, { C: 1.5 })), /Límite inválido: C/);
  assert.throws(() => tool.signLicense(base(keyPem, { cliente: ' ' })), /cliente/i);
});

test('localDate usa la fecha local, no UTC', () => {
  assert.equal(tool.localDate(new Date(2026, 9, 22, 23, 30)), '2026-10-22');
  assert.equal(tool.localDate(new Date(2026, 0, 5, 0, 5)), '2026-01-05');
});

const HEAD = 'fecha,cliente,installId,modulos,A,B,C,licencia';

test('appendIssued agrega cabecera una vez, escapa el cliente y guarda la licencia', () => {
  const dir = tmp();
  tool.appendIssued(dir, { fecha: '2026-10-22', cliente: 'Agriplus', installId: ID, modulos: ['medidores', 'caudales'], A: 0, B: 20, C: 1, licencia: 'TEXTO1' });
  tool.appendIssued(dir, { fecha: '2026-10-23', cliente: 'Foo, "SA"', installId: ID, modulos: [], A: 1, B: 2, C: 3, licencia: 'TEXTO2' });
  const lines = fs.readFileSync(path.join(dir, 'emitidas.csv'), 'utf8').trim().split('\n');
  assert.equal(lines[0], HEAD);
  assert.equal(lines[1], `2026-10-22,Agriplus,${ID},medidores|caudales,0,20,1,TEXTO1`);
  assert.equal(lines[2], `2026-10-23,"Foo, ""SA""",${ID},,1,2,3,TEXTO2`);
  assert.equal(lines.length, 3);
});

test('appendIssued migra la cabecera vieja sin tocar las filas existentes', () => {
  for (const eol of ['\n', '\r\n']) {
    const dir = tmp();
    const file = path.join(dir, 'emitidas.csv');
    const rows = `2026-01-01,X,${ID},medidores,0,1,2\n2026-01-02,Y,${ID},,3,4,5\n`;
    fs.writeFileSync(file, `fecha,cliente,installId,modulos,A,B,C${eol}${rows}`);
    tool.appendIssued(dir, { fecha: '2026-10-22', cliente: 'Z', installId: ID, modulos: ['caudales'], A: 9, B: 8, C: 7, licencia: 'TXT' });
    assert.equal(fs.readFileSync(file, 'utf8'), `${HEAD}\n${rows}2026-10-22,Z,${ID},caudales,9,8,7,TXT\n`);
    assert.deepEqual(fs.readdirSync(dir), ['emitidas.csv']);
  }
});

test('appendIssued migra una cabecera vieja con BOM y CRLF (sin BOM al reescribir)', () => {
  const dir = tmp();
  const file = path.join(dir, 'emitidas.csv');
  const rows = `2026-01-01,X,${ID},medidores,0,1,2
`;
  fs.writeFileSync(file, '﻿fecha,cliente,installId,modulos,A,B,C\r\n' + rows);
  tool.appendIssued(dir, { fecha: '2026-10-22', cliente: 'Z', installId: ID, modulos: [], A: 1, B: 2, C: 3, licencia: 'TXT' });
  assert.equal(fs.readFileSync(file, 'utf8'), `${HEAD}
${rows}2026-10-22,Z,${ID},,1,2,3,TXT
`);
});

test('appendIssued: archivo sin salto final no pega filas; archivo vacio recibe cabecera', () => {
  const dir = tmp();
  const file = path.join(dir, 'emitidas.csv');
  const r = { fecha: '2026-10-22', cliente: 'Z', installId: ID, modulos: [], A: 1, B: 2, C: 3, licencia: 'TXT' };
  fs.writeFileSync(file, HEAD + '\nprev');
  tool.appendIssued(dir, r);
  assert.equal(fs.readFileSync(file, 'utf8'), HEAD + '\nprev\n' + `2026-10-22,Z,${ID},,1,2,3,TXT
`);
  fs.writeFileSync(file, 'fecha,cliente,installId,modulos,A,B,C\nprev');
  tool.appendIssued(dir, r);
  assert.equal(fs.readFileSync(file, 'utf8'), HEAD + '\nprev\n' + `2026-10-22,Z,${ID},,1,2,3,TXT
`);
  fs.writeFileSync(file, '');
  tool.appendIssued(dir, r);
  assert.equal(fs.readFileSync(file, 'utf8'), HEAD + '\n' + `2026-10-22,Z,${ID},,1,2,3,TXT
`);
});

test('show describe la licencia y su firma', () => {
  const dir = tmp();
  const pub = tool.keygen({ dir, passphrase: PASS });
  const text = tool.signLicense(base(fs.readFileSync(path.join(dir, 'private.pem'), 'utf8')));
  const out = tool.show(text, pub);
  assert.match(out, /Agriplus/);
  assert.match(out, new RegExp(ID));
  assert.match(out, /medidores, caudales/);
  assert.match(out, /Firma: válida/);
  const otra = tool.keygen({ dir: tmp(), passphrase: PASS });
  assert.match(tool.show(text, otra), /Firma: INVÁLIDA/);
  assert.match(tool.show(text, null), /sin verificar/);
  assert.equal(tool.show('basura', pub), 'No es una licencia válida (formato)');
});

test('parseArgs: flag sin valor falla; --id en mayúsculas se firma en minúsculas', () => {
  assert.throws(() => tool.parseArgs(['--B']), /Falta el valor de --B/);
  assert.throws(() => tool.parseArgs(['--B', '--C', '2']), /Falta el valor de --B/);
  assert.equal(tool.parseArgs(['--B', '2', 'x']).B, '2');
  const { privateKey } = require('node:crypto').generateKeyPairSync('ed25519');
  const keyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const text = tool.signLicense({ keyPem, id: '7F3C2A9E-1B4D-4C6E-9F0A-2B3C4D5E6F70', cliente: 'X', modulos: [], A: 1, B: 1, C: 1, today: '2026-10-22' });
  assert.equal(license.decode(text).payload.installId, '7f3c2a9e-1b4d-4c6e-9f0a-2b3c4d5e6f70');
});
