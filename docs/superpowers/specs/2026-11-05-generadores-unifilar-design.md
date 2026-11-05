# Generador en el unifilar: diseño

Fecha: 2026-11-05. Las cuatro partes las aprobó el usuario en la conversación. Es la etapa 2 del módulo Generadores
(ver `2026-11-05-generadores-design.md`) y la primera de sus tres piezas; las otras dos son informes y comandos remotos.

## Objetivo

Dibujar los grupos electrógenos en el unifilar con su estado en vivo. Cuando un grupo está en carga, **energiza** las
líneas que salen de él, para que el dibujo muestre quién alimenta qué cuando se corta la red.

## Enfoque

Un tipo de nodo nuevo, **`gen`**, que reutiliza el camino genérico que ya usan `reco` y `reg`. Para cada uno de los
lugares que enumeran esos tipos, se agrega `gen` al lado.

Se descartó reutilizar la `fuente` con un vínculo al generador: costaba menos código, pero el símbolo no se ve como
grupo, no tiene alarmas, valores ni panel, y no aparece en la barra de alarmas.

## 1. Nodo, símbolo y datos

### Nodo

- Forma: `{ tipo: 'gen', ref, mostrar, … }`.
  - `ref` es el `name` del equipo en la lista `generadores` de la config.
  - El resto de los campos es igual a los demás nodos: `rot`, `lados`, `escala`, `letra`, `posTexto`.
- Bornes: `a` (potencia, la salida del grupo) y `d` (datos, para el enlace de comunicación como en `reco`).
  - `puntosDe('gen') = ['a', 'd']`, idéntico en el frontend (`lib/unifilar.ts`) y en la API (`services/unifilar.js`).

### Símbolo

- Un círculo con una "G" y una senoide "~" en el `Dibujito` de `Simbolos.tsx`, con el cable de `a`. La base es el
  dibujo de la bomba.
- Se registra en `nodeTypes`.

### Color

El color sale de `estadoGen(st)`, la misma función de la tarjeta:

| Estado | Color del cuerpo |
|---|---|
| `carga` / `marcha` | Color "en servicio" |
| `auto` / `parado` | Color "detenido" |
| `falla` / `advertencia` | Marco rojo que titila (el que ya pone `estadoEquipo` cuando hay alarmas) |
| `sin_com`, fuera de licencia, `fuera_servicio` | Gris, con el texto debajo |

Debajo del nombre va el texto del estado ("EN CARGA", "AUTOMÁTICO", …).

### Valores junto al símbolo

- **Claves fijas** (`FIJAS` en `Mediciones.tsx` y `KEYS.gen` en la API): `kw`, `hz`, `vl1l2`, `rpm`, `fp`, `modo`
  y `horas`.
- `modo` se muestra con `modoTexto(modelo, modoDe(st))`, como texto. `lineas()` hoy solo formatea números, así que
  hay que agregarle este caso.
- **Por defecto** en un nodo nuevo: `['kw', 'modo']`.
- **Puntos libres** del mapa (`{med}`, `{senal}`): se admiten agregando `gen` a `LIBRES`.

### Datos y validación

- **Equipo:** `equipoDe()` toma `gen` de `cfg.generadores` con `campo(...)`.
- **Validación en la API** (`services/unifilar.js`):
  - `gen` entra en `TIPOS` y en `CON_REF`, y se agrega `KEYS.gen`.
  - `puntosDe` devuelve `a` y `d`.
  - Las referencias no se verifican contra la config, como hoy en los demás equipos.

### Licencia

- El símbolo se dibuja con el módulo **unifilar**.
- Los datos en vivo llegan solo si la licencia también tiene **generadores**. Si no lo tiene, el poller publica el
  generador como fuera de licencia y el símbolo queda gris.

## 2. Energización

El generador es una **fuente** que inyecta por su borne `a`. Se agrega a la lista `fuentes` de `energizar()`, con
el estado de una función pura nueva, `estadoFuenteGen(st, ahora)`:

| Situación | Estado de la fuente |
|---|---|
| No hay estado, sin comunicación, fuera de licencia o dato viejo (`isStale`) | `desconocido` |
| `fueraServicio` | `sinTension` |
| `senales['Grupo en carga']` es `true` | `energizado` |
| `senales['Grupo en carga']` es `false` | `sinTension` |
| Sin esa señal, con rpm > 300 y kW > 0,5 (los umbrales de `estadoGen`) | `energizado` |
| Sin esa señal y sin cumplir rpm > 300 y kW > 0,5 | `sinTension` |

- **Alarmas:** no cortan la energización. Un grupo con una advertencia puede seguir en carga.
- **Red y grupo en el mismo tramo:** queda energizado si cualquiera de los dos lo está. Es el comportamiento actual
  con varias fuentes.
- **Sentido del flujo:** sale de la distancia a la fuente más cercana, sin cambios.
- **Señal «Grupo en carga»:** es una señal libre del mapa. El SmartGen la trae en el coil 7. En el DSE y el ComAp se
  puede agregar en el editor de mapa si el equipo la publica.
- **Umbrales:** los de rpm y kW se exportan desde `lib/generador.ts` para no duplicarlos.

## 3. Editor

- **Paleta** (`Paleta.tsx`): en el grupo Equipos se agrega `['gen', 'Generador']`.
- **`nuevoNodo('gen')`:** `{ ref: primero(cfg.generadores), mostrar: ['kw', 'modo'] }`.
- **Propiedades** (`Propiedades.tsx`):
  - `camposDe` deja de mandar todo lo que no es `reco` a reguladores y elige la lista por tipo.
  - Se agrega el selector de equipo con la lista `generadores`.
  - Los puntos libres del generador quedan disponibles para elegir.
- **"Generar desde config":** los generadores habilitados (`enabled !== false`) van en un recuadro propio,
  "Generadores", después del de Reguladores. Los que están fuera de servicio entran igual.
- **Modo vista:** `gen` entra en `CLICABLES` (`views/Unifilar.tsx`) y abre el panel lateral.

## 4. Bloque de sitio, alarmas, panel y navegación

- **Bloque de sitio:**
  - `resumenSitio` suma `gens: { nombre, estado: estadoGen(st), kw }[]`.
  - El componente `Sitio` muestra una sección Generadores con nombre, estado y kW.
  - Muestra como máximo 2 grupos y, si hay más, "+N más", igual que recos y reguladores.
- **Barra de alarmas:** `gen` entra en `EQUIPOS` (`energizar.ts`), así que sus alarmas y su «Sin comunicación»
  aparecen en la barra, en el conteo del bloque de sitio y en el marco del símbolo. `estadoEquipo` lo trata por
  `ref`, como a `reco`.
- **Panel lateral** (`PanelEquipo.tsx`):
  - **Cabecera:** el estado con el tono de `estadoGen` y el modo.
  - **Cuerpo:** el genérico actual (medidas, señales, alarmas activas). Las alarmas con nivel 2 se marcan como
    advertencia.
  - **Enlace:** "Ver en Generadores" (`/generadores/:name`) en lugar de "Ver en Dashboard".
- **Tendencias:** `serieDe` agrega `case 'gen'` con kW, frecuencia, tensión L-L, rpm y, si existen, las medidas
  libres «Nivel de combustible» y «Tensión de batería». Usa la serie `campo_data` que ya se guarda.
- **"Ver en el unifilar":**
  - `GenCard` suma `<VerEnUnifilar>`, como `RecoCard` y `RegCard`.
  - Se muestra con el módulo unifilar y solo si el generador está dibujado (`ubicar` ya es genérico).

## Fuera de alcance

- Comandos desde el unifilar: arranque, parada y modo. Van en la pieza de comandos remotos.
- Un interruptor del grupo con estado en vivo. La señal «Grupo en carga» cumple esa función.
- El generador como origen de un `Vinculo` de fuente.

## Pruebas

- **API, `test/unifilar.test.js`:**
  - Un nodo `gen` válido con `ref`.
  - Rechazos: sin `ref`, con una clave de `mostrar` inválida y con un borne inexistente en `lados`.
  - `puntosDe('gen')`.
  - Un enlace de datos `d ↔ d` con un `comm`.
- **`lib/unifilar.test.ts`:** `puntosDe('gen')` igual que en la API.
- **`lib/energizar.test.ts`:**
  - `estadoFuenteGen`: señal sí, señal no, sin señal con carga, sin señal sin carga, sin comunicación, dato viejo y
    fuera de servicio.
  - Un dibujo con red y grupo y el sentido del flujo.
  - `resumenSitio` con generadores y `listaAlarmas` con un generador.
- **`lib/unifilarEditor.test.ts`:** `nuevoNodo('gen')` y `generarDesdeConfig` con el recuadro Generadores,
  salteando los deshabilitados.
- **`lib/tendencia.test.ts`:** la serie del generador.
- **Verificación a mano:** el modo mock con el generador de ejemplo dibujado. En carga energiza; con el mock en
  «sin comunicación», queda desconocido.
