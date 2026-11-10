'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../src/services/informes');

const H0 = new Date(2026, 10, 7, 0).getTime();
const horas = (n, v) => Array(n).fill(v);
const punta = { nombre: 'Punta', precioKwh: 331.93, tramos: [{ dias: [1, 2, 3, 4, 5, 6], desde: 18, hasta: 22 }] };
const archivo = {
  moneda: 'Gs',
  tarifas: [{ id: 't-lq3k9a1x', nombre: '412', versiones: [{
    desde: '2024-11-26', franjas: [punta], resto: { nombre: 'Fuera de punta', precioKwh: 144.83 },
    potencia: { modo: 'unica', reservadaKw: 800, precioKw: 41126, precioExcesoKw: 87533 },
  }] }],
  asignacion: { Agriplus: { tarifa: 't-lq3k9a1x', medidor: 'PM1' } },
};
const kwMaxHora = horas(24, 500); kwMaxHora[19] = 900;
const s = {
  horaInicio: H0, totals: {},
  drives: [{ name: 'B1', kwhHora: horas(24, 10) }],
  meters: [{ name: 'PM1', kwhHora: horas(24, 10), kwMaxHora, energyKwh: 240, energySource: 'integrada', stats: { pf: { avg: 0.9 } } }],
};
const ctx = { tarifas: archivo, sitioDe: () => 'Agriplus' };

test('sin tarifas → solo la nota', () => {
  const p = I._bCostos(s, { ...ctx, tarifas: { moneda: 'Gs', tarifas: [], asignacion: {} } });
  assert.equal(p.length, 1);
  assert.match(p[0].nota, /^Sin tarifas cargadas/);
});

test('un sitio: kpis, tablas y notas', () => {
  const p = I._bCostos(s, ctx);
  assert.equal(p[0].kpis.length, 3);
  assert.equal(p[0].kpis[2].label, 'Gs/kWh MEDIO');
  assert.equal(p[1].tabla.titulo, 'Por sitio');
  assert.deepEqual(p[1].tabla.columnas.map((c) => c.label),
    ['Sitio', 'Tarifa', 'Punta kWh', 'Punta Gs', 'Fuera de punta kWh', 'Fuera de punta Gs', 'Potencia reservada', 'Exceso', 'Total', 'FP medio']);
  assert.equal(p[1].tabla.filas[0][0], 'Agriplus');
  assert.equal(p[2].tabla.titulo, 'Por bomba');
  assert.deepEqual(p[2].tabla.filas[0].slice(0, 2), ['B1', 'Agriplus']);
  assert.ok(p.some((x) => x.nota && /^Mes parcial/.test(x.nota)));
});

test('por bomba muestra el nombre visible del equipo', () => {
  const p = I._bCostos(s, { ...ctx, nombre: (n) => (n === 'B1' ? 'Bomba 1' : n) });
  assert.equal(p[2].tabla.filas[0][0], 'Bomba 1');
});

test('con volumen agrega Gs/L', () => {
  const p = I._bCostos({ ...s, totals: { volumeM3: 100 } }, ctx);
  assert.equal(p[0].kpis[3].label, 'Gs/L');
  assert.equal(p[0].kpis[3].dec, 4);
});

test('plantilla costos de fábrica', () => {
  const c = I.listarPlantillas().find((x) => x.id === 'costos');
  assert.equal(c.fabrica, true);
  assert.deepEqual(c.bloques, ['costos']);
});

test('plantillas de fábrica: ningún bloque se repite entre plantillas', () => {
  const todos = I.PLANTILLAS.flatMap((p) => p.bloques);
  assert.equal(new Set(todos).size, todos.length);
});
