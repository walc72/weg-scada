'use strict';

const ModbusRTU = require('modbus-serial');

// ─── Perro guardián del bus serie de un PLC (M241 «Vigilancia_Serial») ───
// El PLC publica un diagnóstico en %MW330..339 y atiende un comando
// «reiniciar comunicación serie» en %MW400..411:
//   400..404 token, comando, destino, argumento, usuario  → un FC16
//   405..406 disparador, CRC-16/MODBUS de 400..404        → otro FC16, después
//   407 versión del canal · 408 eco del token (lo escribe último) · 409 resultado
//   410 motivo · 411 espera (s)
// Este proceso es el único que escribe en el PLC, y de a un pedido por vez.

const DIAG = 330;
const CMD = 400;
const VERSION_CANAL = 1;
const CMD_REINICIAR_SERIE = 1;
const ESPERA_ECO_MS = 3000;

// CRC-16/MODBUS por bytes, byte alto de cada palabra primero (igual que FUN_Crc16Modbus)
function crc16Palabras(words) {
  let crc = 0xffff;
  for (const w of words) {
    for (const b of [(w >> 8) & 0xff, w & 0xff]) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
    }
  }
  return crc;
}

// 1..65535 distinto de `evitar`
function otro(evitar, rnd = Math.random) {
  let v;
  do { v = 1 + Math.floor(rnd() * 65535); } while (v === evitar);
  return v;
}

// Hash de 16 bits del nombre de usuario (va en la trama solo como rastro)
function usuario16(nombre = '') {
  return crc16Palabras([...String(nombre)].map((c) => c.charCodeAt(0) & 0xffff));
}

function armarPedido({ token, usuario, disparadorActual, rnd }) {
  const campos = [token, CMD_REINICIAR_SERIE, 0, 0, usuario];
  return { campos, disparo: [otro(disparadorActual, rnd), crc16Palabras(campos)] };
}

const MOTIVOS = { 1: 'comando desconocido', 2: 'ya hay un reinicio en curso', 3: 'se reinició hace muy poco' };

// regs = 330..339 (10) ; canal = 407..411 (5)
function decodificar(regs, canal) {
  const disponible = regs[0] === 1 && canal[0] === VERSION_CANAL;
  return {
    disponible,
    reinicios: regs[1],
    sinRefrescar: regs.slice(2, 6),
    paso: regs[6],
    motivoUltimo: regs[7] === 1 ? 'automatico' : regs[7] === 2 ? 'portal' : null,
    seguidos: regs[8],
    minDesdeUltimo: regs[9] === 0xffff ? null : regs[9],
  };
}

function createSerie({ conectar = defaultConectar, esperar = (ms) => new Promise((r) => setTimeout(r, ms)), rnd } = {}) {
  const clientes = new Map();
  let cola = Promise.resolve();

  async function cliente(gw) {
    const k = `${gw.ip}:${gw.port || 502}`;
    const c = clientes.get(k);
    if (c && c.isOpen) return c;
    const nuevo = await conectar(gw.ip, gw.port || 502);
    clientes.set(k, nuevo);
    return nuevo;
  }

  // Cada operación en fila: nunca dos pedidos a la vez
  // (si algo falla se cierra la conexión: la próxima operación reconecta)
  const enFila = (fn) => {
    const p = cola.then(fn, fn).catch((e) => {
      for (const c of clientes.values()) { try { c.close(() => {}); } catch (x) {} }
      clientes.clear();
      throw e;
    });
    cola = p.catch(() => {});
    return p;
  };

  const leer = (gw) => enFila(async () => {
    const c = await cliente(gw);
    const regs = (await c.readHoldingRegisters(DIAG, 10)).data;
    const canal = (await c.readHoldingRegisters(CMD + 7, 5)).data;
    return decodificar(regs, canal);
  });

  const reiniciar = (gw, nombreUsuario) => enFila(async () => {
    const c = await cliente(gw);
    const cmd = (await c.readHoldingRegisters(CMD, 12)).data;
    if (cmd[7] !== VERSION_CANAL) return { ok: false, error: 'El PLC no tiene el canal de comandos (cargar el programa con Vigilancia_Serial)' };
    const token = otro(cmd[8], rnd);
    const { campos, disparo } = armarPedido({ token, usuario: usuario16(nombreUsuario), disparadorActual: cmd[5], rnd });
    await c.writeRegisters(CMD, campos);
    await c.writeRegisters(CMD + 5, disparo);
    for (let t = 0; t < ESPERA_ECO_MS; t += 100) {
      await esperar(100);
      const r = (await c.readHoldingRegisters(CMD + 8, 4)).data;
      if (r[0] !== token) continue;
      if (r[1] === 1) return { ok: true };
      if (r[1] === 3) return { ok: false, error: 'El PLC rechazó la trama (CRC)' };
      return { ok: false, error: `El PLC no lo aceptó: ${MOTIVOS[r[2]] || 'motivo ' + r[2]}`, espera: r[3] || 0 };
    }
    return { ok: false, error: 'El PLC no respondió el pedido' };
  });

  return { leer, reiniciar };
}

async function defaultConectar(ip, port) {
  const c = new ModbusRTU();
  c.setTimeout(3000);
  await c.connectTCP(ip, { port, timeout: 5000 });
  c.setID(1);
  return c;
}

// Gateways de PLC: los que tienen equipos con slot (mapa del M241)
function gatewaysPlc(config) {
  const con = new Set((config.devices || []).filter((d) => d.slot != null && d.enabled !== false && d.gateway).map((d) => d.gateway));
  return (config.gateways || []).filter((g) => con.has(g.name));
}

module.exports = { createSerie, crc16Palabras, armarPedido, decodificar, usuario16, gatewaysPlc, otro };
