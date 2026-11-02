'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const inf = require('../src/services/informes');

const H = 3600 * 1000;
const T0 = Date.parse('2026-10-01T00:00:00');

test('días del período: locales y sin el día del límite superior', () => {
  assert.deepEqual(inf.diasDelPeriodo(T0, T0 + 3 * 24 * H), ['2026-10-01', '2026-10-02', '2026-10-03']);
  assert.deepEqual(inf.diasDelPeriodo(T0 + 5 * H, T0 + 30 * H), ['2026-10-01', '2026-10-02']);
});

test('horas de intervalos recortadas al período; abiertos hasta ahora', () => {
  const ivs = [{ start: T0 - 2 * H, end: T0 + H }, { start: T0 + 3 * H, end: null }];
  assert.equal(inf.horasEn(ivs, T0, T0 + 10 * H, T0 + 5 * H), 1 + 2);
  assert.equal(inf.horasEn([{ start: T0 + 20 * H, end: T0 + 21 * H }], T0, T0 + 10 * H), 0);
});

test('desbalance de tensión NEMA; null sin las tres fases', () => {
  assert.equal(inf.desbalance([23.0, 23.0, 23.0]), 0);
  // promedio 23, máx desvío 0,46 → 2 %
  assert.equal(inf.desbalance([23.46, 22.77, 22.77]), 2);
  assert.equal(inf.desbalance([23, null, 23]), null);
});

test('medidor principal: el del balance, si no el de mayor energía', () => {
  const ms = [{ name: 'A', energyKwh: 10 }, { name: 'B', energyKwh: 50 }];
  assert.equal(inf.principal(ms, { main: 'A' }).name, 'A');
  assert.equal(inf.principal(ms, null).name, 'B');
  assert.equal(inf.principal([], null), null);
});

test('detalle por día: kWh/m³ por día y fila TOTAL', () => {
  const dia = (f, eb, vol, h, rain) => ({ fecha: f, s: { totals: { driveEnergyKwh: eb, volumeM3: vol }, drives: [{ opHours: h }], meters: [] }, manual: { rainMm: rain } });
  const { filas, total } = inf.filasPorDia([dia('2026-10-01', 100, 400, 5, 2), dia('2026-10-02', 300, 600, 7, null)], null);
  assert.equal(filas[0][4], 0.25);
  assert.deepEqual(total.slice(0, 6), ['TOTAL', 400, null, 1000, 0.4, 12]);
  assert.equal(total[7], 2);
});

test('disponibilidad por bomba: horas en falla y sin comunicación del registro de alarmas', () => {
  const s = { drives: [{ name: 'SAER 1', opHours: 12, energyKwh: 600, volumeM3: 2000 }] };
  const al = [
    { device: 'SAER 1', type: 'FALLA', start: T0 + H, end: T0 + 3 * H },
    { device: 'SAER 1', type: 'SIN_COMUNICACION', start: T0 + 5 * H, end: T0 + 6 * H },
    { device: 'SAER 2', type: 'FALLA', start: T0, end: T0 + H },
  ];
  const [{ tabla }] = inf.bBombas(s, al, { desde: T0, hasta: T0 + 24 * H });
  assert.deepEqual(tabla.filas[0], ['SAER 1', 12, 50, 2, 1, 600, 2000, 0.3, 1]);
});

test('eventos: totales, por tipo y por equipo con nombre visible', () => {
  const al = [
    { device: 'd1', type: 'FALLA', text: 'F070', start: T0 + H, end: T0 + 2 * H },
    { device: 'd1', type: 'TEMP_ALTA', text: '71 °C', start: T0 + 3 * H, end: T0 + 4 * H },
    { device: 'd2', type: 'SIN_COMUNICACION', start: T0 - 5 * H, end: T0 + H }, // empezó antes: no cuenta como evento del período
  ];
  const partes = inf.bEventos(al, { desde: T0, hasta: T0 + 24 * H, nombre: (n) => n.toUpperCase() });
  assert.deepEqual(partes[0].kpis.map((k) => k.valor), [2, 1, 1, 0]);
  assert.deepEqual(partes[1].tabla.filas.map((f) => f[0]).sort(), ['Falla', 'Temperatura alta']);
  assert.deepEqual(partes[2].tabla.filas[0].slice(0, 3), ['D1', 2, 1]);
});

test('plantilla: de fábrica o lista de bloques válida', () => {
  assert.equal(inf.plantillaDe({ plantilla: 'mensual' }).bloques[0], 'indicadores');
  assert.deepEqual(inf.plantillaDe({ bloques: ['calidad', 'xx'] }).bloques, ['calidad']);
  assert.throws(() => inf.plantillaDe({ plantilla: 'nada' }), /inexistente/);
  assert.throws(() => inf.plantillaDe({ bloques: ['xx'] }), /inválidos/);
});

test('salidas: XLSX y PDF se generan a partir de las partes', async () => {
  const informe = {
    plantilla: 'mensual', titulo: 'Informe mensual', desde: new Date(T0).toISOString(), hasta: new Date(T0 + 48 * H).toISOString(), generado: new Date().toISOString(),
    bloques: [
      { titulo: 'Indicadores', partes: [{ kpis: [{ label: 'ENERGÍA', valor: 1234.5, unidad: 'kWh' }] }] },
      { titulo: 'Por día', partes: [{ grafico: { x: ['01/10', '02/10'], series: [{ label: 'Energía', unidad: 'kWh', valores: [10, 20] }] } },
        { tabla: { columnas: [{ label: 'Fecha' }, { label: 'kWh', dec: 1 }], filas: [['2026-10-01', 10], ['2026-10-02', 20]], total: ['TOTAL', 30] } }, { nota: 'nota' }] },
    ],
  };
  const x = inf.aXLSX(informe);
  assert.equal(x.slice(0, 2).toString(), 'PK');
  const p = await inf.aPDF(informe, null);
  assert.equal(p.slice(0, 4).toString(), '%PDF');
});
