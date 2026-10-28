# Unifilar — Parte A: reconectadores y reguladores — Diseño

Fecha: 2026-10-28 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-10-22-licencias-design.md` (módulo `unifilar`, nivel B para reconectador y
regulador), `2026-10-26-comunicaciones-design.md` («Conectado por» / `sinEnlace`), poller
`nodered/weg-modbus-poller`.

## 1. Problema y objetivo

El módulo Unifilar (cotización 2026-10-22) muestra un esquema por sitio con el estado en vivo de
medidores, reconectadores, reguladores y equipos de comunicación. Los reconectadores PMSet U y los
reguladores Toshiba TSEA y Tapelectro todavía no existen en el sistema. Se hace en dos partes:

- **A (esta spec):** reconectadores y reguladores como equipos nuevos: lectura Modbus, config,
  tarjetas, alarmas y licencia.
- **B (spec aparte, después):** el dibujo del unifilar con editor en el portal.

### Decisiones tomadas

- **Solo lectura.** Nada de abrir/cerrar ni mover taps desde el portal.
- **Mapa de puntos genérico** (`src/points.js` en el poller), editable en el portal por equipo.
  Generadores reutiliza el mismo mecanismo.
- Reconectador: estado abierto/cerrado, corrientes y tensiones por fase, bloqueo, disparo,
  contador de operaciones.
- Regulador: posición de tap, tensión, corriente, consigna, modo auto/manual y local/remoto,
  alarmas del regulador.
- Los reguladores se leen por Modbus a través del gateway Moxa DNP3→Modbus (no DNP3).

### Criterios de éxito

- Un admin da de alta un reconectador o regulador desde Configuración, elige el modelo y el mapa
  por defecto se carga solo; en el Dashboard aparece su tarjeta con valores en vivo.
- Editando el mapa en el portal y guardando, a los ~30 s la tarjeta y el editor muestran los
  valores nuevos, sin tocar la consola.
- Un disparo del reconectador o un punto de alarma del regulador aparece en Alarmas (activas e
  historial) y genera aviso por mail/Telegram como las fallas de los variadores.
- Sin el módulo `unifilar`, nada cambia: no se lee, no se muestran las secciones, las listas se
  ignoran.

### Fuera de alcance

- El dibujo del unifilar (parte B).
- Comandos de cualquier tipo.
- Histórico de corrientes, tensiones y tap en Tendencias (se suma después reusando lo de caudales).
- DNP3 directo, funciones Modbus 1/2 (coils / discrete inputs).

## 2. Configuración (`config.json`)

### 2.1 Listas nuevas

Al lado de `meters` y `flowmeters`:

```json
"reconectadores": [{ "name": "Reco Salida 1", "modelo": "pmsetu", "ip": "192.168.10.50",
  "port": 502, "unitId": 1, "enabled": true, "enlace": "Radio Pozo 3", "mapa": [ … ] }],
"reguladores": [{ "name": "Regulador Línea 2", "modelo": "tsea", "ip": "192.168.10.60",
  "port": 502, "unitId": 3, "enabled": true, "tapMin": -16, "tapMax": 16, "mapa": [ … ] }]
```

- `modelo` ∈ {`pmsetu`} para reconectadores, {`tsea`, `tapelectro`} para reguladores, y `otro` en
  ambos. Solo decide qué mapa por defecto se carga; el poller no lo usa.
- `port` por defecto 502, `unitId` por defecto 1. Varios reguladores detrás del mismo Moxa
  comparten `ip:port` y se distinguen por `unitId`.
- `enlace` (opcional): igual que en Comunicaciones (nombre de un `comms[]`).
- `tapMin`/`tapMax` (reguladores, opcional, por defecto −16/+16): solo para la barra de la tarjeta.
- `mapa` es obligatorio y viaja completo en la config: el portal copia el mapa por defecto al dar
  de alta el equipo. Los mapas por defecto viven solo en la API (§5.4).

### 2.2 Punto del mapa

```json
{ "key": "ia", "fc": 3, "addr": 1200, "tipo": "f32", "orden": "BE", "escala": 1 }
{ "key": "estado", "fc": 3, "addr": 1300, "tipo": "u16", "bit": 0 }
{ "key": "auto", "fc": 3, "addr": 7, "tipo": "u16", "valor": 1 }
{ "key": "alarma", "fc": 3, "addr": 1301, "tipo": "u16", "bit": 2, "texto": "Tap en límite" }
```

| Campo | Valores | Notas |
|---|---|---|
| `key` | ver §2.3 | única dentro del mapa, salvo `alarma` (puede repetirse) |
| `fc` | 3 (holding), 4 (input) | |
| `addr` | 0–65535 | dirección de protocolo, **base 0** (0 = 40001 / 30001) |
| `tipo` | `u16`, `s16`, `u32`, `s32`, `f32` | 32 bits ocupan `addr` y `addr+1` |
| `orden` | `BE` (por defecto), `LE` | solo 32 bits: `BE` = palabra alta primero |
| `escala` | número, por defecto 1 | valor = crudo × escala (no aplica a sí/no) |
| `bit` | 0–15 | el punto es sí/no: bit encendido = verdadero |
| `valor` | entero | el punto es sí/no: crudo == valor → verdadero |
| `texto` | 1–80 caracteres | obligatorio en `alarma`, ignorado en las demás |

`bit` y `valor` son excluyentes y solo se usan con `u16`/`s16`. `alarma` siempre es sí/no (debe
llevar `bit` o `valor`).

### 2.3 Keys

| Equipo | Key | Tipo | Significado |
|---|---|---|---|
| Reconectador | `estado` | sí/no | verdadero = cerrado |
| | `ia` `ib` `ic` | número | corriente por fase (A) |
| | `va` `vb` `vc` | número | tensión por fase (V) |
| | `bloqueo` | sí/no | lockout |
| | `disparo` | sí/no | disparo activo / último disparo sin reponer |
| | `operaciones` | número | contador de operaciones |
| Regulador | `tap` | número | posición de tap |
| | `v` `i` | número | tensión regulada (V) y corriente (A) |
| | `vConsigna` | número | tensión de consigna (V) |
| | `auto` | sí/no | verdadero = automático |
| | `remoto` | sí/no | verdadero = remoto |
| Ambos | `alarma` | sí/no | una alarma con su `texto`; puede haber varias |

Una key fuera de la tabla de su equipo es un error de validación. Ninguna key es obligatoria: un
mapa puede tener solo `estado`.

### 2.4 Validación (API, `validateConfig`)

- `reconectadores[]` y `reguladores[]`: nombre no vacío; IPv4 válida; `port` 1–65535; `unitId`
  0–255; `modelo` conocido para su lista; `enlace` como en Comunicaciones; `tapMin < tapMax`
  enteros.
- **Nombres únicos entre `devices[]`, `reconectadores[]` y `reguladores[]`** (la API guarda el
  estado en vivo por nombre en `deviceStates`). Mensaje:
  `nombre repetido entre variadores, reconectadores y reguladores: <n>`.
- `mapa`: arreglo de 1–64 puntos, cada uno según §2.2/§2.3. Mensajes con el formato existente
  `<tag> (<nombre>): mapa[<i>].<campo> …`.
- Licencia: §4.

## 3. Lectura (poller)

### 3.1 `src/points.js`

Funciones puras más una de lectura:

- `blocks(mapa)` → lista de `{ fc, start, count, puntos }`. Agrupa por `fc`, ordena por `addr` y
  une puntos mientras el bloque no pase de 125 registros y el hueco entre puntos sea ≤ 8 registros.
- `decode(punto, regs, start)` → número, booleano o `null` según §2.2. `f32` no finito → `null`.
- `async readPoints(item, poll)` → `{ online, valores }`. `poll` es `connections.poll(ip, port,
  unitId, startAddr, count, fc = 3)`: se le agrega el 6.º parámetro opcional `fc` (4 →
  `readInputRegisters`; hoy solo lee holding), sin cambiar a los que ya la llaman. Un bloque
  que falla deja `null` sus puntos; **`online` es falso solo si fallan todos los bloques**.
- `alarmasDe(kind, valores, mapa)` → `{ TIPO: texto }`:
  - reconectador: `disparo` verdadero → `DISPARO: "Disparo"`; `bloqueo` verdadero →
    `BLOQUEO: "Bloqueado"`;
  - cada punto `alarma` verdadero → `ALARMA_<i>: texto`, con `i` = índice del punto en `mapa`.

### 3.2 Ciclo

- Reconectadores y reguladores entran en los grupos por `ip:port` de `index.js`, después de
  variadores, medidores y caudalímetros del mismo `ip:port`. Usan la misma conexión, el mismo
  `offline.js` (3 fallas seguidas = offline) y el mismo `offlineRetry`.
- Solo los habilitados y permitidos por la licencia (`allowed().reconectadores` /
  `.reguladores`). Un equipo excedido publica `license: 'excedido'` como los demás.
- Un equipo borrado o deshabilitado limpia su tópico retenido (`retained.js`).
- El poller relee la config cuando cambia (mecanismo actual): un mapa editado se aplica en el
  próximo ciclo.

### 3.3 MQTT

Retenido `weg/reco/<sanitizeTopic(name)>` y `weg/reg/<sanitizeTopic(name)>`:

```json
{ "name": "Reco Salida 1", "kind": "reco", "modelo": "pmsetu", "online": true, "ts": 1793211335879,
  "valores": { "estado": true, "ia": 112.4, "ib": 110.9, "ic": 115.0, "bloqueo": false },
  "alarmas": { "DISPARO": "Disparo" } }
```

- `kind` ∈ {`reco`, `reg`}. `valores` trae todas las keys del mapa (las `alarma` no van en
  `valores`, solo en `alarmas`). Un punto ilegible va `null`.
- Offline: `valores` vacío, `alarmas` vacío, y `sinEnlace` según `links.js` (se agregan los kinds
  `reco` y `reg` a `linkOf`/`dependents`; no heredan gateway).

## 4. Licencia (`license.js`, las dos copias idénticas)

- `tier('reco') = 'B'`, `tier('reg') = 'B'`.
- `usage` y `allowed` cuentan `reconectadores` y `reguladores` habilitados, solo con el módulo
  `unifilar` cuando se pasa `lic`. `allowed()` devuelve además `reconectadores: Set` y
  `reguladores: Set`.
- Orden dentro del nivel B: variadores, medidores, reconectadores, reguladores.
- `check()` rechaza guardar equipos habilitados sin el módulo:
  `La licencia no incluye el módulo unifilar`.

> **Planta:** hoy usa B 20 de 22. Con 2 reconectadores y 2 reguladores llega a 24: emitir una
> licencia nueva con B ≥ 24 antes de cargarlos.

## 5. API

### 5.1 Estado en vivo

`config.js` suscribe además `weg/reco/+` y `weg/reg/+` (hoy solo `weg/drives/+`). Los payloads
entran a `deviceStates` por nombre, igual que los variadores.

### 5.2 Historial de alarmas (`alarmLog.js`)

`activeAlarms(d)`: con el equipo online, agrega cada entrada de `d.alarmas` (`{TIPO: texto}`) a las
alarmas activas. `SIN_COMUNICACION` queda como está. Las banderas de variador (`hasFault`, etc.) no
cambian.

### 5.3 Avisos (`alerts.js`)

`evaluate()` guarda en `prevStates` las claves de `d.alarmas` vistas. Una clave nueva → aviso
(mismo `notify` y cooldown que FAULT, con `type` = la clave y `text` = el texto); una clave que
desaparece → `cleared` con texto `Resuelta`. El aviso OFFLINE funciona igual para los equipos
nuevos. Los umbrales de corriente y temperatura de variadores no se aplican (no tienen `type` de
variador).

### 5.4 Mapas por defecto

- `src/services/modelos.js`: `{ pmsetu: { kind: 'reco', nombre: 'PMSet U', mapa: [...] },
  tsea: {...}, tapelectro: {...}, 'otro-reco': {...}, 'otro-reg': {...} }`.
- `GET /api/modelos` (admin) → la lista completa. Solo lectura, sin estado.
- **PMSet U:** direcciones tomadas del manual público si se consigue durante la implementación;
  si no, las keys con direcciones 0, 1, 2… Cada mapa lleva en su descripción «direcciones a
  verificar en puesta en marcha».
- **TSEA / Tapelectro:** las direcciones las define la configuración del Moxa. El mapa por defecto
  es la distribución sugerida para el Moxa (todos `fc` 3, `u16`):

  | addr | key | notas |
  |---|---|---|
  | 0 | `tap` | `s16` |
  | 1 | `v` | escala 0.1 |
  | 2 | `i` | escala 0.1 |
  | 3 | `vConsigna` | escala 0.1 |
  | 4 | `auto` | `bit` 0 |
  | 4 | `remoto` | `bit` 1 |
  | 5 | `alarma` | `bit` 0, «Tap en límite» |
  | 5 | `alarma` | `bit` 1, «Falla de control» |

- `otro-reco` / `otro-reg`: mapa vacío con una fila de ejemplo (`estado` / `tap` en addr 0).

## 6. Portal

### 6.1 Dashboard

Con el módulo `unifilar`, dos secciones nuevas debajo de los medidores, solo si hay equipos
cargados: **Reconectadores** y **Reguladores**. Tarjetas nuevas `RecoCard` y `RegCard` con el
estilo de `PM8000Card`.

- `RecoCard`: estado grande — **Cerrado** (verde), **Abierto** (gris), **Disparo** (rojo, si
  `DISPARO` está activa); distintivo «Bloqueado»; corrientes y tensiones por fase; operaciones.
- `RegCard`: tap en número grande con barra `tapMin`…`tapMax`; tensión, corriente, consigna;
  distintivos Auto/Manual y Remoto/Local.
- Ambas: alarmas activas con su texto; «Sin enlace · X» (`SinEnlaceBadge`); «Fuera de licencia»;
  «Esperando lectura» antes del primer mensaje. Un valor `null` se muestra «—».
- Store: `store/drives.ts` suma un Map `campo` suscripto a `weg/reco/+` y `weg/reg/+`.

### 6.2 Configuración → Dispositivos

Secciones **Reconectadores** y **Reguladores** con el patrón de `FlowmetersSection`: nombre,
modelo, IP, puerto, unit ID, habilitado, «Conectado por» (`EnlaceSelect`) y, en reguladores,
tap mín./máx.

- Al crear un equipo o cambiar el modelo, se copia el mapa por defecto de `GET /api/modelos`
  (cambiar el modelo con un mapa editado pide confirmación).
- **Editor de mapa** (se expande en cada equipo): tabla con una fila por punto — key (desplegable
  con las keys de su equipo más «alarma»), fc, dirección («base 0: 0 = 40001»), tipo, orden,
  escala, bit, valor, texto. Agregar y quitar filas; **«Restaurar mapa por defecto»** con
  confirmación.
- **Valor en vivo por fila**, tomado del store (`valores[key]`, o si la alarma está activa para
  las `alarma`), para ajustar en la puesta en marcha.
- El renombrado de un equipo de comunicación (`CommsSection`) actualiza también el `enlace` de
  estas dos listas, y su baja se bloquea si lo referencian.
- El contador de licencia suma los equipos nuevos al nivel B.

## 7. Réplica de oficina

`weg-replica` suscribe además `weg/reco/+` y `weg/reg/+` y los suma a `PRUNABLE`. La config
replicada ya trae las listas y los mapas.

## 8. Pruebas

- **points.js:** `decode` para cada tipo, `orden` BE/LE, escala, `bit`, `valor`, `f32` NaN;
  `blocks` (agrupado, corte en 125, corte por hueco, separación por `fc`); `readPoints` con un
  bloque fallido (`null` parcial) y con todos fallidos (`online:false`); `alarmasDe`.
- **Esclavo Modbus falso** en el test (`ServerTCP` de `modbus-serial`, que el poller ya usa): un
  reconectador y un regulador, lectura de punta a punta con holding e input.
- **links.js:** `sinEnlace` para `reco`/`reg`.
- **API:** validación de listas y mapas (cada error de §2.4), nombres únicos entre listas,
  `activeAlarms` con `alarmas`, historial (inicio/fin de `DISPARO`), `alerts.js` aviso y resuelta,
  `GET /api/modelos` (mapas por defecto válidos según la propia validación).
- **license.js:** `reco`/`reg` nivel B, solo con el módulo, orden de asignación; igualdad de copias.
- **Réplica:** suscripción y poda de `weg/reco` y `weg/reg`.
- **Frontend:** build.
- **Integración (docker-in-docker, imagen edge):** esclavo Modbus simulado; alta desde el portal
  con mapa por defecto; valores en vivo; disparo → alarma en Alarmas; esclavo apagado → offline y
  «Sin enlace». Equipos reales en la puesta en marcha.

## 9. Release

v1.8.0. Planta y después oficina con `sudo weg-scada update`. No cambia nada visible hasta dar de
alta equipos; en planta hace falta antes la licencia con B ≥ 24.
