'use strict';

const { hasModule } = require('../services/license');

// 403 si la licencia vigente no incluye el módulo
function requireModule(getLicense, name) {
  return (req, res, next) => {
    if (hasModule(getLicense(), name)) return next();
    res.status(403).json({ error: `La licencia no incluye el módulo ${name}` });
  };
}

module.exports = requireModule;
