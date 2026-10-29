# Unifilar — Parte B: dibujo con editor en el portal — Diseño

Fecha: 2026-10-29 · Estado: aprobado en conversación; revisada el 2026-10-29 tras bancos, mímico,
puntos libres y DNP3, pendiente revisión de la spec escrita
Contexto: `2026-10-28-unifilar-equipos-design.md` (parte A: reconectadores y reguladores),
`2026-10-29-puntos-libres-design.md` (mediciones y señales libres), `2026-10-29-dnp3-toshiba-design.md`
(lectura DNP3), PR #95–#99 (banco de reguladores, mímico, fasorial por banco),
`2026-10-26-comunicaciones-design.md` («Sin enlace»), módulo de licencia `unifilar`.

## 1. Problema y objetivo

El módulo Unifilar promete un esquema con el estado en vivo de la red. La parte A dejó los equipos
(reconectadores, reguladores) leyéndose y publicándose; falta el dibujo.

**Uso principal: supervisión en vivo.** El operador mira el unifilar para ver de un vistazo qué
está energizado, qué está abierto o cerrado, qué tiene alarmas y qué no comunica. El dibujo es
simple; lo importante son los colores y los estados.

### Decisiones tomadas

- **Un dibujo general + un dibujo de detalle por sitio.** En el general, cada sitio es un bloque
  que abre su detalle.
- **Energización por topología:** el sistema recorre las conexiones desde las fuentes; un
  reconectador abierto deja sin tensión todo lo de aguas abajo.
- Elementos: equipos del sistema con sus **mediciones** al lado del símbolo, pasivos eléctricos,
  equipos de comunicación y textos.
- **Bancos de reguladores:** un banco (las fases monofásicas de un mismo equipo, p. ej. «RUA-01
  Tapelectro» o «Toshiba») se dibuja como **un solo símbolo de regulador**, como en un unifilar real.
- Los equipos se leen igual por Modbus o por DNP3: el dibujo usa el estado que publica el poller
  (MQTT) y no depende del protocolo.
- **Editor en el portal** con React Flow (`@xyflow/react`).
- **Colores configurables:** convención del portal (cerrado = verde) o ANSI (cerrado = rojo).
- Solo lectura: el dibujo no manda comandos.

### Criterios de éxito

- Un admin dibuja en el portal la red general y el detalle de un sitio, vincula cada símbolo con
  un equipo de Configuración y guarda; todos los usuarios lo ven, en planta y en la oficina.
- Con un reconectador abierto, los tramos de aguas abajo se ven sin tensión; si el reconectador
  no comunica, se ven «desconocido» (nunca «sin tensión» por falta de datos).
- Cada equipo muestra su estado, sus alarmas y las mediciones elegidas, actualizadas en vivo.
- Sin el módulo `unifilar` no aparece el menú y la API responde como hoy con módulos ausentes.

### Fuera de alcance

- Comandos desde el dibujo.
- Símbolos normalizados completos (IEC/ANSI exactos) y datos de placa.
- Cálculos eléctricos (flujo de carga, cortocircuito).
- Edición en la oficina (la réplica es de solo lectura).

## 2. Modelo y almacenamiento

### 2.1 Archivo

`config/unifilar.json`, separado de `config.json` (dibujar no reescribe ni revalida la config de
equipos y el poller no lo lee). Entra en el backup por vivir en `config/`.

```json
{ "version": 1, "colores": "portal",
  "dibujos": [
    { "id": "general", "nombre": "Red general", "tipo": "general",
      "nodos": [ { "id": "n1", "tipo": "reco", "x": 120, "y": 80, "rot": 0,
                   "ref": "Reco Salida 1", "mostrar": ["ia", "va"] } ],
      "conexiones": [ { "id": "c1", "desde": ["n1", "b"], "hasta": ["n2", "a"] } ] } ] }
```

- `colores` ∈ {`portal`, `ansi`}, por defecto `portal`.
- `dibujos[]`: exactamente uno `tipo: "general"` con `id: "general"`; el resto `tipo: "sitio"`.
- Sin archivo, la API devuelve el contenido por defecto: el dibujo «Red general» vacío.

### 2.2 Nodos

Campos comunes: `id` (único en el dibujo), `tipo`, `x`, `y` (enteros), `rot` ∈ {0, 90, 180, 270}.

| Grupo | `tipo` | Campos propios | Puntos de conexión |
|---|---|---|---|
| Equipos | `reco` | `ref` (reconectadores[]), `mostrar` | `a`, `b` |
| | `reg` | `ref` (reguladores[]) **o** `banco` (nombre de un banco de reguladores), `mostrar` | `a`, `b` |
| | `medidor` | `ref` (meters[]), `mostrar` | `a`, `b` |
| | `bomba` | `ref` (devices[]), `mostrar` | `a` |
| | `caudalimetro` | `ref` (flowmeters[]), `mostrar` | — |
| Eléctricos | `fuente` | `nombre`, `vinculo?` (ver §3.3) | `a` |
| | `barra` | `largo` (múltiplo de 10, 40–2000) | `p0`…`pN` (uno cada 20 px) |
| | `trafo` | `nombre` | `a`, `b` |
| | `seccionador`, `fusible` | `nombre`, `cerrado` (bool, lo marca el admin) | `a`, `b` |
| | `carga` | `nombre` | `a` |
| Comunicaciones | `comm` | `ref` (comms[]) | — |
| Dibujo | `texto` | `texto` (1–200), `tam` ∈ {12, 16, 24} | — |
| | `recuadro` | `ancho`, `alto`, `titulo?` | — |
| | `sitio` | `dibujo` (id de un dibujo de sitio) | — |

`mostrar`: lista de mediciones a mostrar junto al símbolo (§3.5): keys fijas del tipo de equipo y,
para reconectadores y reguladores, también **mediciones y señales libres por nombre**
(`{ "med": "Potencia activa" }`, `{ "senal": "Motor elevando" }`).

Un nodo `reg` lleva `ref` **o** `banco`, nunca los dos. Con `banco`, el nodo representa a todos los
reguladores habilitados con ese `banco` en la config, en el orden de la lista.

### 2.3 Conexiones

`{ id, desde: [nodo, punto], hasta: [nodo, punto] }`. Unen dos puntos existentes de dos nodos
distintos del mismo dibujo. Son la topología.

### 2.4 Validación (API)

- Estructura y tipos según §2.1–§2.3; ids únicos por dibujo; conexiones a nodos y puntos
  existentes; `sitio.dibujo` apunta a un dibujo de sitio existente; un solo `general`.
- Límites: 64 dibujos, 1500 nodos y 3000 conexiones por dibujo, archivo ≤ 2 MB.
- Un `ref` (o `banco`) que no existe en la config **no** es error: el nodo se ve «equipo no
  encontrado».
- `mostrar`: keys fijas del tipo (§3.5) u objetos `{ med }` / `{ senal }` con nombre de 1–40
  caracteres; un nombre que el equipo no tiene se muestra «—» (no es error).

## 3. Energización y estado en vivo

Todo se calcula en el navegador con los datos que el portal ya recibe por MQTT (store
`drives.ts`: `drives`, `meters`, `campo`, `flowmeters`, `comms`). Sin cambios en el backend.

### 3.1 Propagación — `src/lib/energizar.ts`

`energizar(dibujo, vivos, opts) → { tramos: Map<conexionId, Estado>, nodos: Map<nodoId, Estado> }`,
`Estado` ∈ {`energizado`, `sinTension`, `desconocido`}. Función pura.

- Se arranca en cada `fuente` con su estado (§3.3) y se recorre el grafo. Cada tipo define qué
  puntos une por dentro:
  - `barra`: todos sus puntos entre sí.
  - `trafo`, `reg` (regulador o banco), `medidor`: `a` ↔ `b` siempre.
  - `seccionador`, `fusible`: `a` ↔ `b` si `cerrado`.
  - `reco`: `a` ↔ `b` si está **en línea, cerrado (`estado` verdadero) y sin `DISPARO`**; si está
    offline, excedido, sin dato o con dato viejo, propaga **desconocido**.
  - `bomba`, `carga`, `fuente`: puntas.
  - `comm`, `texto`, `recuadro`, `sitio`, `caudalimetro`: no participan.
- Precedencia en cada tramo/nodo: `energizado` > `desconocido` > `sinTension` (si una fuente lo
  energiza por un camino cierto, está energizado aunque otro camino sea desconocido).
- Un nodo de equipo con `ref` inexistente se trata como `reco` desconocido si es `reco`, y como
  paso libre si es `reg`/`medidor`.
- Lazos: cada nodo/punto se visita una vez por estado (sin bucles infinitos).

### 3.2 Colores

| Estado | `portal` | `ansi` |
|---|---|---|
| Tramo energizado / equipo cerrado | verde | rojo |
| Sin tensión / abierto | gris | verde |
| Desconocido | ámbar punteado | ámbar punteado |
| Alarma activa | borde rojo parpadeante | borde rojo parpadeante |

### 3.3 Fuentes

- Por defecto, siempre `energizado`.
- `vinculo` opcional: `{ ref | banco, kind: 'medidor'|'reg', med?, nominal, umbralPct = 50 }` →
  energizado si la tensión medida ≥ `nominal × umbralPct / 100`; `sinTension` si es menor;
  `desconocido` si el equipo no comunica o no hay dato. La tensión es la del equipo (`voltage` del
  medidor, `v` del regulador) o, con `med`, esa medición libre (p. ej. «Tensión fuente», que es la
  que corresponde a la fuente aguas arriba de un regulador). Con `banco`, energizado si **alguna**
  fase en línea supera el umbral; desconocido si ninguna comunica.
- En dibujos de sitio, `vinculo` puede ser `{ desde: <id de nodo del dibujo general> }`: la fuente
  toma el estado de ese nodo en el general.

### 3.4 Estado propio de cada equipo

- Símbolo según el estado: reco cerrado/abierto/disparo; bomba en marcha/parada/falla; etc.
- Alarmas activas (las mismas de Alarmas): borde rojo parpadeante.
- Sin comunicación (online falso, excedido o dato con más de 3 ciclos): gris con ícono.
- `sinEnlace`: «Sin enlace · X», como en las tarjetas.
- **Banco:** «n/m en línea» bajo el símbolo; alarmas = unión de las de sus fases; gris solo si
  ninguna fase comunica (ámbar si comunican algunas).

### 3.5 Mediciones

Junto al símbolo, lo elegido en `mostrar`, con unidad y con el **mismo formateador de las tarjetas**
(es-AR: punto de miles y coma decimal, `21.663 V · 58 A · Tap +8`); `null` → «—». Keys fijas por
tipo: reco `ia ib ic va vb vc operaciones`; reg `tap v i vConsigna`; medidor `voltage current power
pf`; bomba `current frequency power`. Las mediciones libres usan su unidad y decimales; las señales,
una luz (verde activa / gris inactiva) con su nombre.

En un **banco**, cada key se muestra por fase en el orden del banco (`Tap +8 / +6 / +8`,
`21.663 / 21.646 / 21.628 V`).

Clic en el equipo abre un panel lateral: en un equipo suelto, sus valores (como el panel de detalle
del Dashboard) y enlaces a su tarjeta y a Tendencias; en un **banco**, además, su **mímico y su
fasorial** (los mismos componentes del recuadro del banco en el Dashboard).

### 3.6 Bloque de sitio

En el general, el bloque `sitio` muestra el resumen de su dibujo: si tiene algún tramo energizado,
la cantidad de alarmas activas y si hay equipos sin comunicación. Clic → abre el dibujo.

## 4. Portal

- **Menú «Unifilar»** con el módulo, para todos los roles. Ruta `/unifilar` (general) y
  `/unifilar/:id` (sitio), con migas «Red general › Sitio». Vista cargada aparte (lazy) para no
  sumar peso al resto del portal.
- **Modo vista** (por defecto): zoom, paneo, «ajustar a pantalla». En celular, solo vista. En la
  oficina, solo vista.
- **Modo edición** (admin, solo planta), botón «Editar»:
  - Paleta a la izquierda con los grupos de §2.2; se arrastra al lienzo.
  - Panel de propiedades a la derecha del elemento seleccionado (equipo de Configuración como
    desplegable —para `reg`, reguladores sueltos y bancos—, rotación, `mostrar` con casillas que
    incluyen las mediciones y señales libres del equipo, `cerrado`, `vinculo` con su medición,
    texto, tamaño).
  - Conexiones arrastrando de punto a punto; líneas ortogonales; grilla con imán de 10 px.
  - Barra estirable con tirador.
  - Selección múltiple, borrar, copiar/pegar, deshacer/rehacer (50 pasos), zoom.
  - Dibujos: crear, renombrar, ordenar, borrar (de sitio; el general no se borra). Selector de
    colores.
  - «Guardar» explícito (envía todo el archivo, muestra errores de validación); «Descartar»;
    aviso al salir con cambios sin guardar.
- **Símbolos:** SVG propios, simples, estilo IEC, legibles en tema claro y oscuro.

## 5. API

`routes/unifilar.js` + `services/unifilar.js`, montados con `requireModule('unifilar')`.

- `GET /api/unifilar` (cualquier usuario autenticado) → `{ version, data }`; `version` = hash
  (sha256 hex, 16 caracteres) del contenido guardado.
- `PUT /api/unifilar` (admin) con `{ base, data }`: valida (§2.4); si `base` ≠ versión actual →
  **409** `El unifilar cambió desde que lo abriste`; escritura atómica (tmp + rename); responde
  `{ version }`. Límite propio de cuerpo 2 MB (el general de la API es 1 MB); mayor → **413**.
- En la réplica, el `PUT` lo rechaza el guardia de escritura existente.

## 6. Réplica de oficina

- `GET /api/replica/unifilar` en planta (mismo token que config/licencia) → contenido del archivo
  (404 si no existe).
- `weg-replica` lo baja en el ciclo de archivos (cada 5 min) y lo escribe solo si cambió; si planta
  responde 404, no toca el local.

## 7. Dependencias

- Frontend: `@xyflow/react` (MIT), versión fija.
- Frontend (desarrollo): `vitest`, solo para las pruebas de `energizar.ts` y de la conversión del
  archivo al formato de React Flow.

## 8. Pruebas

- **energizar.ts (vitest):** reco cerrado/abierto/disparo/offline/excedido/dato viejo; barra con
  dos fuentes; seccionador abierto; fuente vinculada bajo y sobre el umbral y sin dato; fuente de
  sitio «desde» un nodo del general; `ref` inexistente; lazo; precedencia energizado >
  desconocido.
- **Conversión archivo ↔ React Flow (vitest):** ida y vuelta sin pérdida.
- **API:** cada regla de §2.4; contenido por defecto; 409; 413; operador → 403; sin módulo → 403;
  réplica → `PUT` rechazado.
- **Réplica:** baja el archivo, no reescribe si no cambió, 404 no borra el local.
- **Frontend:** build.
- **energizar.ts (vitest), además:** nodo `reg` con `banco` (paso libre); fuente vinculada a un
  banco por `med` («Tensión fuente») con fases en línea, parciales y sin comunicación.
- **Integración (docker-in-docker, imagen edge):** dibujar fuente → barra → reco → bomba con el
  esclavo Modbus simulado; reco abierto → tramo de aguas abajo gris; esclavo apagado → ámbar;
  un nodo `reg` con el banco «RUA-01 Tapelectro» (esclavo Modbus) y otro con «Toshiba» (outstation
  DNP3 simulado) mostrando taps por fase y mediciones libres; panel del banco con mímico y fasorial;
  la oficina ve el mismo dibujo.
- **En planta:** el reconectador real todavía no comunica (RUT del reconectador offline): su nodo y
  lo de aguas abajo deben verse «desconocido» (ámbar), nunca «sin tensión».

## 9. Release

v1.13.0. Planta y después oficina con `sudo weg-scada update`.
