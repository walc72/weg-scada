'use strict';

const router = require('express').Router();
const nodemailer = require('nodemailer');
const settings = require('../services/settings');
const { requireAdmin } = require('../middleware/auth');

// Todo /api/settings es solo-admin (usuarios y SMTP son sensibles)
router.use(requireAdmin);

// ─── Usuarios ────────────────────────────────────────────────────────
// GET: lista roles con su usuario y si tienen contraseña (sin secretos)
router.get('/users', (req, res) => {
  res.json({ users: settings.listUsers() });
});

// POST: actualiza usuario/contraseña de un rol. body: { role, user?, password? }
router.post('/users', (req, res) => {
  try {
    const { role, user, password } = req.body || {};
    settings.setUser(role, user, password);
    res.json({ ok: true, users: settings.listUsers() });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
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
    const transport = nodemailer.createTransport({
      host: c.host, port: c.port, secure: !!c.secure,
      auth: { user: c.user, pass: c.pass },
    });
    await transport.sendMail({
      from: `"WEG SCADA — Planta de Bombeo" <${c.from || c.user}>`,
      to,
      subject: '[WEG SCADA] Correo de prueba',
      html: '<div style="font-family:Arial"><h3 style="color:#E87722">Correo de prueba</h3><p>La configuración SMTP funciona correctamente.</p><p style="color:#999;font-size:11px">Tecno Electric S.A.</p></div>',
    });
    res.json({ ok: true, to });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
