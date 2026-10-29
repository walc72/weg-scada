'use strict';

// Nombre de medición/señal → sufijo de campo Influx (x_<slug> / s_<slug>).
// Mantener idéntico en portal, poller y API (hay test de igualdad).
function slug(nombre) {
  return String(nombre)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

module.exports = { slug };
