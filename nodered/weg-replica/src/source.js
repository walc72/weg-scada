'use strict';

// Cliente de la API de réplica de planta (/api/replica/*), con token propio
function createSource({ baseUrl, token, fetchImpl = fetch, timeoutMs = 60000 }) {
  async function get(path) {
    const r = await fetchImpl(`${baseUrl}/api/replica${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) {
      const err = new Error(`GET ${path.split('?')[0]} → HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    return r;
  }
  return {
    async info() { return (await get('/info')).json(); },
    async config() { return (await get('/config')).json(); },
    async manual() { return (await get('/manual')).json(); },
    async points(since, windowSec) {
      const r = await get(`/points?since=${encodeURIComponent(since)}&windowSec=${windowSec}`);
      return { body: await r.text(), next: r.headers.get('x-next-cursor'), more: r.headers.get('x-more') === '1' };
    },
  };
}

module.exports = { createSource };
