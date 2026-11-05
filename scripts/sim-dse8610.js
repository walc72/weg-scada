#!/usr/bin/env node
'use strict';

// Simulador Modbus TCP de un DSE 8610 MKII (mapa GenComm por defecto de weg-api) para probar
// el poller sin el equipo. Solo FC 3; lo que no está en el mapa responde 0.
// Uso: node scripts/sim-dse8610.js [puerto=1502]   (unit ID: cualquiera)
// En el portal: generador con IP de esta PC, el puerto elegido y modelo DSE 8610.

const net = require('node:net');
const { MODELOS } = require('../nodered/weg-api/src/services/modelos');

const MAPA = MODELOS.dse8610.mapa;
// Valores de ingeniería plausibles: grupo en carga, modo automático
const VALORES = {
  modo: 1, rpm: 1500, hz: 50, vl1n: 231, vl2n: 230, vl3n: 232, vl1l2: 400, vl2l3: 399, vl3l1: 401,
  il1: 182, il2: 176, il3: 185, kw: 112, fp: 0.91, horas: 1234.5, arranques: 412,
  'Presión de aceite': 380, 'Temperatura refrigerante': 82, 'Nivel de combustible': 18,
  'Tensión alternador de carga': 27.6, 'Tensión de batería': 27.4, 'Frecuencia de red': 0, 'Tensión de red L1-N': 0,
  'Potencia aparente': 123, 'Energía generada': 98765.4,
};
// Nivel GenComm por alarma (texto): 2 advertencia, 3 parada; el resto queda 1 (inactiva)
const ALARMAS = { 'Bajo nivel de combustible': 2 };

const regs = new Map();
for (const p of MAPA) {
  if (p.key === 'alarma') {
    const cur = regs.get(p.addr) ?? 0;
    regs.set(p.addr, (cur & ~(0xf << p.nib)) | ((ALARMAS[p.texto] ?? 1) << p.nib));
    continue;
  }
  const v = VALORES[p.key === 'med' ? p.nombre : p.key];
  if (v == null) continue;
  const raw = Math.round(v / (p.escala ?? 1));
  if (p.tipo === 'u32' || p.tipo === 's32') {
    const u = raw >>> 0; // BE: palabra alta primero
    regs.set(p.addr, u >>> 16);
    regs.set(p.addr + 1, u & 0xffff);
  } else regs.set(p.addr, raw & 0xffff);
}

// Horas de marcha que avanzan, kW y tensión que se mueven un poco
setInterval(() => {
  const h = MAPA.find((p) => p.key === 'horas');
  const s = ((regs.get(h.addr) << 16) | regs.get(h.addr + 1)) >>> 0;
  const n = s + 2;
  regs.set(h.addr, n >>> 16); regs.set(h.addr + 1, n & 0xffff);
  const kw = MAPA.find((p) => p.key === 'kw');
  const w = Math.round((112 + (Math.random() - 0.5) * 6) * 1000);
  regs.set(kw.addr, w >>> 16); regs.set(kw.addr + 1, w & 0xffff);
}, 2000).unref();

function responder(req) {
  const fc = req[7];
  const head = (len) => { const b = Buffer.alloc(7); req.copy(b, 0, 0, 4); b.writeUInt16BE(len, 4); b[6] = req[6]; return b; };
  const excepcion = (code) => Buffer.concat([head(3), Buffer.from([fc | 0x80, code])]);
  if (fc !== 3) return excepcion(1);
  const start = req.readUInt16BE(8), count = req.readUInt16BE(10);
  if (count < 1 || count > 125) return excepcion(3);
  const pdu = Buffer.alloc(2 + count * 2);
  pdu[0] = 3; pdu[1] = count * 2;
  for (let i = 0; i < count; i++) pdu.writeUInt16BE(regs.get(start + i) ?? 0, 2 + i * 2);
  return Buffer.concat([head(pdu.length + 1), pdu]);
}

const port = Number(process.argv[2]) || 1502;
net.createServer((sock) => {
  let buf = Buffer.alloc(0);
  sock.on('data', (d) => {
    buf = Buffer.concat([buf, d]);
    while (buf.length >= 7 && buf.length >= 6 + buf.readUInt16BE(4)) {
      const n = 6 + buf.readUInt16BE(4);
      sock.write(responder(buf.subarray(0, n)));
      buf = buf.subarray(n);
    }
  });
  sock.on('error', () => {});
}).listen(port, () => console.log(`[SIM] DSE 8610 en Modbus TCP :${port} (FC 3, cualquier unit ID)`));
