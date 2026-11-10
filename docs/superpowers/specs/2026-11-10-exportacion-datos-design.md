# Mejoras en la exportación de datos — diseño

Fecha: 2026-11-10 · Estado: aprobado en charla, pendiente de revisión escrita

## Objetivo

Que el operador pueda sacar a Excel lo que ve y lo que está guardado, sin pelear con el formato:

1. Exportar desde cualquier gráfico de tendencia (Históricos, Mis gráficos, Caudales, tendencias de equipo).
2. Exportar datos de **todos los tipos de equipo**, no solo de bombas: medidores, caudalímetros y campo (reconectadores y reguladores).
3. Elegir la resolución del detalle: 1 min, 15 min, 1 h o 1 día.
4. Que los CSV abran bien en un Excel en español.

**Criterio de éxito**: un CSV bajado de cualquier lugar abre con doble clic en Excel (es-PY/es-AR) con columnas separadas, números como números y acentos bien. Un mes de detalle a 1 h baja en segundos.

## Situación actual

| Dónde | Qué exporta | Problema |
|---|---|---|
| `POST /api/reports/csv\|xlsx\|pdf` (Reportes → Exportar datos) | `drive_data` a 1 min fijo | Solo bombas. Resolución fija. CSV con `,` y sin BOM. En live la sección "PM8000" no hace nada. |
| Alarmas | CSV armado en el navegador | Separador `,` |
| Históricos, Mis gráficos, tendencias | — | Sin exportación |
| Reporte diario, Informes | PDF y XLSX | **Fuera de alcance** (Informes lo revisa otra sesión) |

## Diseño

### 1. Backend: detalle multi-equipo (`services/reports.js`, `routes/reports.js`)

El detalle sale de `generateSeries`, la misma fuente que los gráficos históricos. Ya consulta `drive_data`, `meter_data`, caudal válido (`flowSeries`) y `campo_data`. También respeta los módulos de licencia y el bucket de archivo.

- `generateSeries` acepta `windowSec` hasta **86400** (hoy el tope es 3600). Con `windowSec >= 86400`, el `aggregateWindow` usa `offset` igual al desfase de la TZ del contenedor, para que el día vaya de medianoche a medianoche local. `ponytail:` el offset es fijo para todo el rango. Si la TZ vuelve a tener horario de verano, usar `timezone.location`.
- `queryMeasurement`, `flowSeries` y `campoSeries` reciben ese offset (por defecto `0s`).
- Nueva función pura **`tablasDetalle(series, { tipos, devices, fields })`**. Devuelve `[{ tipo, nombre, headers, rows }]` en este orden fijo: bombas, medidores, caudal, campo.
  - **Bombas** (`series.drives`): `Fecha/Hora`, `Bomba`, `Sitio` y los campos de `fields` (todos si viene vacío), con los encabezados de `HEADER_MAP`. Se filtra por `devices` si viene.
  - **Medidores** (`series.meters`): `Fecha/Hora`, `Medidor`, `Corriente (A)`, `Voltaje (V)`, `Potencia (kW)`, `FP`.
  - **Caudal** (`series.flows`): `Fecha/Hora`, `Caudalímetro`, `Caudal (L/s)`. El dato viene en m³/h y se convierte con `aLps`.
  - **Campo** (`series.campo`): `Fecha/Hora`, `Equipo`, `Tipo` y una columna por cada campo presente. Los conocidos (`ia`, `ib`, `ic`, `v`, `tap`) llevan encabezado con unidad; el resto va con su nombre crudo.
  - Un tipo sin filas o sin licencia (cuando `series.flows` o `series.campo` vienen `undefined`) no genera tabla.
  - `_time` queda como `Date`. Cada formato lo serializa a su manera.
- Cuerpo de `POST /api/reports/{csv,xlsx,pdf}`: `{ from, to, tipos?, resolucion?, devices?, fields?, summary?, title?, bucket? }`.
  - `tipos` es un subconjunto de `['bombas','medidores','caudal','campo']`. Si falta o queda vacío después de validar, vale `['bombas']`, igual que hoy.
  - `resolucion` es uno de `60 | 900 | 3600 | 86400`. Cualquier otro valor pasa a 60.
  - `generateReport` queda solo para `POST /api/reports/generate` (API JSON pública, no se toca). `toCSV` y el `toPDF` de filas crudas se reemplazan.
  - `generateSeries` suma `motor_temp` a los campos de `drive_data`, que el detalle viejo tenía y la serie no.
  - Con resolución de 1 día la fila lleva la fecha de **inicio** del día (`timeSrc: "_start"`). En el resto se mantiene el fin de ventana, como en los gráficos.
- **XLSX**: una hoja por tabla (`Bombas`, `Medidores`, `Caudal`, `Campo`), más las hojas de resumen como hoy si `summary`.
- **CSV**: con una sola tabla, `text/csv` → `weg-<tipo>_<desde>_<hasta>.csv`. Con varias, `application/zip` → `weg-datos_<desde>_<hasta>.zip`, con un CSV por tabla.
- **PDF**: una sección por tabla, con título del tipo y la misma tabla con branding que hoy. Sigue el corte de filas actual de `toPDF`.
- Sin datos en ninguna tabla: 404 `{ error: 'Sin datos en el rango seleccionado' }`, en lugar del archivo vacío actual.

#### Helpers comunes

- **`zip(files)`** (`{ nombre: Buffer|string }` → `Buffer`): el armador ZIP con deflate que hoy vive dentro de `toXLSX`, extraído sin cambios. Lo usan `toXLSX` y la descarga CSV múltiple.
- **`aCSV(headers, rows)`** → `string`. Así es el CSV "para Excel en español":
  - BOM UTF-8 (`﻿`), separador `;`, fin de línea `\r\n`.
  - Números con coma decimal y sin separador de miles. `12.5` sale `12,5`.
  - `Date` como `dd/mm/aaaa hh:mm` en hora local.
  - `null` o `undefined` salen como celda vacía. El `0` se conserva.
  - Los textos con `;`, `"` o salto de línea van entre comillas, con `""` para escapar las comillas.

### 2. Frontend: helper CSV compartido (`frontend-react/src/lib/csv.ts`)

`aCSV(headers, rows)` con las mismas reglas que el backend, más `descargarCSV(nombre, headers, rows)`. Lo usan:
- Alarmas, en reemplazo de su `csvField` y `downloadCSV` locales.
- La exportación de los gráficos (punto 4).
- El modo mock de Exportar datos.

### 3. Frontend: Reportes → Exportar datos (`views/Reportes.tsx`)

- **Equipos**: casillas Bombas, Medidores, Caudalímetros y Campo. Caudalímetros solo aparece con el módulo `caudales`; Campo solo con `unifilar` o `generadores`.
- **Bombas**: siguen la selección de bombas y las secciones Corriente, Potencia y Temperaturas como filtro de campos. Se activan solo si Bombas está marcado. La sección "Línea General PM8000" desaparece porque la reemplaza Medidores.
- **Resolución**: control segmentado `1 MIN · 15 MIN · 1 H · 1 DÍA`. Por defecto 1 min con rangos de hasta 2 días, 15 min hasta 31 días, y 1 h de ahí en adelante. Si el usuario elige a mano, su elección se mantiene.
- La descarga respeta el nombre de archivo que manda el backend (`Content-Disposition`). Un 404 muestra "Sin datos en el rango seleccionado".
- Sigue la línea de `docs/diseno-industrial.md`: controles propios, sin controles nativos.

### 4. Frontend: exportar desde gráficos (`components/TrendChart.tsx`)

- Un botón **EXPORTAR** chico en la cabecera del gráfico abre un menú con CSV y XLSX. Se oculta si `data` está vacío.
- Una función pura `filasGrafico(data, series, unit)` → `{ headers, rows }`. Las columnas son `Fecha/Hora` y una por serie, con su etiqueta y la unidad del gráfico (`Q1 (L/s)`). El tiempo sale de `ts` (epoch ms, la `dataKey` del eje X) y se ordena por `ts`. Se exporta `displayData`, es decir lo visible con el zoom o brush aplicado.
- Archivo: `<slug del título>_<aaaa-mm-dd-hhmm>.csv|xlsx`. El XLSX sale de `lib/xlsx.ts` (una hoja).
- Se exporta lo que se ve: los mismos puntos y la misma ventana de agregación que el gráfico. Esto queda dicho en el `title` del botón.
- Cubre Históricos, Mis gráficos, Caudales, Recos/Regs, Gens, MotorDetalle, CampoEquipo y LibresTrend sin tocar cada vista. **`Dashboard.tsx` no se toca.**

## Permisos y modo réplica

Las rutas siguen bajo la misma autenticación que hoy: es lectura, así que no aplica `adminWriteGuard`. La réplica puede exportar igual que ahora. No cambian claves `?tab=`.

## Pruebas

- `test/exportDetalle.test.js`:
  - `tablasDetalle`: tipos, orden, filtro por `devices` y `fields`, conversión a L/s, campo con columnas dinámicas y tipos sin licencia omitidos.
  - `aCSV`: BOM, `;`, coma decimal, `0` contra vacío, escape y fecha.
  - `zip`: el resultado empieza con `PK` y lista los nombres.
  - Validación de `tipos` y `resolucion`.
- Test de `generateSeries` con `windowSec: 86400`: el Flux lleva `every: 86400s` y `offset`, con el Influx falso como en `campoSeries.test.js`.
- `frontend-react/src/lib/csv.test.ts` y un test de `filasGrafico`.
- Prueba manual en modo mock en el navegador: botón EXPORTAR en Históricos y Exportar datos con varios tipos.

## Fuera de alcance

Informes, Reporte diario, el PNG/PDF del unifilar, `Dashboard.tsx`, exportaciones programadas y elegir el separador del CSV.
