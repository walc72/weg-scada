# Rediseño del menú de Configuración

Fecha: 2026-11-09 · Estado: diseño aprobado en chat, pendiente de revisión escrita

## Objetivo

Que Configuración (`/config`) tenga un estilo único, una forma de guardar uniforme y cada ajuste en el lugar que corresponde, partiendo el archivo `views/Config.tsx` (1853 líneas) para que se pueda mantener.

Motivo (relevamiento del 2026-11-09):
- **Estilo**: cinco maneras distintas de titular secciones (y pestañas sin título), anchos máximos y espaciados distintos por pestaña, tablas shadcn y tablas crudas mezcladas, controles nativos (`<select>`, checkbox, `<label>`) junto a los de la librería, botones de tamaños y textos distintos («Guardar» / «Guardar Cambios»).
- **Guardado**: en Equipos unas cosas se guardan al instante (interruptores, tipo de gateway), otras al salir del campo (layout del scan), otras con Guardar por fila; agregar/borrar un slot se guarda solo pero editarlo exige «Guardar slots». Supervisión tiene un único «Guardar Cambios» sin aviso de cambios pendientes. Un error 500 al guardar reemplaza toda la pantalla por «Error al cargar configuración». Para borrar se usa `confirm()` nativo.
- **Lugar**: `alarmSetpoints` se edita en Alarmas y en Zonas (potencia y frecuencia por bomba); el «medidor principal del Dashboard» está en Balance, con dos selectores de nombre casi igual; el reporte diario vive dentro de Correo; los sitios «Agriplus»/«Agrocaraya» están fijos en el código; las claves de URL no coinciden con las etiquetas y mezclan idiomas.

Se hace en **cuatro etapas**, cada una con su plan, su PR y su deploy.

## Fuera de alcance

- Cambiar qué se configura (campos nuevos de equipos, mapas de registros editables por UI).
- Permisos por rol distintos de los actuales (Configuración sigue siendo solo admin/superadmin, con los mismos gates internos).
- El editor del unifilar y las páginas fuera de `/config`.

## Etapa 1 — Partir `Config.tsx` (sin cambios visibles)

- Carpeta `frontend-react/src/views/config/`:
  - `ConfigView.tsx`: contenedor (grupos, subpestañas, banner de réplica, `fieldset disabled` en réplica, carga/errores). `views/Config.tsx` queda como reexport (o se actualiza la ruta en `App.tsx`).
  - Un archivo por subpestaña: `BombasTab`, `MedidoresTab`, `GatewaysTab` (las tres que hoy salen de `DevicesTab`, que no comparten estado real), `ZonasTab`, `AlarmasTab`, `BalanceTab`, `UsuariosTab`, `CorreoTab` (con `DailyReportCard`).
  - Se mueven a la carpeta: `FlowmetersSection`, `CampoSection`, `CommsSection`, `PumpNominalCell`, `LicenciaTab`, `BackupsTab`, `BrandingTab`, `ConexionTab`, `ReplicasTab`.
  - Helpers compartidos (constantes de mapas de registros, utilidades de nombres de medidor) en `views/config/comun.ts`.
- Sin cambios de comportamiento, textos, estilos ni claves de URL.
- **Verificación**: tests existentes; build; comparación de las clases del DOM contra master en las 17 subpestañas (preview mock, mismo origen): deben ser idénticas.

## Etapa 2 — Estilo y guardado uniformes

### Piezas compartidas (`frontend-react/src/components/config/`)
- `SeccionConfig({ titulo, ayuda?, acciones?, children })`: tarjeta `Card p-4`; título `h2 text-xs font-bold tracking-widest uppercase`; ayuda `text-xs text-muted-foreground`; acciones a la derecha del título.
- `Campo({ etiqueta, ayuda?, children })`: `Label` encima del control, ayuda `text-xs` debajo.
- `BarraGuardado({ sucio, guardando, onDescartar, onGuardar })`: aparece solo con cambios; «Cambios sin guardar · Descartar · Guardar» al pie de la sección.
- `ConfirmarDialog`: reemplaza todos los `confirm()` nativos (borrar, fuera de servicio, etc.).
- Hook `useEdicion<T>(original: T)`: `{ valor, set, sucio, descartar, guardar(fn) }`; `guardar` mantiene la edición si `fn` falla.
- Hook `useAvisoSalida(sucio: boolean)`: confirma antes de cambiar de pestaña/subpestaña o salir del portal (`beforeunload` + captura de clics en enlaces, como el editor del unifilar) mientras alguna sección tenga cambios.

### Reglas de estilo
- Todas las subpestañas arrancan con `SeccionConfig`; ninguna sin título.
- Formularios `max-w-3xl`; tablas a todo el ancho; espaciado vertical entre secciones `space-y-4`.
- Tablas: siempre el `Table` de shadcn (Alarmas, Zonas, Slots y escaneo ADAM incluidos).
- Controles: siempre `Select`, `Switch`, `Checkbox`/`Switch`, `Label`, `Input` de la librería; `EnlaceSelect` usa el `Select` de la librería.
- Botones: acciones de sección `size="sm"`, texto «Guardar»; agregar «Agregar <cosa>» `size="sm"` con icono `h-3.5`; botones de icono `size="icon"` con icono `h-4`; todos los diálogos con «Cancelar».
- Textos de ayuda: `text-xs`. Estados vacíos (etapa 4).

### Guardado por sección
- Editar no aplica nada hasta «Guardar» de esa sección. Supervisión pasa de un Guardar por pestaña a uno por sección.
- Filas editables (Bombas, Medidores): cada fila es una sección (Guardar/Descartar por fila, como hoy, con el mismo aspecto que `BarraGuardado`).
- Gateways: agregar slot, borrar slot, editar slots, tipo, enlace y layout del scan quedan pendientes hasta «Guardar» de ese gateway.
- **Acciones operativas** (habilitar/deshabilitar equipo, fuera de servicio): inmediatas, con `ConfirmarDialog`.
- **Errores al guardar**: toast con el mensaje, la edición se conserva, la pantalla sigue en pie. `store/config.ts` deja de poner `error` global ante fallas de guardado (solo ante fallas de carga).

## Etapa 3 — Reordenar

- **Alarmas** concentra todos los umbrales por bomba (temperatura, corriente, errores de comunicación, potencia, frecuencia). **Zonas** queda solo con rangos de indicadores (bombas y medidores); el texto que remite a Alarmas se va.
- **Medidor principal del Dashboard** (`primaryMeter`): se marca en Medidores (una opción «principal» por medidor, exclusiva). **Balance** queda solo con la fórmula de pérdida (un solo selector de medidor para la fórmula, con etiqueta inequívoca).
- **Reporte diario**: subpestaña propia «Reporte diario» en el grupo Usuarios y correo.
- **Sitios configurables**:
  - `config.json` suma `sitios: string[]` (weg-api valida: texto no vacío, sin duplicados, hasta 40 caracteres).
  - Si no existe, se inicializa con los sitios que ya usan los equipos (más los dos actuales si aparecen).
  - Subpestaña «Sitios» al principio de Equipos: agregar, renombrar (actualiza los equipos que lo usan) y borrar (solo si ningún equipo lo usa).
  - Todos los selectores de sitio (alta y edición) leen de esa lista; la edición inline deja de ser texto libre.
- **Claves de URL** en español y iguales a la etiqueta: `sitios, bombas, medidores, gateways, caudalimetros, reconectadores, generadores, enlaces, zonas, alarmas, balance, usuarios, correo, reporte, licencia, backups, marca, conexion, replicas`. Las claves viejas (`devices, meters, flow, campo, comms, zones, alarms, users, smtp, brand`) siguen funcionando como alias. `ir()` conserva el resto de los parámetros de la URL.

## Etapa 4 — Detalles

- Medidores se oculta si la licencia no tiene el módulo `medidores` (hoy solo se deshabilita «Agregar»). Bombas y Gateways no dependen de módulo.
- Estados vacíos en cada lista: «Todavía no hay <cosas>» + «Agregar».
- Constantes de mapa de registros repetidas (`statusOffset: 679` de ADAM, región `regs` de PM) en un solo lugar.

## Pruebas

- Etapa 1: tests existentes + build + comparación de clases DOM idéntica a master en las 17 subpestañas.
- Etapa 2: tests de `useEdicion` (sucio, descartar, guardar con falla que conserva la edición) y de `store/config` (falla de guardado no pone error global); verificación visual de las 17 subpestañas en claro y oscuro; aviso al salir con cambios.
- Etapa 3: tests de weg-api para `sitios` (validación, inicialización desde equipos, renombrar actualiza equipos, borrar en uso rechazado); tests del mapa de alias de URL; verificación visual.
- Etapa 4: verificación visual con y sin módulo `medidores`.

## Criterios de aceptación

- Todas las subpestañas comparten título, anchos, tablas, controles y botones.
- En ninguna pestaña un cambio de configuración se aplica sin «Guardar», salvo las acciones operativas confirmadas; salir con cambios pendientes pide confirmación.
- Un error al guardar no tira abajo la pantalla ni pierde lo editado.
- Cada ajuste existe en un solo lugar; los sitios se administran desde la UI.
- Los enlaces viejos a `/config?tab=…` siguen funcionando.
- Ningún archivo de `views/config/` supera ~400 líneas.
