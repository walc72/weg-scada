'use strict';

const fs = require('fs');

// Escribe JSON (atómico) solo si cambió: evita disparar el watcher de weg-api
// cada 5 minutos sin motivo.
function writeJsonIfChanged(file, obj) {
  const next = JSON.stringify(obj, null, 2);
  let prev = null;
  try { prev = fs.readFileSync(file, 'utf8'); } catch { /* no existe todavía */ }
  if (prev === next) return false;
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, next, { encoding: 'utf8' });
  fs.renameSync(tmp, file);
  return true;
}

// La config de planta pisa la local, salvo el bloque influxdb (url/org/bucket
// son de cada instalación).
function mergeConfig(remote, localFile) {
  let local = null;
  try { local = JSON.parse(fs.readFileSync(localFile, 'utf8')); } catch { /* sin config local */ }
  const out = { ...remote };
  if (local && local.influxdb) out.influxdb = local.influxdb;
  return out;
}

function createFileSync({ source, configPath, manualPath, log = console }) {
  return async function syncFiles() {
    const config = writeJsonIfChanged(configPath, mergeConfig(await source.config(), configPath));
    const manual = writeJsonIfChanged(manualPath, await source.manual());
    if (config) log.log('[FILES] config.json actualizado desde planta');
    if (manual) log.log('[FILES] manual.json actualizado desde planta');
    return { config, manual };
  };
}

module.exports = { writeJsonIfChanged, mergeConfig, createFileSync };
