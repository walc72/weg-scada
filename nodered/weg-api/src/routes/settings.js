'use strict';

const router = require('express').Router();
const nodemailer = require('nodemailer');
const settings = require('../services/settings');
const { requireAdmin, extractToken, revokeUserSessions, renameSession } = require('../middleware/auth');

// Todo /api/settings es solo-admin (usuarios y SMTP son sensibles)
router.use(requireAdmin);

// ─── Usuarios ────────────────────────────────────────────────────────
// Las reglas (superadmin protegido, no tocarse el propio rol, etc.) están en
// services/settings.js.
const actorOf = (req) => ({ user: req.auth.user, role: req.auth.role });
const usersResponse = (req) => ({ users: settings.listUsers(), me: req.auth.user });
const fail = (res, e) => res.status(e.status || 400).json({ error: e.message });

// GET: lista de usuarios (sin secretos)
router.get('/users', (req, res) => {
  res.json(usersResponse(req));
});

// POST: alta. body: { user, role: admin|operador, password }
router.post('/users', (req, res) => {
  try {
    settings.createUser(actorOf(req), req.body || {});
    res.json({ ok: true, ...usersResponse(req) });
  } catch (e) { fail(res, e); }
});

// PUT /users/:user — body: { user?, role?, password? } (password vacía = sin cambios)
router.put('/users/:user', (req, res) => {
  try {
    const r = settings.updateUser(actorOf(req), req.params.user, req.body || {});
    const token = extractToken(req);
    const self = r.before.user.toLowerCase() === String(req.auth.user).toLowerCase();
    // Con otro rol, nombre o contraseña, sus sesiones abiertas dejan de valer
    // (la propia sesión de quien edita sigue, con el nombre nuevo).
    if (r.before.role !== r.after.role || r.before.user !== r.after.user || r.passwordChanged) {
      revokeUserSessions(r.before.user, self ? token : null);
    }
    if (self && r.before.user !== r.after.user) { renameSession(token, r.after.user); req.auth.user = r.after.user; }
    res.json({ ok: true, ...usersResponse(req) });
  } catch (e) { fail(res, e); }
});

// DELETE /users/:user
router.delete('/users/:user', (req, res) => {
  try {
    const name = settings.deleteUser(actorOf(req), req.params.user);
    revokeUserSessions(name);
    res.json({ ok: true, ...usersResponse(req) });
  } catch (e) { fail(res, e); }
});

// ─── SMTP ────────────────────────────────────────────────────────────
// GET: config sin la password (hasPassword indica si hay una guardada)
router.get('/smtp', (req, res) => {
  res.json(settings.getSmtpPublic());
});

// POST: guarda config. La password solo se actualiza si viene no vacía.
router.post('/smtp', (req, res) => {
  try {
    settings.setSmtp(req.body || {});
    res.json({ ok: true, smtp: settings.getSmtpPublic() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /smtp/test: envía un correo de prueba con la config guardada.
// body opcional: { to } (por defecto usa el destinatario configurado)
router.post('/smtp/test', async (req, res) => {
  try {
    const c = settings.getSmtpFull();
    if (!c.user || !c.pass) return res.status(400).json({ error: 'Falta usuario/contraseña SMTP' });
    const to = (req.body && typeof req.body.to === 'string' && req.body.to.trim()) || c.to;
    if (!to) return res.status(400).json({ error: 'Falta destinatario' });
    const transport = nodemailer.createTransport(settings.smtpTransportOptions());
    await transport.sendMail({
      from: `"Monitoreo - Planta de Bombeo" <${c.from || c.user}>`,
      to,
      subject: '[Monitoreo - Planta de Bombeo] Correo de prueba',
      html: '<div style="font-family:Arial"><h3 style="color:#E87722">Correo de prueba</h3><p>La configuración SMTP funciona correctamente.</p><p style="color:#999;font-size:11px">Tecno Electric S.A.</p></div>',
    });
    res.json({ ok: true, to });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
