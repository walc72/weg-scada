'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'perdida-'));
process.env.CONFIG_PATH = path.join(dir, 'config.json');
const demanda = require('../src/services/demanda');
const reports = require('../src/services/reports');
const configService = require('../src/services/config');
const tarifas = require('../src/services/tarifas');

const T0 = Date.parse('2026-11-20T12:00:00Z');
const M = 60000;
const iso = (ms) => new Date(ms).toISOString();

// A = principal, B resta; el seccionador s1 cierra a los 2 min (antes estaba abierto)
fs.writeFileSync(path.join(dir, 'unifilar.json'), JSON.stringify({ dibujos: [{ id: 'g', nodos: [{ id: 's1', tipo: 'seccionador', nombre: 'Enlace', cerrado: true }] }] }));
demanda.guardarConfig({ medidores: ['A', 'B'], seccionador: { dibujo: 'g', nodo: 's1' } });
demanda.registrar([{ dibujo: 'g', nodo: 's1', nombre: 'Enlace', cerrado: true, fecha: iso(T0 + 2 * M) }]);
const LOSS = { main: 'A', subtract: ['B'] };

test('tramosCerrado y fraccion', () => {
  const c = demanda.leerCambios();
  assert.deepEqual(demanda.tramosCerrado(c, true, T0, T0 + 4 * M), [[T0 + 2 * M, T0 + 4 * M]]);
  assert.deepEqual(demanda.tramosCerrado(c, true, T0, T0 + M), []);
  assert.equal(demanda.fraccion([[T0 + 2 * M, T0 + 4 * M]], T0, T0 + 4 * M), 0.5);
});

test('condicionPerdida: solo con A principal y B entre los que restan', () => {
  assert.ok(demanda.condicionPerdida(LOSS, T0, T0 + 4 * M));
  assert.equal(demanda.condicionPerdida({ main: 'B', subtract: ['A'] }, T0, T0 + 4 * M), null);
  assert.equal(demanda.condicionPerdida({ main: 'A', subtract: ['C'] }, T0, T0 + 4 * M), null);
});

test('computeLoss: B resta solo con el seccionador cerrado (potencia y energía)', async () => {
  // aggregateWindow: _time al final de cada minuto; A = 100 W, B = 40 W los 4 minutos
  let csv = ',result,table,_time,name,_value\n';
  for (let k = 1; k <= 4; k++) csv += `,,0,${iso(T0 + k * M)},A,100\n,,1,${iso(T0 + k * M)},B,40\n`;
  const srv = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200); res.end(csv); }); });
  await new Promise((r) => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try {
    const l = await reports.computeLoss(LOSS, {}, { A: 10, B: 4 }, iso(T0), iso(T0 + 4 * M), 'weg_drives');
    assert.equal(l.avgKw, 0.08);      // (100 + 100 + 60 + 60) / 4 W
    assert.equal(l.maxKw, 0.1);
    assert.equal(l.energyKwh, 8);     // 10 − 4 × (80 W cerrado / 160 W)
    assert.equal(l.condicional.horasCerrado, 0);   // 2 min redondeado a 0,1 h
    assert.match(l.subtractLabels[0], /B solo con Enlace cerrado/);
  } finally { configService.get = orig; srv.close(); }
});

test('costos de pérdida: B resta solo la parte de cada hora con el seccionador cerrado', () => {
  const H = 36e5, h0 = Math.floor(T0 / H) * H;
  const s = {
    loss: { main: 'A', subtract: ['B'], condicional: { medidor: 'B', tramos: [[h0 + H / 2, h0 + 2 * H]] } },
    meters: [{ name: 'A', kwhHora: [100, 100] }, { name: 'B', kwhHora: [40, 40] }],
  };
  const tarifa = { nombre: 'T', versiones: [{ desde: '2000-01-01', franjas: [], resto: { nombre: 'Única', precioKwh: 1 }, potencia: null }] };
  const r = tarifas._costearPerdidas(s, new Map(s.meters.map((m) => [m.name, m])), h0, tarifa, new Set());
  assert.equal(r.kwh, (100 - 40 * 0.5) + (100 - 40));   // 1.ª hora cerrado la mitad, 2.ª toda
});
