'use strict';

const ModbusRTU = require('modbus-serial');

// ─── Lectura de forma de onda (armonicos) de medidores PM7400/PM8000 ───
// Reconstruye la forma de onda a partir de los registros de armonicos del
// medidor (amplitud + fase por armonico, floats IEEE big-endian).
// Registros por defecto relevados en PM7400 (mapa ION, direcciones 1-based):
//   freq: 3110
//   V1: 22878, V2: 23266, V3: 23654
//   I1: 24430, I2: 24818, I3: 25206, I4: 25594
// Cada armonico ocupa 6 registros: [amp_f32, fase_f32, reservado x2]

const DEFAULTS = {
  freqReg: 3110,
  numHarmonics: 63,
  channels: {
    V1: 22878, V2: 23266, V3: 23654,
    I1: 24430, I2: 24818, I3: 25206, I4: 25594
  }
};

const REGS_PER_HARMONIC = 6;
const CHUNK_REGS = 120; // multiplo de 6, bajo el limite Modbus de 125

// Conexiones dedicadas (separadas del pool de polling para no intercalar
// transacciones Modbus sobre el mismo socket)
const pool = new Map();
const inflight = new Map(); // meterName -> Promise (evita lecturas dobles)

async function getClient(ip, port) {
  const k = `${ip}:${port}`;
  const entry = pool.get(k);
  if (entry && entry.isOpen) return entry;
  if (entry) { try { entry.close(() => {}); } catch (e) {} pool.delete(k); }

  const client = new ModbusRTU();
  client.setTimeout(3000);
  await client.connectTCP(ip, { port, timeout: 5000 });
  pool.set(k, client);
  return client;
}

function dropClient(ip, port) {
  const k = `${ip}:${port}`;
  const entry = pool.get(k);
  if (entry) { try { entry.close(() => {}); } catch (e) {} pool.delete(k); }
}

function toFloat(hi, lo) {
  const buf = Buffer.alloc(4);
  buf.writeUInt16BE(hi, 0);
  buf.writeUInt16BE(lo, 2);
  return buf.readFloatBE(0);
}

async function readBlock(client, unitId, startAddr, count) {
  client.setID(unitId);
  const out = [];
  for (let off = 0; off < count; off += CHUNK_REGS) {
    const n = Math.min(CHUNK_REGS, count - off);
    const resp = await client.readHoldingRegisters(startAddr + off, n);
    out.push(...resp.data);
  }
  return out;
}

// Lee amplitud y fase de cada armonico de un canal.
// Devuelve [[amp, faseGrados], ...] indexado desde el armonico 1.
async function readChannel(client, unitId, baseReg1, numHarmonics) {
  const startAddr = baseReg1 - 1; // registros 1-based -> direccion 0-based
  const span = (numHarmonics - 1) * REGS_PER_HARMONIC + 4;
  const regs = await readBlock(client, unitId, startAddr, span);
  const harmonics = [];
  for (let h = 0; h < numHarmonics; h++) {
    const i = h * REGS_PER_HARMONIC;
    let amp = toFloat(regs[i], regs[i + 1]);
    let phase = toFloat(regs[i + 2], regs[i + 3]);
    if (!Number.isFinite(amp)) amp = 0;
    if (!Number.isFinite(phase)) phase = 0;
    harmonics.push([amp, phase]);
  }
  return harmonics;
}

async function doRead(meter) {
  const wf = { ...DEFAULTS, ...(meter.waveform || {}) };
  const channels = { ...DEFAULTS.channels, ...((meter.waveform || {}).channels || {}) };
  const port = meter.port || 502;
  const unitId = meter.unitId || 1;

  const client = await getClient(meter.ip, port);
  try {
    client.setID(unitId);
    const freqResp = await client.readHoldingRegisters(wf.freqReg - 1, 2);
    let freq = toFloat(freqResp.data[0], freqResp.data[1]);
    if (!Number.isFinite(freq) || freq <= 0) freq = 50;

    const result = {};
    for (const [name, baseReg] of Object.entries(channels)) {
      if (baseReg == null) continue;
      result[name] = { harmonics: await readChannel(client, unitId, baseReg, wf.numHarmonics) };
    }

    return { name: meter.name, ip: meter.ip, freq, numHarmonics: wf.numHarmonics, ts: Date.now(), channels: result };
  } catch (err) {
    dropClient(meter.ip, port);
    throw err;
  }
}

// Lectura con lock por medidor: pedidos concurrentes comparten la misma lectura
function readWaveform(meter) {
  const existing = inflight.get(meter.name);
  if (existing) return existing;
  const p = doRead(meter).finally(() => inflight.delete(meter.name));
  inflight.set(meter.name, p);
  return p;
}

function closeAll() {
  for (const [, client] of pool) {
    try { client.close(() => {}); } catch (e) {}
  }
  pool.clear();
}

module.exports = { readWaveform, closeAll };
