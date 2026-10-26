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

test('sin comunicación con sinEnlace: texto «Sin enlace», un evento text y un solo intervalo', () => {
  assert.equal(activeAlarms({ online: false, sinEnlace: 'Radio 1' }).SIN_COMUNICACION, 'Sin enlace (Radio 1)');
  const open = new Map();
  const ev = [];
  ev.push(...step(open, new Map([['A', { online: true }]]), 1));
  ev.push(...step(open, new Map([['A', { online: false }]]), 2));
  const t = step(open, new Map([['A', { online: false, sinEnlace: 'Radio 1' }]]), 3);
  assert.deepEqual(t.map((e) => e.status), ['text']);
  ev.push(...t);
  ev.push(...step(open, new Map([['A', { online: true }]]), 4));
  assert.deepEqual(ev.map((e) => e.status), ['start', 'text', 'end']);
  assert.equal(ev[0].text, 'Comunicación perdida');
  const iv = toIntervals(ev);
  assert.equal(iv.length, 1);
  assert.equal(iv[0].text, 'Sin enlace (Radio 1)');
  assert.equal(iv[0].end, 4);
});
