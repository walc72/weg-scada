'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/services/validate');

const saer = (name, slot, extra = {}) => ({
  name, type: 'SSW900', ip: '192.168.10.40', port: 502, unitId: 1, gateway: 'PLC', slot, enabled: true, ...extra,
});
const cfg = (...devices) => ({ devices, gateways: [{ name: 'PLC', ip: '192.168.10.40', port: 502, kind: 'plc', slots: [] }] });

test('rechaza dos equipos activos en el mismo slot del mismo gateway', () => {
  const errs = validateConfig(cfg(saer('SAER 5', 2), saer('SAER 6', 2)));
  assert.deepEqual(errs, ['SAER 5 y SAER 6 usan el mismo slot 2 de PLC']);
});

test('slots distintos, un deshabilitado o sin slot no chocan', () => {
  assert.deepEqual(validateConfig(cfg(saer('SAER 5', 2), saer('SAER 8', 3))), []);
  assert.deepEqual(validateConfig(cfg(saer('SAER 5', 2), saer('SAER 6', 2, { enabled: false }))), []);
  assert.deepEqual(validateConfig(cfg(saer('SAER 5', 2), saer('SAER 6', undefined, { enabled: false }))), []);
});
