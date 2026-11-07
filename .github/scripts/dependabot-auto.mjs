// Decide si un PR de Dependabot se mergea solo. Lee PR_TITLE y PR_BODY del entorno.
// Sí: todas las actualizaciones son parche o menor (en 0.x, solo parche: ahí la
// "menor" rompe, p. ej. pdfkit 0.15 → 0.20) y ninguna toca un paquete sensible.
// Uso: node dependabot-auto.mjs  → exit 0 = mergear, 1 = dejar para revisión manual.

import { pathToFileURL } from 'node:url';

// Protocolos de campo y servicios base: siempre a mano, aunque sea un parche
const SENSIBLES = new Set(['modbus-serial', 'net-snmp', 'mqtt', 'influxdb', 'eclipse-mosquitto']);

export function actualizaciones(title = '', body = '') {
  body = String(body).replace(/\r/g, '');
  const out = [];
  const re = [
    /^Updates `([^`]+)` from (\S+) to (\S+?)\.?$/gm,     // grupos
    /^Bumps \[([^\]]+)\]\([^)]*\) from (\S+) to (\S+?)\.$/gm, // PR suelto
  ];
  for (const r of re) for (const m of body.matchAll(r)) out.push({ pkg: m[1], de: m[2], a: m[3] });
  if (!out.length) {
    const m = title.match(/Bump (\S+) from (\S+) to (\S+)/);
    if (m) out.push({ pkg: m[1], de: m[2], a: m[3] });
  }
  return out;
}

const ver = (v) => (String(v).match(/^v?(\d+)(?:\.(\d+))?/) || []).slice(1).map((n) => Number(n || 0));

export function decidir(title, body) {
  const ups = actualizaciones(title, body);
  if (!ups.length) return { ok: false, motivo: 'no encontré qué actualiza' };
  for (const u of ups) {
    if (SENSIBLES.has(u.pkg)) return { ok: false, motivo: `${u.pkg} es sensible` };
    const [M1, m1] = ver(u.de), [M2, m2] = ver(u.a);
    if (Number.isNaN(M1) || Number.isNaN(M2) || M1 === undefined || M2 === undefined) return { ok: false, motivo: `versión rara en ${u.pkg}` };
    if (M1 !== M2) return { ok: false, motivo: `${u.pkg} ${u.de} → ${u.a} es mayor` };
    if (M1 === 0 && m1 !== m2) return { ok: false, motivo: `${u.pkg} ${u.de} → ${u.a} cambia la menor en 0.x` };
  }
  return { ok: true, motivo: ups.map((u) => `${u.pkg} ${u.de} → ${u.a}`).join(', ') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = decidir(process.env.PR_TITLE, process.env.PR_BODY);
  console.log(`${r.ok ? 'MERGEAR' : 'REVISIÓN MANUAL'}: ${r.motivo}`);
  process.exit(r.ok ? 0 : 1);
}
