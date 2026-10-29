'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig, validateCampo, CAMPO_KEYS } = require('../src/services/validate');

function plant() {
  return {
    pollIntervalMs: 2000,
    devices: [{ name: 'IMBIL 1', type: 'SSW900', ip: '192.168.10.70', port: 502, unitId: 1, regOffset: 0, statusOffset: 679, gateway: 'ADAM', enabled: true }],
    gateways: [],
    comms: [{ name: 'Radio 1', tipo: 'airmax', ip: '192.168.10.20', enabled: true }],
  };
}
const mapa = () => [
  { key: 'estado', fc: 3, addr: 0, tipo: 'u16', bit: 0 },
  { key: 'ia', fc: 3, addr: 1, tipo: 'f32', orden: 'LE', escala: 0.1 },
  { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 0, texto: 'Falla A' },
  { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 1, texto: 'Falla B' },
  { key: 'bloqueo', fc: 4, addr: 6, tipo: 'u16', valor: 2 },
];
const reco = (o = {}) => ({ name: 'Reco 1', modelo: 'pmsetu', ip: '10.0.0.5', port: 502, unitId: 1, enlace: 'Radio 1', enabled: true, mapa: mapa(), ...o });
const reg = (o = {}) => ({ name: 'Reg 1', modelo: 'tsea', ip: '10.0.0.6', tapMin: -16, tapMax: 16, mapa: [{ key: 'tap', fc: 3, addr: 0, tipo: 's16' }], ...o });
const cfgR = (o) => ({ ...plant(), reconectadores: [reco(o)] });
const cfgG = (o) => ({ ...plant(), reguladores: [reg(o)] });
const pt = (o) => ({ mapa: [{ key: 'estado', fc: 3, addr: 0, tipo: 'u16', ...o }] });

test('válidos', () => {
  assert.deepEqual(validateConfig({ ...plant(), reconectadores: [reco()], reguladores: [reg({ enlace: 'Radio 1' })] }), []);
  assert.deepEqual(CAMPO_KEYS.reg.includes('tap'), true);
});
test('errores de equipo', () => {
  const bad = [
    [cfgR({ modelo: 'tsea' }), 'reconectadores[0] (Reco 1): modelo'],
    [cfgR({ port: 0 }), 'port'],
    [cfgR({ unitId: 256 }), 'unitId'],
    [cfgG({ tapMin: 5, tapMax: 5 }), 'tapMin'],
    [cfgG({ tapMin: 1.5 }), 'tapMin'],
    [cfgR({ enabled: 'si' }), 'enabled'],
    [cfgR({ enlace: 'No existe' }), 'No existe'],
    [cfgR({ ip: '' }), 'ip'],
  ];
  for (const [c, txt] of bad) assert.ok(validateConfig(c).some(e => e.includes(txt)), txt);
});
test('errores de mapa', () => {
  assert.ok(validateConfig(cfgR({ mapa: [] })).some(e => e.includes('mapa')));
  const grande = Array.from({ length: 65 }, (_, i) => ({ key: 'alarma', fc: 3, addr: i, tipo: 'u16', bit: 0, texto: 'x' }));
  assert.ok(validateConfig(cfgR({ mapa: grande })).some(e => e.includes('mapa')));
  const casos = [
    [{ key: 'tap' }, 'key'], [{ fc: 1 }, 'fc'], [{ addr: 65536 }, 'addr'], [{ tipo: 'u8' }, 'tipo'],
    [{ orden: 'XX' }, 'orden'], [{ escala: 'a' }, 'escala'], [{ bit: 16 }, 'bit'],
    [{ bit: 1, valor: 1 }, 'bit'], [{ tipo: 'f32', bit: 1 }, 'bit'],
    [{ key: 'alarma', texto: 'x' }, 'bit'], [{ key: 'alarma', bit: 0 }, 'texto'],
    [{ key: 'alarma', bit: 0, texto: 'x'.repeat(81) }, 'texto'],
  ];
  for (const [o, campo] of casos) {
    const e = validateConfig(cfgR(pt(o)));
    assert.ok(e.some(m => m.startsWith('reconectadores[0] (Reco 1): mapa[0].' + campo)), JSON.stringify(o) + ' ' + e);
  }
  const dup = validateConfig(cfgR({ mapa: [pt({}).mapa[0], pt({}).mapa[0]] }));
  assert.ok(dup.some(m => m.includes('mapa[1].key')), String(dup));
});
test('tipo de punto por key: booleanas llevan bit/valor, numericas no', () => {
  const sin = validateConfig(cfgR({ mapa: [{ key: 'estado', fc: 3, addr: 0, tipo: 'u16' }] }));
  assert.ok(sin.some(m => m.startsWith('reconectadores[0] (Reco 1): mapa[0].bit o valor requerido en estado')), String(sin));
  const con = validateConfig(cfgR({ mapa: [{ key: 'ia', fc: 3, addr: 0, tipo: 'u16', bit: 0 }] }));
  assert.ok(con.some(m => m.startsWith('reconectadores[0] (Reco 1): mapa[0].ia es numerica')), String(con));
  const rg = validateConfig(cfgG({ mapa: [{ key: 'auto', fc: 3, addr: 0, tipo: 'u16' }] }));
  assert.ok(rg.some(m => m.includes('mapa[0].bit o valor requerido en auto')), String(rg));
});
test('fc 1/2 bool y comOk', () => {
  const ok = (m, k = 'estado') => validateConfig(cfgR({ mapa: [{ key: k, ...m }] }));
  assert.deepEqual(ok({ fc: 1, addr: 1, tipo: 'bool' }), []);
  assert.deepEqual(ok({ fc: 2, addr: 1, tipo: 'bool' }, 'alarma').filter(e => !e.includes('texto')), []);
  assert.deepEqual(ok({ fc: 3, addr: 0, tipo: 'u16', valor: 257 }, 'comOk'), []);
  assert.deepEqual(ok({ fc: 1, addr: 0, tipo: 'bool' }, 'comOk'), []);
  const malos = [
    [{ fc: 3, addr: 0, tipo: 'bool' }, 'estado', 'mapa[0].tipo'],
    [{ fc: 1, addr: 0, tipo: 'u16', bit: 0 }, 'estado', 'mapa[0].fc'],
    [{ fc: 1, addr: 0, tipo: 'bool', bit: 0 }, 'estado', 'mapa[0].bit'],
    [{ fc: 1, addr: 0, tipo: 'bool', valor: 1 }, 'estado', 'mapa[0].valor'],
    [{ fc: 1, addr: 0, tipo: 'bool', escala: 2 }, 'estado', 'mapa[0].escala'],
    [{ fc: 1, addr: 0, tipo: 'bool', orden: 'BE' }, 'estado', 'mapa[0].orden'],
    [{ fc: 1, addr: 0, tipo: 'bool' }, 'ia', 'mapa[0].ia'],
  ];
  for (const [m, k, txt] of malos) {
    const e = ok(m, k);
    assert.ok(e.some(x => x.startsWith('reconectadores[0] (Reco 1): ' + txt)), JSON.stringify(m) + ' ' + e);
  }
});
test('nombre repetido entre listas', () => {
  const a = { ...plant(), reconectadores: [reco({ name: 'IMBIL 1' })] };
  assert.ok(validateConfig(a).includes('nombre repetido entre variadores, reconectadores y reguladores: IMBIL 1'));
  const b = { ...plant(), reconectadores: [reco({ name: 'X' })], reguladores: [reg({ name: 'X' })] };
  assert.ok(validateConfig(b).includes('nombre repetido entre variadores, reconectadores y reguladores: X'));
});
