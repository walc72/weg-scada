# Tarifas eléctricas y costos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cargar tarifas eléctricas (modelo Pliego 21 de ANDE) en Configuración y mostrar el costo por bomba en el reporte diario y un informe de costos en Informes.

**Architecture:** `generateSummary` suma la energía por hora (bombas y medidores) y el pico de demanda por hora (medidores); un servicio puro `tarifas.js` costea esos arreglos con la versión vigente de cada día. Las rutas devuelven solo los costos ya calculados; el frontend agrega una subpestaña con API propia y columnas de costo.

**Tech Stack:** weg-api (Node 26, Express 5, node:test, InfluxDB 2.9 Flux, pdfkit), frontend React 19 + TS + Tailwind 4 + vitest, `components/ui` y `components/config`.

**Spec:** `docs/superpowers/specs/2026-11-09-tarifas-electricas-design.md`

## Global Constraints

- Respuestas, textos de UI y mensajes en español; números `es-AR` (punto de miles).
- Diseño ISA-101 de `docs/diseno-industrial.md`; solo `components/ui` (nada de Ant Design ni `<select>/<input type=checkbox>` nativos).
- Unidades: caudal L/s, volumen litros (`aLitros`), energía específica kWh/L, costo `{moneda}/L`.
- Las claves `?tab=` existentes no cambian; la nueva es `tarifas`.
- `PUT /api/tarifas`: solo admin/superadmin. `GET`: cualquier autenticado.
- No tocar `frontend-react/src/views/Dashboard.tsx`.
- Sin tarifas cargadas, todo se ve exactamente como hoy (sin columnas ni KPIs de costo).
- Franjas en horas enteras locales (TZ del contenedor), `desde` incluido, `hasta` excluido; días 1=lunes…7=domingo.
- Moneda por defecto `Gs`, mostrada sin decimales.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tests backend: `cd nodered/weg-api && node --test test/<archivo>` (en WSL/Docker si Windows no tiene node: `docker run --rm -v "$PWD":/w -w /w node:26-alpine node --test test/<archivo>`). Frontend: script tipo `.superpowers/sdd/2026-11-09-configuracion-etapa2/run.sh` (copiarlo a `.superpowers/sdd/2026-11-09-tarifas/run.sh` apuntando a `/mnt/c/dev/weg-scada-tarifas`).

**Desvío deliberado de la spec:** no se sube `CACHE_V` de informes. El bloque `costos` usa el resumen del período completo (`s`), no los días cacheados; los días viejos sin arreglos no afectan a nadie.

## Review Focus

1. Resumen con período relativo (`from: '-24h'` en `POST /api/reports/summary`): `horaInicio` debe salir absoluto y alineado a la hora → test en Task 4 (`alinearHoras`).
2. Tarifa cuya única versión empieza después del período: costo `null` y nota "sin tarifa vigente", no 0 → test en Task 2.
3. Medidor de demanda asignado que no está en el resumen (dado de baja o sin datos): el sitio usa la suma de sus bombas, sin cargo de potencia, con nota → test en Task 2.
4. Sitio escrito con espacios (`" Agriplus "` en un equipo): debe caer en la misma asignación que `"Agriplus"` → test en Task 2 y Task 6.
5. Borrar una tarifa asignada en la UI: la asignación queda limpia (no se manda un id colgado que el servidor rechace) → test en Task 6.

---

### Task 1: `tarifas.js` — archivo, validación, versión vigente y franja

**Files:**
- Create: `nodered/weg-api/src/services/tarifas.js`
- Test: `nodered/weg-api/test/tarifas.test.js`

**Interfaces:**
- Produces:
  - `TARIFAS_PATH` = `path.join(path.dirname(process.env.CONFIG_PATH || '/app/config/config.json'), 'tarifas.json')`
  - `VACIO` = `{ moneda: 'Gs', tarifas: [], asignacion: {} }`
  - `leer(file = TARIFAS_PATH) → Archivo` (falta o JSON roto → copia de `VACIO`, log `[TARIFAS]`)
  - `validar(obj) → Archivo` (normalizado; lanza `Error(mensaje para el usuario)`)
  - `guardar(obj, file = TARIFAS_PATH) → Archivo` (valida, tmp + rename, devuelve lo guardado)
  - `versionVigente(tarifa, fecha /* 'AAAA-MM-DD' */) → Version | null`
  - `franjaDe(version, ms) → number` (índice en `version.franjas`, `-1` = resto)
  - `fechaLocal(ms) → 'AAAA-MM-DD'`
- Tipos (JSDoc): ver "Modelo de datos" de la spec. `tarifa.id` se conserva si cumple `/^t-[a-z0-9]{4,20}$/`, si no se genera `t-${Date.now().toString(36)}${rand4}`. Claves de `asignacion` se guardan con `trim()`.

- [ ] **Step 1: Tests que fallan** (`test/tarifas.test.js`, node:test + assert/strict, archivo temporal en `os.tmpdir()`):
  - `leer` de archivo inexistente → `deepEqual(VACIO)`; de archivo con `"{roto"` → `VACIO`.
  - `validar` acepta la tarifa 412 de la spec y devuelve versiones ordenadas por `desde` aunque vengan desordenadas.
  - `validar` rechaza (con `assert.throws(..., /…/)`): dos franjas que cubren sábado 18 h (`/se superpone/`), `desde` repetido en una tarifa (`/versión repetida/`), `hasta: 25` (`/hora/`), `dias: []` (`/días/`), nombre de tarifa duplicado ignorando mayúsculas (`/ya existe/`), `asignacion.Agriplus.tarifa = 't-noexiste'` (`/tarifa inexistente/`), 21 tarifas (`/20 tarifas/`), precio negativo (`/precio/`).
  - `validar` con clave de asignación `' Agriplus '` → clave `'Agriplus'`.
  - `versionVigente`: versiones `2024-01-01` y `2024-11-26`; `'2024-11-25'` → la primera; `'2024-11-26'` → la segunda; `'2023-12-31'` → `null`.
  - `franjaDe` con punta L–S 18–22: `new Date(2026, 10, 7, 18)` (sábado) → `0`; `new Date(2026, 10, 7, 22)` → `-1`; `new Date(2026, 10, 8, 20)` (domingo) → `-1`; `new Date(2026, 10, 9, 21)` (lunes) → `0`.
  - `guardar` escribe y `leer` devuelve lo mismo.

- [ ] **Step 2:** `node --test test/tarifas.test.js` → FAIL (`Cannot find module '../src/services/tarifas'`).

- [ ] **Step 3: Implementar** en `src/services/tarifas.js`. Límites de la spec: 20 tarifas, 50 versiones, 6 franjas, nombres 60/30 caracteres, moneda 1–8. Solapes: armar por versión una grilla 7×24 marcando qué franja ocupa cada hora; si una celda ya está ocupada → `Franja "X" se superpone con "Y" (día D, hora H)`. Escritura como `escribirArchivo` de `informes.js`.

- [ ] **Step 4:** `node --test test/tarifas.test.js` → PASS.

- [ ] **Step 5: Commit** `feat(api): servicio de tarifas (archivo, validación, vigencia, franjas)`.

---

### Task 2: `tarifas.costear` y `tarifas.aplicar`

**Files:**
- Modify: `nodered/weg-api/src/services/tarifas.js`
- Test: `nodered/weg-api/test/tarifas.test.js` (agregar `describe('costear')`)

**Interfaces:**
- Consumes (Task 1): `versionVigente`, `franjaDe`, `fechaLocal`, `leer`.
- Consumes (Task 4, forma del summary): `summary.horaInicio` (ms, inicio de la primera hora), `drives[i].kwhHora: (number|null)[]`, `drives[i].site`, `drives[i].volumeM3?`, `meters[i].kwhHora`, `meters[i].kwMaxHora`, `meters[i].energyKwh`, `meters[i].energySource`, `meters[i].stats.pf.avg`.
- Produces:
  - `costear(summary, archivo, sitioDe /* (nombreEquipo) => string, ya con trim */) → Costos | null` (`null` si `archivo.tarifas` está vacío o el summary no trae `horaInicio`).
  - `Costos = { moneda, bombas: { [name]: { sitio, franjas: [{ nombre, kwh, costo }], costo: number|null, porLitro: number|null } }, costoBombas: number|null, sitios: [{ sitio, tarifa, medidor, franjas: [{ nombre, kwh, costo }], energia, reservada, exceso, total, fp: number|null, fpBajo: boolean, mesParcial: boolean }], notas: string[] }`
  - `aplicar(summary, archivo = leer(), cfg = configService.get()) → summary` — pone `summary.costos = costear(...)` (omite la clave si es `null`), borra `horaInicio` y todos los `kwhHora`/`kwMaxHora`, devuelve el mismo objeto. `sitioDe` sale de `cfg.devices[].site` y `cfg.meters[].site` con `trim()`, `''` si falta.

Reglas (de la spec, sin cambios): hora `h` → `ms = horaInicio + h·3600000`; versión = `versionVigente(tarifa, fechaLocal(ms))`; sin versión → la energía de esa hora no se costea y se agrega la nota `Sin tarifa vigente para <sitio> el <dd/mm/aaaa>` (una vez por sitio). Reservada: por cada hora cubierta suma `reservadaKw × precioKw / horasDelMes(ms)` (diferencial: punta + fuera, ambas todas las horas). Exceso: por mes local, demanda máx de `kwMaxHora` (diferencial: separada en horas de franja vs resto) contra la reservada de la versión vigente en la última hora de ese mes dentro del período; `mesParcial` si el período no cubre desde la hora 0 del día 1 hasta el fin del mes. Energía del medidor: si `energySource === 'contador'` y la suma de `kwhHora` > 0, escalar cada hora por `energyKwh / suma`. FP: `fpBajo = fp != null && fp < 0.92`, nota `FP medio de <medidor> = 0,90 (menor a 0,92): ANDE aplica un recargo sobre la energía (pliego 4.5).` Costos redondeados a entero; kWh a 0,1.

- [ ] **Step 1: Tests que fallan** — fixture: tarifa 412 (punta L–S 18–22 a 331.93, resto 144.83, potencia única 800 kW / 41126 / 87533), `horaInicio = new Date(2026, 10, 7, 0).getTime()` (sábado), 24 horas:
  - Bomba `B1` sitio `Agriplus` con 10 kWh por hora → franjas `Punta 40 kWh / 13277`, `Fuera de punta 200 kWh / 28966`, `costo 42243`.
  - `B1` con `volumeM3: 100` → `porLitro` = `42243 / 100000` redondeado a 4 decimales = `0.4224`.
  - Bomba de sitio `' Agriplus '` (sitioDe con trim) cae en la tarifa de `Agriplus` (Review Focus 4).
  - Cambio de versión: versión 2 desde `2026-11-08` con resto a 200; período sábado+domingo (48 h, 10 kWh/h) → el domingo usa 200 en las 24 h.
  - Única versión desde `2027-01-01` → `bombas.B1.costo === null` y `notas` incluye `Sin tarifa vigente para Agriplus` (Review Focus 2).
  - Sitio con medidor `PM1` (`kwMaxHora` con un pico de 900 en la hora 19, `pf.avg 0.9`): `reservada = round(800×41126×24/720)` = `1096693`, `exceso = round(100×87533)` = `8753300`, `mesParcial true`, `fpBajo true`, nota de FP presente.
  - Diferencial: punta reservada 500/38732/116195, fuera 800/23800/81802; pico 600 en hora 19 (punta) y 850 en hora 10 (fuera) → `exceso = round(100×116195 + 50×81802)` = `15709600`.
  - Medidor asignado `PMX` ausente del summary → `sitio.energia` = suma de bombas del sitio, `reservada 0`, `exceso 0`, nota `Medidor PMX sin datos` (Review Focus 3).
  - Archivo sin tarifas → `costear` devuelve `null`; `aplicar` no agrega `costos` y borra `kwhHora`.

- [ ] **Step 2:** `node --test test/tarifas.test.js` → FAIL (`costear is not a function`).
- [ ] **Step 3: Implementar** `costear` y `aplicar` según las reglas de arriba.
- [ ] **Step 4:** `node --test test/tarifas.test.js` → PASS.
- [ ] **Step 5: Commit** `feat(api): costeo por franja, potencia reservada y exceso`.

---

### Task 3: Ruta `/api/tarifas`

**Files:**
- Create: `nodered/weg-api/src/routes/tarifas.js`
- Modify: `nodered/weg-api/src/server.js` (montar junto a `/api/settings`, línea ~154; la auth ya es global por `requireAuth` en la línea ~108, y `replicaWriteGuard` no bloquea `/api/tarifas`, que es lo buscado: cada servidor edita las suyas)
- Test: `nodered/weg-api/test/tarifasRoute.test.js`

**Interfaces:**
- Consumes: `tarifas.leer`, `tarifas.guardar`; `requireAdmin` de `src/middleware/auth.js`.
- Produces: `createTarifasRouter(file = TARIFAS_PATH) → express.Router` con `GET /` → `leer(file)`, `PUT /` (requireAdmin) → `guardar(req.body, file)`; error de validación → `400 { error }`.

- [ ] **Step 1: Tests que fallan** — mismo estilo que `test/adminWriteGuard.test.js` (app con `req.auth = { role }` inyectado, `app.listen(0)`), archivo en tmpdir:
  - `GET` como `operador` → 200 con `moneda: 'Gs'`.
  - `PUT` como `operador` → 403.
  - `PUT` como `admin` con franjas superpuestas → 400 y `error` coincide `/se superpone/`.
  - `PUT` como `admin` válido → 200 y el archivo existe con la tarifa.
- [ ] **Step 2:** `node --test test/tarifasRoute.test.js` → FAIL.
- [ ] **Step 3: Implementar** el router y montarlo en `server.js` como `app.use('/api/tarifas', createTarifasRouter())`.
- [ ] **Step 4:** `node --test test/tarifasRoute.test.js` → PASS; `node --test` completo → sin regresiones.
- [ ] **Step 5: Commit** `feat(api): ruta /api/tarifas`.

---

### Task 4: Energía por hora en el resumen y costos en reporte diario (API, PDF, Excel, mail)

**Files:**
- Modify: `nodered/weg-api/src/services/reports.js` (`generateSummary` ~690–888, `toSummaryPDF` ~1051, `reportToXLSX` ~1242, exports)
- Modify: `nodered/weg-api/src/routes/reports.js` (`/daily`, `/daily/pdf`, `/summary`, `/xlsx`)
- Modify: `nodered/weg-api/src/services/dailyReport.js` (`buildAndSend`, `totalsLine`)
- Test: `nodered/weg-api/test/horasResumen.test.js`, y ampliar el test existente de `totalsLine` si lo hay (`grep -rl totalsLine test/`)

**Interfaces:**
- Consumes (Task 2): `tarifas.aplicar(summary)`.
- Produces:
  - `alinearHoras(rows, inicioMs, nHoras, valor /* (r) => number */) → (number|null)[]` exportada de `reports.js` (pura): ubica cada fila por `Math.floor((Date.parse(r._time) - inicioMs) / 3600000)`, descarta fuera de rango.
  - `porHoraBy(measurement, start, stop, bucket) → { [name]: rows }` — Flux: igual que `integralBy` hasta `fill(value: 0.0)`, luego `|> aggregateWindow(every: 1h, fn: sum, timeSrc: "_start")`. kWh de la hora: drives `sum / 60` (potencia en kW), meters `sum / 60 / 1000` (W).
  - En `generateSummary`: `out.horaInicio = Math.floor(rangeToMs(start, Date.now()) / 3600000) * 3600000`; `nHoras = ceil((stopMs − horaInicio)/3600000)`; `drives[i].kwhHora`, `meters[i].kwhHora`; `meters[i].kwMaxHora` = máximo de `mDemand.rows` (ya calculado) por hora con `alinearHoras` usando `max`. Las dos consultas nuevas van envueltas en `.catch` que loguea `[REPORT] tarifas:` y deja los arreglos sin poner.
  - Columnas en PDF/XLSX de bombas cuando `summary.costos`: `Costo ${moneda}` (`costos.bombas[name].costo`) y, si hay volumen, `${moneda}/L`; fila total con `costoBombas`.
  - `totalsLine(summary)` agrega ` · Costo bombas: <strong>${miles} ${moneda}</strong>` si `summary.costos?.costoBombas != null`.

- [ ] **Step 1: Tests que fallan** (`test/horasResumen.test.js`):
  - `alinearHoras` con inicio `2026-11-07T03:00:00Z`, 3 horas, filas en `03:00Z` (5) y `05:00Z` (7) → `[5, null, 7]`; fila en `06:00Z` se descarta.
  - Review Focus 1: `horaInicio` para `start='-24h'` con `now = 2026-11-07T15:37:00Z` → `2026-11-06T15:00:00Z` (exponer el cálculo como `inicioHora(start, nowMs)` pura y testearla).
  - `totalsLine` con `costos: { moneda: 'Gs', costoBombas: 1234567 }` contiene `Costo bombas: <strong>1.234.567 Gs</strong>`; sin `costos` no contiene `Costo`.
  - `toSummaryPDF`/`reportToXLSX` con un summary con `costos` no lanzan (smoke: devuelven Buffer no vacío).
- [ ] **Step 2:** `node --test test/horasResumen.test.js` → FAIL.
- [ ] **Step 3: Implementar** lo de Interfaces. En las rutas: `/daily` y `/summary` responden `tarifas.aplicar(await …)`; `/daily/pdf`, `/xlsx` y `dailyReport.buildAndSend` aplican antes de generar el archivo/mail.
- [ ] **Step 4:** `node --test` completo → PASS.
- [ ] **Step 5: Commit** `feat(api): energía por hora y costo por bomba en el reporte diario`.

---

### Task 5: Bloque y plantilla "Costos" en Informes

**Files:**
- Modify: `nodered/weg-api/src/services/informes.js` (`BLOQUES`, `PLANTILLAS`, `generarInforme`, exports para test)
- Test: `nodered/weg-api/test/informesCostos.test.js`

**Interfaces:**
- Consumes: `tarifas.costear`, `tarifas.leer`; `s` (resumen del período, que ya trae arreglos por hora por Task 4).
- Produces: `BLOQUES.costos = 'Costos de energía'`; plantilla `{ id: 'costos', nombre: 'Costos', periodo: 'mes_anterior', bloques: ['indicadores', 'costos'] }`; `bCostos(s, ctx) → partes` con `ctx.tarifas` (archivo) y `ctx.sitioDe`, exportada como `_bCostos` (mismo criterio que otros helpers exportados para test en el archivo; si no hay ninguno, exportar igual).

Partes, en orden: `kpis` (`COSTO ENERGÍA BOMBAS`, `COSTO TOTAL SITIOS`, `${moneda}/kWh MEDIO` = total sitios / energía sitios con `dec: 1`, `${moneda}/L` si hay volumen total con `dec: 4`); `tabla` "Por sitio" con columnas `Sitio, Tarifa, <franja> kWh, <franja> ${moneda}` (por cada nombre de franja distinto, en orden de aparición), `Potencia reservada, Exceso, Total, FP medio (dec 3)`; `tabla` "Por bomba" con `Bomba, Sitio, <franja> kWh…, Costo, ${moneda}/L`; una `nota` por cada `costos.notas` y `Mes parcial: el exceso usa la demanda máxima del tramo informado.` si algún sitio tiene `mesParcial`. Sin tarifas → solo `{ nota: 'Sin tarifas cargadas: Configuración → Supervisión → Tarifas.' }`.

- [ ] **Step 1: Tests que fallan**: `_bCostos` con archivo vacío → una sola parte nota con `Sin tarifas cargadas`; con la fixture de Task 2 (un sitio) → primera parte con 3 kpis (sin volumen), tabla "Por sitio" con columnas `['Sitio','Tarifa','Punta kWh','Punta Gs','Fuera de punta kWh','Fuera de punta Gs','Potencia reservada','Exceso','Total','FP medio']` y nota de mes parcial; `listarPlantillas()` incluye `costos` con `fabrica: true`.
- [ ] **Step 2:** `node --test test/informesCostos.test.js` → FAIL.
- [ ] **Step 3: Implementar**; en `generarInforme`, `ctx.tarifas = tarifas.leer()` y `ctx.sitioDe` armado desde `cfg` igual que en `aplicar`; rama `else if (tipo === 'costos') partes = bCostos(s, ctx)`.
- [ ] **Step 4:** `node --test` completo → PASS.
- [ ] **Step 5: Commit** `feat(informes): bloque y plantilla de costos de energía`.

---

### Task 6: Frontend — tipos y mutadores puros de tarifas

**Files:**
- Create: `frontend-react/src/views/config/tarifas.ts`
- Test: `frontend-react/src/views/config/tarifas.test.ts`

**Interfaces:**
- Produces (TS, espejo del modelo de la spec):
  - `type Tramo = { dias: number[]; desde: number; hasta: number }`, `Franja = { nombre: string; precioKwh: number; tramos: Tramo[] }`, `Cargo = { reservadaKw: number; precioKw: number; precioExcesoKw: number }`, `Potencia = null | ({ modo: 'unica' } & Cargo) | { modo: 'diferencial'; punta: Cargo; fuera: Cargo }`, `Version = { desde: string; franjas: Franja[]; resto: { nombre: string; precioKwh: number }; potencia: Potencia }`, `Tarifa = { id: string; nombre: string; versiones: Version[] }`, `ArchivoTarifas = { moneda: string; tarifas: Tarifa[]; asignacion: Record<string, { tarifa: string | null; medidor: string | null }> }`.
  - `vacio(): ArchivoTarifas`
  - `agregarTarifa(a, nombre): { archivo: ArchivoTarifas; id: string }` (id `t-` + base36 de `Date.now()` + 4 al azar; versión inicial `desde` = hoy local, sin franjas, resto `Fuera de punta` 0, potencia null)
  - `borrarTarifa(a, id): ArchivoTarifas` (también pone `tarifa: null` en las asignaciones que la usaban)
  - `nuevaVersion(a, id, desde): ArchivoTarifas` (copia profunda de la última; lanza `Error('Ya existe una versión con esa fecha')`)
  - `borrarVersion(a, id, desde): ArchivoTarifas` (lanza si es la única)
  - `editarVersion(a, id, desde, fn: (v: Version) => Version): ArchivoTarifas`
  - `precargarAnde(v: Version): Version` (franjas = `[{ nombre: 'Punta', precioKwh: 0, tramos: [{ dias: [1,2,3,4,5,6], desde: 18, hasta: 22 }] }]`, resto `{ nombre: 'Fuera de punta', precioKwh: v.resto.precioKwh }`)
  - `vigente(t: Tarifa, hoy: string): Version | null`
  - `sitiosDe(cfg: { devices?: { site?: string }[]; meters?: { site?: string }[] }): string[]` (únicos con `trim`, orden de aparición, `''` al final si algún equipo no tiene sitio)
  - `asignar(a, sitio, cambio: Partial<{ tarifa: string | null; medidor: string | null }>): ArchivoTarifas`

- [ ] **Step 1: Tests que fallan** (vitest): `borrarTarifa` limpia la asignación de `Agriplus` (Review Focus 5); `nuevaVersion` copia precios y no comparte referencias (mutar la copia no cambia la original); `nuevaVersion` con fecha repetida lanza; `borrarVersion` de la única lanza; `precargarAnde` deja punta L–S 18–22; `sitiosDe` con `' Agriplus '`, `'Agriplus'`, `'Agrocaraya'` y un medidor sin sitio → `['Agriplus','Agrocaraya','']` (Review Focus 4); `vigente` elige por fecha.
- [ ] **Step 2:** `run.sh fe "npx vitest run src/views/config/tarifas.test.ts"` → FAIL.
- [ ] **Step 3: Implementar** `tarifas.ts`.
- [ ] **Step 4:** mismo comando → PASS.
- [ ] **Step 5: Commit** `feat(frontend): modelo y mutadores de tarifas`.

---

### Task 7: Frontend — subpestaña Configuración → Supervisión → Tarifas

**Files:**
- Create: `frontend-react/src/views/config/TarifasTab.tsx`
- Modify: `frontend-react/src/views/config/ConfigView.tsx` (grupo `supervision`: `{ id: 'tarifas', label: 'Tarifas', el: <TarifasTab /> }`, **sin** `soloLectura`)

**Interfaces:**
- Consumes (Task 6): todos los mutadores y tipos; (Task 3) `GET/PUT ${API_BASE}/tarifas` con `authFetch`; `useConfigStore` para `config.devices/meters` (sitios y medidores por sitio); `SeccionConfig`, `Campo`, `BarraGuardado`, `useEdicion`, `useGuardando`, `useAvisoPendiente` de `components/config`; `Table`, `Select`, `Input`, `Button`, `Label`, `ConfirmarDialog` de `components/ui`.
- Produces: `export default function TarifasTab()`.

Comportamiento: carga como `CorreoTab` (en `MODE === 'mock'` usa `vacio()` con una tarifa de ejemplo 412). Una `SeccionConfig` "Tarifas eléctricas" con `BarraGuardado` (guardar = `PUT` del archivo completo; error del servidor → `toast.error(\`No se pudo guardar: ${error}\`)` y queda sucio). Bloque **Tarifas**: tabla (Nombre, Vigente desde, Precios vigentes `Punta 331,93 · Fuera de punta 144,83 Gs/kWh`, acciones Editar/Borrar con confirmación) + botón **Agregar tarifa**. Editor de la tarifa elegida: nombre, `Select` de versión, **Nueva versión** (desde = hoy), **Borrar versión**, campo "Vigente desde" (`Input` texto `AAAA-MM-DD`), filas de franja (nombre, precio, tramos con 7 `Button` toggle `L M M J V S D` `variant` activo/inactivo y dos `Select` 0–24, agregar/quitar tramo y franja), resto (nombre, precio), potencia (`Select` Ninguna/Única/Diferencial + campos kW y Gs/kW-mes), **Precargar ANDE**. Bloque **Asignación por sitio**: una fila por `sitiosDe(config)` (rótulo `Sin sitio` para `''`) y por clave de `asignacion` que ya no exista (rótulo `<sitio> — sitio no encontrado`, botón Quitar), con `Select` de tarifa (`Sin tarifa` + tarifas) y `Select` de medidor (`Ninguno` + medidores con ese `site` trimmeado). Campos numéricos con `Input` `inputMode="decimal"` aceptando coma decimal.

- [ ] **Step 1: Implementar** `TarifasTab.tsx` y el alta en `ConfigView.tsx`.
- [ ] **Step 2:** `run.sh fe "npx tsc -b --noEmit && npx eslint src/views/config && npx vitest run src/views/config src/components/config"` → sin errores.
- [ ] **Step 3: Verificación manual** con `npm run dev` en modo mock (preview en el navegador integrado): `?tab=tarifas` muestra la tarifa de ejemplo; cambiar un precio activa la barra de guardado; cambiar de subpestaña con cambios pide confirmación; tema claro y oscuro legibles.
- [ ] **Step 4: Commit** `feat(frontend): subpestaña de tarifas en Configuración`.

---

### Task 8: Frontend — costo en el reporte diario

**Files:**
- Modify: `frontend-react/src/views/ReporteDiario.tsx` (tipos ~30–60, KPIs ~440, tabla de bombas ~455–495)

**Interfaces:**
- Consumes (Task 4): respuesta de `/api/reports/daily` con `costos?: { moneda: string; costoBombas: number | null; bombas: Record<string, { costo: number | null; porLitro: number | null }> }`.

Cambios: agregar `costos?` al tipo del resumen; si `summary.costos` existe: KPI `COSTO BOMBAS` (`fmtNum(costoBombas, 0)`, unidad `moneda`), columnas `Costo ${moneda}` y, si la tabla ya muestra volumen, `${moneda}/L` (`fmtNum(porLitro, 4)`), y celdas en la fila TOTAL. Sin `costos` el render queda idéntico.

- [ ] **Step 1: Implementar.**
- [ ] **Step 2:** `run.sh fe "npx tsc -b --noEmit && npx eslint src/views/ReporteDiario.tsx && npx vitest run"` → sin errores.
- [ ] **Step 3: Verificación manual** en modo mock (agregar `costos` al mock del resumen diario si existe uno): columnas y KPI visibles; sin `costos`, la tabla queda como antes.
- [ ] **Step 4: Commit** `feat(frontend): costo por bomba en el reporte diario`.

---

### Task 9: Verificación integral y PR

- [ ] **Step 1:** `cd nodered/weg-api && node --test` → todo PASS.
- [ ] **Step 2:** `run.sh fe "npm run build && npx vitest run && npx eslint ."` → sin errores.
- [ ] **Step 3:** Revisión de la rama completa (`superpowers:requesting-code-review`) contra la spec y este plan; corregir lo que surja.
- [ ] **Step 4:** `git push -u origin feat/tarifas-electricas` y `gh pr create --base master` con título `feat: tarifas eléctricas y costos (Pliego 21 ANDE)`, cuerpo con resumen, cómo probar, el desvío de `CACHE_V`, y `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. **No** mergear, taggear ni actualizar planta sin OK explícito.
