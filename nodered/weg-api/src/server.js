'use strict';

const express = require('express');
const cors = require('cors');

const configRoutes = require('./routes/config');
const setpointRoutes = require('./routes/setpoints');
const statusRoutes = require('./routes/status');
const reportRoutes = require('./routes/reports');
const alertService = require('./services/alerts');
const configService = require('./services/config');
const { requireAuth, login, logout } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3200;

// CORS restringido al origen configurado (o abierto en dev)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';
app.use(cors({ origin: ALLOWED_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Auth endpoints (publicos)
app.post('/api/login', login);
app.post('/api/logout', logout);

// Middleware de auth (aplica a todo /api/* excepto login/logout/health)
app.use(requireAuth);

// Root
app.get('/', (req, res) => {
  res.json({
    name: 'WEG SCADA API',
    version: '2.0.0',
    endpoints: ['/health', '/api/config', '/api/setpoints', '/api/status', '/api/reports', '/api/live']
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

  // Start alert monitoring
  alertService.start();

  // Watch config for changes
  configService.watchConfig();
});
