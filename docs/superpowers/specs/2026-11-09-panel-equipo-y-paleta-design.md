# Panel de equipo del unifilar y paleta de colores de gráficos

Fecha: 2026-11-09 · Estado: diseño aprobado en chat, pendiente de revisión escrita

## Objetivo

1. El panel lateral que se abre al tocar un equipo en el unifilar (`components/unifilar/PanelEquipo.tsx`) pasa a ser un **vistazo rápido con el mismo estilo para todos los tipos de equipo**. El detalle completo queda en las páginas existentes (`/motor/:name`, `/medidor/:name`, `/campo/:name`, `/generadores/:name`).
2. Los gráficos usan **una paleta única y semántica** (fases, magnitudes, consigna, series genéricas), **editable por el superadmin** en Configuración → Marca y aplicada a todos los usuarios.

Motivo: hoy el panel mezcla tarjetas completas del dashboard (bomba, medidor) con listas sueltas, con tres estilos de títulos y tamaños de valores; el banco de reguladores muestra demasiado. En los gráficos conviven tres paletas (`SERIE_COLORES`, `FASOR_COLORES`, `PHASE_COLORS`) y colores escritos a mano: la fase A es celeste en un lado y roja en otro, la tensión es violeta en Históricos y color de fase en la forma de onda.

## Fuera de alcance

- Rediseño de las páginas de detalle (solo cambian sus colores de gráficos, por la paleta).
- PDF de informes (siguen con `colorInforme`).
- Colores de líneas energizadas del unifilar (ya tienen su opción portal/ANSI por dibujo).
- Panel «Historial de guardados» del editor del unifilar.
- Colores de estado ISA-101 (`--st-*`, `--p1..3`, `--bar-*`): no son personalizables.

## 1. Panel de equipo (vistazo rápido)

### Estructura (igual para todos los tipos)

1. **Contenedor**: lateral derecho, ancho fijo (el de hoy, `max-w-md`), animación de entrada desde la derecha (CSS, respeta `prefers-reduced-motion`). Cierra con X, Esc y tocando el fondo. `role="dialog"` con nombre accesible.
2. **Encabezado**: nombre del equipo; debajo, tipo y modelo en texto chico; a la derecha un chip de estado ISA-101 (en marcha / parado / falla / sin comunicación) con los tokens actuales (`Chip` de `CampoBase`).
3. **Alarmas activas**: franja con el texto de cada alarma, color p1 o p3 según prioridad. Si no hay alarmas no se muestra nada.
4. **Valores clave**: grilla de 2 columnas, 4 a 6 valores. Formato único: etiqueta chica (texto atenuado) arriba, valor grande con unidad abajo. Valor sin dato fresco: «—» en gris (`--bar-stale`).
5. **Mini tendencia**: una variable, últimas 6 h, alto fijo, color según la paleta (sección 2). Selector para cambiar de variable entre las del equipo. Sin botones 1H/6H/24H ni fila mín/prom/máx.
6. **Acciones**: «Ver detalle» (página del equipo) y «Ver en Tendencias».

### Valores clave por tipo

| Tipo | Valores | Tendencia por defecto |
|---|---|---|
| Bomba (SSW900/CFW900) | corriente, frecuencia, potencia, temperatura, horas de marcha | corriente |
| Medidor (PM8000/PM7400) | tensión, corriente, potencia, FP | potencia |
| Caudalímetro | caudal, totalizador | caudal |
| Regulador | tensión de carga, tap, corriente, FP | tensión de carga |
| Reconectador | corriente A/B/C, estado (abierto/cerrado) | corriente |
| Generador | estado y modo, tensión, potencia, combustible (si el modelo lo tiene) | potencia |

Cuando un equipo de campo no tiene alguno de esos valores en su mapa, el casillero no se muestra (la grilla se reacomoda). Equipos de campo sin tipo reconocido: los 4 primeros valores medidos de su mapa.

### Banco de reguladores

- Se mantiene el **mímico compacto** (tres taps de un vistazo).
- En lugar de fasorial + tabla + mediciones: **una fila por regulador** con tensión de carga, tap y FP, cada fila con el color de su fase (A, B, C según el orden del regulador en el banco, igual que en el mímico).
- El diagrama fasorial y las mediciones completas quedan en la página de detalle.

### Componentes

- `PanelEquipo` queda como contenedor y arma el contenido a partir de un **resumen** del equipo.
- `lib/resumenEquipo.ts`: una función por tipo que, dado el nodo y los datos vivos, devuelve `{ titulo, subtitulo, estado, alarmas, valores: {etiqueta, valor, unidad, fresco}[], tendencias: {clave, etiqueta, magnitud, fase?}[], enlaceDetalle }`. Pura, sin JSX: se testea con datos de ejemplo.
- Piezas visuales nuevas en `components/panel/`: `PanelLateral` (contenedor), `EncabezadoEquipo`, `ValoresClave`, `MiniTendencia`, `FilasBanco`.
- Dejan de usarse en el panel: `PM8000Card`, `DriveCard`, `Fasorial`, `Mediciones` y `TendenciaEquipo` (siguen en las páginas que ya los usan; si alguno queda sin uso se borra).

## 2. Paleta de colores de gráficos

### Tokens (variables CSS en `:root`, un solo valor para tema claro y oscuro)

| Grupo | Token | Por defecto |
|---|---|---|
| Fases | `--fase-a` / `--fase-b` / `--fase-c` / `--fase-n` | #4C8BD6 / #2BA59A / #8E72D6 / #7D8B99 |
| Magnitudes | `--mag-tension` | #8E72D6 |
| | `--mag-corriente` | #4C8BD6 |
| | `--mag-potencia` | #2BA59A |
| | `--mag-fp` | #D0679B |
| | `--mag-caudal` | #5FA35F |
| | `--mag-energia` | #B5835A |
| Consigna | `--consigna` | #C9932E (siempre línea punteada) |
| Series genéricas | `--serie-1` … `--serie-8` | los 8 de `SERIE_COLORES` actuales |

Los valores por defecto evitan rojo, ámbar y amarillo de alarma (ISA-101). Viven en `index.css`.

### Regla de color de una serie

1. Serie de una fase → color de la fase.
2. Si no → color de su magnitud.
3. Si no tiene magnitud → serie genérica por orden.

Se elimina la regla de pintar con el color del texto los gráficos de una sola serie (`SERIE_NEUTRA`).

### Código

- `lib/paleta.ts`: `colorFase('A'|'B'|'C'|'N')`, `colorMagnitud(m)`, `colorSerie(i)`, `colorConsigna()` → devuelven `var(--…)`; `colorDeSerie({ fase?, magnitud?, indice })` aplica la regla; `aplicarPaleta(p)` escribe los tokens personalizados en `:root` (mismo mecanismo que `aplicarColorPortal` en `lib/color.ts`); `PALETA_DEFECTO`.
- Reemplaza `SERIE_COLORES`, `SERIE_NEUTRA`, `FASOR_COLORES`, `PHASE_COLORS` y los colores escritos a mano relevados: Históricos (series de medidor, pérdidas, en marcha), FormaOnda (armónicos, ondas, fasorial), Fasorial, Mímico, RecosTab, GensTab, RegsTab (consigna), CaudalesTab (total), Informes, MisGraficos (color por defecto de una traza nueva), CampoEquipo, MotorDetalle, LibresTrend, `lib/tendencia.ts`. Los grises de «dato viejo» (#9ca3af en DriveCard y FlowBox) pasan a `--bar-stale`.
- Las trazas de MisGraficos que ya tienen un color elegido por el usuario lo conservan.

### Persistencia y API

- `branding.json` (weg-api, `services/branding.js`) suma `paleta: { fase: {a,b,c,n}, magnitud: {tension,corriente,potencia,fp,caudal,energia}, consigna, series: [8] }`. Solo se guardan los cambiados; ausente o `null` = por defecto. Validación: cada valor `#RRGGBB` (mismo `HEX` que hoy); claves desconocidas se descartan; `series` hasta 8 elementos.
- Viaja por `GET /api/branding` (público, ya lo lee el portal al cargar) y `PUT /api/branding` (superadmin). `DELETE /api/branding` (restaurar marca) también restaura la paleta.
- En el portal, `store/branding.ts` aplica la paleta al cargar y al guardar, como `colorPortal`.

### Pantalla

Configuración → Marca, sección nueva «Colores de gráficos»:
- selectores de color agrupados (Fases, Magnitudes, Consigna, Series), con el valor por defecto como referencia;
- gráfico de muestra (3 fases + consigna) que se actualiza en vivo antes de guardar;
- botón «Restaurar colores por defecto» (solo la paleta).

## Pruebas

- `lib/paleta.ts`: regla de color, `aplicarPaleta` con valores parciales y restauración.
- `lib/resumenEquipo.ts`: un caso por tipo con datos de ejemplo (valores, faltantes, fresco/viejo, alarmas, banco).
- weg-api: validación y persistencia de `paleta` en branding (valores inválidos, parciales, DELETE).
- Visual en el preview mock: panel de cada tipo en tema claro y oscuro; Históricos, forma de onda, reconectadores y generadores con la paleta; cambio de un color en Marca reflejado en vivo; búsqueda de colores hexadecimales escritos a mano en componentes de gráficos (no debe quedar ninguno fuera de `paleta.ts`/`index.css`).

## Criterios de aceptación

- Todos los tipos de equipo abren el mismo panel, con la misma estructura y estilo; el banco de reguladores ya no muestra fasorial ni mediciones completas.
- Una misma fase o magnitud tiene el mismo color en todos los gráficos del portal.
- El superadmin cambia un color en Marca y lo ven todos los usuarios al recargar; «Restaurar» vuelve a los valores por defecto.
- Los colores de estado y alarma no cambiaron.
