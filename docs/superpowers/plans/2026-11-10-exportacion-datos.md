# Exportación de datos — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** detalle multi-equipo con resolución elegible en Exportar datos, CSV para Excel en español y un botón EXPORTAR en todos los gráficos de tendencia.

**Architecture:** el backend arma el detalle desde `generateSeries`, la misma fuente que los gráficos. Una función pura lo convierte en tablas por tipo de equipo, y CSV, XLSX y PDF las serializan. En el frontend, un helper CSV compartido sirve a Alarmas, a los gráficos y al modo mock. La exportación de gráficos vive en `TrendChart` y cubre todas las vistas de una vez.

**Tech Stack:** Node 26 + Express 5 + InfluxDB (Flux), `node --test`. React 19 + TS + Tailwind 4, `vitest`.

**Spec:** `docs/superpowers/specs/2026-11-10-exportacion-datos-design.md`

## Global Constraints

- Textos de interfaz y commits en español rioplatense.
- Unidades: caudal en **L/s** (dato en m³/h, convertir con `aLps`), potencia en kW, corriente en A.
- UI según `docs/diseno-industrial.md`: sin Ant Design, sin controles nativos.
- No tocar `frontend-react/src/views/Dashboard.tsx` ni `nodered/weg-api/src/services/informes.js`.
- Sin dependencias nuevas.
- CSV: BOM `﻿`, separador `;`, línea `\r\n`, coma decimal sin miles, fecha `dd/mm/aaaa hh:mm` local, `null` → vacío, `0` se conserva, comillas si hay `;`, `"` o salto de línea (`"` → `""`).
- `tipos` ⊂ `['bombas','medidores','caudal','campo']` (vacío o inválido → `['bombas']`). `resolucion` ∈ `{60,900,3600,86400}` (otro valor → 60).

## Review Focus

- Rango sin datos en ningún tipo → 404 `Sin datos en el rango seleccionado`, no un archivo vacío (Task 4).
- Licencia sin `caudales` y `tipos` con `caudal` → la tabla no aparece y no falla (Task 3).
- Un nombre de equipo con `;` o comillas → el CSV sigue con las columnas alineadas (Task 1 y Task 5).
- Resolución de 1 día → las filas caen en medianoche local con la fecha de ese día, no la del día siguiente (Task 2).
- Gráfico con zoom o brush → se exporta solo lo visible (Task 6).

---

### Task 1: helpers backend `zip` y `aCSV`

**Files:**
- Create: `nodered/weg-api/src/services/zip.js`
- Create: `nodered/weg-api/src/services/exportar.js`
- Modify: `nodered/weg-api/src/services/reports.js` (`toXLSX`: usar `zip`)
- Test: `nodered/weg-api/test/exportDetalle.test.js`

**Interfaces:**
- Produces: `zip(files: Record<string, string|Buffer>) → Buffer` (deflate, mismo formato que hoy). `aCSV(headers: string[], rows: any[][]) → string`.

- [ ] Tests:
  - `aCSV(['A','B'], [[12.5, null], [0, 'x;y'], ['di"jo', new Date(2026,10,10,8,5)]])` empieza con `﻿` y es igual a `'﻿A;B\r\n12,5;\r\n0;"x;y"\r\n"di""jo";10/11/2026 08:05'`.
  - `zip({'a.csv':'hola'})`: los primeros 2 bytes son `PK` y el buffer incluye `a.csv`.
  - Los tests de `reportToXLSX` que ya existen siguen pasando.
- [ ] Correr `npm test --prefix nodered/weg-api`: falla.
- [ ] Sacar el armado ZIP de `toXLSX` a `zip.js` sin cambios (`toXLSX` arma `files` y llama a `zip(files)`). Escribir `aCSV` en `exportar.js`.
- [ ] Correr los tests: pasan.
- [ ] Commit `feat(api): helpers zip y CSV para Excel en español`.

### Task 2: `generateSeries` con resolución de 1 día

**Files:**
- Modify: `nodered/weg-api/src/services/reports.js` (`generateSeries`, `queryMeasurement`, `flowSeries`, `campoSeries`)
- Test: `nodered/weg-api/test/exportDetalle.test.js`

**Interfaces:**
- Produces: `generateSeries({ from, to, windowSec, bucket })` acepta `windowSec` en `[10, 86400]`. Con `windowSec >= 86400`, cada `aggregateWindow` lleva `offset: <getTimezoneOffset()*60>s, timeSrc: "_start"`.
- `queryMeasurement(measurement, fields, start, stop, windowSec, extraKeys, bucket, aw = '')`, `flowSeries(start, stop, windowSec, bucket, aw = '')` y `campoSeries(..., aw = '')`. `aw` es el texto extra para los argumentos de `aggregateWindow`, como `, offset: 10800s, timeSrc: "_start"`.
- `drive_data` suma `motor_temp`.

- [ ] Test con un Influx falso (el mismo patrón de `campoSeries.test.js`): `generateSeries({ windowSec: 86400 })`. Todo cuerpo de consulta con `drive_data` contiene `every: 86400s`, `offset: ${new Date().getTimezoneOffset()*60}s` y `timeSrc: "_start"`. Con `windowSec: 900`, ningún cuerpo tiene `offset:`. `motor_temp` aparece en la consulta de `drive_data`.
- [ ] Correr: falla.
- [ ] Implementar. `ponytail:` offset fijo; si vuelve el horario de verano, pasar a `timezone.location`.
- [ ] Correr todos los tests de la API: pasan (`campoSeries.test.js` incluido).
- [ ] Commit `feat(api): series con resolución diaria alineada a medianoche local`.

### Task 3: `tablasDetalle` y `opcionesExport`

**Files:**
- Modify: `nodered/weg-api/src/services/exportar.js`
- Test: `nodered/weg-api/test/exportDetalle.test.js`

**Interfaces:**
- Consumes: el resultado de `generateSeries` (`drives`, `meters` y opcionalmente `flows` y `campo`, filas con `_time` ISO).
- Produces:
  - `opcionesExport(body) → { from, to, bucket, tipos: string[], resolucion: number, devices: string[], fields: string[] }`.
  - `tablasDetalle(series, { tipos, devices, fields }) → Array<{ tipo: 'bombas'|'medidores'|'caudal'|'campo', nombre: 'Bombas'|'Medidores'|'Caudal'|'Campo', headers: string[], rows: any[][] }>`, con `rows[i][0]` como `Date`.
- Columnas:
  - Bombas: `Fecha/Hora, Bomba, Sitio` y luego, en este orden, los campos pedidos de `current, voltage, power, frequency, motor_speed, motor_temp, igbt_temp, scr_temp, cos_phi` con los encabezados de `HEADER_MAP` (exportarlo desde `reports.js` o moverlo a `exportar.js`). Si `fields` viene vacío, se agrega `Caudal estimado (L/s)` cuando la fila trae `flow`.
  - Medidores: `Fecha/Hora, Medidor, Corriente (A), Voltaje (V), Potencia (kW), FP`.
  - Caudal: `Fecha/Hora, Caudalímetro, Caudal (L/s)`.
  - Campo: `Fecha/Hora, Equipo, Tipo` y la unión ordenada de los campos presentes (sin `_time, name, kind, result, table, _start, _stop`). Encabezados conocidos: `ia→Ia (A)`, `ib→Ib (A)`, `ic→Ic (A)`, `v→V (V)`, `tap→Tap`.

- [ ] Tests:
  - `opcionesExport({})` da `tipos ['bombas']` y `resolucion 60`.
  - `opcionesExport({ tipos: ['caudal','x','bombas'], resolucion: 900 })` da `tipos ['bombas','caudal']` (orden fijo) y `resolucion 900`.
  - `resolucion: 120` da 60.
  - `tablasDetalle` con los cuatro tipos devuelve los nombres en orden. Un `flow: 36` de caudal sale `10` (L/s).
  - `devices: ['B1']` filtra bombas.
  - `fields: ['power']` deja los encabezados `['Fecha/Hora','Bomba','Sitio','Potencia (kW)']`.
  - Con `series.flows` `undefined` y `tipos` con `caudal`, no hay tabla de caudal.
  - Un tipo sin filas no genera tabla.
  - Campo con filas `{ia, tap}` y `{ia, x1}` lleva los encabezados `[..., 'Ia (A)', 'Tap', 'x1']`, con celda vacía donde falta el dato.
- [ ] Correr: falla. Implementar. Correr: pasa.
- [ ] Commit `feat(api): tablas de detalle por tipo de equipo`.

### Task 4: rutas CSV, XLSX y PDF con el detalle nuevo

**Files:**
- Modify: `nodered/weg-api/src/routes/reports.js` (`/xlsx`, `/csv`, `/pdf`)
- Modify: `nodered/weg-api/src/services/reports.js`: `reportToXLSX(tablas, summary)` agrega una hoja por tabla con `_time` → `fechaHora`. `toPDF(tablas, title)` dibuja una sección por tabla con el encabezado y la paginación actuales y sin `headerMap` propio, porque los encabezados ya vienen en la tabla. Se borra `toCSV`. `generateReport` queda para `/generate`.
- Test: `nodered/weg-api/test/exportDetalle.test.js`. Ajustar los tests existentes que llaman `reportToXLSX(null, …)`, que siguen válidos con `tablas = null`.

**Interfaces:**
- Consumes: `opcionesExport`, `tablasDetalle`, `aCSV`, `zip`, `generateSeries({ from, to, windowSec: resolucion, bucket })`.
- Flujo común: `opts = opcionesExport(req.body)` → `series` → `tablas`. Si `tablas` queda vacío, 404 `{ error: 'Sin datos en el rango seleccionado' }`.
- Nombres de archivo con `d = from.slice(0,10)` y `h = to.slice(0,10)`:
  - CSV con una tabla: `weg-<tipo>_<d>_<h>.csv`.
  - CSV con varias: `weg-datos_<d>_<h>.zip`, con entradas `<tipo>_<d>_<h>.csv`.
  - XLSX: `weg-datos_<d>_<h>.xlsx`.
  - PDF: `weg-datos_<d>_<h>.pdf`.
- Agregar `Access-Control-Expose-Headers: Content-Disposition` si el server tiene CORS (revisar `server.js`).

- [ ] Test: `reportToXLSX([{ nombre: 'Caudal', headers: ['Fecha/Hora','Caudalímetro','Caudal (L/s)'], rows: [[new Date(), 'Q1', 10]] }], null)`. El `workbook.xml` incluye `name="Caudal"`. Usar el `zipEntry` de `campoSummary.test.js`.
- [ ] Test: `toPDF` con dos tablas resuelve un `Buffer` que empieza con `%PDF`.
- [ ] Correr: falla. Implementar. Correr toda la suite de la API: pasa.
- [ ] Commit `feat(api): exportar detalle multi-equipo en CSV, XLSX y PDF`.

### Task 5: `lib/csv.ts` en el frontend y Alarmas

**Files:**
- Create: `frontend-react/src/lib/csv.ts`
- Test: `frontend-react/src/lib/csv.test.ts`
- Modify: `frontend-react/src/views/Alarmas.tsx` (borrar `csvField` y `downloadCSV` locales y usar `descargarCSV`)
- Modify: `frontend-react/src/views/Reportes.tsx` (el `downloadCSV` del modo mock pasa a usar `descargarCSV`)

**Interfaces:**
- Produces: `aCSV(headers: string[], rows: (string|number|Date|null|undefined)[][]): string` (las mismas reglas que el backend). `descargarCSV(nombre: string, headers: string[], rows: …): void` (Blob `text/csv;charset=utf-8`, `<a download>`). `descargarBlob(nombre: string, blob: Blob): void`.

- [ ] Test: el mismo caso de Task 1, esperando el mismo string exacto.
- [ ] `npx vitest run src/lib/csv.test.ts` (en `frontend-react`): falla. Implementar. Pasa.
- [ ] Commit `feat(frontend): CSV para Excel en español compartido (Alarmas)`.

### Task 6: botón EXPORTAR en `TrendChart`

**Files:**
- Modify: `frontend-react/src/lib/exportar.ts` (sumar `filasGrafico` y `nombreExport`)
- Test: `frontend-react/src/lib/exportar.test.ts`
- Modify: `frontend-react/src/components/TrendChart.tsx`

**Interfaces:**
- Consumes: `aCSV`/`descargarCSV` (Task 5) y `downloadXlsx` de `lib/xlsx.ts`.
- Produces:
  - `filasGrafico(data: Record<string, number|string>[], series: { key: string; label: string }[], unit?: string): { headers: string[]; rows: (Date|number|null)[][] }`. Los encabezados son `['Fecha/Hora', ...series.map(s => unit ? `${s.label} (${unit})` : s.label)]`. Las filas van ordenadas por `ts`, con `new Date(ts)` y `null` donde falta la serie.
  - `nombreExport(titulo: string, fecha: Date, ext: 'csv'|'xlsx'): string` → `<slug>_<aaaa-mm-dd-hhmm>.<ext>` (el mismo slug que `nombreArchivo`, sin el prefijo `unifilar-`).

- [ ] Tests:
  - `filasGrafico([{ts:2,a:1},{ts:1,a:3,b:4}], [{key:'a',label:'Q1'},{key:'b',label:'Q2'}], 'L/s')` da los encabezados `['Fecha/Hora','Q1 (L/s)','Q2 (L/s)']` y las filas `[[new Date(1),3,4],[new Date(2),1,null]]`.
  - `nombreExport('Caudal · Pozo 3', new Date(2026,10,10,8,5), 'csv')` da `'caudal-pozo-3_2026-11-10-0805.csv'`.
- [ ] Correr: falla. Implementar. Pasa.
- [ ] En la cabecera de `TrendChart`, un botón `EXPORTAR` (ícono `Download`) con el mismo estilo que los botones de rango (`BTN_OFF`). Abre un menú propio, no un `<select>`, con `CSV` y `XLSX`. Se oculta si `displayData` está vacío. `title="Exporta los puntos que se ven en el gráfico"`. Exporta `displayData`.
- [ ] `npm run build` y `npx vitest run` en `frontend-react`: sin errores.
- [ ] Commit `feat(frontend): exportar CSV/XLSX desde cualquier gráfico de tendencia`.

### Task 7: Reportes → Exportar datos

**Files:**
- Modify: `frontend-react/src/views/Reportes.tsx`
- Test: `frontend-react/src/lib/exportar.test.ts` (`resolucionPorDefecto`)

**Interfaces:**
- Consumes: el cuerpo nuevo de Task 4 y `descargarBlob` de Task 5.
- Produces: `resolucionPorDefecto(ms: number): 60|900|3600` en `lib/exportar.ts`. Hasta 2 días da 60, hasta 31 días da 900, más da 3600.

- [ ] Tests:
  - `resolucionPorDefecto(2*86400_000)` da 60.
  - `resolucionPorDefecto(2*86400_000+1)` da 900.
  - `resolucionPorDefecto(31*86400_000)` da 900.
  - `resolucionPorDefecto(31*86400_000+1)` da 3600.
- [ ] Implementar `resolucionPorDefecto`. Pasa.
- [ ] UI:
  - Bloque **Equipos** con casillas propias (el componente `checkbox` de `components/ui`): Bombas, Medidores, Caudalímetros (solo con el módulo `caudales`) y Campo (solo con `unifilar` o `generadores`, con el mismo chequeo de licencia que ya usan otras vistas).
  - Selección de bombas y secciones Corriente, Potencia y Temperaturas, deshabilitadas si Bombas no está marcado. Se quita `pm8000` de `Section`.
  - Control segmentado **Resolución** `1 MIN · 15 MIN · 1 H · 1 DÍA`, con `resolucionPorDefecto(rango)` hasta que el usuario elija a mano.
  - En live, `downloadHistorical` manda `tipos` y `resolucion`, toma el nombre de `Content-Disposition` (con `weg-datos.<ext>` como respaldo) y con un 404 muestra el toast `Sin datos en el rango seleccionado`.
- [ ] `npm run build` y `npx vitest run`: sin errores.
- [ ] Probar en modo mock en el navegador: Exportar datos y el botón EXPORTAR en Históricos y en Mis gráficos. Revisar los controles contra el checklist de `docs/diseno-industrial.md`.
- [ ] Commit `feat(frontend): Exportar datos con tipos de equipo y resolución`.

### Task 8: PR

- [ ] Correr `npm test` en las dos carpetas: pasa.
- [ ] Push de `feat/exportacion-datos` y PR contra `master` con el resumen y el checklist de diseño industrial. Merge, tag y planta quedan aparte, con OK del usuario.
