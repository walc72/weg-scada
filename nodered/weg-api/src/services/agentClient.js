'use strict';

// Cliente del weg-agent (contenedor con privilegios que opera el Tailscale del
// sistema). Red interna de Docker + AGENT_TOKEN; el token no sale de weg-api.
function createAgentClient({ baseUrl, token, fetchImpl = fetch, timeoutMs = 25000 }) {
  async function call(method, path, body) {
    let r;
    try {
      r = await fetchImpl(baseUrl + path, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      const e = new Error('Agente del sistema no disponible');
      e.status = 502;
      throw e;
    }
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const e = new Error((data && data.error) || `Agente HTTP ${r.status}`);
      e.status = r.status >= 500 ? 502 : r.status;
      throw e;
    }
    return data;
  }
  return {
    status: () => call('GET', '/tailscale/status'),
    login: (hostname) => call('POST', '/tailscale/login', { hostname }),
    logout: () => call('POST', '/tailscale/logout'),
  };
}

module.exports = { createAgentClient };
