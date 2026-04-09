'use strict';

const ModbusRTU = require('modbus-serial');

// Pool of Modbus TCP connections, keyed by "ip:port"
const pool = new Map();
const reconnectTimers = new Map();

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

  client.setID(unitId);
  try {
    const resp = await client.readHoldingRegisters(startAddr, count);
    return resp.data;
  } catch (err) {
    const k = key(ip, port);
    const entry = pool.get(k);
    if (entry) entry.errors++;
    // If too many errors, close and let next poll reconnect
    if (entry && entry.errors > 5) {
      try { client.close(() => {}); } catch (e) {}
      console.warn(`[CONN] Closed ${k} after ${entry.errors} errors`);
    }
    return null;
  }
}

function closeAll() {
  for (const [k, entry] of pool) {
    try { entry.client.close(() => {}); } catch (e) {}
    console.log(`[CONN] Closed ${k}`);
  }
  pool.clear();
  for (const [, timer] of reconnectTimers) clearTimeout(timer);
  reconnectTimers.clear();
}

function getStats() {
  const stats = {};
  for (const [k, entry] of pool) {
    stats[k] = { connected: entry.client.isOpen, errors: entry.errors };
  }
  return stats;
}

module.exports = { poll, closeAll, getStats };
