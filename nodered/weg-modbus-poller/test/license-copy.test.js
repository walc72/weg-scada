'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('license.js del poller es idéntico al de weg-api', () => {
  const a = fs.readFileSync(path.join(__dirname, '../src/license.js'));
  const b = fs.readFileSync(path.join(__dirname, '../../weg-api/src/services/license.js'));
  assert.ok(a.equals(b), 'copiar nodered/weg-api/src/services/license.js al poller');
});
