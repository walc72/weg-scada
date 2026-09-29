'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { offlineState } = require('../src/offline');

const dev = { name: 'SAER 1', type: 'CFW900', ip: '192.168.10.100', site: 'Agriplus' };

// Caso real (2026-09-29): SAER 1 perdió comunicación estando en protección con
// A71 y la tarjeta mostraba "sin conexión" + FALLA + ALARMA A71 congelados.
test('a drive that goes offline does not keep its last fault/alarm/running state', () => {
  const prev = {
    ...dev, online: true, running: true, ready: false, fault: true, hasFault: true,
    faultText: 'F110', hasAlarm: true, alarmText: 'A71', stateCode: 3, statusText: 'PROTECTION',
    current: 700, frequency: 53.6, power: 390, igbtTemp: 70,
    nominalCurrent: 740, nominalVoltage: 500, nominalFreq: 70,
    hoursEnergized: '4770.1', hoursEnabled: '3648.7'
  };
  const d = offlineState(dev, prev);
  assert.equal(d.online, false);
  assert.equal(d.running, false);
  assert.equal(d.ready, false);
  assert.equal(d.fault, false);
  assert.equal(d.hasFault, false);
  assert.equal(d.hasAlarm, false);
  assert.equal(d.faultText, '');
  assert.equal(d.alarmText, '');
  assert.equal(d.stateCode, 0);
  assert.equal(d.statusText, 'OFFLINE');
  assert.equal(d.current, 0);
  assert.equal(d.power, 0);
  assert.equal(d.igbtTemp, undefined);
  // Placa y totalizadores se conservan
  assert.equal(d.nominalCurrent, 740);
  assert.equal(d.hoursEnergized, '4770.1');
  assert.equal(d.hoursEnabled, '3648.7');
});

test('offline stub without previous state uses defaults', () => {
  const d = offlineState({ ...dev, type: 'SSW900' }, undefined);
  assert.equal(d.online, false);
  assert.equal(d.hasFault, false);
  assert.equal(d.nominalFreq, 0);
  assert.equal(d.hoursEnergized, '-');
});
