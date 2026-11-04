'use strict';

const router = require('express').Router();
const reportService = require('../services/reports');
const dailyReport = require('../services/dailyReport');
const manual = require('../services/manual');
const informes = require('../services/informes');
const branding = require('../services/branding');
const { isAdminRole, requireAdmin } = require('../middleware/auth');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/reports/manual?date=YYYY-MM-DD — datos cargados a mano (lluvia/río)
router.get('/manual', (req, res) => {
  const date = DATE_RE.test(req.query.date || '') ? req.query.date : manual.localDateStr();
  res.json(manual.getWithStatus(date));
});

// PUT /api/reports/manual { date, rainMm, riverM } — editable hasta el cierre
// del día (reporte automático del día siguiente); después, solo admin.
router.put('/manual', (req, res) => {
  try {
    const date = (req.body && req.body.date) || '';
    if (!DATE_RE.test(date)) return res.status(400).json({ error: 'Fecha inválida (YYYY-MM-DD)' });
    const st = manual.getWithStatus(date);
    if (st.future) return res.status(400).json({ error: 'No se puede cargar un día futuro' });
    const isAdmin = req.auth && isAdminRole(req.auth.role);
    if (st.locked && !isAdmin) {
      return res.status(409).json({ error: `El día ${date} ya cerró. Solo un administrador puede modificarlo.` });
    }
    manual.set(date, req.body, req.auth && req.auth.user);
    res.json(manual.getWithStatus(date));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// POST /api/reports/generate — generate report data
router.post('/generate', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    res.json({ count: rows.length, data: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/buckets — buckets disponibles (vivo + archivos)
router.get('/buckets', async (req, res) => {
  try {
    res.json({ buckets: await reportService.listBuckets() });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/series — series JSON (drives + medidores) para gráficos
router.post('/series', async (req, res) => {
  try {
    const data = await reportService.generateSeries(req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/daily?date=YYYY-MM-DD&bucket= — resumen del día (JSON)
router.get('/daily', async (req, res) => {
  try {
    const date = DATE_RE.test(req.query.date) ? req.query.date : undefined;
    res.json(await reportService.generateDailySummary(date, req.query.bucket));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/daily/pdf — PDF del resumen del día
router.post('/daily/pdf', async (req, res) => {
  try {
    const summary = await reportService.generateDailySummary(req.body.date, req.body.bucket);
    const pdf = await reportService.toSummaryPDF(summary, {
      title: 'Reporte Diario — Planta de Bombeo',
      subtitle: `Resumen del día ${summary.date}  ·  Energía, horas de operación y estadísticas`,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=reporte-diario_${summary.date}.pdf`);
    res.send(pdf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/daily/email — envía el reporte del día por correo
router.post('/daily/email', async (req, res) => {
  try {
    const to = typeof req.body.to === 'string' && req.body.to.trim() ? req.body.to.trim() : undefined;
    const r = await dailyReport.buildAndSend(req.body.date, { to });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/summary — resumen agregado de un rango (JSON)
router.post('/summary', async (req, res) => {
  try {
    res.json(await reportService.generateSummary(req.body));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/xlsx — reporte general en Excel (detalle + resumen)
router.post('/xlsx', async (req, res) => {
  try {
    const rows = await reportService.generateReport(req.body);
    let summary = null;
    if (req.body.summary) {
      summary = await reportService.generateSummary({
        from: req.body.from, to: req.body.to, bucket: req.body.bucket,
      });
    }
    const xlsx = reportService.reportToXLSX(rows, summary);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=weg-reporte.xlsx');
    res.send(xlsx);
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

// ─── Informes por bloques ───────────────────────────────────────────
// GET /api/reports/informes — plantillas y bloques disponibles
// Línea de tiempo de estados de un equipo (detalle de motor / regulador / reconectador)
router.get('/estados', async (req, res) => {
  try {
    res.json(await require('../services/estados').estados({ name: String(req.query.name || ''), from: req.query.from, to: req.query.to }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.status ? e.message : 'No se pudo armar la línea de estados' });
    if (!e.status) console.error('[REPORTS] estados:', e.message);
  }
});

// Tarjetas de motores del Dashboard: estado actual «desde» y corriente de la última hora
router.get('/tarjetas', async (req, res) => {
  try {
    res.json(await require('../services/tarjetas').tarjetas());
  } catch (e) {
    res.status(500).json({ error: 'No se pudo armar el resumen de tarjetas' });
    console.error('[REPORTS] tarjetas:', e.message);
  }
});

router.get('/informes', (req, res) => {
  res.json({ plantillas: informes.listarPlantillas(), bloques: informes.BLOQUES, periodos: informes.PERIODOS });
});

// Errores de validación (período, plantilla) → 400; el resto → 500
const errInforme = (res, e) => res.status(/inválid|inexistente|superar|SMTP no configurado/.test(e.message) ? 400 : 500).json({ error: e.message });

// Plantillas propias (solo administradores). Se guardan en este servidor (informes.json).
router.post('/informes/plantillas', requireAdmin, (req, res) => {
  try { res.status(201).json(informes.guardarPlantilla({ ...req.body, id: undefined }, req.auth && req.auth.user)); } catch (e) { errInforme(res, e); }
});
router.put('/informes/plantillas/:id', requireAdmin, (req, res) => {
  try { res.json(informes.guardarPlantilla({ ...req.body, id: req.params.id }, req.auth && req.auth.user)); } catch (e) { errInforme(res, e); }
});
router.delete('/informes/plantillas/:id', requireAdmin, (req, res) => {
  try { informes.borrarPlantilla(req.params.id); res.json({ ok: true }); } catch (e) { errInforme(res, e); }
});

// Suscripciones (envío programado por correo), solo administradores: tienen direcciones de correo
router.get('/informes/suscripciones', requireAdmin, (req, res) => {
  res.json({ suscripciones: informes.listarSuscripciones() });
});
router.post('/informes/suscripciones', requireAdmin, (req, res) => {
  try { res.status(201).json(informes.guardarSuscripcion({ ...req.body, id: undefined }, req.auth && req.auth.user)); } catch (e) { errInforme(res, e); }
});
router.put('/informes/suscripciones/:id', requireAdmin, (req, res) => {
  try { res.json(informes.guardarSuscripcion({ ...req.body, id: req.params.id }, req.auth && req.auth.user)); } catch (e) { errInforme(res, e); }
});
router.delete('/informes/suscripciones/:id', requireAdmin, (req, res) => {
  try { informes.borrarSuscripcion(req.params.id); res.json({ ok: true }); } catch (e) { errInforme(res, e); }
});
// Envío inmediato del período actual (prueba o reenvío); no cambia la programación
router.post('/informes/suscripciones/:id/enviar', requireAdmin, async (req, res) => {
  const sus = informes.listarSuscripciones().find((x) => x.id === req.params.id);
  if (!sus) return res.status(404).json({ error: 'Suscripción inexistente' });
  try {
    const r = await informes.enviarSuscripcion(sus, { manual: true });
    informes.marcarEnvio(sus.id, { ultimoEnvio: new Date().toISOString(), ultimoError: null });
    res.json(r);
  } catch (e) {
    informes.marcarEnvio(sus.id, { ultimoError: `${new Date().toISOString()} ${e.message}` });
    errInforme(res, e);
  }
});

// POST /api/reports/informe — { plantilla | bloques, from, to } → JSON con los bloques
router.post('/informe', async (req, res) => {
  try { res.json(await informes.generarInforme(req.body)); } catch (e) { errInforme(res, e); }
});

// POST /api/reports/informe/pdf y /xlsx — mismo cuerpo, archivo descargable
router.post('/informe/:fmt(pdf|xlsx)', async (req, res) => {
  try {
    const inf = await informes.generarInforme(req.body);
    const base = `informe-${inf.plantilla}_${inf.desde.slice(0, 10)}_${inf.hasta.slice(0, 10)}`;
    if (req.params.fmt === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${base}.pdf`);
      res.send(await informes.aPDF(inf, branding));
    } else {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=${base}.xlsx`);
      res.send(informes.aXLSX(inf));
    }
  } catch (e) { errInforme(res, e); }
});

module.exports = router;
