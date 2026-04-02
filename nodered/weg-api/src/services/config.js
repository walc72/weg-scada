'use strict';

const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const mqtt = require('mqtt');

const CONFIG_PATH = process.env.CONFIG_PATH || '/app/config/config.json';
let config = null;
let deviceStates = new Map();
let mqttClient = null;

// ─── Config Read/Write ──────────────────────────────────────────────
function load() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    console.log(`[CFG] Loaded: ${config.devices.length} devices`);
    return config;
  } catch (e) {
    console.error(`[CFG] Load failed: ${e.message}`);
    return null;
  }
}

function save(newConfig) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
    config = newConfig;
    console.log('[CFG] Saved');
    return true;
  } catch (e) {
    console.error(`[CFG] Save failed: ${e.message}`);
    return false;
  }
}

function get() {
  if (!config) load();
  return config;
}

// ─── MQTT subscription for live device status ───────────────────────
function connectMQTT() {
  const cfg = get();
  const broker = process.env.MQTT_BROKER || (cfg && cfg.mqtt ? cfg.mqtt.broker : 'mqtt://weg-mosquitto:1883');
  const prefix = cfg && cfg.mqtt ? cfg.mqtt.topicPrefix : 'weg/drives';

  console.log(`[MQTT] Connecting to ${broker}`);
  mqttClient = mqtt.connect(broker, { clientId: 'weg-api' });

  mqttClient.on('connect', () => {
    console.log('[MQTT] Connected');
    mqttClient.subscribe(`${prefix}/+`);
    mqttClient.subscribe(cfg.mqtt.statusTopic || 'weg/status');
  });

  mqttClient.on('message', (topic, payload) => {
    try {
      const data = JSON.parse(payload.toString());
      if (data.name) {
        deviceStates.set(data.name, data);
      }
    } catch (e) {}
  });

  mqttClient.on('error', (err) => console.error('[MQTT] Error:', err.message));
}

function getLiveStatus() {
  const devices = [];
  for (const [, d] of deviceStates) {
    devices.push(d);
  }
  return {
    total: devices.length,
    online: devices.filter(d => d.online).length,
    running: devices.filter(d => d.running).length,
    faults: devices.filter(d => d.hasFault).length,
    devices,
    ts: Date.now()
  };
}

function getDeviceState(name) {
  return deviceStates.get(name) || null;
}

// ─── Watch config for external changes ──────────────────────────────
function watchConfig() {
  load();
  connectMQTT();

  chokidar.watch(CONFIG_PATH, { ignoreInitial: true, usePolling: true, interval: 3000 })
    .on('change', () => {
      console.log('[CFG] File changed, reloading...');
      load();
    });
}

module.exports = { get, load, save, watchConfig, getLiveStatus, getDeviceState, deviceStates };
