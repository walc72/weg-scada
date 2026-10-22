'use strict';

// Caudal de una bomba (spec caudales §3). Bomba sin `caudal` → {} (payload igual que antes).
//   manual: nominal en marcha, 0 parada, sin valor OFFLINE; nominal 0/ausente = sin caudal.
//   real, caudalímetro propio: su caudal si está habilitado, permitido, online y sin error.
//   real, colector (varias bombas): sin valor propio; se informa el caudalímetro.
// fmStates: Map nombre → { online, flow, error, allowed, enabled }
// fmOfPump: Map bomba → config del caudalímetro que la incluye

function pumpFlow(dev, driveState, fmStates, fmOfPump) {
  const c = dev.caudal;
  if (!c || (c.modo !== 'manual' && c.modo !== 'real')) return {};
  if (c.modo === 'manual') {
    const nominal = Number(c.nominal) || 0;
    if (!(nominal > 0)) return {};
    if (!driveState || !driveState.online) return { flowMode: 'manual' };
    return { flow: driveState.running ? nominal : 0, flowMode: 'manual' };
  }
  const fm = fmOfPump.get(dev.name);
  if (fm && (fm.bombas || []).length > 1) return { flowMode: 'colector', flowMeter: fm.name };
  const s = fm && fmStates.get(fm.name);
  if (s && s.enabled !== false && s.allowed !== false && s.online && s.error === 0 && Number.isFinite(s.flow)) {
    return { flow: s.flow, flowMode: 'real' };
  }
  return { flowMode: 'real' };
}

module.exports = { pumpFlow };
