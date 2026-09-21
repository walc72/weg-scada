# WEG Modbus Poller

Servicio de sondeo Modbus TCP. Lee los drives WEG (CFW900 / SSW900) y los
medidores (PM8000 / PM7400) por Modbus, publica el estado por **MQTT** (para el
dashboard en vivo) y escribe series temporales en **InfluxDB** (para históricos
y reportes).

- Config: `config.json` (hot-reload al cambiar).
- Entrada principal: [`src/index.js`](src/index.js) — loop de polling y escritura.
- Parsers: [`src/parser.js`](src/parser.js) — mapas de registros por tipo.
- Conexiones: [`src/connections.js`](src/connections.js) — pool de clientes Modbus.

## Cómo se leen los equipos

| Tipo | Conexión | IP en config | Registros |
|------|----------|--------------|-----------|
| **CFW900** (variador) | **Directa** — cada drive es un esclavo Modbus TCP propio | IP del drive (`192.168.10.100‑103`) | bloque de 70 regs desde 0 |
| **SSW900** (soft starter) | **Vía PLC/gateway** — el PLC concentra los datos | IP del **PLC** (`192.168.10.40`) o gateway | bloque de 70 regs desde `regOffset` + estado desde `statusOffset` |
| **PM8000 / PM7400** (medidor) | **Directa** | IP del medidor | mapa ION (`regs` en config) |

## Tipos de gateway (el PLC no trabaja igual que el ADAM)

Un SSW900 llega por una pasarela, y hay **dos tipos** (`gateway.kind`):

| `kind` | Qué es | Cómo se direcciona cada drive |
|--------|--------|-------------------------------|
| **`plc`** | PLC Schneider M241 que **concentra** los SSW en áreas `%MW` | por **slot** (`regOffset`/`statusOffset`); todos comparten IP y unitId |
| **`adam`** | ADAM4572, pasarela **RS‑485↔TCP transparente** | por **Unit ID** propio; cada SSW es un esclavo Modbus (medidas en base 0, estado en Net Id 679) |

La UI muestra los campos según el `kind` del gateway (slots para PLC, Unit ID para
ADAM). El poller es agnóstico: `resolveConn` usa slot→offsets si hay slot, o
`unitId`+offsets del device en caso contrario.

## SSW900 a través del PLC M241 (concentrador Modbus)

Con un gateway **`plc`**, los SSW900 **no exponen Modbus TCP directo** como los
CFW900. Se conectan al **PLC Schneider M241** por su bus (accesorio de red SymbiNet
del SSW). El programa del PLC lee cada SSW900 y **copia su mapa de parámetros a
áreas `%MW` contiguas**, que el poller lee por Modbus TCP.

El poller solo necesita saber, por cada SSW900, **en qué offset del PLC** empieza
su bloque de datos y su bloque de estado:

- **`regOffset`** — inicio del bloque de mediciones (70 registros, "Net Id" 0‑69 del SSW).
- **`statusOffset`** — inicio del bloque de estado (2 palabras: enum de estado + status word).

### Ejemplo real (Agriplus, PLC `192.168.10.40`)

| Drive | `unitId` | `regOffset` | `statusOffset` | Área en el PLC |
|-------|:---:|:---:|:---:|----------------|
| SAER 8 | 1 | `0` | `140` | datos `%MW0‑69`, estado `%MW140+` |
| SAER 5 | 1 | `70` | `152` | datos `%MW70‑139`, estado `%MW152+` |

> El SSW900 de Agrocaraya va por el **Gateway** `192.168.10.70` con `unitId: 4`
> y **sin** offsets (bloque en base 0), porque ese gateway mapea un SSW por unitId.

### Lectura (en [`src/index.js`](src/index.js))

```js
const count = 70;                       // bloque de mediciones
const startAddr = dev.regOffset || 0;   // desplazado por drive dentro del PLC
const regs = await connections.poll(dev.ip, dev.port, dev.unitId, startAddr, count);

// SSW900: además lee 12 regs del bloque de estado
if (dev.type === 'SSW900' && dev.statusOffset != null) {
  statusRegs = await connections.poll(dev.ip, dev.port, dev.unitId, dev.statusOffset, 12);
}
```

### Mapa de registros SSW900 (relativo a `regOffset`, "Net Id" del SSW)

| Net Id | Dato | Escala |
|:---:|------|--------|
| 4 | Tensión de línea (prom) | ÷10 |
| 7 | Tensión de salida (prom) | ÷10 |
| 8 | Factor de potencia | ÷100 |
| 10‑11 | Potencia activa (32 bit) | ÷10 |
| 17 | Frecuencia | ÷10 |
| 24‑25 | Corriente (prom, 32 bit) | ÷10 |
| 42‑43 | Segundos energizado (32 bit) | → horas |
| 44‑45 | Segundos habilitado (32 bit) | → horas |
| 60 | Temperatura SCR | s16 |
| 63 | Temperatura motor Ch1 | s16 |

**Bloque de estado** (relativo a `statusOffset`):

- palabra `0` → **SSW Status** (enum): `0=Ready, 1=InitTest, 2=Fault, 3=RampUp, 4=FullVoltage, 5=Bypass, …`
- palabra `1` → **Status Word** (bitfield): `bit0=running`, `bit1=enabled`, `bit6=bypass`, `bit14=alarma`, `bit15=falla`.

Ver la implementación en [`parseSSW900`](src/parser.js).

## Modelo de datos: slots en el gateway (recomendado)

El mapa de memoria del PLC es una propiedad **del gateway**, no de cada drive.
Por eso los offsets se definen **una sola vez en el gateway** como una tabla de
**slots** (`id → regOffset/statusOffset`), y cada device solo **referencia un
slot** por su `id`:

```jsonc
"gateways": [
  {
    "name": "PLC M241 Agriplus",
    "ip": "192.168.10.40", "port": 502, "site": "Agriplus",
    "kind": "plc",                      // concentrador por offset/slot
    "slots": [
      { "id": 0, "regOffset": 0,  "statusOffset": 140, "label": "SAER 8" },
      { "id": 1, "regOffset": 70, "statusOffset": 152, "label": "SAER 5" }
    ]
  },
  {
    "name": "Gateway Agrocaraya",
    "ip": "192.168.10.70", "port": 502, "site": "Agrocaraya",
    "kind": "adam"                      // RS-485↔TCP: drives por Unit ID
  }
],
"devices": [
  // PLC: referencia un slot del gateway
  { "name": "SAER 8", "type": "SSW900", "site": "Agriplus",
    "ip": "192.168.10.40", "port": 502, "unitId": 1,
    "gateway": "PLC M241 Agriplus", "slot": 0 },
  // ADAM: su propio unitId; medidas en base 0, estado en Net Id 679
  { "name": "SSW900 Agrocaraya", "type": "SSW900", "site": "Agrocaraya",
    "ip": "192.168.10.70", "port": 502, "unitId": 4,
    "gateway": "Gateway Agrocaraya", "statusOffset": 679 }
]
```

El poller resuelve `device.slot → gateway.slots[id] → regOffset/statusOffset`
(ver `resolveConn` en [`src/index.js`](src/index.js)).

> **Fallback / override**: si un device trae `regOffset`/`statusOffset` crudos,
> esos **ganan** sobre el slot (compatibilidad con la config vieja y ajustes
> puntuales).

## Cómo cargar/ajustar los offsets

### Desde la UI (Configuración) — recomendado

1. **Definir los slots en el gateway**: sección **Gateways** → botón **"Slots
   (mapa PLC)"** del gateway. Ahí:
   - **Escanear**: consulta el PLC y detecta los slots; **"Usar estos slots"** los
     guarda en el gateway.
   - **Manual**: **+ Slot** y editar `id / Reg Offset / Status Offset / etiqueta`.
2. **Asociar el device a un slot**: **Agregar Drive** (o editar uno) → tipo
   **SSW900** → elegir el **gateway** y luego el **Slot** del desplegable. El
   device queda con `gateway` + `slot` (sin offsets crudos). En la tabla se ve
   `slot <id>` bajo el Unit.

### Agregar un SSW900 nuevo por el PLC

1. En el **programa del PLC**, asignarle un bloque `%MW` libre para datos (70 regs)
   y una palabra para estado (p.ej. datos `%MW210‑279`, estado `%MW164`).
2. En la UI, agregar ese slot al gateway (Escanear o manual) y crear el device
   eligiendo ese slot. (O en `config.json`: sumar el slot al gateway y el device
   con `gateway` + `slot`.)

## Campos de `config.json` (resumen)

- `pollIntervalMs` — período de sondeo Modbus.
- `influxWriteIntervalMs` — período de escritura a InfluxDB.
- `mqtt` / `influxdb` — brokers y credenciales (el token de Influx se toma de
  `INFLUXDB_TOKEN` del entorno, no de acá).
- `gateways[]` — pasarelas (`name, ip, port, site`, `kind`: `plc`|`adam`). Para
  `plc`: `slots[]` (`id, regOffset, statusOffset, label?`) = mapa de memoria del PLC.
- `devices[]` — drives (`name, type, site, ip, port, unitId`, y para SSW900 vía
  PLC: `gateway` + `slot`; `regOffset`/`statusOffset` opcionales como override).
- `meters[]` — medidores (`regs` = mapa de registros ION; `waveform` para PM7400).
- `alarmSetpoints`, `gaugeZones` — usados por la UI/servicio de alertas.

## Campos escritos a InfluxDB (`drive_data`)

`motor_speed, current, voltage, frequency, power, cos_phi, motor_temp, igbt_temp,
scr_temp, running, state_code, run_hours, comm_errors` (tags: `name, ip, index,
site, type`). Medidores en `meter_data`: `voltage, current, power, pf`.
