'use strict';

const HOSTNAME_RE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

function parseStatus(j) {
  if (!j) return { state: 'Unavailable', tailnet: null, user: null, ip: null, hostname: null, authUrl: null };
  const self = j.Self || {};
  const u = j.User && self.UserID != null ? j.User[String(self.UserID)] : null;
  return {
    state: j.BackendState || 'NoState',
    tailnet: (j.CurrentTailnet && j.CurrentTailnet.Name) || null,
    user: (u && u.LoginName) || null,
    ip: (self.TailscaleIPs || []).find(ip => ip.includes('.')) || null,
    hostname: self.HostName || null,
    authUrl: j.AuthURL || null,
  };
}

const err = (status, message) => Object.assign(new Error(message), { status });

// run(args) → { stdout } (execFile); spawnUp(args) → EventEmitter 'done'(code, stderr)
function createTailscale({ run, spawnUp, socketExists, sleep = (ms) => new Promise(r => setTimeout(r, ms)), loginWaitMs = 15000 }) {
  let upChild = null;
  let upError = null;

  async function status() {
    if (!socketExists()) return parseStatus(null);
    try {
      const { stdout } = await run(['status', '--json']);
      return parseStatus(JSON.parse(stdout));
    } catch (e) {
      if (e && e.stdout) { try { return parseStatus(JSON.parse(e.stdout)); } catch { /* sigue */ } }
      return parseStatus(null);
    }
  }

  async function login(hostname) {
    if (!HOSTNAME_RE.test(String(hostname || ''))) throw err(400, 'Nombre inválido (minúsculas, números y guiones)');
    if (!socketExists()) throw err(409, 'Tailscale no está instalado en el servidor');
    let st = await status();
    if (st.state === 'Running') return st;
    if (!upChild) {
      upError = null;
      const child = spawnUp(['up', `--hostname=${hostname}`, '--timeout=0']);
      upChild = child;
      child.on('done', (code, stderr) => {
        if (upChild === child) upChild = null;
        if (code) upError = String(stderr || `tailscale up salió con código ${code}`).trim().split('\n').slice(-3).join(' ');
      });
    }
    const deadline = Date.now() + loginWaitMs;
    while (Date.now() < deadline) {
      await sleep(500);
      if (upError) throw err(409, upError);
      st = await status();
      if (st.authUrl || st.state === 'Running') return st;
    }
    return st;
  }

  async function logout() {
    if (!socketExists()) throw err(409, 'Tailscale no está instalado en el servidor');
    await run(['logout']);
    return status();
  }

  return { status, login, logout };
}

module.exports = { parseStatus, createTailscale, HOSTNAME_RE };
