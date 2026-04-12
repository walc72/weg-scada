# WEG SCADA

Sistema de monitoreo industrial para variadores WEG CFW900 y SSW900 vía Modbus TCP.  
Desarrollado para Agriplus / Agrocaraya.

---

## Stack

| Servicio | Descripción |
|----------|-------------|
| **weg-api** | API REST + SSE (Node.js/Express) |
| **modbus-poller** | Lector Modbus TCP → InfluxDB |
| **InfluxDB** | Base de datos de series de tiempo |
| **Grafana** | Dashboards históricos |
| **Mosquitto** | Broker MQTT para alertas |
| **Nginx** | Servidor frontend + reverse proxy API |

---

## Requisitos

- Docker + Docker Compose v2
- Node.js 18+ (solo para build del frontend)
- Tailscale instalado en el host (para acceso a red industrial 192.168.10.x / 192.168.11.x / 192.168.20.x)

---

## Instalación desde cero

### 1. Clonar el repositorio

```bash
git clone https://github.com/walc72/weg-scada.git
cd weg-scada
git checkout feature/auth-login
```

### 2. Configurar variables de entorno

```bash
cp nodered/.env.example nodered/.env
```

Editar `nodered/.env`:

```env
INFLUXDB_TOKEN=tu_token_aqui
INFLUXDB_ORG=agriplus
INFLUXDB_BUCKET=weg
INFLUXDB_URL=http://influxdb:8086
MQTT_BROKER=mqtt://mosquitto:1883
```

### 3. Build del frontend

```bash
cd frontend-react
npm install
npx vite build
cd ..
```

### 4. Levantar el stack

```bash
cd nodered
docker compose up -d
```

### 5. Verificar

```bash
docker compose ps
```

Acceder en: `http://<ip-servidor>:9090`

---

## Actualizar desde versión anterior

```bash
git pull
git checkout feature/auth-login

# Rebuild frontend
cd frontend-react
npm install
npx vite build
cd ..

# Rebuild y reiniciar containers
cd nodered
docker compose build
docker compose up -d
```

---

## Estructura del proyecto

```
weg-scada/
├── frontend-react/          # Interfaz React + Vite
│   ├── src/
│   │   ├── views/           # Dashboard, Config, Históricos, Reportes
│   │   ├── store/           # Zustand stores (auth, config, drives)
│   │   └── types.ts         # Tipos TypeScript
│   └── dist/                # Build de producción (generado)
├── nodered/
│   ├── docker-compose.yml
│   ├── .env.example
│   ├── config/              # config.json (dispositivos, gateways, zonas)
│   ├── weg-api/             # API REST Node.js
│   │   └── src/
│   │       ├── server.js
│   │       ├── routes/
│   │       └── services/
│   ├── weg-modbus-poller/   # Poller Modbus → InfluxDB
│   │   └── src/
│   │       ├── index.js
│   │       ├── parser.js    # Parse CFW900 / SSW900
│   │       └── connections.js
│   ├── nginx/               # Configuración Nginx
│   └── grafana/             # Dashboards Grafana
└── README.md
```

---

## Dispositivos soportados

### CFW900 — IP directa
Cada drive tiene su propia IP Modbus TCP.

```json
{
  "name": "SAER 1",
  "type": "CFW900",
  "ip": "192.168.10.100",
  "port": 502,
  "unitId": 1
}
```

### SSW900 via PLC M241 — Reg Offset
Múltiples drives comparten la IP del PLC, diferenciados por `regOffset` y `statusOffset`.

```json
{
  "name": "SAER 5",
  "type": "SSW900",
  "ip": "192.168.10.40",
  "port": 502,
  "unitId": 1,
  "regOffset": 0,
  "statusOffset": 140
}
```

Mapa de memoria PLC M241:
| Drive | regOffset | statusOffset |
|-------|-----------|--------------|
| Slave2 (SAER 5) | 0 | 140 |
| Slave3 (SAER 8) | 70 | 152 |

### SSW900 via ADAM4572 — Unit ID
Cada drive tiene su propio Unit ID Modbus en el bus RS-485.

```json
{
  "name": "SSW900 Agrocaraya",
  "type": "SSW900",
  "ip": "192.168.10.70",
  "port": 502,
  "unitId": 4,
  "statusOffset": 679
}
```

---

## Acceso y contraseñas

| Acceso | Usuario | Contraseña |
|--------|---------|------------|
| App SCADA | admin | WegScada2024! |
| Configuración | — | Agriplus00.. |
| Grafana | admin | (configurado en .env) |

---

## Red industrial (Tailscale)

Los dispositivos industriales están en redes privadas accesibles vía Tailscale:

| Red | Dispositivos |
|-----|-------------|
| 192.168.10.x | CFW900, PLC M241, ADAM4572 |
| 192.168.11.x | Regulador Toshiba ES-55259 |
| 192.168.20.x | Reconectador Schneider ADVC |

Tailscale debe estar instalado en el host del servidor con `--accept-routes`.

---

## Puertos

| Puerto | Servicio |
|--------|---------|
| 9090 | Frontend (Nginx) |
| 3200 | weg-api (interno) |
| 8086 | InfluxDB (interno) |
| 3000 | Grafana |
| 1883 | MQTT Mosquitto (interno) |

---

## Troubleshooting

**HTTP 502 al cargar configuración**
```bash
docker compose restart weg-api
```

**No llega a los dispositivos industriales**
```bash
tailscale status
ping 192.168.10.40
```

**Error de permisos en config.json**
```bash
chown -R 1001:65533 /opt/weg-scada/nodered/config/
```

**Ver logs del poller**
```bash
docker compose logs -f modbus-poller
```
