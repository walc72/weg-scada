'use strict';

const ModbusRTU = require('modbus-serial');

// Pool of Modbus TCP connections, keyed by "ip:port"
const pool = new Map();

function key(ip, port) {
  return `${ip}:${port}`;
}

async function getOrCreate(ip, port) {
  const k = key(ip, port);
  let entry = pool.get(k);

  if (entry && entry.client.isOpen) {
    return entry.client;
  }

  // Close stale connection if exists
  if (entry) {
    try { entry.client.close(() => {}); } catch (e) {}
  }

  const client = new ModbusRTU();
  client.setTimeout(2000);

  try {
    await client.connectTCP(ip, { port, timeout: 3000 });
    console.log(`[CONN] Connected to ${k}`);
    pool.set(k, { client, ip, port, errors: 0 });
    return client;
  } catch (err) {
    console.error(`[CONN] Failed to connect to ${k}: ${err.message}`);
    pool.set(k, { client, ip, port, errors: (entry ? entry.errors : 0) + 1 });
    return null;
  }
}

async function poll(ip, port, unitId, startAddr, count) {
  const client = await getOrCreate(ip, port);
  if (!client || !client.isOpen) return null;

  const k = key(ip, port);
  client.setID(unitId);
  try {
    const resp = await client.readHoldingRegisters(startAddr, count);
    // Reset error counter on success
    const entry = pool.get(k);
    if (entry && entry.errors > 0) entry.errors = 0;
    return resp.data;
  } catch (err) {
    const entry = pool.get(k);
    if (entry) entry.errors++;
    // If too many errors, close and let next poll reconnect
    if (entry && entry.errors > 5) {
      try { client.close(() => {}); } catch (e) {}
      pool.delete(k);
      console.warn(`[CONN] Closed ${k} after ${entry.errors} errors — will reconnect`);
    }
    return null;
  }
}

function closeOne(k) {
  const entry = pool.get(k);
  if (entry) {
    try { entry.client.close(() => {}); } catch (e) {}
    pool.delete(k);
  }
}

function closeAll() {
  for (const [k, entry] of pool) {
    try { entry.client.close(() => {}); } catch (e) {}
    console.log(`[CONN] Closed ${k}`);
  }
  pool.clear();
}

function getStats() {
  const stats = {};
  for (const [k, entry] of pool) {
    stats[k] = { connected: entry.client.isOpen, errors: entry.errors };
  }
  return stats;
}

module.exports = { poll, closeOne, closeAll, getStats };
