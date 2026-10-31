'use strict';
// Registros por fase (L1/L2/L3) de un medidor. Cada grupo se toma de regs si
// están los tres; si no, del mapa PM8000 cuando la potencia total es su 3060.
// Verificado en planta (2026-10-30): corriente 3000.., tensión L-L 3020.. y
// THD de corriente 21300.. que el PM8000 entrega como fracción (0,056 = 5,6 %,
// confirmado contra la pantalla del medidor) → thdScale 100.
const PM8000 = {
  power:   [3054, 3056, 3058],
  current: [3000, 3002, 3004],
  voltage: [3020, 3022, 3024],  // L-L: A-B, B-C, C-A
  thdI:    [21300, 21302, 21304],
};

const GRUPOS = {
  power:   ['powerA', 'powerB', 'powerC'],
  current: ['currentA', 'currentB', 'currentC'],
  voltage: ['voltageAB', 'voltageBC', 'voltageCA'],
  thdI:    ['thdIA', 'thdIB', 'thdIC'],
};

function phaseRegs(r = {}) {
  const out = {};
  const pm8000 = r.power === 3060;
  for (const [g, keys] of Object.entries(GRUPOS)) {
    const own = keys.map((k) => r[k]);
    out[g] = own.every((v) => v != null) ? own : (pm8000 ? PM8000[g] : null);
  }
  // Factor del THD: regs.thdScale si se configura; si no, 100 con el mapa
  // PM8000 por defecto (fracción) y 1 con registros propios (ya en %).
  const ownThd = GRUPOS.thdI.every((k) => r[k] != null);
  out.thdScale = r.thdScale != null ? Number(r.thdScale) : (ownThd ? 1 : 100);
  return out;
}

// ¿Se pueden leer los tres en un solo pedido? (float32 consecutivos)
const consecutive = (regs) => regs[1] === regs[0] + 2 && regs[2] === regs[0] + 4;

module.exports = { phaseRegs, consecutive, GRUPOS };
