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

test('falla sin destino en error (espacio bajo, tar): mail "general" con ultima.error, sin repetir', () => {
  const e = sano();
  e.ultima.config = { parte: 'config', inicio: iso(0.1), ok: false, error: 'espacio libre bajo en /backups (1 GB)', destinos: { local: 'omitido' } };
  const r = evaluateBackup(e, cfg, NOW, {});
  assert.strictEqual(r.mails.length, 1);
  assert.deepStrictEqual(r.mails[0].keys, ['error:config:general']);
  assert.match(r.mails[0].cuerpo, /Error: espacio libre bajo en \/backups \(1 GB\)/);
  assert.match(r.mails[0].cuerpo, /local: omitido/);
  assert.strictEqual(evaluateBackup(e, cfg, NOW + 1000, r.sent).mails.length, 0);
  delete e.ultima.config.destinos;
  e.ultima.config.error = 'error tar';
  assert.match(evaluateBackup(e, cfg, NOW, {}).mails[0].cuerpo, /Error: error tar/);
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

test('sin backup exitoso nunca: plazo desde configuradoEn', () => {
  const vacio = { ultima: { config: null, historico: null }, historial: [] };
  const c = (d) => ({ modulo: true, config: { frecuencia: 'diaria', configuradoEn: iso(d) } });
  assert.strictEqual(evaluateBackup(vacio, c(0.1), NOW, {}).mails.length, 0, 'recién configurada');
  const r = evaluateBackup(vacio, c(3), NOW, {});
  assert.strictEqual(r.mails[0].asunto, 'Sin backup de configuración desde nunca');
  assert.strictEqual(evaluateBackup(vacio, { modulo: true, config: { frecuencia: 'diaria' } }, NOW, {}).mails.length, 0, 'entrada vieja sin intentos');
  const e = { ultima: { config: { parte: 'config', inicio: iso(0.1), ok: false, destinos: { local: 'omitido' } } }, historial: [okRun('config', 1)] };
  assert.deepStrictEqual(evaluateBackup(e, c(30), NOW, {}).mails.filter((m) => m.keys.includes('sin:config')), [], 'ok de hace 1 día: sin aviso "sin backup"');
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

function setup(estado) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bkal-'));
  fs.writeFileSync(path.join(dir, 'backup.json'), JSON.stringify({ modulo: true, config: { frecuencia: 'diaria' }, historico: { frecuencia: 'semanal' } }));
  fs.writeFileSync(path.join(dir, 'backup-estado.json'), JSON.stringify(estado));
  return dir;
}
const malos = () => ({
  ultima: { config: { parte: 'config', inicio: iso(0.1), ok: false, destinos: { drive: 'error boom' } }, historico: { parte: 'historico', inicio: iso(0.1), ok: false, destinos: { sftp: 'error x' } } },
  historial: [okRun('config', 0.1), okRun('historico', 0.1)],
});

test('wiring: SMTP falla -> sent no se guarda y se respeta el back-off', async () => {
  const dir = setup(malos());
  let t = NOW, calls = 0;
  const mk = (fail) => createBackupAlerts({ configDir: dir, now: () => t, getTo: () => 'a@b.c', getFrom: () => 'x', getTransport: () => ({ sendMail: async () => { calls++; if (fail) throw new Error('smtp caído'); } }) });
  const a = mk(true);
  await a.check();
  assert.strictEqual(calls, 1);
  assert.ok(!fs.existsSync(path.join(dir, 'backup-avisos.json')) || !Object.keys(JSON.parse(fs.readFileSync(path.join(dir, 'backup-avisos.json')))).length);
  await a.check();
  assert.strictEqual(calls, 1, 'dentro del back-off no reintenta');
  t += 11 * 60000;
  await a.check();
  assert.strictEqual(calls, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('wiring: falla del 2.o mail no repite el 1.o', async () => {
  const dir = setup(malos());
  const subj = [];
  const mk = (failOn) => createBackupAlerts({ configDir: dir, now: () => NOW, backoff: 0, getTo: () => 'a@b.c', getFrom: () => 'x', getTransport: () => ({ sendMail: async (m) => { if (m.subject.includes(failOn)) throw new Error('x'); subj.push(m.subject); } }) });
  await mk('histórico').check();
  assert.strictEqual(subj.length, 1);
  await mk('nadie').check();
  assert.strictEqual(subj.length, 2);
  assert.match(subj[1], /histórico/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('wiring: sin SMTP loguea una sola vez', async () => {
  const dir = setup(malos());
  const logs = [];
  const orig = console.log; console.log = (...a) => logs.push(a.join(' '));
  try {
    const a = createBackupAlerts({ configDir: dir, now: () => NOW, getTo: () => '', getFrom: () => 'x', getTransport: () => null });
    await a.check(); await a.check();
  } finally { console.log = orig; }
  assert.strictEqual(logs.filter((l) => l.includes('Sin SMTP')).length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('wiring: backup-avisos.json corrupto no reenvía lo activo', async () => {
  const dir = setup(malos());
  fs.writeFileSync(path.join(dir, 'backup-avisos.json'), '{roto');
  let calls = 0;
  const orig = console.error; console.error = () => {};
  try {
    await createBackupAlerts({ configDir: dir, now: () => NOW, getTo: () => 'a@b.c', getFrom: () => 'x', getTransport: () => ({ sendMail: async () => { calls++; } }) }).check();
  } finally { console.error = orig; }
  assert.strictEqual(calls, 0);
  assert.ok(JSON.parse(fs.readFileSync(path.join(dir, 'backup-avisos.json'), 'utf8'))['error:config:drive']);
  fs.rmSync(dir, { recursive: true, force: true });
});
