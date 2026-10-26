# Módulo Comunicaciones — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Leer por SNMP radios Ubiquiti airMAX y routers Teltonika RUT, mostrarlos en una vista
Comunicaciones y marcar «Sin enlace · <enlace>» en los equipos de campo cuyo enlace cayó.

**Architecture:** El poller existente suma `src/snmp.js` (lectura SNMP cada 30 s, publica
`weg/comm/<nombre>`) y `src/links.js` (resuelve el enlace de cada equipo y agrega `sinEnlace`).
La API valida `comms[]` y `enlace`; `license.js` cuenta `comms` como nivel A con el módulo
`comunicaciones`. El portal suma la vista, el badge en las tarjetas y la sección de configuración.

**Tech Stack:** Node 20 (poller, weg-api, weg-replica; tests `node --test`), `net-snmp` (nueva
dependencia, solo en el poller), React/Vite/TS/Zustand (portal), MQTT retenido.

**Spec:** `docs/superpowers/specs/2026-10-26-comunicaciones-design.md`

## Global Constraints

- Módulo de licencia: `comunicaciones`. Sin él: no se lee SNMP, no hay menú, `enlace` se ignora.
- `comms[]` habilitados (`enabled !== false`) cuentan como **nivel A**, después de `flowmeters`.
- `tipo` ∈ {`airmax`, `rut`}; `community` por defecto `public`, 1–64 caracteres; SNMP v2c, puerto 161.
- Lectura cada **30 s**, timeout **3 s**, sin reintentos en el ciclo; **3** fallas seguidas = caído
  (`commDecision` de `scheduler.js`).
- Tópico MQTT retenido `weg/comm/<sanitizeTopic(name)>`, payload
  `{ name, tipo, online, desde, signal, noise, quality, txMbps, rxMbps, remoto, operador, red, uptime, ts }`;
  campo no informado = `null`.
- `enlace` (opcional) en `gateways[]`, `devices[]` **sin** `gateway`, `meters[]`, `flowmeters[]`, `comms[]`.
  Los `devices[]` con `gateway` heredan el del gateway.
- Texto del estado: **«Sin enlace · <nombre>»**; alarma: `Sin enlace (<nombre>)`.
- Barra de señal: buena ≥ −65 dBm, regular −65 a −75, débil < −75.
- `license.js` del poller y de weg-api byte a byte idénticos (lo controla `license-copy.test.js`).
- Textos del portal en español rioplatense, como el resto.
- Tests de Node: `bash <scratchpad>/nodetest.sh <paquete> [test/archivo]` (Docker en WSL).
  Frontend: `bash <scratchpad>/frontbuild.sh "<texto a buscar en el bundle>"`.

## Review Focus

- **El enlace cae cuando el equipo ya estaba OFFLINE** (o el equipo cae ~6 s y el enlace se
  declara caído recién a los 90 s): la tarjeta debe pasar a «Sin enlace» al declararse caído el
  enlace, sin esperar al próximo reintento del equipo → Task 4 republica a los dependientes en cada
  cambio de estado de un enlace (test `republishDependents`).
- **El enlace vuelve pero el equipo sigue caído**: la tarjeta debe volver a «OFFLINE» (sin
  `sinEnlace`) → mismo test, caso de vuelta.
- **Equipo SNMP que responde pero sin los OID esperados** (otro firmware): debe quedar en línea con
  campos `null`, sin excepción → Task 3, test `noSuchObject → null`.
- **Se borra o deshabilita un equipo de comunicación al que otros apuntan**: la API rechaza el
  borrado si alguien lo referencia; si el poller recibe un `enlace` desconocido, no agrega
  `sinEnlace` ni falla → Task 2 (validación) y Task 4 (`linkOf` con nombre inexistente).
- **La licencia pierde el módulo con equipos cargados**: se dejan de leer, se limpian sus tópicos y
  ningún equipo de campo recibe `sinEnlace` → Task 1 (`allowed().comms` vacío) y Task 4.

---

### Task 1: Licencia — `comms` en nivel A

**Files:**
- Modify: `nodered/weg-api/src/services/license.js` (`tier`, `usage`, `allowed`, `check`)
- Copy byte a byte a: `nodered/weg-modbus-poller/src/license.js`
- Test: `nodered/weg-api/test/license.test.js`

**Interfaces:**
- Produces: `tier('comm') === 'A'`; `usage(config, lic)` suma `comms` habilitados (con `lic`, solo
  con el módulo `comunicaciones`); `allowed(config, lic)` devuelve además `comms: Set<string>`
  (vacío sin el módulo), asignados después de `flowmeters`; `check()` agrega
  `'La licencia no incluye el módulo comunicaciones'` con la misma regla que caudales.

- [ ] **Step 1: Tests que fallan** en `license.test.js`:

```js
test('comms cuentan como nivel A después de flowmeters, solo con el módulo', () => {
  const cfg = { devices: [], flowmeters: [{ name: 'F1', bombas: ['x'] }],
    comms: [{ name: 'R1' }, { name: 'R2' }, { name: 'R3', enabled: false }] };
  const lic = { modulos: ['caudales', 'comunicaciones'], limites: { A: 2 } };
  assert.deepEqual(usage(cfg, lic), { A: 3, B: 0, C: 0 });
  const ok = allowed(cfg, lic);
  assert.deepEqual([...ok.flowmeters], ['F1']);
  assert.deepEqual([...ok.comms], ['R1']);
  assert.deepEqual([...allowed(cfg, { modulos: ['caudales'], limites: { A: 9 } }).comms], []);
  assert.equal(usage(cfg, { modulos: ['caudales'] }).A, 1);
});
test('check: comms sin el módulo comunicaciones', () => {
  const cfg = { devices: [], comms: [{ name: 'R1' }] };
  assert.ok(check(cfg, { modulos: [], limites: { A: 5 } }).includes('La licencia no incluye el módulo comunicaciones'));
  assert.deepEqual(check(cfg, { modulos: ['comunicaciones'], limites: { A: 5 } }), []);
});
```

- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/license.test.js` → FAIL (`ok.comms` undefined).
- [ ] **Step 3:** Implementar en `license.js` de weg-api y copiar el archivo al poller.
- [ ] **Step 4:** `nodetest.sh nodered/weg-api test/` y `nodetest.sh nodered/weg-modbus-poller test/license-copy.test.js` → PASS.
- [ ] **Step 5:** Commit `feat(license): equipos de comunicacion en nivel A`.

---

### Task 2: API — validación de `comms` y `enlace`; texto de alarma

**Files:**
- Modify: `nodered/weg-api/src/services/validate.js` (nuevo `validateComm`, chequeo de `enlace`)
- Modify: `nodered/weg-api/src/services/alerts.js:78-80` (texto OFFLINE)
- Test: `nodered/weg-api/test/commConfig.test.js` (nuevo), `nodered/weg-api/test/alertsLicense.test.js`

**Interfaces:**
- Produces: `validateComm(c, i, errors)` exportado; `validateConfig(cfg)` valida `cfg.comms` y todos
  los `enlace`.

- [ ] **Step 1: Tests que fallan** en `commConfig.test.js`, reusando el `plant()` de
  `flowConfig.test.js` (copiarlo):

```js
const comm = (o = {}) => ({ name: 'Radio 1', tipo: 'airmax', ip: '192.168.10.20', community: 'public', enabled: true, ...o });
test('comms válidos y enlace en gateway, meter y comm', () => {
  const c = { ...plant(), comms: [comm(), comm({ name: 'Router', tipo: 'rut', ip: '192.168.10.1' })] };
  c.gateways = [{ name: 'ADAM', ip: '192.168.10.70', port: 502, kind: 'plc', enlace: 'Radio 1' }];
  c.meters[0].enlace = 'Radio 1';
  c.comms[0].enlace = 'Router';
  assert.deepEqual(validateConfig(c), []);
});
test('comms inválidos', () => {
  for (const bad of [{ tipo: 'mikrotik' }, { ip: '' }, { community: '' }, { community: 'x'.repeat(65) }, { name: '' }]) {
    assert.ok(validateConfig({ ...plant(), comms: [comm(bad)] }).length, JSON.stringify(bad));
  }
  assert.ok(validateConfig({ ...plant(), comms: [comm(), comm()] }).some(e => e.includes('duplicad')));
});
test('enlace a un comm inexistente o a sí mismo', () => {
  const c = { ...plant(), comms: [comm({ enlace: 'Radio 1' })] };
  assert.ok(validateConfig(c).length);
  const d = { ...plant(), comms: [comm()] }; d.meters[0].enlace = 'No existe';
  assert.ok(validateConfig(d).some(e => e.includes('No existe')));
});
test('variador con gateway no lleva enlace propio', () => {
  const c = { ...plant(), comms: [comm()] }; c.devices[0].enlace = 'Radio 1';
  assert.ok(validateConfig(c).length);
});
```

  En `alertsLicense.test.js`: un equipo que pasa de online a `{ online: false, sinEnlace: 'Radio 1' }`
  genera la alarma OFFLINE con texto `Sin enlace (Radio 1)`.

- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/commConfig.test.js` → FAIL.
- [ ] **Step 3:** Implementar. `validateComm`: `isNonEmptyString(name)`, `tipo` en
  `{'airmax','rut'}`, `isHost(ip)`, `community` undefined o `isNonEmptyString(community, 64)`,
  `enabled` boolean si está. Nombres duplicados → `nombres de equipos de comunicacion duplicados: …`.
  `enlace` (si está) debe ser texto y nombrar un `comms[].name`; en `comms[]` distinto del propio;
  en `devices[]` con `gateway` → error `<nombre>: el enlace va en el gateway`.
  Error de referencia: `<nombre>: el enlace <enlace> no existe`. En `alerts.js`, texto
  `` d.sinEnlace ? `Sin enlace (${d.sinEnlace})` : 'Comunicacion perdida' ``.
- [ ] **Step 4:** `nodetest.sh nodered/weg-api test/` → PASS.
- [ ] **Step 5:** Commit `feat(api): validar equipos de comunicacion y enlace`.

---

### Task 3: Poller — lectura SNMP (`src/snmp.js`)

**Files:**
- Modify: `nodered/weg-modbus-poller/package.json` (dependencia `net-snmp` ^3)
- Create: `nodered/weg-modbus-poller/src/snmp.js`
- Test: `nodered/weg-modbus-poller/test/snmp.test.js`

**Interfaces:**
- Produces:
  - `OIDS: { airmax: Field[], rut: Field[] }`, `Field = { key, oid, scale?, text? }`.
  - `mapVarbinds(tipo, varbinds) → { signal, noise, quality, txMbps, rxMbps, remoto, operador, red, uptime }`
    (todos presentes; ausente/`noSuchObject`/`noSuchInstance` → `null`).
  - `readComm(comm, { timeoutMs = 3000, port = 161 }) → Promise<object|null>` (`null` = sin respuesta).
  - `createCommTracker({ now = Date.now })` con `update(comm, reading) → { state, changed }`:
    `state` es el payload del tópico; usa `commDecision(fails, wasOnline)`; `'hold'` devuelve
    `changed: false` y el último estado; `desde` cambia solo al cambiar `online`.
    `forget(name)` borra su estado. `get(name)` devuelve el último estado o `undefined`.

- [ ] **Step 1: Tests que fallan** en `snmp.test.js`, con un agente de `net-snmp`
  (`snmp.createAgent({ port: <libre>, disableAuthorization: true }, …)`) que registra los OID de
  airMAX con valores: señal −62, ruido −95, CCQ 98, tx 300000, rx 270000, ssid `"PTP-Pozo3"`,
  sysUpTime 360000:
  - `readComm` contra el agente → `{ signal: -62, noise: -95, quality: 98, remoto: 'PTP-Pozo3', uptime: 3600, … }`
    con las escalas de la tabla (tx/rx según su unidad).
  - `noSuchObject → null`: agente sin el OID de CCQ → `quality: null`, resultado no nulo.
  - Puerto sin agente → `readComm` resuelve `null` en ≤ 3,5 s.
  - `createCommTracker`: `update(c, lectura)` → online; tres `update(c, null)` → la 1.ª y 2.ª
    `changed: false`, la 3.ª `online: false, changed: true, desde` = `now()` de esa llamada; una
    lectura buena después → `online: true, changed: true`.
  - `mapVarbinds('rut', …)` llena `signal`, `operador`, `red` y deja `quality`/`txMbps` en `null`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-modbus-poller test/snmp.test.js` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar. Tabla inicial (se verifica en puesta en marcha; un comentario lo dice):
  - airmax (UBNT-AirMAX-MIB, radio índice 1): `signal 1.3.6.1.4.1.41112.1.4.5.1.5.1`,
    `noise …5.1.8.1`, `quality (CCQ) …5.1.7.1`, `txMbps …5.1.9.1` y `rxMbps …5.1.10.1`
    (kbps → `scale: 0.001`), `remoto (SSID) …5.1.2.1` (`text`), `uptime 1.3.6.1.2.1.1.3.0`
    (centésimas → `scale: 0.01`).
  - rut (TELTONIKA-MIB, módem 1): `signal 1.3.6.1.4.1.48690.2.2.1.12.1`, `operador …2.2.1.13.1`
    (`text`), `red …2.2.1.16.1` (`text`), `uptime 1.3.6.1.2.1.1.3.0` (`scale: 0.01`).
  Una sesión por lectura (`snmp.createSession(ip, community, { port, timeout: timeoutMs, retries: 0, version: snmp.Version2c })`),
  cerrada siempre. Un error de request o timeout → `null`; un varbind con error → ese campo `null`.
- [ ] **Step 4:** `nodetest.sh nodered/weg-modbus-poller test/` → PASS.
- [ ] **Step 5:** Commit `feat(poller): lectura SNMP de airMAX y RUT`.

---

### Task 4: Poller — enlaces, `sinEnlace` y ciclo SNMP

**Files:**
- Create: `nodered/weg-modbus-poller/src/links.js`
- Modify: `nodered/weg-modbus-poller/src/retained.js` (`topicsToClear`, `excededTopics` con `comms`)
- Modify: `nodered/weg-modbus-poller/src/index.js` (ciclo de 30 s, publicar, `sinEnlace` en
  `pollGroup`, `pollMeter`, `pollFlowmeter`, republicar dependientes)
- Test: `nodered/weg-modbus-poller/test/links.test.js` (nuevo), `test/retained.test.js`

**Interfaces:**
- Consumes: `readComm`, `createCommTracker` (Task 3); `allowed().comms` (Task 1).
- Produces (`links.js`):
  - `linkOf(item, kind, config) → string|null`: `kind` ∈ `device|meter|flowmeter`; un device con
    `gateway` devuelve el `enlace` del gateway; un nombre que no está en `config.comms` → `null`.
  - `withLink(data, item, kind, config, commState) → data`: si `data.online === false` y
    `commState(linkOf(...))?.online === false`, devuelve `{ ...data, sinEnlace: <nombre> }`; si no,
    `data` sin la clave `sinEnlace`. `commState` es `(name) => state|undefined`.
  - `dependents(name, config) → [{ kind, item }]`: devices (directos o por gateway), meters y
    flowmeters cuyo `linkOf` es `name`.

- [ ] **Step 1: Tests que fallan** en `links.test.js`:
  - `linkOf`: device con gateway hereda; device directo usa el propio; enlace inexistente → `null`.
  - `withLink`: equipo offline + enlace caído → `sinEnlace: 'Radio 1'`; enlace en línea →
    sin la clave; equipo online con enlace caído → sin la clave; `commState` vacío → sin la clave.
  - `republishDependents`: `dependents('Radio 1', cfg)` devuelve los dos variadores del gateway y
    el medidor, no los de otro enlace.
  En `retained.test.js`: borrar o deshabilitar un comm limpia `weg/comm/<nombre>`; un comm
  habilitado no permitido sale en `excededTopics` con `kind: 'comm'`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-modbus-poller test/links.test.js` → FAIL.
- [ ] **Step 3:** Implementar `links.js` y `retained.js`. En `index.js`:
  - `commOn = license.hasModule(lic, 'comunicaciones')`; cada 30 s (`setInterval` propio, arrancado
    en el `once('connect')`), si `commOn`, `Promise.all` de `readComm` para los
    `allowed(config, lic).comms`, `tracker.update`, y si `changed` o es la primera vez publicar
    `weg/comm/<nombre>` retenido; los no permitidos y los quitados se `forget`.
  - Al cambiar `online` de un comm, para cada `dependents(name, config)` con estado guardado
    (`deviceStates`, `meterStates`, `flowStates`) y `online === false`, recalcular `withLink` y
    republicar su tópico retenido (mismo tópico y formato que ya usa cada función).
  - Antes de cada `mqttClient.publish` de variador, medidor y caudalímetro:
    `data = commOn ? withLink(data, item, kind, config, tracker.get) : data`.
  - Agregar `kind: 'comm'` al `byKind` de `syncExceded` (con un set `excededComms`).
- [ ] **Step 4:** `nodetest.sh nodered/weg-modbus-poller test/` → PASS; `node -e "require('./src/links')"` sin errores de sintaxis en `index.js` (`node --check src/index.js`).
- [ ] **Step 5:** Commit `feat(poller): sin enlace por equipo de comunicacion`.

---

### Task 5: Réplica — `weg/comm/+`

**Files:**
- Modify: `nodered/weg-replica/src/live.js:14,30` (`PRUNABLE` y `subscribe`)
- Test: `nodered/weg-replica/test/live.test.js`

- [ ] **Step 1: Test que falla**, copia del de `weg/flow/+` (líneas 85–110) para `weg/comm/+`:
  suscribe, retiene lo que llega de planta y poda `weg/comm/VIEJO`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-replica test/live.test.js` → FAIL.
- [ ] **Step 3:** `PRUNABLE = /^weg\/(drives|meters|flow|comm)\//` y `local.subscribe('weg/comm/+')`.
- [ ] **Step 4:** `nodetest.sh nodered/weg-replica test/` → PASS.
- [ ] **Step 5:** Commit `feat(replica): replicar equipos de comunicacion`.

---

### Task 6: Portal — tipos, store y badge «Sin enlace»

**Files:**
- Modify: `frontend-react/src/types.ts` (`CommConfig`, `CommState`, `enlace?`, `sinEnlace?`)
- Modify: `frontend-react/src/store/drives.ts` (mapa `comms`, suscripción `weg/comm/+`, borrado)
- Modify: `frontend-react/src/components/DriveCard.tsx`, `PM8000Card.tsx`, `FlowBox.tsx` /
  `views/FlowmetersSection.tsx` (`stateBadge`)

**Interfaces:**
- Produces:
  - `CommConfig { name; tipo: 'airmax'|'rut'; ip; community?; enabled?; enlace? }`;
    `AppConfig.comms?: CommConfig[]`; `enlace?: string` en `GatewayConfig`, `DeviceConfig`,
    `FlowmeterConfig` y en la config de medidores.
  - `CommState` = payload de la Global Constraints (`signal` etc. `number|null`, `desde: number`).
  - `sinEnlace?: string` en `Drive`, `Meter`, `FlowmeterState`.
  - Store: `comms: Map<string, CommState>`.
  - Componente `SinEnlaceBadge({ name })` en `components/SinEnlaceBadge.tsx`: texto
    «Sin enlace · {name}», gris azulado, `<Link to="/comunicaciones">`.

- [ ] **Step 1:** Tipos y store: suscribir `weg/comm/+`; mensaje vacío borra la entrada (como
  `weg/flow/`); mensaje con datos la guarda.
- [ ] **Step 2:** En las tres tarjetas, cuando `!online && sinEnlace`, mostrar `SinEnlaceBadge`
  en lugar de «OFFLINE» / «Bomba sin conexión» (DriveCard líneas 78–87 y 131–138); color del borde
  el mismo gris de offline.
- [ ] **Step 3:** `frontbuild.sh "Sin enlace"` → build OK y el texto en el bundle.
- [ ] **Step 4:** Commit `feat(ui): badge Sin enlace en tarjetas`.

---

### Task 7: Portal — vista Comunicaciones

**Files:**
- Create: `frontend-react/src/views/Comunicaciones.tsx`
- Modify: `frontend-react/src/App.tsx` (lazy import, `navItems` con `module: 'comunicaciones'`,
  ícono `RadioTower` de lucide, ruta `/comunicaciones`)

**Interfaces:**
- Consumes: `comms` del store y `config.comms` (Task 6); `selectMeterList` y los mapas de drives,
  meters y flowmeters para «Equipos detrás».

- [ ] **Step 1:** Vista: una tarjeta por `config.comms` habilitado (orden de la config), con estado
  del store (sin estado todavía = «Esperando lectura»). Encabezado: nombre, tipo (airMAX / RUT), IP,
  badge **En línea** / **Caído desde hh:mm** (`desde`), uptime en «Xd Yh». airMAX: barra de señal
  (umbrales de Global Constraints), ruido, CCQ %, TX/RX Mbps, remoto. RUT: barra de señal, operador,
  red. «Depende de <enlace>» si tiene. «Equipos detrás»: nombres de los equipos cuyo enlace es este
  (misma regla de herencia del gateway que `linkOf`, reimplementada en TS en
  `views/Comunicaciones.tsx` como `linkOf(item, kind, cfg)`), cada uno con su estado online/offline.
  Sin equipos cargados: mensaje «No hay equipos de comunicación. Cargalos en Configuración →
  Dispositivos.» (link solo para admin).
- [ ] **Step 2:** `frontbuild.sh "Equipos detrás"` → OK.
- [ ] **Step 3:** Commit `feat(ui): vista Comunicaciones`.

---

### Task 8: Portal — Configuración (equipos y «Conectado por»)

**Files:**
- Create: `frontend-react/src/views/CommsSection.tsx`
- Modify: `frontend-react/src/views/Config.tsx` (render de `CommsSection` después de
  `FlowmetersSection`, solo con `hasModule('comunicaciones')`; selector «Conectado por» en gateways,
  variadores sin gateway y medidores)
- Modify: `frontend-react/src/views/FlowmetersSection.tsx` (selector en el formulario)

**Interfaces:**
- Consumes: `CommConfig` (Task 6); `store.save()` como en `FlowmetersSection`.
- Produces: `EnlaceSelect({ value, onChange, exclude? })` exportado desde `CommsSection.tsx`:
  `<select>` con «— ninguno —» (= `undefined`) y los `config.comms` (menos `exclude`).

- [ ] **Step 1:** `CommsSection`: tabla (nombre, tipo, IP, community, depende de, estado del store)
  con alta/edición/baja siguiendo `FlowmetersSection`. Al borrar uno referenciado, `toast.error`
  con los nombres que lo usan y no se borra. Al renombrar, actualizar los `enlace` que lo apuntan
  en el mismo guardado.
- [ ] **Step 2:** `EnlaceSelect` en los formularios de gateway, variador (solo si no usa gateway),
  medidor y caudalímetro; sin el módulo no se muestra.
- [ ] **Step 3:** `frontbuild.sh "Conectado por"` → OK.
- [ ] **Step 4:** Commit `feat(ui): configurar equipos de comunicacion y enlace`.

---

### Task 9: Integración (docker-in-docker) y PR

**Files:** ninguno del repo (scripts en el scratchpad).

- [ ] **Step 1:** Imagen `edge` del paquete de la rama e instalación limpia en dind (como en Backup
  externo), con una licencia de prueba con `comunicaciones` que firma el usuario.
- [ ] **Step 2:** Agente SNMP falso (contenedor `node:20-alpine` con un script de `net-snmp` que
  responde los OID de airMAX) en la red del compose; cargar por la API un `comms` apuntando a él y
  un medidor con IP inexistente y `enlace` a ese comm.
- [ ] **Step 3:** Verificar `weg/comm/<nombre>` online con señal −62 (`mosquitto_sub` dentro de
  `weg-mosquitto`); el medidor publica OFFLINE sin `sinEnlace`.
- [ ] **Step 4:** Detener el agente → en ≤ 100 s `weg/comm` `online:false` y el medidor con
  `sinEnlace`; arrancarlo → vuelve y el medidor sin `sinEnlace`. Portal: captura de la vista y de la
  tarjeta (navegador del panel, puerto expuesto del dind).
- [ ] **Step 5:** PR `feat/comunicaciones` → master con checks en verde verificados con
  `gh pr checks` justo antes de mergear.
