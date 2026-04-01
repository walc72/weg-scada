'use strict';

const STATES = ['READY', 'RUNNING', 'UNDERVOLTAGE', 'PROTECTION', 'CONFIG', 'STO', 'POWER_OFF', 'DISABLED'];

function toSigned16(val) {
  return val > 32767 ? val - 65536 : val;
}

function parseCFW900(regs, device) {
  const speedRef = regs[1] || 0;
  const motorSpeed = regs[2] || 0;
  const current = (regs[3] || 0) / 10;
  const freq = (regs[5] || 0) / 10;
  const stateCode = regs[6] || 0;
  const voltage = regs[7] || 0;
  const power = (regs[10] || 0) / 100;
  const cosPhi = toSigned16(regs[11] || 0) / 100;

  const secEnergized = (regs[42] || 0) + ((regs[43] || 0) << 16);
  const secEnabled = (regs[46] || 0) + ((regs[47] || 0) << 16);
  const motorTemp = toSigned16(regs[49] || 0) / 10;

  const faults = [regs[50] || 0, regs[51] || 0, regs[52] || 0, regs[53] || 0, regs[54] || 0];
  const alarms = [regs[60] || 0, regs[61] || 0, regs[62] || 0, regs[63] || 0, regs[64] || 0];
  const hasFault = faults.some(v => v > 0);
  const hasAlarm = alarms.some(v => v > 0);
  const running = stateCode === 1;
  const ready = stateCode === 0;
  const fault = stateCode === 3 || hasFault;

  return {
    name: device.name,
    type: 'CFW900',
    ip: device.ip,
    site: device.site,
    stateCode,
    statusText: STATES[stateCode] || 'UNKNOWN',
    speedRef,
    motorSpeed,
    current,
    frequency: freq,
    outputCurrent: current,
    outputFreq: freq,
    outputVoltage: voltage,
    power,
    cosPhi,
    motorTemp,
    nominalCurrent: 150,
    nominalVoltage: 500,
    nominalFreq: 70,
    hoursEnergized: (secEnergized / 3600).toFixed(1),
    hoursEnabled: (secEnabled / 3600).toFixed(1),
    online: true,
    running,
    ready,
    fault,
    hasFault,
    hasAlarm,
    faultText: hasFault ? 'F' + faults.filter(v => v > 0).join('/F') : 'Sin Falla',
    alarmText: hasAlarm ? 'A' + alarms.filter(v => v > 0).join('/A') : '',
    _ts: Date.now()
  };
}

function parseSSW900(regs, device) {
  const current = (regs[3] || 0) / 10;
  const stateCode = regs[6] || 0;
  const voltage = regs[7] || 0;
  const power = (regs[10] || 0) / 100;
  const cosPhi = toSigned16(regs[11] || 0) / 100;
  const motorTemp = toSigned16(regs[49] || 0) / 10;

  const faults = [regs[50] || 0, regs[51] || 0, regs[52] || 0];
  const alarms = [regs[60] || 0, regs[61] || 0, regs[62] || 0];
  const hasFault = faults.some(v => v > 0);
  const hasAlarm = alarms.some(v => v > 0);
  const running = stateCode === 1;
  const ready = stateCode === 0;
  const fault = stateCode === 3 || hasFault;

  return {
    name: device.name,
    type: 'SSW900',
    ip: device.ip,
    site: device.site,
    stateCode,
    statusText: STATES[stateCode] || 'UNKNOWN',
    speedRef: 0,
    motorSpeed: 0,
    current,
    frequency: 0,
    outputCurrent: current,
    outputFreq: 0,
    outputVoltage: voltage,
    power,
    cosPhi,
    motorTemp,
    nominalCurrent: 150,
    nominalVoltage: 500,
    nominalFreq: 0,
    hoursEnergized: '-',
    hoursEnabled: '-',
    online: true,
    running,
    ready,
    fault,
    hasFault,
    hasAlarm,
    faultText: hasFault ? 'F' + faults.filter(v => v > 0).join('/F') : 'Sin Falla',
    alarmText: hasAlarm ? 'A' + alarms.filter(v => v > 0).join('/A') : '',
    _ts: Date.now()
  };
}

function parse(regs, device) {
  return device.type === 'SSW900' ? parseSSW900(regs, device) : parseCFW900(regs, device);
}

module.exports = { parse, parseCFW900, parseSSW900 };
