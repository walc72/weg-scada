#!/usr/bin/env node
'use strict';

// Herramienta del integrador para firmar licencias (Ed25519). Sin dependencias.
//   node scripts/license.js keygen --out <carpeta>
//   node scripts/license.js sign --key <private.pem> --id <uuid> --cliente <nombre> --modulos a,b --A n --B n --C n
//   node scripts/license.js show <texto>
// La frase de paso nunca va por argumento: se pide por consola (o una línea por stdin si no es TTY).

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const license = require('../nodered/weg-api/src/services/license');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function keygen({ dir, passphrase }) {
  const file = path.join(dir, 'private.pem');
  if (fs.existsSync(file)) throw new Error(`Ya existe ${file}; no se sobrescribe`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.mkdirSync(dir, { recursive: true });
  const pem = privateKey.export({ type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase });
  fs.writeFileSync(file, pem, { mode: 0o600 }); // en Windows el modo se ignora
  return publicKey.export({ type: 'spki', format: 'pem' });
}

function signLicense({ keyPem, passphrase, id: rawId, cliente, modulos, A, B, C, today }) {
  if (!UUID.test(String(rawId))) throw new Error(`ID de instalación inválido: ${rawId}`);
  const id = String(rawId).toLowerCase();
  if (!String(cliente || '').trim()) throw new Error('El cliente es obligatorio');
  for (const m of modulos) if (!license.MODULES.includes(m)) throw new Error(`Módulo desconocido: ${m}`);
  for (const [t, v] of Object.entries({ A, B, C })) {
    if (!Number.isInteger(v) || v < 0) throw new Error(`Límite inválido: ${t}`);
  }
  let key;
  try { key = crypto.createPrivateKey({ key: keyPem, format: 'pem', passphrase }); } catch { throw new Error('Frase de paso incorrecta'); }
  return license.sign({ v: 1, installId: id, cliente, emitida: today, modulos, limites: { A, B, C } }, key);
}

const csv = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const HEAD_OLD = 'fecha,cliente,installId,modulos,A,B,C';
const HEAD = HEAD_OLD + ',licencia';

function localDate(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function appendIssued(dir, { fecha, cliente, installId, modulos, A, B, C, licencia }) {
  const file = path.join(dir, 'emitidas.csv');
  const row = [fecha, csv(cliente), installId, modulos.join('|'), A, B, C, csv(licencia)].join(',') + '\n';
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/^﻿/, '') : '';
  if (!cur.trim()) return fs.writeFileSync(file, HEAD + '\n' + row);
  const eol = cur.endsWith('\n') ? '' : '\n';
  const nlAt = cur.indexOf('\n');
  const first = (nlAt < 0 ? cur : cur.slice(0, nlAt)).replace(/\r$/, '');
  if (first !== HEAD_OLD) return fs.appendFileSync(file, eol + row);
  // Cabecera vieja: se reescribe con la nueva (sin BOM); las filas existentes quedan intactas (sin columna extra).
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, HEAD + '\n' + (nlAt < 0 ? '' : cur.slice(nlAt + 1) + eol) + row);
  fs.renameSync(tmp, file);
}

function show(text, publicKey = license.PUBLIC_KEY) {
  const d = license.decode(text);
  if (!d || !d.payload || typeof d.payload !== 'object') return 'No es una licencia válida (formato)';
  const p = d.payload;
  const l = p.limites || {};
  const firma = !publicKey ? 'sin verificar (no hay clave pública)'
    : license.verify(text, null, { checkInstall: false, publicKey }).ok ? 'válida' : 'INVÁLIDA';
  return [
    `Cliente: ${p.cliente}`,
    `Instalación: ${p.installId}`,
    `Emitida: ${p.emitida}`,
    `Módulos: ${(p.modulos || []).join(', ') || '(ninguno)'}`,
    `Límites: A=${l.A} B=${l.B} C=${l.C}`,
    `Firma: ${firma}`,
  ].join('\n');
}

// --- CLI ---

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const flag = argv[i];
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`Falta el valor de ${flag}`);
      o[flag.slice(2)] = v;
    }
    else o._.push(argv[i]);
  }
  return o;
}

// Pide una línea; en TTY sin eco. Con stdin por pipe las líneas llegan juntas, por eso se encolan.
const rl = { it: null, lines: [], waiting: null, closed: false };
function ask(prompt) {
  const tty = !!process.stdin.isTTY;
  if (!rl.it) {
    rl.it = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
    rl.it.on('line', (l) => (rl.waiting ? rl.waiting.resolve(l) : rl.lines.push(l)));
    rl.it.on('close', () => { rl.closed = true; if (rl.waiting) rl.waiting.reject(new Error('No se recibió la frase de paso')); });
    if (tty) {
      const w = rl.it._writeToOutput;
      rl.it._writeToOutput = function (s) { if (!rl.muted) w.call(rl.it, s); };
    }
  }
  if (tty) { process.stdout.write(prompt); rl.muted = true; }
  return new Promise((resolve, reject) => {
    const done = (f) => (v) => { rl.waiting = null; rl.muted = false; if (tty) console.log(); f(v); };
    if (rl.lines.length) return done(resolve)(rl.lines.shift());
    if (rl.closed) return done(reject)(new Error('No se recibió la frase de paso'));
    rl.waiting = { resolve: done(resolve), reject: done(reject) };
  });
}

const USO = `Uso:
  node scripts/license.js keygen --out <carpeta>
  node scripts/license.js sign --key <private.pem> --id <uuid> --cliente <nombre> --modulos a,b --A n --B n --C n
  node scripts/license.js show <texto>
Módulos: ${license.MODULES.join(', ')}`;

async function main(argv) {
  const [cmd, ...rest] = argv;
  const a = parseArgs(rest);
  if (cmd === 'keygen' && a.out) {
    if (fs.existsSync(path.join(a.out, 'private.pem'))) throw new Error(`Ya existe ${path.join(a.out, 'private.pem')}; no se sobrescribe`);
    const p1 = await ask('Frase de paso (mín. 12 caracteres): ');
    if (p1.length < 12) throw new Error('La frase de paso debe tener al menos 12 caracteres');
    if (p1 !== await ask('Repita la frase de paso: ')) throw new Error('Las frases no coinciden');
    const pub = keygen({ dir: a.out, passphrase: p1 });
    console.log(pub);
    console.log('Pegue esta clave en PUBLIC_KEY de nodered/weg-api/src/services/license.js y copie ese archivo a nodered/weg-modbus-poller/src/license.js');
    console.log(`Clave privada: ${path.join(a.out, 'private.pem')} (respáldela fuera del repositorio; no se puede recuperar)`);
  } else if (cmd === 'sign' && a.key && a.id && a.cliente) {
    const keyPem = fs.readFileSync(a.key, 'utf8');
    const num = (v) => (v === undefined ? 0 : /^\d+$/.test(v) ? Number(v) : NaN);
    const row = {
      fecha: localDate(), cliente: a.cliente, installId: a.id.toLowerCase(),
      modulos: (a.modulos || '').split(',').map((s) => s.trim()).filter(Boolean), A: num(a.A), B: num(a.B), C: num(a.C),
    };
    const text = signLicense({ keyPem, passphrase: await ask('Frase de paso: '), ...row, id: row.installId, today: row.fecha });
    appendIssued(path.dirname(path.resolve(a.key)), { ...row, licencia: text });
    console.log(text);
  } else if (cmd === 'show' && a._[0]) {
    console.log(show(a._[0]));
  } else {
    console.error(USO);
    process.exitCode = 1;
  }
  if (rl.it) rl.it.close();
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}

module.exports = { parseArgs, keygen, signLicense, appendIssued, show, localDate };
