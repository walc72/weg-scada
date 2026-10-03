'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseCFW900 } = require('../src/parser');
const { codeLabel, codesText } = require('../src/cfwCodes');

const dev = { name: 'SAER 2', type: 'CFW900', ip: '192.168.10.101', site: 'Agriplus' };
const regs = (set) => { const r = new Array(70).fill(0); for (const [i, v] of Object.entries(set)) r[i] = v; return r; };

test('codeLabel pads to 3 digits and adds the manual name', () => {
  assert.equal(codeLabel('A', 110), 'A110 Temperatura Motor Alta');
  assert.equal(codeLabel('F', 71), 'F071 Sobrecorr. en la Salida');
  assert.equal(codeLabel('F', 9999), 'F9999');
  assert.equal(codesText('A', [46, 0, 110, 0, 0]), 'A046 Carga Alta en el Motor / A110 Temperatura Motor Alta');
});

// Caso real SAER 2 (WPS: D2.1.1 Alarma 1 = 110) en marcha a 705 A.
test('regs[50..54] are current alarms: running drive with A110', () => {
  const d = parseCFW900(regs({ 6: 1, 3: 7049, 50: 110 }), dev, null);
  assert.equal(d.running, true);
  assert.equal(d.hasAlarm, true);
  assert.equal(d.alarmText, 'A110 Temperatura Motor Alta');
  assert.equal(d.hasFault, false);
  assert.equal(d.fault, false);
  assert.equal(d.faultText, 'Sin Falla');
});

// Caso real SAER 4: estado 3 (protección), 0 A, y 71 en regs[60].
test('regs[60..64] are current protections: tripped drive with F071', () => {
  const d = parseCFW900(regs({ 6: 3, 60: 71 }), dev, null);
  assert.equal(d.hasFault, true);
  assert.equal(d.fault, true);
  assert.equal(d.faultText, 'F071 Sobrecorr. en la Salida');
  assert.equal(d.hasAlarm, false);
});
