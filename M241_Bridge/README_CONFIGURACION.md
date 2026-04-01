# M241 Serial Line Bridge - Agriplus

## Configuracion del PLC TM241CEC24T como Gateway Modbus TCP -> RTU

### Arquitectura
```
Node-RED (Modbus TCP Client)
    |
    | TCP port 502
    v
M241 PLC (192.168.10.50)
    |
    | RS-485 Modbus RTU Master @ 19200 8E1
    v
+-- SSW900 #1 (Slave ID: 5)
+-- SSW900 #2 (Slave ID: 6)
```

### Requisitos
- EcoStruxure Machine Expert v2.0+
- PLC: TM241CEC24T (o TM241CE24T)
- Cable USB Mini-B para primera descarga
- Cable RS-485 (A+, B-, GND) hacia SSW900s

---

## Paso a Paso en Machine Expert

### 1. Crear Proyecto Nuevo
1. File > New Project > Standard Project
2. Device: **Schneider Electric > TM241CEC24T**
3. Programming Language: Structured Text (no importa, no se programa)
4. Nombre: `M241_Bridge_Agriplus`

### 2. Configurar IP Ethernet
1. En el arbol del proyecto, expandir **MyController > Ethernet_1**
2. Doble click en **Ethernet_1**
3. Tab **General**:
   - IP Address: `192.168.10.50`
   - Subnet Mask: `255.255.255.0`
   - Default Gateway: `192.168.10.1`
4. Tab **Modbus TCP Slave/Server**:
   - **Habilitar** "Modbus TCP Slave"
   - Unit ID: `255`
   - Puerto: `502`
   - Max Connections: `5`

### 3. Configurar Puerto Serial (SL1)
1. En el arbol: **MyController > Serial_Line_1** (SL1)
2. Doble click para configurar
3. Tab **General**:
   - Physical Interface: **RS-485**
   - Protocol: **Modbus**
   - Mode: **Master**
4. Tab **Serial Line Configuration**:
   - Baud Rate: **19200**
   - Data Bits: **8**
   - Parity: **Even**
   - Stop Bits: **1**
   - Response Timeout: **1000 ms**
   - Delay Between Frames: **50 ms**

### 4. Agregar Dispositivos Esclavos RTU
1. Click derecho en **Serial_Line_1** > Add Device
2. Seleccionar: **Modbus Serial Device** (Generic Modbus Slave)

#### SSW900 #1:
- Name: `SSW900_1`
- Slave Address: **5**
- Tab "Modbus Slave Channel":
  - Add channel: Read Holding Registers
    - Start Address: 0
    - Quantity: 30
    - Scan Rate: 2000 ms (2 segundos)

#### SSW900 #2:
- Name: `SSW900_2`
- Slave Address: **6**
- Tab "Modbus Slave Channel":
  - Add channel: Read Holding Registers
    - Start Address: 0
    - Quantity: 30
    - Scan Rate: 2000 ms

### 5. Habilitar Gateway Mode (IO Scanner Passthrough)
**IMPORTANTE**: Para que el M241 actue como bridge transparente:

1. En **Ethernet_1 > Modbus TCP Slave Device**
2. Habilitar: **"Allow Modbus TCP to Serial Line routing"**
   (En algunas versiones: "Enable Modbus Routing" o "IO Scanner")
3. Esto permite que peticiones TCP con Unit ID 5 o 6 se reenvien automaticamente por SL1

> **Nota**: Con el routing habilitado, Node-RED envia `Read Holding Registers` al PLC en TCP con `Unit ID = 5`, y el PLC automaticamente lo traduce a RTU y lo envia por RS-485 al esclavo con direccion 5.

### 6. Descargar al PLC
1. Conectar USB Mini-B al PLC
2. Communication > Scan Network
3. Seleccionar el PLC detectado
4. Login > Download
5. Start (Run)

---

## Verificacion

### Test desde Node-RED
El flujo actual ya tiene los nodos configurados:
- `weg_mb_cfg_5`: TCP a 192.168.10.50:502, Unit ID 5 (SSW900 #1)
- `weg_mb_cfg_6`: TCP a 192.168.10.50:502, Unit ID 6 (SSW900 #2)

### Test Manual (desde PC en la misma red)
```bash
# Leer 10 registros del SSW900 #1 (slave 5) a traves del PLC
modpoll -m tcp -a 5 -r 1 -c 10 192.168.10.50

# Leer 10 registros del SSW900 #2 (slave 6)
modpoll -m tcp -a 6 -r 1 -c 10 192.168.10.50
```

---

## Cableado RS-485

### Pinout del M241 (SL1 - Conector RJ45)
| Pin | Senal   |
|-----|---------|
| 4   | D1 (B-) |
| 5   | D0 (A+) |
| 8   | GND     |

### Conexion en Daisy-Chain
```
M241 SL1 ----[RS-485 Bus]---- SSW900 #1 ---- SSW900 #2
  A+ (pin5) ─────────────────── A+ ──────────── A+
  B- (pin4) ─────────────────── B- ──────────── B-
  GND (pin8) ────────────────── GND ─────────── GND
                                              [120 ohm]
                                              termination
```

### Configuracion SSW900 (parametros del drive)
| Parametro | SSW900 #1 | SSW900 #2 | Descripcion |
|-----------|-----------|-----------|-------------|
| P0310     | 5         | 6         | Slave Address |
| P0311     | 3         | 3         | Baud Rate (3=19200) |
| P0312     | 1         | 1         | Parity (1=Even) |
| P0313     | 0         | 0         | Stop Bits (0=1 bit) |
| P0314     | 0         | 0         | Protocol (0=Modbus RTU) |

---

## SSW900 - Mapa de Registros Modbus
| Registro | Descripcion | Unidad |
|----------|-------------|--------|
| 0        | Status Word | bitmap |
| 1        | Motor Speed | RPM |
| 2        | Motor Current | A x10 |
| 3        | Motor Voltage | V |
| 4        | Motor Frequency | Hz x10 |
| 5        | Motor Power | kW x10 |
| 6        | Motor Temperature | C x10 |
| 7        | Heatsink Temperature | C x10 |
| 10       | Active Fault Code | - |
| 11       | Active Alarm Code | - |
| 20       | Start Count | - |
| 21       | Hours Running (LSW) | hours |
| 22       | Hours Running (MSW) | hours |

### Status Word (Registro 0) - Bit Map
| Bit | Descripcion |
|-----|-------------|
| 0   | Ready |
| 1   | Running |
| 2   | Fault |
| 3   | Alarm |
| 4   | At Speed |
| 5   | Bypass Closed |
| 6   | Motor Starting |
| 7   | Motor Stopping |
