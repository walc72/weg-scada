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

test('OFFLINE con sinEnlace dice "Sin enlace (<comm>)"', () => {
  const origGet = configService.get;
  configService.get = () => ({ alarmSetpoints: { defaults: {}, overrides: {} } });
  try {
    configService.deviceStates.set('P2', { name: 'P2', online: true, type: 'CFW900' });
    alerts.evaluate();
    configService.deviceStates.set('P2', { name: 'P2', online: false, sinEnlace: 'Radio 1', type: 'CFW900' });
    alerts.evaluate();
    const a = alerts.getHistory().find(h => h.device === 'P2' && h.type === 'OFFLINE' && h.status === 'alarm');
    assert.equal(a.text, 'Sin enlace (Radio 1)');
  } finally { configService.get = origGet; configService.deviceStates.delete('P2'); }
});

test('sinEnlace posterior al offline reescribe la alarma vigente sin notificar de nuevo', () => {
  const origGet = configService.get;
  const origLog = console.log;
  let notifs = 0;
  console.log = (...a) => { if (String(a[0]).startsWith('[ALERT]')) notifs++; };
  configService.get = () => ({ alarmSetpoints: { defaults: {}, overrides: {} } });
  const find = () => alerts.getHistory().filter(h => h.device === 'P3' && h.type === 'OFFLINE');
  try {
    configService.deviceStates.set('P3', { name: 'P3', online: true, type: 'CFW900' });
    alerts.evaluate();
    configService.deviceStates.set('P3', { name: 'P3', online: false, type: 'CFW900' });
    alerts.evaluate();
    assert.equal(find()[0].text, 'Comunicacion perdida');
    const n = alerts.getHistory().length;
    const n1 = notifs;
    configService.deviceStates.set('P3', { name: 'P3', online: false, sinEnlace: 'Radio 1', type: 'CFW900' });
    alerts.evaluate();
    assert.equal(find().length, 1);
    assert.equal(find()[0].text, 'Sin enlace (Radio 1)');
    assert.equal(alerts.getHistory().length, n);
    assert.equal(notifs, n1);
  } finally { console.log = origLog; configService.get = origGet; configService.deviceStates.delete('P3'); }
});
