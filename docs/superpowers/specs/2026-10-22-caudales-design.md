# Módulo Caudales — Diseño

Fecha: 2026-10-22 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-10-22-licencias-design.md` (módulo `caudales`, niveles A/B/C).

## 1. Problema y objetivo

El SCADA no muestra cuánta agua mueve cada bomba. Hoy no hay caudalímetros integrados; se van a
instalar TUF-2000SW (ultrasónicos, Modbus RTU por RS485) conectados a un Schneider PAS600 que hace
de gateway Modbus TCP.

Objetivo: mostrar el caudal de cada bomba y el bombeado total, graficarlos en Tendencias y sumar
el volumen bombeado a los reportes. Cada bomba puede usar un caudal **manual** (nominal cargado en
Configuración) o el **real** de un caudalímetro, y un caudalímetro puede medir una bomba o un
**colector** compartido por varias.

### Decisiones tomadas

- Unidad: **m³/h** (volumen en m³). Fija, no configurable.
- Manual = **caudal nominal**: vale el nominal con la bomba en marcha y 0 parada.
- Caudalímetros en lista propia, asignados a una o varias bombas (colector).
- Volumen diario y por rango en los reportes, con su fuente.
- Cada caudalímetro habilitado es un **equipo simple (A)** de la licencia; todo depende del módulo
  `caudales`.

### Criterios de éxito

- Una bomba en modo manual muestra su nominal en marcha y 0 parada; en Tendencias y en el reporte
  da volumen = nominal × horas de marcha.
- Un TUF-2000SW leído por un PAS600 muestra caudal en la tarjeta de su bomba (o de las bombas del
  colector) y su volumen del día sale del totalizador.
- La pestaña Tendencias → Caudales muestra el caudal por bomba/colector y el apilado de las bombas
  en marcha con su total.
- Sin el módulo `caudales` no aparece nada de esto y la API rechaza caudalímetros.
- La réplica de oficina muestra lo mismo que planta.
- Actualizar a esta versión no cambia nada en bombas sin caudal configurado.

### Fuera de alcance

- Alarmas por caudal (bajo/alto) y por error del caudalímetro.
- Caudalímetros de otros modelos (el `type` deja lugar para agregarlos).
- Estimar caudal por velocidad del variador.
- Configurar el TUF-2000SW (unidades, diámetro de cañería, totalizador) desde el SCADA: se hace en
  el equipo.

## 2. Configuración (`config.json`)

### 2.1 Por bomba (`devices[]`)

```json
"caudal": { "modo": "manual", "nominal": 850 }
```

- `modo`: `manual` | `real`. Ausente = sin caudal.
- `nominal`: m³/h, número ≥ 0. En `manual`, 0 o ausente = la bomba no muestra caudal.
- `real` es válido solo si la bomba está en `bombas` de algún caudalímetro (habilitado o no).

### 2.2 Caudalímetros (`flowmeters[]`, nuevo, al lado de `meters`)

```json
{ "name": "Colector Norte", "type": "TUF2000", "ip": "192.168.10.80", "port": 502,
  "unitId": 3, "wordOrder": "LE", "totalMultiplier": 1, "bombas": ["IMBIL 5", "IMBIL 6"],
  "enabled": true }
```

- `ip`/`port`: el PAS600 (Modbus TCP); `unitId`: el ID RS485 del TUF.
- `wordOrder`: `LE` (palabra baja primero, por defecto) | `BE`.
- `totalMultiplier`: factor que lleva el totalizador del TUF a m³ (depende de la unidad y el
  multiplicador configurados en el equipo, menús M31/M32). Por defecto 1 = el TUF ya totaliza en
  m³ con ×1. Número > 0.
- `bombas`: uno o más nombres de `devices[]`.

### 2.3 Validación (API, `validateConfig`)

- Nombre de caudalímetro único, no vacío; `type` = `TUF2000`; IP, puerto y `unitId` válidos;
  `wordOrder` ∈ {LE, BE}; `totalMultiplier` > 0 (opcional); `bombas` no vacío, sin repetidos.
- Cada nombre de `bombas` existe en `devices[]`.
- Una bomba no está en dos caudalímetros: `IMBIL 5 ya está en el caudalímetro Colector Norte`.
- `caudal.modo = real` sin caudalímetro: `IMBIL 5: modo Real requiere un caudalímetro`.
- Renombrar o borrar una bomba por la API la actualiza/quita de `bombas` de los caudalímetros
  (en el mismo guardado). Un caudalímetro que queda sin bombas se conserva deshabilitado.
- Licencia: `flowmeters` habilitados requieren el módulo `caudales`; cuentan como nivel A
  (`check` de `license.js`).

## 3. Lectura de los TUF-2000SW (poller)

- Los caudalímetros habilitados y permitidos por la licencia se agrupan por `ip:port` (PAS600) con
  la misma lógica de conexión/secuencia que hoy usan los gateways.
- Lectura (holding registers, base 1, como el manual del TUF-2000):
  - Registros **1–12** en una sola consulta: caudal (REAL4, reg 1–2, m³/h) y totalizador positivo
    (LONG reg 9–10 + fracción REAL4 reg 11–12, en m³).
  - Registro **72**: código de error (0 = sin error).
- `wordOrder` define cómo se arman los 32 bits de cada REAL4/LONG.
- `total` = (LONG + fracción) × `totalMultiplier`.
- Fallas de comunicación: misma lógica que variadores y medidores (OFFLINE tras 3 fallas,
  reintento cada 30 s, `commDecision`).
- Valores inválidos (NaN, infinito) o código de error ≠ 0 → `error` con el código; el caudal no se
  usa para volumen.
- Publica por caudalímetro:
  - MQTT retenido `weg/flow/<sanitizado>`: `{ name, flow, total, error, online, ts }`.
  - InfluxDB `flow_data,name=<name>` campos `flow`, `total`, `error`, `online`.
- Calcula `flow` por bomba y lo agrega a su payload MQTT y a su línea `drive_data`:
  - `manual`: `nominal` si `running`, `0` si no; sin valor si la bomba está OFFLINE.
  - `real` con caudalímetro de una sola bomba: el `flow` del caudalímetro si está online y sin
    error; si no, sin valor.
  - `real` en un colector (caudalímetro con varias bombas): sin valor propio.
  - El payload MQTT de la bomba suma `flowMode` (`manual` | `real` | `colector`) y, en colector,
    `flowMeter` (nombre del caudalímetro).
- Excedidos por licencia: igual que el resto (`license: 'excedido'`, no se leen ni se escriben).

## 4. Portal

### 4.1 Tarjeta de bomba (`DriveCard`)

- Cuadro **Caudal** con el valor en m³/h (sin decimales sobre 100, uno debajo) y la etiqueta
  `Manual` | `Real` | `Colector <nombre>`.
- Colector: muestra el caudal del colector y `compartido con <otras bombas>`.
- Real con problema: `Sin señal (código N)`, `Caudalímetro sin comunicación` o
  `Caudalímetro desactivado`.
- No aparece sin el módulo `caudales` ni en bombas sin caudal configurado.

### 4.2 Tendencias

- Pestañas **General** (lo actual) y **Caudales** (solo con el módulo).
- Gráfico 1 **Caudal por bomba**: una serie por bomba con `flow` y una por caudalímetro de
  colector; selector de series como el actual.
- Gráfico 2 **Bombas en marcha**: áreas apiladas del `flow` de cada bomba en los instantes en que
  `running` es verdadero, más los colectores; línea de **Total**; tooltip con total y aportes.
- Datos: `POST /api/reports/series` amplía la respuesta con `flows` (series de `flow_data`) y con
  el campo `flow` en las series de bombas. Modo demo: datos simulados coherentes.

### 4.3 Configuración → Dispositivos

- Sección **Caudalímetros**: tabla (nombre, PAS600 IP:puerto, ID, bombas, estado, caudal actual) y
  diálogo Agregar/Editar con casillas de bombas (las que ya están en otro caudalímetro,
  deshabilitadas con el motivo). Botón Agregar sujeto al límite A de la licencia.
- En el diálogo de la bomba: sección **Caudal** (Modo, Caudal nominal). `Real` deshabilitado si la
  bomba no está en ningún caudalímetro, con la explicación.

## 5. Volumen en reportes

Mismo patrón que la energía de los medidores en `generateSummary` (contador si cubre el período,
integral si no):

- Bomba sin caudalímetro propio (manual): integral de `drive_data.flow` en el período ÷ 3600
  → m³. Fuente `estimado`.
- Caudalímetro (de una bomba o colector): `total` último − primero del período si cubre todo el
  período y no bajó; si no, integral de `flow_data.flow` (solo puntos sin error) ÷ 3600. Fuente
  `totalizador` o `integrado`.
- Una bomba con caudalímetro propio toma el volumen de su caudalímetro (no se suma dos veces).
- **Total bombeado** = bombas manuales + caudalímetros.
- Salidas: reporte diario en pantalla, PDF del mail y XLSX: columna **Volumen (m³)** en bombas,
  tabla **Caudalímetros** (volumen, caudal promedio y máximo, fuente) y **Total bombeado (m³)**
  junto a la energía. Reportes por rango con el mismo cálculo.
- Sin el módulo `caudales`, no aparece.

## 6. Licencia (`license.js`, las dos copias idénticas)

- `tier('flowmeter', item)` = `A`.
- `usage(config, lic)` y `allowed(config, lic)` incluyen `flowmeters` (habilitados; solo con el
  módulo `caudales` cuando se pasa `lic`). `allowed` devuelve además `flowmeters: Set<string>`.
- `check` rechaza caudalímetros sin el módulo `caudales` (mismo criterio de "no empeorar" con
  `prev`).

## 7. Réplica de oficina

- `weg-replica` suscribe además `weg/flow/+` para el en vivo.
- La copia de histórico debe incluir la medición `flow_data` (verificar que no filtra por
  medición; si filtra, agregarla).
- La config replicada ya trae `flowmeters` y `caudal` (viajan en `config.json`).

## 8. Pruebas

- **Poller:** decodificación de registros del TUF en `LE` y `BE`, fracción del totalizador, código
  de error, NaN; cálculo de `flow` por bomba (manual en marcha/parada/offline, propio online/con
  error/offline, colector); excedidos de caudalímetros.
- **API:** validación (duplicados, bomba inexistente, bomba en dos caudalímetros, Real sin
  caudalímetro, sin módulo `caudales`); renombrar/borrar bomba actualiza `bombas`; volumen por
  totalizador, por integral, con totalizador que baja, y bomba propia sin doble conteo.
- **license.js:** nivel A de caudalímetros, `allowed().flowmeters`, test de igualdad de copias.
- **Réplica:** suscribe `weg/flow/+`; `flow_data` en el histórico.
- **Frontend:** build (`tsc -b`) y vista previa en modo demo.
- **Campo (oficina):** TUF-2000SW de la oficina por un PAS600: comunicación, `unitId`, registro 72
  y caudal 0 sin sensor. El `wordOrder` se confirma en la puesta en marcha con caudal real.
- **Instalación:** imagen `edge` en docker-in-docker: arranca, sin caudal configurado no cambia
  nada, con un caudalímetro de prueba sin respuesta se ve OFFLINE.

## 9. Release

v1.4.0. Planta y después oficina con `sudo weg-scada update`.
