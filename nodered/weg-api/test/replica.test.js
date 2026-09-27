'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const createReplicaRouter = require('../src/routes/replica');

const NOW = Date.parse('2026-09-27T12:00:00Z');
const TOKEN = 'tok-123';
const CSV_POINT = [
  '#datatype,string,long,dateTime:RFC3339,dateTime:RFC3339,dateTime:RFC3339,double,string,string,string',
  ',result,table,_start,_stop,_time,_value,_field,_measurement,name',
  ',_result,0,2026-09-27T10:00:00Z,2026-09-27T11:00:00Z,2026-09-27T10:00:10Z,12.5,current,drive_data,SAER 8',
].join('\n');

async function serve(opts = {}) {
  const calls = [];
  const deps = {
    token: TOKEN,
    queryCsv: async (flux) => {
      calls.push(flux);
      if (flux.includes('min(column')) return '#datatype,string,long,dateTime:RFC3339\n,result,table,_time\n,_result,0,2026-09-08T10:00:00Z\n';
      if (flux.includes('max(column')) return '#datatype,string,long,dateTime:RFC3339\n,result,table,_time\n,_result,0,2026-09-27T11:59:50Z\n';
      return CSV_POINT;
    },
    bucket: () => 'weg_drives',
    getConfig: () => ({ devices: [{ name: 'SAER 8' }], influxdb: { url: 'http://influxdb:8086', org: 'o', bucket: 'weg_drives', token: 'SECRET' } }),
    getManual: () => ({ '2026-09-26': { rainMm: 3 } }),
    now: () => NOW,
    ...opts,
  };
  const app = express();
  app.use('/api/replica', createReplicaRouter(deps));
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  const server = await new Promise(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  const base = `http://127.0.0.1:${server.address().port}/api/replica`;
  const get = (p, token = TOKEN) => fetch(base + p, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { get, calls, close: () => new Promise(r => server.close(r)) };
}

test('feature off without token → 404', async () => {
  const s = await serve({ token: '' });
  try { assert.equal((await s.get('/info')).status, 404); } finally { await s.close(); }
});

test('missing or wrong token → 401, then 429 after 10 failures', async () => {
  const s = await serve();
  try {
    assert.equal((await s.get('/info', null)).status, 401);
    assert.equal((await s.get('/info', 'nope')).status, 401);
    for (let i = 0; i < 8; i++) await s.get('/info', 'nope');
    assert.equal((await s.get('/info', 'nope')).status, 429);
  } finally { await s.close(); }
});

test('/config strips influx token; /manual returns the file', async () => {
  const s = await serve();
  try {
    const cfg = await (await s.get('/config')).json();
    assert.equal(cfg.devices[0].name, 'SAER 8');
    assert.equal(cfg.influxdb.token, undefined);
    assert.equal(cfg.influxdb.org, 'o');
    assert.deepEqual(await (await s.get('/manual')).json(), { '2026-09-26': { rainMm: 3 } });
  } finally { await s.close(); }
});

test('/info returns oldest/newest', async () => {
  const s = await serve();
  try {
    const info = await (await s.get('/info')).json();
    assert.equal(info.bucket, 'weg_drives');
    assert.equal(info.oldest, '2026-09-08T10:00:00Z');
    assert.equal(info.newest, '2026-09-27T11:59:50Z');
  } finally { await s.close(); }
});

test('/points invalid since → 400', async () => {
  const s = await serve();
  try { assert.equal((await s.get('/points?since=ayer')).status, 400); } finally { await s.close(); }
});

test('/points serves one window as line protocol with cursor and more=1', async () => {
  const s = await serve();
  try {
    const r = await s.get('/points?since=2026-09-27T10:00:00.000Z&windowSec=3600');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-27T11:00:00.000Z');
    assert.equal(r.headers.get('x-more'), '1');
    assert.match(await r.text(), /^drive_data,name=SAER\\ 8 current=12.5 \d+$/);
    const flux = s.calls.at(-1);
    assert.match(flux, /start: time\(v: "2026-09-27T10:00:00.000Z"\), stop: time\(v: "2026-09-27T11:00:00.000Z"\)/);
    assert.match(flux, /r._measurement == "drive_data" or r._measurement == "meter_data"/);
  } finally { await s.close(); }
});

test('/points clamps the window to now-10s and reports more=0', async () => {
  const s = await serve();
  try {
    const r = await s.get('/points?since=2026-09-27T11:30:00.000Z&windowSec=3600');
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-27T11:59:50.000Z');
    assert.equal(r.headers.get('x-more'), '0');
  } finally { await s.close(); }
});

test('/points with since at the horizon returns empty body and same cursor', async () => {
  const s = await serve();
  try {
    const before = s.calls.length;
    const r = await s.get('/points?since=2026-09-27T11:59:55.000Z');
    assert.equal(await r.text(), '');
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-27T11:59:55.000Z');
    assert.equal(r.headers.get('x-more'), '0');
    assert.equal(s.calls.length, before); // no consulta a Influx
  } finally { await s.close(); }
});

// Una ventana de 24 h son ~180 MB de CSV en memoria: tope de 1 h para no tumbar la API de planta
test('/points windowSec is capped at 3600', async () => {
  const s = await serve({ now: () => Date.parse('2026-12-01T00:00:00Z') });
  try {
    const r = await s.get('/points?since=2026-09-01T00:00:00.000Z&windowSec=86400');
    assert.equal(r.headers.get('x-next-cursor'), '2026-09-01T01:00:00.000Z');
  } finally { await s.close(); }
});
