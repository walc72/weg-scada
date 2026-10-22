'use strict';

// Mantiene flowmeters[].bombas coherente con devices[] cuando una bomba se
// renombra o se borra. Pura: no toca disco ni muta prevCfg/nextCfg.
// Renombre = mismo indice, nombre nuevo (no existia antes) y el viejo ya no existe
// en next; asi borrar una bomba (que corre los indices) no se toma por renombre.
function syncFlowmeterPumps(prevCfg, nextCfg) {
  if (!nextCfg || !Array.isArray(nextCfg.flowmeters) || !prevCfg || !Array.isArray(prevCfg.devices) || !Array.isArray(nextCfg.devices)) return nextCfg;
  const nextNames = new Set(nextCfg.devices.map(d => d && d.name));
  const prevNames = new Set(prevCfg.devices.map(d => d && d.name));
  const renames = new Map();
  // Solo una edicion pura (mismo largo) puede contener renombres; si el largo cambia, es alta/baja
  if (prevCfg.devices.length === nextCfg.devices.length) prevCfg.devices.forEach((pd, i) => {
    const nd = nextCfg.devices[i];
    if (pd && nd && nd.name !== pd.name && !nextNames.has(pd.name) && !prevNames.has(nd.name)) renames.set(pd.name, nd.name);
  });
  const flowmeters = nextCfg.flowmeters.map(fm => {
    if (!fm || !Array.isArray(fm.bombas)) return fm;
    const bombas = fm.bombas
      .map(b => renames.get(b) || b)
      .filter(b => nextNames.has(b) || !prevCfg.devices.some(d => d && d.name === b));
    if (bombas.length === fm.bombas.length && bombas.every((b, i) => b === fm.bombas[i])) return fm;
    // ponytail: sin bombas queda deshabilitado, no se borra (spec 2.3)
    return bombas.length ? { ...fm, bombas } : { ...fm, bombas, enabled: false };
  });
  return { ...nextCfg, flowmeters };
}

module.exports = { syncFlowmeterPumps };
