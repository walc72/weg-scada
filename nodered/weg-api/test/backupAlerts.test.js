'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { evaluateBackup, createBackupAlerts, fmt } = require('../src/services/backupAlerts');

const NOW = new Date(2026, 9, 22, 12, 0).getTime();
const iso = (daysAgo) => new Date(NOW - daysAgo * 86400000).toISOString();
const cfg = { modulo: true, config: { frecuencia: 'diaria', hora: '03:00' }, historico: { frecuencia: 'semanal', hora: '03:30' } };
const okRun = (parte, d) => ({ parte, inicio: iso(d), ok: true, destinos: { local: 'ok' } });
const sano = () => ({ ultima: { config: okRun('config', 0.5), historico: okRun('historico', 3) }, historial: [okRun('config', 0.5), okRun('historico', 3)] });

test('todo bien: sin mails', () => {
  assert.deepStrictEqual(evaluateBackup(sano(), cfg, NOW, {}).mails, []);
});

test('destino en error: un mail con asunto y texto del error', () => {
  const e = sano();
  e.ultima.config = { parte: 'config', inicio: iso(0.5), ok: false, destinos: { local: 'ok', drive: 'error token vencido' } };
  const r = evaluateBackup(e, cfg, NOW, {}, 'acme-1234abcd');
  assert.strictEqual(r.mails.length, 1);
  assert.strictEqual(r.mails[0].asunto, 'Backup de configuración con errores en acme-1234abcd');
  assert.match(r.mails[0].cuerpo, /drive: error token vencido/);
  assert.match(r.mails[0].cuerpo, /local: ok/);
  assert.ok('error:config:drive' in r.sent);
});

test('repetido no reenvía; resuelto y vuelve a fallar sí', () => {
  const mal = sano();
  mal.ultima.historico = { parte: 'historico', inicio: iso(1), ok: false, destinos: { sftp: 'error x' } };
  const r1 = evaluateBackup(mal, cfg, NOW, {});
  assert.strictEqual(r1.mails[0].asunto, 'Backup de histórico con errores');
  const r2 = evaluateBackup(mal, cfg, NOW + 1000, r1.sent);
  assert.strictEqual(r2.mails.length, 0);
  assert.ok('error:historico:sftp' in r2.sent);
  const r3 = evaluateBackup(sano(), cfg, NOW, r2.sent);
  assert.deepStrictEqual(r3.sent, {});
  assert.strictEqual(evaluateBackup(mal, cfg, NOW, r3.sent).mails.length, 1);
});

test('lock ocupado no cuenta como error', () => {
  const e = sano();
  e.ultima.config = { parte: 'config', inicio: iso(0.1), ok: false, error: 'otro backup en curso', destinos: { local: 'omitido' } };
  assert.strictEqual(evaluateBackup(e, cfg, NOW, {}).mails.length, 0);
});

test('sin backup: umbrales 2/14/62 días, fecha local DD/MM/AAAA HH:MM', () => {
  const e = { ultima: { config: okRun('config', 2.5), historico: okRun('historico', 13) }, historial: [] };
  const r = evaluateBackup(e, cfg, NOW, {});
  assert.deepStrictEqual(r.mails.map((m) => m.asunto), [`Sin backup de configuración desde ${fmt(new Date(NOW - 2.5 * 86400000))}`]);
  assert.match(r.mails[0].asunto, /desde \d\d\/\d\d\/2026 \d\d:\d\d$/);
  const m = { modulo: true, config: { frecuencia: 'mensual' } };
  assert.strictEqual(evaluateBackup({ ultima: { config: okRun('config', 61) } }, m, NOW, {}).mails.length, 0);
  assert.strictEqual(evaluateBackup({ ultima: { config: okRun('config', 63) } }, m, NOW, {}).mails.length, 1);
  assert.strictEqual(evaluateBackup(e, cfg, NOW, r.sent).mails.length, 0);
});

test('sin backup exitoso nunca, o último ok en historial', () => {
  const r = evaluateBackup({ ultima: { config: null, historico: null }, historial: [] }, { modulo: true, config: { frecuencia: 'diaria' } }, NOW, {});
  assert.strictEqual(r.mails[0].asunto, 'Sin backup de configuración desde nunca');
  const e = { ultima: { config: { parte: 'config', inicio: iso(0.1), ok: false, destinos: { local: 'omitido' } } }, historial: [okRun('config', 1)] };
  assert.strictEqual(evaluateBackup(e, { modulo: true, config: { frecuencia: 'diaria' } }, NOW, {}).mails.length, 0);
});

test('sin módulo, desactivada o sin horario: nada', () => {
  const e = { ultima: {}, historial: [] };
  assert.strictEqual(evaluateBackup(e, { ...cfg, modulo: false }, NOW, {}).mails.length, 0);
  assert.strictEqual(evaluateBackup(e, { modulo: true, config: { frecuencia: 'desactivada' } }, NOW, {}).mails.length, 0);
  assert.strictEqual(evaluateBackup(e, { modulo: true }, NOW, {}).mails.length, 0);
});

test('wiring: envía por el transporte, persiste avisos y no reenvía', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkal-'));
  fs.writeFileSync(path.join(dir, 'backup.json'), JSON.stringify({ modulo: true, config: { frecuencia: 'diaria' } }));
  fs.writeFileSync(path.join(dir, 'backup-estado.json'), JSON.stringify({
    ultima: { config: { parte: 'config', inicio: iso(0.1), ok: false, destinos: { drive: 'error boom' } } }, historial: [okRun('config', 0.1)],
  }));
  const out = [];
  const mk = () => createBackupAlerts({ configDir: dir, now: () => NOW, getTo: () => 'a@b.c', getFrom: () => 'x', getTransport: () => ({ sendMail: async (m) => { out.push(m); } }) });
  await mk().check();
  assert.strictEqual(out.length, 1);
  assert.match(out[0].subject, /^Backup de configuración con errores en /);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'backup-avisos.json'), 'utf8'))['error:config:drive']);
  await mk().check(); // "reinicio"
  assert.strictEqual(out.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
