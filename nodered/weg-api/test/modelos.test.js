'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MODELOS, modeloId } = require('../src/services/modelos');
const { validateCampo, validateConfig } = require('../src/services/validate');

test('ids esperados', () => {
  assert.deepEqual(Object.keys(MODELOS).sort(), ['dse8610', 'hgm6120', 'il4', 'otro-gen', 'otro-reco', 'otro-reg', 'pmsetu', 'tapelectro', 'tsea', 'tsea-dnp3']);
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

test('pmsetu: ADVC «MODBUS Standard ACR» verificado contra WSOS', () => {
  const m = MODELOS.pmsetu.mapa;
  const k = (key) => m.find(p => p.key === key);
  assert.deepEqual(k('estado'), { key: 'estado', fc: 2, addr: 5, tipo: 'bool' });
  assert.deepEqual(k('ia'), { key: 'ia', fc: 3, addr: 0, tipo: 'u16' });
  assert.deepEqual(k('va'), { key: 'va', fc: 3, addr: 4, tipo: 'u16', escala: 2 });
  assert.deepEqual(m.find(p => p.nombre === 'Potencia activa'), { key: 'med', nombre: 'Potencia activa', unidad: 'kW', principal: true, rol: 'kw', fc: 3, addr: 17, tipo: 's16', escala: 4 });
  // fc 1 son salidas de comando del ADVC: nunca se leen
  assert.ok(m.every(p => p.fc === 2 || p.fc === 3));
  assert.ok(m.filter(p => p.fc === 2).every(p => p.tipo === 'bool'));
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

test('dse8610: GenComm, 32 bits BE y alarmas de la página 154', () => {
  const m = MODELOS.dse8610.mapa;
  const k = (key) => m.find((p) => p.key === key);
  assert.deepEqual(k('modo'), { key: 'modo', fc: 3, addr: 772, tipo: 'u16' });
  assert.deepEqual(k('vl1n'), { key: 'vl1n', fc: 3, addr: 1032, tipo: 'u32', escala: 0.1 });
  assert.deepEqual(k('kw'), { key: 'kw', fc: 3, addr: 1536, tipo: 's32', escala: 0.001 });
  assert.equal(k('arranques').addr, 1808);
  assert.ok(m.every((p) => p.orden === undefined)); // BE por defecto
  const al = m.filter((p) => p.key === 'alarma');
  assert.equal(al.length, 39); // familia 8xxx
  al.forEach((p, i) => {
    const k1 = i + 1;
    assert.equal(p.addr, 39424 + 1 + Math.floor((k1 - 1) / 4), p.texto);
    assert.equal(p.nib, 12 - 4 * ((k1 - 1) % 4), p.texto);
  });
  assert.deepEqual([al[0].addr, al[0].nib, al[4].addr, al[4].nib, al[22].addr, al[22].nib], [39425, 12, 39426, 12, 39430, 4]);
  assert.equal(al[22].texto, 'Bajo nivel de combustible');
  assert.ok(m.length <= 96);
  const gen = { name: 'GE 1', modelo: 'dse8610', ip: '10.0.0.7', port: 502, unitId: 10, mapa: m };
  assert.deepEqual(validateConfig({ devices: [], generadores: [gen] }), []);
  assert.equal(modeloId('gen', 'otro'), 'otro-gen');
});

test('il4: ComAp InteliLite 4, registros fijos válidos y alarmas por estado del motor', () => {
  const m = MODELOS.il4.mapa;
  assert.equal(MODELOS.il4.kind, 'gen');
  const k = (key) => m.find((p) => p.key === key);
  assert.deepEqual([k('modo').addr, k('rpm').addr, k('kw').addr, k('hz').addr, k('horas').addr], [1382, 1004, 1020, 1036, 1013]);
  assert.equal(k('horas').tipo, 'u32');
  assert.deepEqual(m.filter((p) => p.key === 'alarma').map((p) => [p.addr, p.valor]), [[1298, 2], [1298, 12]]);
  const gen = { name: 'GE 2', modelo: 'il4', ip: '10.0.0.8', port: 502, unitId: 1, mapa: m };
  assert.deepEqual(validateConfig({ devices: [], generadores: [gen] }), []);
});

test('hgm6120: SmartGen por coils y holding, contadores partidos y advertencias con nivel', () => {
  const m = MODELOS.hgm6120.mapa;
  assert.equal(MODELOS.hgm6120.kind, 'gen');
  assert.ok(m.length <= 96);
  const k = (key) => m.filter((p) => p.key === key);
  assert.deepEqual([k('rpm')[0].addr, k('kw')[0].addr, k('il1')[0].escala, k('fp')[0].escala], [23, 26, 0.1, 0.01]);
  assert.deepEqual(k('horas').map((p) => [p.addr, p.escala ?? 1]), [[42, 10000], [43, 1], [44, 1 / 60]]);
  assert.deepEqual(k('arranques').map((p) => [p.addr, p.escala ?? 1]), [[46, 10000], [47, 1]]);
  const al = k('alarma');
  assert.equal(al.length, 36);
  assert.ok(al.every((p) => p.fc === 1 && p.tipo === 'bool'));
  assert.deepEqual(al.filter((p) => p.nivel === 2).map((p) => p.addr), Array.from({ length: 16 }, (_, i) => 24 + i));
  const gen = { name: 'GE 3', modelo: 'hgm6120', ip: '10.0.0.9', port: 502, unitId: 1, mapa: m };
  assert.deepEqual(validateConfig({ devices: [], generadores: [gen] }), []);
});

test('gen: horas/arranques pueden repetirse; nivel solo 2/3/4 y sin nib', () => {
  const base = { name: 'G', modelo: 'otro', ip: '10.0.0.1', port: 502, unitId: 1 };
  const err = (mapa) => { const e = []; validateCampo({ ...base, mapa }, 0, 'gen', e); return e; };
  assert.deepEqual(err([{ key: 'horas', fc: 3, addr: 0, tipo: 'u16' }, { key: 'horas', fc: 3, addr: 1, tipo: 'u16' }]), []);
  assert.ok(err([{ key: 'kw', fc: 3, addr: 0, tipo: 'u16' }, { key: 'kw', fc: 3, addr: 1, tipo: 'u16' }]).some((e) => e.includes('repetida')));
  assert.deepEqual(err([{ key: 'alarma', fc: 1, addr: 0, tipo: 'bool', nivel: 2, texto: 'A' }]), []);
  assert.ok(err([{ key: 'alarma', fc: 1, addr: 0, tipo: 'bool', nivel: 5, texto: 'A' }]).some((e) => e.includes('nivel')));
  assert.ok(err([{ key: 'alarma', fc: 3, addr: 0, tipo: 'u16', nib: 0, nivel: 2, texto: 'A' }]).some((e) => e.includes('nivel')));
});
