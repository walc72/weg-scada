'use strict';

const router = require('express').Router();
const http = require('http');

// El poller es quien tiene la conexion Modbus a los medidores;
// esta ruta solo proxya la lectura on-demand de forma de onda.
const POLLER_URL = process.env.POLLER_URL || 'http://modbus-poller:3100';

// GET /api/waveform/:name — armonicos de tension/corriente del medidor
router.get('/:name', (req, res) => {
  const url = `${POLLER_URL}/waveform/${encodeURIComponent(req.params.name)}`;

  const proxyReq = http.get(url, { timeout: 25000 }, (proxyRes) => {
    let body = '';
    proxyRes.on('data', (c) => body += c);
    proxyRes.on('end', () => {
      res.status(proxyRes.statusCode || 502);
      res.set('Content-Type', 'application/json');
      res.send(body || JSON.stringify({ error: 'Respuesta vacia del poller' }));
    });
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy(new Error('timeout'));
  });
  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: `No se pudo leer la forma de onda: ${err.message}` });
    }
  });
});

module.exports = router;
