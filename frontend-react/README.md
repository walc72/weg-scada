# WEG SCADA — Frontend

Interfaz React del sistema de monitoreo WEG. Servida por nginx (puerto 9090)
detrás del reverse-proxy que expone `/api` (weg-api) y `/mqtt` (Mosquitto).

## Stack

React 18 · Vite · TypeScript · Tailwind · Zustand · Recharts · shadcn/ui

## Datos en vivo

Los datos de drives y medidores llegan por **MQTT sobre WebSocket** (`/mqtt`),
no por polling REST. El store `src/store/drives.ts` mantiene el estado en vivo y
un buffer en memoria de los últimos ~90 puntos (~3 min) para los gráficos de
tiempo real. La REST (`/api`, `src/store/auth.ts` + `config.ts`) se usa para
login, configuración, setpoints, reportes históricos y forma de onda.

## Modos

`VITE_DATA_MODE` (en `.env.production`):
- `mock` — simulador local sin hardware (`src/mock/drives.ts`), para desarrollo.
- `live` — MQTT real + API.

## Estructura

```
src/
├── views/        Dashboard, Historicos, FormaOnda, Reportes, ReporteDiario, Config, Login
├── components/   DriveCard, PM8000Card, HalfGauge, TrendChart, TimeRangePicker + ui/ (shadcn)
├── store/        Zustand: drives (MQTT), config, auth
├── lib/          utils, timeline (merge por timestamp), theme, gaugeDefaults
├── mock/         Simulador para modo mock
└── types.ts      Tipos compartidos (Drive, Meter, AppConfig, WaveformData)
```

## Comandos

```bash
npm install
npm run dev      # servidor de desarrollo
npm run build    # tsc -b && vite build -> dist/ (lo sirve nginx)
npm run lint
```

El build (`dist/`) se monta en el contenedor nginx del stack (ver
`../nodered/docker-compose.yml`).
