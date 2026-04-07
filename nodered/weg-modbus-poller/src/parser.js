'use strict';

const STATES = ['READY', 'RUNNING', 'UNDERVOLTAGE', 'PROTECTION', 'CONFIG', 'STO', 'POWER_OFF', 'DISABLED'];

function toSigned16(val) {
  return val > 32767 ? val - 65536 : val;
}

function parseCFW900(regs, device, igbtRegs) {
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
  const igbtTemps = igbtRegs ? [
    toSigned16(igbtRegs[0] || 0) / 10,
    toSigned16(igbtRegs[1] || 0) / 10,
    toSigned16(igbtRegs[2] || 0) / 10
  ] : [0, 0, 0];
  const igbtTemp = Math.max(...igbtTemps);

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
    igbtTemp,
    igbtTemps,
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

// SSW900 register map (Net Id = register address):
// Measurements block (regs 0-69):
//   4:  Main Line Voltage Average (16bit, ÷10)
//   7:  Output Voltage Average (16bit, ÷10)
//   8:  Power Factor (8bit, ÷100)
//   10-11: Active Power (32bit, ÷10)
//   17: Frequency (16bit, ÷10)
//   24-25: Current Average (32bit, ÷10)
//   42-43: Hours Powered (32bit, seconds)
//   44-45: Hours Enabled (32bit, seconds)
//   60: SCR Temperature (s16bit)
//   63: Motor Temperature Ch1 (s16bit)
// Status block (regs 679-690, passed as statusRegs):
//   0 (679): SSW Status Actual (enum)
//   1 (680): Status Word (16bit bitfield)

function parseSSW900(regs, device, statusRegs) {
  // Measurements from Net Id 0-69
  const current = ((regs[24] || 0) + ((regs[25] || 0) << 16)) / 10;
  const voltage = (regs[4] || 0) / 10;
  const outputVoltage = (regs[7] || 0) / 10;
  const cosPhi = (regs[8] || 0) / 100;
  const power = ((regs[10] || 0) + ((regs[11] || 0) << 16)) / 10;
  const freq = (regs[17] || 0) / 10;
  const scrTemp = toSigned16(regs[60] || 0);
  const motorTemp = toSigned16(regs[63] || 0);
  const secPowered = (regs[42] || 0) + ((regs[43] || 0) << 16);
  const secEnabled = (regs[44] || 0) + ((regs[45] || 0) << 16);

  // Status from Net Id 679-690 (via PLC %MW140+)
  const sswStatus = statusRegs ? (statusRegs[0] || 0) : 0;
  const statusWord = statusRegs ? (statusRegs[1] || 0) : 0;

  const running = !!(statusWord & 0x0001);
  const genEnabled = !!(statusWord & 0x0002);
  const bypass = !!(statusWord & 0x0040);
  const hasAlarm = !!(statusWord & 0x4000);
  const hasFault = !!(statusWord & 0x8000);

  // SSW Status enum: 0=Ready, 1=InitTest, 2=Fault, 3=RampUp, 4=FullVoltage, 5=Bypass
  const SSW_STATES = ['READY', 'INITIAL_TEST', 'FAULT', 'RAMP_UP', 'FULL_VOLTAGE', 'BYPASS',
    'RESERVED', 'RAMP_DOWN', 'BRAKING', 'FWD_REV', 'JOG', 'START_DELAY', 'RESTART_DELAY',
    'GENERAL_DISABLED', 'CONFIGURATION'];
  const stateCode = sswStatus;
  const fault = sswStatus === 2 || hasFault;

  return {
    name: device.name,
    type: 'SSW900',
    ip: device.ip,
    site: device.site,
    stateCode,
    statusText: SSW_STATES[stateCode] || 'UNKNOWN',
    speedRef: 0,
    motorSpeed: 0,
    current,
    frequency: freq,
    outputCurrent: current,
    outputFreq: freq,
    outputVoltage,
    power,
    cosPhi,
    motorTemp: motorTemp || scrTemp,
    scrTemp,
    nominalCurrent: 150,
    nominalVoltage: 500,
    nominalFreq: 0,
    hoursEnergized: secPowered > 0 ? (secPowered / 3600).toFixed(1) : '-',
    hoursEnabled: secEnabled > 0 ? (secEnabled / 3600).toFixed(1) : '-',
    online: true,
    running,
    ready: sswStatus === 0,
    fault,
    hasFault,
    hasAlarm,
    faultText: hasFault ? 'FALLA' : 'Sin Falla',
    alarmText: hasAlarm ? 'ALARMA' : '',
    _ts: Date.now()
  };
}

function parse(regs, device, statusRegs, igbtRegs) {
  return device.type === 'SSW900' ? parseSSW900(regs, device, statusRegs) : parseCFW900(regs, device, igbtRegs);
}

module.exports = { parse, parseCFW900, parseSSW900 };
