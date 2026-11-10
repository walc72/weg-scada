'use strict';

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

module.exports = { aCSV };
