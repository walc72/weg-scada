'use strict';

// Reporte diario automático: a la hora configurada genera el resumen del
// día anterior (desde InfluxDB), lo guarda como PDF en REPORTS_DIR y —si hay
// SMTP configurado— lo envía por correo. También se dispara bajo demanda
// desde /api/reports/daily/email.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const reportService = require('./reports');

const REPORTS_DIR = process.env.REPORTS_DIR || '/app/reports';
const ENABLED = String(process.env.DAILY_REPORT_ENABLED || 'true').toLowerCase() !== 'false';
const HOUR = Math.min(23, Math.max(0, parseInt(process.env.DAILY_REPORT_HOUR || '6', 10) || 6));

function recipients(override) {
  if (override) return override;
  return process.env.DAILY_REPORT_EMAIL || process.env.ALERT_EMAIL || '';
}

function getTransport() {
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  if (!user || !pass) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: false,
    auth: { user, pass },
  });
}

function ensureDir(dir) {
  try { fs.mkdirSync(dir, { recursive: true }); return true; }
  catch (e) { console.error('[DAILY] No se pudo crear REPORTS_DIR:', e.message); return false; }
}

// Genera el PDF del día, lo guarda en disco y opcionalmente lo envía por mail.
async function buildAndSend(dateStr, opts = {}) {
  const summary = await reportService.generateDailySummary(dateStr);
  const date = summary.date;
  const pdf = await reportService.toSummaryPDF(summary, {
    title: 'Reporte Diario — Planta de Bombeo',
    subtitle: `Resumen del día ${date}  ·  Energía, horas de operación y estadísticas`,
  });

  const result = { ok: true, date, saved: false, emailed: false, path: null, to: null };

  // Guardar en disco (best-effort: si falla no rompe el envío)
  if (ensureDir(REPORTS_DIR)) {
    const file = path.join(REPORTS_DIR, `reporte-diario_${date}.pdf`);
    try { fs.writeFileSync(file, pdf); result.saved = true; result.path = file; }
    catch (e) { console.error('[DAILY] Error al guardar PDF:', e.message); }
  }

  // Email (si hay SMTP + destinatario)
  const to = recipients(opts.to);
  const transport = getTransport();
  if (to && transport) {
    try {
      await transport.sendMail({
        from: `"WEG SCADA — Planta de Bombeo" <${process.env.SMTP_USER}>`,
        to,
        subject: `[Planta de Bombeo] Reporte diario — ${date}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px">
          <h2 style="color:#E87722;margin-bottom:4px">Reporte Diario — Planta de Bombeo</h2>
          <p style="color:#555">Adjunto el resumen del día <strong>${date}</strong>: energía (kWh), horas de operación, y estadísticas (prom/mín/máx) de drives y medidores.</p>
          <p style="color:#888;font-size:12px;margin-top:16px">Energía total drives: <strong>${summary.totals ? summary.totals.driveEnergyKwh : '-'} kWh</strong></p>
          <p style="color:#999;font-size:11px">Generado automáticamente · Powered by Tecno Electric S.A.</p>
        </div>`,
        attachments: [{ filename: `reporte-diario_${date}.pdf`, content: pdf, contentType: 'application/pdf' }],
      });
      result.emailed = true; result.to = to;
    } catch (e) {
      console.error('[DAILY] Error al enviar email:', e.message);
      result.emailError = e.message;
    }
  } else if (opts.to) {
    // Se pidió explícitamente enviar pero no hay transporte configurado
    result.emailError = 'SMTP no configurado (SMTP_USER/SMTP_PASS)';
  }

  return result;
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10); // día calendario anterior (aprox. TZ contenedor)
}

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(HOUR, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

let timer = null;
function scheduleNext() {
  const delay = msUntilNextRun();
  timer = setTimeout(async () => {
    try {
      const r = await buildAndSend(yesterdayStr());
      console.log(`[DAILY] Reporte ${r.date} — guardado:${r.saved} email:${r.emailed}${r.emailError ? ' (' + r.emailError + ')' : ''}`);
    } catch (e) {
      console.error('[DAILY] Falló la generación programada:', e.message);
    }
    scheduleNext();
  }, delay);
  if (timer.unref) timer.unref();
  const h = (delay / 3600000).toFixed(1);
  console.log(`[DAILY] Próximo reporte automático en ~${h}h (hora ${HOUR}:00, TZ del contenedor)`);
}

function start() {
  if (!ENABLED) { console.log('[DAILY] Reporte diario automático deshabilitado (DAILY_REPORT_ENABLED=false)'); return; }
  ensureDir(REPORTS_DIR);
  scheduleNext();
}

module.exports = { start, buildAndSend, REPORTS_DIR };
