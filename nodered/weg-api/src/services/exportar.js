'use strict';

const { aLps } = require('./flowConfig');

const p2 = (n) => String(n).padStart(2, '0');

function celda(v) {
  if (v == null) return '';
  let s;
  if (v instanceof Date) {
    s = isNaN(v) ? '' : `${p2(v.getDate())}/${p2(v.getMonth() + 1)}/${v.getFullYear()} ${p2(v.getHours())}:${p2(v.getMinutes())}`;
  } else if (typeof v === 'number') {
    s = isFinite(v) ? String(v).replace('.', ',') : '';
  } else s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// CSV para Excel en español: BOM, ';' como separador, coma decimal, CRLF.
function aCSV(headers, rows) {
  return '﻿' + [headers, ...rows].map((r) => r.map(celda).join(';')).join('\r\n');
}

const HEADER_MAP = {
  _time: 'Fecha/Hora', name: 'Bomba', site: 'Sitio', current: 'Corriente (A)', voltage: 'Voltaje (V)',
  power: 'Potencia (kW)', motor_temp: 'Temp Motor (C)', igbt_temp: 'Temp IGBT (C)', scr_temp: 'Temp SCR (C)',
  frequency: 'Frecuencia (Hz)', motor_speed: 'Velocidad (RPM)', cos_phi: 'Cos Phi',
};
const CAMPOS_BOMBA = ['current', 'voltage', 'power', 'frequency', 'motor_speed', 'motor_temp', 'igbt_temp', 'scr_temp', 'cos_phi'];
const HEADER_CAMPO = { ia: 'Ia (A)', ib: 'Ib (A)', ic: 'Ic (A)', v: 'V (V)', tap: 'Tap' };
const TIPOS = ['bombas', 'medidores', 'caudal', 'campo'];
const RESOLUCIONES = [60, 900, 3600, 86400];
const EXCLUIDOS_CAMPO = new Set(['_time', 'name', 'kind', 'result', 'table', '_start', '_stop']);

const arr = (v) => (Array.isArray(v) ? v.map(String) : []);
const num = (v) => (v == null || v === '' ? null : v);

function opcionesExport(body) {
  const b = body || {};
  const tipos = TIPOS.filter((t) => arr(b.tipos).includes(t));
  const r = Number(b.resolucion);
  return {
    from: b.from,
    to: b.to,
    bucket: typeof b.bucket === 'string' ? b.bucket : undefined,
    tipos: tipos.length ? tipos : ['bombas'],
    resolucion: RESOLUCIONES.includes(r) ? r : 60,
    devices: arr(b.devices),
    fields: arr(b.fields),
  };
}

// Devuelve solo las tablas con filas. rows[i][0] es Date; faltantes -> null.
function tablasDetalle(series, { tipos = [], devices = [], fields = [] } = {}) {
  const s = series || {};
  const out = [];
  const add = (tipo, nombre, headers, rows) => { if (rows.length) out.push({ tipo, nombre, headers, rows }); };
  const f = CAMPOS_BOMBA.filter((c) => fields.includes(c));
  const campos = fields.length ? f : CAMPOS_BOMBA;
  for (const tipo of TIPOS.filter((t) => tipos.includes(t))) {
    if (tipo === 'bombas') {
      const d = (s.drives || []).filter((r) => !devices.length || devices.includes(r.name));
      const conCaudal = !fields.length && d.some((r) => r.flow != null);
      add(tipo, 'Bombas',
        ['Fecha/Hora', 'Bomba', 'Sitio', ...campos.map((c) => HEADER_MAP[c]), ...(conCaudal ? ['Caudal estimado (L/s)'] : [])],
        d.map((r) => [new Date(r._time), r.name ?? null, r.site ?? null, ...campos.map((c) => num(r[c])), ...(conCaudal ? [aLps(r.flow)] : [])]));
    } else if (tipo === 'medidores') {
      add(tipo, 'Medidores', ['Fecha/Hora', 'Medidor', 'Corriente (A)', 'Voltaje (V)', 'Potencia (kW)', 'FP'],
        (s.meters || []).map((r) => [new Date(r._time), r.name ?? null, num(r.current), num(r.voltage), num(r.power), num(r.pf)]));
    } else if (tipo === 'caudal') {
      add(tipo, 'Caudal', ['Fecha/Hora', 'Caudalímetro', 'Caudal (L/s)'],
        (s.flows || []).map((r) => [new Date(r._time), r.name ?? null, aLps(r.flow)]));
    } else {
      const c = s.campo || [];
      const ks = [...new Set(c.flatMap((r) => Object.keys(r)).filter((k) => !EXCLUIDOS_CAMPO.has(k)))].sort();
      add(tipo, 'Campo', ['Fecha/Hora', 'Equipo', 'Tipo', ...ks.map((k) => HEADER_CAMPO[k] || k)],
        c.map((r) => [new Date(r._time), r.name ?? null, r.kind ?? null, ...ks.map((k) => num(r[k]))]));
    }
  }
  return out;
}

module.exports = { aCSV, opcionesExport, tablasDetalle, HEADER_MAP };
