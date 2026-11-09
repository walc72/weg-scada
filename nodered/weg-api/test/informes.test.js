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

test('detalle por día: Wh/L por día y fila TOTAL', () => {
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

test('plantillas propias: crear, validar, renombrar, borrar; fábrica primero', () => {
  const os = require('os'), fs = require('fs'), path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'inf-')), 'informes.json');
  const p = inf.guardarPlantilla({ nombre: 'Cliente mensual', periodo: 'mes_anterior', bloques: ['indicadores', 'grafico_dia', 'indicadores', 'xx'] }, 'ana', file);
  assert.match(p.id, /^p-/);
  assert.deepEqual(p.bloques, ['indicadores', 'grafico_dia']);   // sin repetidos ni desconocidos
  assert.equal(p.autor, 'ana');
  const lista = inf.listarPlantillas(file);
  assert.equal(lista[0].fabrica, true);
  assert.equal(lista.at(-1).nombre, 'Cliente mensual');
  assert.equal(lista.at(-1).fabrica, false);
  assert.throws(() => inf.guardarPlantilla({ nombre: 'cliente MENSUAL', bloques: ['calidad'] }, 'x', file), /ya existe/);
  assert.throws(() => inf.guardarPlantilla({ nombre: '', bloques: ['calidad'] }, 'x', file), /Nombre inválido/);
  assert.throws(() => inf.guardarPlantilla({ nombre: 'Otra', bloques: [] }, 'x', file), /Bloques inválidos/);
  const e = inf.guardarPlantilla({ id: p.id, nombre: 'Cliente', periodo: 'raro', bloques: ['calidad'] }, 'beto', file);
  assert.deepEqual([e.nombre, e.periodo, e.bloques, e.autor], ['Cliente', 'mes', ['calidad'], 'beto']);
  assert.throws(() => inf.guardarPlantilla({ id: 'p-nada', nombre: 'X', bloques: ['calidad'] }, 'x', file), /inexistente/);
  inf.borrarPlantilla(p.id, file);
  assert.equal(inf.listarPlantillas(file).filter((x) => !x.fabrica).length, 0);
  assert.throws(() => inf.borrarPlantilla(p.id, file), /inexistente/);
});

test('suscripciones: período y hora de cada frecuencia', () => {
  const L = (s) => Date.parse(s);                    // hora local
  // 2026-11-02 es lunes
  const d = inf.slotDe({ frecuencia: 'diaria', hora: '07:00' }, L('2026-11-02T10:00:00'));
  assert.deepEqual([d.slot, d.programado, d.desde, d.hasta], ['2026-11-02', L('2026-11-02T07:00:00'), L('2026-11-01T00:00:00'), L('2026-11-02T00:00:00')]);
  const w = inf.slotDe({ frecuencia: 'semanal', dia: 1, hora: '08:30' }, L('2026-11-04T10:00:00'));
  assert.deepEqual([w.slot, w.programado, w.desde, w.hasta], ['2026-11-02', L('2026-11-02T08:30:00'), L('2026-10-26T00:00:00'), L('2026-11-02T00:00:00')]);
  const m = inf.slotDe({ frecuencia: 'mensual', hora: '07:00' }, L('2026-11-15T10:00:00'));
  assert.deepEqual([m.slot, m.programado, m.desde, m.hasta], ['2026-11', L('2026-11-01T07:00:00'), L('2026-10-01T00:00:00'), L('2026-11-01T00:00:00')]);
});

test('suscripciones: vencida una vez por período; pausada nunca; próximo envío', () => {
  const L = (s) => Date.parse(s);
  const sus = { frecuencia: 'diaria', hora: '07:00' };
  assert.equal(inf.vencida(sus, L('2026-11-02T06:59:00')), false);
  assert.equal(inf.vencida(sus, L('2026-11-02T07:00:00')), true);
  assert.equal(inf.vencida({ ...sus, ultimoSlot: '2026-11-02' }, L('2026-11-02T09:00:00')), false);
  assert.equal(inf.vencida({ ...sus, activa: false }, L('2026-11-02T09:00:00')), false);
  assert.equal(inf.proximoEnvio({ ...sus, ultimoSlot: '2026-11-02' }, L('2026-11-02T09:00:00')), L('2026-11-03T07:00:00'));
  assert.equal(inf.proximoEnvio({ frecuencia: 'mensual', hora: '07:00', ultimoSlot: '2026-11' }, L('2026-11-15T10:00:00')), L('2026-12-01T07:00:00'));
});

test('suscripciones: alta sin envío retroactivo, validación y baja en cascada con la plantilla', () => {
  const os = require('os'), fs = require('fs'), path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sus-')), 'informes.json');
  const L = (s) => Date.parse(s);
  const p = inf.guardarPlantilla({ nombre: 'Cliente', bloques: ['indicadores'] }, 'ana', file);
  // mensual creada a mitad de mes: el mes anterior NO se manda; el próximo es el 1 de diciembre
  const s = inf.guardarSuscripcion({ plantilla: p.id, frecuencia: 'mensual', hora: '07:00', destinatarios: 'A@x.com, b@y.com; a@x.com' }, 'ana', file, L('2026-11-15T10:00:00'));
  assert.deepEqual(s.destinatarios, ['a@x.com', 'b@y.com']);
  assert.equal(inf.vencida(s, L('2026-11-15T10:01:00')), false);
  assert.equal(inf.listarSuscripciones(file, L('2026-11-15T10:01:00'))[0].proximo, L('2026-12-01T07:00:00'));
  // diaria creada antes de la hora: sale hoy
  const d = inf.guardarSuscripcion({ plantilla: 'eventos', frecuencia: 'diaria', hora: '07:00', destinatarios: ['c@z.com'] }, 'ana', file, L('2026-11-15T06:00:00'));
  assert.equal(inf.vencida(d, L('2026-11-15T07:00:00')), true);
  assert.throws(() => inf.guardarSuscripcion({ plantilla: 'nada', frecuencia: 'diaria', hora: '07:00', destinatarios: 'a@x.com' }, 'x', file), /Plantilla inexistente/);
  assert.throws(() => inf.guardarSuscripcion({ plantilla: 'eventos', frecuencia: 'diaria', hora: '7', destinatarios: 'a@x.com' }, 'x', file), /Hora inválida/);
  assert.throws(() => inf.guardarSuscripcion({ plantilla: 'eventos', frecuencia: 'semanal', dia: 9, hora: '07:00', destinatarios: 'a@x.com' }, 'x', file), /Día/);
  assert.throws(() => inf.guardarSuscripcion({ plantilla: 'eventos', frecuencia: 'diaria', hora: '07:00', destinatarios: 'no-es-correo' }, 'x', file), /Destinatarios/);
  // borrar la plantilla propia borra su suscripción; la de fábrica queda
  inf.borrarPlantilla(p.id, file);
  assert.deepEqual(inf.listarSuscripciones(file).map((x) => x.plantilla), ['eventos']);
  inf.borrarSuscripcion(d.id, file);
  assert.equal(inf.listarSuscripciones(file).length, 0);
});

test('suscripciones: reanudar una pausada no manda el período que pasó', () => {
  const os = require('os'), fs = require('fs'), path = require('path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sus-')), 'informes.json');
  const L = (s) => Date.parse(s);
  const s = inf.guardarSuscripcion({ plantilla: 'eventos', frecuencia: 'mensual', hora: '07:00', destinatarios: 'a@x.com', activa: false }, 'x', file, L('2026-10-20T10:00:00'));
  const r = inf.guardarSuscripcion({ ...s, activa: true }, 'x', file, L('2026-11-10T10:00:00'));
  assert.equal(inf.vencida(r, L('2026-11-10T10:01:00')), false);
  assert.equal(inf.vencida(r, L('2026-12-01T07:00:00')), true);
});

test('período anterior: meses enteros, mes en curso y tramo libre', () => {
  const L = (s) => Date.parse(s);
  assert.deepEqual(inf.periodoAnterior(L('2026-10-01T00:00:00'), L('2026-11-01T00:00:00')), [L('2026-09-01T00:00:00'), L('2026-10-01T00:00:00')]);
  assert.deepEqual(inf.periodoAnterior(L('2026-11-01T00:00:00'), L('2026-11-02T10:00:00')), [L('2026-10-01T00:00:00'), L('2026-10-02T10:00:00')]);
  assert.deepEqual(inf.periodoAnterior(L('2026-10-10T00:00:00'), L('2026-10-17T00:00:00')), [L('2026-10-03T00:00:00'), L('2026-10-10T00:00:00')]);
});

test('comparativo: diferencia y variación %, filas sin datos fuera', () => {
  const s = (eb, vol, h) => ({ totals: { driveEnergyKwh: eb, volumeM3: vol }, drives: [{ opHours: h }], meters: [] });
  const [{ tabla }] = inf.bComparativo(s(1100, 4000, 10), s(1000, 4000, 8), { desdePrev: T0, hastaPrev: T0 + 24 * H, lluvia: 5, lluviaPrev: null });
  assert.deepEqual(tabla.filas[0], ['Energía bombas (kWh)', 1100, 1000, 100, 10]);
  assert.deepEqual(tabla.filas.find((f) => f[0] === 'Wh / L'), ['Wh / L', 0.275, 0.25, 0.025, 10]);
  assert.equal(tabla.filas.some((f) => /principal|Pérdida|Demanda/.test(f[0])), false);
  assert.deepEqual(tabla.filas.at(-1), ['Lluvia (mm)', 5, null, null, null]);
  assert.equal(tabla.decFilas[tabla.filas.findIndex((f) => f[0] === 'Wh / L')], 3);
});

test('arranques: por bomba, por día y marcha promedio', () => {
  const s = { drives: [{ name: 'SAER 1', opHours: 20 }, { name: 'SAER 2', opHours: 0 }] };
  const [k, { tabla }] = inf.bArranques(s, { 'SAER 1': 8 }, { desde: T0, hasta: T0 + 2 * 24 * H });
  assert.deepEqual(tabla.filas, [['SAER 1', 8, 4, 20, 2.5], ['SAER 2', 0, 0, 0, null]]);
  assert.equal(k.kpis[0].valor, 8);
});

test('demanda: factor de carga y los días de mayor demanda', () => {
  const m = (kw, from, e) => ({ name: 'M', energyKwh: e, demandMax: { kw, from, to: new Date(Date.parse(from) + 15 * 60e3).toISOString(), minutes: 15 }, stats: { power: { avg: 500 } } });
  const s = { meters: [m(1000, '2026-10-02T14:00:00', 24000)] };
  const dias = [{ fecha: '2026-10-01', s: { meters: [m(800, '2026-10-01T09:00:00', 12000)] } }, { fecha: '2026-10-02', s: { meters: [m(1000, '2026-10-02T14:00:00', 12000)] } }];
  const [k, g, t] = inf.bDemanda(s, dias, { desde: T0, hasta: T0 + 48 * H, detalle: true });
  assert.equal(k.kpis[3].valor, 50);   // 24000 / (1000 × 48) = 50 %
  assert.deepEqual(g.grafico.series[0].valores, [800, 1000]);
  assert.deepEqual(t.tabla.filas[0], ['02/10/2026', '14:00–14:15', 1000]);
});

test('pérdidas por día: % sobre el principal y total; sin balance avisa', () => {
  const d = (f, e, l) => ({ fecha: f, s: { meters: [{ name: 'P', energyKwh: e }], loss: { energyKwh: l, avgKw: 1, maxKw: 2 } } });
  const partes = inf.bPerdidas([d('2026-10-01', 1000, 20), d('2026-10-02', 1000, 40)], { lossMeter: { main: 'P' }, detalle: true });
  const t = partes[2].tabla;
  assert.deepEqual(t.filas[0], ['01/10/2026', 1000, 20, 2, 1, 2]);
  assert.deepEqual(t.total.slice(0, 4), ['TOTAL', 2000, 60, 3]);
  assert.equal(partes[0].kpis[2].valor, 40);
  assert.ok(inf.bPerdidas([], { lossMeter: null, detalle: true })[0].nota);
});

test('lluvia y bombeo: total, días con lluvia y río mín/máx', () => {
  const dia = (f, rain, rio, vol) => ({ fecha: f, s: { totals: { driveEnergyKwh: 100, volumeM3: vol }, drives: [{ opHours: 5 }], meters: [] }, manual: { rainMm: rain, riverM: rio } });
  const [k, g, t] = inf.bLluvia([dia('2026-10-01', 12.5, 3.1, 400), dia('2026-10-02', 0, 3.4, 600)], { detalle: true });
  assert.deepEqual(k.kpis.map((x) => x.valor), [12.5, 1, '3,10 / 3,40']);
  assert.equal(g.grafico.series[1].label, 'Volumen');
  assert.deepEqual(t.tabla.total, ['TOTAL', 12.5, null, 1000, 200, 10]);
});

test('horímetro: se descarta si suma más horas que el período', () => {
  const { horimetroValido } = require('../src/services/reports');
  assert.equal(horimetroValido({ first: 100, last: 120 }, 24), true);
  assert.equal(horimetroValido({ first: 0, last: 12258.5 }, 24), false);
  assert.equal(horimetroValido({ first: 100, last: null }, 24), false);
});

test('PDF: números con punto de miles y coma decimal, como en el portal', () => {
  const { miles } = require('../src/services/reports');
  assert.equal(miles(829517), '829.517');
  assert.equal(miles(12258.5, 3), '12.258,5');
  assert.equal(miles(0.95, 3), '0,95');
  assert.equal(miles(1234, 2, 2), '1.234,00');
  assert.equal(miles('SAER 1'), 'SAER 1');
  assert.equal(miles(null), null);
});

test('eventos: los distintos ALARMA_x se agrupan como una sola fila "Alarma del equipo"', () => {
  const al = ['ALARMA_A', 'ALARMA_B', 'ALARMA_B'].map((type, i) => ({ device: 'd1', type, start: T0 + i * H, end: T0 + i * H + 60e3 }));
  const tabla = inf.bEventos(al, { desde: T0, hasta: T0 + 24 * H, nombre: (n) => n })[1].tabla;
  assert.deepEqual(tabla.filas.map((f) => [f[0], f[1]]), [['Alarma del equipo', 3]]);
});
