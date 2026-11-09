'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const T = require('../src/services/tarifas');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tarifas-')), 'tarifas.json');
const punta = (extra = {}) => ({ nombre: 'Punta', precioKwh: 331.93, tramos: [{ dias: [1, 2, 3, 4, 5, 6], desde: 18, hasta: 22 }], ...extra });
const version = (desde = '2024-11-26', franjas = [punta()]) => ({
  desde, franjas, resto: { nombre: 'Fuera de punta', precioKwh: 144.83 },
  potencia: { modo: 'unica', reservadaKw: 800, precioKw: 41126, precioExcesoKw: 87533 },
});
const tarifa = (nombre = 'ANDE 412 Línea MT', versiones = [version()]) => ({ id: 't-lq3k9a1x', nombre, versiones });
const archivo = (extra = {}) => ({ moneda: 'Gs', tarifas: [tarifa()], asignacion: {}, ...extra });

test('leer: falta o JSON roto → VACIO', () => {
  const f = tmp();
  assert.deepEqual(T.leer(f), T.VACIO);
  fs.writeFileSync(f, '{roto');
  assert.deepEqual(T.leer(f), T.VACIO);
});

test('leer conserva un archivo que no valida (no lo vuelve VACIO)', () => {
  const f = tmp();
  const malo = archivo({ tarifas: [tarifa('A', [version('2024-11-26', [punta(), punta({ nombre: 'Otra' })])])] });
  fs.writeFileSync(f, JSON.stringify(malo));
  assert.deepEqual(T.leer(f), malo);
  assert.throws(() => T.validar(malo), /se superpone/);
});

test('validar acepta la 412 y ordena versiones por desde', () => {
  const r = T.validar(archivo({ tarifas: [tarifa('412', [version('2024-11-26'), version('2024-01-01')])] }));
  assert.deepEqual(r.tarifas[0].versiones.map((v) => v.desde), ['2024-01-01', '2024-11-26']);
  assert.equal(r.tarifas[0].id, 't-lq3k9a1x');
  assert.equal(r.moneda, 'Gs');
});

test('validar genera id si falta o es inválido', () => {
  const r = T.validar(archivo({ tarifas: [{ ...tarifa(), id: 'x' }] }));
  assert.match(r.tarifas[0].id, /^t-[a-z0-9]{4,20}$/);
});

test('validar rechaza datos inválidos', () => {
  const v = (f) => () => T.validar(f);
  const conFranjas = (franjas) => archivo({ tarifas: [tarifa('A', [version('2024-11-26', franjas)])] });
  assert.throws(v(conFranjas([punta(), punta({ nombre: 'Sab', tramos: [{ dias: [6], desde: 17, hasta: 19 }] })])), /se superpone/);
  assert.throws(v(archivo({ tarifas: [tarifa('A', [version('2024-01-01'), version('2024-01-01')])] })), /versión repetida/);
  assert.throws(v(conFranjas([punta({ tramos: [{ dias: [1], desde: 18, hasta: 25 }] })])), /hora/);
  assert.throws(v(conFranjas([punta({ tramos: [{ dias: [], desde: 18, hasta: 22 }] })])), /días/);
  assert.throws(v(archivo({ tarifas: [tarifa('Ande'), { ...tarifa('ANDE'), id: 't-otra1' }] })), /ya existe/);
  assert.throws(v(archivo({ asignacion: { Agriplus: { tarifa: 't-noexiste', medidor: null } } })), /tarifa inexistente/);
  const muchas = Array.from({ length: 21 }, (_, i) => ({ ...tarifa('T' + i), id: 't-id' + (1000 + i) }));
  assert.throws(v(archivo({ tarifas: muchas })), /20 tarifas/);
  assert.throws(v(conFranjas([punta({ precioKwh: -1 })])), /precio/);
});

test('validar recorta claves de asignación', () => {
  const r = T.validar(archivo({ asignacion: { ' Agriplus ': { tarifa: 't-lq3k9a1x', medidor: 'PM1' } } }));
  assert.deepEqual(Object.keys(r.asignacion), ['Agriplus']);
});

test('versionVigente', () => {
  const t = { versiones: [{ desde: '2024-01-01' }, { desde: '2024-11-26' }] };
  assert.equal(T.versionVigente(t, '2024-11-25').desde, '2024-01-01');
  assert.equal(T.versionVigente(t, '2024-11-26').desde, '2024-11-26');
  assert.equal(T.versionVigente(t, '2023-12-31'), null);
});

test('franjaDe: local, desde incluido y hasta excluido', () => {
  const v = version();
  assert.equal(T.franjaDe(v, new Date(2026, 10, 7, 18).getTime()), 0); // sábado
  assert.equal(T.franjaDe(v, new Date(2026, 10, 7, 22).getTime()), -1);
  assert.equal(T.franjaDe(v, new Date(2026, 10, 8, 20).getTime()), -1); // domingo
  assert.equal(T.franjaDe(v, new Date(2026, 10, 9, 21).getTime()), 0); // lunes
});

test('fechaLocal', () => {
  assert.equal(T.fechaLocal(new Date(2026, 10, 7, 23, 59).getTime()), '2026-11-07');
});

test('guardar y leer devuelven lo mismo', () => {
  const f = tmp();
  const g = T.guardar(archivo(), f);
  assert.deepEqual(T.leer(f), g);
});
