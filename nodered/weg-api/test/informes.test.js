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
