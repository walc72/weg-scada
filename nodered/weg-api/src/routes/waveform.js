'use strict';

const express = require('express');
const http = require('http');

// El poller es quien tiene la conexion Modbus a los medidores;
// esta ruta solo proxya la lectura on-demand de forma de onda.
const POLLER_URL = process.env.POLLER_URL || 'http://modbus-poller:3100';

// Lectura al poller → { status, body } (body: JSON en texto)
function readFromPoller(name, pollerUrl = POLLER_URL) {
  return new Promise((resolve) => {
    const url = `${pollerUrl}/waveform/${encodeURIComponent(name)}`;
    const req = http.get(url, { timeout: 25000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode || 502, body: body || JSON.stringify({ error: 'Respuesta vacia del poller' }) }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ status: 502, body: JSON.stringify({ error: `No se pudo leer la forma de onda: ${err.message}` }) }));
  });
}

// Réplica de oficina (sin poller): se la pide a planta por el enlace de réplica
async function readFromPlanta(name, link, fetchImpl = fetch) {
  if (!link) return { status: 502, body: JSON.stringify({ error: 'La oficina no está enlazada a planta' }) };
  try {
    const r = await fetchImpl(`${link.source}/api/replica/waveform/${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${link.token}` },
      signal: AbortSignal.timeout(30000),
    });
    return { status: r.status, body: await r.text() };
  } catch (e) {
    const why = (e && e.cause && e.cause.code) || (e && e.message) || 'error';
    return { status: 502, body: JSON.stringify({ error: `No se pudo pedir la forma de onda a planta: ${why}` }) };
  }
}

// GET /:name — armonicos de tension/corriente del medidor
function createWaveformRouter({ read = readFromPoller } = {}) {
  const router = express.Router();
  router.get('/:name', async (req, res) => {
    const { status, body } = await read(req.params.name);
    res.status(status).type('application/json').send(body);
  });
  return router;
}

module.exports = { createWaveformRouter, readFromPoller, readFromPlanta };
