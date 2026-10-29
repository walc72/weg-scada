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

// ── puntos libres: med / senal ──
const libre = (extra) => cfgR({ mapa: [...mapa(), ...extra] });
const errs = (cfg) => validateConfig(cfg);
const med = (o) => ({ key: 'med', nombre: 'Tensión fuente', unidad: 'V', fc: 3, addr: 9238, tipo: 's16', ...o });
const sen = (o) => ({ key: 'senal', nombre: 'Manual', fc: 1, addr: 0, tipo: 'bool', ...o });

test('med y senal válidos', () => {
  assert.deepEqual(errs(libre([med({ decimales: 2, principal: true, rol: 'fp', escala: 0.01 }), sen({ principal: true }), sen({ nombre: 'Otra', fc: 3, tipo: 'u16', bit: 2 })])), []);
});
test('suma de med con igual nombre', () => {
  const ok = [med({ nombre: 'Operaciones', addr: 9290, escala: 1000 }), med({ nombre: 'Operaciones', addr: 9292 })];
  assert.deepEqual(errs(libre(ok)), []);
  const bad = libre([med({ nombre: 'Operaciones' }), med({ nombre: 'Operaciones', unidad: 'A', addr: 9292 })]);
  assert.match(errs(bad).join('\n'), /reconectadores\[0\] \(Reco 1\): mapa\[6\]/);
});
test('errores de med y senal', () => {
  const bad = [
    [[med(), sen({ nombre: 'tension fuente' })], 'colisiona'],
    [[med({ nombre: 'A' }), med({ nombre: 'a', addr: 1 })], 'colisiona'],
    [[sen(), sen({ addr: 1 })], 'repetido'],
    [Array.from({ length: 9 }, (_, k) => med({ nombre: `P${k}`, principal: true })), 'maximo 8'],
    [[med({ nombre: 'A', rol: 'kw' }), med({ nombre: 'B', rol: 'kw' })], 'rol repetido'],
    [[med({ rol: 'xx' })], 'rol invalido'],
    [[med({ nombre: '' })], 'nombre requerido'],
    [[med({ nombre: 'x'.repeat(41) })], 'nombre requerido'],
    [[med({ nombre: '---' })], 'sin letras ni numeros'],
    [[med({ decimales: 4 })], 'decimales'],
    [[med({ unidad: 'x'.repeat(11) })], 'unidad'],
    [[med({ principal: 'si' })], 'principal'],
    [[med({ tipo: 'u16', bit: 1 })], 'numerica'],
    [[sen({ fc: 3, tipo: 'u16' })], 'bit o valor requerido'],
  ];
  for (const [pts, frag] of bad) assert.match(errs(libre(pts)).join('\n'), new RegExp(frag), frag);
});

test('banco de reguladores: texto 1–40 y hasta 3 reguladores por banco', () => {
  const regs = (n, banco) => Array.from({ length: n }, (_, i) => reg({ name: `R${i + 1}`, banco }));
  assert.deepEqual(validateConfig({ ...plant(), reguladores: regs(3, 'RUA-01') }), []);
  assert.deepEqual(validateConfig({ ...plant(), reguladores: [reg({ banco: undefined })] }), []);
  assert.ok(validateConfig({ ...plant(), reguladores: regs(4, 'RUA-01') }).some(e => /banco RUA-01: hasta 3/.test(e)));
  assert.ok(validateConfig({ ...plant(), reguladores: [reg({ banco: '' })] }).some(e => /banco invalido/.test(e)));
  assert.ok(validateConfig({ ...plant(), reguladores: [reg({ banco: 'x'.repeat(41) })] }).some(e => /banco invalido/.test(e)));
  assert.ok(validateConfig({ ...plant(), reguladores: [reg({ banco: 3 })] }).some(e => /banco invalido/.test(e)));
});

// DNP3
const dmapa = () => [
  { key: 'v', obj: 'ai', addr: 0, escala: 0.01 },
  { key: 'auto', obj: 'bi', addr: 7 },
  { key: 'alarma', obj: 'bi', addr: 8, texto: 'Bloqueado' },
  { key: 'senal', nombre: 'Motor elevando', obj: 'bi', addr: 3, principal: true },
  { key: 'med', nombre: 'Operaciones', obj: 'ctr', addr: 0 },
];
const dreg = (o = {}) => ({ name: 'Reg D', modelo: 'tsea-dnp3', ip: '10.0.0.7', protocolo: 'dnp3', port: 20000, dnp3: { outstation: 10, maestro: 1 }, mapa: dmapa(), ...o });
const cfgD = (o) => ({ ...plant(), reguladores: [dreg(o)] });
const dpt = (p) => cfgD({ mapa: [p] });
const hay = (c, txt) => assert.ok(validateConfig(c).some(e => e.includes(txt)), txt + ' :: ' + validateConfig(c).join(' | '));

test('DNP3: válido, sin unitId ni port ni dnp3', () => {
  assert.deepEqual(validateConfig(cfgD()), []);
  const sin = dreg(); delete sin.port; delete sin.dnp3;
  assert.deepEqual(validateConfig({ ...plant(), reguladores: [sin] }), []);
  assert.deepEqual(validateConfig(cfgG({ protocolo: 'modbus' })), []);
});
test('DNP3: errores de equipo', () => {
  hay(cfgD({ protocolo: 'x' }), 'protocolo');
  hay(cfgD({ dnp3: { outstation: 70000, maestro: 1 } }), 'dnp3.outstation');
  hay(cfgD({ dnp3: { outstation: 10, maestro: -1 } }), 'dnp3.maestro');
  hay(cfgD({ port: 0 }), 'port');
});
test('DNP3: errores de punto', () => {
  hay(dpt({ key: 'v', obj: 'ai', addr: 0, fc: 3 }), 'fc');
  hay(dpt({ key: 'v', obj: 'ai', addr: 0, tipo: 'u16' }), 'tipo');
  hay(dpt({ key: 'v', obj: 'ai', addr: 0, orden: 'BE' }), 'orden');
  hay(dpt({ key: 'v', obj: 'zz', addr: 0 }), 'obj');
  hay(dpt({ key: 'v', addr: 0 }), 'obj');
  hay(dpt({ key: 'v', obj: 'ai', addr: 70000 }), 'addr');
  hay(dpt({ key: 'auto', obj: 'bi', addr: 7, escala: 1 }), 'escala');
  hay(dpt({ key: 'auto', obj: 'bi', addr: 7, bit: 0 }), 'bit');
  hay(dpt({ key: 'v', obj: 'bi', addr: 7 }), 'numerica');
  hay(dpt({ key: 'auto', obj: 'ai', addr: 7 }), 'bit o valor');
});
test('DNP3: ai con bit/valor sirve de key sí/no; escala en ai', () => {
  assert.deepEqual(validateConfig(dpt({ key: 'auto', obj: 'ai', addr: 7, bit: 2 })), []);
  assert.deepEqual(validateConfig(dpt({ key: 'remoto', obj: 'ctr', addr: 7, valor: 3 })), []);
  assert.deepEqual(validateConfig(dpt({ key: 'v', obj: 'ai', addr: 0, escala: 0.01 })), []);
});
test('DNP3: reglas de keys comunes (repetida, nombre, 1-64, principales)', () => {
  hay(cfgD({ mapa: [{ key: 'v', obj: 'ai', addr: 0 }, { key: 'v', obj: 'ai', addr: 1 }] }), 'repetida');
  const sn = { key: 'senal', nombre: 'S', obj: 'bi', addr: 0 };
  hay(cfgD({ mapa: [sn, { ...sn, addr: 1 }] }), 'repetido');
  hay(cfgD({ mapa: [] }), 'mapa');
  const gr = Array.from({ length: 65 }, (_, i) => ({ key: 'alarma', obj: 'bi', addr: i, texto: 'x' }));
  hay(cfgD({ mapa: gr }), 'mapa');
  const nueve = Array.from({ length: 9 }, (_, i) => ({ key: 'senal', nombre: 'S' + i, obj: 'bi', addr: i, principal: true }));
  hay(cfgD({ mapa: nueve }), 'principales');
});
test('Modbus rechaza obj', () => {
  hay(cfgG({ mapa: [{ key: 'tap', fc: 3, addr: 0, tipo: 's16', obj: 'ai' }] }), 'obj');
});
