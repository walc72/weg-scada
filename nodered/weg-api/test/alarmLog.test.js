'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { step, toIntervals, toLine, activeAlarms } = require('../src/services/alarmLog');

const saer5 = (extra) => ['SAER 5', { name: 'SAER 5', type: 'SSW900', online: true, current: 747, spCurrentHigh: 745, ...extra }];

test('step registra inicio y fin de cada alarma una sola vez', () => {
  const open = new Map();
  const on = new Map([saer5({ alarmCurrentHigh: true })]);
  assert.deepEqual(step(open, on, 1000), [
    { device: 'SAER 5', type: 'CORRIENTE_ALTA', status: 'start', text: 'Corriente alta 747A (>745)', ts: 1000 },
  ]);
  assert.deepEqual(step(open, on, 6000), []);
  const off = new Map([saer5({ alarmCurrentHigh: false })]);
  assert.deepEqual(step(open, off, 11000).map(e => [e.type, e.status, e.ts]), [['CORRIENTE_ALTA', 'end', 11000]]);
});

test('sin comunicación reemplaza a las demás y un equipo que desaparece cierra lo suyo', () => {
  const open = new Map();
  step(open, new Map([saer5({ hasFault: true, faultText: 'F030' })]), 1);
  const ev = step(open, new Map([saer5({ online: false, hasFault: true })]), 2);
  assert.deepEqual(ev.map(e => [e.type, e.status]), [['SIN_COMUNICACION', 'start'], ['FALLA', 'end']]);
  assert.deepEqual(step(open, new Map(), 3).map(e => [e.type, e.status]), [['SIN_COMUNICACION', 'end']]);
  assert.deepEqual(activeAlarms({ online: true, license: 'ok' }), {});
});

test('toIntervals empareja, tolera start repetido y end huérfano, deja abiertas con end null', () => {
  const ev = [
    { device: 'A', type: 'FALLA', status: 'end', text: 'x', ts: 1 },
    { device: 'A', type: 'FALLA', status: 'start', text: 'x', ts: 2 },
    { device: 'A', type: 'FALLA', status: 'start', text: 'x', ts: 3 },
    { device: 'A', type: 'FALLA', status: 'end', text: 'x', ts: 5 },
    { device: 'B', type: 'TEMP_ALTA', status: 'start', text: 'y', ts: 4 },
  ];
  assert.deepEqual(toIntervals(ev), [
    { device: 'A', type: 'FALLA', text: 'x', start: 2, end: 5 },
    { device: 'B', type: 'TEMP_ALTA', text: 'y', start: 4, end: null },
  ]);
});

test('toLine escapa tags y textos', () => {
  assert.equal(
    toLine({ device: 'SAER 5', type: 'FALLA', status: 'start', text: 'F "a", b\\c', ts: 7 }),
    'alarm_events,device=SAER\\ 5,type=FALLA status="start",text="F \\"a\\", b\\\\c" 7'
  );
});
