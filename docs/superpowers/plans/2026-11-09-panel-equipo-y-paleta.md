# Panel de equipo y paleta de gráficos — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Panel lateral del unifilar como vistazo rápido con un único estilo, y paleta semántica de gráficos editable por el superadmin.

**Architecture:** Los tokens de color viven como variables CSS en `index.css`; `lib/paleta.ts` devuelve `var(--…)` y aplica las personalizaciones de `branding.json` sobre `:root`, igual que hoy `aplicarColorPortal`. El panel se arma desde `lib/resumenEquipo.ts`, una función pura por tipo que devuelve qué mostrar, más piezas visuales compartidas en `components/panel/`.

Decisión respecto de la spec: la «mini tendencia» se logra simplificando el `TendenciaEquipo` existente (6 h fijas, sin estadísticas) en lugar de crear un `MiniTendencia` nuevo: ya hace la carga y el refresco que hacen falta.

**Tech Stack:** React 19, TypeScript, Tailwind 4, recharts 3, zustand, vitest (frontend); Node 26 + Express 5 + `node --test` (weg-api).

**Spec:** `docs/superpowers/specs/2026-11-09-panel-equipo-y-paleta-design.md`

## Global Constraints

- Textos de la interfaz en español rioplatense, como el resto del portal.
- Sin dependencias nuevas.
- Colores de estado ISA-101 (`--st-*`, `--p1..3`, `--bar-*`) sin cambios y no personalizables.
- Valores sin dato fresco: «—» (nunca un valor viejo), con `fresco()` de `components/unifilar/Mediciones.tsx`.
- Paleta por defecto exacta de la spec: fases #4C8BD6 / #2BA59A / #8E72D6 / #7D8B99; tensión #8E72D6, corriente #4C8BD6, potencia #2BA59A, fp #D0679B, caudal #5FA35F, energía #B5835A; consigna #C9932E; series = #4C8BD6, #2BA59A, #8E72D6, #C9932E, #7D8B99, #D0679B, #5FA35F, #B5835A.
- `PUT /api/branding` sigue siendo solo superadmin.
- Frontend: `npx tsc -b`, `npx eslint src` (0 errores), `npx vitest run`, `npx vite build` verdes al cerrar cada tarea de frontend. weg-api: `node --test`.

## Review Focus

1. **Exportar PNG** (unifilar y gráficos) con colores `var(--…)` en atributos SVG: la imagen exportada tiene que conservar los colores → verificación visual en la Tarea 8.
2. **`branding.json` viejo o con `paleta` inválida** (sin la clave, hex mal escrito, claves desconocidas, `series` con 12 elementos): `get()` responde la paleta por defecto sin romper → test en la Tarea 2.
3. **Equipo sin comunicación o con dato viejo:** el panel muestra chip «SIN COMUNICACIÓN» y todos los valores «—» → test en la Tarea 5.
4. **Banco con una fase faltante o caída:** la fila de esa fase muestra «—» y el chip del banco lo refleja → test en la Tarea 5.
5. **Tema oscuro con colores personalizados claros u oscuros:** líneas visibles sobre el fondo → verificación visual en la Tarea 8 (se acepta; no hay ajuste automático de contraste).

---

### Task 1: Tokens y `lib/paleta.ts`

**Files:**
- Modify: `frontend-react/src/index.css` (bloque `:root` de tokens propios, junto a `--st-*`)
- Create: `frontend-react/src/lib/paleta.ts`
- Test: `frontend-react/src/lib/paleta.test.ts`

**Interfaces:**
- Produces:
  - `type Fase = 'A' | 'B' | 'C' | 'N'`
  - `type Magnitud = 'tension' | 'corriente' | 'potencia' | 'fp' | 'caudal' | 'energia'`
  - `interface Paleta { fase: Record<'a'|'b'|'c'|'n', string>; magnitud: Record<Magnitud, string>; consigna: string; series: string[] }` (8 series)
  - `type PaletaParcial = { fase?: Partial<Paleta['fase']>; magnitud?: Partial<Paleta['magnitud']>; consigna?: string; series?: (string | null)[] }`
  - `const PALETA_DEFECTO: Paleta`
  - `colorFase(f: Fase): string`, `colorMagnitud(m: Magnitud): string`, `colorSerie(i: number): string` (cíclico módulo 8), `colorConsigna(): string` → devuelven `'var(--fase-a)'`, `'var(--mag-tension)'`, `'var(--serie-1)'`, `'var(--consigna)'`.
  - `colorDeSerie(s: { fase?: Fase; magnitud?: Magnitud; indice: number }): string` — regla fase → magnitud → serie.
  - `faseDeIndice(i: number): Fase` → `'A' | 'B' | 'C'` cíclico.
  - `paletaEfectiva(p?: PaletaParcial | null): Paleta` — defectos + personalizados válidos.
  - `aplicarPaleta(p?: PaletaParcial | null): void` — escribe en `document.documentElement.style` solo los tokens personalizados y quita los demás.

- [ ] **Step 1: Write the failing tests** (`lib/paleta.test.ts`)

```ts
test('regla fase → magnitud → serie', () => {
  expect(colorDeSerie({ fase: 'B', magnitud: 'corriente', indice: 3 })).toBe('var(--fase-b)')
  expect(colorDeSerie({ magnitud: 'corriente', indice: 3 })).toBe('var(--mag-corriente)')
  expect(colorDeSerie({ indice: 9 })).toBe('var(--serie-2)')
})
test('paletaEfectiva mezcla y descarta inválidos', () => {
  const p = paletaEfectiva({ fase: { a: '#112233', b: 'rojo' }, series: [null, '#abcdef'] })
  expect(p.fase.a).toBe('#112233'); expect(p.fase.b).toBe('#2BA59A')
  expect(p.series[1]).toBe('#abcdef'); expect(p.series[0]).toBe('#4C8BD6')
})
test('aplicarPaleta escribe solo lo personalizado y lo quita al restaurar', () => {
  aplicarPaleta({ magnitud: { tension: '#000000' } })
  expect(document.documentElement.style.getPropertyValue('--mag-tension')).toBe('#000000')
  aplicarPaleta(null)
  expect(document.documentElement.style.getPropertyValue('--mag-tension')).toBe('')
})
```
(Si vitest corre sin DOM, el tercer test usa `// @vitest-environment jsdom` solo si jsdom ya está instalado; si no, se prueba con un `style` falso inyectable: `aplicarPaleta(p, st = document.documentElement.style)`.)

- [ ] **Step 2:** `cd frontend-react && npx vitest run src/lib/paleta.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3:** Agregar los 20 tokens con los valores de Global Constraints en `index.css` (`--fase-a/b/c/n`, `--mag-*`, `--consigna`, `--serie-1..8`) e implementar `lib/paleta.ts`. Validación de color: `/^#[0-9a-f]{6}$/i`.
- [ ] **Step 4:** `npx vitest run src/lib/paleta.test.ts` → PASS; `npx tsc -b` sin errores.
- [ ] **Step 5:** Commit `feat(frontend): tokens y lib/paleta para colores de gráficos`.

### Task 2: `paleta` en branding (weg-api)

**Files:**
- Modify: `nodered/weg-api/src/services/branding.js` (`get()` líneas ~75-90, `set()` ~100-120, reset)
- Test: `nodered/weg-api/test/branding.test.js`

**Interfaces:**
- Produces: `GET /api/branding` incluye `paleta: { fase?: {a,b,c,n}, magnitud?: {...}, consigna?, series?: (string|null)[] }` solo con valores guardados válidos (objeto vacío `{}` si no hay); `PUT /api/branding` acepta `paleta` (objeto parcial) o `paleta: null` (borra toda la paleta); `DELETE /api/branding` también la borra.

- [ ] **Step 1: Failing tests** en `test/branding.test.js`:
  - `paleta: por defecto {}; guarda parcial en minúsculas; null en una clave la borra; paleta null borra todo` — `set({ paleta: { fase: { a: '#AABBCC' } } })` → `get().paleta` es `{ fase: { a: '#aabbcc' } }`; `set({ paleta: { fase: { a: null } } })` → `{}`; `set({ paleta: null })` → `{}`.
  - `paleta: inválidos` — `set({ paleta: { fase: { a: 'rojo' } } })` lanza `/Color de gráfico inválido/`; clave desconocida (`{ fase: { z: '#000000' } }`, `{ otra: 1 }`) se descarta sin error; `series` con 9 elementos lanza `/máximo 8/`.
  - `paleta: branding.json con basura` — escribir a mano `{ paleta: { fase: { a: 'xx' }, series: 5 } }` en el archivo → `get().paleta` es `{}` (Review Focus 2).
  - `reset borra la paleta`.
- [ ] **Step 2:** `cd nodered/weg-api && node --test test/branding.test.js` → FAIL.
- [ ] **Step 3:** Implementar `limpiarPaleta(obj)` (lectura tolerante, para `get`) y la validación estricta en `set` con las claves exactas de la Tarea 1 (`fase: a,b,c,n`; `magnitud: tension,corriente,potencia,fp,caudal,energia`; `consigna`; `series` ≤ 8, cada uno hex o `null`).
- [ ] **Step 4:** `node --test` → todo verde.
- [ ] **Step 5:** Commit `feat(api): paleta de gráficos en branding`.

### Task 3: Paleta en el store de marca

**Files:**
- Modify: `frontend-react/src/store/branding.ts` (interfaz `Branding`, `DEFAULT_BRANDING`, `save`, caché en `localStorage`, aplicación inicial línea ~79 y en `load`)

**Interfaces:**
- Consumes: `aplicarPaleta`, `PaletaParcial` (Tarea 1); respuesta de la Tarea 2.
- Produces: `Branding.paleta: PaletaParcial` (por defecto `{}`); `save({ paleta?: PaletaParcial | null, ... })`.

- [ ] **Step 1:** Agregar `paleta` al tipo, al defecto, a la caché y a `save`; llamar `aplicarPaleta(b.paleta)` en los mismos dos lugares donde hoy se llama `aplicarColorPortal`.
- [ ] **Step 2:** `npx tsc -b && npx vitest run` → verde.
- [ ] **Step 3:** Commit `feat(frontend): aplicar la paleta de branding al cargar`.

### Task 4: Migrar todos los gráficos a la paleta

**Files (Modify):** `components/TrendChart.tsx` (quitar `SERIE_COLORES`, `SERIE_NEUTRA` y la regla de serie única, línea ~229), `components/Fasorial.tsx` (quitar `FASOR_COLORES`; color por `faseDeIndice`), `components/Mimico.tsx`, `lib/tendencia.ts` (colores de `serieDe`), `views/FormaOnda.tsx` (quitar `PHASE_COLORS`), `views/Historicos.tsx`, `views/RegsTab.tsx`, `views/RecosTab.tsx`, `views/GensTab.tsx`, `views/CaudalesTab.tsx`, `views/Informes.tsx`, `views/MisGraficos.tsx` (solo el color por defecto de una traza nueva), `views/CampoEquipo.tsx`, `views/MotorDetalle.tsx`, `views/Equipos.tsx`, `components/LibresTrend.tsx`, `components/DriveCard.tsx` y `components/FlowBox.tsx` (#9ca3af → `var(--bar-stale)`).
- Test: `frontend-react/src/lib/tendencia.test.ts`

**Interfaces:**
- Consumes: Tarea 1.
- Produces: `Grafico` (en `lib/tendencia.ts`) suma `magnitud?: Magnitud`; `serieDe` colorea así: varias líneas de un banco → `colorFase(faseDeIndice(i))`; una línea → `colorDeSerie({ magnitud, indice: 0 })`. Mapeo de variables: Corriente→corriente, Potencia→potencia, Tensión/Tensión de carga/Tensión L-L→tension, Factor de potencia→fp, Caudal→caudal; Frecuencia, Velocidad, Tap, Combustible, Batería → sin magnitud (serie por índice). En `serieDe` de `reg` el gráfico «Tensión de carga» pasa primero y ambos quedan `alterna: true` (el panel muestra uno por vez).
- Equivalencias en las vistas: fases A/B/C (reconectadores, generadores L1-L3, forma de onda V1-V3/I1-I3, mímico, fasorial) → `colorFase`; I4/neutro → `colorFase('N')`; series de medidor en Históricos (tensión, corriente, potencia, fp, demanda→potencia) → `colorMagnitud`; consigna de RegsTab → `colorConsigna()` con línea punteada; pérdidas/energía en Históricos → `colorMagnitud('energia')`; «en marcha» y «Total» de caudales → `colorSerie` por índice; Informes (barra y línea) → `colorSerie(0)` y `colorSerie(3)`.

- [ ] **Step 1: Failing test** en `lib/tendencia.test.ts`: `serieDe colorea por magnitud y por fase` — bomba: el gráfico «Corriente» tiene `lineas[0].color === 'var(--mag-corriente)'`; banco de 3 reguladores: el primer gráfico es «Tensión de carga» y sus líneas son `var(--fase-a)`, `var(--fase-b)`, `var(--fase-c)`.
- [ ] **Step 2:** `npx vitest run src/lib/tendencia.test.ts` → FAIL.
- [ ] **Step 3:** Migrar los archivos listados con las equivalencias. Distinguir tensión de corriente en la forma de onda solo por grosor de línea, como hoy.
- [ ] **Step 4:** Verificar que no queden colores escritos a mano en gráficos: `grep -rnE "#[0-9a-fA-F]{6}" src/components/TrendChart.tsx src/components/Fasorial.tsx src/components/Mimico.tsx src/lib/tendencia.ts src/views/FormaOnda.tsx src/views/Historicos.tsx src/views/RegsTab.tsx src/views/RecosTab.tsx src/views/GensTab.tsx src/views/CaudalesTab.tsx src/views/Informes.tsx src/views/CampoEquipo.tsx src/views/MotorDetalle.tsx src/components/LibresTrend.tsx src/components/DriveCard.tsx src/components/FlowBox.tsx` → sin resultados (salvo comentarios). Luego `tsc -b`, `eslint`, `vitest`, `vite build` verdes.
- [ ] **Step 5:** Commit `refactor(frontend): todos los gráficos con la paleta semántica`.

### Task 5: `lib/resumenEquipo.ts`

**Files:**
- Create: `frontend-react/src/lib/resumenEquipo.ts`
- Test: `frontend-react/src/lib/resumenEquipo.test.ts`

**Interfaces:**
- Consumes: `equipoDe`, `fresco`, `estadoGenVivo` (`components/unifilar/Mediciones.tsx`); `recoCerrado` (`lib/reco.ts`); `modoDe`, `modoTexto` (`lib/generador.ts`); `puntosLibres`, `fmt`, `Tono` (`components/CampoBase.tsx`); `Vivos` (`lib/energizar.ts`); `faseDeIndice`, `Fase` (Tarea 1).
- Produces:
  ```ts
  interface ValorClave { etiqueta: string; valor: string; unidad: string }   // valor '—' sin dato fresco
  interface FilaBanco { nombre: string; fase: Fase; v: string; tap: string; fp: string }
  interface ResumenEquipo {
    existe: boolean; titulo: string; subtitulo: string
    estado: { tono: Tono; texto: string }
    alarmas: { texto: string; prioridad: 'p1' | 'p3' }[]
    valores: ValorClave[]; banco?: FilaBanco[]
    detalle: string | null            // ruta de la página de detalle; null = sin botón
  }
  function resumenEquipo(n: Nodo, v: Vivos, opts: { generadores: boolean }): ResumenEquipo
  ```
- Contenido por tipo (fuente → etiqueta, unidad, decimales):
  - **bomba** (`eq.drive`): `current`→Corriente A 1; `frequency`→Frecuencia Hz 1; `power`→Potencia kW 1; `type==='SSW900' ? scrTemp : igbtTemp`→Temperatura °C 0; `runHours`→Horas de marcha h 0. Estado: no fresco → `com` «SIN COMUNICACIÓN»; `fault` → `p1` «FALLA»; `running` → `run` «EN MARCHA»; si no `off` «PARADA». Alarmas: `fault` → `faultText || statusText` (p1); `alarmTempHigh` → «Temperatura alta» (p3). Subtítulo: `drive.type`. Detalle: `/motor/<nombre>`.
  - **medidor** (`eq.meter`): `voltage`→Tensión V 0; `current`→Corriente A 1; `power/1000`→Potencia kW 0; `pf`→FP «» 2. Estado: fresco → `info` «EN LÍNEA», si no `com`. Detalle `/medidor/<nombre>`.
  - **caudalimetro** (`v.flowmeters.get(nombre)`): `flow`→Caudal m³/h 1; `total`→Totalizador m³ 0. Estado como medidor. Detalle `null`.
  - **reg** suelto (`st.valores`): `v`→Tensión de carga V 0; `tap`→Tap (con «+» si es positivo); `i`→Corriente A 0; `fp`→FP 2. Estado: con alarmas → `p1` «ALARMA»; fresco → `info` «EN LÍNEA»; si no `com`. Subtítulo: `cfg.modelo`. Detalle `/campo/<nombre>`.
  - **banco** de reguladores: `valores: []`; `banco`: una fila por fase en orden (`fase = faseDeIndice(i)`) con `v`, `tap`, `fp` formateados (`'—'` si no fresca). Estado: alguna alarma → `p1` «ALARMA»; todas sin dato → `com` «SIN COMUNICACIÓN»; algunas sin dato → `com` «PARCIAL»; si no `info` «EN LÍNEA». Alarmas: las de todas las fases, prefijadas con el nombre del regulador. Subtítulo «Banco de reguladores». Detalle `/campo/<primer regulador>`.
  - **reco**: `ia`/`ib`/`ic` → Corriente A / B / C, A 0 (si `ia` es null, una sola «Corriente» con `i`). Estado por `recoCerrado`: `cerrado` → `run` «CERRADO», `abierto` → `off` «ABIERTO», `disparo` → `p1` «DISPARO», `null` → `info` «EN LÍNEA»; no fresco → `com`. Detalle `/campo/<nombre>`.
  - **gen**: estado = `estadoGenVivo` (su `tono`/`texto`); valores: Modo (`modoTexto(modelo, modoDe(st))`, sin unidad), `vl1l2`→Tensión L-L V 0, `kw`→Potencia kW 0, y Combustible % 0 desde `st.extras['Nivel de combustible']` solo si ese punto libre existe en el mapa. Detalle: `/generadores/<nombre>` si `opts.generadores`, si no `/campo/<nombre>`.
  - **campo de tipo desconocido / sin valores fijos**: los primeros 4 puntos libres medidos (`puntosLibres(cfg).meds`).
  - **no existe**: `existe: false`, `estado: { tono: 'p3', texto: 'NO ENCONTRADO' }`, sin valores, `detalle: null`.
  - Alarmas de equipos de campo: `st.alarmas` (solo si fresco), `prioridad = st.niveles?.[clave] === 2 ? 'p3' : 'p1'`.

- [ ] **Step 1: Failing tests** (`lib/resumenEquipo.test.ts`), con un `Vivos` de ejemplo armado en el propio test (`ahora` fijo, `_ts` reciente):
  - `bomba en marcha: 5 valores y chip EN MARCHA` — `valores.map(x=>x.etiqueta)` = `['Corriente','Frecuencia','Potencia','Temperatura','Horas de marcha']`; `estado` = `{ tono: 'run', texto: 'EN MARCHA' }`; `detalle` = `'/motor/SAER 1'`.
  - `sin comunicación: chip SIN COMUNICACIÓN y todo en —` (Review Focus 3) — misma bomba con `online: false` → `estado.tono === 'com'` y `valores.every(x => x.valor === '—')`.
  - `banco: una fila por fase, fase caída en — y chip PARCIAL` (Review Focus 4) — 3 reguladores, el segundo sin estado → `banco.map(f => f.fase)` = `['A','B','C']`, `banco[1].v === '—'`, `estado` = `{ tono: 'com', texto: 'PARCIAL' }`.
  - `regulador con alarma de nivel 2 → p3 y chip ALARMA`.
  - `reco disparado: chip DISPARO y corrientes A/B/C`.
  - `generador sin módulo: detalle /campo/…`.
  - `equipo inexistente: existe false y NO ENCONTRADO`.
- [ ] **Step 2:** `npx vitest run src/lib/resumenEquipo.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `resumenEquipo` (sin JSX).
- [ ] **Step 4:** Test → PASS; `tsc -b` y `eslint` limpios.
- [ ] **Step 5:** Commit `feat(frontend): resumen de equipo para el panel del unifilar`.

### Task 6: Panel nuevo

**Files:**
- Create: `frontend-react/src/components/panel/PanelLateral.tsx`, `EncabezadoEquipo.tsx`, `ValoresClave.tsx`, `FilasBanco.tsx`
- Modify: `frontend-react/src/components/unifilar/PanelEquipo.tsx` (reescritura), `frontend-react/src/components/unifilar/TendenciaEquipo.tsx`, `frontend-react/src/index.css` (animación)

**Interfaces:**
- Consumes: `resumenEquipo`, `ResumenEquipo`, `ValorClave`, `FilaBanco` (Tarea 5); `colorFase` (Tarea 1); `Chip` (`CampoBase`); `Mimico`.
- Produces:
  - `PanelLateral({ titulo: string; onClose: () => void; children: ReactNode })` — fondo `bg-black/20` que cierra al tocarlo, panel `fixed inset-y-0 right-0 z-50 w-full max-w-md`, Esc cierra, `role="dialog"` + `aria-label={titulo}`, entrada con clase `panel-entra` (keyframe `translateX(100%)→0`, 180 ms, desactivada con `prefers-reduced-motion: reduce`).
  - `EncabezadoEquipo({ titulo, subtitulo, estado, onClose })` — nombre `text-base font-bold`, subtítulo `text-xs text-muted-foreground`, `Chip` a la derecha, botón X con `aria-label="Cerrar"`.
  - `ValoresClave({ valores: ValorClave[] })` — grilla `grid-cols-2`; cada celda: etiqueta `text-[11px] uppercase tracking-wider text-muted-foreground`, valor `text-xl font-semibold tabular-nums` + unidad `text-xs text-muted-foreground`; valor `'—'` en `text-(--bar-stale)`.
  - `FilasBanco({ filas: FilaBanco[] })` — una fila por regulador: punto del color `colorFase(f.fase)`, nombre, y `V`, `Tap`, `FP` en columnas alineadas.
- Orden dentro de `PanelEquipo`: `EncabezadoEquipo` → franja de alarmas (solo si `alarmas.length`; cada una con `AlertTriangle` y color `--p1-text`/`--p3-text`) → si `banco`: `Mimico` (compacto, como hoy) + `FilasBanco`; si no: `ValoresClave` → `TendenciaEquipo` → enlaces «Ver detalle» (si `detalle`) y «Ver en Tendencias» (`/historicos`).
- `TendenciaEquipo`: período fijo de 6 h (el `RANGOS[1]` actual), sin los botones de período ni la fila ÚLTIMO/MÍN/PROM/MÁX, mismo selector de variable; título «Tendencia · 6 h» con el mismo estilo de etiqueta que `ValoresClave`.
- Dejan de importarse en `PanelEquipo`: `PM8000Card`, `DriveCard`, `Fasorial`, `Mediciones` (default export), `Luz`, `puntosLibres`, `fmtMed`.

- [ ] **Step 1:** Crear las cuatro piezas y la animación.
- [ ] **Step 2:** Reescribir `PanelEquipo` con el orden de arriba y simplificar `TendenciaEquipo`.
- [ ] **Step 3:** `tsc -b`, `eslint`, `vitest`, `vite build` verdes. Si algún componente quedó sin uso en todo `src` (`grep -rn "from '.*/Fasorial'"` etc.), borrarlo; `Fasorial` y `Mediciones` siguen en uso en `Equipos` y en el unifilar.
- [ ] **Step 4:** Commit `feat(frontend): panel del unifilar como vistazo rápido con estilo único`.

### Task 7: «Colores de gráficos» en Configuración → Marca

**Files:**
- Modify: `frontend-react/src/views/BrandingTab.tsx` (sección nueva debajo de los colores actuales, líneas ~118-136)

**Interfaces:**
- Consumes: `PALETA_DEFECTO`, `paletaEfectiva`, `aplicarPaleta`, `colorFase`, `colorConsigna` (Tarea 1); `save({ paleta })` (Tarea 3).
- Comportamiento:
  - Estado local `paleta: PaletaParcial`, iniciado con `b.paleta`; `useEffect` aplica `aplicarPaleta(paleta)` en vivo y, al desmontar, restaura `aplicarPaleta(store.paleta)` (mismo patrón que `colorPortal`, líneas 34-35).
  - Cuatro grupos con título (Fases: A, B, C, Neutro · Magnitudes: Tensión, Corriente, Potencia, Factor de potencia, Caudal, Energía · Consigna · Series 1-8), cada uno `<input type="color">` con `aria-label` («Color de la fase A», «Color de tensión», …) y el hex debajo; si difiere del defecto, se marca «personalizado».
  - Gráfico de muestra: `LineChart` de recharts, alto 120, con 3 líneas senoidales desfasadas (`colorFase('A'|'B'|'C')`) y una línea horizontal punteada `colorConsigna()`; datos fijos generados en el componente.
  - Botón «Restaurar colores por defecto» → `setPaleta({})`.
  - El botón Guardar existente envía `paleta` junto con lo demás (el payload ya va al `save` de la línea 60).

- [ ] **Step 1:** Implementar la sección.
- [ ] **Step 2:** `tsc -b`, `eslint`, `vitest`, `vite build` verdes.
- [ ] **Step 3:** Commit `feat(frontend): editar la paleta de gráficos en Marca`.

### Task 8: Verificación en el preview y cierre

**Files:** ninguno nuevo (correcciones que surjan, en su archivo).

- [ ] **Step 1:** Build en modo mock (patch temporal de `store/auth.ts` a superadmin, `VITE_DATA_MODE=mock`) y servir con nginx + CSP del repo; viewport 1500×900.
- [ ] **Step 2:** Abrir el panel de cada tipo disponible en el mock (bomba, medidor, caudalímetro, reconectador, regulador, banco, generador) en tema claro y oscuro: misma estructura, sin tarjetas del dashboard, banco con mímico + filas por fase, «—» en equipos sin dato.
- [ ] **Step 3:** Revisar con la paleta: Históricos, forma de onda (si el mock la tiene), reconectadores, generadores, reguladores (consigna punteada), caudales, informes. Misma fase y magnitud = mismo color.
- [ ] **Step 4:** En Marca, cambiar la fase A y la tensión: el gráfico de muestra y los gráficos de otras pantallas cambian; «Restaurar» vuelve; recargar la página conserva lo guardado (contra la API mock o, si el mock no guarda, verificar el payload enviado).
- [ ] **Step 5:** Exportar PNG de un gráfico y del unifilar (Review Focus 1): los colores se conservan.
- [ ] **Step 6:** Restaurar `store/auth.ts`, suite completa (frontend + `node --test` en weg-api) verde, commit de correcciones si hubo.
