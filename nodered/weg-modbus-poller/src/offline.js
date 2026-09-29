'use strict';

// Estado publicado para un drive que no responde por Modbus. Antes se copiaba
// la última lectura buena con online=false, así que una falla/alarma (o
// running=true) de ese momento quedaba publicada para siempre mientras el
// equipo siguiera sin comunicación. Ahora solo se conservan identidad, placa
// y totalizadores; todo lo "en vivo" (estado, falla, alarma, medidas) se limpia.

const KEEP = ['nominalCurrent', 'nominalVoltage', 'nominalFreq', 'hoursEnergized', 'hoursEnabled'];

function offlineState(dev, prev) {
  const data = {
    name: dev.name, type: dev.type, ip: dev.ip, site: dev.site,
    online: false, running: false, ready: false, fault: false,
    hasFault: false, hasAlarm: false, current: 0, frequency: 0,
    outputVoltage: 0, motorSpeed: 0, power: 0, cosPhi: 0, motorTemp: 0,
    speedRef: 0, nominalCurrent: 150, nominalVoltage: 500,
    nominalFreq: dev.type === 'SSW900' ? 0 : 70,
    faultText: '', alarmText: '', hoursEnergized: '-', hoursEnabled: '-',
    stateCode: 0, statusText: 'OFFLINE', _ts: Date.now()
  };
  if (prev) {
    for (const k of KEEP) {
      if (prev[k] !== undefined) data[k] = prev[k];
    }
  }
  return data;
}

module.exports = { offlineState };
