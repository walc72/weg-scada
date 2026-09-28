'use strict';

const fs = require('fs');
const { execFile, spawn } = require('child_process');
const { EventEmitter } = require('events');
const { createTailscale } = require('./tailscale');
const { createAgentServer } = require('./server');

const SOCK = process.env.TS_SOCKET || '/var/run/tailscale/tailscaled.sock';
const TOKEN = process.env.AGENT_TOKEN || '';
if (!TOKEN) console.error('[AGENT] AGENT_TOKEN vacío: todas las operaciones responden 503');

const run = (args) => new Promise((resolve, reject) => {
  execFile('tailscale', [`--socket=${SOCK}`, ...args], { timeout: 15000 }, (e, stdout, stderr) => {
    if (e) return reject(Object.assign(e, { stdout, stderr }));
    resolve({ stdout });
  });
});

const spawnUp = (args) => {
  const ev = new EventEmitter();
  const child = spawn('tailscale', [`--socket=${SOCK}`, ...args], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stdout.on('data', (d) => process.stdout.write(`[TS up] ${d}`));
  child.stderr.on('data', (d) => { stderr += d; process.stdout.write(`[TS up] ${d}`); });
  child.on('close', (code) => ev.emit('done', code, stderr));
  child.on('error', (e) => ev.emit('done', 1, e.message));
  return ev;
};

const tailscale = createTailscale({ run, spawnUp, socketExists: () => fs.existsSync(SOCK) });
createAgentServer({ token: TOKEN, tailscale }).listen(3400, '0.0.0.0', () => {
  console.log(`[AGENT] Escuchando :3400 (socket ${SOCK})`);
});
