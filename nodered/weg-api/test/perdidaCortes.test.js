'use strict';

// Pérdida con cortes de comunicación: sin energía si un contador no cubre los bordes del período, y la
// potencia solo con los minutos en que miden todos (antes los huecos contaban 0 W y daba negativa).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

process.env.CONFIG_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cortes-')), 'config.json');   // sin demanda.json
const reports = require('../src/services/reports');
const informes = require('../src/services/informes');
const tarifas = require('../src/services/tarifas');
const configService = require('../src/services/config');

const T0 = Date.parse('2026-11-22T12:00:00Z');
const M = 60000;
const iso = (ms) => new Date(ms).toISOString();
const LOSS = { main: 'A', subtract: ['B'] };

async function conInflux(csv, fn) {
  const srv = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200); res.end(csv); }); });
  await new Promise((r) => srv.listen(0, r));
  const orig = configService.get;
  configService.get = () => ({ influxdb: { url: `http://127.0.0.1:${srv.address().port}`, org: 'o', token: 't' } });
  try { return await fn(); } finally { configService.get = orig; srv.close(); }
}

// A = 100 W los minutos 1..4 salvo el 3 (corte); B = 40 W los 4
let CSV = ',result,table,_time,name,_value\n';
for (let k = 1; k <= 4; k++) { if (k !== 3) CSV += `,,0,${iso(T0 + k * M)},A,100\n`; CSV += `,,1,${iso(T0 + k * M)},B,40\n`; }

test('potencia: un minuto sin dato del principal no cuenta (no da negativa)', async () => {
  await conInflux(CSV, async () => {
    const l = await reports.computeLoss(LOSS, {}, { A: 10, B: 4 }, iso(T0), iso(T0 + 4 * M), 'weg_drives');
    assert.equal(l.avgKw, 0.06);
    assert.equal(l.energyKwh, 6);        // contadores completos: la energía sale igual
    assert.equal(l.incompleta, undefined);
  });
});

test('energía: contador del principal cortado en un borde → sin pérdida y se dice de quién', async () => {
  await conInflux(CSV, async () => {
    const l = await reports.computeLoss(LOSS, { A: 'Exclusiva' }, { A: 3, B: 4 }, iso(T0), iso(T0 + 4 * M), 'weg_drives', new Set(['A']));
    assert.equal(l.energyKwh, null);
    assert.deepEqual(l.incompleta, { medidores: ['Exclusiva'] });
  });
});

test('costos: pérdida incompleta no se costea, con nota', () => {
  const notas = new Set();
  const tarifa = { nombre: 'T', versiones: [{ desde: '2000-01-01', franjas: [], resto: { nombre: 'Única', precioKwh: 1 }, potencia: null }] };
  const s = { loss: { main: 'A', subtract: ['B'], incompleta: { medidores: ['Exclusiva'] } }, meters: [{ name: 'A', kwhHora: [100] }] };
  assert.equal(tarifas._costearPerdidas(s, new Map(s.meters.map((m) => [m.name, m])), T0, tarifa, notas), null);
  assert.match([...notas][0], /Exclusiva/);
});

test('bloque Pérdidas: día incompleto con —, total del período con su propio balance y nota', () => {
  const dia = (fecha, e, l, inc) => ({ fecha, s: { meters: [{ name: 'A', energyKwh: e }], loss: { energyKwh: l, avgKw: 1, maxKw: 2, ...(inc ? { incompleta: { medidores: ['Exclusiva'] } } : {}) } } });
  const dias = [dia('2026-11-21', 1000, 50), dia('2026-11-22', 400, null, true)];
  const sPer = { meters: [{ name: 'A', energyKwh: 2000 }], loss: { energyKwh: 80 } };
  const partes = informes.bPerdidas(dias, { detalle: true, lossMeter: LOSS }, sPer);
  assert.equal(partes[0].kpis[0].valor, 80);       // pérdida total = la del período
  assert.equal(partes[0].kpis[1].valor, 4);        // 80 / 2000
  const t = partes.find((p) => p.tabla).tabla;
  assert.equal(t.filas[1][2], null);
  assert.match(partes.find((p) => p.nota && /Sin pérdida/.test(p.nota)).nota, /22\/11\/2026.*Exclusiva/);
});

test('PDF: un gráfico con valores negativos se genera', async () => {
  const p = await informes.aPDF({ plantilla: 'red', titulo: 'x', desde: iso(T0), hasta: iso(T0 + 864e5), generado: iso(T0),
    bloques: [{ titulo: 'Pérdidas', partes: [{ grafico: { x: ['21/11', '22/11'], series: [{ label: 'Pérdida', unidad: 'kWh', valores: [50, -14000] }, { label: 'Pérdida', unidad: '%', valores: [5, -33] }] } }] }] }, null);
  assert.equal(p.slice(0, 4).toString(), '%PDF');
});
