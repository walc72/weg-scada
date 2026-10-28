'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const configService = require('../src/services/config');

test('getLiveStatus sin reco/reg', () => {
  try {
    configService.deviceStates.set('V1', { name: 'V1', online: true, type: 'CFW900' });
    configService.deviceStates.set('R1', { name: 'R1', kind: 'reco', online: true });
    const s = configService.getLiveStatus();
    assert.equal(s.total, 1);
    assert.equal(s.devices[0].name, 'V1');
  } finally { configService.deviceStates.delete('V1'); configService.deviceStates.delete('R1'); }
});
