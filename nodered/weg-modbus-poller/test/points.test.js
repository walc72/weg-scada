'use strict';
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const ModbusRTU = require('modbus-serial');
const connections = require('../src/connections');
const { blocks, decode, readPoints, valoresDe, alarmasDe, campoLine } = require('../src/points');

after(() => connections.closeAll());

const f32 = (v, le) => {
  const b = Buffer.alloc(4); b.writeFloatBE(v);
  const w = [b.readUInt16BE(0), b.readUInt16BE(2)];
  return le ? w.reverse() : w;
};

test('decode: tipos, orden, escala, bit, valor', () => {
  assert.equal(decode({ addr: 0, tipo: 'u16' }, [65535], 0), 65535);
  assert.equal(decode({ addr: 0, tipo: 's16' }, [0xFFFF], 0), -1);
  assert.equal(decode({ addr: 0, tipo: 'u32' }, [1, 0], 0), 65536);
  assert.equal(decode({ addr: 0, tipo: 'u32', orden: 'LE' }, [0, 1], 0), 65536);
  assert.equal(decode({ addr: 0, tipo: 's32' }, [0xFFFF, 0xFFFE], 0), -2);
  assert.equal(decode({ addr: 0, tipo: 'f32' }, f32(850.5), 0), 850.5);
  assert.equal(decode({ addr: 0, tipo: 'f32', orden: 'LE' }, f32(850.5, true), 0), 850.5);
  assert.equal(decode({ addr: 0, tipo: 'f32' }, [0x7FC0, 0], 0), null);
  assert.ok(Math.abs(decode({ addr: 0, tipo: 'u16', escala: 0.1 }, [2305], 0) - 230.5) < 1e-9);
  assert.equal(decode({ addr: 0, tipo: 'u16', bit: 1 }, [0b10], 0), true);
  assert.equal(decode({ addr: 0, tipo: 'u16', bit: 1 }, [0b01], 0), false);
  assert.equal(decode({ addr: 0, tipo: 'u16', valor: 1 }, [1], 0), true);
  assert.equal(decode({ addr: 5, tipo: 'u16' }, [1, 2], 0), null);
  assert.equal(decode({ addr: 3, tipo: 'u16' }, [7, 8, 9, 10], 2), 8);
});

test('blocks', () => {
  assert.deepEqual(blocks([{ addr: 0 }, { addr: 1 }, { addr: 5, tipo: 'f32' }]),
    [{ fc: 3, start: 0, count: 7, idx: [0, 1, 2] }]);
  assert.equal(blocks([{ addr: 0 }, { addr: 10 }]).length, 2); // hueco 9
  assert.equal(blocks([{ addr: 0 }, { addr: 9 }]).length, 1);  // hueco 8
  const seg = Array.from({ length: 130 }, (_, i) => ({ addr: i }));
  const b = blocks(seg);
  assert.equal(b.length, 2);
  assert.equal(b[0].count, 125);
  assert.equal(blocks([{ addr: 0, fc: 3 }, { addr: 0, fc: 4 }]).length, 2);
  // mismo registro
  assert.deepEqual(blocks([{ key: 'auto', addr: 4, bit: 0 }, { key: 'remoto', addr: 4, bit: 1 }]),
    [{ fc: 3, start: 4, count: 1, idx: [0, 1] }]);
});

test('readPoints: bloque fallido y offline', async () => {
  const item = { ip: 'x', mapa: [{ addr: 0, tipo: 'u16' }, { addr: 100, tipo: 'u16' }] };
  const r = await readPoints(item, async (_i, _p, _u, s) => (s === 0 ? [7] : null));
  assert.deepEqual(r, { online: true, vals: [7, null] });
  const r2 = await readPoints(item, async () => null);
  assert.deepEqual(r2, { online: false, vals: [null, null] });
});

test('readPoints por unitId', async () => {
  const poll = async (_i, _p, unit) => (unit === 4 ? null : [1]);
  const mk = (unitId) => ({ ip: 'x', unitId, mapa: [{ addr: 0, tipo: 'u16' }] });
  assert.equal((await readPoints(mk(4), poll)).online, false);
  assert.equal((await readPoints(mk(3), poll)).online, true);
});

test('alarmasDe y valoresDe', () => {
  const mapa = [{ key: 'disparo' }, { key: 'bloqueo' }, { key: 'ia' }, { key: 'x' }, { key: 'y' },
    { key: 'alarma', texto: 'Tap' }, { key: 'alarma', texto: 'Otra' }, { key: 'alarma', texto: 'Nula' }];
  const vals = [true, true, 1, 0, 0, true, false, null];
  assert.deepEqual(alarmasDe('reco', mapa, vals), { DISPARO: 'Disparo', BLOQUEO: 'Bloqueado', ALARMA_5: 'Tap' });
  assert.deepEqual(alarmasDe('reg', mapa, vals), { ALARMA_5: 'Tap' });
  assert.deepEqual(valoresDe(mapa, vals), { disparo: true, bloqueo: true, ia: 1, x: 0, y: 0 });
});

test('campoLine', () => {
  assert.equal(campoLine({ name: 'Reco, 1', kind: 'reco', valores: { ia: 112.4, estado: true, ib: null } }, 1n),
    'campo_data,name=Reco\\,\\ 1,kind=reco ia=112.4,estado=1i 1');
  assert.equal(campoLine({ name: 'a', kind: 'reg', valores: { v: null } }, 1), null);
});

test('esclavo falso de punta a punta', async () => {
  const f = f32(850.5);
  const vector = {
    getHoldingRegister: (a) => (a === 10 ? f[0] : a === 11 ? f[1] : 0),
    getInputRegister: (a) => (a === 3 ? 42 : 0),
  };
  // ServerTCP toma `port || 8502`: port 0 no sirve. Se pide un puerto libre antes.
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
  const server = new ModbusRTU.ServerTCP(vector, { host: '127.0.0.1', port, unitID: 1 });
  await new Promise((r, j) => { server.on('initialized', r); server.on('serverError', j); });
  try {
    const item = { ip: '127.0.0.1', port, unitId: 1,
      mapa: [{ addr: 10, tipo: 'f32', fc: 3 }, { addr: 3, tipo: 'u16', fc: 4 }] };
    const r = await readPoints(item, connections.poll);
    assert.deepEqual(r, { online: true, vals: [850.5, 42] });
  } finally {
    connections.closeAll();
    await new Promise((r) => server.close(r));
  }
});
