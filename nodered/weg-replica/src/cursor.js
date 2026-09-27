'use strict';

const fs = require('fs');

// Cursor del histórico persistido en el volumen /data (sobrevive reinicios)
function createCursorStore(file) {
  return {
    load() {
      try {
        const j = JSON.parse(fs.readFileSync(file, 'utf8'));
        return typeof j.since === 'string' ? j.since : null;
      } catch { return null; }
    },
    save(since) {
      const tmp = file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ since, savedAt: new Date().toISOString() }));
      fs.renameSync(tmp, file);
    },
  };
}

module.exports = { createCursorStore };
