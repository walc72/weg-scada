'use strict';

const router = require('express').Router();
const { MODELOS } = require('../services/modelos');

// GET /api/modelos — mapas por defecto (solo lectura)
router.get('/', (req, res) => res.json(MODELOS));

module.exports = router;
