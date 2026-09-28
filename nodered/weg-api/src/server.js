'use strict';

const path = require('path');
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
const createReplicasRouter = require('./routes/replicas');
const { createRegistry } = require('./services/replicas');
const createReplicaLinkRouter = require('./routes/replicaLink');
const { createLinkStore } = require('./services/replicaLink');
const createSystemRouter = require('./routes/system');
const { createAgentClient } = require('./services/agentClient');
const { createMqttProxy } = require('./services/mqttProxy');
const { createMqttValidator } = require('./services/mqttAuth');
const influxRaw = require('./services/influxRaw');
const manualService = require('./services/manual');
const alertService = require('./services/alerts');
const dailyReportService = require('./services/dailyReport');
const configService = require('./services/config');
const { requireAuth, login, logout, me, isSessionToken, onTokenRevoked } = require('./middleware/auth');
const { isReplicaMode, replicaWriteGuard } = require('./middleware/replicaMode');
const { adminWriteGuard } = require('./middleware/adminWriteGuard');

const app = express();
const PORT = process.env.PORT || 3200;
const REPLICA_MODE = isReplicaMode();
const CONFIG_DIR = path.dirname(process.env.CONFIG_PATH || '/app/config/config.json');
// El proxy de /mqtt se crea más abajo; el registro lo avisa al revocar
let mqttProxy = null;
const replicaRegistry = createRegistry({
  file: path.join(CONFIG_DIR, 'replicas.json'),
  onRevoke: (id) => { if (mqttProxy) mqttProxy.closeIdentity(`replica:${id}`); },
});

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

// API de réplica para el servidor de oficina: token propio (REPLICA_TOKEN o el
// de una réplica registrada), por eso va ANTES de requireAuth. Sin ninguno → 404.
app.use('/api/replica', createReplicaRouter({
  token: process.env.REPLICA_TOKEN || '',
  registry: replicaRegistry,
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

// Guard de escritura: solo admin puede modificar configuración/setpoints
// (normaliza mayúsculas y barra final, igual que el enrutado de Express).
app.use(adminWriteGuard);

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
app.use('/api/replicas', createReplicasRouter({
  registry: replicaRegistry, isReplica: REPLICA_MODE, legacyToken: process.env.REPLICA_TOKEN || '',
}));
app.use('/api/replica-link', createReplicaLinkRouter({
  store: createLinkStore({ file: path.join(CONFIG_DIR, 'replica.json') }),
  isReplica: REPLICA_MODE,
  envSource: process.env.REPLICA_SOURCE || '',
  healthUrl: process.env.REPLICA_HEALTH_URL || 'http://weg-replica:3300/health',
}));
app.use('/api/system', createSystemRouter({
  agent: createAgentClient({ baseUrl: process.env.AGENT_URL || 'http://weg-agent:3400', token: process.env.AGENT_TOKEN || '' }),
  isReplica: REPLICA_MODE,
}));

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
// Websocket /mqtt (en vivo): exige sesión o token de réplica y se corta en el
// acto al cerrar/vencer la sesión o revocar la réplica.
mqttProxy = createMqttProxy({
  upstream: { host: process.env.MQTT_WS_HOST || 'mosquitto', port: parseInt(process.env.MQTT_WS_PORT || '9001', 10) },
  validate: createMqttValidator({ isSessionToken, registry: replicaRegistry, legacyToken: process.env.REPLICA_TOKEN || '' }),
});
onTokenRevoked((token) => mqttProxy.closeIdentity(`session:${token}`));

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[API] WEG SCADA API listening on :${PORT}`);

  // Start alert monitoring (en la réplica no: las alertas salen de planta)
  if (REPLICA_MODE) console.log('[API] Modo réplica: alertas desactivadas');
  else alertService.start();

  // Reporte diario automático (cron interno -> PDF a disco + email)
  dailyReportService.start();

  // Watch config for changes
  configService.watchConfig();
});
server.on('upgrade', mqttProxy.handleUpgrade);
