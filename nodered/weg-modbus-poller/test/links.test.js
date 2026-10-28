'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { linkOf, withLink, dependents } = require('../src/links');

const cfg = {
  comms: [{ name: 'Radio 1', tipo: 'airmax' }, { name: 'RUT Norte', tipo: 'rut' }],
  gateways: [{ name: 'PLC 1', enlace: 'Radio 1' }, { name: 'PLC 2', enlace: 'RUT Norte' }],
  devices: [
    { name: 'SAER 1', gateway: 'PLC 1' },
    { name: 'SAER 2', gateway: 'PLC 1' },
    { name: 'SAER 3', gateway: 'PLC 2' },
    { name: 'CFW 1', enlace: 'RUT Norte' },
    { name: 'CFW 2', enlace: 'Fantasma' },
  ],
  meters: [{ name: 'PM8000', enlace: 'Radio 1' }],
  flowmeters: [{ name: 'TUF 1', enlace: 'RUT Norte' }],
};
const dev = (n) => cfg.devices.find((d) => d.name === n);
const states = (m) => (name) => m[name];

test('linkOf: device con gateway hereda el enlace del gateway', () => {
  assert.equal(linkOf(dev('SAER 1'), 'device', cfg), 'Radio 1');
});

test('linkOf: device directo usa el propio', () => {
  assert.equal(linkOf(dev('CFW 1'), 'device', cfg), 'RUT Norte');
  assert.equal(linkOf(cfg.meters[0], 'meter', cfg), 'Radio 1');
});

test('linkOf: enlace inexistente o ausente → null', () => {
  assert.equal(linkOf(dev('CFW 2'), 'device', cfg), null);
  assert.equal(linkOf({ name: 'x' }, 'meter', cfg), null);
  assert.equal(linkOf({ name: 'x', gateway: 'NoHay' }, 'device', cfg), null);
});

test('withLink: equipo offline + enlace caído → sinEnlace', () => {
  const out = withLink({ name: 'SAER 1', online: false }, dev('SAER 1'), 'device', cfg, states({ 'Radio 1': { online: false } }));
  assert.equal(out.sinEnlace, 'Radio 1');
});

test('withLink: enlace en línea → sin la clave (y borra una vieja)', () => {
  const out = withLink({ name: 'SAER 1', online: false, sinEnlace: 'Radio 1' }, dev('SAER 1'), 'device', cfg, states({ 'Radio 1': { online: true } }));
  assert.equal('sinEnlace' in out, false);
});

test('withLink: equipo online con enlace caído → sin la clave', () => {
  const out = withLink({ name: 'SAER 1', online: true }, dev('SAER 1'), 'device', cfg, states({ 'Radio 1': { online: false } }));
  assert.equal('sinEnlace' in out, false);
});

test('withLink: commState vacío → sin la clave', () => {
  const out = withLink({ name: 'SAER 1', online: false, sinEnlace: 'Radio 1' }, dev('SAER 1'), 'device', cfg, states({}));
  assert.equal('sinEnlace' in out, false);
});

test('dependents: dependents del enlace (gateway, directos, medidores, caudalímetros)', () => {
  const names = (n) => dependents(n, cfg).map(({ kind, item }) => `${kind}:${item.name}`).sort();
  assert.deepEqual(names('Radio 1'), ['device:SAER 1', 'device:SAER 2', 'meter:PM8000']);
  assert.deepEqual(names('RUT Norte'), ['device:CFW 1', 'device:SAER 3', 'flowmeter:TUF 1']);
  assert.deepEqual(names('Fantasma'), []);
});

test('dependents: desactivados no cuentan (no se revive su retenido)', () => {
  const c = { ...cfg,
    devices: [{ name: 'D1', enlace: 'Radio 1', enabled: false }, { name: 'D2', enlace: 'Radio 1' }],
    meters: [{ name: 'M1', enlace: 'Radio 1', enabled: false }],
    flowmeters: [{ name: 'F1', enlace: 'Radio 1', enabled: false }] };
  assert.deepEqual(dependents('Radio 1', c).map(({ item }) => item.name), ['D2']);
});

test('reconectadores y reguladores: enlace propio y dependents', () => {
  const reco = { name: 'Reco 1', enlace: 'Radio 1' };
  const c = { comms: [{ name: 'Radio 1' }],
    reconectadores: [reco],
    reguladores: [{ name: 'Reg 1', enlace: 'Radio 1' }, { name: 'Reg 2', enlace: 'Radio 1', enabled: false }] };
  assert.equal(linkOf(reco, 'reco', c), 'Radio 1');
  const deps = dependents('Radio 1', c);
  assert.deepEqual(deps.map(({ kind, item }) => `${kind}:${item.name}`).sort(), ['reco:Reco 1', 'reg:Reg 1']);
});
