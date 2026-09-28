'use strict';

// Escribe line protocol en el Influx local (precisión ns, igual que el poller)
function createInfluxWriter({ url, org, bucket, token, fetchImpl = fetch }) {
  return async function write(lines) {
    if (!lines || !lines.trim()) return;
    const r = await fetchImpl(`${url}/api/v2/write?org=${encodeURIComponent(org)}&bucket=${encodeURIComponent(bucket)}&precision=ns`, {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'text/plain; charset=utf-8' },
      body: lines,
      signal: AbortSignal.timeout(30000),
    });
    if (r.status !== 204) throw Object.assign(new Error(`Influx write HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`), { status: r.status });
  };
}

module.exports = { createInfluxWriter };
