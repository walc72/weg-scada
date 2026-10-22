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

test('appendIssued agrega cabecera una vez y escapa el cliente', () => {
  const dir = tmp();
  tool.appendIssued(dir, { fecha: '2026-10-22', cliente: 'Agriplus', installId: ID, modulos: ['medidores', 'caudales'], A: 0, B: 20, C: 1 });
  tool.appendIssued(dir, { fecha: '2026-10-23', cliente: 'Foo, "SA"', installId: ID, modulos: [], A: 1, B: 2, C: 3 });
  const lines = fs.readFileSync(path.join(dir, 'emitidas.csv'), 'utf8').trim().split('\n');
  assert.equal(lines[0], 'fecha,cliente,installId,modulos,A,B,C');
  assert.equal(lines[1], `2026-10-22,Agriplus,${ID},medidores|caudales,0,20,1`);
  assert.equal(lines[2], `2026-10-23,"Foo, ""SA""",${ID},,1,2,3`);
  assert.equal(lines.length, 3);
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
