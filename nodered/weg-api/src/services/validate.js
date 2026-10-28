'use strict';

// ─── Validacion de esquema de config.json ────────────────────────────
// Sin esto, un PUT malformado se escribia a disco tal cual; el poller lo
// recargaba, fallaba en cfg.devices.length y caia a un default con lista
// de dispositivos vacia — todo el polling se detenia en silencio.

const DEVICE_TYPES = new Set(['CFW900', 'SSW900']);

function isNonEmptyString(v, max = 64) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max;
}

function isHost(v) {
  // IPv4 o hostname simple; suficiente para red industrial
  return isNonEmptyString(v, 253) && /^[a-zA-Z0-9._-]+$/.test(v);
}

function isPort(v) {
  return v === undefined || (Number.isInteger(v) && v >= 1 && v <= 65535);
}

function isUnitId(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && v <= 255);
}

function isOffset(v) {
  return v === undefined || (Number.isInteger(v) && v >= 0 && v <= 65535);
}

function validateDevice(d, i, errors) {
  const tag = `devices[${i}]`;
  if (!d || typeof d !== 'object' || Array.isArray(d)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(d.name)) errors.push(`${tag}: name requerido (string no vacio, max 64)`);
  if (!DEVICE_TYPES.has(d.type)) errors.push(`${tag} (${d.name}): type debe ser CFW900 o SSW900`);
  if (!isHost(d.ip)) errors.push(`${tag} (${d.name}): ip invalida`);
  if (!isPort(d.port)) errors.push(`${tag} (${d.name}): port invalido (1-65535)`);
  if (!isUnitId(d.unitId)) errors.push(`${tag} (${d.name}): unitId invalido (0-255)`);
  if (!isOffset(d.regOffset)) errors.push(`${tag} (${d.name}): regOffset invalido`);
  if (!isOffset(d.statusOffset)) errors.push(`${tag} (${d.name}): statusOffset invalido`);
  if (d.gateway !== undefined && !isNonEmptyString(d.gateway)) errors.push(`${tag} (${d.name}): gateway invalido`);
  if (d.slot !== undefined && (!Number.isInteger(d.slot) || d.slot < 0)) errors.push(`${tag} (${d.name}): slot invalido (entero >= 0)`);
  if (d.enabled !== undefined && typeof d.enabled !== 'boolean') errors.push(`${tag} (${d.name}): enabled debe ser boolean`);
  if (d.caudal !== undefined) {
    const c = d.caudal;
    if (!c || typeof c !== 'object' || Array.isArray(c)) errors.push(`${tag} (${d.name}): caudal debe ser un objeto`);
    else {
      if (c.modo !== 'manual' && c.modo !== 'real') errors.push(`${tag} (${d.name}): caudal.modo debe ser manual o real`);
      if (c.nominal !== undefined && !(typeof c.nominal === 'number' && Number.isFinite(c.nominal) && c.nominal >= 0)) errors.push(`${tag} (${d.name}): caudal.nominal debe ser numero >= 0`);
    }
  }
}

function validateGateway(g, i, errors) {
  const tag = `gateways[${i}]`;
  if (!g || typeof g !== 'object' || Array.isArray(g)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(g.name)) errors.push(`${tag}: name requerido`);
  if (!isHost(g.ip)) errors.push(`${tag} (${g.name}): ip invalida`);
  if (!isPort(g.port)) errors.push(`${tag} (${g.name}): port invalido`);
  if (g.kind !== undefined && g.kind !== 'plc' && g.kind !== 'adam') errors.push(`${tag} (${g.name}): kind debe ser 'plc' o 'adam'`);
  // Layout del scan (opcional): enteros; statusBase puede ser 0
  if (g.scan !== undefined) {
    const sc = g.scan;
    if (!sc || typeof sc !== 'object' || Array.isArray(sc)) { errors.push(`${tag} (${g.name}): scan debe ser un objeto`); }
    else {
      if (sc.regsPerDrive !== undefined && (!Number.isInteger(sc.regsPerDrive) || sc.regsPerDrive < 1)) errors.push(`${tag} (${g.name}): scan.regsPerDrive invalido`);
      if (sc.statusBase !== undefined && (!Number.isInteger(sc.statusBase) || sc.statusBase < 0)) errors.push(`${tag} (${g.name}): scan.statusBase invalido`);
      if (sc.statusStride !== undefined && (!Number.isInteger(sc.statusStride) || sc.statusStride < 0)) errors.push(`${tag} (${g.name}): scan.statusStride invalido`);
      if (sc.maxSlots !== undefined && (!Number.isInteger(sc.maxSlots) || sc.maxSlots < 1 || sc.maxSlots > 64)) errors.push(`${tag} (${g.name}): scan.maxSlots debe ser 1-64`);
    }
  }
  // Slots (mapa del PLC): id -> offsets
  if (g.slots !== undefined) {
    if (!Array.isArray(g.slots)) { errors.push(`${tag} (${g.name}): slots debe ser un array`); return; }
    g.slots.forEach((s, j) => {
      const st = `${tag} (${g.name}).slots[${j}]`;
      if (!s || typeof s !== 'object' || Array.isArray(s)) { errors.push(`${st}: debe ser un objeto`); return; }
      if (!Number.isInteger(s.id) || s.id < 0) errors.push(`${st}: id invalido (entero >= 0)`);
      if (!isOffset(s.regOffset)) errors.push(`${st}: regOffset invalido`);
      if (!isOffset(s.statusOffset)) errors.push(`${st}: statusOffset invalido`);
      if (s.label !== undefined && typeof s.label !== 'string') errors.push(`${st}: label debe ser string`);
    });
  }
}

function validateMeter(m, i, errors) {
  const tag = `meters[${i}]`;
  if (!m || typeof m !== 'object' || Array.isArray(m)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(m.name)) errors.push(`${tag}: name requerido`);
  if (!isNonEmptyString(m.type, 32)) errors.push(`${tag} (${m.name}): type requerido`);
  if (!isHost(m.ip)) errors.push(`${tag} (${m.name}): ip invalida`);
  if (!isPort(m.port)) errors.push(`${tag} (${m.name}): port invalido`);
  if (!isUnitId(m.unitId)) errors.push(`${tag} (${m.name}): unitId invalido`);
  if (m.regs !== undefined) {
    if (!m.regs || typeof m.regs !== 'object' || Array.isArray(m.regs)) {
      errors.push(`${tag} (${m.name}): regs debe ser un objeto`);
    } else {
      for (const [k, v] of Object.entries(m.regs)) {
        if (!Number.isInteger(v) || v < 0) errors.push(`${tag} (${m.name}): regs.${k} debe ser entero >= 0`);
      }
    }
  }
  if (m.waveform !== undefined) {
    const wf = m.waveform;
    if (!wf || typeof wf !== 'object' || Array.isArray(wf)) {
      errors.push(`${tag} (${m.name}): waveform debe ser un objeto`);
    } else {
      if (wf.freqReg !== undefined && (!Number.isInteger(wf.freqReg) || wf.freqReg < 1)) {
        errors.push(`${tag} (${m.name}): waveform.freqReg invalido`);
      }
      if (wf.numHarmonics !== undefined && (!Number.isInteger(wf.numHarmonics) || wf.numHarmonics < 1 || wf.numHarmonics > 63)) {
        errors.push(`${tag} (${m.name}): waveform.numHarmonics debe ser 1-63`);
      }
      if (wf.channels !== undefined) {
        if (!wf.channels || typeof wf.channels !== 'object' || Array.isArray(wf.channels)) {
          errors.push(`${tag} (${m.name}): waveform.channels debe ser un objeto`);
        } else {
          for (const [k, v] of Object.entries(wf.channels)) {
            if (!Number.isInteger(v) || v < 1) errors.push(`${tag} (${m.name}): waveform.channels.${k} invalido`);
          }
        }
      }
    }
  }
}

function validateFlowmeter(f, i, errors) {
  const tag = `flowmeters[${i}]`;
  if (!f || typeof f !== 'object' || Array.isArray(f)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(f.name)) errors.push(`${tag}: name requerido`);
  if (f.type !== 'TUF2000') errors.push(`${tag} (${f.name}): type debe ser TUF2000`);
  if (!isHost(f.ip)) errors.push(`${tag} (${f.name}): ip invalida`);
  if (f.port === undefined || !isPort(f.port)) errors.push(`${tag} (${f.name}): port invalido`);
  if (f.unitId === undefined || !isUnitId(f.unitId)) errors.push(`${tag} (${f.name}): unitId invalido`);
  if (f.wordOrder !== undefined && f.wordOrder !== 'LE' && f.wordOrder !== 'BE') errors.push(`${tag} (${f.name}): wordOrder debe ser LE o BE`);
  if (f.totalMultiplier !== undefined && !(typeof f.totalMultiplier === 'number' && Number.isFinite(f.totalMultiplier) && f.totalMultiplier > 0)) errors.push(`${tag} (${f.name}): totalMultiplier debe ser > 0`);
  if (f.enabled !== undefined && typeof f.enabled !== 'boolean') errors.push(`${tag} (${f.name}): enabled debe ser boolean`);
  // vacio solo se admite deshabilitado (queda asi al borrar su ultima bomba)
  const emptyOk = f.enabled === false && Array.isArray(f.bombas) && !f.bombas.length;
  if (!emptyOk && (!Array.isArray(f.bombas) || !f.bombas.length || !f.bombas.every(b => isNonEmptyString(b)))) {
    errors.push(`${tag} (${f.name}): bombas debe ser un array no vacio de nombres`);
  } else if (new Set(f.bombas).size !== f.bombas.length) {
    errors.push(`${tag} (${f.name}): bombas con nombres repetidos`);
  }
}

function validateComm(c, i, errors) {
  const tag = `comms[${i}]`;
  if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${tag}: debe ser un objeto`); return; }
  if (!isNonEmptyString(c.name)) errors.push(`${tag}: name requerido`);
  if (c.tipo !== 'airmax' && c.tipo !== 'rut') errors.push(`${tag} (${c.name}): tipo debe ser airmax o rut`);
  if (!isHost(c.ip)) errors.push(`${tag} (${c.name}): ip invalida`);
  if (c.community !== undefined && !isNonEmptyString(c.community, 64)) errors.push(`${tag} (${c.name}): community invalida`);
  if (c.enabled !== undefined && typeof c.enabled !== 'boolean') errors.push(`${tag} (${c.name}): enabled debe ser boolean`);
}

// Equipos de campo (unifilar): reconectadores y reguladores con mapa de puntos
const CAMPO_KEYS = {
  reco: ['estado', 'ia', 'ib', 'ic', 'va', 'vb', 'vc', 'bloqueo', 'disparo', 'operaciones', 'alarma'],
  reg: ['tap', 'v', 'i', 'vConsigna', 'auto', 'remoto', 'alarma'],
};
const CAMPO_MODELOS = { reco: ['pmsetu', 'otro'], reg: ['tsea', 'tapelectro', 'otro'] };
const CAMPO_TIPOS = ['u16', 's16', 'u32', 's32', 'f32'];

function validateCampo(c, i, kind, errors) {
  const tag = `${kind === 'reco' ? 'reconectadores' : 'reguladores'}[${i}]`;
  if (!c || typeof c !== 'object' || Array.isArray(c)) { errors.push(`${tag}: debe ser un objeto`); return; }
  const t = `${tag} (${c.name})`;
  if (!isNonEmptyString(c.name)) errors.push(`${tag}: name requerido`);
  if (!CAMPO_MODELOS[kind].includes(c.modelo)) errors.push(`${t}: modelo debe ser ${CAMPO_MODELOS[kind].join(', ')}`);
  if (!isHost(c.ip)) errors.push(`${t}: ip invalida`);
  if (!isPort(c.port)) errors.push(`${t}: port invalido (1-65535)`);
  if (!isUnitId(c.unitId)) errors.push(`${t}: unitId invalido (0-255)`);
  if (c.enabled !== undefined && typeof c.enabled !== 'boolean') errors.push(`${t}: enabled debe ser boolean`);
  if (kind === 'reg') {
    if (c.tapMin !== undefined && !Number.isInteger(c.tapMin)) errors.push(`${t}: tapMin debe ser entero`);
    if (c.tapMax !== undefined && !Number.isInteger(c.tapMax)) errors.push(`${t}: tapMax debe ser entero`);
    if (Number.isInteger(c.tapMin) && Number.isInteger(c.tapMax) && c.tapMin >= c.tapMax) errors.push(`${t}: tapMin debe ser menor que tapMax`);
  }
  if (!Array.isArray(c.mapa) || c.mapa.length < 1 || c.mapa.length > 64) { errors.push(`${t}: mapa debe tener de 1 a 64 puntos`); return; }
  const seen = new Set();
  c.mapa.forEach((p, j) => {
    const m = `${t}: mapa[${j}]`;
    if (!p || typeof p !== 'object' || Array.isArray(p)) { errors.push(`${m}: debe ser un objeto`); return; }
    if (!CAMPO_KEYS[kind].includes(p.key)) errors.push(`${m}.key invalida (${CAMPO_KEYS[kind].join(', ')})`);
    else if (p.key !== 'alarma') {
      if (seen.has(p.key)) errors.push(`${m}.key repetida: ${p.key}`);
      seen.add(p.key);
    }
    if (p.fc !== 3 && p.fc !== 4) errors.push(`${m}.fc debe ser 3 o 4`);
    if (!Number.isInteger(p.addr) || p.addr < 0 || p.addr > 65535) errors.push(`${m}.addr invalida (0-65535)`);
    if (!CAMPO_TIPOS.includes(p.tipo)) errors.push(`${m}.tipo invalido (${CAMPO_TIPOS.join(', ')})`);
    if (p.orden !== undefined && p.orden !== 'BE' && p.orden !== 'LE') errors.push(`${m}.orden debe ser BE o LE`);
    if (p.escala !== undefined && !(typeof p.escala === 'number' && Number.isFinite(p.escala))) errors.push(`${m}.escala debe ser numero`);
    const hasBit = p.bit !== undefined, hasValor = p.valor !== undefined;
    if (hasBit && hasValor) errors.push(`${m}.bit y valor son excluyentes`);
    if ((hasBit || hasValor) && p.tipo !== 'u16' && p.tipo !== 's16') errors.push(`${m}.bit/valor solo con u16 o s16`);
    if (hasBit && (!Number.isInteger(p.bit) || p.bit < 0 || p.bit > 15)) errors.push(`${m}.bit invalido (0-15)`);
    if (hasValor && !Number.isInteger(p.valor)) errors.push(`${m}.valor debe ser entero`);
    if (p.key === 'alarma') {
      if (!hasBit && !hasValor) errors.push(`${m}.bit o valor requerido en alarma`);
      if (!isNonEmptyString(p.texto, 80)) errors.push(`${m}.texto requerido (1-80)`);
    }
  });
}

// Devuelve una lista de errores; vacia si la config es valida.
function validateConfig(cfg) {
  const errors = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return ['la config debe ser un objeto JSON'];
  }

  if (!Array.isArray(cfg.devices)) {
    errors.push('devices debe ser un array');
  } else {
    cfg.devices.forEach((d, i) => validateDevice(d, i, errors));
    const names = cfg.devices.map(d => d && d.name).filter(Boolean);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) errors.push(`nombres de dispositivos duplicados: ${[...new Set(dupes)].join(', ')}`);
    // Dos equipos activos en el mismo slot leen los mismos registros: uno
    // muestra los datos del otro. Los deshabilitados no cuentan.
    const bySlot = new Map();
    for (const d of cfg.devices) {
      if (!d || d.enabled === false || d.gateway === undefined || d.slot === undefined) continue;
      const k = `${d.gateway}|${d.slot}`;
      if (bySlot.has(k)) errors.push(`${bySlot.get(k)} y ${d.name} usan el mismo slot ${d.slot} de ${d.gateway}`);
      else bySlot.set(k, d.name);
    }
  }

  if (cfg.gateways !== undefined) {
    if (!Array.isArray(cfg.gateways)) errors.push('gateways debe ser un array');
    else cfg.gateways.forEach((g, i) => validateGateway(g, i, errors));
  }

  if (cfg.meters !== undefined) {
    if (!Array.isArray(cfg.meters)) errors.push('meters debe ser un array');
    else cfg.meters.forEach((m, i) => validateMeter(m, i, errors));
  }

  if (cfg.flowmeters !== undefined) {
    if (!Array.isArray(cfg.flowmeters)) errors.push('flowmeters debe ser un array');
    else {
      cfg.flowmeters.forEach((f, i) => validateFlowmeter(f, i, errors));
      const fnames = cfg.flowmeters.map(f => f && f.name).filter(Boolean);
      const fd = fnames.filter((n, i) => fnames.indexOf(n) !== i);
      if (fd.length) errors.push(`nombres de caudalimetros duplicados: ${[...new Set(fd)].join(', ')}`);
      const devNames = new Set(Array.isArray(cfg.devices) ? cfg.devices.map(d => d && d.name) : []);
      const owner = new Map();
      for (const f of cfg.flowmeters) {
        if (!f || !Array.isArray(f.bombas)) continue;
        for (const pump of f.bombas) {
          if (!devNames.has(pump)) errors.push(`caudalimetro ${f.name}: la bomba ${pump} no existe`);
          else if (owner.has(pump) && owner.get(pump) !== f) errors.push(`${pump} ya está en el caudalímetro ${owner.get(pump).name}`);
          else owner.set(pump, f);
        }
      }
      if (Array.isArray(cfg.devices)) {
        for (const d of cfg.devices) {
          if (d && d.caudal && d.caudal.modo === 'real' && !owner.has(d.name)) errors.push(`${d.name}: modo Real requiere un caudalímetro`);
        }
      }
    }
  }
  if (Array.isArray(cfg.devices) && !Array.isArray(cfg.flowmeters)) {
    for (const d of cfg.devices) {
      if (d && d.caudal && d.caudal.modo === 'real') errors.push(`${d.name}: modo Real requiere un caudalímetro`);
    }
  }

  if (cfg.comms !== undefined) {
    if (!Array.isArray(cfg.comms)) errors.push('comms debe ser un array');
    else {
      cfg.comms.forEach((c, i) => validateComm(c, i, errors));
      const cn = cfg.comms.map(c => c && c.name).filter(Boolean);
      const cd = cn.filter((n, i) => cn.indexOf(n) !== i);
      if (cd.length) errors.push(`nombres de equipos de comunicacion duplicados: ${[...new Set(cd)].join(', ')}`);
    }
  }

  for (const [key, kind] of [['reconectadores', 'reco'], ['reguladores', 'reg']]) {
    if (cfg[key] === undefined) continue;
    if (!Array.isArray(cfg[key])) errors.push(`${key} debe ser un array`);
    else cfg[key].forEach((c, i) => validateCampo(c, i, kind, errors));
  }
  // un nombre identifica un solo equipo entre variadores, reconectadores y reguladores
  const todos = ['devices', 'reconectadores', 'reguladores'].flatMap(k => (Array.isArray(cfg[k]) ? cfg[k] : []).map(e => e && e.name).filter(Boolean));
  for (const n of new Set(todos.filter((x, i) => todos.indexOf(x) !== i))) errors.push(`nombre repetido entre variadores, reconectadores y reguladores: ${n}`);

  // enlace: nombra un equipo de comunicacion (en comms[]) por el que llega el equipo
  const commNames = new Set(Array.isArray(cfg.comms) ? cfg.comms.map(c => c && c.name) : []);
  for (const key of ['devices', 'gateways', 'meters', 'flowmeters', 'comms', 'reconectadores', 'reguladores']) {
    if (!Array.isArray(cfg[key])) continue;
    for (const e of cfg[key]) {
      if (!e || typeof e !== 'object' || e.enlace === undefined) continue;
      if (typeof e.enlace !== 'string') errors.push(`${e.name}: enlace invalido`);
      else if (key === 'devices' && e.gateway) errors.push(`${e.name}: el enlace va en el gateway`);
      else if (!commNames.has(e.enlace) || (key === 'comms' && e.enlace === e.name)) errors.push(`${e.name}: el enlace ${e.enlace} no existe`);
    }
  }

  if (cfg.pollIntervalMs !== undefined && (!Number.isInteger(cfg.pollIntervalMs) || cfg.pollIntervalMs < 500)) {
    errors.push('pollIntervalMs debe ser entero >= 500');
  }
  if (cfg.influxWriteIntervalMs !== undefined && (!Number.isInteger(cfg.influxWriteIntervalMs) || cfg.influxWriteIntervalMs < 1000)) {
    errors.push('influxWriteIntervalMs debe ser entero >= 1000');
  }

  for (const key of ['mqtt', 'influxdb', 'alarmSetpoints', 'gaugeZones', 'meterNames']) {
    if (cfg[key] !== undefined && (cfg[key] === null || typeof cfg[key] !== 'object' || Array.isArray(cfg[key]))) {
      errors.push(`${key} debe ser un objeto`);
    }
  }

  return errors;
}

module.exports = { validateConfig, validateDevice, validateGateway, validateFlowmeter, validateComm, validateCampo, CAMPO_KEYS };
