'use strict';

// Datos del día cargados a mano (lluvia en mm, altura del río en m). Se guardan
// por fecha en manual.json, junto a config.json (volumen persistente). Cada día
// se puede cargar/editar hasta el cierre = reporte automático del día siguiente
// (DAILY_REPORT_HOUR, hora local del contenedor). Después solo un administrador
// puede modificarlo.

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const MANUAL_PATH = path.join(path.dirname(CONFIG_PATH), 'manual.json');
const CLOSE_HOUR = Math.min(23, Math.max(0, parseInt(process.env.DAILY_REPORT_HOUR || '6', 10) || 6));

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(MANUAL_PATH, 'utf8'));
    return (j && typeof j === 'object' && !Array.isArray(j)) ? j : {};
  } catch { return {}; }
}
function write(obj) {
  const tmp = MANUAL_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, MANUAL_PATH);
}

const pad = (n) => String(n).padStart(2, '0');
function localDateStr(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Cierre del día D: día D+1 a las CLOSE_HOUR:00 (hora local)
function closeTime(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + 1);
  d.setHours(CLOSE_HOUR, 0, 0, 0);
  return d;
}

// Número opcional con rango; acepta coma decimal. Vacío -> null (sin dato).
function num(v, min, max, label) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) throw new Error(`${label}: valor inválido`);
  if (n < min || n > max) throw new Error(`${label}: fuera de rango (${min} a ${max})`);
  return Math.round(n * 100) / 100;
}

function get(dateStr) {
  const e = read()[dateStr] || {};
  return {
    rainMm: e.rainMm ?? null,
    riverM: e.riverM ?? null,
    updatedAt: e.updatedAt || null,
    updatedBy: e.updatedBy || null,
  };
}

function getWithStatus(dateStr) {
  const now = new Date();
  const close = closeTime(dateStr);
  return {
    date: dateStr,
    ...get(dateStr),
    closeAt: close.toISOString(),
    locked: now >= close,
    future: dateStr > localDateStr(now),
  };
}

function set(dateStr, body, user) {
  const all = read();
  const entry = {
    rainMm: num(body && body.rainMm, 0, 1000, 'Lluvia (mm)'),
    riverM: num(body && body.riverM, -100, 100, 'Altura del río (m)'),
    updatedAt: new Date().toISOString(),
    updatedBy: user || null,
  };
  all[dateStr] = entry;
  write(all);
  return entry;
}

module.exports = { get, getWithStatus, set, localDateStr, closeTime, MANUAL_PATH };
