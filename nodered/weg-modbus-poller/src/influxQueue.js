'use strict';

// Cola de escrituras a InfluxDB. Un lote que no se pudo escribir (Influx reiniciando,
// actualización, timeout) queda en cola y se reintenta en la vuelta siguiente, en orden
// y con un solo pedido en vuelo. Cada punto lleva su timestamp, así que escribirlo tarde
// no lo corre de lugar, y repetir uno es inocuo (Influx lo pisa).
// Acotada por bytes: si Influx no vuelve, se descarta lo más viejo.
//
// enviar(body) -> Promise<status HTTP>; rechaza si no hubo respuesta.
// 204 = escrito. 400/422 = datos rechazados (reintentarlos no sirve): se descartan.
// Cualquier otro estado o error: el lote queda para la próxima.
const DESCARTAR = new Set([400, 422]);

function createInfluxQueue({ enviar, maxBytes = 32e6, maxPedido = 4e6, log = console }) {
  const lotes = [];
  let bytes = 0;
  let enVuelo = false;
  let fallando = false;

  function agregar(body) {
    if (body) { lotes.push(body); bytes += Buffer.byteLength(body); }
    // No se recorta mientras hay un pedido en vuelo: sus lotes son los primeros de la cola
    let tirados = 0;
    while (!enVuelo && bytes > maxBytes && lotes.length > 1) { bytes -= Buffer.byteLength(lotes.shift()); tirados++; }
    if (tirados) log.error(`[INFLUX] Cola llena: se descartan ${tirados} lotes viejos`);
  }

  async function vaciar() {
    if (enVuelo) return;
    enVuelo = true;
    try {
      while (lotes.length) {
        let n = 0, tam = 0;
        while (n < lotes.length && (n === 0 || tam + Buffer.byteLength(lotes[n]) <= maxPedido)) {
          tam += Buffer.byteLength(lotes[n]); n++;
        }
        let st;
        try { st = await enviar(lotes.slice(0, n).join('\n')); } catch (e) { st = e.message; }
        if (st === 204 || DESCARTAR.has(st)) {
          if (st !== 204) log.error(`[INFLUX] Influx rechazó ${n} lotes (${st}): se descartan`);
          lotes.splice(0, n); bytes -= tam;
          if (fallando && st === 204) { fallando = false; log.log('[INFLUX] Escritura restablecida'); }
          continue;
        }
        if (!fallando) log.error(`[INFLUX] Error de escritura (${st}): los datos quedan en cola`);
        fallando = true;
        return;
      }
    } finally { enVuelo = false; }
  }

  return { agregar, vaciar, pendientes: () => ({ lotes: lotes.length, bytes }) };
}

module.exports = { createInfluxQueue };
