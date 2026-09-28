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
const MAX_LOGO_BYTES = 1024 * 1024;
const DEFAULTS = {
  name: 'Planta de Bombeo',
  subtitle: 'Supervisión en tiempo real de bombas (CFW900 / SSW900) y medición eléctrica.',
};

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

function get() {
  const s = read();
  const p = logoPath();
  let v = 0;
  try { v = Math.floor(fs.statSync(p).mtimeMs); } catch { /* sin archivo */ }
  return {
    name: s.name || DEFAULTS.name,
    subtitle: typeof s.subtitle === 'string' ? s.subtitle : DEFAULTS.subtitle,
    logoUrl: `/api/branding/logo?v=${v}`,
    customLogo: p !== DEFAULT_LOGO,
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
  write(s);
  return get();
}

function reset() {
  removeFile(read().logoFile);
  try { fs.unlinkSync(BRANDING_PATH); } catch { /* ya no existe */ }
  return get();
}

module.exports = { get, set, reset, logoPath, detectImage, DEFAULTS, DEFAULT_LOGO };
