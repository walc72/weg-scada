'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const configService = require('../src/services/config');
const alerts = require('../src/services/alerts');

test('evaluate ignora equipos fuera de licencia (sin falsa "Comunicacion perdida")', () => {
  const origGet = configService.get;
  configService.get = () => ({ alarmSetpoints: { defaults: {}, overrides: {} } });
  const n0 = alerts.getHistory().length;
  try {
    configService.deviceStates.set('P1', { name: 'P1', online: true, type: 'CFW900' });
    alerts.evaluate();
    configService.deviceStates.set('P1', { name: 'P1', online: false, license: 'excedido' });
    alerts.evaluate();
    configService.deviceStates.set('P1', { name: 'P1', online: true, type: 'CFW900' });
    alerts.evaluate();
    assert.equal(alerts.getHistory().length, n0);
  } finally { configService.get = origGet; configService.deviceStates.delete('P1'); }
});
