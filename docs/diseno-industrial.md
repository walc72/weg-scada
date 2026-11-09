# Línea de diseño — estilo industrial (ISA-101)

Guía obligatoria para **toda** interfaz nueva o modificada del portal (`frontend-react/`): pantallas, paneles, diálogos, componentes. Si algo no está cubierto acá, se decide siguiendo los principios y se agrega a esta guía en el mismo PR.

## Principios

1. **Sala de control, no app de oficina.** Pantallas sobrias, legibles a distancia, sin adornos: el color se reserva para el estado del proceso (ISA-101).
2. **Una sola forma de hacer cada cosa.** Mismo componente, mismo tamaño y mismo texto para la misma función en todo el portal.
3. **El dato manda.** Números grandes en IBM Plex Mono con su unidad; etiquetas chicas y atenuadas.
4. **Nunca un valor viejo.** Sin dato fresco se muestra «—» en gris (`--bar-stale`).
5. **Claro y oscuro.** Todo color sale de tokens; nada de hex sueltos en componentes.

## Tokens (fuente: `frontend-react/src/index.css`)

| Uso | Tokens | Regla |
|---|---|---|
| Superficies y texto | `--background`, `--card`, `--foreground`, `--muted-foreground`, `--border`, `--input` | Vía clases de Tailwind (`bg-card`, `text-muted-foreground`…) |
| Acción principal | `--primary` (por defecto gris pizarra #2B3440; el superadmin puede cambiarlo en Marca) | Solo botones principales, foco y selección |
| Estados del proceso | `--st-run`, `--st-com`, `--p1`/`--p1-text`, `--p2`, `--p3`/`--p3-text`, `--bar-*`, `--zona-*` | **Intocables y no personalizables.** Solo para estado/alarma, nunca decoración |
| Gráficos | `--fase-*`, `--mag-*`, `--consigna`, `--serie-*` vía `lib/paleta.ts` | Regla fase → magnitud → serie; consigna siempre punteada; nunca hex en gráficos |
| Marca | `--brand` (naranja Agriplus) | Solo el logo |

## Tipografía

- **IBM Plex Sans** para texto; **IBM Plex Mono** para números, IPs, registros y valores medidos.
- **Etiquetas, títulos de sección, encabezados de tabla, pestañas y textos de botón: MAYÚSCULAS**, 11–12 px, `tracking-wider` / `tracking-widest`, peso 600 en títulos y botones.
- Título de página: 22 px, peso 700 (patrón de las páginas de detalle).
- Texto de ayuda: `text-xs text-muted-foreground`, en oración normal (no mayúsculas), terminado en punto.

## Forma

- **Esquinas: 2 px** (`rounded-sm`) en controles, tarjetas, diálogos, badges y chips. Nada de `rounded-md/lg/full` salvo indicadores circulares (luces, puntos de serie).
- **Bordes marcados** de 1 px (`border-input` en controles, `border-border` en tarjetas y tablas). **Sin sombras** (salvo el panel lateral y los diálogos, que flotan).
- Alturas de control: **32 px** (`h-8`) normal, 28 px compacto, 36 px grande.

## Componentes (siempre de `components/ui/`; nunca controles nativos)

| Componente | Uso |
|---|---|
| `Button` | `default` = acción principal (relleno `--primary`), **una por sección**; `outline` = secundaria (`secondary`: igual con fondo tenue); `destructive` = borrar (borde y texto rojos); `destructiveSolid` = relleno rojo, solo dentro de `ConfirmarDialog`; `ghost` = acciones de ícono en filas. Texto en mayúsculas, verbo primero: «GUARDAR», «AGREGAR BOMBA», «CANCELAR». Tamaños: `default` 32 px, `sm` 28 px, `lg` 36 px. Botón de ícono: `size="icon"` (32×32) con ícono `h-4` y `aria-label`. |
| `Input` | Campos de texto/número; IPs y registros con `font-mono`. |
| `Select` | Toda elección de una lista (nunca `<select>` nativo). |
| `Label` | Encima del campo, mayúsculas 11 px atenuada. |
| `Switch` | Interruptor ON/OFF de dos segmentos (ON en `--st-run`). Para estados binarios de configuración. |
| `Checkbox` | Opciones múltiples o marcas en tablas (nunca `<input type="checkbox">`). 16 px; API `checked` / `onCheckedChange`. |
| `Tabs` | Navegación entre vistas hermanas; subrayado, mayúsculas 12 px. |
| `Table` | Toda tabla (nunca `<table>` crudo): encabezado mayúsculas 11 px atenuado, filas de 32 px. |
| `Dialog` | Formularios de alta/edición. Pie: «CANCELAR» (`outline`) + acción (`default`). |
| `ConfirmarDialog` | Toda confirmación (borrar, fuera de servicio…); nunca `confirm()` del navegador (única excepción: `useAvisoSalida`, salida de página con cambios sin guardar; un diálogo propio no puede frenar `beforeunload` ni la navegación). Props: `open`, `titulo`, `mensaje`, `textoConfirmar`, `peligro` (botón `destructiveSolid`), `onConfirmar`, `onCancelar`. |
| `Badge` / `Chip` | Rótulos; `Chip` (`CampoBase`) para estados ISA-101. |
| `Card` | Contenedor de sección: borde, esquinas 2 px, sin sombra. |
| `SeccionConfig` / `Campo` / `BarraGuardado` | `components/config/`: tarjeta de sección de Configuración (título `h2` en mayúsculas, ayuda, acciones), campo con `Label` + ayuda, y barra «CAMBIOS SIN GUARDAR · DESCARTAR · GUARDAR». |
| `useEdicion` / `useAvisoSalida` | `components/config/`: copia local editable (`sucio`, `descartar`, `guardar`) y aviso al salir (cierre, enlaces internos, `confirmarSalida()` entre subpestañas) mientras haya cambios. |

Al necesitar un componente que no existe: se agrega a `components/ui/` con este estilo (y a esta tabla), no se arma a mano en la pantalla.

## Patrones de pantalla

- **Sección**: `Card p-4` con título `h2 text-xs font-bold tracking-widest uppercase`, ayuda opcional debajo y acciones a la derecha del título (Configuración: `components/config/SeccionConfig`).
- **Guardado**: botón por sección; barra «Cambios sin guardar · Descartar · Guardar» cuando hay cambios; aviso al salir con cambios pendientes. Acciones operativas (habilitar, fuera de servicio) inmediatas con `ConfirmarDialog`.
- **Panel lateral de equipo**: el del unifilar (`components/panel/`) es el patrón para cualquier detalle lateral: encabezado + chip de estado, alarmas solo si hay, 4–6 valores clave, tendencia, acciones al pie.
- **Valores clave**: etiqueta mayúsculas 11 px atenuada arriba, valor grande mono con unidad chica.
- **Errores**: toast con el mensaje y la edición se conserva; la pantalla nunca se cae por un error de guardado.
- **Vacíos**: «Todavía no hay <cosas>» + botón «AGREGAR <COSA>».
- **Anchos**: formularios `max-w-3xl`; tablas a todo el ancho; separación entre secciones `space-y-4`.

## Textos

- Español rioplatense, voz del producto (no «yo»): «Guardado», «No se pudo guardar: …».
- Botones: verbo primero, 1–3 palabras. Sin «por favor», sin signos de exclamación.
- Unidades siempre visibles junto al valor (kW, A, V, L/s, m³, °C, h).

## Checklist para cada PR con UI

- [ ] Solo componentes de `components/ui/` (o `components/config/`); ningún control nativo ni estilo armado a mano.
- [ ] Esquinas 2 px, sin sombras, mayúsculas en etiquetas/títulos/botones.
- [ ] Colores solo de tokens; estados ISA-101 sin cambios; gráficos vía `lib/paleta.ts`.
- [ ] «—» para datos no frescos; unidades visibles.
- [ ] Revisado en tema claro **y** oscuro.
- [ ] Si se agregó un patrón o componente nuevo, quedó documentado en esta guía.
