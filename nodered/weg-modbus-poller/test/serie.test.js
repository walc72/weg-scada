'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSerie, crc16Palabras, armarPedido, decodificar, gatewaysPlc } = require('../src/serie');

test('CRC-16/MODBUS por bytes, byte alto primero (igual que el PLC)', () => {
  // "123456789" en bytes = 16#4B37; como palabras: 0x3132 0x3334 0x3536 0x3738 + byte 0x39 no entra
  assert.equal(crc16Palabras([0x1234, 1, 0, 0, 7]), 0x9be7);
  // referencia por bytes
  const porBytes = (bs) => { let c = 0xffff; for (const b of bs) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xa001 : c >>> 1; } return c; };
  assert.equal(porBytes([...'123456789'].map((x) => x.charCodeAt(0))), 0x4b37);
  assert.equal(crc16Palabras([0x3132, 0x3334, 0x3536, 0x3738]), porBytes([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38]));
});

test('el pedido lleva token, comando 1, destino 0 y un disparador distinto del actual', () => {
  const seq = [40 / 65535, 41 / 65535]; // 1.º da 41 (el actual), 2.º da 42
  let i = 0;
  const { campos, disparo } = armarPedido({ token: 7, usuario: 99, disparadorActual: 41, rnd: () => seq[i++] });
  assert.deepEqual(campos, [7, 1, 0, 0, 99]);
  assert.equal(disparo[0], 42); // saltó el 41 (el actual)
  assert.equal(disparo[1], crc16Palabras(campos));
});

test('decodifica el diagnóstico; sin programa nuevo no está disponible', () => {
  const d = decodificar([1, 3, 0, 12, 0, 60, 0, 1, 2, 5], [1, 0, 0, 0, 0]);
  assert.equal(d.disponible, true);
  assert.equal(d.reinicios, 3);
  assert.deepEqual(d.sinRefrescar, [0, 12, 0, 60]);
  assert.equal(d.motivoUltimo, 'automatico');
  assert.equal(d.minDesdeUltimo, 5);
  assert.equal(decodificar(new Array(10).fill(0), new Array(5).fill(0)).disponible, false);
  assert.equal(decodificar([1, 0, 0, 0, 0, 0, 0, 0, 0, 0xffff], [1, 0, 0, 0, 0]).minDesdeUltimo, null);
});

test('gateways de PLC = los que tienen equipos con slot', () => {
  const cfg = { gateways: [{ name: 'PLC' }, { name: 'ADAM' }], devices: [{ name: 'SAER 5', gateway: 'PLC', slot: 1 }, { name: 'IMBIL 4', gateway: 'ADAM' }] };
  assert.deepEqual(gatewaysPlc(cfg).map((g) => g.name), ['PLC']);
});

// PLC simulado: ejecuta Vigilancia_Serial en la escritura del disparador
function plcFalso({ version = 1, responde = true, rechazo = 0 } = {}) {
  const mw = new Array(500).fill(0);
  mw[330] = 1; mw[407] = version;
  const escrituras = [];
  return {
    mw, escrituras, isOpen: true,
    async readHoldingRegisters(a, n) { return { data: mw.slice(a, a + n) }; },
    async writeRegisters(a, vals) {
      escrituras.push([a, [...vals]]);
      vals.forEach((v, i) => { mw[a + i] = v; });
      if (a === 405 && responde) {
        const ok = crc16Palabras(mw.slice(400, 405)) === mw[406];
        mw[409] = !ok ? 3 : rechazo ? 2 : 1; mw[410] = rechazo; mw[411] = rechazo === 3 ? 20 : 0;
        mw[408] = mw[400];
      }
    },
    close() {},
  };
}
const sinEspera = { esperar: async () => {} };

test('reiniciar: dos FC16 en orden (campos, después disparador+CRC) y espera el eco', async () => {
  const plc = plcFalso();
  const s = createSerie({ conectar: async () => plc, ...sinEspera });
  const r = await s.reiniciar({ ip: 'x' }, 'admin');
  assert.deepEqual(r, { ok: true });
  assert.equal(plc.escrituras.length, 2);
  assert.equal(plc.escrituras[0][0], 400);
  assert.equal(plc.escrituras[0][1].length, 5);
  assert.equal(plc.escrituras[1][0], 405);
  assert.notEqual(plc.escrituras[1][1][0], 0);
});

test('reiniciar: rechazo del PLC con motivo y espera', async () => {
  const s = createSerie({ conectar: async () => plcFalso({ rechazo: 3 }), ...sinEspera });
  const r = await s.reiniciar({ ip: 'x' }, 'admin');
  assert.equal(r.ok, false);
  assert.match(r.error, /muy poco/);
  assert.equal(r.espera, 20);
});

test('reiniciar: sin canal en el PLC no escribe nada', async () => {
  const plc = plcFalso({ version: 0 });
  const s = createSerie({ conectar: async () => plc, ...sinEspera });
  const r = await s.reiniciar({ ip: 'x' }, 'admin');
  assert.equal(r.ok, false);
  assert.equal(plc.escrituras.length, 0);
});

test('reiniciar: sin eco avisa que el PLC no respondió', async () => {
  const s = createSerie({ conectar: async () => plcFalso({ responde: false }), ...sinEspera });
  const r = await s.reiniciar({ ip: 'x' }, 'admin');
  assert.deepEqual(r, { ok: false, error: 'El PLC no respondió el pedido' });
});
