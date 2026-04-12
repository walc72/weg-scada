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
const ALLOWED_FIELDS = new Set(['current', 'voltage', 'power', 'motor_temp', 'frequency', 'motor_speed']);
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

  const fieldList = safeFields.length
    ? safeFields.map(f => `r._field == "${f}"`).join(' or ')
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
  const headerMap = {
    '_time': 'Fecha/Hora', 'name': 'Drive', 'site': 'Sitio',
    'current': 'Corriente (A)', 'voltage': 'Voltaje (V)', 'power': 'Potencia (kW)',
    'motor_temp': 'Temp Motor (C)', 'frequency': 'Frecuencia (Hz)', 'motor_speed': 'Velocidad (RPM)'
  };
  const order = ['_time', 'name', 'site', 'current', 'voltage', 'power', 'frequency', 'motor_speed', 'motor_temp'];
  const keys = order.filter(k => rows[0].hasOwnProperty(k));
  const lines = [keys.map(k => headerMap[k] || k).join(',')];
  for (const row of rows) {
    lines.push(keys.map(k => {
      let v = row[k] || '';
      if (k === '_time' && v) { const d = new Date(v); v = d.toLocaleString('es-PY'); }
      return typeof v === 'string' && v.includes(',') ? `"${v}"` : v;
    }).join(','));
  }
  return lines.join('\n');
}

// ─── Generate PDF ───────────────────────────────────────────────────
function toPDF(rows, title) {
  const PDFDocument = require('pdfkit');
  const path = require('path');
  const fs = require('fs');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
  const chunks = [];

  // Load logos
  const agriplusLogo = path.join(__dirname, '..', 'agriplus.png');
  const teLogo = path.join(__dirname, '..', 'images.png');
  const hasAgriplus = fs.existsSync(agriplusLogo);
  const hasTE = fs.existsSync(teLogo);

  return new Promise((resolve) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const marginL = 40;
    const marginR = 40;
    const contentW = pageW - marginL - marginR;

    // Header function (reusable for each page)
    function drawHeader() {
      // Blue header bar
      doc.rect(0, 0, pageW, 80).fill('#1a4d8f');

      // Agriplus logo (left)
      if (hasAgriplus) {
        try { doc.image(agriplusLogo, marginL, 10, { height: 45 }); } catch(e) {}
      }

      // Title centered
      doc.fontSize(18).fillColor('#ffffff').font('Helvetica-Bold')
        .text(title || 'Reporte de Drivers de Bombeo', 0, 18, { width: pageW, align: 'center' });

      // Date and summary below title
      doc.fontSize(10).fillColor('#ffffff').font('Helvetica')
        .text(new Date().toLocaleString('es-PY'), 0, 42, { width: pageW, align: 'center' });

      const sites = {};
      const drives = {};
      rows.forEach(r => { if (r.site) sites[r.site] = 1; if (r.name) drives[r.name] = 1; });
      doc.fontSize(9).fillColor('#d0d0ff')
        .text(`${rows.length} registros | ${Object.keys(drives).length} drives | ${Object.keys(sites).join(', ')}`,
          0, 56, { width: pageW, align: 'center' });

      // TE logo (right)
      if (hasTE) {
        try { doc.image(teLogo, pageW - marginR - 50, 10, { height: 50 }); } catch(e) {}
      }

      doc.y = 95;
    }

    drawHeader();

    if (!rows.length) {
      doc.fontSize(14).fillColor('#333').text('Sin datos para el rango seleccionado', marginL, 120);
      doc.end();
      return;
    }

    // Column config
    const headerMap = {
      '_time': 'Fecha/Hora', 'name': 'Drive', 'site': 'Sitio',
      'current': 'Corriente\n(A)', 'voltage': 'Voltaje\n(V)', 'power': 'Potencia\n(kW)',
      'motor_temp': 'Temp\n(°C)', 'frequency': 'Frec.\n(Hz)', 'motor_speed': 'Vel.\n(RPM)'
    };
    const order = ['_time', 'name', 'site', 'current', 'voltage', 'power', 'frequency', 'motor_speed', 'motor_temp'];
    const cols = order.filter(k => rows[0].hasOwnProperty(k));
    const colWidths = cols.map(k => {
      if (k === '_time') return 120;
      if (k === 'name') return 80;
      if (k === 'site') return 70;
      return (contentW - 270) / Math.max(cols.length - 3, 1);
    });

    // Table header
    let y = doc.y;
    doc.rect(marginL, y, contentW, 28).fill('#2c3e50');
    let x = marginL;
    cols.forEach((col, i) => {
      doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold')
        .text(headerMap[col] || col, x + 4, y + 4, { width: colWidths[i] - 8, align: 'left' });
      x += colWidths[i];
    });
    y += 30;

    // Data rows
    for (let r = 0; r < rows.length; r++) {
      if (y > pageH - 60) {
        // Page break
        doc.addPage();
        drawHeader();
        // Re-draw table header
        y = doc.y;
        doc.rect(marginL, y, contentW, 28).fill('#2c3e50');
        x = marginL;
        cols.forEach((col, i) => {
          doc.fontSize(8).fillColor('#ffffff').font('Helvetica-Bold')
            .text(headerMap[col] || col, x + 4, y + 4, { width: colWidths[i] - 8 });
          x += colWidths[i];
        });
        y += 30;
      }

      const bg = r % 2 === 0 ? '#f8f9fa' : '#ffffff';
      doc.rect(marginL, y, contentW, 18).fill(bg);

      // Thin border
      doc.rect(marginL, y, contentW, 18).lineWidth(0.5).strokeColor('#dee2e6').stroke();

      x = marginL;
      cols.forEach((col, i) => {
        let val = rows[r][col];
        if (col === '_time' && val) { const d = new Date(val); val = d.toLocaleString('es-PY'); }
        if (typeof val === 'number') val = val.toFixed(2);
        doc.fontSize(7.5).fillColor('#333').font('Helvetica')
          .text(String(val || '-'), x + 4, y + 4, { width: colWidths[i] - 8 });
        x += colWidths[i];
      });
      y += 18;
    }

    // End of report

    doc.end();
  });
}

module.exports = { generateReport, toCSV, toPDF, queryInflux };
