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

// Puntos libres del RUA-01 (spec 4.1): AI n = FC 3 reg 9216+2n s16; BI n = coil n
const ai = (n) => ({ fc: 3, addr: 9216 + 2 * n, tipo: 's16' });
const med = (nombre, n, o = {}, p = {}) => ({ key: 'med', nombre, ...o, ...ai(n), ...p });
const senal = (nombre, n, o = {}) => ({ key: 'senal', nombre, ...o, fc: 1, addr: n, tipo: 'bool' });

// Puntos DNP3 (g1 bi, g10 bo, g20 ctr, g30 ai, g40 ao); addr = indice
const dp = (obj, addr, o = {}) => ({ obj, addr, ...o });

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
  'tsea-dnp3': {
    kind: 'reg',
    nombre: 'TSEA (DNP3)',
    descripcion: 'Lectura DNP3 directa (outstation 10, maestro 1, puerto 20000). La tensión viene en secundario (base 120 V): '
      + 'ajustar escala con la relación del TV para ver la tensión de línea. AO1, BO 0–1 y ctr 1 no están identificados;' + VERIFICAR,
    protocolo: 'dnp3',
    port: 20000,
    dnp3: { outstation: 10, maestro: 1 },
    mapa: [
      { key: 'v', ...dp('ai', 0, { escala: 0.01 }) },
      { key: 'i', ...dp('ai', 1, { escala: 0.01 }) },
      { key: 'tap', ...dp('ai', 2) },
      { key: 'vConsigna', ...dp('ao', 0, { escala: 0.01 }) },
      { key: 'auto', ...dp('bi', 7) },
      { key: 'remoto', ...dp('bi', 10) },
      { key: 'alarma', ...dp('bi', 8), texto: 'Bloqueado' },
      { key: 'alarma', ...dp('bi', 5), texto: 'Cambio de toma inhibido' },
      { key: 'senal', nombre: 'Motor elevando', ...dp('bi', 3), principal: true },
      { key: 'senal', nombre: 'Motor bajando', ...dp('bi', 4), principal: true },
      { key: 'senal', nombre: 'Tensión sobre el rango', ...dp('bi', 0) },
      { key: 'senal', nombre: 'Tensión en rango', ...dp('bi', 1) },
      { key: 'senal', nombre: 'Tensión bajo el rango', ...dp('bi', 2) },
      { key: 'senal', nombre: 'Flujo inverso', ...dp('bi', 6) },
      { key: 'senal', nombre: 'Neutral', ...dp('bi', 12) },
      { key: 'med', nombre: 'Operaciones', ...dp('ctr', 0), principal: true },
    ],
  },
  tapelectro: {
    kind: 'reg',
    nombre: 'Tapelectro',
    descripcion: 'RUA-01 vía MGate 5109 (DNP3→Modbus), regulador RG1; para RG2/RG3 sumar 2/4 a tap (9218/9220), '
      + '8/16 a v e i (9242/9244, 9250/9252) y usar coils auto 3/5, falla 9/10, protección 19/20, bloqueo 31/38. '
      + 'Puntos libres RG2/RG3 (AI/BI): tensión fuente 15/19, corriente fuente 16/20, desfase V–I 24/26, FP 23/25, kW 29/31, kVAr 30/32, '
      + 'tap mín 5/7, tap máx 6/8, operaciones 39+40/41+42, manual 2/4, motor elevando 50/52, bajando 51/53, luz neutra 28/29, '
      + 'flujo inverso 15/22. Sugerido cargar en RG1 los datos comunes: señal NoBreak (BI 6) y Trifásico (BI 23);' + VERIFICAR,
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
      med('Tensión fuente', 11, { unidad: 'V', principal: true }),
      med('Corriente fuente', 12, { unidad: 'A', principal: true }),
      med('Desfase V–I', 22, { unidad: '°', rol: 'angulo' }),
      med('Factor de potencia', 21, { decimales: 2, principal: true, rol: 'fp' }, { escala: 0.01 }),
      med('Potencia activa', 27, { unidad: 'kW', principal: true, rol: 'kw' }),
      med('Potencia reactiva', 28, { unidad: 'kVAr', rol: 'kvar' }),
      med('Tap mínimo memorizado', 3),
      med('Tap máximo memorizado', 4),
      med('Operaciones', 37, { principal: true }, { escala: 1000 }),
      med('Operaciones', 38, { principal: true }),
      senal('Manual', 0),
      senal('Motor elevando', 48, { principal: true }),
      senal('Motor bajando', 49, { principal: true }),
      senal('Luz neutra', 27),
      senal('Flujo inverso', 14),
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
