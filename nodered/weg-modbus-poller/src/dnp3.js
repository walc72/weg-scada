'use strict';
const net = require('net');
// Códec DNP3 mínimo, solo lectura (spec §4.1): trama de enlace, transporte y aplicación.

// CRC DNP3: poly reflejado 0xA6BC, inicial 0, complemento; devuelve [lo, hi]
function crc(bytes) {
  let c = 0;
  for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = c & 1 ? (c >>> 1) ^ 0xA6BC : c >>> 1; }
  c = ~c & 0xffff;
  return [c & 0xff, c >> 8];
}

// Trama de enlace del maestro (CTRL 0xC4) con datos de usuario: cabecera + bloques de 16 con CRC
function linkFrame(dst, src, user) {
  const h = [0x05, 0x64, 5 + user.length, 0xC4, dst & 0xff, dst >> 8, src & 0xff, src >> 8];
  const out = [...h, ...crc(h)];
  for (let i = 0; i < user.length; i += 16) { const b = user.slice(i, i + 16); out.push(...b, ...crc(b)); }
  return Buffer.from(out);
}

// READ g60v1 qualifier 0x06 (class 0, solo estáticos): transporte FIR|FIN, app FIR|FIN, FC 1
const readClass0 = (dst, src, tseq, aseq) =>
  linkFrame(dst, src, [0xC0 | (tseq & 0x3f), 0xC0 | (aseq & 0x0f), 0x01, 60, 1, 0x06]);
// CONFIRM (FC 0) de una respuesta solicitada con CON
const confirm = (dst, src, tseq, aseq) =>
  linkFrame(dst, src, [0xC0 | (tseq & 0x3f), 0xC0 | (aseq & 0x0f), 0x00]);

const crcOk = (blk, lo, hi) => { const c = crc(blk); return c[0] === lo && c[1] === hi; };

// Reensambla bytes del socket -> tramas de enlace -> fragmentos de aplicación
class Reassembler {
  constructor() { this.rx = Buffer.alloc(0); this.frag = null; this.tseq = 0; }
  push(chunk) {
    this.rx = Buffer.concat([this.rx, chunk]);
    const out = [];
    for (;;) {
      // descarta basura hasta el inicio 05 64 (conserva un 05 final por si el 64 llega después)
      const s = this.rx.indexOf(Buffer.from([0x05, 0x64]));
      if (s < 0) { this.rx = this.rx[this.rx.length - 1] === 0x05 ? this.rx.subarray(-1) : Buffer.alloc(0); break; }
      if (s) this.rx = this.rx.subarray(s);
      const rx = this.rx;
      if (rx.length < 10) break;
      const len = rx[2];
      if (len < 5 || !crcOk(rx.subarray(0, 8), rx[8], rx[9])) { this.rx = rx.subarray(2); continue; }
      const nUser = len - 5, total = 10 + nUser + Math.ceil(nUser / 16) * 2;
      if (rx.length < total) break;
      const user = [];
      let ok = true;
      for (let i = 10, left = nUser; left > 0; i += 18) {
        const n = Math.min(16, left), blk = rx.subarray(i, i + n);
        if (!crcOk(blk, rx[i + n], rx[i + n + 1])) ok = false;
        user.push(...blk); left -= n;
      }
      this.rx = rx.subarray(total);
      if (!ok) continue; // bloque con CRC malo: se descarta la trama
      const e = { ctrl: rx[3], dst: rx.readUInt16LE(4), src: rx.readUInt16LE(6) };
      if (user.length) {
        const th = user[0];
        if (th & 0x40) { this.frag = []; this.tseq = th & 0x3f; }
        else if ((th & 0x3f) !== ((this.tseq + 1) & 0x3f)) this.frag = null; // segmento perdido: no se arma con huecos
        else this.tseq = th & 0x3f;
        if (this.frag) { // segmento sin FIR y sin fragmento en curso: se descarta
          this.frag.push(...user.slice(1));
          if (th & 0x80) { e.fragment = Buffer.from(this.frag); this.frag = null; }
        }
      }
      out.push(e);
    }
    return out;
  }
}

// grupo:variación -> { t: tipo, n: bytes por punto (0 = bits empacados), f: lleva byte de flags, r: lector del valor }
const OBJ = {
  '1:1':  { t: 'bi', n: 0 },
  '1:2':  { t: 'bi', n: 1, f: 1, r: (b, o) => !!(b[o] & 0x80) },
  '10:1': { t: 'bo', n: 0 },
  '10:2': { t: 'bo', n: 1, f: 1, r: (b, o) => !!(b[o] & 0x80) },
  '20:1': { t: 'ctr', n: 5, f: 1, r: (b, o) => b.readUInt32LE(o + 1) },
  '20:2': { t: 'ctr', n: 3, f: 1, r: (b, o) => b.readUInt16LE(o + 1) },
  '20:5': { t: 'ctr', n: 4, r: (b, o) => b.readUInt32LE(o) },
  '20:6': { t: 'ctr', n: 2, r: (b, o) => b.readUInt16LE(o) },
  '30:1': { t: 'ai', n: 5, f: 1, r: (b, o) => b.readInt32LE(o + 1) },
  '30:2': { t: 'ai', n: 3, f: 1, r: (b, o) => b.readInt16LE(o + 1) },
  '30:3': { t: 'ai', n: 4, r: (b, o) => b.readInt32LE(o) },
  '30:4': { t: 'ai', n: 2, r: (b, o) => b.readInt16LE(o) },
  '30:5': { t: 'ai', n: 5, f: 1, r: (b, o) => b.readFloatLE(o + 1) },
  '40:1': { t: 'ao', n: 5, f: 1, r: (b, o) => b.readInt32LE(o + 1) },
  '40:2': { t: 'ao', n: 3, f: 1, r: (b, o) => b.readInt16LE(o + 1) },
  '40:3': { t: 'ao', n: 5, f: 1, r: (b, o) => b.readFloatLE(o + 1) },
};

// Fragmento de aplicación -> puntos 'tipo:índice' -> { v, online }
function parseApp(b) {
  const ac = b[0], fc = b[1];
  const out = { fir: !!(ac & 0x80), fin: !!(ac & 0x40), con: !!(ac & 0x20), uns: !!(ac & 0x10), seq: ac & 0x0f, fc, iin: 0, points: new Map() };
  if (fc !== 0x81 && fc !== 0x82) return out; // solo las respuestas llevan IIN y objetos
  out.iin = b.readUInt16BE(2);
  let o = 4;
  try {
    while (o < b.length) {
      if (o + 3 > b.length) { out.error = 'fragmento truncado'; break; }
      const g = b[o], v = b[o + 1], q = b[o + 2]; o += 3;
      const qc = q & 0x0f, psz = (q >> 4) & 0x07;
      const def = OBJ[`${g}:${v}`];
      if (!def) { out.error = `objeto g${g}v${v} no soportado`; break; }
      if (qc === 6) continue; // sin datos (no esperado en respuestas)
      const put = (idx, val, online) => out.points.set(`${def.t}:${idx}`, { v: val, online });
      if (qc === 7 || qc === 8) { // con prefijo de índice (0x17 / 0x28)
        const cnt = qc === 7 ? b[o] : b.readUInt16LE(o); o += qc === 7 ? 1 : 2;
        if ((psz !== 1 && psz !== 2) || !def.n) { out.error = `qualifier 0x${q.toString(16)} no soportado en g${g}v${v}`; break; }
        if (o + cnt * (psz + def.n) > b.length) { out.error = 'fragmento truncado'; break; }
        for (let i = 0; i < cnt; i++) {
          const idx = psz === 1 ? b[o] : b.readUInt16LE(o); o += psz;
          put(idx, def.r(b, o), def.f ? !!(b[o] & 1) : true); o += def.n;
        }
      } else if (qc === 0 || qc === 1) { // rango de índices 8/16 bits
        let a, z;
        if (qc === 0) { a = b[o]; z = b[o + 1]; o += 2; } else { a = b.readUInt16LE(o); z = b.readUInt16LE(o + 2); o += 4; }
        if (z < a) { out.error = 'rango inválido'; break; }
        if (o + (def.n ? def.n * (z - a + 1) : Math.ceil((z - a + 1) / 8)) > b.length) { out.error = 'fragmento truncado'; break; }
        if (!def.n) { // bits empacados: sin flags, se asume en línea
          for (let i = a; i <= z; i++) put(i, !!((b[o + ((i - a) >> 3)] >> ((i - a) & 7)) & 1), true);
          o += Math.ceil((z - a + 1) / 8);
        } else {
          for (let i = a; i <= z; i++) { put(i, def.r(b, o), def.f ? !!(b[o] & 1) : true); o += def.n; }
        }
      } else { out.error = `qualifier 0x${q.toString(16)} no soportado`; break; }
    }
  } catch (e) { out.error = 'fragmento truncado'; } // lectura fuera de rango: se conservan los puntos previos
  return out;
}

// --- Pool de conexiones TCP (una por ip:puerto:outstation:maestro, un pedido en vuelo) ---
const TIMEOUT_MS = 5000;
const pool = new Map();

function getEntry(ip, port, outstation, master) {
  const key = `${ip}:${port}:${outstation}:${master}`;
  let e = pool.get(key);
  if (!e) { e = { ip, port, outstation, master, sock: null, connected: false, errors: 0, chain: Promise.resolve(), cur: null, aseq: 0, tseq: 0, reasm: null }; pool.set(key, e); }
  return e;
}

// Cierra el socket; el siguiente pedido reconecta con Reassembler y secuencias nuevas
function drop(e) {
  if (e.sock) { const s = e.sock; e.sock = null; s.destroy(); }
  e.connected = false;
}

// Respuesta solicitada (0x81) con la seq del pedido en curso; todo lo demás se ignora (nunca se confirma un 0x82)
function onFragment(e, frag) {
  const a = parseApp(frag), cur = e.cur;
  if (!cur || a.fc !== 0x81 || a.seq !== cur.aseq) return;
  if (a.con) e.sock.write(confirm(e.outstation, e.master, e.tseq++ & 0x3f, a.seq));
  for (const [k, v] of a.points) cur.points.set(k, v);
  if (a.fin) cur.finish(cur.points, false);
}

function connect(e) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host: e.ip, port: e.port });
    e.sock = sock; e.reasm = new Reassembler(); e.aseq = 0; e.tseq = 0;
    sock.setNoDelay(true);
    sock.once('connect', () => { e.connected = true; resolve(); });
    sock.on('data', (d) => { if (e.sock === sock) for (const f of e.reasm.push(d)) if (f.fragment) onFragment(e, f.fragment); });
    const fail = (err) => { if (e.sock !== sock) return; if (e.cur) e.cur.finish(null, true); else drop(e); reject(err); };
    sock.on('error', fail); sock.on('close', () => fail(new Error('cerrado')));
  });
}

function request(e) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (res, failed) => {
      if (done) return;
      done = true; clearTimeout(timer); e.cur = null;
      if (failed) { e.errors++; drop(e); }
      resolve(res);
    };
    const timer = setTimeout(() => finish(null, true), TIMEOUT_MS);
    e.cur = { aseq: -1, points: new Map(), finish };
    (e.connected ? Promise.resolve() : connect(e)).then(() => {
      if (done) return;
      e.cur.aseq = e.aseq; e.aseq = (e.aseq + 1) & 0x0f;
      e.sock.write(readClass0(e.outstation, e.master, e.tseq++ & 0x3f, e.cur.aseq));
    }).catch(() => finish(null, true));
  });
}

// READ class 0 -> Map('tipo:idx' -> {v, online}) | null (sin respuesta en 5 s o conexión caída); nunca lanza
function integrity(ip, port, outstation, master) {
  const e = getEntry(ip, port, outstation, master);
  const p = e.chain.then(() => request(e)).catch(() => null);
  e.chain = p;
  return p;
}

// key = 'ip:port' (como connections.getStats) o clave completa del pool
function closeOne(key) {
  for (const [k, e] of pool) if (k === key || `${e.ip}:${e.port}` === key) { drop(e); pool.delete(k); }
}
function closeAll() { for (const e of pool.values()) drop(e); pool.clear(); }

function getStats() {
  const stats = {};
  for (const e of pool.values()) {
    const k = `${e.ip}:${e.port}`, s = stats[k] || (stats[k] = { connected: false, errors: 0 });
    s.connected = s.connected || e.connected; s.errors += e.errors;
  }
  return stats;
}

module.exports = { crc, readClass0, confirm, Reassembler, parseApp, integrity, closeOne, closeAll, getStats };
