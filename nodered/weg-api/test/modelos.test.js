'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MODELOS, modeloId } = require('../src/services/modelos');
const { validateCampo, validateConfig } = require('../src/services/validate');

test('ids esperados', () => {
  assert.deepEqual(Object.keys(MODELOS).sort(), ['otro-reco', 'otro-reg', 'pmsetu', 'tapelectro', 'tsea', 'tsea-dnp3']);
});

test('cada mapa pasa validateCampo', () => {
  for (const [id, m] of Object.entries(MODELOS)) {
    const errors = [];
    validateCampo({ name: 'X', modelo: id.startsWith('otro') ? 'otro' : id, ip: '10.0.0.1', protocolo: m.protocolo, port: m.port, dnp3: m.dnp3, mapa: m.mapa }, 0, m.kind, errors);
    assert.deepEqual(errors, [], id);
  }
});

test('descripciones piden verificar direcciones', () => {
  for (const m of Object.values(MODELOS)) assert.match(m.descripcion, /direcciones a verificar en puesta en marcha/);
});

test('tsea: tabla de la spec 5.6', () => {
  const esperado = [
    { key: 'tap', fc: 3, addr: 0, tipo: 's16' },
    { key: 'v', fc: 3, addr: 1, tipo: 'u16', escala: 0.1 },
    { key: 'i', fc: 3, addr: 2, tipo: 'u16', escala: 0.1 },
    { key: 'vConsigna', fc: 3, addr: 3, tipo: 'u16', escala: 0.1 },
    { key: 'auto', fc: 3, addr: 4, tipo: 'u16', bit: 0 },
    { key: 'remoto', fc: 3, addr: 4, tipo: 'u16', bit: 1 },
    { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 0, texto: 'Tap en límite' },
    { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 1, texto: 'Falla de control' },
  ];
  assert.deepEqual(MODELOS.tsea.mapa, esperado);
});

test('tapelectro: RUA-01 por MGate (RG1)', () => {
  const m = MODELOS.tapelectro.mapa;
  assert.deepEqual(m[0], { key: 'tap', fc: 3, addr: 9216, tipo: 's16' });
  assert.deepEqual(m.find(p => p.key === 'comOk'), { key: 'comOk', fc: 3, addr: 25600, tipo: 'u16', valor: 257 });
  assert.equal(m.filter(p => p.key === 'alarma').length, 4);
  assert.ok(m.filter(p => p.fc === 1).every(p => p.tipo === 'bool'));
});

test('tapelectro: puntos libres de la spec 4.1', () => {
  const m = MODELOS.tapelectro.mapa;
  const f = (n) => m.filter(p => p.nombre === n);
  assert.deepEqual(f('Tensión fuente'), [{ key: 'med', nombre: 'Tensión fuente', unidad: 'V', principal: true, fc: 3, addr: 9238, tipo: 's16' }]);
  assert.deepEqual(f('Operaciones').map(p => [p.addr, p.escala]), [[9290, 1000], [9292, undefined]]);
  assert.deepEqual(f('Motor elevando'), [{ key: 'senal', nombre: 'Motor elevando', principal: true, fc: 1, addr: 48, tipo: 'bool' }]);
  assert.ok(m.length <= 64);
});

test('otros y modeloId', () => {
  assert.deepEqual(MODELOS['otro-reco'].mapa, [{ key: 'estado', fc: 3, addr: 0, tipo: 'u16', bit: 0 }]);
  assert.deepEqual(MODELOS['otro-reg'].mapa, [{ key: 'tap', fc: 3, addr: 0, tipo: 's16' }]);
  assert.equal(modeloId('reg', 'otro'), 'otro-reg');
  assert.equal(modeloId('reco', 'otro'), 'otro-reco');
  assert.equal(modeloId('reco', 'pmsetu'), 'pmsetu');
});

test('server.js importa requireAdmin (grep)', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../src/server.js'), 'utf8');
  assert.match(src, /const \{[^}]*requireAdmin[^}]*\} = require\('\.\/middleware\/auth'\)/);
});

test('GET /api/modelos devuelve MODELOS', async () => {
  const express = require('express');
  const http = require('node:http');
  const { requireAdmin } = require('../src/middleware/auth');
  assert.equal(typeof requireAdmin, 'function');
  const app = express();
  app.use('/api/modelos', (req, res, next) => { req.user = { role: 'admin' }; next(); }, require('../src/routes/modelos'));
  const srv = app.listen(0);
  try {
    const body = await new Promise((ok, ko) => http.get(`http://127.0.0.1:${srv.address().port}/api/modelos`, (r) => {
      let d = ''; r.on('data', (c) => d += c); r.on('end', () => ok(JSON.parse(d)));
    }).on('error', ko));
    assert.deepEqual(body, MODELOS);
  } finally { srv.close(); }
});

test('tsea-dnp3: modelo DNP3 sin fc/tipo y validateConfig lo acepta', () => {
  const m = MODELOS['tsea-dnp3'];
  assert.equal(m.kind, 'reg');
  assert.equal(m.protocolo, 'dnp3');
  assert.equal(m.port, 20000);
  assert.deepEqual(m.dnp3, { outstation: 10, maestro: 3 });
  assert.equal(m.mapa.length, 22);
  for (const p of m.mapa) assert.ok(p.fc === undefined && p.tipo === undefined && p.obj);
  assert.deepEqual(m.mapa[0], { key: 'v', obj: 'ai', addr: 3, escala: 0.01 });
  // mismo orden de mediciones que el Tapelectro: Operaciones al final
  const meds = m.mapa.filter((p) => p.key === 'med').map((p) => p.nombre);
  assert.deepEqual(meds, ['Desfase V–I', 'Factor de potencia', 'Potencia activa', 'Potencia reactiva', 'Tap mínimo memorizado', 'Tap máximo memorizado', 'Operaciones']);
  assert.match(m.descripcion, /TV/);
  const reg = { name: 'R', modelo: 'tsea-dnp3', ip: '10.0.0.9', protocolo: m.protocolo, port: m.port, dnp3: m.dnp3, mapa: m.mapa };
  assert.deepEqual(validateConfig({ devices: [], reguladores: [reg] }), []);
});
