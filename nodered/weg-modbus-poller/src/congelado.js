'use strict';

// Dato congelado de un SSW900 leído vía PLC. El PLC responde aunque haya dejado de
// refrescar su copia de los esclavos, y el SCADA mostraba esa foto vieja como si
// fuera en vivo (caso real del 2026-11-02: los 4 SAER del M241 quedaron fijos más de
// un día, con SAER 5 y 6 en FALLA mientras estaban en marcha). Los segundos
// energizados del SSW (regs 42/43) avanzan cada segundo mientras el equipo tiene
// control: si no cambian en `staleMs`, el dato no es real y se trata como sin
// comunicación.

const STALE_MS = 3 * 60 * 1000;

function createFreezeDetector(staleMs = STALE_MS) {
  const last = new Map(); // nombre → { sig, since }
  // true = el bloque no cambió en staleMs (dato congelado)
  return function congelado(name, regs, now = Date.now()) {
    const sig = `${regs[42] || 0}:${regs[43] || 0}`;
    const p = last.get(name);
    if (!p || p.sig !== sig) { last.set(name, { sig, since: now }); return false; }
    return now - p.since >= staleMs;
  };
}

module.exports = { createFreezeDetector, STALE_MS };
