# Generador en el unifilar: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dibujar los grupos electrógenos en el unifilar (nodo `gen`) con estado en vivo. Cuando un grupo está en
carga, energiza las líneas que salen de él.

**Architecture:** `gen` es un tipo de nodo más y sigue el camino genérico de `reco`/`reg`: validación en
`weg-api/src/services/unifilar.js`, librerías puras en `frontend-react/src/lib` y componentes en
`components/unifilar`. La energización suma el generador como fuente con una función pura nueva, `estadoFuenteGen`.

**Tech Stack:**
- API: Node 20 con `node:test`.
- Frontend: React 18, TypeScript, @xyflow/react y vitest.

**Spec:** `docs/superpowers/specs/2026-11-05-generadores-unifilar-design.md`

## Global Constraints

- Textos de la interfaz en español. El nombre del tipo en la paleta es «Generador».
- `puntosDe('gen') = ['a', 'd']`, idéntico en `lib/unifilar.ts` y en `services/unifilar.js`.
- Claves fijas de `mostrar` para `gen`: `kw`, `hz`, `vl1l2`, `rpm`, `fp`, `modo` y `horas`.
  - Un nodo nuevo arranca con `mostrar: ['kw', 'modo']`.
- Umbrales de "en carga": rpm > 300 y kW > 0,5. Son los de `lib/generador.ts`; se exportan, no se duplican.
- Nombre exacto de la señal: `'Grupo en carga'`.
- Sin dato válido no se muestra nunca un valor viejo: se usa `fresco()` y `campoVivo()`.
- Tests:
  - Correr en WSL Docker con `scratchpad/tw.sh` después de regenerar `scratchpad/files.txt`
    (`{ git diff --name-only origin/master; git ls-files --others --exclude-standard; } | sort -u`).
  - Antes de mergear, CI verde.

## Review Focus

1. **`ref` que apunta a un generador borrado o renombrado.**
   - En el símbolo: "equipo no encontrado" (`faltante`).
   - Como fuente: `desconocido`, nunca `energizado`.
   - Test en la tarea 2.
2. **Señal «Grupo en carga» con valor `null`** (el bloque de coils no respondió y el resto sí): se trata como si no
   existiera y se aplica el criterio de rpm/kW. Test en la tarea 2.
3. **`modo` en un modelo con registro (`il4`, `dse8610`) y en uno con coils (`hgm6120`):** las dos variantes muestran
   el texto ("Automático"), nunca un número ni «—» si hay dato. Test en la tarea 4.
4. **Un `gen` con `lados` que usa un borne inexistente (`b`):** la API lo rechaza. Test en la tarea 1.
5. **Un grupo fuera de servicio dibujado junto a la red:** la línea sigue energizada por la red y el grupo no
   aporta. Test en la tarea 2.

---

### Task 1: Validación del nodo `gen` en la API

**Files:**
- Modify: `nodered/weg-api/src/services/unifilar.js:23-33` (`KEYS`, `LIBRES`, `CON_REF`) y `:51-68` (`puntosDe`)
- Test: `nodered/weg-api/test/unifilar.test.js`

**Interfaces:**
- Produce: un nodo `{ tipo: 'gen', ref, x, y, rot, mostrar? }` válido para `validateUnifilar`. `puntosDe({tipo:'gen'})`
  devuelve `['a', 'd']`.

- [ ] **Step 1: Escribir los tests que fallan**, con el estilo y los helpers del archivo (un dibujo con un nodo):
  - `gen válido con ref y mostrar [kw, modo, {med: 'Nivel de combustible'}]` → sin errores.
  - `gen sin ref` → error que incluye `ref requerido`.
  - `gen con mostrar ['tap']` → error de clave inválida, el mismo texto que para `reco`.
  - `gen con lados {b: 'abajo'}` → error de borne inexistente.
  - `enlace de datos d↔d entre comm y gen` → sin errores.
  - `puntosDe gen` → `['a', 'd']`, si el test existente de `puntosDe` lo expone. Si no, cubrirlo por los dos casos
    de `lados`.
- [ ] **Step 2: Correr los tests y ver que fallan** con `tipo desconocido`.
- [ ] **Step 3: Implementar**
  - `KEYS.gen = ['kw', 'hz', 'vl1l2', 'rpm', 'fp', 'modo', 'horas']`.
  - `'gen'` en `LIBRES` y en `CON_REF`; `TIPOS` lo toma de `CON_REF`.
  - `case 'gen': return ['a', 'd']` en `puntosDe`, junto a `bomba`.
- [ ] **Step 4: Correr los tests y ver que pasan.** weg-api completo en verde.
- [ ] **Step 5: Commit** `feat(unifilar): nodo gen en la validación`.

### Task 2: Generador como fuente, alarmas y bloque de sitio (librerías puras)

**Files:**
- Modify:
  - `frontend-react/src/lib/generador.ts`: exportar `RPM_MARCHA` y `KW_CARGA`.
  - `frontend-react/src/lib/unifilar.ts:90`: `puntosDe`.
  - `frontend-react/src/lib/energizar.ts`:
    - `estadoEquipo` (`:56`);
    - `fuentes` (`:176-180`);
    - `RecoSitio`… `ResumenSitio` (`:255-266`);
    - `resumenSitio` (`:270-320`);
    - `EQUIPOS` (`:340`).
- Test: `frontend-react/src/lib/energizar.test.ts` y `frontend-react/src/lib/unifilar.test.ts`.

**Interfaces:**
- Consume: `estadoGen(st)` de `lib/generador.ts`; `campoVivo` y `vivo`, internos de `energizar.ts`.
- Produce:
  - `export function estadoFuenteGen(n: Nodo, v: Vivos): Estado` en `energizar.ts`.
  - `export interface GenSitio { nombre: string; online: boolean; estado: EstadoGen; kw?: number | null }`.
  - `ResumenSitio` suma `gens: GenSitio[]; masGens: number`, con el mismo tope de 2 que recos.
  - `EQUIPOS` incluye `'gen'`.
  - `puntosDe({ tipo: 'gen' })` devuelve `['a', 'd']`.

- [ ] **Step 1: Escribir los tests que fallan.** Usar los helpers de vivos y dibujos que ya tiene
  `energizar.test.ts`, con un generador `GE 1` en `config.generadores`.

  Casos de `estadoFuenteGen`, cada uno con su resultado esperado:

  | Caso | Resultado |
  |---|---|
  | Señales `{'Grupo en carga': true}`, kw 0 | `'energizado'` |
  | `{'Grupo en carga': false}`, rpm 1500, kw 100 | `'sinTension'` |
  | Sin señal, rpm 1500, kw 100 | `'energizado'` |
  | Sin señal, rpm 1500, kw 0 | `'sinTension'` |
  | `{'Grupo en carga': null}`, rpm 1500, kw 100 | `'energizado'` (Review Focus 2) |
  | `online: false` | `'desconocido'` |
  | `_ts` viejo (`isStale`) | `'desconocido'` |
  | `ref` sin estado ni config | `'desconocido'` (Review Focus 1) |
  | `fueraServicio: true` | `'sinTension'` |

  Otros tests:
  - **Dibujo `gen —a— carga`:** con el grupo en carga, el tramo queda `energizado` y el `sentido` va de `gen` a
    `carga`. Con el grupo sin carga, `sinTension`.
  - **Red y grupo** (`fuente`, `seccionador` abierto, barra, `gen`): el grupo en carga energiza la barra.
  - **Grupo fuera de servicio con la fuente en línea:** la barra sigue `energizado` (Review Focus 5).
  - **`estadoEquipo` de `gen`:** con alarma devuelve `online 'si'` y la alarma; con `ref` inexistente devuelve
    `faltante: true`.
  - **`resumenSitio`:** con dos generadores (uno en carga con kw 180, otro sin comunicación) da
    `gens = [{nombre: 'GE 1', online: true, estado.id: 'carga', kw: 180}, {nombre: 'GE 2', online: false, …}]`.
  - **`listaAlarmas`:** incluye la alarma del generador.
  - **`unifilar.test.ts`:** `puntosDe({tipo: 'gen'})` devuelve `['a', 'd']`.
- [ ] **Step 2: Correr vitest y ver que fallan.**
- [ ] **Step 3: Implementar**
  - **`estadoFuenteGen`:**
    1. `fueraServicio` → `'sinTension'`. Va primero porque el poller publica `online: false` con
       `fueraServicio: true`.
    2. Sin estado, o `!campoVivo(s, v)`, o `s.license === 'excedido'` → `'desconocido'`.
    3. Señal `typeof === 'boolean'` → `'energizado'` o `'sinTension'` según su valor.
    4. Sin señal booleana → umbrales `RPM_MARCHA` y `KW_CARGA`.
  - **Fuentes:** agregar `...d.nodos.filter(n => n.tipo === 'gen').map(n => [key(n.id, 'a'), estadoFuenteGen(n, v)])`
    a `fuentes`.
  - **`estadoEquipo`:** `case 'gen'` con el mismo camino de `ref` simple que `reco`.
  - **`resumenSitio`:** usa `estadoGen` para el `estado`, y `kw` solo si está vivo.
- [ ] **Step 4: Correr vitest y ver que pasan.** Frontend completo en verde y `tsc -b` sin errores.
- [ ] **Step 5: Commit** `feat(unifilar): generador como fuente, alarmas y resumen de sitio`.

### Task 3: Editor (paleta, nodo nuevo, propiedades, generar desde config)

**Files:**
- Modify:
  - `frontend-react/src/components/unifilar/Paleta.tsx:3`.
  - `frontend-react/src/lib/unifilarEditor.ts`: `nuevoNodo` (`:52-53`) y `generarDesdeConfig` (`:77-117`).
  - `frontend-react/src/components/unifilar/Propiedades.tsx`: `:67-71`, `:165`, `:193` y `:196-211`.
- Test: `frontend-react/src/lib/unifilarEditor.test.ts`.

**Interfaces:**
- Consume: `primero(lista)`, que ya está en `unifilarEditor.ts`.
- Produce: `nuevoNodo('gen', x, y, id, cfg)` devuelve `{ tipo: 'gen', ref: <primer generador habilitado>, mostrar: ['kw', 'modo'] }`.

- [ ] **Step 1: Escribir los tests que fallan**
  - **`nuevoNodo('gen')`:** con `generadores [{name: 'GE 1'}]` da `ref 'GE 1'` y `mostrar ['kw', 'modo']`.
  - **`generarDesdeConfig`:**
    - Config: `generadores [GE 1, GE 2 enabled:false, GE 3 fueraServicio:true]`.
    - Resultado: un `recuadro` con `titulo 'Generadores'` y nodos `gen` con `ref` `GE 1` y `GE 3`, en ese orden.
    - Con reguladores, el recuadro de Generadores va después del de Reguladores.
- [ ] **Step 2: Correr vitest y ver que fallan.**
- [ ] **Step 3: Implementar**
  - **`nuevoNodo`:** `case 'gen'`.
  - **`generarDesdeConfig`:** `if (gens.length) cajas.push(['Generadores', [gens.map(g => ({tipo: 'gen', ref: g.name}))]])`
    después del push de Reguladores.
  - **Paleta:** `['gen', 'Generador']` en el grupo Equipos.
  - **Propiedades:**
    - `camposDe` elige la lista por tipo con un mapa `{reco: 'reconectadores', reg: 'reguladores', gen: 'generadores'}`.
    - Selector de equipo para `gen` con `cfg.generadores`.
    - `gen` en `ENERGIZABLES` solo si esa lista tiene ese sentido. Revisar su uso en `:165` y no agregarlo si es
      solo para equipos que se energizan desde afuera.
    - `gen` en la condición de libres (`:193`).
- [ ] **Step 4: Correr vitest y ver que pasan.** También `tsc -b`.
- [ ] **Step 5: Commit** `feat(unifilar): generador en la paleta, propiedades y generar desde config`.

### Task 4: Valores, panel y tendencias del generador

**Files:**
- Modify:
  - `frontend-react/src/components/unifilar/Mediciones.tsx`: `equipoDe` (`:25-26`), `FIJAS` (`:36-44`) y `lineas`
    (`:58-68`).
  - `frontend-react/src/components/unifilar/PanelEquipo.tsx`: cabecera y enlaces (`:92-93`).
  - `frontend-react/src/lib/tendencia.ts:51-61`: `serieDe`.
- Test:
  - `frontend-react/src/lib/tendencia.test.ts`.
  - Nuevo: `frontend-react/src/components/unifilar/Mediciones.test.ts`, para `lineas`, que es una función pura.

**Interfaces:**
- Consume: `modoDe`, `modoTexto` y `estadoGen` de `lib/generador.ts`.
- Produce:
  - `FIJAS.gen = { kw: ['P', 'kW', 0], hz: ['f', 'Hz', 1], vl1l2: ['V L-L', 'V', 0], rpm: ['Velocidad', 'rpm', 0], fp: ['FP', '', 2], modo: ['Modo', '', 0], horas: ['Horas', 'h', 0] }`.
  - `equipoDe` devuelve `campos` de `c.generadores` para `gen`.

- [ ] **Step 1: Escribir los tests que fallan**
  - **`lineas` de un `gen` con `mostrar ['kw', 'modo']`:**

    | Modelo | Datos | Resultado |
    |---|---|---|
    | `dse8610` | `valores {kw: 180, modo: 1}` | `['180 kW', 'Automático']` |
    | `hgm6120` | sin `modo`, `senales {'Modo manual': true}` | `'Manual'` en la línea de modo (Review Focus 3) |
    | cualquiera | estado `online: false` | `'—'` |

  - **`serieDe` de un `gen`:**
    - Con filas `campo` que tienen `kw` y `hz`, el primer gráfico es «Potencia» en kW.
    - Con filas `x_nivel_de_combustible`, aparece «Combustible» en %.
    - Sin datos de batería, el gráfico de batería no aparece (lo filtra `varias`).
- [ ] **Step 2: Correr vitest y ver que fallan.**
- [ ] **Step 3: Implementar**
  - **`lineas`:**
    - Rama `m === 'modo' && n.tipo === 'gen'`: `modoTexto(st.modelo, modoDe(st))` si `fresco(st, v)`, y `'—'` si no.
    - El resto de las claves usa el camino numérico existente.
  - **`serieDe`:** `case 'gen'` con `varias(s.campo, [['Potencia','kW','kw',1,0], ['Frecuencia','Hz','hz',1,1], ['Tensión L-L','V','vl1l2',1,0], ['Velocidad','rpm','rpm',1,0], ['Combustible','%','x_nivel_de_combustible',1,0], ['Batería','V','x_tension_de_bateria',1,1]])`.
    - Verificar el nombre real del campo `x_<slug>` con `slug()` del poller.
  - **`PanelEquipo`**, para `gen`:
    - Cabecera con `estadoGen(st).texto` y el modo.
    - Enlace «Ver en Generadores» a `/generadores/<name>`, en lugar de Dashboard.
- [ ] **Step 4: Correr vitest y ver que pasan.** También `tsc -b`.
- [ ] **Step 5: Commit** `feat(unifilar): valores, panel y tendencias del generador`.

### Task 5: Símbolo, bloque de sitio, clic y "Ver en el unifilar"

**Files:**
- Modify:
  - `frontend-react/src/components/unifilar/Simbolos.tsx`:
    - `Dibujito` (`:72-108`);
    - color en `Simbolo` (`:157-178`);
    - texto debajo (`:198-208`);
    - `Sitio` (`:299-325`);
    - `nodeTypes` (`:382-386`).
  - `frontend-react/src/views/Unifilar.tsx:32`: `CLICABLES`.
  - `frontend-react/src/components/GenCard.tsx`: `<VerEnUnifilar>`, igual que `RecoCard.tsx:46`.
  - `frontend-react/src/mock/`: dibujar el generador de ejemplo en el unifilar mock, si el mock tiene un dibujo.
- Test: no hay tests de componentes en `components/unifilar`. La verificación es visual en modo mock.

**Interfaces:**
- Consume:
  - `estadoGen(st).tono` y `.texto`;
  - `resumenSitio(...).gens` y `masGens` (tarea 2);
  - `equipoDe` (tarea 4).

- [ ] **Step 1: Implementar el símbolo**
  - **`Dibujito`:** `case 'gen'` con un círculo, la "G" (helper `texto()`) y una senoide chica, más `cab(p, …)` del
    borne `a`. La base es `bomba`.
  - **Color del cuerpo** (rama `gen` como la de `reco`), según el tono:

    | Tono | Color |
    |---|---|
    | `run` | El color de "en servicio" del tema |
    | `off` | "Detenido" |
    | `com` | Gris |
    | Alarmas | Las cubre `estadoEquipo` |

  - **Texto debajo:** `estadoGen(st).texto`.
  - **`nodeTypes`:** registrar `gen: Simbolo`.
- [ ] **Step 2: Implementar el resto**
  - **Bloque de sitio:** sección Generadores en `Sitio`, con una línea por grupo («GE 1 · EN CARGA · 180 kW») y
    «+N más».
  - **Clic:** `'gen'` en `CLICABLES`.
  - **`GenCard`:** `<VerEnUnifilar nombre={cfg.name} />`, igual que `RecoCard`.
- [ ] **Step 3: Verificar**
  - `tsc -b` sin errores y el frontend completo en verde.
  - En el modo mock (`npm run dev` con mock), con un generador dibujado y conectado a una carga:
    - con el mock en carga, la línea se ve energizada y con flujo;
    - forzando el mock a `online: false`, la línea queda desconocida y el símbolo gris;
    - el clic abre el panel con tendencias;
    - el botón de la tarjeta lleva al símbolo.
  - Captura de pantalla para el usuario.
- [ ] **Step 4: Commit** `feat(unifilar): símbolo del generador, bloque de sitio y enlaces`.

### Task 6: Integración y entrega

- [ ] **Step 1:** regenerar `files.txt` y correr `sync-master.sh` y `tw.sh`. Esperado: weg-api, poller y frontend en
  verde, y `TSC_OK`.
- [ ] **Step 2:** revisión de toda la rama, con un revisor nuevo.
- [ ] **Step 3:** con el OK del usuario, push, PR, CI verde y merge.
- [ ] **Step 4:** tag `v1.34.0` y `weg-scada update v1.34.0`, primero en la oficina y después en planta. Planta solo
  con el OK explícito del usuario.
