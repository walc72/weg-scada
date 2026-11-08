'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { createInfluxQueue } = require('../src/influxQueue');

const mudo = { log() {}, error() {} };

function falso(respuestas) {
  const enviados = [];
  const enviar = async (body) => {
    enviados.push(body);
    const r = respuestas.length ? respuestas.shift() : 204;
    if (r instanceof Error) throw r;
    return r;
  };
  return { enviar, enviados };
}

test('escribe y vacía la cola', async () => {
  const f = falso([204]);
  const q = createInfluxQueue({ enviar: f.enviar, log: mudo });
  q.agregar('a 1'); await q.vaciar();
  assert.deepStrictEqual(f.enviados, ['a 1']);
  assert.deepStrictEqual(q.pendientes(), { lotes: 0, bytes: 0 });
});

test('un lote que falla se reintenta junto con el siguiente, en orden', async () => {
  const f = falso([503, 204]);
  const q = createInfluxQueue({ enviar: f.enviar, log: mudo });
  q.agregar('a 1'); await q.vaciar();
  assert.strictEqual(q.pendientes().lotes, 1);
  q.agregar('a 2'); await q.vaciar();
  assert.deepStrictEqual(f.enviados, ['a 1', 'a 1\na 2']);
  assert.strictEqual(q.pendientes().lotes, 0);
});

test('error de red (sin respuesta) también queda en cola', async () => {
  const f = falso([new Error('ECONNREFUSED'), 204]);
  const q = createInfluxQueue({ enviar: f.enviar, log: mudo });
  q.agregar('a 1'); await q.vaciar();
  assert.strictEqual(q.pendientes().lotes, 1);
  await q.vaciar();
  assert.strictEqual(q.pendientes().lotes, 0);
});

test('400 y 422 se descartan (reintentar datos inválidos no sirve)', async () => {
  for (const st of [400, 422]) {
    const f = falso([st]);
    const q = createInfluxQueue({ enviar: f.enviar, log: mudo });
    q.agregar('mal'); await q.vaciar();
    assert.strictEqual(q.pendientes().lotes, 0);
  }
});

test('acotada por bytes: descarta lo más viejo', async () => {
  const f = falso([503, 503, 503, 204]);
  const q = createInfluxQueue({ enviar: f.enviar, maxBytes: 10, log: mudo });
  for (const b of ['aaaa', 'bbbb', 'cccc']) { q.agregar(b); await q.vaciar(); }
  assert.deepStrictEqual(q.pendientes(), { lotes: 2, bytes: 8 });
  q.agregar(''); await q.vaciar();
  assert.deepStrictEqual(f.enviados.at(-1), 'bbbb\ncccc');
});

test('pedidos de a maxPedido bytes: una cola grande sale en varios pedidos seguidos', async () => {
  const f = falso([503]);
  const q = createInfluxQueue({ enviar: f.enviar, maxPedido: 9, log: mudo });
  for (const b of ['aaaa', 'bbbb', 'cccc']) q.agregar(b);
  await q.vaciar(); // falla el primer pedido
  await q.vaciar();
  assert.deepStrictEqual(f.enviados, ['aaaa\nbbbb', 'aaaa\nbbbb', 'cccc']);
  assert.strictEqual(q.pendientes().lotes, 0);
});

test('un solo pedido en vuelo: lo que llega mientras tanto espera y no se pierde', async () => {
  let soltar;
  const enviados = [];
  const enviar = (b) => { enviados.push(b); return new Promise(r => { soltar = r; }); };
  const q = createInfluxQueue({ enviar, log: mudo });
  q.agregar('a 1');
  const p = q.vaciar();
  q.agregar('a 2'); await q.vaciar(); // en vuelo: no manda otro
  assert.strictEqual(enviados.length, 1);
  soltar(204); await new Promise(setImmediate);
  soltar(204); await p;
  assert.deepStrictEqual(enviados, ['a 1', 'a 2']);
  assert.strictEqual(q.pendientes().lotes, 0);
});

// Al apagar (SIGTERM de una actualización) se reintenta hasta vaciar o hasta el plazo
test('drenar: reintenta hasta que Influx vuelve y vacía la cola', async () => {
  const f = falso([503, new Error('ECONNREFUSED'), 204]);
  const q = createInfluxQueue({ enviar: f.enviar, log: mudo });
  q.agregar('a 1');
  assert.strictEqual(await q.drenar({ plazoMs: 2000, pausaMs: 5 }), true);
  assert.strictEqual(f.enviados.length, 3);
  assert.deepStrictEqual(q.pendientes(), { lotes: 0, bytes: 0 });
});

test('drenar: si Influx no vuelve, se rinde al cumplirse el plazo y conserva la cola', async () => {
  const f = falso(Array(1000).fill(503));
  const q = createInfluxQueue({ enviar: f.enviar, log: mudo });
  q.agregar('a 1');
  const t0 = Date.now();
  assert.strictEqual(await q.drenar({ plazoMs: 60, pausaMs: 5 }), false);
  assert.ok(Date.now() - t0 < 500);
  assert.strictEqual(q.pendientes().lotes, 1);
});

test('drenar: un pedido colgado no estira el plazo', async () => {
  const q = createInfluxQueue({ enviar: () => new Promise(() => {}), log: mudo });
  q.agregar('a 1');
  const t0 = Date.now();
  assert.strictEqual(await q.drenar({ plazoMs: 60, pausaMs: 5 }), false);
  assert.ok(Date.now() - t0 < 500);
});

test('drenar con la cola vacía responde enseguida', async () => {
  const q = createInfluxQueue({ enviar: async () => 204, log: mudo });
  assert.strictEqual(await q.drenar({ plazoMs: 1000 }), true);
});
