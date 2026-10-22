'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decodeTuf } = require('../src/tuf');

// Palabras [alta, baja] de un REAL4 / LONG
const f32 = (v) => { const b = Buffer.alloc(4); b.writeFloatBE(v); return [b.readUInt16BE(0), b.readUInt16BE(2)]; };
const i32 = (v) => { const b = Buffer.alloc(4); b.writeInt32BE(v); return [b.readUInt16BE(0), b.readUInt16BE(2)]; };

// Registros 1–12 del TUF: caudal (1–2), totalizador LONG (9–10) + fracción (11–12)
function regs(flow, long, frac, order) {
  const w = (pair) => (order === 'BE' ? pair : [pair[1], pair[0]]);
  return [...w(f32(flow)), 0, 0, 0, 0, 0, 0, ...w(i32(long)), ...w(f32(frac))];
}

test('decodeTuf: caudal 850.5 en LE (palabra baja primero, por defecto)', () => {
  const r = decodeTuf(regs(850.5, 12345, 0.75, 'LE'), 0);
  assert.equal(r.flow, 850.5);
  assert.equal(r.total, 12345.75);
  assert.equal(r.error, 0);
});

test('decodeTuf: caudal 850.5 en BE', () => {
  const r = decodeTuf(regs(850.5, 12345, 0.75, 'BE'), 0, { wordOrder: 'BE' });
  assert.equal(r.flow, 850.5);
  assert.equal(r.total, 12345.75);
});

test('decodeTuf: el orden equivocado no da el valor', () => {
  assert.notEqual(decodeTuf(regs(850.5, 12345, 0.75, 'BE'), 0, { wordOrder: 'LE' }).flow, 850.5);
});

test('decodeTuf: total = (LONG + fracción) × totalMultiplier', () => {
  const r = decodeTuf(regs(1, 12345, 0.75, 'LE'), 0, { totalMultiplier: 0.1 });
  assert.ok(Math.abs(r.total - 1234.575) < 1e-9, String(r.total));
});

test('decodeTuf: LONG con signo', () => {
  assert.equal(decodeTuf(regs(0, -2, 0.5, 'LE'), 0).total, -1.5);
});

test('decodeTuf: NaN → flow null', () => {
  const r = decodeTuf(regs(NaN, 1, 0, 'LE'), 0);
  assert.equal(r.flow, null);
  assert.equal(r.total, 1);
});

test('decodeTuf: fracción infinita → total null', () => {
  assert.equal(decodeTuf(regs(1, 1, Infinity, 'LE'), 0).total, null);
});

test('decodeTuf: código de error del reg 72', () => {
  assert.equal(decodeTuf(regs(1, 1, 0, 'LE'), 0x0008).error, 8);
});
