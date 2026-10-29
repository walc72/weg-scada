'use strict';

// Mapas por defecto por modelo; el portal los copia al dar de alta un equipo (spec 5.6).
const VERIFICAR = ' direcciones a verificar en puesta en marcha.';

// Distribucion sugerida para el Moxa de los reguladores (todos fc 3, u16 salvo tap)
const mapaRegulador = () => [
  { key: 'tap', fc: 3, addr: 0, tipo: 's16' },
  { key: 'v', fc: 3, addr: 1, tipo: 'u16', escala: 0.1 },
  { key: 'i', fc: 3, addr: 2, tipo: 'u16', escala: 0.1 },
  { key: 'vConsigna', fc: 3, addr: 3, tipo: 'u16', escala: 0.1 },
  { key: 'auto', fc: 3, addr: 4, tipo: 'u16', bit: 0 },
  { key: 'remoto', fc: 3, addr: 4, tipo: 'u16', bit: 1 },
  { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 0, texto: 'Tap en límite' },
  { key: 'alarma', fc: 3, addr: 5, tipo: 'u16', bit: 1, texto: 'Falla de control' },
];

const MODELOS = {
  pmsetu: {
    kind: 'reco',
    nombre: 'PMSet U',
    descripcion: 'Distribución provisoria (el manual Modbus público no se encontró):' + VERIFICAR,
    // Sin fuente publica: disposicion correlativa a ajustar con el manual/equipo real
    mapa: [
      { key: 'estado', fc: 3, addr: 0, tipo: 'u16', bit: 0 },
      { key: 'ia', fc: 3, addr: 1, tipo: 'f32' },
      { key: 'ib', fc: 3, addr: 3, tipo: 'f32' },
      { key: 'ic', fc: 3, addr: 5, tipo: 'f32' },
      { key: 'va', fc: 3, addr: 7, tipo: 'f32' },
      { key: 'vb', fc: 3, addr: 9, tipo: 'f32' },
      { key: 'vc', fc: 3, addr: 11, tipo: 'f32' },
      { key: 'bloqueo', fc: 3, addr: 13, tipo: 'u16', bit: 0 },
      { key: 'disparo', fc: 3, addr: 13, tipo: 'u16', bit: 1 },
      { key: 'operaciones', fc: 3, addr: 14, tipo: 'u32' },
    ],
  },
  tsea: {
    kind: 'reg',
    nombre: 'TSEA',
    descripcion: 'Distribución sugerida para el Moxa;' + VERIFICAR,
    mapa: mapaRegulador(),
  },
  tapelectro: {
    kind: 'reg',
    nombre: 'Tapelectro',
    descripcion: 'RUA-01 vía MGate 5109 (DNP3→Modbus), regulador RG1; para RG2/RG3 sumar 2/4 a tap (9218/9220), '
      + '8/16 a v e i (9242/9244, 9250/9252) y usar coils auto 3/5, falla 9/10, protección 19/20, bloqueo 31/38;' + VERIFICAR,
    mapa: [
      { key: 'tap', fc: 3, addr: 9216, tipo: 's16' },
      { key: 'v', fc: 3, addr: 9234, tipo: 's16' },
      { key: 'i', fc: 3, addr: 9236, tipo: 's16' },
      { key: 'auto', fc: 1, addr: 1, tipo: 'bool' },
      { key: 'remoto', fc: 1, addr: 21, tipo: 'bool' },
      { key: 'alarma', fc: 1, addr: 8, tipo: 'bool', texto: 'Falla RG1' },
      { key: 'alarma', fc: 1, addr: 18, tipo: 'bool', texto: 'Protección RG1' },
      { key: 'alarma', fc: 1, addr: 30, tipo: 'bool', texto: 'Bloqueo RG1' },
      { key: 'alarma', fc: 1, addr: 54, tipo: 'bool', texto: 'Bloqueado tap máx/mín' },
      { key: 'comOk', fc: 3, addr: 25600, tipo: 'u16', valor: 257 },
    ],
  },
  'otro-reco': {
    kind: 'reco',
    nombre: 'Otro reconectador',
    descripcion: 'Mapa vacío con una fila de ejemplo;' + VERIFICAR,
    mapa: [{ key: 'estado', fc: 3, addr: 0, tipo: 'u16', bit: 0 }],
  },
  'otro-reg': {
    kind: 'reg',
    nombre: 'Otro regulador',
    descripcion: 'Mapa vacío con una fila de ejemplo;' + VERIFICAR,
    mapa: [{ key: 'tap', fc: 3, addr: 0, tipo: 's16' }],
  },
};

const modeloId = (kind, modelo) => (modelo === 'otro' ? `otro-${kind}` : modelo);

module.exports = { MODELOS, modeloId };
