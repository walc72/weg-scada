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
        'Authorization': `Token ${influx.token}`,
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

// ─── Generate report data ───────────────────────────────────────────
async function generateReport(options) {
  const { from, to, devices, fields } = options;
  const start = from || '-24h';
  const stop = to || 'now()';

  const deviceFilter = devices && devices.length
    ? devices.map(d => `r.name == "${d}"`).join(' or ')
    : 'true';

  const fieldList = fields && fields.length
    ? fields.map(f => `r._field == "${f}"`).join(' or ')
    : 'r._field == "current" or r._field == "voltage" or r._field == "power" or r._field == "motor_temp" or r._field == "frequency" or r._field == "motor_speed"';

  const query = `from(bucket: "weg_drives")
  |> range(start: ${start}, stop: ${stop})
  |> filter(fn: (r) => r._measurement == "drive_data")
  |> filter(fn: (r) => ${fieldList})
  |> filter(fn: (r) => ${deviceFilter})
  |> aggregateWindow(every: 1m, fn: mean, createEmpty: false)
  |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
  |> keep(columns: ["_time", "name", "site", "current", "voltage", "power", "motor_temp", "frequency", "motor_speed"])
  |> sort(columns: ["_time"])`;

  return queryInflux(query);
}

// ─── Format as CSV string ───────────────────────────────────────────
function toCSV(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map(h => row[h] || '').join(','));
  }
  return lines.join('\n');
}

// ─── Generate PDF ───────────────────────────────────────────────────
function toPDF(rows, title) {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });
  const chunks = [];

  return new Promise((resolve) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    // Header
    doc.fontSize(16).fillColor('#1a4d8f').text(title || 'Reporte WEG SCADA', { align: 'center' });
    doc.fontSize(10).fillColor('#666').text(new Date().toLocaleString('es-PY'), { align: 'center' });
    doc.moveDown();

    if (!rows.length) {
      doc.fontSize(12).fillColor('#000').text('Sin datos para el rango seleccionado');
      doc.end();
      return;
    }

    // Table
    const headers = Object.keys(rows[0]).slice(0, 8); // max 8 columns
    const colWidth = (doc.page.width - 60) / headers.length;
    let y = doc.y;

    // Header row
    doc.fontSize(8).fillColor('#fff');
    headers.forEach((h, i) => {
      doc.rect(30 + i * colWidth, y, colWidth, 18).fill('#1a4d8f');
      doc.fillColor('#fff').text(h, 32 + i * colWidth, y + 4, { width: colWidth - 4 });
    });
    y += 20;

    // Data rows (max 500)
    doc.fillColor('#000');
    const maxRows = Math.min(rows.length, 500);
    for (let r = 0; r < maxRows; r++) {
      if (y > doc.page.height - 40) {
        doc.addPage();
        y = 30;
      }
      const bg = r % 2 === 0 ? '#f8f8f8' : '#fff';
      headers.forEach((h, i) => {
        doc.rect(30 + i * colWidth, y, colWidth, 14).fill(bg);
        doc.fillColor('#333').fontSize(7).text(String(rows[r][h] || '').substring(0, 20), 32 + i * colWidth, y + 3, { width: colWidth - 4 });
      });
      y += 14;
    }

    doc.end();
  });
}

module.exports = { generateReport, toCSV, toPDF, queryInflux };
