'use strict';

const http = require('http');
const configService = require('./config');

// Consulta Flux devolviendo el CSV anotado CRUDO (con #datatype). No usar
// reports.queryInflux para esto: redondea los valores a 2 decimales y pierde
// el tipo de cada campo. La réplica necesita los datos exactos.
function queryAnnotatedCsv(flux, timeoutMs = 30000) {
  const cfg = configService.get();
  if (!cfg || !cfg.influxdb) return Promise.reject(new Error('No InfluxDB config'));
  const influx = cfg.influxdb;
  const url = new URL(influx.url);
  const body = JSON.stringify({
    query: flux,
    type: 'flux',
    dialect: { annotations: ['datatype'], header: true, delimiter: ',' },
  });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: url.hostname,
      port: url.port || 8086,
      path: `/api/v2/query?org=${encodeURIComponent(influx.org)}`,
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.INFLUXDB_TOKEN || influx.token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/csv',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode === 200) resolve(text);
        else reject(new Error(`InfluxDB ${res.statusCode}: ${text.substring(0, 200)}`));
      });
    });
    req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error('InfluxDB query timeout')); });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function bucket() {
  const cfg = configService.get();
  return (cfg && cfg.influxdb && cfg.influxdb.bucket) || 'weg_drives';
}

module.exports = { queryAnnotatedCsv, bucket };
