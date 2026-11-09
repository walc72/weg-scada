# Tarifas eléctricas y costos — diseño

Fecha: 2026-11-09 · Rama: `feat/tarifas-electricas`

## Objetivo

Cargar en Configuración los tipos de tarifa eléctrica (modelo del Pliego de Tarifas N° 21 de ANDE) y con ellas mostrar:

1. un **informe de costos** en Reportes → Informes (bloque y plantilla nuevos);
2. el **costo por bomba** en el reporte diario: pantalla, PDF, Excel y mail.

Éxito: con las tarifas de Agriplus y Agrocaraya cargadas, el reporte diario muestra cuánto costó la energía de cada bomba (punta y fuera de punta con el precio que regía ese día) y el informe mensual de costos se acerca a la factura de ANDE (energía + potencia reservada + exceso), con aviso de factor de potencia bajo por medidor.

## Decisiones (acordadas en el brainstorming)

| Tema | Decisión |
|---|---|
| Componentes | Energía por franjas horarias + cargo por potencia (reservada y exceso). Sin cargo fijo ni impuestos. |
| Franjas | Las del Pliego 21: **Punta** lunes a sábado 18–22 h (Res. P/N° 49888/2024; diferencial 731/732 con 4.11.1: 19–22 h) y **Fuera de punta** el resto + domingo. Configurables por tramos (días de la semana × horas enteras), sin feriados ni horario de verano/invierno. |
| Recargo por FP (pliego 4.5) | No se aplica. En el informe, a nivel medidor del sitio: FP medio y aviso si < 0,92. En el costo por bomba: nada. |
| Asignación | **Por sitio** (texto `site` de bombas y medidores) + "Sin sitio". Cada sitio elige tarifa y medidor de demanda. |
| Vigencia | Historial: cada tarifa es una lista de versiones con "vigente desde". Cada día se costea con la versión que regía. |
| Almacenamiento | Archivo propio `tarifas.json` al lado de `config.json`, API propia `/api/tarifas` (patrón de Correo y Marca). |
| Moneda | Una por instalación, `Gs` por defecto, sin decimales. |

## Arquitectura

Enfoque elegido: **la energía por hora va en el resumen y el costeo es una función pura que se aplica al mostrar.** El resumen no depende de la tarifa, así el cache por día de los informes sigue sirviendo aunque se edite una tarifa.

```
Influx ──generateSummary──▶ summary (+ kwhHora[], kwMaxHora[])  ──cache por día (informes)
                                         │
tarifas.json ──tarifas.costear(summary, tarifas)──▶ costos
                                         │
          ┌──────────────┬───────────────┼───────────────┬──────────────┐
     /api/reports      PDF/XLSX      mail diario     bloque costos   ReporteDiario.tsx
```

### Backend (`nodered/weg-api`)

**`src/services/tarifas.js`** (nuevo)
- `leer(file)` / `guardar(obj, autor, file)`: `tarifas.json` en `dirname(CONFIG_PATH)`, escritura atómica (tmp + rename) como `informes.js`. Si el archivo falta o está roto, devuelve el vacío `{ moneda: 'Gs', tarifas: [], asignacion: {} }`.
- `validar(obj)`: normaliza lo que manda el portal; lanza `Error` con un mensaje para el usuario (ver Validación).
- Funciones puras (con test):
  - `versionVigente(tarifa, fechaLocal)`: la versión con el `desde` ≤ fecha más reciente, o `null`.
  - `franjaDe(version, ms)`: índice de la franja que cubre esa hora local, o `-1` para el resto.
  - `costear(summary, tarifas, sitioDe)`: costos de bombas, medidores y sitios (ver Cálculo).

**`src/routes/tarifas.js`** (nuevo), montado en `/api/tarifas`
- `GET /`: el archivo completo, para cualquier usuario autenticado (el reporte diario necesita la moneda).
- `PUT /`: admin/superadmin. Cuerpo = archivo completo → `validar` → `guardar`. Responde lo guardado; `400 { error }` si no valida.
- No se sincroniza a la réplica: cada servidor tiene sus tarifas y puede editarlas, como Correo, Marca y las plantillas de informes.

**`src/services/reports.js`**
- `generateSummary` agrega dos consultas en paralelo, con `aggregateWindow(every: 1h)`:
  - integral de `drive_data.power` por bomba → `drives[i].kwhHora`;
  - integral de `meter_data.power` por medidor → `meters[i].kwhHora`;
  - máximo de la demanda de 15 min (las filas que ya calcula `meterDemand`) agrupado por hora → `meters[i].kwMaxHora`.
- Los arreglos van alineados por hora desde el inicio del período (`null` si no hay datos).
- La energía total del período no cambia de fuente (sigue la integral o el contador del medidor). Para costear un medidor, el kWh por hora se escala para que la suma coincida con `energyKwh` cuando la fuente es el contador.
- Si estas consultas fallan, se registra el error y el resumen sale sin arreglos: no hay costo, y el reporte no se rompe.
- PDF y Excel del resumen: si `summary.costos` existe, la tabla de bombas suma **Costo {moneda}** y **{moneda}/L** (esta última si hay volumen), y una fila de total.

**`src/routes/reports.js`**: las rutas de resumen diario y por rango calculan `summary.costos = tarifas.costear(...)` y **quitan `kwhHora`/`kwMaxHora`** de la respuesta.

**`src/services/dailyReport.js`**: calcula los costos antes de generar el PDF; `totalsLine` suma `· Costo bombas: <strong>X Gs</strong>` si hay costos.

**`src/services/informes.js`**
- Bloque nuevo `costos: 'Costos de energía'` (ver Informe de costos).
- Plantilla de fábrica `{ id: 'costos', nombre: 'Costos', periodo: 'mes_anterior', bloques: ['indicadores', 'costos'] }`.
- `CACHE_V = 3`: los días cacheados pasan a llevar los arreglos por hora.

### Frontend (`frontend-react/src`)

**`views/config/TarifasTab.tsx`** (nuevo), en `ConfigView.tsx` → grupo *Supervisión* → subpestaña `{ id: 'tarifas', label: 'Tarifas' }`. No va envuelta en `soloLectura`, porque las tarifas son de cada servidor.
- Carga con `GET /api/tarifas` y edita con `useEdicion`, `BarraGuardado`, `useAvisoSalida` y `useAvisoPendiente`. Guarda con `PUT /api/tarifas`, como `CorreoTab`.
- Mutadores puros en `views/config/tarifas.ts` (con test): agregar o borrar tarifa, nueva versión (copia de la vigente, `desde` = hoy), borrar versión, editar franja, tramo, resto y potencia, asignar sitio. También la detección de sitios a partir de `config.devices[].site` y `config.meters[].site`.
- Una `SeccionConfig` "Tarifas eléctricas" con dos bloques:
  1. **Tarifas**: tabla con nombre, vigente desde, precios vigentes, Editar y Borrar, más el botón **Agregar tarifa**. El editor tiene:
     - el nombre;
     - un selector de versión ("Vigente desde"), con **Nueva versión** y **Borrar versión**;
     - **Franjas**: filas con nombre, precio/kWh y tramos (botones de día L M M J V S D tipo toggle, desde y hasta con `Select` de 0 a 24);
     - **Resto**: nombre y precio/kWh;
     - **Potencia**: `Select` Ninguna/Única/Diferencial con sus campos;
     - el botón **Precargar ANDE**, que crea la franja "Punta" (L–S 18–22) y el resto "Fuera de punta" sin precios.
  2. **Asignación por sitio**: una fila por sitio detectado, más "Sin sitio" si hay equipos sin sitio. Cada fila tiene un `Select` de tarifa (o "Sin tarifa") y un `Select` de medidor de demanda, con solo los medidores de ese sitio (o "Ninguno").
- Estilo industrial ISA-101 según `docs/diseno-industrial.md`, solo con componentes de `components/ui`, sin Ant Design ni controles nativos.
- Si un sitio asignado ya no existe en la config, la fila se muestra marcada "Sitio no encontrado" y se puede quitar.

**`views/ReporteDiario.tsx`**: si la respuesta trae `costos`, se agregan:
- en la tabla de bombas, las columnas **Costo {moneda}** y **{moneda}/L**, con su total;
- el KPI **COSTO BOMBAS**.

El resumen de respaldo que arma el cliente (sin servidor) no tiene costos. No se toca `Dashboard.tsx`.

## Modelo de datos (`tarifas.json`)

```json
{
  "moneda": "Gs",
  "tarifas": [{
    "id": "t-lq3k9a1x",
    "nombre": "ANDE 412 Línea MT",
    "versiones": [{
      "desde": "2024-11-26",
      "franjas": [
        { "nombre": "Punta", "precioKwh": 331.93,
          "tramos": [{ "dias": [1, 2, 3, 4, 5, 6], "desde": 18, "hasta": 22 }] }
      ],
      "resto": { "nombre": "Fuera de punta", "precioKwh": 144.83 },
      "potencia": { "modo": "unica", "reservadaKw": 800, "precioKw": 41126, "precioExcesoKw": 87533 }
    }]
  }],
  "asignacion": {
    "Agriplus":   { "tarifa": "t-lq3k9a1x", "medidor": "PM8000-01" },
    "Agrocaraya": { "tarifa": "t-lq3k9b2y", "medidor": null },
    "":           { "tarifa": "t-lq3k9a1x", "medidor": null }
  }
}
```

- `dias`: 1 = lunes … 7 = domingo, como en las suscripciones de informes.
- `desde`/`hasta`: horas enteras de 0 a 24, con `desde` incluido y `hasta` excluido. Un tramo no cruza la medianoche: 22–02 se carga como 22–24 más 0–2.
- Monómica: `franjas: []` y solo `resto`.
- `potencia`:
  - `null`: sin cargo por potencia;
  - `{ modo: 'unica', reservadaKw, precioKw, precioExcesoKw }`: binómica;
  - `{ modo: 'diferencial', punta: { reservadaKw, precioKw, precioExcesoKw }, fuera: { … } }`: grupo diferencial 731/732. "Punta" son las horas de cualquier franja que no sea `resto`.
- Asignación: la clave es el sitio. `""` = "Sin sitio" (bombas y medidores sin `site`).

### Validación (`tarifas.validar`)

- Moneda: de 1 a 8 caracteres; por defecto `Gs`.
- Hasta 20 tarifas, con nombre de 1 a 60 caracteres y único sin distinguir mayúsculas. El `id` lo genera el servidor si falta.
- Cada tarifa tiene de 1 a 50 versiones, con `desde` en formato `AAAA-MM-DD` y sin repetir. Se guardan ordenadas por `desde`.
- Hasta 6 franjas por versión, con nombre de 1 a 30 caracteres. Todos los precios son números ≥ 0.
- Tramos: `dias` con valores únicos de 1 a 7, no vacío, y `0 ≤ desde < hasta ≤ 24` en enteros. **No puede haber dos franjas que cubran la misma hora del mismo día.**
- Potencia: `reservadaKw` y los precios son números ≥ 0.
- Asignación: `tarifa` tiene que existir o ser `null`. `medidor` es un texto o `null`; no se valida contra la config, porque un medidor dado de baja no tiene que bloquear el guardado.

## Cálculo (`tarifas.costear`)

Entradas: el summary con los arreglos por hora, las tarifas y `sitioDe(nombre)`, que sale de la config.

- **Energía por bomba**: para cada hora `h` del período con `kwhHora[h] != null`:
  1. fecha local de `h`;
  2. `versionVigente` de la tarifa de su sitio;
  3. `franjaDe` → precio;
  4. acumular kWh y costo por franja.

  Resultado:
  ```
  { kwhPorFranja: [{ nombre, kwh, costo }], costo, porLitro }
  ```
  `porLitro` = costo / litros, solo si la bomba tiene volumen. Sin tarifa → `costo: null`.

- **Sitio** (informe de costos): energía del medidor de demanda del sitio, costeada por hora igual que las bombas. Si no hay medidor, la energía del sitio es la suma de sus bombas y no hay cargo por potencia. Para la potencia, por cada mes calendario que toca el período:
  - **reservada** = `reservadaKw × precioKw × (días del período en ese mes / días del mes)`;
  - **exceso** = `max(0, demandaMáx15min − reservadaKw) × precioExcesoKw`, con la demanda máxima de ese mes dentro del período (de `kwMaxHora`) y cobrado entero. Si el período no cubre el mes completo, el resultado se marca `mesParcial: true`;
  - en modo diferencial, se calcula por separado con la demanda máxima en horas de punta y la de fuera de punta.
- Si la versión cambia a mitad de mes, se usan el precio y la reservada de la versión que regía cada día para el prorrateo de la reservada, y los de la versión vigente al último día del período dentro de ese mes para el exceso.
- **FP**: `meters[medidor].stats.pf.avg`, con aviso si es < 0,92. Solo es un aviso: no se suma al costo.
- Totales: `costoBombas` = Σ del costo de las bombas; `costoSitios` = Σ (energía + reservada + exceso) de los sitios.

## Informe de costos (bloque `costos`)

Partes genéricas (kpis / tabla / nota) que ya dibujan el portal, el PDF y el XLSX:

1. **KPIs**: COSTO ENERGÍA BOMBAS, COSTO TOTAL SITIOS, {moneda}/kWh MEDIO, {moneda}/L (si hay volumen).
2. **Tabla "Por sitio"**: Sitio, Tarifa, kWh y {moneda} por franja (columnas dinámicas según los nombres de franja), Potencia reservada, Exceso, Total y FP medio.
3. **Tabla "Por bomba"**: Bomba, Sitio, kWh por franja, Costo y {moneda}/L.
4. **Notas**:
   - "Mes parcial: el exceso usa la demanda máxima del tramo informado.";
   - "Sin tarifa asignada: …";
   - "FP medio de {medidor} = 0,90 (menor a 0,92): ANDE aplica un recargo sobre la energía (pliego 4.5).";
   - "Sin tarifas cargadas: Configuración → Supervisión → Tarifas." (en ese caso, en lugar de las tablas).

El bloque usa el resumen del período completo (no el detalle por día). Para períodos de más de `MAX_DIAS_DETALLE` días se calcula igual, porque el resumen del período trae los arreglos por hora.

## Casos borde y errores

- Sin `tarifas.json` o sin tarifas: el reporte diario y los informes salen como hoy, sin columnas de costo, y el bloque `costos` muestra la nota.
- Hora sin datos (`null`): no se costea. No se interpola.
- Día anterior al `desde` de la primera versión: esa energía no tiene costo y la nota lo indica ("sin tarifa vigente").
- Bomba con `site` que no está en la asignación y sin entrada `""`: sin costo.
- Fallo de las consultas por hora: el resumen sale sin arreglos y no hay costo. Se registra en el log (`[REPORT] tarifas:`).
- Archivo corrupto: `leer` devuelve vacío y registra el error. El próximo `PUT` lo reescribe completo.
- Escritura concurrente: último gana (escritura atómica). Es el mismo criterio que `informes.json`.

## Tests

- `test/tarifas.test.js` (node:test):
  - validación (solapes, versiones duplicadas, límites);
  - `versionVigente`;
  - `franjaDe` (sábado 18 h = punta, domingo 20 h = resto, lunes 22 h = resto);
  - `costear` con cambio de versión a mitad del período;
  - prorrateo de la reservada en medio mes;
  - exceso único y diferencial;
  - sitio sin tarifa;
  - aviso de FP.
- `test/informesCostos.test.js`: el bloque `costos` con un resumen de ejemplo (sin tarifas, una tarifa, dos sitios).
- `test/tarifasRoute.test.js`: `PUT` como operador → 403; inválido → 400; válido → 200 y se escribe el archivo.
- Frontend: `views/config/tarifas.test.ts` (mutadores y detección de sitios), con vitest como `equipos.test.ts`.
- Se corren en Docker sobre WSL, como en la etapa 2.

## Fuera de alcance

- Cargo fijo, IVA y otros impuestos.
- Feriados.
- Recargo por factor de potencia aplicado al costo.
- Sincronizar las tarifas a la réplica.
- Cargo por potencia prorrateado por bomba.
- Precios con más de una moneda.
- Mostrar el costo en el Dashboard.

## Referencias

- ANDE, Pliego de Tarifas N° 21: definiciones 3.7 (demanda de 15 min), 4.3 (exceso), 4.5 (FP) y categorías MT 372/412/413/731/732.
- ANDE, Res. P/N° 49888 del 26/11/2024: horario de punta de lunes a sábado de 18 a 22 h; 4.11.1 diferencial de 19 a 22 h.
