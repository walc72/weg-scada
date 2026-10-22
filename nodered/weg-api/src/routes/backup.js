'use strict';

const express = require('express');
const { requireAdmin } = require('../middleware/auth');
const { hasModule } = require('../services/license');
const { createBackupStore, DEFAULTS } = require('../services/backupStore');

const FRECUENCIAS = ['diaria', 'semanal', 'mensual', 'desactivada'];
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const HOST_RE = /^[A-Za-z0-9._:-]+$/;
const USER_RE = /^[A-Za-z0-9._-]{1,32}$/;
const KNOWN_HOSTS_RE = /^(\[[^\]]+\]:\d+|[^\s]+) (ssh-ed25519|ecdsa-sha2-nistp(256|384|521)|ssh-rsa) [A-Za-z0-9+/=]+$/;
const AVISO_FRASE = 'Los backups anteriores siguen necesitando la frase anterior';
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);

// Devuelve las líneas de known_hosts, o null si alguna no cumple el formato.
function parseKnownHosts(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length && lines.every((l) => KNOWN_HOSTS_RE.test(l)) ? lines : null;
}

function validateParte(name, cur, inp) {
  if (!isObj(inp)) return { err: `Programación de ${name} inválida` };
  const v = { ...DEFAULTS[name], ...cur, ...inp };
  if (!FRECUENCIAS.includes(v.frecuencia)) return { err: 'Frecuencia inválida' };
  if (typeof v.hora !== 'string' || !HORA_RE.test(v.hora)) return { err: 'Hora inválida (HH:MM)' };
  if (!Number.isInteger(v.copias) || v.copias < 1 || v.copias > 365) return { err: 'Copias debe ser un entero entre 1 y 365' };
  return { val: { frecuencia: v.frecuencia, hora: v.hora, copias: v.copias } };
}

function validateSftp(cur, inp) {
  if (!isObj(inp)) return { err: 'Datos SFTP inválidos' };
  const v = { activo: false, host: '', puerto: 22, usuario: '', carpeta: '', ...cur };
  for (const k of ['activo', 'host', 'puerto', 'usuario', 'carpeta']) if (k in inp) v[k] = inp[k];
  if (typeof v.activo !== 'boolean') return { err: 'activo debe ser verdadero o falso' };
  if (v.host !== '' && (typeof v.host !== 'string' || !HOST_RE.test(v.host) || v.host.startsWith('-'))) return { err: 'Servidor SFTP inválido' };
  if (!Number.isInteger(v.puerto) || v.puerto < 1 || v.puerto > 65535) return { err: 'Puerto inválido (1–65535)' };
  if (v.usuario !== '' && (typeof v.usuario !== 'string' || !USER_RE.test(v.usuario))) return { err: 'Usuario SFTP inválido' };
  if (v.carpeta !== '' && (typeof v.carpeta !== 'string' || !v.carpeta.startsWith('/') || /[\r\n]/.test(v.carpeta))) return { err: 'La carpeta debe ser una ruta absoluta' };
  if (v.activo && (!v.host || !v.usuario)) return { err: 'Completá servidor y usuario SFTP antes de activar' };
  const out = { activo: v.activo, host: v.host, puerto: v.puerto, usuario: v.usuario, carpeta: v.carpeta };
  // La huella aceptada solo vale para el host:puerto con el que se aceptó
  if (cur && cur.huella && cur.host === v.host && cur.puerto === v.puerto) out.huella = cur.huella;
  return { val: out };
}

function createBackupRouter({ configDir, getLicense, isReplica = false, probarTimeoutMs = 60000 }) {
  const router = express.Router();
  const store = createBackupStore(configDir);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let ultimaSftp = null; // último resultado de prueba SFTP (con knownHostsLine); solo en memoria

  router.use(requireAdmin);
  router.use((req, res, next) => {
    if (isReplica) {
      if (req.method === 'GET') return res.json({ modulo: false, replica: true });
      return res.status(403).json({ error: 'Servidor réplica — los backups se configuran en planta' });
    }
    if (!hasModule(getLicense(), 'backup')) {
      if (req.method === 'GET') return res.json({ modulo: false });
      return res.status(403).json({ error: 'La licencia no incluye el módulo backup' });
    }
    next();
  });

  router.get('/', (req, res) => {
    const c = store.readConfig();
    const d = c.drive || {};
    const s = c.sftp || {};
    res.json({
      modulo: true,
      config: c.config || DEFAULTS.config,
      historico: c.historico || DEFAULTS.historico,
      drive: { activo: !!d.activo, cuenta: d.cuenta || null, disponible: !!process.env.GOOGLE_CLIENT_ID },
      sftp: {
        activo: !!s.activo, host: s.host || '', puerto: s.puerto || 22, usuario: s.usuario || '',
        carpeta: s.carpeta || '', huella: s.huella || null, clavePublica: store.readPublicKey(),
      },
      fraseConfigurada: store.hasFrase(),
      estado: store.readEstado(),
    });
  });

  router.put('/', (req, res) => {
    const body = req.body;
    if (!isObj(body)) return res.status(400).json({ error: 'Cuerpo inválido' });
    const cur = store.readConfig();
    const next = { ...cur };
    const fail = (error) => res.status(400).json({ error });
    for (const k of ['config', 'historico']) {
      if (!(k in body)) continue;
      const r = validateParte(k, cur[k], body[k]);
      if (r.err) return fail(r.err);
      next[k] = r.val;
    }
    if ('drive' in body) {
      if (!isObj(body.drive) || typeof body.drive.activo !== 'boolean') return fail('activo debe ser verdadero o falso');
      next.drive = { ...(cur.drive || {}), activo: body.drive.activo };
    }
    if ('sftp' in body) {
      const r = validateSftp(cur.sftp, body.sftp);
      if (r.err) return fail(r.err);
      next.sftp = r.val;
    }
    if ((next.drive && next.drive.activo && 'drive' in body) || (next.sftp && next.sftp.activo && 'sftp' in body)) {
      if (!store.hasFrase()) return fail('Cargá la frase del backup antes de activar un destino');
    }
    store.writeConfig(next);
    res.json({ ok: true });
  });

  router.put('/frase', (req, res) => {
    const frase = req.body && req.body.frase;
    if (typeof frase !== 'string' || frase.length < 12) return res.status(400).json({ error: 'La frase debe tener al menos 12 caracteres' });
    // openssl -pass lee solo la primera línea: una frase con salto de línea quedaría truncada
    if (/[\r\n]/.test(frase)) return res.status(400).json({ error: 'La frase no puede tener saltos de línea' });
    const habia = store.hasFrase();
    store.setFrase(frase);
    res.json(habia ? { ok: true, aviso: AVISO_FRASE } : { ok: true });
  });

  router.post('/ahora', (req, res) => {
    const partes = req.body && req.body.partes !== undefined ? req.body.partes : ['config', 'historico'];
    if (!Array.isArray(partes) || !partes.length || !partes.every((p) => p === 'config' || p === 'historico')) {
      return res.status(400).json({ error: 'partes debe ser una lista con config y/o historico' });
    }
    store.writePedido({ partes: [...new Set(partes)], ts: Date.now() });
    res.json({ ok: true });
  });

  router.post('/sftp/huella', (req, res) => {
    const huella = req.body && req.body.huella;
    const r = ultimaSftp;
    if (typeof huella !== 'string' || !r || r.huella !== huella) {
      return res.status(400).json({ error: 'La huella no coincide con la última prueba; probá el destino de nuevo' });
    }
    const lines = parseKnownHosts(r.knownHostsLine);
    if (!lines) return res.status(400).json({ error: 'Claves del servidor inválidas' });
    store.addKnownHosts(lines);
    const cur = store.readConfig();
    store.writeConfig({ ...cur, sftp: { ...(cur.sftp || {}), huella } });
    res.json({ ok: true });
  });

  router.post('/:destino/probar', async (req, res, next) => {
    try {
      const destino = req.params.destino;
      if (destino !== 'drive' && destino !== 'sftp') return res.status(404).json({ error: 'Destino desconocido' });
      const ts = Date.now();
      store.writePrueba({ destino, ts });
      const limite = ts + probarTimeoutMs;
      let r = null;
      while (Date.now() < limite) {
        const x = store.readPruebaResultado();
        if (x && x.ts === ts) { r = x; break; }
        await sleep(Math.min(200, Math.max(10, probarTimeoutMs / 10)));
      }
      if (!r) return res.status(504).json({ error: 'El servicio de backup no respondió (¿hay un backup en curso?)' });
      const { knownHostsLine, ...pub } = r;
      if (destino === 'sftp') {
        if (knownHostsLine !== undefined && !parseKnownHosts(knownHostsLine)) {
          ultimaSftp = null;
          return res.json({ destino, ts, ok: false, error: 'El servidor devolvió claves SSH inválidas' });
        }
        ultimaSftp = r;
      }
      res.json(pub);
    } catch (e) { next(e); }
  });

  return router;
}

module.exports = { createBackupRouter, parseKnownHosts };
