'use strict';

const fs = require('fs');

// Cursor del histórico persistido en /data. Va ligado a la planta de origen:
// si la réplica se enlaza a otra planta, arranca de cero. Un cursor viejo sin
// `source` (versión anterior) se acepta.
function createCursorStore(file, source) {
  return {
    load() {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (typeof j.since !== 'string') return null;
        if (j.source && source && j.source !== source) return null;
        return j.since;
      } catch { return null; }
    },
    save(since) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ since, source, savedAt: new Date().toISOString() }));
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { createCursorStore };
