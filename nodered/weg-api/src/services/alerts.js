'use strict';

const nodemailer = require('nodemailer');
const configService = require('./config');

// ─── State ──────────────────────────────────────────────────────────
const prevStates = new Map();
const cooldowns = new Map();
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
let alertHistory = [];
const MAX_HISTORY = 200;

// ─── Email Transport ────────────────────────────────────────────────
function getTransport() {
  const smtpUser = process.env.SMTP_USER || '';
  const smtpPass = process.env.SMTP_PASS || '';
  if (!smtpUser || !smtpPass) return null;

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: { user: smtpUser, pass: smtpPass }
  });
}

// ─── Telegram ───────────────────────────────────────────────────────
async function sendTelegram(text) {
  const token = process.env.TELEGRAM_TOKEN || '';
  const chatId = process.env.TELEGRAM_CHAT_ID || '';
  if (!token || !chatId) return;

  const https = require('https');
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' });

  return new Promise((resolve) => {
    const req = https.request(url, { method: 'POST', headers: { 'Content-Type': 'application/json' } }, resolve);
    req.on('error', (e) => console.error('[TG] Error:', e.message));
    req.write(body);
    req.end();
  });
}

// ─── Evaluate alarms ────────────────────────────────────────────────
function evaluate() {
  const cfg = configService.get();
  if (!cfg) return;

  const sp = cfg.alarmSetpoints || { defaults: {}, overrides: {} };

  for (const [name, d] of configService.deviceStates) {
    const prev = prevStates.get(name) || { hasFault: false, online: true, alarmCurrent: false, alarmTemp: false };
    const typeSP = sp.defaults[d.type] || {};
    const devSP = { ...typeSP, ...(sp.overrides[name] || {}) };
    const alarms = [];

    // Fault detection
    if (d.hasFault && !prev.hasFault) {
      alarms.push({ device: name, type: 'FAULT', text: d.faultText || 'Falla detectada' });
    }

    // Current high
    if (devSP.currentHigh && d.current > devSP.currentHigh && !prev.alarmCurrent) {
      alarms.push({ device: name, type: 'CORRIENTE_ALTA', text: `${d.current.toFixed(1)}A > SP ${devSP.currentHigh}A` });
    }

    // Temperature high
    if (devSP.tempHigh && d.motorTemp > devSP.tempHigh && !prev.alarmTemp) {
      alarms.push({ device: name, type: 'TEMP_ALTA', text: `${d.motorTemp.toFixed(1)}°C > SP ${devSP.tempHigh}°C` });
    }

    // Offline
    if (!d.online && prev.online !== false && prev.online !== undefined) {
      alarms.push({ device: name, type: 'OFFLINE', text: 'Comunicacion perdida' });
    }

    // Cleared
    const cleared = [];
    if (!d.hasFault && prev.hasFault) cleared.push({ device: name, type: 'FAULT', text: 'Resuelta' });
    if (d.online && prev.online === false) cleared.push({ device: name, type: 'OFFLINE', text: 'Reconectado' });

    // Save state
    prevStates.set(name, {
      hasFault: d.hasFault,
      online: d.online,
      alarmCurrent: devSP.currentHigh ? d.current > devSP.currentHigh : false,
      alarmTemp: devSP.tempHigh ? d.motorTemp > devSP.tempHigh : false
    });

    // Rate limit and notify
    for (const a of alarms) {
      const key = `${a.device}_${a.type}`;
      const lastSent = cooldowns.get(key) || 0;
      if (Date.now() - lastSent < COOLDOWN_MS) continue;
      cooldowns.set(key, Date.now());

      const entry = { ...a, ts: Date.now(), status: 'alarm' };
      alertHistory.unshift(entry);
      if (alertHistory.length > MAX_HISTORY) alertHistory.pop();

      notify(a, 'alarm');
    }

    for (const a of cleared) {
      const entry = { ...a, ts: Date.now(), status: 'clear' };
      alertHistory.unshift(entry);
      if (alertHistory.length > MAX_HISTORY) alertHistory.pop();

      notify(a, 'clear');
    }
  }
}

// ─── Send notifications ─────────────────────────────────────────────
async function notify(alarm, status) {
  const icon = status === 'alarm' ? '🚨' : '✅';
  const label = status === 'alarm' ? 'ALARMA' : 'RESUELTA';

  console.log(`[ALERT] ${icon} ${alarm.device} — ${alarm.type}: ${alarm.text}`);

  // Telegram
  const tgMsg = `${icon} *${label} WEG SCADA*\n\n*${alarm.device}*\nTipo: ${alarm.type}\n${alarm.text}\n\n📅 ${new Date().toLocaleString('es-PY')}`;
  sendTelegram(tgMsg).catch(() => {});

  // Email
  const transport = getTransport();
  const emailTo = process.env.ALERT_EMAIL || '';
  if (transport && emailTo) {
    const color = status === 'alarm' ? '#d32f2f' : '#2e7d32';
    try {
      await transport.sendMail({
        from: `"WEG SCADA" <${process.env.SMTP_USER}>`,
        to: emailTo,
        subject: `[WEG SCADA] ${label} — ${alarm.device}: ${alarm.type}`,
        html: `<div style="font-family:Arial;max-width:600px">
          <h2 style="color:${color}">${icon} ${label}</h2>
          <table style="border-collapse:collapse">
            <tr><td style="padding:4px 12px;font-weight:bold">Drive</td><td style="padding:4px 12px">${alarm.device}</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold">Tipo</td><td style="padding:4px 12px">${alarm.type}</td></tr>
            <tr><td style="padding:4px 12px;font-weight:bold">Detalle</td><td style="padding:4px 12px">${alarm.text}</td></tr>
          </table>
          <p style="color:#666;font-size:12px;margin-top:16px">WEG SCADA — Tecnoelectric</p>
        </div>`
      });
    } catch (e) {
      console.error('[EMAIL] Error:', e.message);
    }
  }
}

// ─── Start polling ──────────────────────────────────────────────────
function start() {
  console.log('[ALERT] Alert service started (5s check interval)');
  setInterval(evaluate, 5000);
}

function getHistory() {
  return alertHistory;
}

module.exports = { start, getHistory, evaluate };
