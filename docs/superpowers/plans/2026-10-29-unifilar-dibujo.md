# Unifilar parte B — dibujo con editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Menú «Unifilar» con un dibujo general y dibujos por sitio, energización en vivo por topología y un editor en el portal (React Flow), guardado en `config/unifilar.json` y replicado a la oficina.

**Architecture:** La API guarda y valida `unifilar.json` (GET/PUT con versión por hash y 409 ante conflicto); la réplica lo baja de planta en su ciclo de archivos. Todo el estado en vivo se calcula en el navegador: `energizar.ts` (puro) recorre el grafo con los datos MQTT que el portal ya tiene; la vista dibuja con `@xyflow/react` símbolos SVG propios y reutiliza `Mimico`, `Fasorial` y el formateador `fmt` de las tarjetas.

**Tech Stack:** Node/Express (weg-api), Node (weg-replica), React/TS/Zustand + `@xyflow/react`, `vitest` (solo dev).

**Spec:** `docs/superpowers/specs/2026-10-29-unifilar-dibujo-design.md`

## Global Constraints

- Archivo `config/unifilar.json`; `version` = sha256 hex (16 caracteres) del contenido guardado; sin archivo → `{ version: <hash del default>, data: { version: 1, colores: 'portal', dibujos: [{ id: 'general', nombre: 'Red general', tipo: 'general', nodos: [], conexiones: [] }] } }`.
- Límites: 64 dibujos, 1500 nodos y 3000 conexiones por dibujo, cuerpo ≤ 2 MB (413 si es mayor).
- `PUT` solo admin; `base` distinta de la versión actual → 409 con `El unifilar cambió desde que lo abriste`. Escritura atómica (tmp + rename).
- Módulo de licencia `unifilar`: sin él, `/api/unifilar` responde como los demás módulos ausentes y el menú no aparece.
- Réplica: solo lectura (el `PUT` lo frena `replicaWriteGuard`); baja el archivo cada 5 min, lo escribe solo si cambió; 404 de planta no toca el local.
- Estados: `energizado` > `desconocido` > `sinTension`; un dato faltante nunca da `sinTension`. Colores `portal` (cerrado/energizado = verde, abierto/sin tensión = gris) y `ansi` (cerrado/energizado = rojo, abierto/sin tensión = verde); desconocido = ámbar punteado en ambos.
- Números con `fmt`/`num` de `components/CampoBase.tsx` (es-AR).
- Sin comandos desde el dibujo. Solo lectura de equipos.
- `@xyflow/react` y `vitest` con **versión exacta** (sin `^`), publicadas hace más de 2 semanas.
- Comentarios en español, breves, como el código vecino. Stage por ruta explícita (hay `package-lock.json` sin trackear a propósito en otros paquetes; el de `frontend-react` sí se commitea si cambia). Commit con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Equipo sin comunicación** (offline, excedido, dato con más de 3 ciclos de antigüedad o `sinEnlace`): todo lo que depende de él se ve `desconocido`, nunca `sinTension` (tests en Task 3).
2. **Banco con fases parciales**: algunas fases en línea → el nodo muestra «n/m en línea», ámbar si no comunican todas, y una fuente vinculada al banco por `med` usa las fases en línea (tests en Task 3).
3. **Conflicto de edición**: dos admins guardan sobre la misma versión → el segundo recibe 409 y el editor no pierde lo dibujado (tests en Task 1, verificación en Task 5).
4. **`ref`/`banco`/`med` inexistentes** tras borrar o renombrar equipos en Configuración: el dibujo se ve «equipo no encontrado» / «—», nunca rompe la vista (tests en Task 1 y 3).
5. **Archivo grande o malformado** (>2 MB, ids repetidos, conexiones a puntos que no existen): 413/400 claros y nada se escribe (tests en Task 1).

---

### Task 1: API — servicio y rutas de `/api/unifilar`

**Files:**
- Create: `nodered/weg-api/src/services/unifilar.js`
- Create: `nodered/weg-api/src/routes/unifilar.js`
- Modify: `nodered/weg-api/src/server.js` (montaje con `express.json({ limit: '2mb' })` propio, **antes** del `express.json` global de 1 MB, como `/api/branding`; `requireModule(licenseState.get, 'unifilar')`)
- Create: `nodered/weg-api/test/unifilar.test.js`

**Interfaces:**
- Produces (`services/unifilar.js`):
  - `DEFAULT: object` (contenido por defecto de la spec §2.1)
  - `validateUnifilar(data) → string[]` (errores; `[]` = válido) con las reglas de spec §2.1–§2.4, incluidos `reg` con `ref` **o** `banco` (nunca ambos), `mostrar` con keys fijas o `{ med }` / `{ senal }` (nombre 1–40), `vinculo` `{ ref|banco, kind, med?, nominal, umbralPct }` o `{ desde }`.
  - `versionOf(data) → string` (sha256 hex, primeros 16 caracteres, de `JSON.stringify(data)`).
  - `createUnifilarStore({ file }) → { get(): { version, data }, put(base, data): { version } }` — `put` lanza `{ status: 409, message }` / `{ status: 400, errors }`.
- Produces (rutas): `GET /api/unifilar` (autenticado) → `{ version, data }`; `PUT /api/unifilar` (admin) con `{ base, data }` → `{ version }`.

- [ ] **Step 1: Tests que fallan** (`node:test`, archivo temporal por test):
  - Sin archivo → `get()` devuelve `DEFAULT` y una versión de 16 hex.
  - `put(versión actual, dibujo válido con fuente→barra→reco→bomba)` → nueva versión; `get()` lo devuelve igual.
  - `put(versión vieja, …)` → 409 con el mensaje exacto; el archivo no cambia.
  - Validación (una aserción por regla): dos dibujos `general`; id de nodo repetido; conexión a un punto inexistente (`p9` en barra de largo 40); `rot: 45`; `reg` con `ref` y `banco` a la vez; `mostrar: [{ med: '' }]`; `sitio.dibujo` a un id inexistente; 65 dibujos; 1501 nodos.
  - `ref` inexistente en la config → **sin** error.
  - Rutas (supertest o `http` como en los tests vecinos): operador `PUT` → 403; sin módulo `unifilar` → 403; cuerpo de 2,1 MB → 413; modo réplica → `PUT` rechazado por el guardia.
- [ ] **Step 2: Verificar que fallan.**
- [ ] **Step 3: Implementar** servicio (escritura tmp + rename) y rutas; montar en `server.js`.
- [ ] **Step 4: Verificar** suite completa de weg-api.
- [ ] **Step 5: Commit** — `feat(api): unifilar.json con validación, versión y 409`.

### Task 2: Réplica — `GET /api/replica/unifilar` y ciclo de archivos

**Files:**
- Modify: `nodered/weg-api/src/routes/replica.js` (nuevo `GET /unifilar`: contenido del archivo o 404)
- Modify: `nodered/weg-replica/src/files.js` (`createFileSync` recibe `unifilarPath`; baja con `source.unifilar()`; `writeJsonIfChanged`; 404 → no toca el local; log `[FILES] unifilar.json actualizado desde planta`)
- Modify: el módulo de `source` de weg-replica (agregar `unifilar()` junto a `config()`/`manual()`/`license()`, mismo token) y `src/index.js` (ruta del archivo `CONFIG_DIR/unifilar.json`)
- Modify/Create: tests de weg-api (`test/replicaRoutes*.test.js` o el que cubra `routes/replica.js`) y de weg-replica (`test/files*.test.js`)

**Interfaces:**
- Consumes: archivo de Task 1.
- Produces: `source.unifilar() → Promise<object|null>` (`null` si planta responde 404); `syncFiles()` devuelve además `unifilar: boolean`.

- [ ] **Step 1: Tests que fallan:** ruta de planta con archivo → 200 y el JSON; sin archivo → 404; token inválido → 401/403 como las otras rutas de réplica. En weg-replica: baja y escribe; segunda vez sin cambios no reescribe (mtime igual); 404 con archivo local existente → no lo toca.
- [ ] **Step 2: Verificar que fallan.**
- [ ] **Step 3: Implementar.**
- [ ] **Step 4: Verificar** suites de weg-api y weg-replica.
- [ ] **Step 5: Commit** — `feat(replica): unifilar.json se baja de planta`.

### Task 3: Portal — `energizar.ts`, conversión y vitest

**Files:**
- Modify: `frontend-react/package.json` (devDependency `vitest` exacta; script `"test": "vitest run"`), `frontend-react/package-lock.json`
- Create: `frontend-react/src/lib/unifilar.ts` (tipos del archivo: `Unifilar`, `Dibujo`, `Nodo`, `Conexion`, `Mostrar`, `Vinculo`; `puntosDe(nodo) → string[]`; `aFlow(dibujo) → { nodes, edges }` y `deFlow(dibujo, nodes, edges) → Dibujo` sin pérdida)
- Create: `frontend-react/src/lib/energizar.ts`
- Create: `frontend-react/src/lib/energizar.test.ts`, `frontend-react/src/lib/unifilar.test.ts`

**Interfaces:**
- Produces:
  - `type Estado = 'energizado' | 'sinTension' | 'desconocido'`
  - `type Vivos = { campo: Map<string, CampoState>, meters: …, drives: …, config: Config, ahora: number, cicloMs: number }` (tomar los tipos reales de `types.ts` y del store `drives.ts`)
  - `energizar(dibujo: Dibujo, vivos: Vivos, general?: { dibujo: Dibujo, resultado: Resultado }) → Resultado` con `Resultado = { tramos: Map<string, Estado>, nodos: Map<string, Estado> }`
  - `fasesDeBanco(config, banco) → CampoConfig[]` (reguladores habilitados con ese `banco`, en orden de la lista)
  - `estadoEquipo(nodo, vivos) → { online: 'si'|'no'|'parcial', alarmas: string[], sinEnlace?: string, faltante?: true }`

- [ ] **Step 1: Agregar vitest** y verificar `npm test` corriendo un test vacío.
- [ ] **Step 2: Tests que fallan (`energizar.test.ts`)**, uno por caso de spec §8: reco cerrado / abierto / disparo / offline / excedido / dato viejo (> 3 ciclos) / `sinEnlace`; barra con dos fuentes; seccionador abierto; fuente vinculada a medidor sobre y bajo el umbral y sin dato; fuente vinculada a **banco por `med` «Tensión fuente»** con todas las fases, con una fase en línea y sin ninguna; fuente de sitio `{ desde }` tomando el estado del nodo del general; `reg` con `ref` y `reg` con `banco` (paso libre); `ref` y `banco` inexistentes; lazo (termina); precedencia energizado > desconocido > sinTensión. `estadoEquipo` de banco con 3/3, 2/3 y 0/3 en línea.
- [ ] **Step 3: Tests que fallan (`unifilar.test.ts`)**: `aFlow` → `deFlow` devuelve el dibujo igual (con barra estirada, rotaciones, `mostrar` con `{ med }`); `puntosDe` de una barra de largo 100 = `p0…p5`.
- [ ] **Step 4: Verificar que fallan.**
- [ ] **Step 5: Implementar** (funciones puras, sin React).
- [ ] **Step 6: Verificar** `npm test` y build.
- [ ] **Step 7: Commit** — `feat(portal): energización del unifilar y conversión a React Flow`.

### Task 4: Portal — vista del unifilar (solo lectura)

**Files:**
- Modify: `frontend-react/package.json` (dependency `@xyflow/react` exacta), lock
- Create: `frontend-react/src/components/unifilar/Simbolos.tsx` (SVG de cada `tipo` de spec §2.2, con puntos de conexión como `Handle`; colores según `Estado` y `colores`; legibles en claro/oscuro)
- Create: `frontend-react/src/components/unifilar/Mediciones.tsx` (lo de `mostrar` con `fmt`; banco por fase `+8 / +6 / +8`; señales como luz)
- Create: `frontend-react/src/components/unifilar/PanelEquipo.tsx` (panel lateral: equipo suelto = valores como `CampoDetalle`; banco = además `Mimico` y `Fasorial` con `fasorEquipos(fases, campo)`; enlaces a Dashboard y Tendencias; se cierra al tocar afuera y con Esc)
- Create: `frontend-react/src/views/Unifilar.tsx` (ruta `/unifilar` y `/unifilar/:id`, migas «Red general › Sitio», zoom/paneo/«ajustar a pantalla», bloque `sitio` con resumen de spec §3.6)
- Modify: `frontend-react/src/App.tsx` (vista lazy, entrada de menú «Unifilar» con `module: 'unifilar'`, para todos los roles)
- Create: `frontend-react/src/store/unifilar.ts` (carga `GET /api/unifilar`; guarda `{ version, data }`)

**Interfaces:**
- Consumes: Task 1 (`GET`), Task 3 (`energizar`, `aFlow`, `estadoEquipo`, `fasesDeBanco`).
- Produces: `useUnifilarStore` con `{ version, data, cargar(), guardar(data) }` (`guardar` lo usa Task 5).

- [ ] **Step 1: Implementar** la vista con el store y los componentes.
- [ ] **Step 2: Verificar** build (vista en chunk lazy: buscar «Red general» en el chunk de `Unifilar`).
- [ ] **Step 3: Commit** — `feat(portal): vista del unifilar con estado en vivo`.

### Task 5: Portal — editor

**Files:**
- Create: `frontend-react/src/components/unifilar/Editor.tsx` (paleta por grupos de spec §2.2 con arrastrar al lienzo; panel de propiedades: equipo de Configuración —para `reg`, reguladores sueltos y bancos—, rotación, `mostrar` con casillas que incluyen las mediciones y señales libres del equipo, `cerrado`, `vinculo` con su medición, texto, tamaño; conexiones punto a punto ortogonales; grilla con imán de 10 px; barra con tirador; selección múltiple, borrar, copiar/pegar, deshacer/rehacer de 50 pasos; ABM de dibujos de sitio —el general no se borra—; selector de colores)
- Modify: `frontend-react/src/views/Unifilar.tsx` (botón «Editar» solo admin, solo planta —no en réplica—, no en celular; «Guardar» explícito con errores de validación de la API; 409 → aviso «El unifilar cambió desde que lo abriste» sin perder lo dibujado, con opción de recargar; «Descartar»; aviso al salir con cambios sin guardar)
- Modify: `frontend-react/src/store/unifilar.ts` (`guardar(data)` con `base` = versión cargada)

- [ ] **Step 1: Implementar.**
- [ ] **Step 2: Verificar** build.
- [ ] **Step 3: Commit** — `feat(portal): editor del unifilar`.

### Task 6: Integración y PR

**Files:** ninguno del repo (scripts en el scratchpad).

- [ ] **Step 1:** Imagen edge de la rama; actualizar `weg-cm-a` (cambiar `WEG_VERSION` en `.env` antes del update). Con el esclavo Modbus simulado (reco + Tapelectro RG1–3 en banco «RUA-01 Tapelectro») y el outstation DNP3 simulado (Toshiba en banco «Toshiba»), dibujar en el editor: fuente → barra → reco → bomba, y un nodo `reg` por banco con `mostrar` de taps y mediciones libres. Guardar.
- [ ] **Step 2:** Verificar en la vista: reco cerrado → aguas abajo energizado; reco abierto (estado del esclavo) → gris; esclavo apagado → ámbar; banco con taps por fase y panel con mímico y fasorial; fuente vinculada a un banco por «Tensión fuente»; 409 abriendo el editor en dos pestañas; operador sin «Editar».
- [ ] **Step 3:** Réplica: una segunda instancia en modo réplica (o la oficina de pruebas si está disponible en dind) baja `unifilar.json` y lo muestra sin «Editar».
- [ ] **Step 4:** PR `feat/unifilar-b` → master con CI en verde (`gh pr checks` antes de mergear).
- [ ] **Step 5:** Tras merge y tag `v1.13.0` (los crea el usuario) y con su OK explícito: update de planta y oficina. El dibujo de planta lo hace el usuario en el editor (o con ayuda, a pedido).
