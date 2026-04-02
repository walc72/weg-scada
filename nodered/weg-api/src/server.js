'use strict';

const express = require('express');
const cors = require('cors');
const path = require('path');

const configRoutes = require('./routes/config');
const setpointRoutes = require('./routes/setpoints');
const statusRoutes = require('./routes/status');
const reportRoutes = require('./routes/reports');
const alertService = require('./services/alerts');
const configService = require('./services/config');

const app = express();
const PORT = process.env.PORT || 3200;

// Middleware
app.use(cors());
app.use(express.json());

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
    const status = configService.getLiveStatus();
    res.write(`data: ${JSON.stringify(status)}\n\n`);
  }, 3000);

  req.on('close', () => clearInterval(interval));
});

// Start
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[API] WEG SCADA API listening on :${PORT}`);

  // Start alert monitoring
  alertService.start();

  // Watch config for changes
  configService.watchConfig();
});
