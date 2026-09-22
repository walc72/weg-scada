'use strict';

const http = require('http');
const configService = require('./config');

// ─── Query InfluxDB ─────────────────────────────────────────────────
function queryInflux(fluxQuery) {
  const cfg = configService.get();
  if (!cfg || !cfg.influxdb) return Promise.reject(new Error('No InfluxDB config'));

  const influx = cfg.influxdb;
  const url = new URL(influx.url);

  return new Promise((resolve, reject) => {
    const body = fluxQuery;
    const opts = {
      hostname: url.hostname,
      port: url.port || 8086,
      path: `/api/v2/query?org=${encodeURIComponent(influx.org)}`,
      method: 'POST',
      headers: {
        // Prioridad al env (igual que el poller): el token no deberia vivir
        // en config.json, que ademas se sirve entero por GET /api/config
        'Authorization': `Token ${process.env.INFLUXDB_TOKEN || influx.token}`,
        'Content-Type': 'application/vnd.flux',
        'Accept': 'application/csv'
      }
    };

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(parseCSV(data));
        } else {
          reject(new Error(`InfluxDB ${res.statusCode}: ${data.substring(0, 200)}`));
        }
      });
    });
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('InfluxDB query timeout'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Parse CSV response ─────────────────────────────────────────────
function parseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];

  const rows = [];
  let headers = null;

  for (const line of lines) {
    if (line.startsWith('#') || line.trim() === '') continue;
    const cols = line.split(',');
    if (!headers) {
      headers = cols.map(c => c.trim());
      continue;
    }
    const row = {};
    cols.forEach((val, i) => {
      if (!headers[i]) return;
      const v = val.trim();
      const num = parseFloat(v);
      row[headers[i]] = (!isNaN(num) && v !== '' && !v.includes('T')) ? parseFloat(num.toFixed(2)) : v;
    });
    rows.push(row);
  }
  return rows;
}

// ─── Allowed values ─────────────────────────────────────────────────
const ALLOWED_FIELDS = new Set([
  'current', 'voltage', 'power', 'motor_temp', 'frequency', 'motor_speed',
  'igbt_temp', 'scr_temp', 'cos_phi'
]);
const REPORT_COLUMNS = [
  '_time', 'name', 'site', 'current', 'voltage', 'power',
  'frequency', 'motor_speed', 'motor_temp', 'igbt_temp', 'scr_temp', 'cos_phi'
];
const RANGE_RE = /^(-\d+[smhdw]|now\(\)|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z)$/;

function escapeFluxString(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// ─── Generate report data ───────────────────────────────────────────
async function generateReport(options) {
  const { from, to, devices, fields } = options;

  const start = (from && RANGE_RE.test(from)) ? from : '-24h';
  const stop = (to && RANGE_RE.test(to)) ? to : 'now()';

  const safeDevices = Array.isArray(devices) ? devices.map(d => escapeFluxString(d)) : [];
  const safeFields = Array.isArray(fields)
    ? fields.filter(f => ALLOWED_FIELDS.has(f))
    : [];

  const deviceFilter = safeDevices.length
    ? safeDevices.map(d => `r.name == "${d}"`).join(' or ')
    : 'true';

  const activeFields = safeFields.length ? safeFields : [...ALLOWED_FIELDS];
  const fieldList = activeFields.map(f => `r._field == "${f}"`).join(' or ');
  const keepCols = ['_time', 'name', 'site', ...activeFields]
    .map(c => `"${c}"`).join(', ');

  const query = `from(bucket: "weg_drives")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "drive_data")
  |> filter(fn: (r) => ${fieldList})
  |> filter(fn: (r) => ${deviceFilter})
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time", "name", "site"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: [${keepCols}])
  |> sort(columns: ["_time"])`;

  return queryInflux(query);
}

// ─── Series JSON para gráficos históricos (drives + medidores) ──────
// Devuelve filas pivoteadas por _time/name para que el frontend arme las
// series de cada gráfico desde InfluxDB (rango real), no del buffer en RAM.
function queryMeasurement(measurement, fields, start, stop, windowSec, extraKeys, bucket) {
  const fieldList = fields.map(f => `r._field == "${f}"`).join(' or ');
  const rowKeys = ['_time', 'name', ...(extraKeys || [])];
  const keepCols = [...rowKeys, ...fields].map(c => `"${c}"`).join(', ');
  const every = `${windowSec}s`;
  const safeBucket = /^[A-Za-z0-9_-]{1,64}$/.test(bucket) ? bucket : 'weg_drives';
  const query = `from(bucket: "${safeBucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => ${fieldList})
  |> aggregateWindow(every: ${every}, fn: mean, createEmpty: false)
  |> pivot(rowKey: [${rowKeys.map(c => `"${c}"`).join(', ')}], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: [${keepCols}])
  |> sort(columns: ["_time"])`;
  return queryInflux(query);
}

async function generateSeries(options) {
  const { from, to } = options || {};
  const start = (from && RANGE_RE.test(from)) ? from : '-1h';
  const stop = (to && RANGE_RE.test(to)) ? to : 'now()';
  let windowSec = parseInt(options && options.windowSec, 10);
  if (!Number.isFinite(windowSec) || windowSec < 10) windowSec = 60;
  if (windowSec > 3600) windowSec = 3600;
  // Bucket a consultar: vivo (weg_drives) o un archivo restaurado (weg_archive_*)
  const bucket = (options && typeof options.bucket === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(options.bucket)) ? options.bucket : 'weg_drives';

  const [drives, meters] = await Promise.all([
    queryMeasurement('drive_data',
      ['current', 'voltage', 'power', 'frequency', 'motor_speed', 'igbt_temp', 'scr_temp', 'cos_phi'],
      start, stop, windowSec, ['site'], bucket),
    queryMeasurement('meter_data',
      ['current', 'voltage', 'power', 'pf'],
      start, stop, windowSec, [], bucket),
  ]);
  return { drives, meters, windowSec, bucket };
}

// Lista los buckets disponibles (vivo + archivos). Filtra los internos (_...).
function listBuckets() {
  const cfg = configService.get();
  if (!cfg || !cfg.influxdb) return Promise.reject(new Error('No InfluxDB config'));
  const influx = cfg.influxdb;
  const url = new URL(influx.url);
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: url.hostname,
      port: url.port || 8086,
      path: `/api/v2/buckets?org=${encodeURIComponent(influx.org)}&limit=100`,
      method: 'GET',
      headers: { 'Authorization': `Token ${process.env.INFLUXDB_TOKEN || influx.token}` },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => data += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return reject(new Error(`InfluxDB ${res.statusCode}`));
        try {
          const j = JSON.parse(data);
          const names = (j.buckets || []).map(b => b.name).filter(n => n && !n.startsWith('_'));
          resolve(names);
        } catch (e) { reject(e); }
      });
    });
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('timeout')); });
    req.on('error', reject);
    req.end();
  });
}

// ─── Resumen agregado por rango (energía, horas, mín/máx/prom) ──────
// Se usa tanto para el reporte diario (día completo) como para el
// reporte general (rango manual). Todo el cálculo pesado va a InfluxDB.

// Rango de un día local 'YYYY-MM-DD' -> ISO UTC {start, stop}
function dayRange(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) throw new Error('Fecha inválida (YYYY-MM-DD)');
  const start = new Date(`${dateStr}T00:00:00`);      // medianoche local (TZ del contenedor)
  if (isNaN(start.getTime())) throw new Error('Fecha inválida');
  // El fin del día puede caer en el FUTURO (día en curso). Un stop futuro rompe
  // integral(interpolate:"linear") -> energía basura (valores enormes/negativos).
  // Se clampa a "ahora" para el día actual; los días pasados quedan igual.
  const stopMs = Math.min(start.getTime() + 24 * 3600 * 1000, Date.now());
  const stop = new Date(stopMs);
  return { start: start.toISOString(), stop: stop.toISOString() };
}

// Agrega un stream por (name,_field) con una función Flux (mean/min/max).
// Devuelve un mapa { name: { field: valor } }.
async function aggBy(measurement, fields, fn, start, stop, bucket) {
  const fieldList = fields.map(f => `r._field == "${f}"`).join(' or ');
  const q = `from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => ${fieldList})
  |> group(columns: ["name", "_field"])
  |> ${fn}()`;
  const rows = await queryInflux(q);
  const out = {};
  for (const r of rows) {
    if (!r.name || !r._field) continue;
    (out[r.name] || (out[r.name] = {}))[r._field] = r._value;
  }
  return out;
}

// spread() por name (max-min): sirve para contadores acumulados
// (run_hours -> horas del día, comm_errors -> errores del día).
async function spreadBy(measurement, field, start, stop, bucket) {
  const q = `from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "${field}")
  |> group(columns: ["name"])
  |> spread()`;
  const rows = await queryInflux(q);
  const out = {};
  for (const r of rows) { if (r.name != null) out[r.name] = r._value; }
  return out;
}

// integral(unit:1h) por name: energía (∫ potencia·dt). power en kW -> kWh.
async function integralBy(measurement, field, start, stop, bucket) {
  // Ventana de 1 min con huecos rellenos en 0: los períodos sin datos (equipo
  // offline) NO acumulan energía fantasma. Antes, integral(interpolate:"linear")
  // interpolaba sobre los huecos e inflaba (o con stop futuro daba basura).
  const q = `from(bucket: "${bucket}")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "${measurement}")
  |> filter(fn: (r) => r._field == "${field}")
  |> group(columns: ["name"])
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: true)
  |> fill(value: 0.0)
  |> integral(unit: 1h)`;
  const rows = await queryInflux(q);
  const out = {};
  for (const r of rows) { if (r.name != null) out[r.name] = r._value; }
  return out;
}

const round = (v, d = 2) => (v == null || isNaN(v)) ? null : parseFloat(Number(v).toFixed(d));
const stat = (mean, min, max) => ({ avg: round(mean), min: round(min), max: round(max) });

async function generateSummary(options) {
  const { from, to } = options || {};
  const start = (from && RANGE_RE.test(from)) ? from : '-24h';
  const stop = (to && RANGE_RE.test(to)) ? to : 'now()';
  const bucket = (options && typeof options.bucket === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(options.bucket)) ? options.bucket : 'weg_drives';

  // Mapa nombre->tipo/site desde la config (para elegir temp IGBT vs SCR)
  const cfg = configService.get() || {};
  const typeByName = {};
  const siteByName = {};
  for (const d of (cfg.drives || [])) { if (d && d.name) { typeByName[d.name] = d.type || 'CFW900'; siteByName[d.name] = d.site || ''; } }
  const meterNames = (cfg.meterNames) || {};

  const driveFields = ['current', 'power', 'cos_phi', 'igbt_temp', 'scr_temp', 'frequency', 'motor_speed', 'voltage'];
  const meterFields = ['voltage', 'current', 'power', 'pf'];

  const [
    dMean, dMin, dMax, dEnergy, dHours, dComm,
    mMean, mMin, mMax, mEnergy,
  ] = await Promise.all([
    aggBy('drive_data', driveFields, 'mean', start, stop, bucket),
    aggBy('drive_data', driveFields, 'min', start, stop, bucket),
    aggBy('drive_data', driveFields, 'max', start, stop, bucket),
    integralBy('drive_data', 'power', start, stop, bucket),
    spreadBy('drive_data', 'run_hours', start, stop, bucket),
    spreadBy('drive_data', 'comm_errors', start, stop, bucket),
    aggBy('meter_data', meterFields, 'mean', start, stop, bucket),
    aggBy('meter_data', meterFields, 'min', start, stop, bucket),
    aggBy('meter_data', meterFields, 'max', start, stop, bucket),
    integralBy('meter_data', 'power', start, stop, bucket),
  ]);

  const driveNames = new Set([...Object.keys(dMean), ...Object.keys(dEnergy), ...Object.keys(dHours)]);
  const drives = [...driveNames].sort().map(name => {
    const type = typeByName[name] || 'CFW900';
    const isCFW = type !== 'SSW900';
    const tf = isCFW ? 'igbt_temp' : 'scr_temp';
    const mean = dMean[name] || {}, mn = dMin[name] || {}, mx = dMax[name] || {};
    return {
      name, type, site: siteByName[name] || '',
      energyKwh: round(dEnergy[name], 1),
      opHours: round(dHours[name], 2),
      commErrors: round(dComm[name], 0),
      stats: {
        current:   stat(mean.current, mn.current, mx.current),
        power:     stat(mean.power, mn.power, mx.power),
        temp:      stat(mean[tf], mn[tf], mx[tf]),
        cosPhi:    { avg: round(mean.cos_phi, 3), min: round(mn.cos_phi, 3), max: round(mx.cos_phi, 3) },
        frequency: stat(mean.frequency, mn.frequency, mx.frequency),
      },
    };
  });

  const meterKeys = new Set([...Object.keys(mMean), ...Object.keys(mEnergy)]);
  const meters = [...meterKeys].sort().map(name => {
    const mean = mMean[name] || {}, mn = mMin[name] || {}, mx = mMax[name] || {};
    return {
      name, displayName: meterNames[name] || name,
      // La potencia del medidor viene en W -> kWh y kW
      energyKwh: round((mEnergy[name] || 0) / 1000, 1),
      stats: {
        voltage: { avg: round((mean.voltage || 0) / 1000, 3), min: round((mn.voltage || 0) / 1000, 3), max: round((mx.voltage || 0) / 1000, 3) }, // kV
        current: stat(mean.current, mn.current, mx.current),
        power:   { avg: round((mean.power || 0) / 1000, 2), min: round((mn.power || 0) / 1000, 2), max: round((mx.power || 0) / 1000, 2) }, // kW
        pf:      { avg: round(mean.pf, 3), min: round(mn.pf, 3), max: round(mx.pf, 3) },
      },
    };
  });

  const totalEnergy = round(drives.reduce((s, d) => s + (d.energyKwh || 0), 0), 1);
  return { from: start, to: stop, bucket, drives, meters, totals: { driveEnergyKwh: totalEnergy } };
}

async function generateDailySummary(dateStr, bucket) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(dateStr || '') ? dateStr : new Date().toISOString().slice(0, 10);
  const { start, stop } = dayRange(date);
  const summary = await generateSummary({ from: start, to: stop, bucket });
  return { date, ...summary };
}

// ─── PDF del resumen (diario o de rango) ────────────────────────────
function toSummaryPDF(summary, opts) {
  const PDFDocument = require('pdfkit');
  const path = require('path');
  const fs = require('fs');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks = [];
  const ORANGE = '#E87722', DARK = '#333333', GREY = '#888888', LINE = '#e5e5e5';
  const agriplusLogo = path.join(__dirname, '..', 'agriplus.png');
  const hasAgriplus = fs.existsSync(agriplusLogo);

  return new Promise((resolve) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageW = doc.page.width;
    const mL = 36, mR = 36;
    const contentW = pageW - mL - mR;
    const title = (opts && opts.title) || 'Reporte Diario — Resumen';
    const subtitle = (opts && opts.subtitle) || '';

    // Header
    if (hasAgriplus) { try { doc.image(agriplusLogo, mL, 22, { height: 34 }); } catch (e) {} }
    doc.fontSize(16).fillColor(DARK).font('Helvetica-Bold').text(title, mL + 130, 24, { width: contentW - 130 });
    doc.fontSize(9).fillColor(GREY).font('Helvetica').text(subtitle, mL + 130, 44, { width: contentW - 130 });
    doc.moveTo(mL, 62).lineTo(pageW - mR, 62).lineWidth(2).strokeColor(ORANGE).stroke();
    doc.y = 74;

    function tableHeader(cols, widths, y) {
      doc.rect(mL, y, contentW, 20).fill(ORANGE);
      let x = mL;
      cols.forEach((c, i) => {
        doc.fontSize(7.5).fillColor('#fff').font('Helvetica-Bold')
          .text(c, x + 4, y + 5, { width: widths[i] - 8, align: i === 0 ? 'left' : 'center' });
        x += widths[i];
      });
      return y + 22;
    }
    function tableRow(vals, widths, y, i) {
      if (i % 2 === 1) { doc.rect(mL, y, contentW, 16).fill('#fafafa'); }
      let x = mL;
      vals.forEach((v, k) => {
        doc.fontSize(7.5).fillColor(DARK).font('Helvetica')
          .text(String(v == null ? '-' : v), x + 4, y + 4, { width: widths[k] - 8, align: k === 0 ? 'left' : 'center' });
        x += widths[k];
      });
      return y + 16;
    }
    function sectionTitle(t) {
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#444').font('Helvetica-Bold').text(t.toUpperCase(), mL, doc.y);
      doc.y += 2;
    }
    const trip = (s) => s ? `${s.avg ?? '-'} / ${s.min ?? '-'} / ${s.max ?? '-'}` : '-';

    // Drives
    sectionTitle('Drives — energía, horas y estadísticas del período (prom/mín/máx)');
    const dCols = ['Drive', 'Tipo', 'Energía kWh', 'Hrs operación', 'Corriente A', 'Potencia kW', 'Temp °C', 'Cos φ', 'Errores com.'];
    const dW = [0.16, 0.07, 0.10, 0.10, 0.13, 0.13, 0.13, 0.10, 0.08].map(f => f * contentW);
    let y = tableHeader(dCols, dW, doc.y);
    (summary.drives || []).forEach((d, i) => {
      if (y > doc.page.height - 50) { doc.addPage(); y = tableHeader(dCols, dW, 40); }
      y = tableRow([d.name, d.type, d.energyKwh, d.opHours, trip(d.stats.current), trip(d.stats.power), trip(d.stats.temp), trip(d.stats.cosPhi), d.commErrors], dW, y, i);
    });
    if (!(summary.drives || []).length) { y = tableRow(['Sin datos', '', '', '', '', '', '', '', ''], dW, y, 0); }
    doc.y = y + 2;
    doc.fontSize(8).fillColor(ORANGE).font('Helvetica-Bold')
      .text(`Energía total drives: ${summary.totals ? summary.totals.driveEnergyKwh : '-'} kWh`, mL, doc.y, { width: contentW, align: 'right' });
    doc.y += 6;

    // Meters
    if ((summary.meters || []).length) {
      sectionTitle('Medidores — energía y estadísticas (prom/mín/máx)');
      const mCols = ['Medidor', 'Energía kWh', 'Tensión kV', 'Corriente A', 'Potencia kW', 'FP'];
      const mW = [0.24, 0.14, 0.16, 0.16, 0.16, 0.14].map(f => f * contentW);
      let my = tableHeader(mCols, mW, doc.y);
      summary.meters.forEach((m, i) => {
        if (my > doc.page.height - 50) { doc.addPage(); my = tableHeader(mCols, mW, 40); }
        my = tableRow([m.displayName, m.energyKwh, trip(m.stats.voltage), trip(m.stats.current), trip(m.stats.power), trip(m.stats.pf)], mW, my, i);
      });
      doc.y = my;
    }

    // Footer
    doc.fontSize(7.5).fillColor(GREY)
      .text(`Generado ${new Date().toLocaleString('es-PY')}  |  Powered by Tecno Electric S.A.`, mL, doc.page.height - 28, { width: contentW, align: 'center' });
    doc.end();
  });
}

// ─── XLSX (OOXML mínimo, sin dependencias externas) ─────────────────
// Escribe un .xlsx real (zip + zlib deflate). Cada hoja: { name, headers, rows }.
function toXLSX(sheets) {
  const zlib = require('zlib');
  const CRC = (() => {
    const t = [];
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  })();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colRef = (i) => { let s = '', n = i; do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0); return s; };

  function sheetXml(sheet) {
    const rows = [sheet.headers, ...sheet.rows].map((row, r) => {
      const cells = row.map((v, c) => {
        const ref = `${colRef(c)}${r + 1}`;
        if (r > 0 && typeof v === 'number' && isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v == null ? '' : v)}</t></is></c>`;
      }).join('');
      return `<row r="${r + 1}">${cells}</row>`;
    }).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`;
  }

  const list = sheets.filter(s => s && s.headers);
  if (!list.length) list.push({ name: 'Hoja1', headers: ['Sin datos'], rows: [] });

  const files = {};
  files['[Content_Types].xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${list.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  files['_rels/.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  files['xl/workbook.xml'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${list.map((s, i) => `<sheet name="${esc((s.name || `Hoja${i + 1}`).slice(0, 31))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  files['xl/_rels/workbook.xml.rels'] = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${list.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`;
  list.forEach((s, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(s); });

  // Build ZIP (deflate raw)
  const local = [], central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(content, 'utf8');
    const comp = zlib.deflateRawSync(data);
    const crc = CRC(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(8, 8); lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    local.push(lh, nameBuf, comp);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt16LE(0, 30); ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34); ch.writeUInt16LE(0, 36); ch.writeUInt32LE(0, 38); ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const localBuf = Buffer.concat(local);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(Object.keys(files).length, 8); eocd.writeUInt16LE(Object.keys(files).length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(localBuf.length, 16); eocd.writeUInt16LE(0, 20);
  return Buffer.concat([localBuf, centralBuf, eocd]);
}

// Arma las hojas XLSX del reporte general (filas crudas) + resumen opcional
function reportToXLSX(rows, summary) {
  const sheets = [];
  if (rows && rows.length) {
    const keys = REPORT_COLUMNS.filter(k => rows[0].hasOwnProperty(k));
    const headers = keys.map(k => HEADER_MAP[k] || k);
    const dataRows = rows.map(r => keys.map(k => {
      let v = r[k];
      if (k === '_time' && v) return new Date(v).toLocaleString('es-PY');
      return v == null ? '' : v;
    }));
    sheets.push({ name: 'Detalle', headers, rows: dataRows });
  }
  if (summary) {
    const trip = (s) => s ? [s.avg, s.min, s.max] : [null, null, null];
    const dh = ['Drive', 'Tipo', 'Energía kWh', 'Hrs operación', 'I prom', 'I mín', 'I máx', 'P prom', 'P mín', 'P máx', 'Temp prom', 'Cos φ prom', 'Errores'];
    const dr = (summary.drives || []).map(d => [d.name, d.type, d.energyKwh, d.opHours, ...trip(d.stats.current), ...trip(d.stats.power), d.stats.temp.avg, d.stats.cosPhi.avg, d.commErrors]);
    sheets.push({ name: 'Resumen Drives', headers: dh, rows: dr });
    if ((summary.meters || []).length) {
      const mh = ['Medidor', 'Energía kWh', 'V prom kV', 'I prom A', 'P prom kW', 'FP prom'];
      const mr = summary.meters.map(m => [m.displayName, m.energyKwh, m.stats.voltage.avg, m.stats.current.avg, m.stats.power.avg, m.stats.pf.avg]);
      sheets.push({ name: 'Resumen Medidores', headers: mh, rows: mr });
    }
  }
  return toXLSX(sheets);
}

// ─── Format as CSV string ───────────────────────────────────────────
const HEADER_MAP = {
  '_time': 'Fecha/Hora', 'name': 'Drive', 'site': 'Sitio',
  'current': 'Corriente (A)', 'voltage': 'Voltaje (V)', 'power': 'Potencia (kW)',
  'motor_temp': 'Temp Motor (C)', 'igbt_temp': 'Temp IGBT (C)', 'scr_temp': 'Temp SCR (C)',
  'frequency': 'Frecuencia (Hz)', 'motor_speed': 'Velocidad (RPM)', 'cos_phi': 'Cos Phi'
};

function toCSV(rows) {
  if (!rows.length) return '';
  const keys = REPORT_COLUMNS.filter(k => rows[0].hasOwnProperty(k));
  const lines = [keys.map(k => HEADER_MAP[k] || k).join(',')];
  for (const row of rows) {
    lines.push(keys.map(k => {
      let v = row[k];
      if (v == null) return '';  // null/undefined -> vacio; el 0 se conserva
      if (k === '_time') { v = new Date(v).toLocaleString('es-PY'); }
      const s = String(v);
      return s.includes(',') ? `"${s}"` : s;
    }).join(','));
  }
  return lines.join('\n');
}

// ─── Generate PDF (detalle crudo) ───────────────────────────────────
// Mismo estilo branded que toSummaryPDF (naranja Agriplus + footer TE), para
// que "Exportar datos" y "Resumen diario" se vean como una sola familia.
function toPDF(rows, title) {
  const PDFDocument = require('pdfkit');
  const path = require('path');
  const fs = require('fs');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
  const chunks = [];
  const ORANGE = '#E87722', DARK = '#333333', GREY = '#888888';
  const agriplusLogo = path.join(__dirname, '..', 'agriplus.png');
  const hasAgriplus = fs.existsSync(agriplusLogo);

  return new Promise((resolve) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const mL = 36, mR = 36;
    const contentW = pageW - mL - mR;
    const reportTitle = title || 'Reporte de Drives — Monitoreo';

    // Subtítulo: rango de datos + conteo de registros/drives
    const drivesSet = {}, sitesSet = {};
    rows.forEach(r => { if (r.name) drivesSet[r.name] = 1; if (r.site) sitesSet[r.site] = 1; });
    const times = rows.map(r => r._time).filter(Boolean).sort();
    const rangeTxt = times.length
      ? `${new Date(times[0]).toLocaleString('es-PY')} – ${new Date(times[times.length - 1]).toLocaleString('es-PY')}`
      : '';
    const subtitle = `${rangeTxt}  ·  ${rows.length} registros · ${Object.keys(drivesSet).length} drives`
      + (Object.keys(sitesSet).length ? ` · ${Object.keys(sitesSet).join(', ')}` : '');

    // Header branded (igual que toSummaryPDF): logo + título + línea naranja
    function drawHeader() {
      if (hasAgriplus) { try { doc.image(agriplusLogo, mL, 22, { height: 34 }); } catch (e) {} }
      doc.fontSize(16).fillColor(DARK).font('Helvetica-Bold').text(reportTitle, mL + 130, 24, { width: contentW - 130 });
      doc.fontSize(9).fillColor(GREY).font('Helvetica').text(subtitle, mL + 130, 44, { width: contentW - 130 });
      doc.moveTo(mL, 62).lineTo(pageW - mR, 62).lineWidth(2).strokeColor(ORANGE).stroke();
      doc.y = 74;
    }

    const headerMap = {
      '_time': 'Fecha/Hora', 'name': 'Drive', 'site': 'Sitio',
      'current': 'Corriente (A)', 'voltage': 'Voltaje (V)', 'power': 'Potencia (kW)',
      'motor_temp': 'Temp (°C)', 'igbt_temp': 'IGBT (°C)', 'scr_temp': 'SCR (°C)',
      'frequency': 'Frec. (Hz)', 'motor_speed': 'Vel. (RPM)', 'cos_phi': 'Cos φ'
    };

    function tableHeader(cols, widths, y) {
      doc.rect(mL, y, contentW, 20).fill(ORANGE);
      let x = mL;
      cols.forEach((col, i) => {
        doc.fontSize(7.5).fillColor('#fff').font('Helvetica-Bold')
          .text(headerMap[col] || col, x + 4, y + 6, { width: widths[i] - 8, align: i === 0 ? 'left' : 'center' });
        x += widths[i];
      });
      return y + 22;
    }

    function drawFooter() {
      doc.fontSize(7.5).fillColor(GREY)
        .text(`Generado ${new Date().toLocaleString('es-PY')}  |  Powered by Tecno Electric S.A.`,
          mL, pageH - 28, { width: contentW, align: 'center' });
    }

    drawHeader();

    if (!rows.length) {
      doc.fontSize(12).fillColor(DARK).text('Sin datos para el rango seleccionado.', mL, 90);
      drawFooter();
      doc.end();
      return;
    }

    const cols = REPORT_COLUMNS.filter(k => rows[0].hasOwnProperty(k));
    const colWidths = cols.map(k => {
      if (k === '_time') return 110;
      if (k === 'name') return 78;
      if (k === 'site') return 66;
      return (contentW - 254) / Math.max(cols.length - 3, 1);
    });

    let y = tableHeader(cols, colWidths, doc.y);

    for (let r = 0; r < rows.length; r++) {
      if (y > pageH - 44) {
        drawFooter();
        doc.addPage();
        drawHeader();
        y = tableHeader(cols, colWidths, doc.y);
      }
      if (r % 2 === 1) doc.rect(mL, y, contentW, 16).fill('#fafafa');
      let x = mL;
      cols.forEach((col, i) => {
        let val = rows[r][col];
        if (col === '_time' && val) val = new Date(val).toLocaleString('es-PY');
        else if (typeof val === 'number') val = val.toFixed(2);  // conserva el 0
        else if (val == null) val = '-';
        doc.fontSize(7.5).fillColor(DARK).font('Helvetica')
          .text(String(val), x + 4, y + 4, { width: colWidths[i] - 8, align: i === 0 ? 'left' : 'center' });
        x += colWidths[i];
      });
      y += 16;
    }

    drawFooter();
    doc.end();
  });
}

module.exports = {
  generateReport, generateSeries, listBuckets, toCSV, toPDF, queryInflux,
  generateSummary, generateDailySummary, toSummaryPDF, toXLSX, reportToXLSX,
};
