'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/services/validate');

function plant() {
  return {
    pollIntervalMs: 2000,
    devices: Array.from({ length: 16 }, (_, i) => ({
      name: `IMBIL ${i + 1}`, type: 'SSW900', ip: '192.168.10.70', port: 502, unitId: i + 1,
      regOffset: 0, statusOffset: 679, gateway: 'ADAM', enabled: true,
    })),
    meters: Array.from({ length: 4 }, (_, i) => ({
      name: `PM ${i + 1}`, type: 'PM8000', ip: `192.168.10.${20 + i}`, port: 502, unitId: 1,
    })),
    gateways: [],
  };
}

const comm = (o = {}) => ({ name: 'Radio 1', tipo: 'airmax', ip: '192.168.10.20', community: 'public', enabled: true, ...o });
test('comms válidos y enlace en gateway, meter y comm', () => {
  const c = { ...plant(), comms: [comm(), comm({ name: 'Router', tipo: 'rut', ip: '192.168.10.1' })] };
  c.gateways = [{ name: 'ADAM', ip: '192.168.10.70', port: 502, kind: 'plc', enlace: 'Radio 1' }];
  c.meters[0].enlace = 'Radio 1';
  c.comms[0].enlace = 'Router';
  assert.deepEqual(validateConfig(c), []);
});
test('comms inválidos', () => {
  for (const bad of [{ tipo: 'mikrotik' }, { ip: '' }, { community: '' }, { community: 'x'.repeat(65) }, { name: '' }]) {
    assert.ok(validateConfig({ ...plant(), comms: [comm(bad)] }).length, JSON.stringify(bad));
  }
  assert.ok(validateConfig({ ...plant(), comms: [comm(), comm()] }).some(e => e.includes('duplicad')));
});
test('enlace a un comm inexistente o a sí mismo', () => {
  const c = { ...plant(), comms: [comm({ enlace: 'Radio 1' })] };
  assert.ok(validateConfig(c).length);
  const d = { ...plant(), comms: [comm()] }; d.meters[0].enlace = 'No existe';
  assert.ok(validateConfig(d).some(e => e.includes('No existe')));
});
test('variador con gateway no lleva enlace propio', () => {
  const c = { ...plant(), comms: [comm()] }; c.devices[0].enlace = 'Radio 1';
  assert.ok(validateConfig(c).length);
});
