# Dashboard personalizable con gadgets — diseño

Fecha: 2026-11-09 · Estado: aprobado en conversación, pendiente revisión de la spec escrita

## Objetivo

Que cada usuario arme su Dashboard (`frontend-react/src/views/Dashboard.tsx`) a partir de gadgets: elegir cuáles ve, en qué orden y de qué ancho. El admin define el layout predeterminado que ve quien no personalizó nada. Hoy el Dashboard es fijo: banner de alarma, fila de KPIs, mímico de bombas por sitio y medidor principal.

Éxito:
- Un operador reordena, agrega, quita y cambia el ancho de gadgets, guarda, y lo encuentra igual al entrar desde otra PC.
- Quien nunca personalizó ve el predeterminado del admin (o, si no hay, el Dashboard actual sin cambios visibles).
- Funciona con mouse, táctil y teclado; respeta la línea de diseño ISA-101 (`docs/diseno-industrial.md`).

## Decisiones (tomadas con el usuario)

| Tema | Decisión |
|---|---|
| Alcance | Por usuario, con un predeterminado de planta que define el admin |
| Guardado | Servidor (API nueva `/api/prefs`, archivo `/config/prefs.json`) |
| Orden | Arrastrar (`@dnd-kit`) **y** botones ▲▼ |
| Gadgets v1 | Alarmas, Indicadores, Bombas por sitio, Medidor, Generadores, Tendencia, Mis gráficos |
| Mis gráficos | Pasa de `localStorage` al servidor (misma API), con migración automática |

Descartados: un layout único para todos; `config.json` (se sincroniza a la réplica y es de planta, no de usuario); guardar dentro de `settings.json` (archivo de credenciales, solo-admin); `react-grid-layout` (posición libre en 2D: pesado, poco sobrio y malo en celular).

## Modelo

```ts
type Ancho = 4 | 6 | 8 | 12            // columnas de una grilla de 12 (S, M, L, XL)
type ItemGadget = { id: string; tipo: TipoGadget; ancho: Ancho; opciones?: Record<string, unknown> }
type Layout = { v: 1; items: ItemGadget[] }
type TipoGadget = 'alarmas' | 'kpis' | 'bombas' | 'medidor' | 'generadores' | 'tendencia' | 'misGrafico'
```

- **Visible = está en `items`.** Ocultar es quitar; se vuelve a agregar desde el catálogo.
- `id` único por instancia (los gadgets múltiples pueden repetirse con distintas opciones).
- El alto lo da el contenido; no se guarda.

### Catálogo (`frontend-react/src/lib/gadgets.ts`)

Una entrada por tipo: `titulo`, `anchos` permitidos, `anchoDefecto`, `modulo?` (licencia requerida), `multiple`, y `sanear(opciones)` que devuelve opciones válidas con valores por defecto. El render y el editor de opciones viven en `components/dashboard/` (un archivo por gadget).

| Tipo | Título | Anchos | Módulo | Múltiple | Opciones |
|---|---|---|---|---|---|
| `alarmas` | ALARMAS ACTIVAS | 12 | — | no | — |
| `kpis` | INDICADORES | 6, 8, 12 | — | no | `ocultos: string[]` (indicadores a no mostrar: motores, potencia, caudal, energía, kWh/L, frecuencia, pérdida) |
| `bombas` | BOMBAS POR SITIO | 6, 8, 12 | — | no | `sitios: string[] \| null` (null = todos) |
| `medidor` | MEDIDOR | 4, 6, 8 | medidores | sí | `medidor: string \| null` (null = principal de config) |
| `generadores` | GENERADORES | 4, 6, 8, 12 | generadores | no | — |
| `tendencia` | TENDENCIA | 6, 8, 12 | — | sí | `magnitud: 'potencia' \| 'caudal'`, `ventanaH: 1 \| 6 \| 24` |
| `misGrafico` | (título del gráfico) | 6, 8, 12 | — | sí | `grafico: string` (id en Mis gráficos del usuario) |

`caudal` en la tendencia solo se ofrece con el módulo Caudales; sin él el gadget muestra «—» con la aclaración (igual que el KPI actual).

### Layout efectivo

`layoutUsuario ?? defectoServidor ?? DEFECTO_CODIGO`, pasado siempre por `sanearLayout()`:
- descarta ítems de tipo desconocido, sin licencia, o duplicados de un tipo no múltiple;
- corrige `ancho` no permitido al `anchoDefecto` del tipo;
- sanea opciones con el catálogo; ids repetidos se regeneran.

`DEFECTO_CODIGO` reproduce el Dashboard actual: `alarmas` 12, `kpis` 12, `bombas` 8, `medidor` 4.

## Interfaz

### Vista normal

Grilla CSS de 12 columnas (`grid-cols-12 gap-4`); cada gadget ocupa `col-span-{ancho}`. Bajo `md` todos ocupan 12. Cada gadget es una `Card` con título de sección (patrón «Sección»), salvo `alarmas` y `kpis`, que conservan su aspecto actual sin título. `alarmas` sin alarmas no ocupa lugar (como hoy).

Botón «PERSONALIZAR» (`outline`, `size="sm"`) a la derecha, encima de la grilla.

### Modo edición

- Cada gadget muestra una barra superior: asa de arrastre (`GripVertical`), título, ▲ / ▼ (`ghost`, `size="icon"`, con `aria-label`), `Select` de ancho (S/M/L/XL, solo los permitidos), ⚙ opciones (abre `Dialog`, solo si el tipo tiene opciones) y ✕ quitar.
- El contenido del gadget se sigue viendo (vivo) pero sin interacción (`pointer-events-none`), para que el arrastre no choque con controles internos. `alarmas` sin alarmas muestra un marcador «Sin alarmas activas.» para poder moverlo.
- Arrastre con `@dnd-kit/core` + `@dnd-kit/sortable` (`rectSortingStrategy`), sensores de puntero (con distancia mínima), táctil y teclado.
- «AGREGAR GADGET» abre un `Dialog` con el catálogo (los no múltiples ya presentes aparecen deshabilitados; los sin licencia no aparecen). Lo agregado va al final con su ancho por defecto.
- `BarraGuardado` («CAMBIOS SIN GUARDAR · DESCARTAR · GUARDAR») con `useEdicion`; `useAvisoSalida` mientras haya cambios.
- «RESTABLECER» → `ConfirmarDialog` → borra el layout propio y vuelve al predeterminado.
- Solo admin: «GUARDAR COMO PREDETERMINADO» → `ConfirmarDialog` («Lo verán los usuarios que no personalizaron su Dashboard.») y «QUITAR PREDETERMINADO» si existe uno.
- «LISTO» sale del modo edición (si hay cambios, pide guardar o descartar vía la barra).

### Medidor

El `<select>` nativo actual se reemplaza por `Select` de `components/ui`. El selector rápido en la tarjeta sigue existiendo y **no se guarda** (como hoy); el medidor guardado es la opción `medidor` del gadget.

### Generadores

Grilla de `GenCard` tal cual la usa la pestaña Generadores (los mismos datos de `useDrivesStore().campo`); clic abre el detalle (`/generadores/:name`, como en la pestaña Generadores de Equipos). Sin generadores configurados: «Todavía no hay generadores.»

### Tendencia y Mis gráficos

Usan `TrendChart` con los datos de InfluxDB que ya consulta Históricos para la ventana elegida (refresco cada 60 s); sin InfluxDB, el buffer en memoria del store, igual que Mis gráficos. Colores vía `lib/paleta.ts`. Para reutilizar, la parte de Mis gráficos que arma un gráfico a partir de `Grafico` + datos se extrae a un componente compartido (`components/GraficoUsuario.tsx`). Si el gráfico referenciado ya no existe: «Este gráfico ya no existe.» con botón «QUITAR» (solo en edición).

## Persistencia

### Backend (`nodered/weg-api`)

`src/services/prefs.js` — archivo `prefs.json` junto a `config.json`, escritura atómica (tmp + rename, igual que `services/settings.js`):

```json
{ "usuarios": { "juan": { "dashboard": { "v": 1, "items": [] }, "misGraficos": [] } },
  "defecto": { "dashboard": { "v": 1, "items": [] } } }
```

- Clave de usuario: nombre en minúsculas.
- Claves permitidas: `dashboard`, `misGraficos` (lista blanca).
- Validación estructural: cuerpo ≤ 64 KB; `dashboard`: `v === 1`, ≤ 30 ítems, cada uno con `id` y `tipo` string (≤ 40 caracteres), `ancho` ∈ {4, 6, 8, 12}, `opciones` objeto opcional; `misGraficos`: array ≤ 50 gráficos, ≤ 12 trazas cada uno, campos string acotados. El saneo semántico (tipos conocidos, licencia) es del frontend.

`src/routes/prefs.js`, montado en `/api/prefs` después de `requireAuth` (cualquier rol; la réplica no lo bloquea porque usuarios y prefs son locales):

| Método y ruta | Quién | Efecto |
|---|---|---|
| `GET /api/prefs` | logueado | `{ dashboard, misGraficos, defecto: { dashboard } }` del usuario de la sesión (null si no hay) |
| `PUT /api/prefs/:clave` | logueado | guarda la clave propia; 400 si clave o forma inválida |
| `DELETE /api/prefs/:clave` | logueado | borra la clave propia |
| `PUT /api/prefs/defecto/dashboard` | admin | guarda el predeterminado |
| `DELETE /api/prefs/defecto/dashboard` | admin | quita el predeterminado |

Siempre se opera sobre `req.auth.user`; no hay forma de leer ni escribir prefs de otro usuario. En `routes/settings.js`: al renombrar un usuario se mueve su entrada (`prefs.renombrar`), al borrarlo se elimina (`prefs.borrar`).

`prefs.json` entra en el backup del módulo (que empaqueta todo `/config`).

### Frontend

`src/store/prefs.ts` (zustand): `cargar()` al iniciar sesión (y al restaurar sesión), `guardar(clave, valor)`, `borrar(clave)`, `guardarDefecto(layout)`, `borrarDefecto()`. Estado: `{ listo, dashboard, misGraficos, defecto }`.

**Migración de Mis gráficos:** tras `cargar()`, si `misGraficos` del servidor es `null` y `localStorage['weg_mis_graficos:<user>']` tiene gráficos, se suben con `PUT`. Lo local no se borra (respaldo). `MisGraficos.tsx` pasa a leer/escribir del store; cada cambio se guarda en el servidor (con el mismo debounce/efecto que hoy usa para `localStorage`).

## Errores

- Guardado rechazado: toast «No se pudo guardar: …»; la edición se conserva (patrón de Configuración).
- Carga fallida: se usa `DEFECTO_CODIGO` (y Mis gráficos lee `localStorage` como respaldo, sin guardar) y se muestra un toast; «PERSONALIZAR» queda deshabilitado hasta recargar.
- Gadget que falla al renderizar: un error boundary por gadget muestra «No se pudo mostrar este gadget.» sin tirar el Dashboard.
- Datos no frescos: «—» en gris, como hoy.

## Pruebas

- Backend (`nodered/weg-api/test/prefs.test.js`): leer/guardar/borrar propio; un operador no puede tocar el predeterminado (403); validaciones (clave fuera de lista, tamaño, ancho inválido); renombrar y borrar usuario mueven/eliminan prefs; archivo corrupto o ausente → vacío.
- Frontend (vitest): `sanearLayout` (tipos desconocidos, sin licencia, duplicados, anchos, ids repetidos), precedencia del layout efectivo, mover arriba/abajo, migración de Mis gráficos.
- Manual: claro y oscuro; arrastre con mouse, táctil (modo móvil) y teclado; operador y admin.

## Fuera de alcance (v1)

- Alto configurable o redimensionar arrastrando.
- Varios dashboards por usuario o compartir layouts entre usuarios.
- Que el admin edite el layout de otro usuario.
- Sincronizar prefs de planta a la réplica.

## Documentación

`docs/diseno-industrial.md`: patrón «Gadget / modo edición» (barra de edición, anchos S/M/L/XL, arrastre + ▲▼) en «Patrones de pantalla».
