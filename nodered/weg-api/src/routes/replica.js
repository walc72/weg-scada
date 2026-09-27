'use strict';

// API de réplica (solo lectura) para el servidor de oficina. Se monta ANTES de
// requireAuth: usa su propio token (REPLICA_TOKEN), independiente del login.
// Sin REPLICA_TOKEN la función está apagada y todo responde 404.
//
// El histórico se sirve por VENTANAS de tiempo: range(start: since, stop) con
// start inclusivo y stop exclusivo; el siguiente since es el stop anterior →
// sin huecos ni solapamiento, y nunca se parte un timestamp entre páginas.

const crypto = require('crypto');
const express = require('express');
const { parseAnnotatedCsv, toLineProtocol, csvColumn } = require('../services/lineProtocol');

const MEASUREMENTS = ['drive_data', 'meter_data'];
const SAFETY_LAG_MS = 10000;      // no servir el último ciclo del poller (puede estar a medias)
const DEFAULT_WINDOW_SEC = 3600;
const MAX_WINDOW_SEC = 86400;
const MAX_FAILED = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

const iso = (ms) => new Date(ms).toISOString();

// Compara hashes (mismo largo) → timingSafeEqual sin filtrar el largo del token
function tokenMatches(input, expected) {
  const a = crypto.createHash('sha256').update(String(input)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function fluxRange(bucket, start, stop) {
  const filter = MEASUREMENTS.map(m => `r._measurement == "${m}"`).join(' or ');
  return `from(bucket: ${JSON.stringify(bucket)})
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => ${filter})`;
}

function createReplicaRouter({ token, queryCsv, bucket, getConfig, getManual, now = Date.now, version = '2.0.0' }) {
  const router = express.Router();
  const failed = new Map(); // ip -> { count, firstAt }

  router.use((req, res, next) => {
    if (!token) return res.status(404).json({ error: 'No encontrado' });
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const entry = failed.get(ip);
    if (entry && Date.now() - entry.firstAt > FAIL_WINDOW_MS) failed.delete(ip);
    const cur = failed.get(ip);
    if (cur && cur.count >= MAX_FAILED) {
      return res.status(429).json({ error: 'Demasiados intentos fallidos — reintentar en 15 minutos' });
    }
    const h = req.headers.authorization || '';
    const got = h.startsWith('Bearer ') ? h.slice(7) : '';
    if (!got || !tokenMatches(got, token)) {
      if (cur) cur.count++; else failed.set(ip, { count: 1, firstAt: Date.now() });
      console.warn(`[REPLICA] Token inválido desde ${ip}`);
      return res.status(401).json({ error: 'No autorizado' });
    }
    failed.delete(ip);
    next();
  });

  router.get('/info', async (req, res, next) => {
    try {
      const b = bucket();
      const all = fluxRange(b, '0', `time(v: "${iso(now())}")`);
      const [firstCsv, lastCsv] = await Promise.all([
        queryCsv(`${all}\n  |> first()\n  |> keep(columns: ["_time"])\n  |> group()\n  |> min(column: "_time")`),
        queryCsv(`${all}\n  |> last()\n  |> keep(columns: ["_time"])\n  |> group()\n  |> max(column: "_time")`),
      ]);
      res.json({
        version,
        bucket: b,
        oldest: csvColumn(firstCsv, '_time')[0] || null,
        newest: csvColumn(lastCsv, '_time')[0] || null,
      });
    } catch (e) { next(e); }
  });

  router.get('/config', (req, res) => {
    const cfg = JSON.parse(JSON.stringify(getConfig() || {}));
    if (cfg.influxdb) delete cfg.influxdb.token;
    res.json(cfg);
  });

  router.get('/manual', (req, res) => {
    res.json(getManual() || {});
  });

  router.get('/points', async (req, res, next) => {
    const sinceMs = Date.parse(String(req.query.since || ''));
    if (!Number.isFinite(sinceMs)) return res.status(400).json({ error: 'since inválido (ISO 8601)' });
    let win = parseInt(req.query.windowSec, 10);
    if (!Number.isFinite(win) || win <= 0) win = DEFAULT_WINDOW_SEC;
    win = Math.min(win, MAX_WINDOW_SEC);

    const horizon = now() - SAFETY_LAG_MS;
    const stopMs = Math.min(sinceMs + win * 1000, horizon);
    res.type('text/plain');
    if (stopMs <= sinceMs) {
      res.set('X-Next-Cursor', iso(sinceMs));
      res.set('X-More', '0');
      return res.send('');
    }
    try {
      const csv = await queryCsv(fluxRange(bucket(), `time(v: "${iso(sinceMs)}")`, `time(v: "${iso(stopMs)}")`));
      const lp = toLineProtocol(parseAnnotatedCsv(csv));
      res.set('X-Next-Cursor', iso(stopMs));
      res.set('X-More', stopMs < horizon ? '1' : '0');
      res.send(lp);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = createReplicaRouter;
