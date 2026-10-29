'use strict';

// Mapa de puntos Modbus generico (reconectadores, reguladores...). Funciones
// puras mas readPoints, que lee con connections.poll.

const MAX_REGS = 125; // limite Modbus por lectura (fc 3/4)
const MAX_BITS = 2000; // limite Modbus por lectura (fc 1/2)
const MAX_HUECO = 8;  // registros sin usar tolerados dentro de un bloque

const es32 = (p) => p.tipo === 'u32' || p.tipo === 's32' || p.tipo === 'f32';
const tam = (p) => (es32(p) ? 2 : 1);
const fcDe = (p) => (p.fc === 1 || p.fc === 2 || p.fc === 4 ? p.fc : 3);

// Agrupa los puntos en lecturas contiguas por fc.
function blocks(mapa) {
  const out = [];
  for (const fc of [1, 2, 3, 4]) {
    const max = fc < 3 ? MAX_BITS : MAX_REGS;
    const idx = mapa.map((_, i) => i).filter((i) => fcDe(mapa[i]) === fc)
      .sort((a, b) => mapa[a].addr - mapa[b].addr);
    let b = null;
    for (const i of idx) {
      const { addr } = mapa[i];
      const fin = addr + tam(mapa[i]);
      if (b && addr - b.fin <= MAX_HUECO && Math.max(b.fin, fin) - b.start <= max) {
        b.fin = Math.max(b.fin, fin);
        b.idx.push(i);
      } else {
        b = { fc, start: addr, fin, idx: [i] };
        out.push(b);
      }
    }
  }
  return out.map(({ fc, start, fin, idx }) => ({ fc, start, count: fin - start, idx }));
}

// regs = registros (o bits en fc 1/2) leidos desde `start`. null si falta algun registro.
function decode(p, regs, start) {
  if (!regs) return null;
  if (p.tipo === 'bool') return !!regs[p.addr - start];
  const o = p.addr - start;
  const n = tam(p);
  for (let k = 0; k < n; k++) if (!Number.isInteger(regs[o + k])) return null;
  let raw;
  if (n === 1) {
    raw = regs[o];
    if (p.tipo === 's16' && raw > 0x7fff) raw -= 0x10000;
  } else {
    const le = p.orden === 'LE';
    const buf = Buffer.alloc(4);
    buf.writeUInt16BE(regs[o + (le ? 1 : 0)], 0);
    buf.writeUInt16BE(regs[o + (le ? 0 : 1)], 2);
    raw = p.tipo === 'f32' ? buf.readFloatBE(0) : p.tipo === 's32' ? buf.readInt32BE(0) : buf.readUInt32BE(0);
  }
  return aplicar(p, raw);
}

// Cola numerica comun (Modbus y DNP3): bit, valor o escala.
function aplicar(p, raw) {
  if (p.bit != null) return ((raw >> p.bit) & 1) === 1;
  if (p.valor != null) return raw === p.valor;
  if (!Number.isFinite(raw)) return null;
  return raw * (p.escala ?? 1);
}

// item: { ip, port, dnp3: { outstation, maestro }, mapa }. integrity = dnp3.integrity.
// Punto ausente o con online:false -> null; sin respuesta -> offline.
async function readPointsDnp3(item, integrity) {
  const m = await integrity(item.ip, item.port ?? 20000, item.dnp3?.outstation ?? 10, item.dnp3?.maestro ?? 1);
  if (!m) return { online: false, vals: new Array(item.mapa.length).fill(null) };
  const vals = item.mapa.map((p) => {
    const e = m.get(`${p.obj}:${p.addr}`);
    if (!e || !e.online) return null;
    return p.obj === 'bi' || p.obj === 'bo' ? !!e.v : aplicar(p, e.v);
  });
  return { online: true, vals };
}

// item: { ip, port, unitId, mapa }. online = al menos un bloque contesto y, si el
// mapa tiene un punto `comOk`, el gateway informa que el equipo comunica (valor true).
async function readPoints(item, poll) {
  const vals = new Array(item.mapa.length).fill(null);
  let online = false;
  for (const b of blocks(item.mapa)) {
    const regs = await poll(item.ip, item.port ?? 502, item.unitId ?? 1, b.start, b.count, b.fc);
    if (!regs) continue;
    online = true;
    for (const i of b.idx) vals[i] = decode(item.mapa[i], regs, b.start);
  }
  const c = item.mapa.findIndex((p) => p.key === 'comOk');
  if (c >= 0 && vals[c] !== true) online = false;
  return { online, vals };
}

const esAlarma = (p) => p.key === 'alarma';
const esLibre = (p) => p.key === 'med' || p.key === 'senal';
const { slug } = require('./slug');

function valoresDe(mapa, vals) {
  const o = {};
  mapa.forEach((p, i) => { if (!esAlarma(p) && !esLibre(p) && p.key !== 'comOk') o[p.key] = vals[i]; });
  return o;
}

// Mediciones/senales libres: med con el mismo nombre se suman (null si falta una parte).
// null si el mapa no tiene puntos libres.
function extrasDe(mapa, vals) {
  if (!mapa.some(esLibre)) return null;
  const extras = {};
  const senales = {};
  mapa.forEach((p, i) => {
    if (p.key === 'senal') senales[p.nombre] = vals[i];
    else if (p.key === 'med') {
      const v = Number.isFinite(vals[i]) ? vals[i] : null;
      extras[p.nombre] = p.nombre in extras ? (extras[p.nombre] === null || v === null ? null : extras[p.nombre] + v) : v;
    }
  });
  return { extras, senales };
}

function alarmasDe(kind, mapa, vals) {
  const o = {};
  mapa.forEach((p, i) => {
    if (vals[i] !== true) return;
    if (esAlarma(p)) o[`ALARMA_${i}`] = p.texto;
    else if (kind === 'reco' && p.key === 'disparo') o.DISPARO = 'Disparo';
    else if (kind === 'reco' && p.key === 'bloqueo') o.BLOQUEO = 'Bloqueado';
  });
  return o;
}

// Linea de InfluxDB campo_data (ts en ns, number o bigint).
function campoLine(st, ts) {
  const fields = [];
  for (const [k, v] of Object.entries(st.valores || {})) {
    if (typeof v === 'boolean') fields.push(`${k}=${v ? 1 : 0}i`);
    else if (Number.isFinite(v)) fields.push(`${k}=${v}`);
  }
  for (const [n, v] of Object.entries(st.extras || {})) if (Number.isFinite(v)) fields.push(`x_${slug(n)}=${v}`);
  for (const [n, v] of Object.entries(st.senales || {})) if (typeof v === 'boolean') fields.push(`s_${slug(n)}=${v ? 1 : 0}i`);
  if (!fields.length) return null;
  const name = (st.name || 'campo').replace(/ /g, '\\ ').replace(/,/g, '\\,').replace(/=/g, '\\=');
  return `campo_data,name=${name},kind=${st.kind} ${fields.join(',')} ${String(ts)}`;
}

module.exports = { blocks, decode, readPoints, readPointsDnp3, valoresDe, extrasDe, alarmasDe, campoLine };
