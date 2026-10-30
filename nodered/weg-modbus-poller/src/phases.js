'use strict';
// Registros por fase (L1/L2/L3) de un medidor. Cada grupo se toma de regs si
// están los tres; si no, del mapa PM8000 cuando la potencia total es su 3060.
// THD no tiene default: el registro no está verificado en campo, solo se lee
// si se configura (regs.thdIA/B/C).
const PM8000 = {
  power:   [3054, 3056, 3058],
  current: [3000, 3002, 3004],
  voltage: [3020, 3022, 3024],  // L-L: A-B, B-C, C-A
};

const GRUPOS = {
  power:   ['powerA', 'powerB', 'powerC'],
  current: ['currentA', 'currentB', 'currentC'],
  voltage: ['voltageAB', 'voltageBC', 'voltageCA'],
  thdI:    ['thdIA', 'thdIB', 'thdIC'],
};

function phaseRegs(r = {}) {
  const out = {};
  for (const [g, keys] of Object.entries(GRUPOS)) {
    const own = keys.map((k) => r[k]);
    out[g] = own.every((v) => v != null) ? own
      : (r.power === 3060 && PM8000[g]) ? PM8000[g]
      : null;
  }
  return out;
}

// ¿Se pueden leer los tres en un solo pedido? (float32 consecutivos)
const consecutive = (regs) => regs[1] === regs[0] + 2 && regs[2] === regs[0] + 4;

module.exports = { phaseRegs, consecutive, GRUPOS };
