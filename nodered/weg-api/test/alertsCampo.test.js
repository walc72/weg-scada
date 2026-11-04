'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const configService = require('../src/services/config');
const alerts = require('../src/services/alerts');

// Corre una secuencia de estados (_t: ms desde el inicio) y devuelve las líneas [ALERT] de notify
function run(name, estados) {
  const t0 = Date.now();
  const origGet = configService.get;
  const origLog = console.log;
  const logs = [];
  console.log = (...a) => { if (String(a[0]).startsWith('[ALERT]')) logs.push(String(a[0])); };
  configService.get = () => ({ alarmSetpoints: { defaults: {}, overrides: {} } });
  try {
    for (const { _t = 0, ...e } of estados) {
      configService.deviceStates.set(name, { name, kind: 'reco', ...e });
      alerts.evaluate(t0 + _t);
    }
  } finally { console.log = origLog; configService.get = origGet; configService.deviceStates.delete(name); }
  return logs;
}

test('alarma nueva avisa con type=clave y al desaparecer avisa Resuelta', () => {
  const logs = run('RC1', [
    { online: true, alarmas: {} },
    { online: true, alarmas: { ALARMA_5: 'Temp aceite' } },
    { online: true, alarmas: { ALARMA_5: 'Temp aceite' } },
    { online: true, alarmas: {} },
  ]);
  assert.equal(logs.length, 2);
  assert.match(logs[0], /RC1 — ALARMA_5: Temp aceite/);
  assert.match(logs[1], /RC1 — ALARMA_5: Resuelta/);
});

test('offline no resuelve alarmas; al volver online sin la clave recién ahí Resuelta', () => {
  const logs = run('RC2', [
    { online: true, alarmas: {} },
    { online: true, alarmas: { DISPARO: 'Disparo' } },
    { online: false, valores: {}, alarmas: {} },
    { online: false, valores: {}, alarmas: {}, _t: alerts.OFFLINE_DELAY_MS },
    { online: true, alarmas: {}, _t: alerts.OFFLINE_DELAY_MS + 1 },
  ]);
  assert.match(logs[0], /DISPARO: Disparo/);
  assert.match(logs[1], /OFFLINE/);
  assert.match(logs[2], /OFFLINE: Reconectado|DISPARO: Resuelta/);
  assert.equal(logs.filter(l => /DISPARO: Resuelta/.test(l)).length, 1);
  assert.equal(logs.findIndex(l => /DISPARO: Resuelta/.test(l)) > logs.findIndex(l => /OFFLINE:/.test(l)), true);
  assert.equal(logs.length, 4);
});

test('un corte más corto que OFFLINE_DELAY_MS no avisa ni manda Reconectado', () => {
  const logs = run('RC3', [
    { online: true, alarmas: {} },
    { online: false, alarmas: {} },
    { online: false, alarmas: {}, _t: alerts.OFFLINE_DELAY_MS - 1000 },
    { online: true, alarmas: {}, _t: alerts.OFFLINE_DELAY_MS },
  ]);
  assert.deepEqual(logs, []);
});

test('fuera de servicio no avisa, ni al entrar ni al salir', () => {
  const logs = run('RC4', [
    { online: true, alarmas: {} },
    { online: false, fueraServicio: true },
    { online: false, fueraServicio: true, _t: alerts.OFFLINE_DELAY_MS * 2 },
    { online: true, alarmas: {}, _t: alerts.OFFLINE_DELAY_MS * 2 + 1 },
  ]);
  assert.deepEqual(logs, []);
});
