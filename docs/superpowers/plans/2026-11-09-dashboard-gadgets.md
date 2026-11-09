# Dashboard con gadgets — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dashboard armado con gadgets que cada usuario elige, ordena (arrastre + ▲▼) y dimensiona, guardado por usuario en el servidor, con predeterminado del admin; «Mis gráficos» pasa también al servidor.

**Architecture:** Backend: servicio `prefs` (archivo `/config/prefs.json`) y ruta `/api/prefs` para cualquier usuario logueado, siempre sobre su propia entrada. Frontend: catálogo + saneo puro en `lib/gadgets.ts`, store `store/prefs.ts`, un componente por gadget en `components/dashboard/`, y `Dashboard.tsx` que renderiza el layout efectivo en una grilla de 12 columnas con modo edición (`@dnd-kit`).

**Tech Stack:** Node 26 + Express 5 (`node --test`), React 19 + TypeScript + Tailwind 4 + zustand + recharts 3 (vitest), `@dnd-kit/core` + `@dnd-kit/sortable` (nuevas).

**Spec:** `docs/superpowers/specs/2026-11-09-dashboard-gadgets-design.md`

## Global Constraints

- Todo en la línea ISA-101 de `docs/diseno-industrial.md`: solo componentes de `components/ui/` y `components/config/`; ningún control nativo; esquinas 2 px, sin sombras; mayúsculas en etiquetas/títulos/botones; colores solo de tokens; gráficos vía `lib/paleta.ts`; «—» para datos no frescos.
- Textos de interfaz y commits en español rioplatense; botones verbo primero.
- Unidades: caudal en L/s (`aLps`, `UNIDAD_CAUDAL` de `lib/flow`; el dato sigue en m³/h); energía específica kWh/L.
- Anchos válidos: 4, 6, 8, 12 (S, M, L, XL). Layout `{ v: 1, items }`.
- Límites del backend: cuerpo ≤ 64 KB; `dashboard` ≤ 30 ítems, `id`/`tipo` string ≤ 40; `misGraficos` ≤ 50 gráficos, ≤ 12 trazas.
- Claves de prefs en lista blanca: `dashboard`, `misGraficos`. Clave de usuario: nombre en minúsculas.
- Dependencias: build endurecido (`npm ci --ignore-scripts`, lockfile commiteado, `npm audit` en CI). Solo se agregan `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` con versión exacta y lockfile regenerado.
- Tests del frontend: Windows no tiene `node_modules`; correr con `sh .superpowers/sdd/2026-11-09-dashboard-gadgets/run.sh fe "<cmd>"` (copia del script de Configuración etapa 2 con rutas a `C:\dev\weg-scada-gadgets`, creado en la Task 2). Backend: `run.sh api "<cmd>"` (mismo script, `SRC=nodered/weg-api`).

## Review Focus

- Usuario «Juan» que entra como «juan»: mismas prefs (clave en minúsculas) → test en Task 1.
- Gadget que referencia un medidor, sitio o gráfico que ya no existe: el gadget cae al valor por defecto o muestra su vacío, nunca rompe el Dashboard → tests de `sanearOpciones` en Task 2 y error boundary en Task 5.
- Licencia que pierde un módulo con un gadget guardado: se oculta al mostrar, pero no se borra del layout guardado hasta que el usuario guarde → test en Task 2 (`sanearLayout` no muta la entrada).
- `prefs.json` ausente o corrupto: lectura vacía, sin caída del API → test en Task 1.
- Dos pestañas guardando: gana la última escritura (aceptado, sin bloqueo) — no requiere test; se nota en el PR.

---

### Task 1: Backend — servicio y ruta `/api/prefs`

**Files:**
- Create: `nodered/weg-api/src/services/prefs.js`
- Create: `nodered/weg-api/src/routes/prefs.js`
- Modify: `nodered/weg-api/src/server.js` (montar `app.use('/api/prefs', prefsRoutes)` junto a `/api/settings`, después de `requireAuth`)
- Modify: `nodered/weg-api/src/routes/settings.js` (PUT y DELETE de usuarios)
- Test: `nodered/weg-api/test/prefs.test.js`

**Interfaces:**
- Produces (servicio, `module.exports`):
  - `getDe(user: string) -> { dashboard: object|null, misGraficos: array|null, defecto: { dashboard: object|null } }`
  - `set(user, clave, valor)` — lanza `Error` con `.status = 400` si clave fuera de lista o forma inválida
  - `borrar(user, clave)`, `setDefecto(layout)`, `borrarDefecto()`
  - `renombrar(antes, despues)`, `borrarUsuario(user)`
  - `validarDashboard(v) -> void` y `validarMisGraficos(v) -> void` (lanzan)
- Produces (HTTP): ver tabla de la spec. Respuesta de escrituras: `{ ok: true }`. `GET` devuelve `getDe(req.auth.user)`. Las rutas `/defecto/dashboard` se declaran **antes** que `/:clave` y usan `requireAdmin`.

- [ ] **Step 1: Escribir `prefs.test.js`** (mismo arranque que `branding.test.js`: `CONFIG_PATH` en un tmp, usuarios por env, `login` para obtener tokens de admin y operador, app express con `express.json({ limit: '64kb' })` + `requireAuth` + la ruta). Casos:
  - `getDe('nadie')` → `{ dashboard: null, misGraficos: null, defecto: { dashboard: null } }`.
  - operador `PUT /api/prefs/dashboard` con `{ v:1, items:[{ id:'a', tipo:'kpis', ancho:12 }] }` → 200; `GET` devuelve ese layout; `getDe('OPERADOR')` también (minúsculas).
  - `PUT /api/prefs/otra` → 400; `ancho: 5` → 400; 31 ítems → 400; `v: 2` → 400; `misGraficos` con 51 → 400.
  - operador `PUT /api/prefs/defecto/dashboard` → 403; admin → 200 y aparece en `GET` del operador como `defecto.dashboard`.
  - `DELETE /api/prefs/dashboard` → luego `dashboard: null`.
  - `renombrar('operador','op2')` mueve la entrada; `borrarUsuario('op2')` la elimina.
  - escribir basura en `prefs.json` → `getDe` vacío sin lanzar.

- [ ] **Step 2: Correr y ver que falla**
  Run: `sh .superpowers/sdd/2026-11-09-dashboard-gadgets/run.sh api "node --test test/prefs.test.js"` → FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `services/prefs.js` y `routes/prefs.js`**. `PREFS_PATH = path.join(path.dirname(CONFIG_PATH), 'prefs.json')`; `read()`/`write()` igual a `services/settings.js` (tmp + rename; lectura inválida → `{}`). Estructura `{ usuarios: {}, defecto: {} }`. Validación estructural según Global Constraints; `opciones` debe ser objeto plano si viene. Tamaño: `Buffer.byteLength(JSON.stringify(valor)) > 65536` → 400.

- [ ] **Step 4: Enganchar en `routes/settings.js`**: tras `updateUser` con cambio de nombre → `prefs.renombrar(r.before.user, r.after.user)`; tras `deleteUser` → `prefs.borrarUsuario(name)`. Montar en `server.js`.

- [ ] **Step 5: Correr toda la suite del API**
  Run: `run.sh api "node --test"` → PASS (incluidos los tests existentes).

- [ ] **Step 6: Commit** — `feat(api): preferencias por usuario en /api/prefs (dashboard y mis gráficos)`

### Task 2: Catálogo de gadgets y saneo del layout

**Files:**
- Create: `.superpowers/sdd/2026-11-09-dashboard-gadgets/run.sh` (ver Global Constraints; modos `fe` y `api`)
- Create: `frontend-react/src/lib/gadgets.ts`
- Test: `frontend-react/src/lib/gadgets.test.ts`

**Interfaces:**
- Produces:
  - tipos `Ancho`, `TipoGadget`, `ItemGadget`, `Layout` (exactos de la spec)
  - `CATALOGO: Record<TipoGadget, { titulo: string; anchos: Ancho[]; anchoDefecto: Ancho; modulo?: string; multiple: boolean; sanear: (o: unknown, ctx: CtxGadgets) => Record<string, unknown> }>`
  - `type CtxGadgets = { hasModule: (m: string) => boolean; medidores: string[]; sitios: string[]; graficos: string[] }`
  - `DEFECTO_CODIGO: Layout` = alarmas 12, kpis 12, bombas 8, medidor 4
  - `sanearLayout(l: unknown, ctx: CtxGadgets): Layout` — pura, no muta la entrada
  - `layoutEfectivo(usuario: Layout|null, defecto: Layout|null, ctx): Layout` = `sanearLayout(usuario ?? defecto ?? DEFECTO_CODIGO, ctx)`
  - `mover(l: Layout, id: string, delta: -1 | 1): Layout`, `moverA(l: Layout, desde: number, hasta: number): Layout`
  - `nuevoItem(tipo: TipoGadget): ItemGadget` (id `${tipo}-${Date.now().toString(36)}${random}`)
  - `KPI_IDS = ['motores','potencia','caudal','energia','kwhL','frecuencia','perdida'] as const`

- [ ] **Step 1: Escribir `gadgets.test.ts`**:
  - `sanearLayout({v:1,items:[{id:'x',tipo:'nope',ancho:4}]})` → sin ítems.
  - sin `medidores` en `hasModule`: ítem `medidor` descartado; con módulo, `opciones.medidor` inexistente en `ctx.medidores` → `null`.
  - dos `kpis` → queda el primero; dos `tendencia` → quedan ambos.
  - `alarmas` con `ancho: 6` → 12; `bombas` con `ancho: 4` → 8.
  - ids repetidos → el segundo recibe id nuevo distinto.
  - `bombas` con `sitios: ['X']` y `ctx.sitios = ['A']` → `sitios: null`; `tendencia` con `ventanaH: 3` → 1, `magnitud:'caudal'` sin módulo caudales → `'potencia'`.
  - `misGrafico` con gráfico inexistente se **conserva** (el gadget muestra «Este gráfico ya no existe.»).
  - entrada original intacta tras `sanearLayout` (`structuredClone` antes/después igual).
  - `layoutEfectivo(null, null, ctx)` igual a `DEFECTO_CODIGO` saneado; `layoutEfectivo(null, D, ctx)` usa `D`.
  - `mover` en los bordes no cambia nada; `moverA(l,0,2)` reordena.

- [ ] **Step 2: Correr y ver que falla** — `run.sh fe "npx vitest run src/lib/gadgets.test.ts"` → FAIL.
- [ ] **Step 3: Implementar `lib/gadgets.ts`.**
- [ ] **Step 4: Correr y ver que pasa** — mismo comando → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): catálogo de gadgets y saneo del layout del Dashboard`

### Task 3: Store de prefs y Mis gráficos en el servidor

**Files:**
- Create: `frontend-react/src/store/prefs.ts`
- Modify: `frontend-react/src/App.tsx:116` (cargar prefs cuando `authed`, junto a server/license)
- Modify: `frontend-react/src/views/MisGraficos.tsx:38-52` (leer/escribir del store en vez de `localStorage`)
- Test: `frontend-react/src/store/prefs.test.ts`

**Interfaces:**
- Consumes: `apiJson` de `lib/api`, `Layout` de Task 2, `Grafico` de `lib/misGraficos`.
- Produces:
  - `usePrefs` (zustand): `{ estado: 'cargando'|'listo'|'error'; dashboard: Layout|null; misGraficos: Grafico[]|null; defecto: Layout|null; cargar(user: string): Promise<void>; guardar(clave: 'dashboard'|'misGraficos', v): Promise<void>; borrar(clave): Promise<void>; guardarDefecto(l: Layout): Promise<void>; borrarDefecto(): Promise<void> }` — `guardar*` actualiza el estado solo si el PUT responde ok; si falla, relanza (el que llama muestra el toast).
  - `migrarMisGraficos(user: string, servidor: Grafico[]|null, leerLocal: (k: string) => string|null): Grafico[]|null` — pura: devuelve lo local a subir solo si `servidor === null` y lo local es un array no vacío; si no, `null`.

- [ ] **Step 1: Escribir `prefs.test.ts`**: `migrarMisGraficos` (servidor null + local con 2 → los 2; servidor `[]` → null; local inválido → null; local vacío → null). `cargar` con `apiJson` mockeado (`vi.mock('@/lib/api')`): estado `listo` y campos; si rechaza → `estado: 'error'`; tras cargar con servidor null y local presente, se llama `PUT /prefs/misGraficos`.
- [ ] **Step 2: Correr y ver que falla** — `run.sh fe "npx vitest run src/store/prefs.test.ts"`.
- [ ] **Step 3: Implementar el store**; `cargar` corre la migración tras el GET (clave local `weg_mis_graficos:${user || 'anon'}`, igual que hoy). En `MisGraficos.tsx`: estado inicial de `usePrefs().misGraficos ?? leer(user)`; el efecto que hoy escribe `localStorage` pasa a `usePrefs.getState().guardar('misGraficos', graficos)` con debounce de 800 ms y toast `No se pudo guardar: …` si falla; si `estado === 'error'`, no guarda.
- [ ] **Step 4: Correr y ver que pasa** — mismo comando + `npx vitest run` completo → PASS.
- [ ] **Step 5: Commit** — `feat(frontend): preferencias por usuario en el servidor; Mis gráficos migra desde el navegador`

### Task 4: Gadgets (vista normal) y Dashboard por layout

**Files:**
- Create: `frontend-react/src/components/dashboard/GadgetMarco.tsx` (Card con título opcional + error boundary «No se pudo mostrar este gadget.»)
- Create: `frontend-react/src/components/dashboard/{Alarmas,Indicadores,Bombas,Medidor,Generadores,Tendencia,MisGrafico}.tsx`
- Create: `frontend-react/src/lib/kpis.ts` (cálculo de KPIs sacado de `Dashboard.tsx:77-104`)
- Create: `frontend-react/src/lib/useSeriesVentana.ts` (POST `/api/reports/series` para las últimas `ventanaH` horas, refresco 60 s; en modo no-live devuelve `null`)
- Create: `frontend-react/src/components/GraficoUsuario.tsx` (sacado de `MisGraficos.tsx`: render de un `Grafico` con `Datos|null` + buffer)
- Modify: `frontend-react/src/views/Dashboard.tsx` (grilla `grid grid-cols-12 gap-4`, `col-span-12 md:col-span-{ancho}` con clases literales por ancho; render por `CATALOGO`)
- Modify: `frontend-react/src/views/MisGraficos.tsx` (usa `GraficoUsuario`)
- Test: `frontend-react/src/lib/kpis.test.ts`

**Interfaces:**
- Consumes: Task 2 (`layoutEfectivo`, `CATALOGO`, `CtxGadgets`), Task 3 (`usePrefs`).
- Produces:
  - `type GadgetProps<O> = { opciones: O; editando: boolean }` — firma común de los 7 componentes.
  - `calcularKpis(entrada: { driveList; flowmeters; config; hasCaudales; hero; energiaHero?: number; lossData }) -> { id: typeof KPI_IDS[number]; label: string; value: string; unit: string; title?: string }[]` — mismo resultado que hoy, con `id` por indicador; `Indicadores` filtra por `opciones.ocultos`.
  - `useSeriesVentana(ventanaH: 1|6|24) -> Datos & { flows? } | null`

- [ ] **Step 1: `kpis.test.ts`**: sin caudal configurado, `caudal` y `kwhL` valen `'—'` con el `title` de hoy; con caudal 36 m³/h y 10 kW de motores → caudal `'10,0'` L/s y kWh/L `'0,000278'`; sin `lossData` no hay ítems `perdida`; motores `'1 / 2'` con un fuera de servicio excluido.
- [ ] **Step 2: Correr y ver que falla.**
- [ ] **Step 3: Implementar** `lib/kpis.ts`, los gadgets y el Dashboard en vista normal. Detalles que el código no determina:
  - `Alarmas` y `Indicadores` sin título de marco (aspecto actual); los demás con título del catálogo (`misGrafico`: título del gráfico).
  - `Medidor`: el `<select>` nativo se reemplaza por `Select` de `components/ui`; la elección rápida es estado local no guardado, inicial = `opciones.medidor ?? config.primaryMeter ?? primero online`.
  - `Bombas`: `agruparPorSitio` filtrado por `opciones.sitios`.
  - `Generadores`: grilla de `GenCard` con `useDrivesStore(s => s.campo)` y los `config` de tipo gen (misma fuente que `views/Generadores.tsx`), `onOpen` → `/generadores/:name`; vacío «Todavía no hay generadores.»
  - `Tendencia`: potencia total kW (suma de `drives[].power`) o caudal total L/s (suma de `flows[].flow` convertido con `aLps`) desde `useSeriesVentana`; sin Influx, buffer de `driveHistory`. Color `--serie-1` vía `lib/paleta.ts`.
  - `MisGrafico`: `GraficoUsuario` con el gráfico de `usePrefs().misGraficos`; si no existe, «Este gráfico ya no existe.»
  - El esqueleto (`SkeletonVista`) se mantiene mientras no hay config ni datos o `usePrefs.estado === 'cargando'`.
- [ ] **Step 4: Correr** `npx vitest run` y `npx tsc -b --noEmit` (o el `build` del package) → PASS. Ver en el navegador (preview Vite en WSL) que, sin prefs, el Dashboard se ve como antes.
- [ ] **Step 5: Commit** — `feat(frontend): Dashboard armado con gadgets según el layout del usuario`

### Task 5: Modo edición

**Files:**
- Modify: `frontend-react/package.json` + `package-lock.json` (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`, versión exacta)
- Create: `frontend-react/src/components/dashboard/EdicionGadget.tsx` (barra de edición de un gadget, `useSortable`)
- Create: `frontend-react/src/components/dashboard/CatalogoDialog.tsx`
- Create: `frontend-react/src/components/dashboard/OpcionesDialog.tsx` (formulario por tipo: `Checkbox` de indicadores, `Checkbox` de sitios + «Todos», `Select` de medidor / magnitud / ventana / gráfico)
- Modify: `frontend-react/src/views/Dashboard.tsx`
- Modify: `frontend-react/src/components/config/useAvisoSalida.ts` (texto genérico: «Hay cambios sin guardar. ¿Salir y perderlos?»; ajustar el test si lo menciona)
- Test: `frontend-react/src/lib/gadgets.test.ts` (agregar)

**Interfaces:**
- Consumes: `useEdicion<Layout>` y `BarraGuardado` de `components/config`, `useAvisoSalida`, `ConfirmarDialog`, `usePrefs` (Task 3), `mover`/`moverA`/`nuevoItem`/`CATALOGO` (Task 2).
- Produces: `disponiblesParaAgregar(l: Layout, ctx: CtxGadgets) -> { tipo: TipoGadget; deshabilitado: boolean }[]` en `lib/gadgets.ts` (sin licencia: no aparecen; no múltiple ya presente: deshabilitado).

- [ ] **Step 1: Test de `disponiblesParaAgregar`**: sin `generadores` no aparece; con `kpis` presente → `kpis` deshabilitado; `tendencia` presente → habilitado.
- [ ] **Step 2: Correr y ver que falla; implementar; correr y ver que pasa.**
- [ ] **Step 3: Instalar dnd-kit** (en WSL/Docker: `npm install --save-exact @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`, copiar `package.json` y `package-lock.json` de vuelta) y `npm audit --omit=dev` sin altas.
- [ ] **Step 4: Implementar el modo edición** según la spec, sección «Modo edición». Puntos que fija el plan:
  - Botonera arriba a la derecha: normal = «PERSONALIZAR» (`outline sm`, deshabilitado si `usePrefs.estado === 'error'`); edición = «AGREGAR GADGET», «RESTABLECER», (admin) «GUARDAR COMO PREDETERMINADO» / «QUITAR PREDETERMINADO», «LISTO».
  - `useEdicion(layoutEfectivo)`; GUARDAR → `usePrefs.guardar('dashboard', valor)`; error → `toast.error('No se pudo guardar: …')` y la edición se conserva.
  - «LISTO» con cambios: no sale; la `BarraGuardado` queda visible (sale solo cuando `sucio === false`).
  - RESTABLECER → `ConfirmarDialog` («¿Volver al Dashboard predeterminado? Se borra tu personalización.») → `usePrefs.borrar('dashboard')`.
  - GUARDAR COMO PREDETERMINADO → `ConfirmarDialog` con el mensaje de la spec → `guardarDefecto(valor)`.
  - `DndContext` con `PointerSensor` (`activationConstraint: { distance: 6 }`), `TouchSensor` (`delay: 200, tolerance: 6`), `KeyboardSensor` con `sortableKeyboardCoordinates`; `SortableContext` + `rectSortingStrategy`; `onDragEnd` → `moverA`.
  - Contenido del gadget con `pointer-events-none select-none` mientras se edita; `Alarmas` sin alarmas muestra «Sin alarmas activas.».
- [ ] **Step 5: Correr** `npx vitest run`, typecheck y `npm run lint` → PASS.
- [ ] **Step 6: Commit** — `feat(frontend): modo edición del Dashboard (arrastre, ▲▼, ancho, opciones, predeterminado)`

### Task 6: Guía de diseño, verificación y PR

**Files:**
- Modify: `docs/diseno-industrial.md` (en «Patrones de pantalla»: «Gadgets / modo edición» — botón PERSONALIZAR, barra de edición con asa + ▲▼ + ancho S/M/L/XL + opciones + quitar, contenido inerte en edición, guardado con `BarraGuardado`)

- [ ] **Step 1: Documentar el patrón** (3–5 líneas).
- [ ] **Step 2: Verificación manual en preview** (Vite en WSL contra datos mock): operador y admin; claro y oscuro; arrastre con mouse, con teclado (Espacio + flechas) y en modo móvil (`resize_window` mobile); guardar, recargar, ver lo mismo; RESTABLECER; predeterminado del admin visto por el operador; Mis gráficos migrado desde `localStorage`.
- [ ] **Step 3: Suites completas** — `run.sh api "node --test"`, `run.sh fe "npx vitest run && npm run lint && npm run build"` → PASS.
- [ ] **Step 4: Commit, push y PR contra master** con el checklist de la guía de diseño marcado y la nota «Dos pestañas: gana la última escritura». Merge, tag y update de planta solo con OK del usuario.
