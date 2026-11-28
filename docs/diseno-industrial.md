# Línea de diseño — estilo industrial (ISA-101)

Guía obligatoria para **toda** interfaz nueva o modificada del portal (`frontend-react/`): pantallas, paneles, diálogos, componentes. Si algo no está cubierto acá, se decide siguiendo los principios y se agrega a esta guía en el mismo PR.

## Principios

1. **Sala de control, no app de oficina.** Pantallas sobrias, legibles a distancia, sin adornos: el color se reserva para el estado del proceso (ISA-101).
2. **Una sola forma de hacer cada cosa.** Mismo componente, mismo tamaño y mismo texto para la misma función en todo el portal.
3. **El dato manda.** Números grandes en JetBrains Mono con su unidad; etiquetas chicas y atenuadas.
4. **Nunca un valor viejo.** Sin dato fresco se muestra «—» en gris (`--bar-stale`).
5. **Claro y oscuro.** Todo color sale de tokens; nada de hex sueltos en componentes.

## Tokens (fuente: `frontend-react/src/index.css`)

| Uso | Tokens | Regla |
|---|---|---|
| Superficies y texto | `--background`, `--card`, `--foreground`, `--muted-foreground`, `--border`, `--input` | Vía clases de Tailwind (`bg-card`, `text-muted-foreground`…) |
| Acción principal | `--primary` (por defecto el de la marca HECIAN LC: azul profundo #1F3A68 en claro, cian #13A3B4 con texto #121417 en oscuro; el superadmin puede cambiarlo en Marca) | Solo botones principales, foco y selección |
| Botones y foco | `--hlc-*` de `src/marca/hecian-botones.css` (copia del repo de marca, no se edita); foco `--ring` #0B7480 / #5CC6D3 | Los botones salen solo de `Button`; nunca colores de estado en un botón |
| Estados del proceso | `--hlc-estado-*` de `src/marca/hecian-estados.css` (copia del repo de marca, no se edita); `--p1`/`--p2`/`--p3`/`--st-com` apuntan a ellos; `--st-run` es neutro (sin verde); `--bar-*`, `--zona-*` | **Intocables y no personalizables.** Solo para estado/alarma, nunca decoración, botones, gráficos ni errores de la app. Naranja y amarillo nunca como color de texto (`--p2-text`/`--p3-text` son el color del texto) |
| Gráficos | `--fase-*`, `--mag-*`, `--consigna`, `--serie-*` vía `lib/paleta.ts` | Regla fase → magnitud → serie; consigna siempre punteada; nunca hex en gráficos |
| Marca del cliente | `--brand` (naranja Agriplus) | Solo el logo del cliente |
| Marca HECIAN LC | `--hlc-carbon`, `--hlc-negro-mate`, `--hlc-blanco-frio`, `--hlc-gris-medio`, `--hlc-azul-profundo`, `--hlc-burdeos`, `--hlc-cian` (`src/marca/colores.css`) | Marco del login, firma y acentos (≤ 10 % de la pantalla) |

## Tipografía

- Tipografía de la marca HECIAN LC (2026-11-26): **Inter** para texto e interfaz; **JetBrains Mono** para números, IPs, registros y valores medidos; **Barlow Condensed** para títulos (`h1`, `h2` y `h3` la toman solos; en otro elemento, clase `font-titulo`) y la barra.
- Las fuentes se sirven desde el portal (`public/fuentes/`, woff2 con su licencia OFL; `src/marca/fuentes.css`): la planta no tiene internet, nada de Google Fonts.
- **Etiquetas, títulos de sección, encabezados de tabla, pestañas y textos de botón: MAYÚSCULAS**, 11–12 px, `tracking-wider` / `tracking-widest`, peso 600 en títulos y botones.
- Título de página: 22 px, peso 700 (patrón de las páginas de detalle).
- Texto de ayuda: `text-xs text-muted-foreground`, en oración normal (no mayúsculas), terminado en punto.

## Forma

- **Esquinas: 2 px** (`rounded-sm`) en controles, tarjetas, diálogos, badges y chips; **3 px** en los botones (los da `.hlc-btn` de la marca). Nada de `rounded-md/lg/full` salvo indicadores circulares (luces, puntos de serie).
- **Bordes marcados** de 1 px (`border-input` en controles, `border-border` en tarjetas y tablas). **Sin sombras** (salvo el panel lateral y los diálogos, que flotan).
- Alturas de control: **32 px** (`h-8`) normal, 28 px compacto, 36 px grande. Botones: 32 px normal, 24 px `sm` y 44 px `lg` (táctil), los de la marca.

## Componentes (siempre de `components/ui/`; nunca controles nativos)

| Componente | Uso |
|---|---|
| `Button` | Botones de la marca HECIAN LC (`.hlc-btn`). `default` = primario (azul profundo / cian), **uno por sección**; `outline` y `secondary` = secundario neutro con borde gris medio; `ghost` y `link` = terciario, solo texto (con `size="icon"`, ícono neutro para acciones en filas); `destructive` = borrar: texto y borde burdeos, **nunca relleno**, y siempre con `ConfirmarDialog` (`destructiveSolid` queda por compatibilidad y se ve igual). Deshabilitado = contorno punteado y texto gris. Texto en mayúsculas, verbo primero: «GUARDAR», «AGREGAR BOMBA», «CANCELAR». Tamaños: `default` 32 px, `sm` 24 px, `lg` 44 px. Botón de ícono: `size="icon"` (32×32) con ícono `h-4` y `aria-label`. |
| `Input` | Campos de texto/número; IPs y registros con `font-mono`. |
| `Textarea` | Texto de varias líneas pegado o copiado (licencias, códigos de enlace); en mono 12 px. |
| `Select` | Toda elección de una lista (nunca `<select>` nativo). |
| `Label` | Encima del campo, mayúsculas 11 px atenuada. |
| `Switch` | Interruptor ON/OFF de dos segmentos (ON en `--st-run`). Para estados binarios de configuración. |
| `Checkbox` | Opciones múltiples o marcas en tablas (nunca `<input type="checkbox">`). 16 px; API `checked` / `onCheckedChange`. |
| `Tabs` | Navegación entre vistas hermanas; subrayado, mayúsculas 12 px. |
| `Table` | Toda tabla (nunca `<table>` crudo): encabezado mayúsculas 11 px atenuado, filas de 32 px. |
| `Dialog` | Formularios de alta/edición. Pie: «CANCELAR» (`outline`) + acción (`default`). |
| `ConfirmarDialog` | Toda confirmación (borrar, fuera de servicio…); nunca `confirm()` del navegador (única excepción: `useAvisoSalida`, salida de página con cambios sin guardar; un diálogo propio no puede frenar `beforeunload` ni la navegación). Props: `open`, `titulo`, `mensaje`, `textoConfirmar`, `peligro` (botón destructivo burdeos en contorno), `onConfirmar`, `onCancelar`. |
| `Badge` / `Chip` | Rótulos; `Chip` (`CampoBase`) para estados: texto neutro + símbolo unificado (tono `p1`/`p2`/`p3` = alta/media/baja, `com` = sin comunicación, `fds` = fuera de servicio; `run`/`off`/`info` sin símbolo). |
| `SimboloEstado` / `Estado` | `components/SimboloEstado`: símbolos unificados de la marca. Alta = cuadrado «1» rojo, media = triángulo «2» naranja, baja = rombo «3» amarillo, dato no válido (sin comunicación, dato viejo, N/D) = círculo «?» violeta, suprimida y fuera de servicio en gris. Variantes: sin reconocer (relleno, fila en negrita con `.hlc-alarma--sin-reconocer`), reconocida (contorno), normalizada (contorno punteado). Tamaños: 12 px en tablas densas (`tamano="chico"`), 16 px en listas y la franja, 20 px en fichas. **Lo normal no se pinta**: en marcha, en línea, listo y parado van sin símbolo ni color. La prioridad de cada tipo de evento sale de `lib/prioridadAlarma.ts`. |
| `Card` | Contenedor de sección: borde, esquinas 2 px, sin sombra. |
| `FirmaHecian` / `FirmaPie` / `FirmaIngreso` | `components/FirmaHecian`: firma HECIAN LC con los SVG en curvas de `src/marca/` (nunca el nombre escrito con una fuente). `FirmaPie` en el pie de todas las pantallas, `FirmaIngreso` debajo del formulario del login (≥ 140 px). |
| `AcercaDe` | Diálogo «Acerca de» (botón (i) del encabezado): producto, versión y fecha de compilación, firma, derechos, «Powered by» del cliente y aviso de código abierto. |
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
- **Gadgets / modo edición**: el Dashboard se personaliza con «PERSONALIZAR» (`Button` `outline`, `sm`). La grilla es de 12 columnas con anchos S/M/L/XL = 4/6/8/12 (todo a 12 bajo `md`). Cada gadget suma una barra de edición (`components/dashboard/EdicionGadget`): asa `GripVertical` para arrastrar con `@dnd-kit` (también por teclado), ▲▼, `Select` de ancho, ⚙ opciones (`Dialog`) y ✕ quitar; el contenido queda inerte (`pointer-events-none`). «AGREGAR GADGET» abre el catálogo. Guardado con `BarraGuardado` + `useEdicion`; «RESTABLECER» y «GUARDAR COMO PREDETERMINADO» piden `ConfirmarDialog`. Un error boundary por gadget (`GadgetMarco`).
- **Gauge de arco** (`components/ArcGauge`): para el gadget GAUGES. Arco de 240° con las mismas zonas y colores que la barra (`barra()` de `HalfGauge`): valor oscuro en zona normal, ámbar o rojo solo fuera de zona, gris si el dato es viejo y «—» sin comunicación. En pantallas de equipo se sigue usando la barra.

## Marca HECIAN LC (plantillas/ESTANDAR.md del repo de marca)

- **Firma en cuatro lugares:** pie de todas las pantallas («Powered by» del cliente · «Desarrollado por HECIAN LC» con el isotipo de 16 px · versión), login (firma debajo del formulario), «Acerca de» y favicon / íconos de la PWA (isotipo cuadrado; el apple-touch con fondo carbón).
- El logo y el «Powered by» del cliente o del distribuidor (Agriplus, Tecno Electric) se mantienen; la firma va al lado.
- Los archivos de `src/marca/` son copias del repo de marca: no se editan acá, se vuelven a copiar si la marca cambia.

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
