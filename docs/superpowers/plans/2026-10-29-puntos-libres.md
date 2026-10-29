# Mediciones y señales libres — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el mapa de puntos de reconectadores y reguladores admita mediciones (`med`) y señales
(`senal`) libres con nombre y unidad, y que se vean en tarjetas, detalle, pestañas del Dashboard,
Tendencias (otras mediciones, perfil, fasorial), reportes y Excel; con el modelo `tapelectro`
cargado con los puntos verificados del RUA-01.

**Architecture:** El poller calcula `extras`/`senales` con una función pura (`extrasDe`) y los
publica y escribe en `campo_data` como `x_<slug>` / `s_<slug>`. La API valida las keys nuevas,
amplía el modelo `tapelectro` y suma `summary.extras`. El portal muestra todo a partir del payload
MQTT y de las series que ya existen. `slug` vive en un solo módulo ESM del portal y en copias
idénticas en poller y API, controladas por test.

**Tech Stack:** Node 20 (`node --test`), React/Vite/TS/Zustand, InfluxDB 2 (Flux), pdfkit.

**Spec:** `docs/superpowers/specs/2026-10-29-puntos-libres-design.md`

## Global Constraints

- Rama `feat/puntos-libres` (spec en `7a373e6`). Stage por ruta explícita (hay `package-lock.json`
  sin trackear a propósito). Commits con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Keys: `med` {`nombre` 1–40, `unidad` 0–10 (def. ""), `decimales` 0–3 (def. 0), `principal` bool,
  `rol?` ∈ {`angulo`,`fp`,`kw`,`kvar`}}; `senal` {`nombre` 1–40, `principal` bool}. Repetibles.
- Sumas: `med` con el mismo `nombre` se suman; deben compartir `unidad`, `decimales`, `principal`,
  `rol`; si falta una parte → `null`.
- `slug(nombre)`: minúsculas, NFD sin diacríticos, `[^a-z0-9]` → `_`, sin `_` repetidos ni en los
  extremos. «Tensión fuente» → `tension_fuente`.
- Influx `campo_data`: `x_<slug>` (número finito), `s_<slug>` (`0i`/`1i`); `null` no se escribe.
- Payload MQTT: `extras`/`senales` solo si el mapa tiene puntos libres; offline → `{}`.
- Hasta 8 nombres `principal` por equipo; cada `rol` una vez; mapa 1–64 puntos.
- Textos del portal en español rioplatense; `null` → «—».
- Tests Node: `MSYS_NO_PATHCONV=1 wsl -d Ubuntu -u root -- bash <scratchpad>/nodetest.sh <paquete> [test]`;
  frontend: `… <scratchpad>/frontbuild.sh` (las vistas son chunks lazy: el «needle» puede dar 0 en
  index; buscar en el chunk de la vista).

## Review Focus

- **Una parte de una suma ilegible** (p. ej. «Operaciones» miles OK, unidades `null`): el total debe
  ser `null` («—»), no solo los miles → Task 2, test `extrasDe suma con null`.
- **Mapa sin puntos libres:** payload, líneas de Influx, resumen y reportes idénticos a hoy → Task 2
  (`sin puntos libres no agrega claves`) y Task 4 (`sin extras no hay summary.extras`).
- **Nombre con tildes/símbolos** («Ángulo», «Potencia (kW)»): mismo field en poller, API y portal,
  si no Tendencias y reportes no encuentran la serie → Task 1, test de igualdad de los tres `slug`.
- **Señal % activa sobre muchos datos:** no perder precisión por el redondeo de `parseCSV` (2
  decimales) → Task 4 usa sum/count, test con 41400/43200.
- **Equipo offline con extras en pantalla:** al quedar offline no deben quedar valores viejos en
  tarjeta/detalle → Task 2 (payload offline `extras:{}`) y Task 5 (la tarjeta solo muestra extras
  si está en línea).

---

### Task 1: `slug` en portal, poller y API

**Files:**
- Create: `frontend-react/src/lib/slug.js` (ESM) + `frontend-react/src/lib/slug.d.ts`
- Create: `nodered/weg-modbus-poller/src/slug.js`, `nodered/weg-api/src/services/slug.js` (CommonJS, mismo cuerpo)
- Test: `nodered/weg-modbus-poller/test/slug.test.js`

**Interfaces:**
- Produces: `slug(nombre: string) → string` (export default en ESM; `module.exports = { slug }` en CJS).

- [ ] **Step 1: Test que falla** (`slug.test.js`): casos `«Tensión fuente»→tension_fuente`,
  `«Ángulo»→angulo`, `«Potencia (kW)»→potencia_kw`, `«  FP  RG1 »→fp_rg1`, `«Ñandú-2»→nandu_2`;
  y que poller, API (`require('../../weg-api/src/services/slug')`) y portal
  (`await import('../../../frontend-react/src/lib/slug.js')`) dan lo mismo para todos.
- [ ] **Step 2:** `nodetest.sh nodered/weg-modbus-poller test/slug.test.js` → FAIL.
- [ ] **Step 3:** Implementar los tres archivos (mismo algoritmo, Global Constraints).
- [ ] **Step 4:** Test → PASS; `frontbuild.sh` OK (tsc acepta el import vía `slug.d.ts`).
- [ ] **Step 5:** Commit `feat: slug compartido para mediciones libres`.

---

### Task 2: Poller — `extrasDe`, payload y Influx

**Files:**
- Modify: `nodered/weg-modbus-poller/src/points.js` (`extrasDe`, `valoresDe`, `campoLine`)
- Modify: `nodered/weg-modbus-poller/src/index.js` (`pollCampo` ~257–275)
- Test: `nodered/weg-modbus-poller/test/points.test.js`

**Interfaces:**
- Consumes: Task 1 `slug`.
- Produces: `extrasDe(mapa, vals) → { extras, senales } | null` (`null` si el mapa no tiene `med`
  ni `senal`); `valoresDe` excluye `med`/`senal`; `campoLine(st, ts)` lee además `st.extras` /
  `st.senales` y escribe `x_<slug>` / `s_<slug>`.

- [ ] **Step 1: Tests que fallan:** `extrasDe` suma «Operaciones» (1×1000 + 278 = 1278);
  **`extrasDe suma con null`** → `null`; `senal` bool/bit; **`sin puntos libres no agrega claves`**
  (`extrasDe` → `null`); `valoresDe` no incluye `med`/`senal`; `campoLine` con
  `{ extras: { 'Tensión fuente': 20996 }, senales: { 'Motor elevando': true } }` →
  `x_tension_fuente=20996,s_motor_elevando=1i`, y `null` omitido.
- [ ] **Step 2:** `nodetest.sh nodered/weg-modbus-poller test/points.test.js` → FAIL.
- [ ] **Step 3:** Implementar. En `pollCampo`, online: `const ex = extrasDe(...)`; si `ex`, sumar
  `extras`/`senales` al payload; offline con mapa con puntos libres: `extras: {}, senales: {}`.
- [ ] **Step 4:** Suite del poller → PASS; `node --check src/index.js`.
- [ ] **Step 5:** Commit `feat(poller): mediciones y senales libres (extras, senales, x_/s_ en campo_data)`.

---

### Task 3: API — validación y modelo `tapelectro`

**Files:**
- Modify: `nodered/weg-api/src/services/validate.js` (`validateCampo`, `CAMPO_KEYS`)
- Modify: `nodered/weg-api/src/services/modelos.js`
- Test: `nodered/weg-api/test/campoConfig.test.js`, `test/modelos.test.js`

**Interfaces:**
- Consumes: Task 1 `slug` (API copy).
- Produces: `med`/`senal` en `CAMPO_KEYS` de reco y reg; reglas spec §2.3; `tapelectro` con los
  puntos de spec §4.1 para RG1.

- [ ] **Step 1: Tests que fallan:** válidos `med` (con unidad, decimales, rol) y `senal` (bool);
  suma «Operaciones» con dos `med` iguales en todo salvo `addr`/`escala` → OK; suma con `unidad`
  distinta → error; `med` y `senal` con mismo slug → error; 9 nombres `principal` → error; `rol`
  repetido → error; `nombre` vacío o de 41 → error; `decimales: 4` → error; `med` con `bit` → error;
  `senal` sin `bit`/`valor`/`bool` → error; `tapelectro` valida e incluye `Tensión fuente` (fc 3,
  addr 9238), `Operaciones` ×2 (9290 escala 1000, 9292), `Motor elevando` (fc 1, addr 48, bool).
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/campoConfig.test.js test/modelos.test.js` → FAIL.
- [ ] **Step 3:** Implementar; mensajes con el formato `<tag> (<nombre>): mapa[<i>].<campo> …`.
  `modelos.js`: tabla de spec §4.1 (RG1) + descripción con los corrimientos de RG2/RG3 y la sugerencia
  de NoBreak (BI 6) y Trifásico (BI 23) en RG1.
- [ ] **Step 4:** Suite weg-api → PASS.
- [ ] **Step 5:** Commit `feat(api): validacion de mediciones y senales libres; modelo tapelectro ampliado`.

---

### Task 4: Reportes — `summary.extras`, PDF y Excel

**Files:**
- Modify: `nodered/weg-api/src/services/reports.js` (`extrasSummary`, `generateSummary`, `toSummaryPDF`, `reportToXLSX`)
- Test: `nodered/weg-api/test/extrasSummary.test.js` (nuevo)

**Interfaces:**
- Consumes: Task 1 `slug`; `aggBy`, `firstLastBy` existentes.
- Produces: `extrasSummary({ config, mean, min, max, fl, sums, counts }) → Array<{ equipo, kind,
  nombre, unidad, decimales, tipo, avg, min, max, delta?, pctActiva? }>` (pura);
  `summary.extras` solo con el módulo `unifilar` y equipos habilitados con puntos libres.
  Encabezados PDF/XLSX: `Equipo, Medición, Unidad, Prom., Mín., Máx., Δ / % activa`; hoja
  «Mediciones adicionales».

- [ ] **Step 1: Tests que fallan:** `med` prom/mín/máx redondeados a `decimales`; suma con
  `fl { first: 1270, last: 1278 }` → `delta 8`; **senal `pctActiva`** con `sums 41400 / counts
  43200` → `95.8` (1 decimal); equipo sin datos → valores `null`; **`sin extras no hay
  summary.extras`** (Influx falso como `flowVolume.test.js`, sin consultas `x_`/`s_`);
  `reportToXLSX` con la hoja nueva; `toSummaryPDF` → Buffer `%PDF`.
- [ ] **Step 2:** `nodetest.sh nodered/weg-api test/extrasSummary.test.js` → FAIL.
- [ ] **Step 3:** Implementar: fields de `med` → `mean`/`min`/`max` (y `firstLastBy` para sumas);
  fields de `senal` → `sum`/`count`; consultas con `soft()` como el bloque `campo`.
- [ ] **Step 4:** Suite weg-api → PASS.
- [ ] **Step 5:** Commit `feat(reportes): mediciones adicionales en resumen, PDF y Excel`.

---

### Task 5: Portal — tipos, tarjetas, detalle y pestañas del Dashboard

**Files:**
- Modify: `frontend-react/src/types.ts` (`Punto` con `med`/`senal`; `CampoState.extras?`, `senales?`)
- Modify: `frontend-react/src/components/RegCard.tsx`, `RecoCard.tsx`, `CampoBase.tsx`
- Create: `frontend-react/src/components/CampoDetalle.tsx` (panel lateral), `frontend-react/src/components/Fasorial.tsx`
- Modify: `frontend-react/src/views/Dashboard.tsx` (tipo `Tab` + pestañas, franja de resumen)

**Interfaces:**
- Consumes: payload `extras`/`senales`; `CampoConfig.mapa` (para `principal`, `unidad`, `decimales`, `rol`).
- Produces: `<Fasorial equipos={Array<{ nombre, color, angulo, fp?, kw?, kvar? }>} size?>`;
  `<CampoDetalle st cfg onClose>`.

- [ ] **Step 1:** Tarjetas: grilla de `med` principales («nombre: valor unidad» con `decimales`) y
  luces de `senal` principales, solo con el equipo en línea; `null` → «—». Clic → `CampoDetalle`
  (Mediciones, Señales, Alarmas activas, enlace a Tendencias).
- [ ] **Step 2:** `Fasorial`: SVG, un vector por equipo con `rol: angulo` (0° a la derecha,
  antihorario), círculo con marcas 0/90/180/270, tabla debajo (ángulo, FP, kW, kVAr si existen).
- [ ] **Step 3:** Dashboard: `Tab` suma `reguladores` y `reconectadores` (con módulo y equipos
  habilitados), etiquetas «Reguladores (n)» / «Reconectadores (n)»; las secciones de abajo se
  mueven adentro. Pestaña Reguladores: franja con tensión de carga de cada regulador + `Fasorial`
  chico.
- [ ] **Step 4:** `frontbuild.sh` → OK (needle «Reguladores» en el chunk del Dashboard/índice).
- [ ] **Step 5:** Commit `feat(portal): mediciones libres en tarjetas, detalle y pestanas del Dashboard`.

---

### Task 6: Portal — Tendencias

**Files:**
- Modify: `frontend-react/src/views/RegsTab.tsx`, `RecosTab.tsx` (y `campoChart` si hace falta)

**Interfaces:**
- Consumes: Task 1 `slug`; filas de series `campo` con `x_*`/`s_*`; Task 5 `Fasorial`.

- [ ] **Step 1:** Selector «Otras mediciones» (las `med` del equipo, múltiple): un `TrendChart`
  por unidad; las `senal` elegidas como franja de estado (mismo componente que la franja del reco).
- [ ] **Step 2:** «Perfil entre equipos»: elegir un nombre de `med` y graficarlo para todos los
  equipos del tipo que lo tengan (una serie por equipo).
- [ ] **Step 3:** En Reguladores, `Fasorial` grande con los valores en vivo del store.
- [ ] **Step 4:** `frontbuild.sh` → OK.
- [ ] **Step 5:** Commit `feat(portal): tendencias de mediciones libres, perfil entre equipos y fasorial`.

---

### Task 7: Portal — editor de mapa

**Files:**
- Modify: `frontend-react/src/views/MapaEditor.tsx`

- [ ] **Step 1:** Keys `med` y `senal` en el desplegable; columnas Nombre, Unidad, Decimales,
  Principal, Rol (las que apliquen según la key); «En vivo» lee `extras[nombre]` /
  `senales[nombre]`. Al cambiar el nombre de un punto existente, aviso «el histórico sigue con el
  nombre anterior».
- [ ] **Step 2:** `frontbuild.sh` → OK.
- [ ] **Step 3:** Commit `feat(portal): editor de mapa con mediciones y senales libres`.

---

### Task 8: Integración, PR y puesta en planta

**Files:** ninguno del repo (scripts en el scratchpad).

- [ ] **Step 1:** Imagen edge de la rama; actualizar la instancia dind `weg-cm-a` (cambiar
  `WEG_VERSION` en `.env` antes del update); esclavo Modbus simulado con puntos para `med`/`senal`
  (incluida una suma); reguladores de prueba con el modelo `tapelectro`.
- [ ] **Step 2:** Verificar payload (`extras`/`senales`), tarjeta, detalle, pestañas, Tendencias
  (otras mediciones, perfil, fasorial), resumen y Excel con la hoja nueva.
- [ ] **Step 3:** PR `feat/puntos-libres` → master con CI en verde (`gh pr checks` antes de mergear).
- [ ] **Step 4:** Tras merge y tag `v1.11.0` (los crea el usuario) y con su OK explícito: update de
  planta y oficina, y script que agrega a «Tapelectro RG1/RG2/RG3» los puntos de spec §4.1 con los
  índices de cada regulador (+ NoBreak y Trifásico en RG1), con respaldo de `config.json`, la
  validación y el chequeo de licencia de la API (`--dry` primero).
