'use strict';

// Reporte diario automático: a la hora configurada genera el resumen del
// día anterior (desde InfluxDB), lo guarda como PDF en REPORTS_DIR y —si hay
// SMTP configurado— lo envía por correo. También se dispara bajo demanda
// desde /api/reports/daily/email.

const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const reportService = require('./reports');
const settings = require('./settings');

const REPORTS_DIR = process.env.REPORTS_DIR || '/app/reports';
const ENABLED = String(process.env.DAILY_REPORT_ENABLED || 'true').toLowerCase() !== 'false';
// La hora de envío se lee de settings (Configuración → Correo) en cada programación.

function recipients(override) {
  if (override) return override;
  return settings.getSmtpFull().to || '';
}

function getTransport() {
  const c = settings.getSmtpFull();
  if (!c.user || !c.pass) return null;
  return nodemailer.createTransport(settings.smtpTransportOptions());
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
      const smtp = settings.getSmtpFull();
      await transport.sendMail({
        from: `"Monitoreo - Planta de Bombeo" <${smtp.from || smtp.user}>`,
        to,
        subject: `[Monitoreo - Planta de Bombeo] Reporte diario — ${date}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:620px">
          <h2 style="color:#E87722;margin-bottom:4px">Reporte Diario — Planta de Bombeo</h2>
          <p style="color:#555">Adjunto el resumen del día <strong>${date}</strong>: energía (kWh), horas de marcha, pérdida y estadísticas (prom/mín/máx) de bombas y medidores.</p>
          <p style="color:#888;font-size:12px;margin-top:16px">Energía total bombas: <strong>${summary.totals ? summary.totals.driveEnergyKwh : '-'} kWh</strong></p>
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
  // Fecha LOCAL (TZ del contenedor); toISOString daría la fecha UTC
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function msUntilNextRun() {
  const now = new Date();
  const next = new Date(now);
  const { hour, minute } = settings.getDailyReport();
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

let timer = null;
let nextRunAt = null;   // Date del próximo envío programado (null si deshabilitado)

async function runScheduled() {
  try {
    const r = await buildAndSend(yesterdayStr());
    console.log(`[DAILY] Reporte ${r.date} — guardado:${r.saved} email:${r.emailed}${r.emailError ? ' (' + r.emailError + ')' : ''}`);
  } catch (e) {
    console.error('[DAILY] Falló la generación programada:', e.message);
  }
}

function scheduleNext() {
  const delay = msUntilNextRun();
  nextRunAt = new Date(Date.now() + delay);
  timer = setTimeout(async () => {
    await runScheduled();
    scheduleNext();
  }, delay);
  if (timer.unref) timer.unref();
  const h = (delay / 3600000).toFixed(1);
  console.log(`[DAILY] Próximo reporte automático en ~${h}h (hora ${settings.getDailyReport().time}, TZ del contenedor)`);
}

const sameLocalDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// Reprograma tras cambiar la hora. Si el envío de hoy todavía no había salido
// (estaba programado para más tarde hoy) y la hora nueva ya pasó, sale ahora:
// si no, el reporte de ayer quedaría sin enviar.
function reschedule() {
  if (!ENABLED) return null;
  const pendingToday = nextRunAt && sameLocalDay(nextRunAt, new Date());
  if (timer) clearTimeout(timer);
  const delay = msUntilNextRun();
  const newRunIsTomorrow = !sameLocalDay(new Date(Date.now() + delay), new Date());
  if (pendingToday && newRunIsTomorrow) {
    console.log('[DAILY] La hora nueva ya pasó y el reporte de hoy no había salido: se envía ahora');
    runScheduled();
  }
  scheduleNext();
  return nextRunAt;
}

function start() {
  if (!ENABLED) { console.log('[DAILY] Reporte diario automático deshabilitado (DAILY_REPORT_ENABLED=false)'); return; }
  ensureDir(REPORTS_DIR);
  scheduleNext();
}

const getNextRunAt = () => (ENABLED ? nextRunAt : null);

module.exports = { start, reschedule, getNextRunAt, buildAndSend, REPORTS_DIR, ENABLED };
