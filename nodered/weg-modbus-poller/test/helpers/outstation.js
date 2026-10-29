'use strict';
// Outstation DNP3 simulado (solo exporta start(); sin efectos al importar)
const net = require('net');
const { crc, Reassembler } = require('../../src/dnp3');

// Trama del outstation (CTRL 0x44): cabecera + bloques de 16 con CRC
function frame(dst, src, user, ctrl = 0x44) {
  const h = [0x05, 0x64, 5 + user.length, ctrl, dst & 0xff, dst >> 8, src & 0xff, src >> 8];
  const out = [...h, ...crc(h)];
  for (let i = 0; i < user.length; i += 16) { const b = user.slice(i, i + 16); out.push(...b, ...crc(b)); }
  return Buffer.from(out);
}

const GV = { bi: [1, 2], bo: [10, 2], ctr: [20, 1], ai: [30, 1], ao: [40, 1] };
function objBytes(t, v) {
  const f = 0x01; // ONLINE
  if (t === 'bi' || t === 'bo') return [(v ? 0x80 : 0) | f];
  const b = Buffer.alloc(5); b[0] = f;
  b.writeInt32LE(v, 1); // ctr (sin signo) también cabe en los valores de prueba
  return [...b];
}

// points: { 'ai:0': 12092, 'bi:3': true, ... } -> objetos con qualifier 0x28 (contador + índice de 16 bits)
function appObjects(points) {
  const por = {};
  for (const [k, v] of Object.entries(points)) { const [t, i] = k.split(':'); (por[t] = por[t] || []).push([+i, v]); }
  const out = [];
  for (const [t, lst] of Object.entries(por)) {
    out.push(GV[t][0], GV[t][1], 0x28, lst.length & 0xff, lst.length >> 8);
    for (const [i, v] of lst) out.push(i & 0xff, i >> 8, ...objBytes(t, v));
  }
  return out;
}

function start({ port = 0, address = 10, points = {}, con = false, unsolicitedOnConnect = false, duplicate = false, silent = false } = {}) {
  const requests = [], socks = new Set();
  const srv = net.createServer((sock) => {
    socks.add(sock); sock.on('close', () => socks.delete(sock)); sock.on('error', () => {});
    let tseq = 0;
    const send = (dst, app) => sock.write(frame(dst, address, [0xC0 | (tseq++ & 0x3f), ...app]));
    if (unsolicitedOnConnect) { // 0x82 con CON, seq 0 (colisiona a propósito con el primer pedido), valores distintos
      send(1, [0xF0, 0x82, 0x00, 0x00, ...appObjects({ 'ai:0': -1 })]);
      sock.write(frame(1, address, [], 0x0B)); // link status sin datos
    }
    const rz = new Reassembler();
    sock.on('data', (d) => {
      for (const f of rz.push(d)) {
        if (!f.fragment) continue;
        requests.push(f.fragment);
        if (silent || f.fragment[1] !== 0x01) continue;
        const app = [0xC0 | (con ? 0x20 : 0) | (f.fragment[0] & 0x0f), 0x81, 0x00, 0x00, ...appObjects(points)];
        send(f.src, app);
        if (duplicate) send(f.src, app);
      }
    });
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({
    port: srv.address().port, requests,
    close: () => new Promise((r) => { for (const s of socks) s.destroy(); srv.close(() => r()); }),
  })));
}

module.exports = { start };
