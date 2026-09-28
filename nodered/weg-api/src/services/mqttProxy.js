'use strict';

// Proxy del websocket /mqtt hacia Mosquitto (listener 9001, solo red interna).
// Valida la credencial al abrir (Authorization: Bearer o ?token=), reenvía el
// handshake SIN la credencial y hace pipe de bytes (no interpreta MQTT). Lleva
// un registro identidad → conexiones para cortarlas en el acto (logout,
// vencimiento, revocación) y un barrido periódico de respaldo.

const net = require('net');

const MAX_FAILED = 10;
const FAIL_WINDOW_MS = 15 * 60 * 1000;

function reject(socket, code, text) {
  try { socket.end(`HTTP/1.1 ${code} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { /* ya cerrado */ }
}

// Identidad apta para logs (nunca el token de sesión completo)
function label(identity) {
  if (identity.startsWith('session:')) {
    const tok = identity.slice('session:'.length);
    return `sesión …${tok.length > 12 ? tok.slice(-4) : ''}`; // cola solo en tokens largos
  }
  return `réplica ${identity.slice('replica:'.length)}`;
}

function createMqttProxy({ validate, upstream, log = console, sweepMs = 60000 }) {
  const conns = new Set(); // { identity, credential, ip, client, up }
  const failed = new Map(); // ip → { count, firstAt }

  function drop(c) {
    if (!conns.delete(c)) return;
    c.client.destroy();
    c.up.destroy();
    log.log(`[MQTT-WS] cerrada ${label(c.identity)}`);
  }

  function handleUpgrade(req, socket, head) {
    let u;
    try { u = new URL(req.url, 'http://x'); } catch { socket.destroy(); return; }
    const p = u.pathname.toLowerCase().replace(/\/+$/, '');
    if (p !== '/mqtt') { socket.destroy(); return; }

    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
    const h = req.headers.authorization || '';
    const credential = h.startsWith('Bearer ') ? h.slice(7) : (u.searchParams.get('token') || '');
    // Sin credencial: 401 sin contar (pestañas con frontend viejo no deben
    // bloquear a nadie).
    if (!credential) return reject(socket, 401, 'Unauthorized');

    // Primero se valida: una credencial VÁLIDA entra siempre. En la VM todos los
    // clientes llegan con la IP del gateway de Docker, así que el límite por IP
    // solo puede frenar credenciales inválidas, nunca dejar afuera a las buenas.
    let identity = null;
    try { identity = validate(credential, ip); } catch (e) {
      log.error(`[MQTT-WS] error validando: ${e.message}`);
      identity = null;
    }
    if (identity) {
      failed.delete(ip);
    } else {
      const f = failed.get(ip);
      if (f && Date.now() - f.firstAt > FAIL_WINDOW_MS) failed.delete(ip);
      const cur = failed.get(ip);
      if (cur && cur.count >= MAX_FAILED) return reject(socket, 429, 'Too Many Requests');
      if (cur) cur.count++; else failed.set(ip, { count: 1, firstAt: Date.now() });
      return reject(socket, 401, 'Unauthorized');
    }

    const up = net.connect(upstream.port, upstream.host);
    const c = { identity, credential, ip, client: socket, up };
    let piped = false;
    up.on('connect', () => {
      let out = `${req.method} /mqtt HTTP/${req.httpVersion}\r\n`;
      for (let i = 0; i < req.rawHeaders.length; i += 2) {
        if (req.rawHeaders[i].toLowerCase() === 'authorization') continue;
        out += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
      }
      up.write(out + '\r\n');
      if (head && head.length) up.write(head);
      socket.pipe(up);
      up.pipe(socket);
      piped = true;
      conns.add(c);
      log.log(`[MQTT-WS] abierta ${label(identity)} desde ${ip}`);
    });
    up.on('error', () => {
      if (!piped) { reject(socket, 502, 'Bad Gateway'); up.destroy(); return; }
      drop(c);
    });
    up.on('close', () => drop(c));
    socket.on('error', () => drop(c));
    socket.on('close', () => { if (piped) drop(c); else up.destroy(); });
  }

  function closeIdentity(identity) {
    for (const c of [...conns]) if (c.identity === identity) drop(c);
  }

  function sweep() {
    for (const c of [...conns]) {
      let ok = null;
      try { ok = validate(c.credential, c.ip); } catch { ok = null; }
      if (ok !== c.identity) drop(c);
    }
  }

  const timer = sweepMs ? setInterval(sweep, sweepMs) : null;
  if (timer) timer.unref();

  return {
    handleUpgrade,
    closeIdentity,
    sweep,
    stop() { if (timer) clearInterval(timer); for (const c of [...conns]) drop(c); },
    count: () => conns.size,
  };
}

module.exports = { createMqttProxy };
