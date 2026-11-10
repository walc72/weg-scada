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

// ─── Costeo ─────────────────────────────────────────────────────────────────
test.describe('costear', () => {
  const H0 = new Date(2026, 10, 7, 0).getTime(); // sábado
  const horas = (n, v) => Array(n).fill(v);
  const sitioAgriplus = () => 'Agriplus';
  const conAsig = (asig, extra = {}) => archivo({ asignacion: asig, ...extra });
  const asigA = (medidor = null) => conAsig({ Agriplus: { tarifa: 't-lq3k9a1x', medidor } });
  const resumen = (drives, meters = [], horaInicio = H0) => ({ horaInicio, drives, meters });
  const B1 = (extra = {}) => ({ name: 'B1', site: 'Agriplus', kwhHora: horas(24, 10), ...extra });
  const pm1 = (extra = {}) => {
    const kwMaxHora = horas(24, 500); kwMaxHora[19] = 900;
    return { name: 'PM1', kwhHora: horas(24, 10), kwMaxHora, energyKwh: 240, energySource: 'integrada', stats: { pf: { avg: 0.9 } }, ...extra };
  };

  test('bomba: kWh y costo por franja', () => {
    const c = T.costear(resumen([B1()]), asigA(), sitioAgriplus);
    assert.deepEqual(c.bombas.B1.franjas, [{ nombre: 'Punta', kwh: 40, costo: 13277 }, { nombre: 'Fuera de punta', kwh: 200, costo: 28966 }]);
    assert.equal(c.bombas.B1.costo, 42243);
    assert.equal(c.bombas.B1.sitio, 'Agriplus');
    assert.equal(c.costoBombas, 42243);
    assert.equal(c.moneda, 'Gs');
    assert.equal(c.bombas.B1.porLitro, null);
  });

  test('bomba con volumen: porLitro a 4 decimales', () => {
    const c = T.costear(resumen([B1({ volumeM3: 100 })]), asigA(), sitioAgriplus);
    assert.equal(c.bombas.B1.porLitro, 0.4224);
  });

  test('sitio con espacios (sitioDeCfg recorta) cae en la tarifa del sitio', () => {
    const sitioDe = T.sitioDeCfg({ devices: [{ name: 'B1', site: ' Agriplus ' }], meters: [{ name: 'PM1' }] });
    assert.equal(sitioDe('PM1'), '');
    assert.equal(sitioDe('nada'), '');
    const c = T.costear(resumen([B1()]), asigA(), sitioDe);
    assert.equal(c.bombas.B1.sitio, 'Agriplus');
    assert.equal(c.bombas.B1.costo, 42243);
  });

  test('cambio de versión a mitad del período', () => {
    const v2 = { ...version('2026-11-08'), resto: { nombre: 'Fuera de punta', precioKwh: 200 } };
    const a = conAsig({ Agriplus: { tarifa: 't-lq3k9a1x', medidor: null } }, { tarifas: [tarifa('412', [version(), v2])] });
    const c = T.costear(resumen([B1({ kwhHora: horas(48, 10) })]), a, sitioAgriplus);
    // domingo sin punta: 240 kWh a 200
    assert.equal(c.bombas.B1.costo, 42243 + 48000);
    assert.deepEqual(c.bombas.B1.franjas.find((f) => f.nombre === 'Fuera de punta'), { nombre: 'Fuera de punta', kwh: 440, costo: 28966 + 48000 });
  });

  test('sin versión vigente: costo null y nota', () => {
    const a = conAsig({ Agriplus: { tarifa: 't-lq3k9a1x', medidor: null } }, { tarifas: [tarifa('412', [version('2027-01-01')])] });
    const c = T.costear(resumen([B1()]), a, sitioAgriplus);
    assert.equal(c.bombas.B1.costo, null);
    assert.equal(c.costoBombas, null);
    assert.ok(c.notas.some((n) => n.startsWith('Sin tarifa vigente para Agriplus el 07/11/2026')), c.notas.join('|'));
  });

  test('archivo mal formado desde disco: no lanza, costo null', () => {
    const a = { moneda: 'Gs', tarifas: [{ id: 't-x', nombre: 'X', versiones: 'basura' }], asignacion: { Agriplus: { tarifa: 't-x', medidor: null } } };
    const c = T.costear(resumen([B1()]), a, sitioAgriplus);
    assert.equal(c.bombas.B1.costo, null);
  });

  test('sitio con medidor: reservada prorrateada, exceso, mes parcial y FP', () => {
    const c = T.costear(resumen([B1()], [pm1()]), asigA('PM1'), sitioAgriplus);
    const s = c.sitios.find((x) => x.sitio === 'Agriplus');
    assert.equal(s.medidor, 'PM1');
    assert.equal(s.tarifa, 'ANDE 412 Línea MT');
    assert.equal(s.energia, 42243);
    assert.equal(s.reservada, 1096693);
    assert.equal(s.exceso, 8753300);
    assert.equal(s.total, 42243 + 1096693 + 8753300);
    assert.equal(s.mesParcial, true);
    assert.equal(s.fp, 0.9);
    assert.equal(s.fpBajo, true);
    assert.ok(c.notas.includes('Factor de potencia medio de PM1 = 0,90 (menor a 0,92): ANDE aplica un recargo sobre la energía (pliego 4.5).'), c.notas.join('|'));
  });

  test('medidor por contador: escala la energía por hora', () => {
    const c = T.costear(resumen([], [pm1({ energySource: 'contador', energyKwh: 480 })]), asigA('PM1'), sitioAgriplus);
    assert.equal(c.sitios[0].energia, 84486); // 42243,2 × 2 = 84486,4
  });

  test('potencia diferencial: exceso separado punta / fuera', () => {
    const vd = { ...version(), potencia: { modo: 'diferencial', punta: { reservadaKw: 500, precioKw: 38732, precioExcesoKw: 116195 }, fuera: { reservadaKw: 800, precioKw: 23800, precioExcesoKw: 81802 } } };
    const a = conAsig({ Agriplus: { tarifa: 't-lq3k9a1x', medidor: 'PM1' } }, { tarifas: [tarifa('412', [vd])] });
    const kwMaxHora = horas(24, 100); kwMaxHora[19] = 600; kwMaxHora[10] = 850;
    const c = T.costear(resumen([], [pm1({ kwMaxHora })]), a, sitioAgriplus);
    assert.equal(c.sitios[0].exceso, 15709600);
    assert.equal(c.sitios[0].reservada, Math.round((500 * 38732 + 800 * 23800) * 24 / 720));
  });

  test('medidor asignado sin datos: energía = suma de bombas, sin potencia', () => {
    const c = T.costear(resumen([B1()], [pm1()]), asigA('PMX'), sitioAgriplus);
    const s = c.sitios[0];
    assert.equal(s.energia, 42243);
    assert.equal(s.reservada, 0);
    assert.equal(s.exceso, 0);
    assert.ok(c.notas.includes('Medidor PMX sin datos'));
  });

  test('sin tarifas o sin horaInicio → null', () => {
    assert.equal(T.costear(resumen([B1()]), T.VACIO, sitioAgriplus), null);
    assert.equal(T.costear({ drives: [B1()], meters: [] }, asigA(), sitioAgriplus), null);
  });

  test('aplicar: sin tarifas no agrega costos y limpia los arreglos por hora', () => {
    const s = resumen([B1()], [pm1()]);
    const r = T.aplicar(s, T.VACIO, { devices: [], meters: [] });
    assert.equal(r, s);
    assert.equal('costos' in r, false);
    assert.equal('horaInicio' in r, false);
    assert.equal('kwhHora' in r.drives[0], false);
    assert.equal('kwhHora' in r.meters[0], false);
    assert.equal('kwMaxHora' in r.meters[0], false);
  });

  test('aplicar: si costear falla, el resumen sale sin costos y sin los arreglos por hora', (t) => {
    const log = t.mock.method(console, 'error', () => {});
    const roto = { moneda: 'Gs', asignacion: {}, get tarifas() { throw new Error('archivo roto'); } };
    const s = resumen([B1()], [pm1()]);
    const r = T.aplicar(s, roto, { devices: [] });
    assert.equal(r, s);
    assert.equal('costos' in r, false);
    assert.equal('horaInicio' in r, false);
    assert.equal('kwhHora' in r.drives[0], false);
    assert.equal('kwhHora' in r.meters[0], false);
    assert.equal('kwMaxHora' in r.meters[0], false);
    assert.match(log.mock.calls[0].arguments.join(' '), /\[REPORT\] tarifas: archivo roto/);
  });

  test('período que cruza fin de mes con cambio de versión: reservada por hora y exceso por mes', () => {
    // 28/11 00:00 a 04/12 00:00 local = 144 h; desde el 29/11 la reservada pasa de 800 a 1000 kW (mismos precios)
    const v2 = { ...version('2026-11-29'), potencia: { modo: 'unica', reservadaKw: 1000, precioKw: 41126, precioExcesoKw: 87533 } };
    const a = conAsig({ Agriplus: { tarifa: 't-lq3k9a1x', medidor: 'PM1' } }, { tarifas: [tarifa('412', [version(), v2])] });
    const kwMaxHora = horas(144, 500);
    kwMaxHora[19] = 950;      // 28/11, con la versión de 800 kW en vigor
    kwMaxHora[72 + 19] = 1200; // 01/12
    const c = T.costear(resumen([], [pm1({ kwhHora: horas(144, 10), kwMaxHora })], new Date(2026, 10, 28).getTime()), a, sitioAgriplus);
    const s = c.sitios[0];
    // reservada: 24 h × 800 × 41126 / 720 + 48 h × 1000 × 41126 / 720 + 72 h × 1000 × 41126 / 744 = 7818362,15
    assert.equal(s.reservada, 7818362);
    // exceso: noviembre usa la versión de su última hora (1000 kW) → 950 no excede; diciembre (1200 − 1000) × 87533
    assert.equal(s.exceso, 17506600);
    assert.equal(s.mesParcial, true);
  });

  test('precio no numérico en un archivo sin validar: no lanza', () => {
    const rota = { ...version(), franjas: [punta({ precioKwh: 'abc' })], resto: { nombre: 'Fuera de punta', precioKwh: 'abc' } };
    const soloFranja = { ...version(), franjas: [punta({ precioKwh: 'abc' })] };
    const asig = { Agriplus: { tarifa: 't-lq3k9a1x', medidor: 'PM1' } };
    const c1 = T.costear(resumen([B1()], [pm1()]), conAsig(asig, { tarifas: [tarifa('412', [rota])] }), sitioAgriplus);
    assert.equal(c1.bombas.B1.costo, null);
    const c2 = T.costear(resumen([B1()], [pm1()]), conAsig(asig, { tarifas: [tarifa('412', [soloFranja])] }), sitioAgriplus);
    assert.equal(c2.bombas.B1.costo, Math.round(240 * 144.83)); // la franja sin precio se descarta: todo al resto
  });

  test('demanda en bloques de 60 min (período largo): nota una sola vez', () => {
    const dm = { kw: 900, from: '', to: '', minutes: 60 };
    const asig = { Agriplus: { tarifa: 't-lq3k9a1x', medidor: 'PM1' }, Otro: { tarifa: 't-lq3k9a1x', medidor: 'PM2' } };
    const c = T.costear(resumen([], [pm1({ demandMax: dm }), pm1({ name: 'PM2', demandMax: dm })]), conAsig(asig), sitioAgriplus);
    const nota = 'Demanda en bloques de 60 min (período largo): el exceso puede diferir de la factura, que usa 15 min.';
    assert.equal(c.notas.filter((n) => n === nota).length, 1);
    const c15 = T.costear(resumen([], [pm1({ demandMax: { ...dm, minutes: 15 } })]), asigA('PM1'), sitioAgriplus);
    assert.ok(!c15.notas.some((n) => n.startsWith('Demanda en bloques')));
  });

  test('aplicar: con tarifas agrega costos usando el sitio de la config', () => {
    const r = T.aplicar(resumen([B1()]), asigA(), { devices: [{ name: 'B1', site: 'Agriplus ' }] });
    assert.equal(r.costos.bombas.B1.costo, 42243);
  });
});

// ─── Pérdidas: mismo balance que summary.loss (principal − Σ restan), costeado hora a hora ───
test.describe('costear pérdidas', () => {
  const H0 = new Date(2026, 10, 7, 0).getTime(); // sábado: punta 18–22
  const m = (name, kwh, extra = {}) => ({ name, kwhHora: Array(24).fill(kwh), energyKwh: kwh * 24, energySource: 'integracion', ...extra });
  const resumen = (meters) => ({ horaInicio: H0, drives: [], meters, loss: { main: 'PM1', subtract: ['PM2', 'PM3'], energyKwh: 168 } });
  const conPerdidas = (tarifa = 't-lq3k9a1x') => archivo({ perdidas: { tarifa } });

  test('kWh y costo por franja con la tarifa elegida', () => {
    const c = T.costear(resumen([m('PM1', 15), m('PM2', 5), m('PM3', 3)]), conPerdidas(), () => '');
    assert.deepEqual(c.perdidas, {
      tarifa: 'ANDE 412 Línea MT', kwh: 168, costo: 29570,
      franjas: [{ nombre: 'Punta', kwh: 28, costo: 9294 }, { nombre: 'Fuera de punta', kwh: 140, costo: 20276 }],
    });
  });

  test('cada medidor se escala a su contador, igual que la energía de la tabla', () => {
    const c = T.costear(resumen([m('PM1', 15, { energyKwh: 480, energySource: 'contador' }), m('PM2', 5), m('PM3', 3)]), conPerdidas(), () => '');
    assert.equal(c.perdidas.kwh, 288); // (20 − 5 − 3) × 24
  });

  test('sin tarifa para pérdidas: null y nota; sin balance configurado: null sin nota', () => {
    const c = T.costear(resumen([m('PM1', 15), m('PM2', 5), m('PM3', 3)]), archivo(), () => '');
    assert.equal(c.perdidas, null);
    assert.ok(c.notas.some((n) => /Tarifa para pérdidas/.test(n)));
    const s = resumen([m('PM1', 15)]); delete s.loss;
    const d = T.costear(s, conPerdidas(), () => '');
    assert.equal(d.perdidas, null);
    assert.ok(!d.notas.some((n) => /pérdidas/i.test(n)));
  });

  test('validar: la tarifa de pérdidas tiene que existir', () => {
    assert.deepEqual(T.validar(conPerdidas()).perdidas, { tarifa: 't-lq3k9a1x' });
    assert.deepEqual(T.validar(archivo()).perdidas, { tarifa: null });
    assert.throws(() => T.validar(conPerdidas('t-noexiste')), /pérdidas/);
  });
});
