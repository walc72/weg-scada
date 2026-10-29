'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { crc, readClass0, confirm, Reassembler, parseApp } = require('../src/dnp3');

const FIX = '0564554401000a0030b7ddc0819600010200000c018101010101e7b0010101818101810a0200000101011401ad7800000101f61f000001f61f00001e01009b700002013c2f00000186180000010000008d8e00280100000101952f0000016c320000fa65';

test('crc de cabecera conocida', () => {
  assert.deepStrictEqual(crc([0x05, 0x64, 0x05, 0x0b, 0x03, 0x00, 0x0a, 0x00]), [0xc4, 0x25]);
});

test('readClass0: cabecera, CRC y usuario', () => {
  const f = readClass0(10, 1, 0, 0);
  assert.ok(f.toString('hex').startsWith('0564' + '0b' + 'c4' + '0a00' + '0100'));
  assert.deepStrictEqual([...f.subarray(8, 10)], crc(f.subarray(0, 8)));
  assert.deepStrictEqual([...f.subarray(10, 16)], [0xc0, 0xc0, 0x01, 0x3c, 0x01, 0x06]);
  assert.deepStrictEqual([...f.subarray(16, 18)], crc(f.subarray(10, 16)));
  const c = confirm(10, 1, 1, 3);
  assert.deepStrictEqual([...c.subarray(10, 13)], [0xc1, 0xc3, 0x00]);
});

function chequeaFixture(frags) {
  assert.strictEqual(frags.length, 1);
  const a = parseApp(frags[0]);
  assert.strictEqual(a.fc, 0x81); assert.strictEqual(a.seq, 0); assert.strictEqual(a.fin, true);
  assert.strictEqual(a.error, undefined);
  const v = (k) => a.points.get(k).v;
  assert.deepStrictEqual([v('ai:0'), v('ai:1'), v('ai:2')], [12092, 6278, 0]);
  assert.deepStrictEqual([v('ctr:0'), v('ctr:1')], [8182, 8182]);
  assert.deepStrictEqual([v('ao:0'), v('ao:1')], [12181, 12908]);
  assert.deepStrictEqual([v('bo:0'), v('bo:1')], [false, false]);
  const bi = [0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1].map(Boolean);
  assert.deepStrictEqual(bi.map((_, i) => v(`bi:${i}`)), bi);
  for (const p of a.points.values()) assert.strictEqual(p.online, true);
}

test('fixture real de una pieza', () => {
  const r = new Reassembler();
  chequeaFixture(r.push(Buffer.from(FIX, 'hex')).filter((e) => e.fragment).map((e) => e.fragment));
});

test('fixture partido en dos chunks', () => {
  const r = new Reassembler(), b = Buffer.from(FIX, 'hex');
  const es = [...r.push(b.subarray(0, 37)), ...r.push(b.subarray(37))];
  chequeaFixture(es.filter((e) => e.fragment).map((e) => e.fragment));
});

test('basura previa se salta', () => {
  const r = new Reassembler();
  const es = r.push(Buffer.concat([Buffer.from([0xaa, 0x05, 0x00]), Buffer.from(FIX, 'hex')]));
  chequeaFixture(es.filter((e) => e.fragment).map((e) => e.fragment));
});

test('link status sin fragment', () => {
  const es = new Reassembler().push(Buffer.from('0564054901000a00db9b', 'hex'));
  assert.strictEqual(es.length, 1);
  assert.strictEqual(es[0].fragment, undefined);
});

const app = (...objs) => Buffer.from([0xc0, 0x81, 0, 0, ...objs.flat()]);

test('g30v1 con flags 0 -> online false', () => {
  const a = parseApp(app([30, 1, 0x00, 0, 0, 0x00, 5, 0, 0, 0]));
  assert.deepStrictEqual(a.points.get('ai:0'), { v: 5, online: false });
});

test('objeto no soportado conserva los anteriores y marca error', () => {
  const a = parseApp(app([30, 1, 0x00, 0, 0, 0x01, 7, 0, 0, 0], [99, 1, 0x00, 0, 0, 1]));
  assert.strictEqual(a.points.get('ai:0').v, 7);
  assert.ok(a.error);
});

test('qualifiers 0x17 y 0x28 con prefijo de indice', () => {
  const a = parseApp(app([30, 2, 0x17, 1, 4, 0x01, 9, 0], [30, 4, 0x28, 1, 0, 0x10, 0, 3, 0]));
  assert.deepStrictEqual(a.points.get('ai:4'), { v: 9, online: true });
  assert.strictEqual(a.points.get('ai:16').v, 3);
});

test('fragmento en dos segmentos de transporte', () => {
  const user = [30, 1, 0x00, 1, 2, 0x01, 1, 0, 0, 0, 0x01, 2, 0, 0, 0];
  const seg = (th, d) => {
    const u = [th, ...d];
    const h = [0x05, 0x64, 5 + u.length, 0x44, 1, 0, 10, 0];
    const o = [...h, ...crc(h)];
    for (let i = 0; i < u.length; i += 16) { const bl = u.slice(i, i + 16); o.push(...bl, ...crc(bl)); }
    return Buffer.from(o);
  };
  const full = [0xc0, 0x81, 0, 0, ...user];
  const r = new Reassembler();
  const e1 = r.push(seg(0x40, full.slice(0, 9)));
  const e2 = r.push(seg(0x81, full.slice(9)));
  assert.strictEqual(e1[0].fragment, undefined);
  assert.deepStrictEqual([...e2[0].fragment], full);
  assert.strictEqual(parseApp(e2[0].fragment).points.get('ai:2').v, 2);
  // sin FIR y sin fragmento en curso: se descarta
  assert.strictEqual(new Reassembler().push(seg(0x01, full))[0].fragment, undefined);
});

test('fragmento truncado a mitad de g30v1: conserva lo previo, sin inventar puntos', () => {
  const f = new Reassembler().push(Buffer.from(FIX, 'hex')).find((e) => e.fragment).fragment;
  const i = f.indexOf(Buffer.from([30, 1, 0x00]));
  const a = parseApp(f.subarray(0, i + 5 + 5 + 5 + 2));
  assert.strictEqual(a.error, 'fragmento truncado');
  assert.strictEqual(a.points.has('ai:2'), false);
  assert.ok(a.points.has('bi:0') && a.points.has('ctr:0') && a.points.has('bo:0'));
});

test('rango g1v1 enorme con pocos datos: error y sin 65k puntos', () => {
  const a = parseApp(app([1, 1, 0x01, 0, 0, 0xff, 0xff, 0x05, 0x00]));
  assert.strictEqual(a.error, 'fragmento truncado');
  assert.strictEqual(a.points.size, 0);
});

test('segmento fuera de secuencia descarta el fragmento', () => {
  const seg = (th, d) => {
    const u = [th, ...d];
    const h = [0x05, 0x64, 5 + u.length, 0x44, 1, 0, 10, 0];
    return Buffer.from([...h, ...crc(h), ...u, ...crc(u)]);
  };
  const r = new Reassembler();
  r.push(seg(0x40 | 5, [0xc0, 0x81, 0, 0]));
  assert.strictEqual(r.push(seg(0x80 | 7, [1, 2]))[0].fragment, undefined);
});

// --- Pool / integrity contra outstation simulado (puerto libre) ---
const { start } = require('./helpers/outstation');
const { integrity, closeAll, getStats } = require('../src/dnp3');

const PTS = { 'ai:0': 12092, 'ai:1': -5, 'bi:2': true, 'bo:0': false, 'ctr:1': 8182, 'ao:3': 12181 };
async function conSim(opts, fn) {
  const sim = await start({ points: PTS, ...opts });
  const key = `127.0.0.1:${sim.port}`;
  try { await fn(sim, key); } finally { closeAll(); await sim.close(); }
}
const checkPts = (m) => {
  assert.ok(m instanceof Map);
  assert.deepStrictEqual([...m].map(([k, p]) => [k, p.v, p.online]).sort(),
    Object.entries(PTS).map(([k, v]) => [k, v, true]).sort());
};

test('integrity: lectura normal, solo READ class 0', () => conSim({}, async (sim) => {
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  assert.ok(sim.requests.length >= 1);
  for (const r of sim.requests) assert.ok(r.subarray(1).toString('hex').startsWith('01' + '3c0106'), r.toString('hex'));
}));

test('integrity: respuesta con CON -> confirm con la misma seq', () => conSim({ con: true }, async (sim) => {
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  await new Promise((r) => setTimeout(r, 50));
  const c = sim.requests.filter((r) => r[1] === 0x00);
  assert.strictEqual(c.length, 1);
  assert.strictEqual(c[0][0] & 0x0f, sim.requests[0][0] & 0x0f);
}));

test('integrity: no solicitado y link status no resuelven ni se confirman', () => conSim({ unsolicitedOnConnect: true }, async (sim) => {
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(sim.requests.filter((r) => r[1] === 0x00).length, 0);
}));

test('integrity: respuesta duplicada no contamina el siguiente pedido', () => conSim({ duplicate: true }, async (sim) => {
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
}));

test('integrity: silencio -> null en <= 5,5 s, desconectado, y reconecta', () => conSim({ silent: true }, async (sim, key) => {
  const t0 = Date.now();
  assert.strictEqual(await integrity('127.0.0.1', sim.port, 10, 1), null);
  assert.ok(Date.now() - t0 <= 5500);
  assert.strictEqual(getStats()[key].connected, false);
  assert.strictEqual(getStats()[key].errors, 1);
  const n = sim.requests.length;
  const t1 = Date.now();
  assert.strictEqual(await integrity('127.0.0.1', sim.port, 10, 1), null);
  assert.ok(sim.requests.length > n); // reconectó y volvió a pedir
  assert.ok(Date.now() - t1 <= 5500);
}));

test('integrity: simulador cerrado -> null sin excepción', async () => {
  const sim = await start({ points: PTS });
  const port = sim.port;
  await sim.close();
  try {
    assert.strictEqual(await integrity('127.0.0.1', port, 10, 1), null);
    assert.strictEqual(getStats()[`127.0.0.1:${port}`].connected, false);
  } finally { closeAll(); }
});

test('integrity: respuesta multifragmento (seq incrementa) devuelve todos los puntos', () => conSim({ fragments: 2, con: true }, async (sim) => {
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(sim.requests.filter((r) => r[1] === 0x00).length, 4); // un confirm por fragmento
}));

test('integrity: multifragmento con duplicado', () => conSim({ fragments: 2, duplicate: true }, async (sim) => {
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
}));

test('integrity: fragmento con error (objeto no soportado) -> null y cuenta error', () => conSim({ bad: true }, async (sim, key) => {
  assert.strictEqual(await integrity('127.0.0.1', sim.port, 10, 1), null);
  assert.strictEqual(getStats()[key].errors, 1);
  assert.strictEqual(getStats()[key].connected, false);
}));

test('closeAll con pedido en vuelo: null inmediato sin error; el siguiente pedido abre entrada nueva', () => conSim({ silent: true }, async (sim, key) => {
  const t0 = Date.now();
  const p = integrity('127.0.0.1', sim.port, 10, 1);
  const q = integrity('127.0.0.1', sim.port, 10, 1); // en cola
  await new Promise((r) => setTimeout(r, 100));
  closeAll();
  assert.strictEqual(await p, null);
  assert.strictEqual(await q, null);
  assert.ok(Date.now() - t0 < 1000);
  assert.strictEqual(getStats()[key], undefined);
}));

test('integrity: fragmento con error avisa una sola vez por conexión', () => conSim({ bad: true }, async (sim) => {
  const warn = console.warn, msgs = [];
  console.warn = (...a) => msgs.push(a.join(' '));
  try {
    assert.strictEqual(await integrity('127.0.0.1', sim.port, 10, 1), null);
    assert.strictEqual(await integrity('127.0.0.1', sim.port, 10, 1), null);
  } finally { console.warn = warn; }
  assert.strictEqual(msgs.length, 1);
  assert.match(msgs[0], /\[DNP3\].*outstation 10:.*lectura descartada/);
}));

test('integrity: respuesta duplicada con CON -> un solo confirm por integrity', () => conSim({ con: true, duplicate: true }, async (sim) => {
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(sim.requests.filter((r) => r[1] === 0x00).length, 1);
  checkPts(await integrity('127.0.0.1', sim.port, 10, 1));
  await new Promise((r) => setTimeout(r, 50));
  assert.strictEqual(sim.requests.filter((r) => r[1] === 0x00).length, 2);
}));
