'use strict';

// OJO: el client_secret viaja en el ENV de la imagen pública de la API a propósito. Google trata los
// clientes "TVs and Limited Input devices" como no confidenciales; el scope drive.file limita la
// exposición a las carpetas que crea la propia app.

// Google OAuth "device flow" (el admin escribe un código en el celular) + las pocas llamadas a Drive
// que hacen falta. Solo built-ins (fetch de Node 20). Los endpoints se pueden cambiar para las pruebas.

const DEFAULT_ENDPOINTS = {
  device: 'https://oauth2.googleapis.com/device/code',
  token: 'https://oauth2.googleapis.com/token',
  revoke: 'https://oauth2.googleapis.com/revoke',
  userinfo: 'https://openidconnect.googleapis.com/v1/userinfo',
  drive: 'https://www.googleapis.com/drive/v3/files',
};
const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

function createGoogle(endpoints = {}) {
  const ep = { ...DEFAULT_ENDPOINTS, ...endpoints };
  const form = (o) => new URLSearchParams(o).toString();
  const FORM = { 'content-type': 'application/x-www-form-urlencoded' };
  const auth = (t) => ({ authorization: `Bearer ${t}` });

  async function req(url, opts = {}) {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    const text = await res.text();
    let body = {};
    try { body = text ? JSON.parse(text) : {}; } catch { /* respuesta no JSON */ }
    return { res, body };
  }
  async function ok(url, opts, what) {
    const { res, body } = await req(url, opts);
    if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
    return body;
  }

  return {
    async start({ clientId, scopes = SCOPES }) {
      const b = await ok(ep.device, { method: 'POST', headers: FORM, body: form({ client_id: clientId, scope: scopes }) }, 'Google no inició la conexión');
      return {
        deviceCode: b.device_code, userCode: b.user_code, verificationUrl: b.verification_url || b.verification_uri,
        interval: Number.isFinite(b.interval) ? b.interval : 5, expiresIn: Number.isFinite(b.expires_in) ? b.expires_in : 1800,
      };
    },

    // { status: 'pendiente', slowDown? } | { status: 'conectado', tokens } | 'vencido' | 'rechazado' | 'error'
    async poll({ clientId, clientSecret, deviceCode }) {
      let res, body;
      try {
        ({ res, body } = await req(ep.token, {
          method: 'POST', headers: FORM,
          body: form({ client_id: clientId, client_secret: clientSecret, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
        }));
      } catch { return { status: 'pendiente' }; } // red caída o timeout: se reintenta
      if (res.status >= 500) return { status: 'pendiente' };
      if (res.ok && body.access_token) {
        if (!body.refresh_token) return { status: 'error', error: 'Google no entregó refresh_token' };
        return { status: 'conectado', tokens: body };
      }
      switch (body.error) {
        case 'authorization_pending': return { status: 'pendiente' };
        case 'slow_down': return { status: 'pendiente', slowDown: true };
        case 'access_denied': return { status: 'rechazado' };
        case 'expired_token': return { status: 'vencido' };
        default: return { status: 'error', error: `Google respondió ${body.error || 'HTTP ' + res.status}` };
      }
    },

    async userEmail(accessToken) {
      return (await ok(ep.userinfo, { headers: auth(accessToken) }, 'No pude leer la cuenta de Google')).email || null;
    },

    async findFolder(accessToken, name, parentId = 'root') {
      const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
      const q = `name='${esc(name)}' and mimeType='${FOLDER_MIME}' and trashed=false and '${esc(parentId)}' in parents`;
      const b = await ok(`${ep.drive}?${form({ q, fields: 'files(id)', spaces: 'drive' })}`, { headers: auth(accessToken) }, 'No pude buscar la carpeta en Drive');
      return (b.files && b.files[0] && b.files[0].id) || null;
    },

    async createFolder(accessToken, name, parentId) {
      const meta = { name, mimeType: FOLDER_MIME, ...(parentId ? { parents: [parentId] } : {}) };
      const b = await ok(`${ep.drive}?fields=id`, { method: 'POST', headers: { ...auth(accessToken), 'content-type': 'application/json' }, body: JSON.stringify(meta) }, 'No pude crear la carpeta en Drive');
      return b.id;
    },

    // ¿existe y no está en la papelera? (para reusar el id guardado de la carpeta raíz)
    async folderUsable(accessToken, id) {
      const { res, body } = await req(`${ep.drive}/${encodeURIComponent(id)}?fields=id,trashed`, { headers: auth(accessToken) });
      return res.ok && body.id === id && !body.trashed;
    },

    // Mejor esfuerzo: nunca tira.
    async revoke(token) {
      try { return (await req(ep.revoke, { method: 'POST', headers: FORM, body: form({ token }) })).res.ok; } catch { return false; }
    },
  };
}

module.exports = { createGoogle, SCOPES, DEFAULT_ENDPOINTS };
