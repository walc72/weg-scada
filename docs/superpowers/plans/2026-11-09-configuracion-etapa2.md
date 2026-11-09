# Configuración, etapa 2: estilo y guardado uniformes — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que todas las subpestañas de Configuración usen las mismas piezas (sección, campo, barra de guardado, confirmación), guarden por sección sin contaminarse entre sí, pidan confirmación al salir con cambios y no tiren abajo la pantalla ante un error de guardado.

**Architecture:** Hoy cada pestaña muta la config global (`store.setConfig`) y llama `store.save()`, que manda la config entera: un cambio pendiente de una sección se guarda con el «Guardar» de otra. Se agrega `store.guardar(cambio)`, que aplica una función sobre la config vigente y guarda solo eso; cada sección edita una copia local (`useEdicion`) y llama a `guardar` con su parte. Las piezas visuales viven en `components/config/` y siguen `docs/diseno-industrial.md`.

**Tech Stack:** React 19, TypeScript, Tailwind 4, zustand, vitest; componentes de `components/ui/` (estilo industrial, ya mergeado).

**Spec:** `docs/superpowers/specs/2026-11-09-configuracion-design.md` (sección «Etapa 2») y la guía `docs/diseno-industrial.md` (vinculante para toda la UI).

## Global Constraints

- Toda la UI sigue `docs/diseno-industrial.md`: solo componentes de `components/ui/` y `components/config/`; ningún `<select>`, `<input type="checkbox">`, `<table>`, `<label>` nativo ni `confirm()` del navegador en `views/config/`.
- Títulos de sección `h2 text-xs font-bold tracking-widest uppercase`; formularios `max-w-3xl`; tablas a todo el ancho; `space-y-4` entre secciones; botones «GUARDAR» (`default`, `size="sm"`), «AGREGAR <COSA>», «CANCELAR» (`outline`).
- Guardado por sección: editar no aplica nada hasta «Guardar» de esa sección. **Excepción**: acciones operativas (habilitar/deshabilitar equipo, fuera de servicio) inmediatas con `ConfirmarDialog`.
- Errores de guardado: toast con el mensaje, la edición se conserva, la pantalla sigue en pie. `store.error` solo para fallas de **carga**.
- Mismas claves de URL (`?tab=`), mismos datos guardados (forma de `config.json` sin cambios), mismos permisos y condiciones de licencia/réplica.
- Sin dependencias nuevas. Textos en español rioplatense.
- Chequeo al cerrar cada tarea: `tsc -b`, `eslint src` (0 errores; baseline 44 warnings, sin nuevos), `vitest run`, `vite build`.

## Review Focus

1. **Dos secciones con cambios a la vez** (p. ej. Alarmas y Zonas, o dos filas de Bombas): guardar una no debe guardar ni pisar la otra → test de `guardar` (Tarea 1) + verificación manual (Tarea 8).
2. **La config cambia por debajo mientras una sección tiene cambios** (otro guardado recarga la config desde el servidor): la copia local no se pierde y, al guardar, se aplica sobre la config vigente, no sobre una vieja → test de `guardar` con config modificada entre `editar` y `guardar` (Tarea 1).
3. **Guardado rechazado por el servidor** (400 por límite de licencia, 500): la sección mantiene lo editado y muestra el error; la pantalla no se reemplaza por «Error al cargar configuración» → test del store (Tarea 1).
4. **Salir con cambios pendientes** (cambiar de subpestaña, de grupo o ir a otra página del portal): pide confirmación; sin cambios, no molesta → test de la lógica de `useAvisoSalida` (Tarea 2) + manual (Tarea 8).
5. **Modo réplica**: todo sigue en solo lectura (los `fieldset disabled` y los botones de guardar no habilitan nada) → verificación manual con `replica=true` en el mock (Tarea 8).

---

### Task 1: `store.guardar(cambio)` y errores de guardado que no tiran la pantalla

**Files:** Modify `frontend-react/src/store/config.ts`; Test `frontend-react/src/store/config.test.ts` (nuevo).

**Interfaces — Produces:**
- `guardar(cambio: (cfg: AppConfig) => AppConfig): Promise<boolean>` en `useConfigStore`: toma la config **vigente** del store, aplica `cambio`, la persiste por el mismo camino que `save()` (mock: `Object.assign(MOCK_CONFIG, …)`; real: `PUT /config`, recarga después). Devuelve `true/false`.
- Fallas de guardado (de `guardar` y de `save`): `toast.error('No se pudo guardar: <detalle>')` (con los `details` del 400 si vienen), se restaura la config previa en el store (la del momento anterior al guardado), **no** se toca `error`. `error` queda solo para `load()`.
- `save()` se mantiene (compatibilidad) hasta que la Tarea 7 confirme que nadie lo usa; si queda sin uso, se borra.

- [ ] **Step 1: Failing tests** (`store/config.test.ts`, modo mock salvo donde se indica, `fetch`/`authFetch` simulado con `vi.mock`):
  - `guardar aplica el cambio sobre la config vigente` — se cambia `alarmSetpoints` con `guardar`, y entre medio otro `guardar` cambia `gaugeZones`: al final la config tiene **ambos** cambios (Review Focus 1-2).
  - `guardar rechazado (500) no pone error global y restaura la config` — `error === ''`, `toast.error` llamado con texto que empieza «No se pudo guardar», config igual a la previa (Review Focus 3).
  - `guardar con 400 y details muestra el detalle` — el toast incluye los `details`.
- [ ] **Step 2:** `npx vitest run src/store/config.test.ts` → FAIL.
- [ ] **Step 3:** Implementar.
- [ ] **Step 4:** Test → PASS; chequeo completo verde.
- [ ] **Step 5:** Commit `feat(frontend): guardar por partes en la config y errores de guardado sin tirar la pantalla`.

### Task 2: Piezas compartidas en `components/config/`

**Files:** Create `frontend-react/src/components/config/SeccionConfig.tsx`, `Campo.tsx`, `BarraGuardado.tsx`, `useEdicion.ts`, `useAvisoSalida.ts`, `index.ts`; Tests `useEdicion.test.ts`, `avisoSalida.test.ts`.

**Interfaces — Produces:**
- `SeccionConfig({ titulo: string; ayuda?: ReactNode; acciones?: ReactNode; children: ReactNode; className?: string })` — `Card p-4 space-y-3`; cabecera con `h2` (clases de Global Constraints) a la izquierda y `acciones` a la derecha; ayuda `text-xs text-muted-foreground`.
- `Campo({ etiqueta: string; ayuda?: string; htmlFor?: string; children: ReactNode })` — `Label` arriba, control, ayuda `text-xs` abajo.
- `BarraGuardado({ sucio: boolean; guardando?: boolean; onDescartar(): void; onGuardar(): void })` — no renderiza nada si `!sucio`; si no, fila al pie: texto «CAMBIOS SIN GUARDAR» (11 px, `--p3-text`), botones «DESCARTAR» (`outline sm`) y «GUARDAR» (`default sm`, deshabilitado mientras `guardando`).
- `useEdicion<T>(original: T): { valor: T; set(v: T | ((v: T) => T)): void; sucio: boolean; descartar(): void; guardar(fn: (v: T) => Promise<boolean>): Promise<boolean> }` — `sucio` por comparación estructural (`JSON.stringify`) con `original`; si `original` cambia y no hay cambios locales, se adopta el nuevo; si hay cambios locales, se conservan; `guardar` deja `sucio=false` solo si `fn` devuelve `true`. Registra/desregistra su `sucio` en un registro de módulo (`haySinGuardar(): boolean`) que usa `useAvisoSalida`.
- `useAvisoSalida(): { confirmarSalida(): boolean }` — `beforeunload` mientras `haySinGuardar()`; captura de clics en `<a>` internos (igual que el editor del unifilar, `components/unifilar/Editor.tsx:32-45`) que pide confirmación; `confirmarSalida()` para usar antes de cambiar de subpestaña. Confirmación con `window.confirm` **solo** acá (salida de página: el `ConfirmarDialog` no puede frenar una navegación del navegador); texto: «Hay cambios sin guardar en Configuración. ¿Salir y perderlos?».
- `index.ts` reexporta todo.

- [ ] **Step 1: Failing tests:** `useEdicion` (con `renderHook` si `@testing-library/react` está instalado; si no, extraer la lógica a funciones puras `crearEdicion`/reductor y testearlas): sucio al editar, descartar vuelve al original, `guardar` con `fn` que devuelve `false` conserva lo editado y `sucio=true`, `original` nuevo sin cambios locales se adopta, con cambios locales se conserva. `avisoSalida`: `haySinGuardar()` es `true` con una edición sucia registrada y `false` al desregistrarla.
- [ ] **Step 2:** Correr → FAIL. **Step 3:** Implementar. **Step 4:** PASS + chequeo completo.
- [ ] **Step 5:** Agregar a la tabla de componentes de `docs/diseno-industrial.md` las piezas de `components/config/`. Commit `feat(frontend): piezas compartidas de Configuración (sección, campo, barra de guardado, edición, aviso de salida)`.

### Task 3: Supervisión — Zonas, Alarmas, Balance

**Files:** Modify `frontend-react/src/views/config/ZonasTab.tsx`, `AlarmasTab.tsx`, `BalanceTab.tsx`.

**Interfaces — Consumes:** Tareas 1-2.
- Cada bloque lógico es una `SeccionConfig` con su `useEdicion` y su `BarraGuardado`: Alarmas = una sección por tipo/default y una por la tabla de overrides por bomba; Zonas = una sección por sitio de bombas y una por medidores (como hoy se agrupan); Balance = una sección. El botón global «Guardar Cambios» desaparece.
- `guardar` de cada sección: `store.guardar(cfg => ({ ...cfg, <su parte> }))` (p. ej. `alarmSetpoints`, `gaugeZones`, `meters[].ui.zones`, `primaryMeter`/`loss`).
- Reemplazar `<select>` → `Select`, checkbox → `Checkbox`, `<table>` → `Table`, `<label>` → `Label`/`Campo`. Las validaciones de rangos de Zonas siguen (toast al guardar si son inválidos, sin guardar).

- [ ] **Step 1:** Migrar las tres pestañas. **Step 2:** `grep -nE "<select|type=\"checkbox\"|<table|<label|confirm\\(" ` sobre los tres archivos → sin resultados. **Step 3:** Chequeo completo verde. **Step 4:** Commit `refactor(frontend): Supervisión con guardado por sección y componentes de la línea de diseño`.

### Task 4: Bombas y Medidores

**Files:** Modify `frontend-react/src/views/config/BombasTab.tsx`, `MedidoresTab.tsx`, `CampoSection.tsx` (solo `FueraServicioBtn`), `PumpNominalCell.tsx`/`FlowmetersSection.tsx` (`PumpCaudalCell`) si guardan por su cuenta.

- La lista es una `SeccionConfig` titulada «BOMBAS» / «MEDIDORES», acción «AGREGAR BOMBA»/«AGREGAR MEDIDOR» (`size="sm"`). La edición en fila sigue (lápiz → fila editable) y su Guardar/Descartar usa `store.guardar` aplicando solo esa fila; aspecto de la barra igual a `BarraGuardado` (puede ser inline en la fila).
- `Switch` On/Off y «Fuera de servicio»: inmediatos, previa `ConfirmarDialog` («¿Deshabilitar SAER 3?», «¿Poner SAER 3 fuera de servicio?»), guardando con `store.guardar` solo ese equipo.
- Borrar: `ConfirmarDialog` con `peligro` en lugar de `confirm()`.
- Diálogo «Agregar medidor»: suma «CANCELAR» y su botón usa texto «AGREGAR» sin ícono de disquete.
- `EnlaceSelect` usa el `Select` de la librería (si está en `CommsSection.tsx`, migrarlo ahí; lo usan varias pestañas).

- [ ] Steps: migrar; grep de controles nativos/`confirm(` vacío en esos archivos; chequeo completo; commit `refactor(frontend): Bombas y Medidores con confirmaciones y guardado por fila`.

### Task 5: Gateways (partir el archivo y guardado por gateway)

**Files:** Modify `frontend-react/src/views/config/GatewaysTab.tsx`; Create `GatewaySlots.tsx` (panel de slots + generador de mapa), `GatewayEscaneo.tsx` (escaneo PLC/ADAM).

- Cada gateway es una `SeccionConfig` con su `useEdicion` (copia del `GatewayConfig`): tipo, enlace, layout del scan, slots (agregar, borrar, editar, generar mapa) quedan pendientes hasta «GUARDAR» de ese gateway (`BarraGuardado`). El escaneo no guarda nada por sí solo: carga resultados que el usuario aplica a la edición.
- Borrar gateway: `ConfirmarDialog` `peligro`. Tablas de slots y de escaneo ADAM → `Table`.
- Ningún archivo resultante > ~400 líneas.

- [ ] Steps: partir y migrar; `wc -l` en el reporte; grep de controles nativos vacío; chequeo completo; commit `refactor(frontend): Gateways con guardado por gateway, slots y escaneo en archivos propios`.

### Task 6: Caudalímetros, Reconectadores y reguladores, Generadores, Enlaces

**Files:** Modify `frontend-react/src/views/config/FlowmetersSection.tsx`, `CampoSection.tsx`, `CommsSection.tsx`, `CaudalimetrosTab.tsx`, `CampoTab.tsx`, `GeneradoresTab.tsx`, `EnlacesTab.tsx`.

- Cada sección con `SeccionConfig` («CAUDALÍMETROS», «RECONECTADORES», «REGULADORES», «GENERADORES», «ENLACES»), acción «AGREGAR …» `sm`; los diálogos de alta/edición guardan con `store.guardar` (solo su equipo) y tienen «CANCELAR».
- Borrar: `ConfirmarDialog` `peligro`. Controles nativos → librería.

- [ ] Steps: migrar; grep vacío; chequeo completo; commit `refactor(frontend): secciones de equipos de campo con la línea de diseño`.

### Task 7: Usuarios, Correo y Sistema; limpieza

**Files:** Modify `frontend-react/src/views/config/UsuariosTab.tsx`, `CorreoTab.tsx`, `LicenciaTab.tsx`, `BackupsTab.tsx`, `BrandingTab.tsx`, `ConexionTab.tsx`, `ReplicasTab.tsx`, `ConfigView.tsx`, `comun.ts`.

- Todas arrancan con `SeccionConfig` (título en todas: «USUARIOS», «CORREO SMTP», «REPORTE DIARIO», «LICENCIA», «BACKUPS»/sus secciones, «MARCA», «CONEXIÓN», «RÉPLICAS»); anchos y espaciados según Global Constraints; `confirm()` → `ConfirmarDialog`; botones según la guía. Estas pestañas guardan por su propia API (`/settings`, `/branding`, etc.): solo cambia la presentación y que los formularios con edición usen `useEdicion` + `BarraGuardado` donde hoy tienen un Guardar.
- `API_BASE`/`MODE` redefinidos en `CampoSection.tsx`, `ConexionTab.tsx`, `ReplicasTab.tsx` → importar de `comun.ts`. `gaugeListFor` → a `ZonasTab.tsx` si solo lo usa ella. `equipo`/`soloLectura` de `ConfigView` → una sola función.
- `ConfigView`: al cambiar de subpestaña o grupo, `confirmarSalida()` de `useAvisoSalida`; si devuelve `false`, no cambia.
- Si `store.save()` quedó sin uso, borrarlo.

- [ ] Steps: migrar; `grep -rnE "<select|type=\"checkbox\"|<table|<label|confirm\\(" frontend-react/src/views/config` → solo el `window.confirm` de `useAvisoSalida` (que vive en `components/config`), nada en `views/config`; chequeo completo; commit `refactor(frontend): Usuarios, Correo y Sistema con la línea de diseño; aviso al cambiar de pestaña`.

### Task 8: Verificación (controlador)

- [ ] Preview mock en claro y oscuro: recorrer las 17 subpestañas (título en todas, mismos anchos y botones, sin controles nativos).
- [ ] Review Focus 1: cambiar algo en Alarmas sin guardar, guardar Zonas → Alarmas sigue con su barra «CAMBIOS SIN GUARDAR» y su cambio no se persistió; idem dos filas de Bombas.
- [ ] Review Focus 4: con cambios pendientes, cambiar de subpestaña y navegar al Dashboard → pide confirmación; sin cambios, no.
- [ ] Review Focus 3: forzar un rechazo (en el mock, interceptar el guardado) → toast, edición conservada, pantalla en pie.
- [ ] Review Focus 5: modo réplica → todo deshabilitado.
- [ ] Suite completa verde.
