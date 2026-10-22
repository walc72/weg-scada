'use strict';

// Archivos de /config del módulo Backup (contratos en nodered/weg-backup/lib.sh).
// Todo se escribe atómico (tmp + rename en el mismo directorio).

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  config: { frecuencia: 'diaria', hora: '03:00', copias: 30 },
  historico: { frecuencia: 'semanal', hora: '03:30', copias: 12 },
};

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function writeAtomic(file, text, mode) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, { mode });
  fs.chmodSync(tmp, mode); // el umask puede recortar el modo de creación
  fs.renameSync(tmp, file);
}

function createBackupStore(configDir) {
  const f = (name) => path.join(configDir, name);
  const writeJson = (name, obj, mode) => writeAtomic(f(name), JSON.stringify(obj, null, 2) + '\n', mode);
  const readSecretos = () => readJson(f('backup-secretos.json'), {}) || {};

  return {
    readConfig: () => readJson(f('backup.json'), {}) || {},
    writeConfig: (obj) => writeJson('backup.json', obj, 0o644),
    // Solo cambia "modulo"; no crea config/historico (eso lo decide el admin al guardar).
    setModulo(on) {
      const cur = readJson(f('backup.json'), {}) || {};
      if (cur.modulo === !!on) return false;
      writeJson('backup.json', { ...cur, modulo: !!on }, 0o644);
      return true;
    },
    readEstado: () => readJson(f('backup-estado.json'), null),
    hasFrase: () => typeof readSecretos().frase === 'string' && readSecretos().frase.length > 0,
    // Conserva las demás claves (drive.client_id/client_secret de Task 4).
    setFrase: (frase) => writeJson('backup-secretos.json', { ...readSecretos(), frase }, 0o600),
    readPublicKey() {
      try { return fs.readFileSync(path.join(configDir, 'backup-ssh', 'id_ed25519.pub'), 'utf8').trim() || null; } catch { return null; }
    },
    writePedido: (obj) => writeJson('backup-pedido.json', obj, 0o644),
    writePrueba: (obj) => writeJson('backup-prueba.json', obj, 0o644),
    readPruebaResultado: () => readJson(f('backup-prueba-resultado.json'), null),
    // Agrega líneas a backup-ssh/known_hosts (dir 700, archivo 644) sin duplicar.
    addKnownHosts(lines) {
      const dir = path.join(configDir, 'backup-ssh');
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, 'known_hosts');
      let cur = '';
      try { cur = fs.readFileSync(file, 'utf8'); } catch { /* nuevo */ }
      const have = new Set(cur.split('\n'));
      const add = lines.filter((l) => !have.has(l));
      if (!add.length) return;
      writeAtomic(file, cur + (cur && !cur.endsWith('\n') ? '\n' : '') + add.join('\n') + '\n', 0o644);
    },
  };
}

module.exports = { createBackupStore, DEFAULTS };
