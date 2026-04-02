'use strict';

const router = require('express').Router();
const reportService = require('../services/reports');

// POST /api/reports/generate — generate report data
router.post('/generate', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    res.json({ count: rows.length, data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/csv — download CSV
router.post('/csv', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    const csv = reportService.toCSV(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=weg-report.csv');
    res.send(csv);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/pdf — download PDF
router.post('/pdf', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    const pdf = await reportService.toPDF(rows, req.body.title || 'Reporte WEG SCADA');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=weg-report.pdf');
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
