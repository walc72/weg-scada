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

// ADVC «MODBUS Standard ACR»: AI = fc 3, BI = fc 2 (fc 1 son salidas de comando)
const advc = (addr, o = {}) => ({ fc: 3, addr, tipo: 'u16', ...o });
const advcBi = (addr) => ({ fc: 2, addr, tipo: 'bool' });

const MODELOS = {
  pmsetu: {
    kind: 'reco',
    nombre: 'Schneider ADVC (U-Series)',
    descripcion: 'Mapa «MODBUS Standard ACR» del controlador ADVC, verificado contra WSOS (Measurement) en planta. '
      + 'Requiere Modbus asignado en WSOS al puerto LAN cableado (el firewall del ADVC solo lo acepta por ese puerto). '
      + 'Registros 7–9 y 13–15 son del lado carga (sin TP en este equipo); escala de la energía acumulada sin confirmar; '
      + 'otro firmware puede cambiar escalas:' + VERIFICAR,
    mapa: [
      { key: 'estado', ...advcBi(5) },
      { key: 'disparo', ...advcBi(4) },
      { key: 'bloqueo', ...advcBi(64) },
      { key: 'ia', ...advc(0) },
      { key: 'ib', ...advc(1) },
      { key: 'ic', ...advc(2) },
      { key: 'va', ...advc(4, { escala: 2 }) },
      { key: 'vb', ...advc(5, { escala: 2 }) },
      { key: 'vc', ...advc(6, { escala: 2 }) },
      { key: 'operaciones', ...advc(27) },
      { key: 'med', nombre: 'Potencia activa', unidad: 'kW', principal: true, rol: 'kw', ...advc(17, { tipo: 's16', escala: 4 }) },
      { key: 'med', nombre: 'Potencia reactiva', unidad: 'kVAr', rol: 'kvar', ...advc(19, { tipo: 's16', escala: 4 }) },
      { key: 'med', nombre: 'Potencia aparente', unidad: 'kVA', ...advc(18, { escala: 4 }) },
      { key: 'med', nombre: 'Factor de potencia', decimales: 2, principal: true, rol: 'fp', ...advc(20, { escala: 0.01 }) },
      { key: 'med', nombre: 'Frecuencia', unidad: 'Hz', decimales: 1, principal: true, ...advc(16, { escala: 0.1 }) },
      { key: 'med', nombre: 'Corriente de tierra', unidad: 'A', ...advc(3) },
      { key: 'med', nombre: 'Tensión AB', unidad: 'V', ...advc(10, { escala: 2 }) },
      { key: 'med', nombre: 'Tensión BC', unidad: 'V', ...advc(11, { escala: 2 }) },
      { key: 'med', nombre: 'Tensión CA', unidad: 'V', ...advc(12, { escala: 2 }) },
      { key: 'med', nombre: 'Energía acumulada', unidad: 'kWh', ...advc(70, { tipo: 'u32', orden: 'LE' }) },
      { key: 'med', nombre: 'Vida de contactos', unidad: '%', decimales: 1, ...advc(24, { escala: 0.01 }) },
      { key: 'senal', nombre: 'Reconexión automática', principal: true, ...advcBi(90) },
      { key: 'senal', nombre: 'Protección activa', principal: true, ...advcBi(97) },
      { key: 'alarma', texto: 'Falla alimentación auxiliar', ...advcBi(2) },
      { key: 'alarma', texto: 'Puerta abierta', ...advcBi(34) },
      { key: 'alarma', texto: 'Presión de gas baja', ...advcBi(24) },
      { key: 'alarma', texto: 'Falla batería', ...advcBi(28) },
      { key: 'alarma', texto: 'Falla mecanismo', ...advcBi(30) },
      { key: 'alarma', texto: 'Pérdida de fase', ...advcBi(121) },
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
    descripcion: 'Lectura DNP3 directa (outstation 10, maestro 3 — no se usa el 1, al que los equipos mandan sus no solicitados —, puerto 20000). '
      + 'Requiere la lista de puntos DNP3 del TSEA con AI 0–10 (Factor 100, salvo TAP): VLs, ILs, TAP, VLp, ILp, ángulo IL×VL, FP, P, Q, TAPMIN, TAPMAX. '
      + 'Tensión y corriente se leen en primario (AI 3/4); la consigna (AO 0) llega en secundario: ajustar su escala con la relación del TV. '
      + 'Sin tensión de fuente (requiere TP exterior). AO1, BO 0–1 y ctr 1 no están identificados;' + VERIFICAR,
    protocolo: 'dnp3',
    port: 20000,
    dnp3: { outstation: 10, maestro: 3 },
    mapa: [
      { key: 'v', ...dp('ai', 3, { escala: 0.01 }) },
      { key: 'i', ...dp('ai', 4, { escala: 0.01 }) },
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
      // mismas mediciones y orden que el Tapelectro (la tarjeta las muestra en este orden)
      { key: 'med', nombre: 'Desfase V–I', unidad: '°', decimales: 1, rol: 'angulo', ...dp('ai', 5, { escala: 0.01 }) },
      { key: 'med', nombre: 'Factor de potencia', unidad: '', decimales: 2, principal: true, rol: 'fp', ...dp('ai', 6, { escala: 0.01 }) },
      { key: 'med', nombre: 'Potencia activa', unidad: 'kW', decimales: 0, principal: true, rol: 'kw', ...dp('ai', 7, { escala: 0.01 }) },
      { key: 'med', nombre: 'Potencia reactiva', unidad: 'kVAr', decimales: 0, rol: 'kvar', ...dp('ai', 8, { escala: 0.01 }) },
      { key: 'med', nombre: 'Tap mínimo memorizado', unidad: '', decimales: 0, ...dp('ai', 9) },
      { key: 'med', nombre: 'Tap máximo memorizado', unidad: '', decimales: 0, ...dp('ai', 10) },
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
