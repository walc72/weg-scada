'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-time-'));
process.env.CONFIG_PATH = path.join(DIR, 'config.json');
process.env.DAILY_REPORT_HOUR = '7';

const test = require('node:test');
const assert = require('node:assert/strict');
const settings = require('../src/services/settings');
const manual = require('../src/services/manual');

const reset = () => { try { fs.unlinkSync(settings.SETTINGS_PATH); } catch { /* no existe */ } };

test('sin configurar usa DAILY_REPORT_HOUR del .env', () => {
  reset();
  assert.deepEqual(settings.getDailyReport(), { hour: 7, minute: 0, time: '07:00', fromEnv: true });
});

test('guarda HH:MM y valida el formato', () => {
  reset();
  assert.deepEqual(settings.setDailyReport({ time: '5:30' }), { hour: 5, minute: 30, time: '05:30', fromEnv: false });
  assert.equal(settings.getDailyReport().time, '05:30');
  for (const bad of ['24:00', '12:60', 'abc', '', '7']) {
    assert.throws(() => settings.setDailyReport({ time: bad }), /Hora inválida/);
  }
  assert.equal(settings.getDailyReport().time, '05:30'); // un valor inválido no pisa el guardado
});

test('el cierre de la carga manual sigue la hora de envío', () => {
  reset();
  settings.setDailyReport({ time: '08:15' });
  const c = manual.closeTime('2026-10-01');
  assert.deepEqual([c.getDate(), c.getHours(), c.getMinutes()], [2, 8, 15]);
});
