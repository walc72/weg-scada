# Unifilar A — Reconectadores y reguladores — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leer por Modbus TCP reconectadores (PMSet U) y reguladores (Toshiba TSEA / Tapelectro vía
Moxa) con un mapa de puntos editable, y mostrarlos en Dashboard, Alarmas, Tendencias, Reportes y
Excel, bajo el módulo de licencia `unifilar`.

**Architecture:** El poller suma `src/points.js` (agrupado en bloques, decodificación, alarmas y
línea de Influx) y lee las listas `reconectadores[]` / `reguladores[]` dentro de los grupos
`ip:port` existentes; publica `weg/reco/<n>` y `weg/reg/<n>` y escribe `campo_data`. La API valida
listas y mapas, sirve los mapas por defecto (`GET /api/modelos`), mete los equipos en
`deviceStates` para alarmas y avisos, y agrega series y resumen. El portal suma tarjetas,
secciones de configuración con editor de mapa, pestañas de Tendencias y tablas de Reportes.

**Tech Stack:** Node 20 (`node --test`), `modbus-serial` ^8 (ya instalado; `ServerTCP` para el
esclavo falso), InfluxDB 2 (Flux), pdfkit, React/Vite/TS/Zustand, MQTT retenido.

**Spec:** `docs/superpowers/specs/2026-10-28-unifilar-equipos-design.md`

## Global Constraints

- Módulo de licencia: `unifilar`. Sin él: no se lee, no se muestran secciones/tarjetas/pestañas,
  `generateSeries` no trae `campo`, `generateSummary` no trae los bloques.
- `tier('reco') = tier('reg') = 'B'`. Orden en nivel B: devices, meters, reconectadores, reguladores.
- `modelo`: reconectadores ∈ {`pmsetu`, `otro`}; reguladores ∈ {`tsea`, `tapelectro`, `otro`}. La
  clave en `modelos.js` es el modelo, salvo `otro` → `otro-reco` / `otro-reg`.
- Defaults: `port` 502, `unitId` 1, `tapMin` −16, `tapMax` 16, `orden` `BE`, `escala` 1.
- Punto: `fc` ∈ {3, 4}; `addr` 0–65535 **base 0**; `tipo` ∈ {`u16`,`s16`,`u32`,`s32`,`f32`};
  `bit` 0–15 / `valor` entero (excluyentes, solo `u16`/`s16`); `texto` 1–80 obligatorio en `alarma`.
- Keys reco: `estado ia ib ic va vb vc bloqueo disparo operaciones`; reg: `tap v i vConsigna auto
  remoto`; ambos: `alarma` (repetible). Mapa 1–64 puntos.
- Bloques: ≤ 125 registros, hueco ≤ 8 registros, separados por `fc`.
- `online:false` solo si fallan **todos** los bloques; offline = 3 fallas seguidas
  (`commDecision`), reintento con `offlineRetry`.
- Tópicos retenidos `weg/reco/<sanitizeTopic(name)>`, `weg/reg/<sanitizeTopic(name)>`; payload
  `{ name, kind, modelo, online, ts, valores, alarmas, sinEnlace? }`.
- Alarmas: `DISPARO: "Disparo"`, `BLOQUEO: "Bloqueado"`, `ALARMA_<i>: texto` (i = índice en `mapa`).
- Influx: medición `campo_data`, tags `name`, `kind`; número finito → float, sí/no → `0i`/`1i`,
  `null` no se escribe.
- Mensajes exactos: `nombre repetido entre variadores, reconectadores y reguladores: <n>`;
  `La licencia no incluye el módulo unifilar`; mapas por defecto con descripción
  «direcciones a verificar en puesta en marcha».
- `license.js` de poller y weg-api byte a byte idénticos (`license-copy.test.js`).
- Textos del portal en español rioplatense; valor `null` se muestra «—».
- Tests: `bash <scratchpad>/nodetest.sh <paquete> [test/archivo]`; frontend:
  `bash <scratchpad>/frontbuild.sh "<texto>"` (scratchpad de la sesión; Docker en WSL).

## Review Focus

- **Reconectador con disparo activo que se queda sin comunicación:** el payload offline trae
  `alarmas: {}`; no debe mandarse un aviso «Resuelta» del disparo (sí el OFFLINE) → Task 6, test
  `offline no resuelve alarmas`.
- **Dos puntos en el mismo registro** (`auto` bit 0 y `remoto` bit 1 en addr 4; dos `alarma` en
  addr 5): un solo pedido Modbus y los dos valores bien → Task 2, test `blocks: mismo registro`.
- **Varios reguladores detrás del mismo Moxa y uno no contesta:** el que no contesta pasa a
  offline, los otros siguen online y la conexión no se cierra → Task 2, test `readPoints por
  unitId` (poll falso que devuelve `null` solo para un unitId).
- **`/api/status` cuenta los equipos nuevos como variadores:** `getLiveStatus` debe excluir los
  estados con `kind` → Task 6, test `getLiveStatus sin reco/reg`.
- **La licencia pierde `unifilar` con equipos cargados:** se publican `license:'excedido'`, no
  escriben Influx y no generan alarmas → Task 3, test `excededTopics reco/reg`.

---

### Task 1: Licencia — reconectadores y reguladores en nivel B

**Files:**
- Modify: `nodered/weg-api/src/services/license.js` (`tier`, `usage`, `allowed`, `check`)
- Copy byte a byte a: `nodered/weg-modbus-poller/src/license.js`
- Test: `nodered/weg-api/test/license.test.js`

**Interfaces:**
- Produces: `tier('reco') === 'B'`, `tier('reg') === 'B'`; `usage(config, lic)` suma
  `reconectadores` y `reguladores` habilitados (con `lic`, solo con `unifilar`);
  `allowed(config, lic)` devuelve además `reconectadores: Set<string>` y `reguladores: Set<string>`
  (vacíos sin el módulo), asignados después de `meters`; `check()` agrega
  `'La licencia no incluye el módulo unifilar'` con la misma regla incremental que caudales
  (cuenta reconectadores + reguladores habilitados).

- [ ] **Step 1: Tests que fallan**

```js
test('reco/reg cuentan como nivel B después de meters, solo con unifilar', () => {
  const cfg = { devices: [{ name: 'P1' }], meters: [{ name: 'M1' }],
    reconectadores: [{ name: 'R1' }, { name: 'R2', enabled: false }], reguladores: [{ name: 'G1' }] };
  const lic = { modulos: ['medidores', 'unifilar'], limites: { B: 3 } };
  assert.deepEqual(usage(cfg, lic), { A: 0, B: 4, C: 0 });
  const ok = allowed(cfg, lic);
  assert.deepEqual([...ok.reconectadores], ['R1']);
  assert.deepEqual([...ok.reguladores], []);
  assert.deepEqual([...allowed(cfg, { modulos: ['medidores'], limites: { B: 9 } }).reconectadores], []);
  assert.equal(usage(cfg, { modulos: ['medidores'] }).B, 2);
});
test('check: reco/reg sin el módulo unifilar', () => {
  const cfg = { devices: [], reguladores: [{ name: 'G1' }] };
  assert.ok(check(cfg, { modulos: [], limites: { B: 5 } }).includes('La licencia no incluye el módulo unifilar'));
  assert.deepEqual(check(cfg, { modulos: ['unifilar'], limites: { B: 5 } }), []);
});
```

- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/license.test.js` → FAIL (`ok.reconectadores` undefined).
- [ ] **Step 3:** Implementar en weg-api y copiar el archivo al poller (`cp`).
- [ ] **Step 4:** `nodetest.sh nodered/weg-api` y `nodetest.sh nodered/weg-modbus-poller test/license-copy.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(license): reconectadores y reguladores en nivel B (modulo unifilar)`.

---

### Task 2: Poller — `src/points.js` y `fc` en `connections.poll`

**Files:**
- Create: `nodered/weg-modbus-poller/src/points.js`
- Modify: `nodered/weg-modbus-poller/src/connections.js` (`poll`)
- Test: `nodered/weg-modbus-poller/test/points.test.js`

**Interfaces:**
- Produces:
  - `connections.poll(ip, port, unitId, startAddr, count, fc = 3)`: `fc === 4` →
    `readInputRegisters`, si no `readHoldingRegisters`. Llamadas existentes sin cambios.
  - `blocks(mapa) → Array<{ fc, start, count, idx: number[] }>` (`idx` = índices en `mapa`).
  - `decode(punto, regs, start) → number | boolean | null`.
  - `async readPoints(item, poll) → { online: boolean, vals: Array<number|boolean|null> }`
    (`vals[i]` alineado con `item.mapa`; llama `poll(item.ip, item.port ?? 502, item.unitId ?? 1, start, count, fc)`).
  - `valoresDe(mapa, vals) → { [key]: value }` (sin las `alarma`).
  - `alarmasDe(kind, mapa, vals) → { [TIPO]: texto }` (`kind` ∈ `reco`|`reg`).
  - `campoLine(st, tsNs) → string | null` (línea `campo_data`; `null` si no hay fields).

- [ ] **Step 1: Tests que fallan** en `points.test.js`:
  - `decode`: `u16` 65535; `s16` 0xFFFF → −1; `u32` BE `[0x0001,0x0000]` → 65536 y LE `[0x0000,0x0001]` → 65536;
    `s32` −2; `f32` 850.5 BE y LE; `f32` NaN → `null`; `escala` 0.1 sobre `u16` 2305 → 230.5
    (comparar con tolerancia); `bit: 1` sobre 0b10 → `true`, sobre 0b01 → `false`; `valor: 1` → `raw === 1`;
    registro fuera de `regs` → `null`.
  - `blocks`: `[{addr:0},{addr:1},{addr:5,tipo:'f32'}]` → un bloque `{fc:3,start:0,count:7}`;
    hueco de 9 → dos bloques; hueco de 8 → uno; 130 registros seguidos → corta en 125;
    `fc` 3 y 4 en la misma dirección → dos bloques; **`blocks: mismo registro`**: `auto` bit 0 y
    `remoto` bit 1 en addr 4 → un bloque `count:1` con `idx` de los dos.
  - `readPoints`: poll falso con dos bloques, uno `null` → `online:true` y `null` solo en los
    puntos de ese bloque; todos `null` → `online:false`; **`readPoints por unitId`**: poll falso
    que devuelve `null` solo para `unitId 4` → regulador unit 4 `online:false`, unit 3 `online:true`.
  - `alarmasDe('reco', …)` con `disparo` y `bloqueo` verdaderos y una `alarma` en índice 5 →
    `{ DISPARO: 'Disparo', BLOQUEO: 'Bloqueado', ALARMA_5: '<texto>' }`; `alarma` falsa o `null` no aparece;
    en `reg`, `disparo`/`bloqueo` no aplican.
  - `campoLine({ name: 'Reco, 1', kind: 'reco', valores: { ia: 112.4, estado: true, ib: null } }, 1n)` →
    `'campo_data,name=Reco\\,\\ 1,kind=reco ia=112.4,estado=1i 1'`; sin fields válidos → `null`.
  - **Esclavo falso de punta a punta:** `ServerTCP` de `modbus-serial` en `127.0.0.1` puerto libre con
    `getHoldingRegister` / `getInputRegister`; `readPoints` con el `connections.poll` real lee un
    `f32` holding y un `u16` input.
- [ ] **Step 2:** `nodetest.sh nodered/weg-modbus-poller test/points.test.js` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar. Algoritmo de `blocks`: por cada `fc`, ordenar índices por `addr`;
  tamaño del punto = 2 si `tipo` es de 32 bits, si no 1; abrir bloque nuevo cuando
  `addr − finActual > 8` o `max(fin, addr+tamaño) − start > 125`. `campoLine`: tag `name` escapado
  como `meter_data` (espacio, coma, `=`); fields en el orden de `valores`; `true/false` → `1i/0i`;
  número finito → tal cual.
- [ ] **Step 4:** `nodetest.sh nodered/weg-modbus-poller` → PASS (todo el paquete).
- [ ] **Step 5:** Commit `feat(poller): mapa de puntos generico (points.js) y lectura fc 4`.

---

### Task 3: Poller — ciclo, MQTT, enlaces, retenidos e Influx

**Files:**
- Modify: `nodered/weg-modbus-poller/src/links.js` (`LISTS`)
- Modify: `nodered/weg-modbus-poller/src/retained.js` (`topicsToClear`, `excededTopics`, nuevo `CAMPO`)
- Modify: `nodered/weg-modbus-poller/src/index.js` (`getGroups`, `runGroup`, `pollCampo`, `syncExceded`, `republishDependents`, `writeInflux`, recarga de config)
- Test: `nodered/weg-modbus-poller/test/links.test.js`, `test/retained.test.js`

**Interfaces:**
- Consumes: Task 1 `allowed().reconectadores/.reguladores`; Task 2 `readPoints`, `valoresDe`, `alarmasDe`, `campoLine`.
- Produces:
  - `retained.CAMPO = { reco: { list: 'reconectadores', prefix: 'weg/reco' }, reg: { list: 'reguladores', prefix: 'weg/reg' } }`.
  - `topicsToClear` incluye `weg/reco|reg/<n>` de equipos borrados o deshabilitados;
    `excededTopics` incluye `{ topic, name, kind: 'reco'|'reg' }` de habilitados fuera de `allowed`.
  - `links.LISTS` suma `reco: 'reconectadores'`, `reg: 'reguladores'` (sin herencia de gateway).
  - En `index.js`: `campoStates: Map<name, payload>`, `campoFailCounters`, `excededCampo: Set`;
    grupos con `campo: Array<{ item, kind }>` leídos después de `flows`.

- [ ] **Step 1: Tests que fallan:**
  - `links.test.js`: `linkOf(reco, 'reco', cfg)` devuelve su `enlace`; `dependents('Radio 1', cfg)`
    incluye `{ kind: 'reg', item }`; un regulador deshabilitado no aparece.
  - `retained.test.js`: borrar o deshabilitar un reconectador → `weg/reco/Reco_1` en `topicsToClear`;
    **`excededTopics reco/reg`**: con `allowed.reguladores` vacío, un regulador habilitado sale con
    `kind: 'reg'` y tópico `weg/reg/<n>`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-modbus-poller test/links.test.js test/retained.test.js` → FAIL.
- [ ] **Step 3:** Implementar `links.js` y `retained.js`.
- [ ] **Step 4:** En `index.js`, `pollCampo(item, kind)` con la forma de `pollFlowmeter`: clave
  `` `${kind} ${item.name}` `` para `offlineRetry`/`logComm`; `readPoints(item, connections.poll)`;
  falla → `campoFailCounters`+1; `commDecision`; `hold` no publica; payload online
  `{ name, kind, modelo, online:true, ts, valores: valoresDe(...), alarmas: alarmasDe(...) }`,
  offline `{ name, kind, modelo, online:false, ts, valores:{}, alarmas:{} }`, ambos por `link(..., kind)`;
  no pisar si quedó en `excededCampo`. `getGroups` agrega reconectadores y reguladores habilitados y
  permitidos a `add(ip:port).campo`; `runGroup` los lee después de `flows`. `syncExceded`:
  `reco`/`reg` → `[excededCampo, campoStates]`. `republishDependents`: `reco`/`reg` →
  `[campoStates, excededCampo, n => CAMPO[kind].prefix + '/' + sanitizeTopic(n)]`. `writeInflux`:
  por cada `campoStates` online, no excedido y con `campoFailCounters` 0 → `campoLine(st, ts)` si no es `null`.
  Recarga de config: `activeIPs` incluye las dos listas.
- [ ] **Step 5:** `nodetest.sh nodered/weg-modbus-poller` → PASS; `node --check src/index.js` en el contenedor sin error.
- [ ] **Step 6:** Commit `feat(poller): lectura de reconectadores y reguladores (weg/reco, weg/reg, campo_data)`.

---

### Task 4: API — validación de listas y mapas

**Files:**
- Modify: `nodered/weg-api/src/services/validate.js`
- Test: `nodered/weg-api/test/campoConfig.test.js` (nuevo)

**Interfaces:**
- Produces: `CAMPO_KEYS = { reco: [...], reg: [...] }` y `validateCampo(item, i, kind, errors)`
  exportados; `validateConfig` valida `reconectadores[]` (tag `reconectadores[i]`) y `reguladores[]`
  (tag `reguladores[i]`); `enlace` se chequea también en esas dos listas.

- [ ] **Step 1: Tests que fallan** (fábrica `reco(o)` / `reg(o)` válidos, sobre `plant()` como en `commConfig.test.js`):
  - válidos → `[]` (incluye `enlace` a un comm existente y dos `alarma` en el mismo addr).
  - cada error da al menos un mensaje con el formato `<tag> (<nombre>): mapa[<i>].<campo> …`:
    `modelo: 'tsea'` en reconectador; `port: 0`; `unitId: 256`; `tapMin: 5, tapMax: 5`; `tapMin: 1.5`;
    mapa vacío; 65 puntos; `key: 'tap'` en reconectador; `fc: 1`; `addr: 65536`; `tipo: 'u8'`;
    `orden: 'XX'`; `escala: 'a'`; `bit: 16`; `bit` y `valor` juntos; `bit` con `f32`;
    `alarma` sin `bit`/`valor`; `alarma` sin `texto`; `texto` de 81; `key` repetida (no `alarma`).
  - nombre igual a un variador → incluye `'nombre repetido entre variadores, reconectadores y reguladores: <n>'`;
    igual entre un reconectador y un regulador → mismo mensaje.
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/campoConfig.test.js` → FAIL.
- [ ] **Step 3:** Implementar (`ip` con `isHost`, `port`/`unitId` con `isPort`/`isUnitId`, como medidores).
- [ ] **Step 4:** `nodetest.sh nodered/weg-api` → PASS.
- [ ] **Step 5:** Commit `feat(api): validacion de reconectadores, reguladores y mapas de puntos`.

---

### Task 5: API — mapas por defecto y `GET /api/modelos`

**Files:**
- Create: `nodered/weg-api/src/services/modelos.js`
- Modify: `nodered/weg-api/src/server.js` (montar `/api/modelos` con `requireAdmin` y `requireModule(licenseState.get, 'unifilar')`)
- Test: `nodered/weg-api/test/modelos.test.js`

**Interfaces:**
- Consumes: Task 4 `validateCampo`.
- Produces: `MODELOS: { [id]: { kind: 'reco'|'reg', nombre: string, descripcion: string, mapa: Punto[] } }`
  con ids `pmsetu`, `tsea`, `tapelectro`, `otro-reco`, `otro-reg`; `modeloId(kind, modelo)`
  (`otro` → `otro-<kind>`); `GET /api/modelos` → `MODELOS` tal cual.

- [ ] **Step 1: Tests que fallan:** cada mapa pasa `validateCampo` con su `kind` (sin errores);
  `tsea` y `tapelectro` tienen exactamente la tabla de la spec §5.6 (addr 0 `tap` `s16`; 1 `v`, 2 `i`,
  3 `vConsigna` escala 0.1; 4 `auto` bit 0 y `remoto` bit 1; 5 `alarma` bit 0 «Tap en límite» y bit 1
  «Falla de control»); todas las `descripcion` contienen «direcciones a verificar en puesta en marcha»;
  `modeloId('reg', 'otro') === 'otro-reg'`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/modelos.test.js` → FAIL.
- [ ] **Step 3:** PMSet U: buscar el mapa Modbus en el manual público (máximo ~15 min de búsqueda
  web). Si aparece, usar sus direcciones y anotar la fuente en un comentario; si no, las keys de
  reconectador en addr 0, 1, 2… (`estado` u16 bit 0, `ia..vc` `f32` en pares, `bloqueo`/`disparo`
  bits, `operaciones` `u32`). `otro-reco`: `[{ key:'estado', fc:3, addr:0, tipo:'u16', bit:0 }]`;
  `otro-reg`: `[{ key:'tap', fc:3, addr:0, tipo:'s16' }]`.
- [ ] **Step 4:** `nodetest.sh nodered/weg-api` → PASS.
- [ ] **Step 5:** Commit `feat(api): mapas por defecto de reconectadores y reguladores`.

---

### Task 6: API — estado en vivo, historial de alarmas y avisos

**Files:**
- Modify: `nodered/weg-api/src/services/config.js` (`connectMQTT`, `getLiveStatus`)
- Modify: `nodered/weg-api/src/services/alarmLog.js` (`activeAlarms`)
- Modify: `nodered/weg-api/src/services/alerts.js` (`evaluate`)
- Test: `nodered/weg-api/test/alarmLog.test.js`, `test/alertsCampo.test.js` (nuevo), `test/liveStatus.test.js` (nuevo)

**Interfaces:**
- Produces: `deviceStates` recibe `weg/reco/+` y `weg/reg/+`; `getLiveStatus()` ignora estados con
  `kind`; `activeAlarms(d)` online suma `d.alarmas`; `evaluate()` avisa claves nuevas de `d.alarmas`
  (`type` = clave, `text` = texto, mismo cooldown) y `cleared` con `'Resuelta'` al desaparecer.

- [ ] **Step 1: Tests que fallan:**
  - `alarmLog`: `activeAlarms({ online:true, kind:'reco', alarmas:{ DISPARO:'Disparo' } })` →
    `{ DISPARO:'Disparo' }`; offline → solo `SIN_COMUNICACION`; `step` produce `start` y luego `end` de `DISPARO`.
  - `alertsCampo` (como `alertsLicense.test.js`, capturando `console.log` de `notify`): aparece
    `ALARMA_5` → un aviso con `type 'ALARMA_5'`; desaparece → un `clear` `'Resuelta'`;
    **`offline no resuelve alarmas`**: con `DISPARO` activo pasa a `online:false, alarmas:{}` → aviso
    `OFFLINE` y ningún `Resuelta` de `DISPARO`; al volver online sin `DISPARO` → recién ahí `Resuelta`.
  - **`getLiveStatus sin reco/reg`**: con un variador y un `kind:'reco'` en `deviceStates` → `total: 1`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/alarmLog.test.js test/alertsCampo.test.js test/liveStatus.test.js` → FAIL.
- [ ] **Step 3:** Implementar. En `evaluate`, `prev.alarmas` (array de claves) solo se actualiza con el equipo online.
- [ ] **Step 4:** `nodetest.sh nodered/weg-api` → PASS.
- [ ] **Step 5:** Commit `feat(api): alarmas y avisos de reconectadores y reguladores`.

---

### Task 7: Histórico — series de Tendencias y réplica

**Files:**
- Modify: `nodered/weg-api/src/services/reports.js` (`campoSeries`, `generateSeries`)
- Modify: `nodered/weg-api/src/routes/replica.js` (`MEASUREMENTS`)
- Modify: `nodered/weg-replica/src/live.js` (suscripción y `PRUNABLE`)
- Test: `nodered/weg-api/test/campoSeries.test.js` (nuevo, Influx falso como `withFakeInflux` de `flowVolume.test.js`), `test/replica.test.js`, `nodered/weg-replica/test/live.test.js`

**Interfaces:**
- Produces: `campoSeries(start, stop, windowSec, bucket) → Promise<Array<{ _time, name, kind, ...fields }>>`;
  `generateSeries` devuelve `campo` solo con `unifilar`; `MEASUREMENTS` incluye `campo_data`;
  réplica suscribe `weg/reco/+` y `weg/reg/+`, `PRUNABLE = /^weg\/(drives|meters|flow|comm|reco|reg)\//`.

- [ ] **Step 1: Tests que fallan:** sin el módulo, `generateSeries` no tiene `campo` y ningún body
  de consulta menciona `campo_data`; con el módulo, una consulta con `_field == "tap"` y `fn: max`,
  otra con `_field != "tap"` y `fn: mean`, y `campo` une las filas de las dos por `_time|name`
  (respuesta CSV falsa con una fila de cada una → una fila con `tap` e `ia`); `replica.test.js`:
  la consulta de exportación incluye `campo_data`; `live.test.js`: un retenido local `weg/reco/X`
  que planta no manda se borra al asentarse.
- [ ] **Step 2:** `nodetest.sh` de los tres archivos → FAIL.
- [ ] **Step 3:** Implementar `campoSeries` como `flowSeries` (dos consultas `aggregateWindow` con
  `createEmpty:false`, `pivot(rowKey:["_time","name","kind"], columnKey:["_field"])`, merge en JS).
- [ ] **Step 4:** `nodetest.sh nodered/weg-api` y `nodetest.sh nodered/weg-replica` → PASS.
- [ ] **Step 5:** Commit `feat: historico de reconectadores y reguladores (series y replica)`.

---

### Task 8: Reportes — resumen, PDF y Excel

**Files:**
- Modify: `nodered/weg-api/src/services/reports.js` (`campoSummary`, `windowsBy`, `changesBy`, `alarmStartsBy`, `generateSummary`, `toSummaryPDF`, `reportToXLSX`)
- Test: `nodered/weg-api/test/campoSummary.test.js` (nuevo)

**Interfaces:**
- Consumes: Task 7 (`campo_data` existe); `aggBy`, `firstLastBy`.
- Produces:
  - `windowsBy(start, stop, bucket) → { name: n }` (ventanas de 1 min con datos):
    `map(fn: (r) => ({ _time: r._time, _start: r._start, _stop: r._stop, name: r.name, _value: 1 }))
    |> group(columns: ["name"]) |> aggregateWindow(every: 1m, fn: count, createEmpty: false) |> count()`.
  - `changesBy(field, start, stop, bucket) → { name: n }`: `group(name) |> difference() |> filter(_value != 0) |> count()`.
  - `alarmStartsBy(start, stop, bucket) → { device: { type: n } }` de `alarm_events` con `status == "start"`.
  - `campoSummary({ config, mean, min, max, opsFL, windows, tapChanges, starts }) → { reconectadores?, reguladores? }` (pura).
    Fila reco: `{ name, modelo, horasDatos, ia:{avg,max}, ib, ic, vAvg, horasAbierto, horasBloqueado, operaciones, disparos }`;
    fila reg: `{ name, modelo, horasDatos, tapMin, tapMax, cambiosTap, v:{avg,min,max}, i:{avg,max}, pctAuto, alarmas }`.
  - `generateSummary` agrega `reconectadores` / `reguladores` solo con `unifilar` y equipos habilitados de ese tipo.

- [ ] **Step 1: Tests que fallan** de `campoSummary`: reco con `windows 1440` → `horasDatos 24`;
  `mean.estado 0.75` → `horasAbierto 6`; `mean.bloqueo 0.25` → `horasBloqueado 6`;
  `opsFL { first: 100, last: 104 }` → `operaciones 4` (falta `last` → `null`); `vAvg` = promedio de los
  mean de `va vb vc` presentes; `starts { 'Reco 1': { DISPARO: 2, BLOQUEO: 1 } }` → `disparos 2`;
  reg: `mean.auto 0.5` → `pctAuto 50`, `starts { ALARMA_5: 1, ALARMA_6: 2 }` → `alarmas 3`,
  `tapChanges 7` → `cambiosTap 7`; equipo de la config sin datos → fila con `horasDatos` y valores
  `null` y contadores 0; deshabilitado → sin fila; config sin reguladores → sin clave `reguladores`.
  Con Influx falso: `generateSummary` sin el módulo → sin claves y sin consultas a `campo_data`.
  `reportToXLSX(null, summary)` contiene hojas «Reconectadores» y «Reguladores» (buscar el nombre
  en el zip descomprimido con `zlib.inflateRawSync` o en `xl/workbook.xml`); `toSummaryPDF(summary)`
  resuelve un `Buffer` que empieza con `%PDF`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/campoSummary.test.js` → FAIL.
- [ ] **Step 3:** Implementar. Redondeo con `round`: 1 decimal en A, V y horas; `pctAuto` 0 decimales.
  Encabezados (PDF y XLSX):
  - Reconectadores: `Reconectador, Modelo, Horas con datos, Ia prom, Ia máx, Ib prom, Ib máx, Ic prom, Ic máx, V prom, Horas abierto, Horas bloqueado, Operaciones, Disparos`.
  - Reguladores: `Regulador, Modelo, Horas con datos, Tap mín, Tap máx, Cambios de tap, V prom, V mín, V máx, I prom, I máx, % automático, Alarmas`.
  PDF: secciones «Reconectadores» y «Reguladores» después de Medidores con `table()` y `val()` (null → «—»).
- [ ] **Step 4:** `nodetest.sh nodered/weg-api` → PASS.
- [ ] **Step 5:** Commit `feat(reportes): reconectadores y reguladores en resumen, PDF y Excel`.

---

### Task 9: Portal — tipos, store y tarjetas del Dashboard

**Files:**
- Modify: `frontend-react/src/types.ts` (`Punto`, `CampoConfig`, `CampoState`, `AppConfig.reconectadores/reguladores`)
- Modify: `frontend-react/src/store/drives.ts` (`campo: Map<string, CampoState>`, suscripción y borrado)
- Create: `frontend-react/src/components/RecoCard.tsx`, `frontend-react/src/components/RegCard.tsx`
- Modify: `frontend-react/src/views/Dashboard.tsx`

**Interfaces:**
- Produces: `interface Punto { key; fc: 3|4; addr; tipo; orden?; escala?; bit?; valor?; texto? }`;
  `interface CampoConfig { name; modelo; ip; port?; unitId?; enabled?; enlace?; tapMin?; tapMax?; mapa: Punto[] }`;
  `interface CampoState { name; kind: 'reco'|'reg'; modelo; online; ts; valores: Record<string, number|boolean|null>; alarmas: Record<string,string>; sinEnlace?; license? }`;
  `useDrivesStore(s => s.campo)`; `<RecoCard st cfg />`, `<RegCard st cfg />` (`st` puede faltar → «Esperando lectura»).

- [ ] **Step 1:** Tipos y store (suscribir `weg/reco/+`, `weg/reg/+`; payload vacío borra por nombre sanitizado como `weg/flow/`).
- [ ] **Step 2:** `RecoCard`: estado grande Cerrado (verde) / Abierto (gris) / Disparo (rojo si `alarmas.DISPARO`),
  distintivo «Bloqueado», I y V por fase, operaciones; `RegCard`: tap grande con barra `tapMin…tapMax`
  (−16/16 por defecto), V, I, consigna, Auto/Manual, Remoto/Local. Ambas: alarmas activas con texto,
  `SinEnlaceBadge`, «Fuera de licencia» con `license === 'excedido'`, «—» para `null`. Estilo de `PM8000Card`.
- [ ] **Step 3:** Dashboard: con `hasModule('unifilar')`, secciones «Reconectadores» y «Reguladores» debajo
  de medidores, solo con equipos habilitados en la config.
- [ ] **Step 4:** `frontbuild.sh "Esperando lectura"` → build OK y needle ≥ 1.
- [ ] **Step 5:** Commit `feat(portal): tarjetas de reconectadores y reguladores`.

---

### Task 10: Portal — Configuración con editor de mapa

**Files:**
- Create: `frontend-react/src/views/CampoSection.tsx` (`CampoSection({ kind })`), `frontend-react/src/views/MapaEditor.tsx`
- Modify: `frontend-react/src/views/Config.tsx` (dos `CampoSection` después de `FlowmetersSection`, con `unifilar`)
- Modify: `frontend-react/src/views/CommsSection.tsx` (referencias y renombre de `enlace`)

**Interfaces:**
- Consumes: Task 5 `GET /api/modelos`; Task 9 tipos y `campo` del store.
- Produces: `<MapaEditor kind mapa onChange live />` donde `live` = `CampoState | undefined`.

- [ ] **Step 1:** `CampoSection` con el patrón de `FlowmetersSection` (lista, formulario, guardar con
  `commit`): nombre, modelo, IP, puerto, unit ID, habilitado, `EnlaceSelect`, y en reguladores
  tap mín./máx. Al crear o cambiar modelo copia `MODELOS[modeloId(kind, modelo)].mapa`; cambiar el modelo
  con el mapa distinto del por defecto pide `confirm`. Alta deshabilitada con `useLicense(l => l.full('B'))`.
- [ ] **Step 2:** `MapaEditor`: tabla por punto (key con las de su `kind` + «alarma», fc, dirección con
  ayuda «base 0: 0 = 40001», tipo, orden, escala, bit, valor, texto), agregar/quitar filas,
  «Restaurar mapa por defecto» con `confirm`, columna «En vivo» (`live.valores[key]`, o «Activa» si
  `live.alarmas['ALARMA_' + i]`).
- [ ] **Step 3:** `CommsSection`: la baja se bloquea si un reconectador o regulador lo referencia; el renombre
  actualiza su `enlace`.
- [ ] **Step 4:** `frontbuild.sh "Restaurar mapa por defecto"` → build OK y needle ≥ 1.
- [ ] **Step 5:** Commit `feat(portal): configuracion de reconectadores y reguladores con editor de mapa`.

---

### Task 11: Portal — Tendencias y Reportes

**Files:**
- Create: `frontend-react/src/views/RecosTab.tsx`, `frontend-react/src/views/RegsTab.tsx`
- Modify: `frontend-react/src/views/Historicos.tsx` (pestañas y `campo` en la respuesta)
- Modify: `frontend-react/src/views/ReporteDiario.tsx` (interfaces y tablas)

**Interfaces:**
- Consumes: Task 7 `series.campo`; Task 8 `summary.reconectadores/reguladores`.

- [ ] **Step 1:** Historicos: con `unifilar` y equipos de ese tipo, pestañas «Reconectadores» y
  «Reguladores» con el patrón de «Caudales» (mismo rango y refresco); `campo: d.campo || []`.
- [ ] **Step 2:** `RecosTab`: selector de equipo, `TrendChart` de `ia ib ic` y una franja (div de
  segmentos) por ventana: bloqueado si `bloqueo ≥ 0.5`, si no cerrado si `estado ≥ 0.5`, si no abierto.
  `RegsTab`: selector, `TrendChart` de `tap` con `step`, y otro con `v` y `vConsigna`.
- [ ] **Step 3:** ReporteDiario: tablas «Reconectadores» y «Reguladores» con los encabezados de Task 8,
  solo si el resumen trae la clave; `fmtNum` para «—».
- [ ] **Step 4:** `frontbuild.sh "Cambios de tap"` → build OK y needle ≥ 1.
- [ ] **Step 5:** Commit `feat(portal): tendencias y reportes de reconectadores y reguladores`.

---

### Task 12: Integración (docker-in-docker) y PR

**Files:** ninguno del repo (scripts en el scratchpad).

- [ ] **Step 1:** Imagen `edge` de la rama e instalación limpia en dind (como Comunicaciones), con una
  licencia de prueba con `unifilar` y B suficiente que firma el usuario con `licencias.html`.
- [ ] **Step 2:** Esclavo Modbus falso (contenedor `node:20-alpine` con `ServerTCP` de `modbus-serial`)
  con unit 1 reconectador (mapa por defecto PMSet U) y unit 3 regulador (mapa TSEA) en el mismo puerto.
- [ ] **Step 3:** Alta desde el portal (navegador del panel) con mapa por defecto; tarjetas con valores
  en vivo; editar una dirección y ver el cambio en ~30 s en tarjeta y editor.
- [ ] **Step 4:** Poner `disparo` en 1 → alarma en Alarmas y entrada en el historial; volver a 0 → fin.
  A los ~5 min, Tendencias con datos en las dos pestañas y el resumen de Reportes con las dos tablas;
  descargar Excel y abrir las dos hojas.
- [ ] **Step 5:** Apagar el esclavo → offline a los 3 ciclos y, con un `comms` caído como enlace, «Sin enlace».
- [ ] **Step 6:** PR `feat/unifilar-equipos` → master; `gh pr checks` en verde justo antes de mergear.
  Tag `v1.8.0` lo crea el usuario; en planta, antes de cargar equipos, licencia nueva con B ≥ 24.
