'use strict';

const express = require('express');
const http = require('http');
const { requireAdmin } = require('../middleware/auth');

// Perro guardián del bus serie de los PLC: el poller es quien habla con el PLC
// (único proceso que le escribe); esta ruta solo lo proxya.
const POLLER_URL = process.env.POLLER_URL || 'http://modbus-poller:3100';

function pedirAlPoller(method, ruta, cuerpo, pollerUrl = POLLER_URL) {
  return new Promise((resolve) => {
    const data = cuerpo ? JSON.stringify(cuerpo) : '';
    const req = http.request(`${pollerUrl}${ruta}`, {
      method, timeout: 15000,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {},
    }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => resolve({ status: res.statusCode || 502, body: body || '{}' }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => resolve({ status: 502, body: JSON.stringify({ ok: false, error: `No se pudo consultar al poller: ${err.message}` }) }));
    req.end(data);
  });
}

function createSerieRouter({ pedir = pedirAlPoller, replica = false } = {}) {
  const router = express.Router();

  // Diagnóstico de cada PLC (todos los roles). En la réplica de oficina no hay poller.
  router.get('/', async (req, res) => {
    if (replica) return res.json([]);
    const { status, body } = await pedir('GET', '/serie');
    res.status(status).type('application/json').send(body);
  });

  // Reiniciar la comunicación serie del PLC: solo admin, y nunca desde la réplica
  router.post('/:gateway/reiniciar', requireAdmin, async (req, res) => {
    if (replica) return res.status(403).json({ ok: false, error: 'No disponible en la réplica' });
    const usuario = (req.auth && req.auth.user) || '';
    const { status, body } = await pedir('POST', `/serie/${encodeURIComponent(req.params.gateway)}/reiniciar`, { usuario });
    console.log(`[SERIE] ${usuario} pidió reiniciar la comunicación serie de ${req.params.gateway} → ${status}`);
    res.status(status).type('application/json').send(body);
  });

  return router;
}

module.exports = { createSerieRouter };
