'use strict';

// Marca configurable por servidor: nombre, subtítulo y logo del login/encabezado,
// y logo de los reportes PDF. Local a cada instalación (NO se replica a la
// oficina). Se guarda en branding.json + branding-logo.(png|jpg), junto a
// config.json (volumen persistente).

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
const DIR = path.dirname(CONFIG_PATH);
const BRANDING_PATH = path.join(DIR, 'branding.json');
const DEFAULT_LOGO = path.join(__dirname, '..', 'agriplus.png');
const DEFAULT_FAVICON = path.join(__dirname, '..', 'favicon-default.png');
const MAX_LOGO_BYTES = 1024 * 1024;
const MAX_FAVICON_BYTES = 256 * 1024;
const DEFAULTS = {
  name: 'Planta de Bombeo',
  subtitle: 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.',
  footer: 'Tecno Electric S.A.',   // "Powered by …" del pie (vacío = sin pie)
  colorInforme: '#E87722',          // títulos, línea y cabeceras de tablas del PDF
};
// Color principal del portal: null = el del tema (azul). Los colores de estado de los equipos no se tocan.
const HEX = /^#[0-9a-f]{6}$/i;

function read() {
  try {
    const j = JSON.parse(fs.readFileSync(BRANDING_PATH, 'utf8'));
    return (j && typeof j === 'object' && !Array.isArray(j)) ? j : {};
  } catch { return {}; }
}
function write(obj) {
  const tmp = BRANDING_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2), { encoding: 'utf8' });
  fs.renameSync(tmp, BRANDING_PATH);
}
function removeFile(name) {
  if (!name) return;
  try { fs.unlinkSync(path.join(DIR, path.basename(name))); } catch { /* ya no existe */ }
}

// Tipo real por magic bytes (no confiar en extensión/MIME declarado).
// Solo PNG/JPG: pdfkit no soporta SVG ni GIF.
function detectImage(buf) {
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  return null;
}

function logoPath() {
  const s = read();
  if (s.logoFile) {
    const p = path.join(DIR, path.basename(s.logoFile));
    if (fs.existsSync(p)) return p;
  }
  return DEFAULT_LOGO;
}

function faviconPath() {
  const s = read();
  if (s.faviconFile) {
    const p = path.join(DIR, path.basename(s.faviconFile));
    if (fs.existsSync(p)) return p;
  }
  return DEFAULT_FAVICON;
}

function get() {
  const s = read();
  const p = logoPath();
  let v = 0;
  try { v = Math.floor(fs.statSync(p).mtimeMs); } catch { /* sin archivo */ }
  const fp = faviconPath();
  let fv = 0;
  try { fv = Math.floor(fs.statSync(fp).mtimeMs); } catch { /* sin archivo */ }
  return {
    name: s.name || DEFAULTS.name,
    subtitle: typeof s.subtitle === 'string' ? s.subtitle : DEFAULTS.subtitle,
    footer: typeof s.footer === 'string' ? s.footer : DEFAULTS.footer,
    logoUrl: `/api/branding/logo?v=${v}`,
    customLogo: p !== DEFAULT_LOGO,
    faviconUrl: `/api/branding/favicon?v=${fv}`,
    customFavicon: fp !== DEFAULT_FAVICON,
    colorPortal: HEX.test(s.colorPortal || '') ? s.colorPortal : null,
    colorInforme: HEX.test(s.colorInforme || '') ? s.colorInforme : DEFAULTS.colorInforme,
  };
}

function text(v, label, max) {
  if (v === undefined) return undefined;
  if (typeof v !== 'string') throw new Error(`${label} inválido`);
  const t = v.trim();
  if (t.length > max) throw new Error(`${label}: máximo ${max} caracteres`);
  return t;
}

function set(patch) {
  if (!patch || typeof patch !== 'object') throw new Error('payload inválido');
  const s = read();
  const name = text(patch.name, 'Nombre', 60);
  const subtitle = text(patch.subtitle, 'Subtítulo', 200);
  if (name !== undefined) {
    if (!name) throw new Error('El nombre no puede quedar vacío');
    s.name = name;
  }
  if (subtitle !== undefined) s.subtitle = subtitle;
  const footer = text(patch.footer, 'Pie de página', 80);
  if (footer !== undefined) s.footer = footer;
  // colores: '#rrggbb', o null/'' para volver al original
  for (const [k, label] of [['colorPortal', 'Color del portal'], ['colorInforme', 'Color del informe']]) {
    const v = patch[k];
    if (v === undefined) continue;
    if (v === null || v === '') { delete s[k]; continue; }
    if (typeof v !== 'string' || !HEX.test(v)) throw new Error(`${label} inválido (usá #rrggbb)`);
    s[k] = v.toLowerCase();
  }

  if (patch.logo !== undefined) {
    if (typeof patch.logo !== 'string') throw new Error('logo inválido');
    const buf = Buffer.from(patch.logo.replace(/^data:[^;,]*;base64,/, ''), 'base64');
    if (!buf.length) throw new Error('El logo está vacío');
    if (buf.length > MAX_LOGO_BYTES) throw new Error('El logo supera 1 MB');
    const kind = detectImage(buf);
    if (!kind) throw new Error('Formato no soportado (solo PNG o JPG)');
    const file = `branding-logo.${kind}`;
    const tmp = path.join(DIR, file + '.tmp');
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, path.join(DIR, file));
    if (s.logoFile && s.logoFile !== file) removeFile(s.logoFile);
    s.logoFile = file;
  }
  if (patch.favicon !== undefined) {
    if (typeof patch.favicon !== 'string') throw new Error('favicon inválido');
    const buf = Buffer.from(patch.favicon.replace(/^data:[^;,]*;base64,/, ''), 'base64');
    if (!buf.length) throw new Error('El favicon está vacío');
    if (buf.length > MAX_FAVICON_BYTES) throw new Error('El favicon supera 256 KB');
    const kind = detectImage(buf);
    if (!kind) throw new Error('Formato no soportado (solo PNG o JPG)');
    const file = `branding-favicon.${kind}`;
    const tmp = path.join(DIR, file + '.tmp');
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, path.join(DIR, file));
    if (s.faviconFile && s.faviconFile !== file) removeFile(s.faviconFile);
    s.faviconFile = file;
  }
  write(s);
  return get();
}

function reset() {
  const s = read();
  removeFile(s.logoFile);
  removeFile(s.faviconFile);
  try { fs.unlinkSync(BRANDING_PATH); } catch { /* ya no existe */ }
  return get();
}

// Para meter textos de la marca en el HTML de los correos
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

module.exports = { get, set, reset, logoPath, faviconPath, detectImage, esc, DEFAULTS, DEFAULT_LOGO };
