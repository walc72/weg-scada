# WEG SCADA

Sistema de monitoreo industrial para variadores WEG CFW900 y SSW900 via Modbus TCP.  
Desarrollado para Agriplus / Agrocaraya.

---

## Stack

| Servicio | Descripcion |
|----------|-------------|
| **weg-api** | API REST + SSE (Node.js/Express) |
| **modbus-poller** | Lector Modbus TCP -> InfluxDB |
| **InfluxDB** | Base de datos de series de tiempo |
| **Grafana** | Dashboards historicos |
| **Mosquitto** | Broker MQTT para alertas |
| **Nginx** | Servidor frontend + reverse proxy API |

---

## Requisitos

- Docker + Docker Compose v2
- Node.js 18+ (solo para build del frontend)
- Tailscale instalado en el host (para acceso a red industrial)

---

## Instalacion en Linux (VPS)

### 1. Clonar el repositorio

```bash
git clone https://github.com/walc72/weg-scada.git
cd weg-scada
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

### 4. Crear directorio de config con permisos

```bash
mkdir -p nodered/config
cp nodered/weg-modbus-poller/config.json nodered/config/config.json
chown -R 1001:65533 nodered/config/
```

### 5. Levantar el stack

```bash
cd nodered
docker compose up -d
```

### 6. Verificar

```bash
docker compose ps
```

Acceder en: `http://<ip-servidor>:9090`

---

## Instalacion en Windows (Docker Desktop)

En Windows, Docker Desktop con WSL2 tiene restricciones de permisos en bind mounts.
Se requiere una configuracion especial para que el config.json sea escribible.

### 1. Clonar el repositorio

```powershell
git clone https://github.com/walc72/weg-scada.git
cd weg-scada
```

### 2. Configurar variables de entorno

```powershell
copy nodered\.env.example nodered\.env
```

Editar `nodered\.env` con los tokens y credenciales.

### 3. Build del frontend

```powershell
cd frontend-react
npm install
npx vite build
cd ..
```

### 4. Preparar config en WSL

Docker Desktop en Windows no permite escritura en bind mounts de rutas Windows (`C:\...`).
La solucion es montar el config desde una ruta WSL:

```powershell
# Crear directorio dentro de WSL
wsl -e sh -c "mkdir -p /home/wegconfig && chmod 777 /home/wegconfig"

# Copiar config.json
type nodered\weg-modbus-poller\config.json | wsl -e sh -c "cat > /home/wegconfig/config.json"
```

### 5. Modificar docker-compose.yml

Cambiar los bind mounts de config en `weg-api` y `modbus-poller`:

```yaml
# ANTES (Linux)
- ./config:/app/config

# DESPUES (Windows)
- /home/wegconfig:/app/config
```

### 6. Desactivar Docker credential store

Docker Desktop bloquea pulls via SSH. Si se necesita acceso remoto:

```powershell
# En $env:USERPROFILE\.docker\config.json cambiar a:
{"auths":{}}
```

### 7. Levantar el stack

```powershell
cd nodered
docker compose up -d
```

### 8. Si la imagen weg-api no hace build (error de credenciales)

Exportar la imagen desde un servidor Linux donde funcione:

```bash
# En el servidor Linux
docker save nodered-weg-api nodered-modbus-poller | gzip > weg-images.tar.gz
```

```powershell
# En Windows
docker load -i weg-images.tar.gz
```

Si la imagen no tiene el CMD correcto despues de importar, agregar en docker-compose.yml:

```yaml
weg-api:
  command: ["node", "src/server.js"]
```

---

## Actualizar

### Linux

```bash
cd weg-scada
git pull

# Rebuild frontend
cd frontend-react && npm install && npx vite build && cd ..

# Rebuild y reiniciar containers
cd nodered
docker compose build
docker compose up -d
```

### Windows

```powershell
cd weg-scada
git pull

# Rebuild frontend
cd frontend-react
npm install
npx vite build
cd ..

# Si se puede hacer build (Docker Desktop con sesion grafica)
cd nodered
docker compose build
docker compose up -d

# Si NO se puede hacer build (via SSH), importar imagenes desde Linux
# Ver seccion "Instalacion en Windows" paso 8
```

---

## Estructura del proyecto

```
weg-scada/
|-- frontend-react/          # Interfaz React + Vite
|   |-- src/
|   |   |-- views/           # Dashboard, Config, Historicos, Reportes
|   |   |-- store/           # Zustand stores (auth, config, drives)
|   |   +-- types.ts         # Tipos TypeScript
|   +-- dist/                # Build de produccion (generado)
|-- nodered/
|   |-- docker-compose.yml
|   |-- .env.example
|   |-- config/              # config.json (dispositivos, gateways, zonas)
|   |-- weg-api/             # API REST Node.js
|   |   +-- src/
|   |       |-- server.js
|   |       |-- routes/
|   |       +-- services/
|   |-- weg-modbus-poller/   # Poller Modbus -> InfluxDB
|   |   +-- src/
|   |       |-- index.js
|   |       |-- parser.js    # Parse CFW900 / SSW900
|   |       +-- connections.js
|   |-- nginx/               # Configuracion Nginx
|   +-- grafana/             # Dashboards Grafana
+-- README.md
```

---

## Dispositivos soportados

### CFW900 - IP directa

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

### SSW900 via PLC M241 - Reg Offset

Multiples drives comparten la IP del PLC. Se diferencian por `regOffset` y `statusOffset`.
El sistema incluye un boton "Escanear Gateway" que detecta automaticamente que slots tienen drives.

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

```
Mediciones (70 registros por drive):
  Slave2_MW AT %MW0   : ARRAY[0..69]   -> regOffset = 0
  Slave3_MW AT %MW70  : ARRAY[0..69]   -> regOffset = 70

Estados (12 registros por drive):
  Slave2_Status AT %MW140 : ARRAY[0..11] -> statusOffset = 140
  Slave3_Status AT %MW152 : ARRAY[0..11] -> statusOffset = 152
```

| Drive | regOffset | statusOffset |
|-------|-----------|--------------|
| SAER 5 (Slave2) | 0 | 140 |
| SAER 8 (Slave3) | 70 | 152 |

### SSW900 via ADAM4572 - Unit ID

Cada drive tiene su propio Unit ID Modbus en el bus RS-485.
Los registros de estado se leen desde la direccion 0x02A7 (679 decimal).

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

### Registros SSW900

Mediciones (regOffset + 0 a 69):

| Registro | Variable | Factor |
|----------|----------|--------|
| 4 | Tension linea | /10 |
| 7 | Tension salida | /10 |
| 8 | Factor de potencia | /100 |
| 10-11 | Potencia activa (32bit) | /10 |
| 17 | Frecuencia | /10 |
| 24-25 | Corriente (32bit) | /10 |
| 42-43 | Horas energizado (32bit) | /3600 |
| 44-45 | Horas habilitado (32bit) | /3600 |
| 60 | Temperatura SCR | signed |
| 63 | Temperatura motor | signed |

Estados (statusOffset + 0 a 11):

| Registro | Variable |
|----------|----------|
| 0 | SSW Status (READY/FAULT/RAMP_UP...) |
| 1 | Status Word (bits: running, fault, alarma) |

---

## Red industrial (Tailscale)

Los dispositivos industriales estan en redes privadas accesibles via Tailscale:

| Red | Dispositivos |
|-----|-------------|
| 192.168.10.x | CFW900, PLC M241, ADAM4572 |
| 192.168.11.x | Regulador Toshiba ES-55259 |
| 192.168.20.x | Reconectador Schneider ADVC |

Instalacion de Tailscale en el host:

```bash
# Linux
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --accept-routes --accept-dns=false

# Windows
# Descargar e instalar desde https://tailscale.com/download
```

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

**HTTP 502 al cargar configuracion**

Nginx cacho la IP vieja de weg-api. Reiniciar:

```bash
docker compose restart weg-frontend
```

El nginx ya tiene `resolver 127.0.0.11 valid=10s` para re-resolver DNS dinamicamente.

**HTTP 500 al guardar configuracion**

Error de permisos en config.json.

Linux:
```bash
chown -R 1001:65533 nodered/config/
```

Windows: verificar que el config esta montado desde WSL (`/home/wegconfig`), no desde `C:\`.

**No llega a los dispositivos industriales**

```bash
tailscale status
ping 192.168.10.40
```

**Ver logs**

```bash
docker compose logs -f weg-api
docker compose logs -f modbus-poller
```

**Docker build falla en Windows via SSH (error de credenciales)**

Docker Desktop usa el credential manager de Windows que no funciona sin sesion grafica.
Soluciones:
1. Hacer build desde la sesion grafica (AnyDesk/RDP)
2. Exportar imagenes desde un servidor Linux con `docker save | gzip`
3. Deshabilitar credential store en `~/.docker/config.json`

---

## Pendientes

- Integracion de reconectadores Schneider ADVC (192.168.20.5) - Modbus TCP
- Integracion de regulador de tension Toshiba ES-55259 (192.168.11.7) - Modbus TCP
- Mapas de registros Modbus de ambos equipos pendientes
