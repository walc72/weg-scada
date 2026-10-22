'use strict';

// Decodificación de los registros del caudalímetro ultrasónico TUF-2000SW
// (holding registers base 1 del manual): caudal REAL4 en 1–2 (m³/h),
// totalizador positivo LONG en 9–10 + fracción REAL4 en 11–12, error en 72.
// wordOrder: 'LE' = palabra baja primero (por defecto del TUF), 'BE' = alta primero.

function decodeTuf(regs, errReg, { wordOrder = 'LE', totalMultiplier = 1 } = {}) {
  const buf = (i) => {
    const [hi, lo] = wordOrder === 'BE' ? [regs[i], regs[i + 1]] : [regs[i + 1], regs[i]];
    const b = Buffer.alloc(4);
    b.writeUInt16BE(hi & 0xffff, 0);
    b.writeUInt16BE(lo & 0xffff, 2);
    return b;
  };
  const fin = (v) => (Number.isFinite(v) ? v : null);
  const flow = fin(buf(0).readFloatBE(0));
  const total = fin((buf(8).readInt32BE(0) + buf(10).readFloatBE(0)) * totalMultiplier);
  return { flow, total, error: errReg };
}

module.exports = { decodeTuf };
