'use strict';

// Conversión de la respuesta CSV anotada de InfluxDB (/api/v2/query con
// dialect.annotations=["datatype"]) a line protocol, SIN pérdida: respeta el
// tipo de cada campo según la tabla (double / long / boolean / string) y el
// timestamp en ns. Lo usa la API de réplica para servir el histórico tal cual.

const NON_TAG_COLS = new Set(['', 'result', 'table', '_start', '_stop', '_time', '_value', '_field', '_measurement']);

// Divide una línea CSV respetando comillas RFC 4180 ("a,b" y "" escapado)
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// "2026-09-27T00:00:20.5Z" -> ns desde epoch (string, para no perder precisión)
function rfc3339ToNs(s) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(String(s));
  if (!m) throw new Error(`timestamp inválido: ${s}`);
  const sec = BigInt(Date.parse(m[1] + 'Z') / 1000);
  const frac = BigInt((m[2] || '').padEnd(9, '0'));
  return (sec * 1000000000n + frac).toString();
}

// Recorre las tablas del CSV anotado: llama onRow(obj, datatypes, header) por fila
function eachRow(csv, onRow) {
  let datatypes = null;
  let header = null;
  for (const raw of String(csv).split(/\r?\n/)) {
    if (raw.startsWith('#datatype')) { datatypes = splitCsvLine(raw); header = null; continue; }
    if (raw.startsWith('#')) continue;
    if (raw.trim() === '') { header = null; continue; }
    const cols = splitCsvLine(raw);
    if (!header) {
      header = cols;
      continue;
    }
    const obj = {};
    header.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
    if (header.includes('error')) throw new Error(`InfluxDB: ${obj.error}`);
    onRow(obj, datatypes, header);
  }
}

function parseAnnotatedCsv(csv) {
  const rows = [];
  eachRow(csv, (obj, datatypes, header) => {
    const type = datatypes ? datatypes[header.indexOf('_value')] : 'double';
    const tags = {};
    for (const h of header) {
      if (!NON_TAG_COLS.has(h) && obj[h] !== '') tags[h] = obj[h];
    }
    rows.push({
      measurement: obj._measurement,
      tags,
      field: obj._field,
      type,
      value: obj._value,
      time: rfc3339ToNs(obj._time),
    });
  });
  return rows;
}

function csvColumn(csv, name) {
  const out = [];
  eachRow(csv, (obj) => { if (obj[name] !== undefined && obj[name] !== '') out.push(obj[name]); });
  return out;
}

const escMeasurement = (s) => String(s).replace(/[, ]/g, (c) => '\\' + c);
const escKey = (s) => String(s).replace(/[,= ]/g, (c) => '\\' + c);

// Valor de campo en line protocol según el tipo de Influx; null = descartar
function fieldValue(type, raw) {
  switch (type) {
    case 'long': return `${raw}i`;
    case 'unsignedLong': return `${raw}u`;
    case 'boolean': return raw === 'true' ? 'true' : 'false';
    case 'string': return `"${String(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    default: {
      const n = Number(raw);
      return raw !== '' && Number.isFinite(n) ? raw : null;
    }
  }
}

function toLineProtocol(rows) {
  const points = new Map(); // key -> { head, time, fields: [] }
  for (const r of rows) {
    const v = fieldValue(r.type, r.value);
    if (v === null) continue;
    const tagStr = Object.keys(r.tags).sort().map(k => `,${escKey(k)}=${escKey(r.tags[k])}`).join('');
    const head = escMeasurement(r.measurement) + tagStr;
    const key = `${head} ${r.time}`;
    let p = points.get(key);
    if (!p) { p = { head, time: r.time, fields: [] }; points.set(key, p); }
    p.fields.push(`${escKey(r.field)}=${v}`);
  }
  return [...points.values()]
    .sort((a, b) => (BigInt(a.time) < BigInt(b.time) ? -1 : BigInt(a.time) > BigInt(b.time) ? 1 : 0))
    .map(p => `${p.head} ${p.fields.join(',')} ${p.time}`)
    .join('\n');
}

module.exports = { splitCsvLine, rfc3339ToNs, parseAnnotatedCsv, toLineProtocol, csvColumn };
