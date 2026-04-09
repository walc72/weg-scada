# WEG SCADA — Frontend React (v3-react)

SPA en **React 18 + Vite + TypeScript + shadcn/ui + Tailwind CSS**, alternativa a la versión Vue (`frontend/`). Branch independiente: `v3-react`.

## Stack

- React 18 + TypeScript
- Vite 5
- Tailwind CSS + shadcn/ui (Radix primitivos)
- Tremor (KPI cards, opcional)
- Recharts (gauges, trends)
- Zustand (state management)
- React Router 6
- mqtt.js (broker WebSocket)
- Sonner (toasts)
- Lucide React (iconos)

## Desarrollo local

```bash
cd frontend-react
npm install
npm run dev
```

Abre `http://localhost:5173`. Usa **mock data** por defecto (drives + PM8000 simulados cada 2s, sin necesidad de backend).

## Modos

Variable `VITE_DATA_MODE`:

- `mock` (default): datos simulados en memoria
- `mqtt`: se conecta al broker real vía WebSocket en `ws://<host>:9001`

`VITE_MQTT_URL`, `VITE_API_BASE`, `VITE_GRAFANA_HOST` configurables.

## Build / Deploy

```bash
npm run build           # genera dist/
docker build -t weg-frontend-react .
```

## Estructura

```
frontend-react/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx              # bootstrap
    ├── App.tsx               # layout (sidebar + topbar + routes)
    ├── index.css             # tailwind + tema CSS vars
    ├── types.ts              # tipos compartidos
    ├── lib/
    │   ├── theme.tsx         # ThemeProvider light/dark
    │   └── utils.ts          # cn(), fmt()
    ├── store/
    │   ├── drives.ts         # zustand store: mock o MQTT real
    │   └── config.ts         # zustand store: config REST API
    ├── mock/
    │   └── drives.ts         # generador de datos mockeados
    ├── components/
    │   ├── HalfGauge.tsx     # gauge SVG semicircular
    │   ├── Banner.tsx
    │   ├── DriveCard.tsx
    │   ├── PM8000Card.tsx
    │   └── ui/               # shadcn primitives
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── badge.tsx
    │       ├── input.tsx
    │       ├── label.tsx
    │       ├── switch.tsx
    │       ├── select.tsx
    │       ├── dialog.tsx
    │       ├── tabs.tsx
    │       └── table.tsx
    └── views/
        ├── Dashboard.tsx
        ├── Historicos.tsx
        └── Config.tsx
```

## Roadmap

- [x] Fase 0: scaffold + layout + theme toggle
- [x] Fase 1: Dashboard con drives + banner + PM8000
- [x] Fase 2: Históricos (Grafana iframe)
- [x] Fase 3: Configuración con auth + 3 tabs
- [ ] Fase 4: Tests + polish + animaciones
- [ ] Fase 5: Build Docker + deploy a PME-SERVER en paralelo
- [ ] Fase 6: Cutover (v3-react reemplaza v3-spa Vue)
