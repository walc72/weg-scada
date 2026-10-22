'use strict';

const fs = require('fs');
const path = require('path');

// Escribe (atómico) solo si cambió: evita disparar el watcher de weg-api
// cada 5 minutos sin motivo.
function writeIfChanged(file, next) {
  let prev = null;
  try { prev = fs.readFileSync(file, 'utf8'); } catch { /* no existe todavía */ }
  if (prev === next) return false;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, next, { encoding: 'utf8' });
  fs.renameSync(tmp, file);
  return true;
}

const writeJsonIfChanged = (file, obj) => writeIfChanged(file, JSON.stringify(obj, null, 2));

// La config de planta pisa la local, salvo el bloque influxdb (url/org/bucket
// son de cada instalación).
function mergeConfig(remote, localFile) {
  let local = null;
  try { local = JSON.parse(fs.readFileSync(localFile, 'utf8')); } catch { /* sin config local */ }
  const out = { ...remote };
  if (local && local.influxdb) out.influxdb = local.influxdb;
  return out;
}

function createFileSync({ source, configPath, manualPath, licensePath = path.join(path.dirname(configPath), 'license.key'), log = console }) {
  return async function syncFiles() {
    // La licencia se pide primero. 403 = la planta no incluye réplica: se borra
    // el license.key local (es derivado de planta) y no se toca nada más.
    // Otro error o cuerpo vacío: se conserva el license.key y se sigue con
    // config y manual.
    let lic = null;
    try { lic = await source.license(); } catch (e) {
      if (e.status === 403) {
        log.log('[FILES] La licencia de planta no incluye réplica');
        try { fs.unlinkSync(licensePath); } catch { /* no existía */ }
        return { config: false, manual: false, license: false };
      }
      log.error(`[FILES] No se pudo bajar la licencia: ${e.message}`);
    }
    lic = lic ? lic.trim() : '';
    const license = lic ? writeIfChanged(licensePath, lic) : false;
    const config = writeJsonIfChanged(configPath, mergeConfig(await source.config(), configPath));
    const manual = writeJsonIfChanged(manualPath, await source.manual());
    if (config) log.log('[FILES] config.json actualizado desde planta');
    if (manual) log.log('[FILES] manual.json actualizado desde planta');
    if (license) log.log('[FILES] license.key actualizado desde planta');
    return { config, manual, license };
  };
}

module.exports = { writeJsonIfChanged, mergeConfig, createFileSync };
