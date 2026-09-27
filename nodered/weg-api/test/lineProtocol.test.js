'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { splitCsvLine, rfc3339ToNs, parseAnnotatedCsv, toLineProtocol, csvColumn } = require('../src/services/lineProtocol');

// Arma un bloque de CSV anotado (una "tabla" de Influx) con la forma real de /api/v2/query
function table(valueType, tagCols, rows) {
  const cols = ['', 'result', 'table', '_start', '_stop', '_time', '_value', '_field', '_measurement', ...tagCols];
  const types = ['#datatype', 'string', 'long', 'dateTime:RFC3339', 'dateTime:RFC3339', 'dateTime:RFC3339', valueType, 'string', 'string', ...tagCols.map(() => 'string')];
  const lines = [types.join(','), cols.join(',')];
  for (const r of rows) {
    lines.push(['', '_result', '0', '2026-09-27T00:00:00Z', '2026-09-27T01:00:00Z', r.time, r.value, r.field, r.m, ...tagCols.map(t => r.tags[t])].join(','));
  }
  return lines.join('\r\n');
}

const T1 = '2026-09-27T00:00:10Z';
const T2 = '2026-09-27T00:00:20.5Z';
const ns = (iso, frac = 0n) => String(BigInt(Date.parse(iso)) * 1000000n + frac);
const DRIVE_TAGS = ['index', 'ip', 'name', 'site', 'type'];
const saer8 = { index: '1', ip: '192.168.10.40', name: 'SAER 8', site: 'Agriplus', type: 'SSW900' };

test('splitCsvLine handles quoted commas and escaped quotes', () => {
  assert.deepEqual(splitCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
  assert.deepEqual(splitCsvLine('"x ""y"" z",'), ['x "y" z', '']);
});

test('rfc3339ToNs keeps sub-second precision', () => {
  assert.equal(rfc3339ToNs('2026-09-27T00:00:10Z'), ns('2026-09-27T00:00:10Z'));
  assert.equal(rfc3339ToNs('2026-09-27T00:00:20.5Z'), ns('2026-09-27T00:00:20Z', 500000000n));
  assert.equal(rfc3339ToNs('2026-09-27T00:00:20.123456789Z'), ns('2026-09-27T00:00:20Z', 123456789n));
  assert.throws(() => rfc3339ToNs('ayer'));
});

test('merges fields of the same point, keeps types, sorts by time', () => {
  const csv = [
    table('double', DRIVE_TAGS, [
      { time: T2, value: '13.25', field: 'current', m: 'drive_data', tags: saer8 },
      { time: T1, value: '12.5', field: 'current', m: 'drive_data', tags: saer8 },
    ]),
    '',
    table('long', DRIVE_TAGS, [{ time: T1, value: '1780', field: 'motor_speed', m: 'drive_data', tags: saer8 }]),
    '',
    table('boolean', DRIVE_TAGS, [{ time: T1, value: 'true', field: 'running', m: 'drive_data', tags: saer8 }]),
  ].join('\r\n');
  const lp = toLineProtocol(parseAnnotatedCsv(csv));
  assert.equal(lp, [
    `drive_data,index=1,ip=192.168.10.40,name=SAER\\ 8,site=Agriplus,type=SSW900 current=12.5,motor_speed=1780i,running=true ${ns(T1)}`,
    `drive_data,index=1,ip=192.168.10.40,name=SAER\\ 8,site=Agriplus,type=SSW900 current=13.25 ${ns('2026-09-27T00:00:20Z', 500000000n)}`,
  ].join('\n'));
});

test('keeps per-table field types (voltage long in drives, double in meters)', () => {
  const csv = [
    table('long', DRIVE_TAGS, [{ time: T1, value: '380', field: 'voltage', m: 'drive_data', tags: saer8 }]),
    '',
    table('double', ['ip', 'name', 'type'], [{ time: T1, value: '13200.75', field: 'voltage', m: 'meter_data', tags: { ip: '192.168.10.20', name: 'PM8000 #3', type: 'PM8000' } }]),
  ].join('\n');
  const lines = toLineProtocol(parseAnnotatedCsv(csv)).split('\n');
  assert.ok(lines.some(l => l.startsWith('drive_data,') && l.includes(' voltage=380i ')));
  assert.ok(lines.some(l => l.startsWith('meter_data,') && l.includes(' voltage=13200.75 ')));
});

test('escapes tag values with spaces, commas and equals', () => {
  const tags = { ip: '192.168.3.208', name: '"BRO7, BANCO=1"', type: 'PM8000' };
  const csv = table('double', ['ip', 'name', 'type'], [{ time: T1, value: '1', field: 'pf', m: 'meter_data', tags }]);
  assert.equal(toLineProtocol(parseAnnotatedCsv(csv)), `meter_data,ip=192.168.3.208,name=BRO7\\,\\ BANCO\\=1,type=PM8000 pf=1 ${ns(T1)}`);
});

test('string fields are quoted and escaped; non-finite doubles are dropped', () => {
  const csv = [
    table('string', ['name'], [{ time: T1, value: '"fallo ""F48"""', field: 'fault_text', m: 'drive_data', tags: { name: 'x' } }]),
    '',
    table('double', ['name'], [{ time: T1, value: 'NaN', field: 'torque', m: 'drive_data', tags: { name: 'x' } }]),
  ].join('\n');
  assert.equal(toLineProtocol(parseAnnotatedCsv(csv)), `drive_data,name=x fault_text="fallo \\"F48\\"" ${ns(T1)}`);
});

test('empty result gives empty string', () => {
  assert.equal(toLineProtocol(parseAnnotatedCsv('')), '');
  assert.equal(toLineProtocol(parseAnnotatedCsv('\r\n')), '');
});

test('influx error table throws', () => {
  const csv = '#datatype,string,string\n,error,reference\n,bucket not found,';
  assert.throws(() => parseAnnotatedCsv(csv), /bucket not found/);
});

test('csvColumn reads a column across tables', () => {
  const csv = '#datatype,string,long,dateTime:RFC3339\n,result,table,_time\n,_result,0,2026-09-08T10:00:00Z\n';
  assert.deepEqual(csvColumn(csv, '_time'), ['2026-09-08T10:00:00Z']);
  assert.deepEqual(csvColumn('', '_time'), []);
});
