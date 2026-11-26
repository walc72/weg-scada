'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'demanda-'));
process.env.CONFIG_PATH = path.join(dir, 'config.json');
const demanda = require('../src/services/demanda');
const informes = require('../src/services/informes');

const T0 = Date.parse('2026-11-20T12:00:00Z');  // mediodía: mismo día local en cualquier huso
const B = (min, name, kw) => ({ _time: new Date(T0 + min * 60000).toISOString(), name, kw });

test('estadoEn: último cambio; antes del primero, lo contrario; sin cambios, el actual', () => {
  const c = [{ fecha: new Date(T0 + 3600e3).toISOString(), cerrado: true }, { fecha: new Date(T0 + 7200e3).toISOString(), cerrado: false }];
  assert.equal(demanda.estadoEn(c, T0, false), false);           // antes del primero (cerró a la hora 1)
  assert.equal(demanda.estadoEn(c, T0 + 3600e3, false), true);
  assert.equal(demanda.estadoEn(c, T0 + 5000e3, false), true);
  assert.equal(demanda.estadoEn(c, T0 + 8000e3, true), false);
  assert.equal(demanda.estadoEn([], T0, true), true);
});

test('totalPorBloque: suma coincidente, solo A con el seccionador cerrado, sin bloques incompletos', () => {
  const rows = [
    B(0, 'A', 100), B(0, 'B', 50),     // abierto: 150
    B(15, 'A', 120),                   // falta B y suma: no cuenta
    B(30, 'A', 130), B(30, 'B', 60),   // cerrado: solo A = 130
    B(45, 'A', 90), B(45, 'B', 40),    // bloque en curso (termina después de stop): no cuenta
    B(0, 'C', 999),                    // otro medidor
  ];
  const cerrado = (t) => t === T0 + 30 * 60000;
  const tot = demanda.totalPorBloque(rows, 'A', 'B', 900, T0 + 50 * 60000, cerrado);
  assert.deepEqual(tot.map((x) => [x.kw, x.cerrado]), [[150, false], [130, true]]);
  assert.equal(demanda.maxDe(tot).kw, 150);
});

test('diffSeccionadores: solo los que cambiaron de estado', () => {
  const u = (c1, c2) => ({ dibujos: [{ id: 'g', nodos: [{ id: 's1', tipo: 'seccionador', nombre: 'Enlace', cerrado: c1 }, { id: 's2', tipo: 'seccionador', cerrado: c2 }, { id: 'm', tipo: 'medidor' }] }] });
  const d = demanda.diffSeccionadores(u(false, true), u(true, true));
  assert.deepEqual(d.map((x) => [x.nodo, x.nombre, x.cerrado]), [['s1', 'Enlace', true]]);
});

test('registro y períodos a mano: se ordenan por fecha y se borran', () => {
  fs.writeFileSync(path.join(dir, 'unifilar.json'), JSON.stringify({ dibujos: [{ id: 'g', nodos: [{ id: 's1', tipo: 'seccionador', nombre: 'Enlace', cerrado: false }] }] }));
  demanda.registrar([{ dibujo: 'g', nodo: 's1', nombre: 'Enlace', cerrado: true, usuario: 'op', origen: 'maniobra', fecha: new Date(T0 + 86400e3).toISOString() }]);
  const p = demanda.agregarPeriodo({ dibujo: 'g', nodo: 's1', cerrado: true, desde: new Date(T0).toISOString(), hasta: new Date(T0 + 3600e3).toISOString() }, 'admin');
  assert.equal(p.length, 2);
  const l = demanda.leerCambios();
  assert.deepEqual(l.map((c) => [c.cerrado, c.origen]), [[true, 'manual'], [false, 'manual'], [true, 'maniobra']]);
  assert.throws(() => demanda.agregarPeriodo({ dibujo: 'g', nodo: 'x', desde: new Date(T0).toISOString() }), /inexistente/);
  assert.throws(() => demanda.agregarPeriodo({ dibujo: 'g', nodo: 's1', desde: new Date(T0).toISOString(), hasta: new Date(T0 - 1).toISOString() }), /hasta inválida/);
  demanda.borrarCambio(l[0].id);
  assert.equal(demanda.leerCambios().length, 2);
  const v = demanda.vista({ meters: [{ name: 'PM8000' }], meterNames: { PM8000: 'BRO7' } });
  assert.deepEqual(v.medidores, [{ name: 'PM8000', nombre: 'BRO7' }]);
  assert.equal(v.seccionadores[0].nombre, 'Enlace');
});

test('config: hasta dos medidores; el seccionador solo con dos', () => {
  assert.deepEqual(demanda.guardarConfig({ medidores: ['A'], seccionador: { dibujo: 'g', nodo: 's1' } }), { medidores: ['A'], seccionador: null });
  assert.deepEqual(demanda.guardarConfig({ medidores: ['A', 'B'], seccionador: { dibujo: 'g', nodo: 's1' } }).seccionador, { dibujo: 'g', nodo: 's1' });
  assert.deepEqual(demanda.leerConfig().medidores, ['A', 'B']);
  assert.throws(() => demanda.validarConfig({ medidores: ['A', 'B', 'C'] }), /uno o dos/);
});

test('bloque Demanda con dos medidores: KPIs de cada uno y del total, gráfico de 3 series, tabla con el cálculo', () => {
  const m = (name, kw) => ({ name, displayName: name, demandMax: { kw, from: new Date(T0).toISOString(), to: new Date(T0 + 900e3).toISOString(), minutes: 15 } });
  const s = { meters: [m('A', 130), m('B', 60)] };
  const total = [{ from: T0, kw: 150, cerrado: false }, { from: T0 + 1800e3, kw: 130, cerrado: true }];
  const dias = [{ fecha: '2026-11-20', s }];
  const ctx = { detalle: true, demanda: { medidores: ['A', 'B'], total, every: 900, seccionador: 'Enlace' } };
  const partes = informes.bDemanda(s, dias, ctx);
  assert.equal(partes.filter((p) => p.kpis).length, 3);
  assert.equal(partes[2].kpis[0].valor, 150);
  assert.match(partes[2].kpis[0].label, /TOTAL \(A \+ B\)/);
  const g = partes.find((p) => p.grafico).grafico;
  assert.equal(g.apilado, true);   // columnas apiladas de A y B, total en línea
  assert.deepEqual(g.series.map((x) => x.valores[0]), [130, 60, 150]);
  const t = partes.find((p) => p.tabla).tabla;
  assert.equal(t.filas[0][3], 'A + B');
  assert.match(partes.at(-1).nota, /seccionador Enlace cerrado/);
  // un solo medidor elegido: el bloque de siempre con ese medidor
  const uno = informes.bDemanda(s, dias, { detalle: true, demanda: { medidores: ['B'] } });
  assert.match(uno[0].kpis[0].label, /DEMANDA MÁXIMA B/);
});
