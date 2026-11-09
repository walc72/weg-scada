'use strict';

const express = require('express');
const tarifas = require('../services/tarifas');
const { requireAdmin } = require('../middleware/auth');

function createTarifasRouter(file = tarifas.TARIFAS_PATH) {
  const router = express.Router();
  router.get('/', (req, res) => res.json(tarifas.leer(file)));
  router.put('/', requireAdmin, (req, res) => {
    try {
      res.json(tarifas.guardar(req.body, file));
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });
  return router;
}

module.exports = { createTarifasRouter };
