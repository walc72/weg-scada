'use strict';

// Avisos por mail del módulo Backup. evaluateBackup es puro; createBackupAlerts lo cablea
// (watcher de backup-estado.json + timer horario) con el transporte SMTP de alerts.js.

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const { writeAtomic } = require('./backupStore');
const { installationName } = require('./installationName');

const DAY = 86400000;
const PERIODO_DIAS = { diaria: 2, semanal: 14, mensual: 62 }; // 2× el período
const NOMBRE = { config: 'configuración', historico: 'histórico' };
const BUSY = 'otro backup en curso';

const p2 = (n) => String(n).padStart(2, '0');
function fmt(d) { return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`; }

function evaluateBackup(estado, cfg, now, sent, instalacion = '') {
  const prev = sent || {};
  if (!cfg || cfg.modulo !== true || !estado) return { mails: [], sent: prev };
  const nowMs = now instanceof Date ? now.getTime() : now;
  const en = instalacion ? ` en ${instalacion}` : '';
  const mails = [];
  const next = {};
  const stamp = new Date(nowMs).toISOString();
  const keep = (k) => { next[k] = prev[k] || stamp; return !prev[k]; };

  for (const parte of ['config', 'historico']) {
    const dias = cfg[parte] && PERIODO_DIAS[cfg[parte].frecuencia];
    if (!dias) continue; // sin horario o desactivada
    const ultima = estado.ultima && estado.ultima[parte];
    const runs = [ultima, ...(estado.historial || []).filter((r) => r && r.parte === parte)];

    // Errores en el último Run (el salteado por lock ocupado no cuenta)
    if (ultima && !ultima.ok && ultima.error !== BUSY) {
      const malos = Object.entries(ultima.destinos || {}).filter(([, v]) => typeof v === 'string' && v.startsWith('error'));
      let nuevo = false;
      for (const [d] of malos) nuevo = keep(`error:${parte}:${d}`) || nuevo;
      if (nuevo) {
        const lineas = Object.entries(ultima.destinos).map(([d, v]) => `- ${d}: ${v}`);
        mails.push({
          keys: malos.map(([d]) => `error:${parte}:${d}`),
          asunto: `Backup de ${NOMBRE[parte]} con errores${en}`,
          cuerpo: `El último backup de ${NOMBRE[parte]} (${fmt(new Date(ultima.inicio))}) terminó con errores.\n\nResultado por destino:\n${lineas.join('\n')}\n`,
        });
      }
    }

    // Sin backup exitoso en 2× el período
    const oks = runs.filter((r) => r && r.ok && Date.parse(r.inicio)).map((r) => Date.parse(r.inicio));
    const last = oks.length ? Math.max(...oks) : null;
    // Base del plazo: el último ok o, si es posterior, cuándo se configuró la parte. Sin ninguno
    // (entrada vieja) vale el último intento registrado; sin intentos tampoco hay aviso.
    const conf = Date.parse(cfg[parte].configuradoEn);
    const intentos = runs.filter((r) => r && Date.parse(r.inicio)).map((r) => Date.parse(r.inicio));
    const base = Math.max(last || 0, conf || 0) || (intentos.length ? Math.max(...intentos) : null);
    if (base !== null && nowMs - base > dias * DAY) {
      if (keep(`sin:${parte}`)) {
        const desde = last === null ? 'nunca' : fmt(new Date(last));
        mails.push({
          keys: [`sin:${parte}`],
          asunto: `Sin backup de ${NOMBRE[parte]} desde ${desde}`,
          cuerpo: `No hay un backup de ${NOMBRE[parte]} exitoso${last === null ? ' registrado' : ` desde ${desde}`} (límite: ${dias} días).\nRevise el módulo Backup${en}.\n`,
        });
      }
    }
  }
  return { mails, sent: next };
}

// opts: configDir, getTransport() -> transport|null, getTo() -> string, getFrom() -> string,
//       now() -> ms, interval (ms), pollInterval (ms, chokidar)
function createBackupAlerts({ configDir, getTransport, getTo, getFrom, now = Date.now, interval = 3600000, pollInterval = 3000, backoff = 600000 }) {
  const f = (n) => path.join(configDir, n);
  const readJson = (n) => { try { return JSON.parse(fs.readFileSync(f(n), 'utf8')); } catch { return null; } };
  let sent = {};
  let seed = false; // avisos ilegible: se siembra con los problemas activos para no reenviar todo
  try { sent = JSON.parse(fs.readFileSync(f('backup-avisos.json'), 'utf8')); } catch (e) {
    if (e.code !== 'ENOENT') { console.error('[BACKUP] backup-avisos.json ilegible:', e.message); seed = true; }
  }
  let warned = false;
  let failUntil = 0;
  let lastErr = null;
  let busy = Promise.resolve();

  async function check() {
    const cfg = readJson('backup.json');
    const estado = readJson('backup-estado.json');
    const inst = installationName(configDir);
    if (seed) { sent = evaluateBackup(estado, cfg, now(), {}, inst).sent; seed = false; save(sent); }
    const r = evaluateBackup(estado, cfg, now(), sent, inst);
    if (!r.mails.length) { if (JSON.stringify(r.sent) !== JSON.stringify(sent)) save(r.sent); return; }
    if (now() < failUntil) return;
    const transport = getTransport();
    const to = getTo();
    if (!transport || !to) {
      if (!warned) { console.log('[BACKUP] Sin SMTP configurado: no se envían avisos de backup'); warned = true; }
      return;
    }
    let acum = { ...sent };
    for (const m of r.mails) {
      try {
        await transport.sendMail({ from: getFrom(), to, subject: m.asunto, text: m.cuerpo });
      } catch (e) {
        failUntil = now() + backoff;
        if (e.message !== lastErr) console.error('[BACKUP] Error al enviar aviso:', e.message);
        lastErr = e.message;
        save(acum);
        return;
      }
      for (const k of m.keys) acum[k] = r.sent[k];
    }
    lastErr = null;
    save(r.sent);
  }
  function save(s) {
    sent = s;
    try { writeAtomic(f('backup-avisos.json'), JSON.stringify(s, null, 2) + '\n', 0o644); }
    catch (e) { console.error('[BACKUP] No pude guardar backup-avisos.json:', e.message); }
  }
  const run = () => (busy = busy.then(check).catch(() => {})); // serializa checks

  return {
    check: run,
    start() {
      const onFile = (p) => { if (path.basename(p) === 'backup-estado.json') run(); };
      const w = chokidar.watch(configDir, { ignoreInitial: true, usePolling: true, interval: pollInterval, depth: 0 })
        .on('add', onFile).on('change', onFile)
        .on('error', (e) => console.error('[BACKUP] Watch error:', e.message));
      const t = setInterval(run, interval);
      if (t.unref) t.unref();
      run();
      return { close: () => { clearInterval(t); return w.close(); } };
    },
  };
}

module.exports = { evaluateBackup, createBackupAlerts, fmt };
