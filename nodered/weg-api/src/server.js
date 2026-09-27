'use strict';

const express = require('express');
const cors = require('cors');

const configRoutes = require('./routes/config');
const setpointRoutes = require('./routes/setpoints');
const statusRoutes = require('./routes/status');
const reportRoutes = require('./routes/reports');
const waveformRoutes = require('./routes/waveform');
const settingsRoutes = require('./routes/settings');
const brandingRoutes = require('./routes/branding');
const createReplicaRouter = require('./routes/replica');
const influxRaw = require('./services/influxRaw');
const manualService = require('./services/manual');
const alertService = require('./services/alerts');
const dailyReportService = require('./services/dailyReport');
const configService = require('./services/config');
const { requireAuth, requireAdmin, login, logout, me } = require('./middleware/auth');
const { isReplicaMode, replicaWriteGuard } = require('./middleware/replicaMode');

const app = express();
const PORT = process.env.PORT || 3200;
const REPLICA_MODE = isReplicaMode();

// CORS restringido al origen configurado (o abierto en dev)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));

// Branding: GET público (login), PUT/DELETE admin con su propio parser de 2 MB
// → va antes del express.json global de 1 MB.
app.use('/api/branding', brandingRoutes);

app.use(express.json({ limit: '1mb' }));

// Auth endpoints (publicos)
app.post('/api/login', login);
app.post('/api/logout', logout);

// API de réplica para el servidor de oficina: token propio (REPLICA_TOKEN),
// por eso va ANTES de requireAuth. Sin REPLICA_TOKEN responde 404.
app.use('/api/replica', createReplicaRouter({
  token: process.env.REPLICA_TOKEN || '',
  queryCsv: influxRaw.queryAnnotatedCsv,
  bucket: influxRaw.bucket,
  getConfig: configService.get,
  getManual: manualService.readAll,
}));

// Middleware de auth (aplica a todo /api/* excepto login/logout/health)
app.use(requireAuth);

// Identidad del token actual (para restaurar el rol tras recargar)
app.get('/api/me', me);

// Servidor réplica: rechaza escrituras de lo que se sincroniza desde planta
app.use(replicaWriteGuard(REPLICA_MODE));

// Guard de escritura: solo admin puede modificar configuración/setpoints.
// El operador tiene acceso de lectura a todo lo demás.
app.use((req, res, next) => {
  const isWrite = ['PUT', 'POST', 'DELETE', 'PATCH'].includes(req.method);
  const isAdminArea = req.path.startsWith('/api/config') || req.path.startsWith('/api/setpoints');
  if (isWrite && isAdminArea) return requireAdmin(req, res, next);
  next();
});

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'WEG SCADA API',
    version: '2.0.0',
    endpoints: ['/health', '/api/config', '/api/setpoints', '/api/status', '/api/reports', '/api/waveform', '/api/live']
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// API routes
app.use('/api/config', configRoutes);
app.use('/api/setpoints', setpointRoutes);
app.use('/api/status', statusRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/waveform', waveformRoutes);
app.use('/api/settings', settingsRoutes);

// SSE endpoint for live status updates
app.get('/api/live', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const interval = setInterval(() => {
    if (res.writableEnded) { clearInterval(interval); return; }
    try {
      const status = configService.getLiveStatus();
      res.write(`data: ${JSON.stringify(status)}\n\n`);
    } catch (e) {
      clearInterval(interval);
      res.end();
    }
  }, 3000);

  req.on('close', () => clearInterval(interval));
  res.on('error', () => clearInterval(interval));
});

// Error middleware global (issue #13) — captura excepciones y evita fugar stack traces
app.use((err, req, res, next) => {
  console.error(`[API] Error en ${req.method} ${req.path}:`, err.message);
  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[API] WEG SCADA API listening on :${PORT}`);

  // Start alert monitoring (en la réplica no: las alertas salen de planta)
  if (REPLICA_MODE) console.log('[API] Modo réplica: alertas desactivadas');
  else alertService.start();

  // Reporte diario automático (cron interno -> PDF a disco + email)
  dailyReportService.start();

  // Watch config for changes
  configService.watchConfig();
});
