# Configuración, etapa 1: partir `Config.tsx` — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dividir `frontend-react/src/views/Config.tsx` (1853 líneas) en una carpeta `views/config/` con un archivo por subpestaña, sin ningún cambio visible ni de comportamiento.

**Architecture:** Refactor puro por mover código: cada función de pestaña pasa tal cual a su archivo; `DevicesTab({ solo })`, que hoy arma todas las subpestañas de Equipos según `solo` (con las demás ocultas por `hidden`), se reemplaza por componentes independientes. El contenedor pasa a `views/config/ConfigView.tsx`. Se verifica comparando las clases del DOM visible contra master en las 17 subpestañas.

**Tech Stack:** React 19, TypeScript, Tailwind 4, Radix Tabs, zustand, vitest.

**Spec:** `docs/superpowers/specs/2026-11-09-configuracion-design.md` (sección «Etapa 1»).

## Global Constraints

- Sin cambios de comportamiento, textos, estilos, clases CSS ni claves de URL (`?tab=`). Mover, no reescribir: el cuerpo de cada componente se copia tal cual salvo los imports y la eliminación de la lógica de `solo`/`hidden`.
- Sin dependencias nuevas; sin tocar `store/`, `lib/` ni la API.
- Ningún archivo de `views/config/` supera ~400 líneas (si uno lo supera tras mover tal cual, se reporta; no se reescribe para achicarlo).
- `git mv` para los archivos existentes que se mueven (conserva historial).
- Chequeo al cerrar cada tarea: `tsc -b`, `eslint src` (0 errores; hay ~44 warnings preexistentes), `vitest run`, `vite build`.

## Review Focus

1. **Estado que hoy comparten las subpestañas de Equipos sin que se note** (p. ej. un diálogo o handler de Bombas que lee estado de Gateways): al separar, cada componente debe seguir funcionando con su propio estado → revisión del diff de la Tarea 3 + verificación visual de la Tarea 5 (abrir «Agregar bomba» con gateway, editar fila, panel de slots).
2. **Subpestañas condicionadas por licencia/rol/réplica** (caudales, unifilar, generadores, comunicaciones, backups, superadmin, réplica): deben aparecer y ocultarse igual que antes → la Tarea 4 conserva el arreglo `GRUPOS` idéntico; la Tarea 5 compara con licencia completa en el mock.
3. **Enlaces existentes** (`/config?tab=backups` desde la barra de estado, y cualquier `?tab=` viejo): siguen abriendo la misma subpestaña → la Tarea 4 no toca claves; la Tarea 5 abre `?tab=backups` y `?tab=gateways` directo.
4. **Modo réplica** (`fieldset disabled` y banner): sin cambios → la Tarea 4 conserva los envoltorios `equipo()`/`soloLectura()`.
5. **Imports circulares** (`CommsSection` exporta `EnlaceSelect` usado por `CampoSection`, `FlowmetersSection` y las pestañas nuevas): rutas relativas correctas tras el `git mv` → `tsc -b` y `vite build` en la Tarea 1.

---

### Task 1: Carpeta `views/config/`, archivos movidos y `comun.ts`

**Files:**
- Move (`git mv`) a `frontend-react/src/views/config/`: `FlowmetersSection.tsx`, `CampoSection.tsx`, `CommsSection.tsx`, `PumpNominalCell.tsx`, `LicenciaTab.tsx`, `BackupsTab.tsx`, `BrandingTab.tsx`, `ConexionTab.tsx`, `ReplicasTab.tsx`
- Create: `frontend-react/src/views/config/comun.ts`
- Modify: `frontend-react/src/views/Config.tsx` (imports), y los imports relativos dentro de los archivos movidos (`../store/…` → `../../store/…`, etc.)

**Interfaces:**
- Produces: `views/config/comun.ts` exporta `API_BASE`, `MODE` (las dos constantes de `Config.tsx:34-35`) y `gaugeListFor(type: DriveType)` (`Config.tsx:37-44`), movidos tal cual. Las tareas siguientes los importan desde ahí.

- [ ] **Step 1:** `git mv` de los 9 archivos; actualizar sus imports relativos y los de `Config.tsx` (que sigue en `views/`).
- [ ] **Step 2:** Crear `comun.ts` con las tres piezas y que `Config.tsx` las importe (borrarlas de `Config.tsx`).
- [ ] **Step 3:** Buscar otros importadores de los archivos movidos en todo `src` (`grep -rn "/BrandingTab'\|/CommsSection'…"`) y actualizarlos.
- [ ] **Step 4:** Chequeo completo verde.
- [ ] **Step 5:** Commit `refactor(frontend): carpeta views/config con las pestañas que ya eran archivos propios`.

### Task 2: Pestañas de Supervisión y de Usuarios y correo

**Files:**
- Create en `frontend-react/src/views/config/`: `ZonasTab.tsx` (función `ZonesTab` + `METER_GAUGE_LABELS`), `AlarmasTab.tsx` (`AlarmsTab` + `ALARM_FIELDS`), `BalanceTab.tsx` (`LossTab`), `UsuariosTab.tsx` (`UsersTab` + `UserInfo`, `UserForm`, `ROLE_HELP`), `CorreoTab.tsx` (`SmtpTab` + `DailyReportCard` + `SmtpCfg`, `DailyReportCfg`)
- Modify: `frontend-react/src/views/Config.tsx` (borrar esos bloques e importar los nuevos)

**Interfaces:**
- Consumes: `comun.ts` (Tarea 1).
- Produces: `export default function ZonasTab()`, `AlarmasTab()`, `BalanceTab()`, `UsuariosTab()`, `CorreoTab()` — cada uno con el cuerpo exacto de `ZonesTab`, `AlarmsTab`, `LossTab`, `UsersTab`, `SmtpTab` (y `CorreoTab` renderiza lo mismo que hoy `SmtpTab`, que ya incluye `DailyReportCard`). Nombres de funciones internas pueden quedar como están; solo cambia el nombre exportado.

- [ ] **Step 1:** Mover cada bloque a su archivo con los imports que necesita (solo los usados).
- [ ] **Step 2:** En `Config.tsx`, reemplazar `<ZonesTab />` por `<ZonasTab />`, etc., dentro del mismo arreglo `GRUPOS` (mismas claves y etiquetas).
- [ ] **Step 3:** Chequeo completo verde; `eslint` sin imports sin uso nuevos.
- [ ] **Step 4:** Commit `refactor(frontend): pestañas de Supervisión y Usuarios en archivos propios`.

### Task 3: Separar `DevicesTab` en pestañas independientes

**Files:**
- Create en `frontend-react/src/views/config/`: `BombasTab.tsx` (bloque de bombas, hoy `Config.tsx:~671-932`), `MedidoresTab.tsx` (bloque de medidores, `~934-1018`, con el tipo `MeterRow`), `GatewaysTab.tsx` (bloque de gateways, `~442-669`)
- Modify: `frontend-react/src/views/Config.tsx` (borrar `DevicesTab`)

**Interfaces:**
- Consumes: `comun.ts`; `FlowmetersSection`, `PumpCaudalCell`, `PumpNominalCell`, `CampoSection`, `FueraServicioBtn`, `CommsSection`, `EnlaceSelect` (archivos de la Tarea 1).
- Produces: `export default function BombasTab()`, `MedidoresTab()`, `GatewaysTab()`; y la forma de renderizar Caudalímetros, Reconectadores y reguladores, Generadores y Enlaces que hoy hace `DevicesTab` para `solo === 'flow' | 'campo' | 'generadores' | 'comms'` (mirar cómo lo hace y reproducirlo: si es solo `<FlowmetersSection … />` etc., el contenedor de la Tarea 4 los renderiza directo; si lleva props o wrappers, crear `CaudalimetrosTab`, `CampoTab`, `GeneradoresTab`, `EnlacesTab` mínimos en la carpeta).
- Cada componente se queda con **su** estado (`useState`) y **sus** handlers de `DevicesTab`. Estado o funciones que usen dos o más bloques (verificar uno por uno: p. ej. `store`, listas de sitios, cálculo de gateways para el alta de bombas) se duplican si son triviales (una línea) o se mueven a `comun.ts` si no.
- El wrapper de cada bloque (la barra colapsable `border rounded-md` con su `openX`) queda igual; desaparecen solo la prop `solo` y las clases `hidden` que ocultaban los otros bloques.

- [ ] **Step 1:** Leer `DevicesTab` completo y anotar en el reporte qué estado/handler usa cada bloque y cuáles son compartidos (Review Focus 1).
- [ ] **Step 2:** Crear los tres archivos (y los mínimos de flow/campo/gen/comms si hacen falta) moviendo el JSX y la lógica tal cual.
- [ ] **Step 3:** Borrar `DevicesTab` de `Config.tsx`; el arreglo `GRUPOS` usa los componentes nuevos manteniendo `equipo(...)` como envoltorio de réplica (pasa a recibir un elemento: `equipo(<BombasTab />)`).
- [ ] **Step 4:** Chequeo completo verde.
- [ ] **Step 5:** Commit `refactor(frontend): Bombas, Medidores y Gateways como pestañas independientes`.

### Task 4: Contenedor `ConfigView` y límite de tamaño

**Files:**
- Create: `frontend-react/src/views/config/ConfigView.tsx` (todo lo que queda de `Config.tsx`: el componente `Config` y el arreglo `GRUPOS`, banner de réplica, carga/errores)
- Delete: `frontend-react/src/views/Config.tsx`
- Modify: `frontend-react/src/App.tsx:64` → `lazy(() => import('./views/config/ConfigView'))`

**Interfaces:**
- Produces: `export default function ConfigView()` con el cuerpo exacto de `Config()`.

- [ ] **Step 1:** Mover y actualizar la ruta lazy de `App.tsx`.
- [ ] **Step 2:** `wc -l frontend-react/src/views/config/*.tsx frontend-react/src/views/config/*.ts` y pegar el resultado en el reporte; señalar cualquier archivo > 400 líneas (sin reescribirlo).
- [ ] **Step 3:** `grep -rn "views/Config'" frontend-react/src` sin resultados; chequeo completo verde.
- [ ] **Step 4:** Commit `refactor(frontend): ConfigView en views/config`.

### Task 5: Verificación (controlador)

**Files:** ninguno (correcciones, si surgen, en su archivo y tarea).

- [ ] **Step 1:** Build en modo mock de master (`origin/master`) y de la rama, servidos en el mismo puerto uno después del otro (patch temporal de `store/auth.ts` a superadmin; nginx con la CSP del repo).
- [ ] **Step 2:** Por cada una de las 17 subpestañas (`?tab=` de `GRUPOS`), juntar las clases de todos los elementos **visibles** (descartando los que tienen un ancestro con clase `hidden` o `display:none`), normalizadas (clases ordenadas), en master y en la rama. Resultado esperado: idénticas en las 17.
- [ ] **Step 3:** A mano en la rama: «Agregar bomba» con gateway (lista de slots), editar una fila de bomba y de medidor, abrir el panel de slots de un gateway, abrir `?tab=backups` y `?tab=gateways` directo.
- [ ] **Step 4:** Suite completa verde; registrar el resultado.
