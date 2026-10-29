# Lectura DNP3 de reguladores (Toshiba / TSEA) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El poller lee reguladores por DNP3 TCP (solo lectura, class 0) y se configuran desde el portal con el modelo `tsea-dnp3`.

**Architecture:** Nuevo `src/dnp3.js` en el poller (códec puro + pool de conexiones) que entrega un `Map('obj:idx' → {v, online})`; `points.readPointsDnp3` lo convierte al mismo `{ online, vals }` que `readPoints`, así `pollCampo` y todo lo de aguas abajo no cambia. La API valida `protocolo: 'dnp3'` y puntos `{obj, addr}`; el portal adapta el formulario y el editor de mapa.

**Tech Stack:** Node (net, node:test), Express (weg-api), React/TS (portal).

**Spec:** `docs/superpowers/specs/2026-10-29-dnp3-toshiba-design.md`

## Global Constraints

- Solo lectura: el poller envía únicamente READ `g60v1` qualifier `0x06` (class 0) y CONFIRM (FC 0x00) de respuestas solicitadas con CON. Nunca class 1–3, nunca confirma no solicitados (FC 0x82), nunca comandos.
- CRC DNP3: poly reflejado `0xA6BC`, inicial 0, complemento al final, bytes LSB primero; cabecera de 8 bytes y cada bloque de hasta 16 bytes de datos llevan su CRC.
- CTRL del maestro `0xC4`; puerto por defecto 20000; outstation por defecto 10, maestro por defecto 1; timeout de respuesta 5 s; un pedido en vuelo por conexión.
- Tipos de punto DNP3: `bi`=g1, `bo`=g10, `ctr`=g20, `ai`=g30, `ao`=g40; `addr` = índice 0–65535; flag ONLINE (bit 0) en 0 → valor `null`.
- Sin `protocolo` o con `'modbus'`: todo exactamente como hoy (validación, poller, portal).
- Comentarios en español, breves, como el código vecino. Stage por ruta explícita (hay `package-lock.json` sin trackear a propósito). Commit con línea `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Respuesta duplicada:** el .6 real mandó la misma respuesta dos veces (transporte `dc` y `dd`, app seq 0). El lector debe resolver con la primera y descartar la segunda sin romper el siguiente ciclo (test en Task 2).
2. **No solicitado al conectar / link status del outstation (`05 64 05 49 …`):** no deben resolver ni romper el pedido en curso (tests en Task 1 y 2).
3. **Equipo que corta la conexión o no responde:** `integrity` devuelve `null` en ≤ 5 s, cierra el socket y el siguiente ciclo reconecta (test en Task 2).
4. **Mapa Modbus intacto:** un regulador sin `protocolo` sigue pasando por `readPoints` y la validación de hoy; un punto Modbus con `obj` se rechaza (tests en Task 3 y 4).
5. **Editor:** cambiar el tipo DNP3 de un punto (bi ↔ ai) limpia `escala`/`bit`/`valor` (Task 5, verificación en dind).

---

### Task 1: Códec DNP3 (puro)

**Files:**
- Create: `nodered/weg-modbus-poller/src/dnp3.js`
- Create: `nodered/weg-modbus-poller/test/dnp3.test.js`

**Interfaces:**
- Produces (exportados de `src/dnp3.js`):
  - `crc(bytes: number[]|Buffer) → [lo, hi]`
  - `readClass0(dst: number, src: number, tseq: number, aseq: number) → Buffer` (trama de enlace completa)
  - `confirm(dst, src, tseq, aseq) → Buffer`
  - `class Reassembler { push(chunk: Buffer): Array<{ ctrl: number, src: number, dst: number, fragment?: Buffer }> }` — una entrada por trama de enlace completa; `fragment` presente cuando el segmento de transporte cierra (FIN) un fragmento de aplicación.
  - `parseApp(fragment: Buffer) → { fir, fin, con, uns, seq, fc, iin: number, points: Map<string, {v: number|boolean, online: boolean}>, error?: string }` — claves `'bi:0'`, `'ai:2'`, …

- [ ] **Step 1: Tests que fallan** en `test/dnp3.test.js` (node:test):
  - `crc([0x05,0x64,0x05,0x0b,0x03,0x00,0x0a,0x00])` deepEquals `[0xc4, 0x25]`.
  - `readClass0(10, 1, 0, 0).toString('hex')` empieza con `0564` + `0b` + `c4` + `0a00` + `0100`, sus CRC verifican con `crc`, y el usuario contiene `c0 c0 01 3c 01 06` (transporte, app, READ, g60v1 q06).
  - Fixture real de .6 (respuesta class 0, maestro 1, outstation 10):
    `0564554401000a0030b7ddc0819600010200000c018101010101e7b0010101818101810a0200000101011401ad7800000101f61f000001f61f00001e01009b700002013c2f00000186180000010000008d8e00280100000101952f0000016c320000fa65`
    → `Reassembler.push` da un `fragment`; `parseApp` da `fc 0x81`, `seq 0`, `fin true`, y los puntos:
    `ai:0=12092, ai:1=6278, ai:2=0`, `ctr:0=8182, ctr:1=8182`, `ao:0=12181, ao:1=12908`, `bo:0=false, bo:1=false`, BI 0..12 = `0,1,0,0,0,0,0,0,0,1,1,0,1` (como booleanos), todos `online: true`.
  - El fixture partido en dos chunks arbitrarios (p. ej. 37 + 63 bytes) da el mismo resultado.
  - Link status del outstation `0564054901000a00db9b` → una entrada sin `fragment`.
  - Fragmento sintético g30v1 con flags `0x00` → `online: false`.
  - Fragmento sintético con un objeto no soportado (g99v1) después de un g30v1 → conserva los g30 y `error` presente.
  - Dos tramas cuyo fragmento ocupa dos segmentos de transporte (FIR en el primero, FIN en el segundo) → un solo `fragment` con el contenido concatenado.

- [ ] **Step 2: Verificar que fallan** — `node --test test/dnp3.test.js` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar el códec** según la spec §4.1 (objetos g1v1/v2, g10v1/v2, g20v1/v2/v5/v6, g30v1–v5, g40v1–v3; qualifiers 0x00, 0x01, 0x17, 0x28; 0x06 sin datos). El spike que funcionó contra .6/.7 (`scratchpad/dnp-read.js`, fuera del repo) sirve de referencia; no copiar su lógica de socket.

- [ ] **Step 4: Verificar que pasan** — `node --test test/dnp3.test.js` → PASS; suite completa del poller sin regresiones.

- [ ] **Step 5: Commit** — `feat(poller): códec DNP3 (lectura class 0)`.

### Task 2: Pool de conexiones DNP3 e `integrity`

**Files:**
- Modify: `nodered/weg-modbus-poller/src/dnp3.js`
- Create: `nodered/weg-modbus-poller/test/helpers/outstation.js` (outstation simulado; también lo usa la integración en dind)
- Modify: `nodered/weg-modbus-poller/test/dnp3.test.js`

**Interfaces:**
- Consumes: códec de Task 1.
- Produces:
  - `integrity(ip: string, port: number, outstation: number, maestro: number) → Promise<Map<string,{v,online}>|null>` (`null` = sin respuesta en 5 s o conexión caída; nunca lanza).
  - `closeOne(key: string)`, `closeAll()`, `getStats() → { [ 'ip:port' ]: { connected: boolean, errors: number } }` (misma forma que `connections.getStats`).
  - `test/helpers/outstation.js`: `start({ port, address = 10, points, con = false, unsolicitedOnConnect = false, duplicate = false, silent = false }) → Promise<{ port, close(), requests: Buffer[] }>`; responde READ class 0 con los `points` dados (g1v2, g10v2, g20v1, g30v1, g40v1), con CON si `con`, dos veces si `duplicate`; `silent` no responde nunca.

- [ ] **Step 1: Tests que fallan** (con el outstation simulado en puerto libre):
  - Lectura normal → Map con los valores del simulador; `requests` contiene solo pedidos READ con `3c 01 06`.
  - `con: true` → el simulador recibe un CONFIRM (FC 0x00) con la misma secuencia.
  - `unsolicitedOnConnect: true` → la respuesta es la del READ y el simulador **no** recibe confirm del no solicitado.
  - `duplicate: true` → dos `integrity` seguidos devuelven valores correctos (el duplicado no se toma como respuesta del segundo pedido).
  - `silent: true` → `integrity` resuelve `null` en ≤ 5,5 s y `getStats()[key].connected === false`; un segundo `integrity` reconecta.
  - Simulador cerrado → `null` sin excepción.

- [ ] **Step 2: Verificar que fallan.**

- [ ] **Step 3: Implementar** pool por `ip:port:outstation:maestro` (clave de stats `ip:port`), cola de un pedido en vuelo, secuencias de transporte/aplicación por conexión, timeout 5 s, cierre y reconexión en el siguiente pedido; descartar fragmentos `0x82` y respuestas cuya seq no sea la del pedido en curso.

- [ ] **Step 4: Verificar que pasan** (suite del poller completa).

- [ ] **Step 5: Commit** — `feat(poller): conexiones DNP3 e integrity poll`.

### Task 3: `readPointsDnp3` y cableado en `pollCampo`

**Files:**
- Modify: `nodered/weg-modbus-poller/src/points.js`
- Modify: `nodered/weg-modbus-poller/src/index.js` (`pollCampo`, grupos por `ip:port`, cierre de conexiones obsoletas, stats)
- Modify: `nodered/weg-modbus-poller/test/points.test.js`

**Interfaces:**
- Consumes: `integrity` de Task 2.
- Produces: `readPointsDnp3(item: { ip, port, dnp3, mapa }, integrity) → Promise<{ online: boolean, vals: Array<number|boolean|null> }>` exportado de `points.js`.

- [ ] **Step 1: Tests que fallan** con un `integrity` falso:
  - Mapa `tsea-dnp3`-like: `ai:0` con escala 0.01 → `120.92`; `bi:12` → `true`; `ctr:0` → `8182`; punto `ai` con `bit: 0` sobre valor 3 → `true`; punto `ai` con `valor: 0` → `true`.
  - Punto cuyo `online` es `false` → `null`; punto ausente en la respuesta → `null`.
  - `integrity` devuelve `null` → `{ online: false, vals: [null, …] }`.
  - Defaults: sin `port`/`dnp3` → llama `integrity(ip, 20000, 10, 1)`.

- [ ] **Step 2: Verificar que fallan.**

- [ ] **Step 3: Implementar** `readPointsDnp3` (reusar la rama numérica de `decode` para escala/bit/valor sin duplicarla) y en `index.js`: `pollCampo` usa `readPointsDnp3(item, dnp3.integrity)` si `item.protocolo === 'dnp3'`; el agrupamiento usa `x.port ?? (x.protocolo === 'dnp3' ? 20000 : 502)`; el cierre de conexiones obsoletas y `getStats` del poller incluyen las DNP3; `closeAll` al apagar.

- [ ] **Step 4: Verificar** suite del poller completa.

- [ ] **Step 5: Commit** — `feat(poller): reguladores DNP3 en el ciclo de campo`.

### Task 4: API — validación y modelo `tsea-dnp3`

**Files:**
- Modify: `nodered/weg-api/src/services/validate.js` (`validateCampo`)
- Modify: `nodered/weg-api/src/services/modelos.js`
- Modify: `nodered/weg-api/test/campoConfig.test.js`, `nodered/weg-api/test/modelos.test.js`

**Interfaces:**
- Produces: modelo `MODELOS['tsea-dnp3'] = { kind: 'reg', nombre: 'TSEA (DNP3)', descripcion, protocolo: 'dnp3', port: 20000, dnp3: { outstation: 10, maestro: 1 }, mapa }` (mapa de la spec §3.3).

- [ ] **Step 1: Tests que fallan:**
  - Regulador con `protocolo: 'dnp3'`, `dnp3 {10, 1}` y el mapa del modelo → `[]`.
  - `protocolo: 'x'` → error; `dnp3.outstation: 70000` → error; `dnp3.maestro: -1` → error.
  - Punto DNP3 con `fc` o `tipo` u `orden` → error; `obj: 'zz'` → error; `addr: 70000` → error.
  - `obj: 'bi'` con `escala` o `bit` → error; `obj: 'ai'` con `escala: 0.01` → ok; `obj: 'bi'` en key numérica (`v`) → error; `obj: 'ai'` en key sí/no (`auto`) sin bit/valor → error.
  - Regulador Modbus (sin `protocolo`) con un punto que tiene `obj` → error; regulador Modbus válido de hoy → `[]` (sin cambios).
  - `modelos`: `tsea-dnp3` existe, es `kind: 'reg'`, y `validateConfig` acepta un regulador armado con su mapa por defecto.

- [ ] **Step 2: Verificar que fallan.**

- [ ] **Step 3: Implementar** según spec §3.1–3.3 y §5 (las reglas de keys, `med`/`senal`, sumas, principal, rol y 1–64 puntos se aplican igual a DNP3).

- [ ] **Step 4: Verificar** suite de weg-api completa.

- [ ] **Step 5: Commit** — `feat(api): reguladores DNP3 y modelo tsea-dnp3`.

### Task 5: Portal — formulario y editor de mapa

**Files:**
- Modify: `frontend-react/src/types.ts` (`Punto.obj?`, `CampoConfig.protocolo?`, `CampoConfig.dnp3?`)
- Modify: `frontend-react/src/views/CampoSection.tsx` (`MODELOS_UI.reg` suma `['tsea-dnp3', 'TSEA (DNP3)']`; al cambiar de modelo copia `protocolo`/`port`/`dnp3` del modelo; con DNP3 oculta «ID (Unit)» y muestra «Outstation» y «Maestro»)
- Modify: `frontend-react/src/views/MapaEditor.tsx` (prop `protocolo`; con DNP3: columna «Tipo DNP3» (bi, bo, ctr, ai, ao) en lugar de «fc», «Índice» en lugar de «Dirección», sin «Tipo»/«Orden»; `escala`/`bit`/`valor` solo en ctr/ai/ao; cambiar el tipo DNP3 limpia lo que no aplica; punto nuevo `{ key, obj: 'ai', addr: 0 }`; el aviso de renombre indexa por `obj:addr`)

- [ ] **Step 1: Implementar** los cambios de arriba.
- [ ] **Step 2: Verificar** typecheck + build (`frontbuild.sh`, buscar el texto «Tipo DNP3» en el chunk de Configuración).
- [ ] **Step 3: Commit** — `feat(portal): reguladores DNP3 en Configuración`.

### Task 6: Integración y PR

**Files:** ninguno del repo (scripts en el scratchpad).

- [ ] **Step 1:** Imagen edge de la rama; actualizar `weg-cm-a` (cambiar `WEG_VERSION` en `.env` antes del update); outstation simulado (`test/helpers/outstation.js` envuelto en un script que lo deja escuchando) en la red de docker; alta de dos reguladores `tsea-dnp3` en banco «Toshiba».
- [ ] **Step 2:** Verificar payload MQTT, tarjeta, detalle, banco y mímico; offline al apagar el simulador; editor de mapa en modo DNP3.
- [ ] **Step 3:** En planta, **sin cambiar la config**: correr el `integrity` de la rama contra 192.168.11.6 y .7 (script en el contenedor del poller, solo class 0) y comparar con la app TSEA.
- [ ] **Step 4:** PR `feat/dnp3-toshiba` → master con CI en verde (`gh pr checks` antes de mergear).
- [ ] **Step 5:** Tras merge y tag `v1.12.0` (los crea el usuario) y con su OK explícito: update de planta y oficina, y script (con `--dry`, respaldo de `config.json`, validación y chequeo de licencia de la API) que agrega los dos reguladores DNP3 al banco «Toshiba» con el enlace «RUTX Toshiba» y los nombres que confirme el usuario.
