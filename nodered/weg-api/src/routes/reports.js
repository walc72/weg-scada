'use strict';

const router = require('express').Router();
const reportService = require('../services/reports');
const dailyReport = require('../services/dailyReport');
const tarifas = require('../services/tarifas');
const manual = require('../services/manual');
const informes = require('../services/informes');
const branding = require('../services/branding');
const { opcionesExport, tablasDetalle, aCSV, ventanasExport, MAX_VENTANAS } = require('../services/exportar');
const { zip } = require('../services/zip');
const { isAdminRole, requireAdmin } = require('../middleware/auth');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/;

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

// Caché de /series: varios gráficos y usuarios piden lo mismo casi a la vez. Une los
// pedidos iguales en curso y reusa la respuesta 10 s (las fechas se comparan a 5 s).
// ponytail: en memoria del proceso; si la API corre en varias réplicas, pasar a un caché compartido.
const SERIES_TTL_MS = 10000;
const seriesCache = new Map();
const aPaso = (v) => (typeof v === 'string' && ISO_RE.test(v) ? Math.floor(Date.parse(v) / 5000) : v);
function seriesCacheada(body) {
  const b = body && typeof body === 'object' ? body : {};
  const key = JSON.stringify([aPaso(b.from), aPaso(b.to), b.windowSec, b.bucket, b.tipos]);
  const ahora = Date.now();
  for (const [k, e] of seriesCache) if (e.vence < ahora) seriesCache.delete(k);
  let e = seriesCache.get(key);
  if (!e) {
    e = { vence: ahora + SERIES_TTL_MS, p: reportService.generateSeries(b) };
    e.p.catch(() => seriesCache.delete(key)); // un error no queda guardado
    seriesCache.set(key, e);
  }
  return e.p;
}

// POST /api/reports/series — series JSON para gráficos; body.tipos limita lo que se consulta
router.post('/series', async (req, res) => {
  try {
    const data = await seriesCacheada(req.body);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/reports/daily?date=YYYY-MM-DD&bucket= — resumen del día (JSON)
router.get('/daily', async (req, res) => {
  try {
    const date = DATE_RE.test(req.query.date) ? req.query.date : undefined;
    res.json(tarifas.aplicar(await reportService.generateDailySummary(date, req.query.bucket)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/daily/pdf — PDF del resumen del día
router.post('/daily/pdf', async (req, res) => {
  try {
    const summary = tarifas.aplicar(await reportService.generateDailySummary(req.body.date, req.body.bucket));
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
    res.json(tarifas.aplicar(await reportService.generateSummary(req.body)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Flujo común de exportación: opciones → series → tablas de detalle.
// Responde 404 y devuelve null si no hay nada que exportar.
async function tablasExport(req, res) {
  const opts = opcionesExport(req.body);
  if (ventanasExport(opts.from, opts.to, opts.resolucion) > MAX_VENTANAS) {
    res.status(400).json({ error: 'Rango demasiado largo para esa resolución; elegí una mayor' });
    return null;
  }
  const series = await reportService.generateSeries({ from: opts.from, to: opts.to, windowSec: opts.resolucion, bucket: opts.bucket, tipos: opts.tipos });
  const tablas = tablasDetalle(series, opts);
  if (!tablas.length) { res.status(404).json({ error: 'Sin datos en el rango seleccionado' }); return null; }
  return { opts, tablas };
}

// Fechas del nombre de archivo: solo YYYY-MM-DD válido, nunca texto del cliente
function fechasArchivo(opts) {
  // Fecha local (la TZ del contenedor es la de la planta); hoy si no es un ISO válido
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const f = (v) => { const d = new Date(typeof v === 'string' && ISO_RE.test(v) ? v : NaN); return ymd(isNaN(d) ? new Date() : d); };
  return `${f(opts.from)}_${f(opts.to)}`;
}

// POST /api/reports/xlsx — una hoja por tabla de detalle + resumen opcional
router.post('/xlsx', async (req, res) => {
  try {
    const r = await tablasExport(req, res);
    if (!r) return;
    let summary = null;
    if (req.body.summary) {
      summary = tarifas.aplicar(await reportService.generateSummary({
        from: req.body.from, to: req.body.to, bucket: req.body.bucket,
      }));
    }
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=weg-datos_${fechasArchivo(r.opts)}.xlsx`);
    res.send(reportService.reportToXLSX(r.tablas, summary));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/csv — un CSV, o un ZIP con un CSV por tabla
router.post('/csv', async (req, res) => {
  try {
    const r = await tablasExport(req, res);
    if (!r) return;
    const d = fechasArchivo(r.opts);
    const csv = (t) => aCSV(t.headers, t.rows);
    if (r.tablas.length === 1) {
      const t = r.tablas[0];
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=weg-${t.tipo}_${d}.csv`);
      return res.send(csv(t));
    }
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=weg-datos_${d}.zip`);
    res.send(zip(Object.fromEntries(r.tablas.map((t) => [`${t.tipo}_${d}.csv`, csv(t)]))));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/reports/pdf — download PDF
router.post('/pdf', async (req, res) => {
  try {
    const r = await tablasExport(req, res);
    if (!r) return;
    const pdf = await reportService.toPDF(r.tablas, req.body.title || 'Reporte WEG SCADA');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=weg-datos_${fechasArchivo(r.opts)}.pdf`);
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
// Express 5 no acepta regex en la ruta: el formato se valida acá
router.post('/informe/:fmt', async (req, res, next) => {
  if (req.params.fmt !== 'pdf' && req.params.fmt !== 'xlsx') return next();
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
module.exports.seriesCacheada = seriesCacheada;
