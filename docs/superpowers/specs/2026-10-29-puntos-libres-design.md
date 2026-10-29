# Mediciones y señales libres en equipos de campo — Diseño

Fecha: 2026-10-29 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-10-28-unifilar-equipos-design.md` (mapa de puntos de reconectadores y reguladores),
PR #92 (fc 1/2 `bool`, `comOk`, modelo `tapelectro` = RUA-01 por MGate 5109).
Mapa del RUA-01: `rua01-modbus-map.csv` (fuera del repo, en la carpeta del proyecto Agriplus).

## 1. Problema y objetivo

El RUA-01 (Tapelectro, tres reguladores monofásicos RG1–RG3) entrega por el MGate mucho más que lo
que el mapa de puntos sabe mostrar hoy (tap, tensión, corriente, consigna, auto, remoto, alarmas).
El usuario quiere ver en el portal **todo lo que muestra la pantalla del fabricante, salvo los
comandos**: tensión y corriente de fuente, ángulo, factor de potencia, kW, kVAr, taps memorizados,
contador de operaciones, señalizaciones (motor elevando/bajando, luz neutra, flujo inverso…),
perfil de tensiones y diagrama fasorial.

En lugar de agregar keys fijas por modelo, el mapa admite **mediciones y señales libres** con nombre
y unidad, que sirven para cualquier equipo (y para Generadores después).

### Criterios de éxito

- Un admin agrega en el editor de mapa una medición «Tensión fuente» (V) o una señal «Motor
  elevando» y, sin tocar código, aparece en la tarjeta (si es principal), en el panel de detalle,
  en Tendencias, en el reporte y en el Excel.
- El Dashboard tiene pestañas **Reguladores** y **Reconectadores** como la de Medidores; la de
  Reguladores muestra arriba un resumen con las tensiones de carga y un fasorial chico.
- Tendencias muestra el diagrama fasorial y el perfil de una medición entre equipos.
- Con el mapa por defecto de `tapelectro`, los tres reguladores del RUA-01 muestran los datos
  verificados de la pantalla del fabricante.
- Sin puntos libres en un mapa, todo se comporta como hoy (payload, Influx, reportes).

### Fuera de alcance

- Comandos (bajar/elevar, manual/automático, resets).
- Un tipo de equipo «controlador» (los datos comunes del RUA-01 van en uno de los reguladores).
- Puntos del RUA-01 sin validar: Icc (AI 34–36), corriente de neutro (AI 33), frecuencia, consigna
  VREFN/VREFI y el resto de AI 33–49; elevar/bajar como salida (objeto 10, no está en las BI).

## 2. Modelo

### 2.1 Keys nuevas del mapa (reconectadores y reguladores)

| Key | Tipo | Campos propios |
|---|---|---|
| `med` | numérica | `nombre` (1–40), `unidad` (0–10, por defecto ""), `decimales` (0–3, por defecto 0), `principal` (bool), `rol?` ∈ {`angulo`, `fp`, `kw`, `kvar`} |
| `senal` | sí/no | `nombre` (1–40), `principal` (bool) |

- Lectura como cualquier punto: `fc`, `addr`, `tipo`, `orden`, `escala` (`med`); `bit` / `valor` /
  `bool` (`senal`). Ambas pueden repetirse.
- **Sumas:** varias `med` con el **mismo `nombre`** se suman (p. ej. contador de operaciones =
  miles × 1000 + unidades). Deben compartir `unidad`, `decimales`, `principal` y `rol`; si falta
  alguna parte, el total es `null`.
- `med` y `senal` no son alarmas ni van a `valores`.

### 2.2 Slug

`slug(nombre)`: minúsculas, sin tildes (NFD + quitar diacríticos), todo lo que no sea `[a-z0-9]`
→ `_`, sin `_` repetidos ni en los extremos. Ej.: «Tensión fuente» → `tension_fuente`. La misma
implementación en poller, API y portal (con test que compara resultados).

### 2.3 Validación (API)

- `nombre` y `unidad` con los largos de §2.1; `decimales` entero 0–3; `principal` booleano;
  `rol` del conjunto.
- Dentro de un equipo, el slug de cada `med` y `senal` es único, salvo `med` repetidas (suma) con
  igual `unidad`/`decimales`/`principal`/`rol`. Una `med` y una `senal` no pueden compartir slug.
- Hasta 8 nombres distintos marcados `principal` por equipo; cada `rol` como mucho una vez.
- `med` numérica: no admite `bit`/`valor`/`bool` (igual que las keys numéricas). `senal` sí/no:
  requiere `bit`, `valor` o `bool`.
- El mapa sigue limitado a 1–64 puntos.

## 3. Poller

- `points.js`: `extrasDe(mapa, vals) → { extras: { nombre: número|null }, senales: { nombre:
  bool|null } }` (pura; suma por nombre; `null` si falta una parte).
- `pollCampo`: con el equipo en línea, el payload MQTT suma `extras` y `senales`; offline van
  vacíos `{}`. Sin puntos libres, no se agregan las claves (payload igual que hoy).
- `campoLine`: suma fields `x_<slug>` (número finito) y `s_<slug>` (`0i`/`1i`); `null` no se
  escribe. El estado del poller guarda `extras`/`senales` para escribirlos.

## 4. API

### 4.1 Modelo `tapelectro`

El mapa por defecto (RG1) suma los puntos verificados del RUA-01 (AI n = FC 3, reg 9216 + 2n,
`s16`; BI n = coil n):

| Nombre | Tipo | Punto RG1 | RG2 / RG3 | Extra |
|---|---|---|---|---|
| Tensión fuente | med V | AI 11 | 15 / 19 | principal |
| Corriente fuente | med A | AI 12 | 16 / 20 | principal |
| Desfase V–I | med ° | AI 22 | 24 / 26 | rol `angulo` (0..360, en planta ~350° = −10°) |
| Factor de potencia | med, escala 0.01, 2 decimales | AI 21 | 23 / 25 | rol `fp`, principal |
| Potencia activa | med kW | AI 27 | 29 / 31 | rol `kw`, principal |
| Potencia reactiva | med kVAr | AI 28 | 30 / 32 | rol `kvar` |
| Tap mínimo memorizado | med | AI 3 | 5 / 7 | |
| Tap máximo memorizado | med | AI 4 | 6 / 8 | |
| Operaciones | med (suma) | AI 37 ×1000 + AI 38 | 39+40 / 41+42 | principal |
| Manual | senal | BI 0 | 2 / 4 | |
| Motor elevando | senal | BI 48 | 50 / 52 | principal |
| Motor bajando | senal | BI 49 | 51 / 53 | principal |
| Luz neutra | senal | BI 27 | 28 / 29 | |
| Flujo inverso | senal | BI 14 | 15 / 22 | |

La descripción del modelo explica los corrimientos para RG2/RG3 y sugiere cargar en RG1 los datos
comunes del controlador: senal «NoBreak» (BI 6) y senal «Trifásico» (BI 23).

### 4.2 Reportes

- `campoSeries`: sin cambios (ya promedia todo lo que no es `tap`); las filas traen `x_*` y `s_*`.
- `generateSummary` (con el módulo y equipos con puntos libres): `summary.extras = [{ equipo, kind,
  nombre, unidad, decimales, tipo: 'med'|'senal', avg, min, max, delta?, pctActiva? }]`:
  - `med`: promedio/mínimo/máximo del field `x_<slug>`; si es suma, además `delta` = último −
    primero del período (`null` si falta alguno).
  - `senal`: `pctActiva` = suma/cuenta × 100 del field `s_<slug>` (enteros, sin la pérdida de
    redondeo del CSV).
  - Las mediciones a consultar salen de los mapas de la config (equipos habilitados).
- PDF (`toSummaryPDF`): tabla «Mediciones adicionales» (Equipo, Medición, Unidad, Prom., Mín., Máx.,
  Δ / % activa) después de Reguladores. Excel (`reportToXLSX`): hoja «Mediciones adicionales».
- El cuerpo del mail del reporte diario no cambia.

## 5. Portal

### 5.1 Dashboard

- Pestañas nuevas **«Reguladores (n)»** y **«Reconectadores (n)»** junto a «Bombas» y «Medidores»,
  con el módulo `unifilar` y equipos habilitados de ese tipo. Las tarjetas que hoy están debajo de
  las pestañas pasan adentro de la suya.
- Pestaña Reguladores: arriba, franja de resumen con la tensión de carga de cada regulador lado a
  lado y el **fasorial chico** (§5.4).
- Tarjetas (`RegCard`, `RecoCard`): debajo de lo actual, grilla con las `med` principales
  («nombre: valor unidad», `decimales`) y luces con las `senal` principales (verde activa, gris
  inactiva). `null` → «—».

### 5.2 Panel de detalle

Clic en una tarjeta → panel lateral con todas las mediciones (agrupadas: Mediciones, Señales,
Alarmas activas) y enlace a Tendencias.

### 5.3 Tendencias (pestañas Reguladores y Reconectadores)

- Selector **«Otras mediciones»** con las `med` del equipo (varias a la vez): mismas unidades en un
  gráfico, distintas en gráficos separados. Las `senal` elegidas se ven como franjas de estado.
- **Perfil entre equipos:** elegir una medición (por nombre) y graficarla para todos los equipos
  del tipo que la tengan (p. ej. «Tensión carga» o «Tensión fuente» de RG1–RG3).
- **Diagrama fasorial** grande (§5.4).

### 5.4 Diagrama fasorial

Componente SVG propio (sin librería). La med con `rol: angulo` es el **desfase V–I** del equipo (el
RUA-01 no entrega la posición de la fase). Cada equipo con esa med ocupa una fase según su orden:
1.º 0°, 2.º −120°, 3.º 120° (línea punteada), y su vector se dibuja en fase + desfase, con el último
valor en vivo y el color del equipo. Debajo, tabla por equipo con desfase (normalizado a −180..180°),
FP, kW y kVAr (si tienen esos roles). 0° a la derecha, sentido antihorario.
(Ajustado el 2026-10-29 con datos reales: los tres reguladores daban ~350° y se superponían.)

### 5.5 Editor de mapa (Configuración)

Para `med` y `senal`, la tabla suma columnas Nombre, Unidad, Decimales, Principal y Rol (las que
aplican) y conserva «En vivo» (valor de `extras`/`senales`). Aviso al renombrar una medición: el
histórico sigue con el nombre anterior.

## 6. Réplica

Sin cambios: la config se replica y `campo_data` ya está en la exportación.

## 7. Pruebas

- **Poller:** `extrasDe` (sumas, `null` parcial, sin puntos libres → claves ausentes en el
  payload); `slug` (tildes, espacios, símbolos); `campoLine` con `x_`/`s_`.
- **slug igual en los tres paquetes:** misma tabla de casos en poller, API y portal.
- **API:** cada regla de §2.3; modelo `tapelectro` válido; `generateSummary` con Influx simulado
  (prom/mín/máx, `delta` de sumas, `pctActiva` con suma/cuenta); sin puntos libres → sin
  `summary.extras`; Excel con la hoja nueva; PDF genera.
- **Frontend:** build.
- **Integración (docker-in-docker, imagen edge):** esclavo Modbus simulado con puntos libres;
  tarjeta, detalle, pestañas del Dashboard, Tendencias (otras mediciones, perfil, fasorial),
  resumen y Excel.

## 8. Puesta en planta

Después del release, un script (misma validación y chequeo de licencia de la API, con respaldo de
`config.json`) agrega a los mapas de «Tapelectro RG1/RG2/RG3» los puntos de §4.1 con los índices de
cada regulador, y a RG1 las señales comunes (NoBreak, Trifásico).

## 9. Release

v1.11.0 (el dibujo del unifilar, parte B, pasa a v1.12.0).
