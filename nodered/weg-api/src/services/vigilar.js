'use strict';

// Vigila archivos por polling con fs.watchFile (sin dependencias): anda en
// volúmenes de Docker y con archivos que todavía no existen (aparecer, cambiar,
// reemplazarse por rename o borrarse avisan). Emite 'ready' como chokidar.

const fs = require('fs');
const { EventEmitter } = require('events');

function vigilar(files, { interval = 3000 } = {}, onCambio) {
  const ee = new EventEmitter();
  const subs = files.map((f) => {
    const l = (cur, prev) => {
      if (cur.mtimeMs !== prev.mtimeMs || cur.ino !== prev.ino || cur.size !== prev.size) onCambio(f);
    };
    fs.watchFile(f, { interval }, l);
    return [f, l];
  });
  setImmediate(() => ee.emit('ready'));
  ee.close = async () => { for (const [f, l] of subs) fs.unwatchFile(f, l); };
  return ee;
}

module.exports = { vigilar };
