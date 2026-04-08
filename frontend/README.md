# WEG SCADA Frontend (v3-spa)

Vue 3 + Vite + Vuetify SPA. Reemplazo progresivo del dashboard Node-RED.

## Desarrollo local

```bash
npm install
npm run dev
```

Abre `http://localhost:5173`. Hot reload activo.

## Build / Deploy con Docker

Desde la raíz del repo:

```bash
docker compose -f nodered/docker-compose.yml build weg-frontend
docker compose -f nodered/docker-compose.yml up -d weg-frontend
```

Disponible en `http://<host>:1881`. Node-RED sigue corriendo en `:1880` en paralelo.

## Estructura

```
frontend/
├── package.json          # deps (vue, vuetify, mqtt, vue-router, pinia)
├── vite.config.js        # Vite + Vuetify auto-import
├── index.html            # entry HTML
├── nginx.conf            # SPA fallback + proxy /api → weg-api
├── Dockerfile            # multi-stage build
└── src/
    ├── main.js           # bootstrap
    ├── App.vue           # layout principal (sidebar + topbar)
    ├── router/index.js   # rutas
    └── views/
        ├── Dashboard.vue
        ├── Historicos.vue
        └── Config.vue
```

## Conexiones

- **REST API**: `/api/*` → `weg-api:3200` (proxy nginx)
- **MQTT WS**: `/mqtt` → `weg-mosquitto:9001` (proxy nginx)
- **Grafana**: iframe directo a `:3000` (TBD)

## Roadmap

- [x] Fase 0: esqueleto + layout
- [ ] Fase 1: auth real con JWT
- [ ] Fase 2: cards de drives + MQTT subscribe
- [ ] Fase 3: banner + PM8000 card
- [ ] Fase 4: históricos (Grafana embed)
- [ ] Fase 5: forms de configuración
- [ ] Fase 6: polish + tests visuales
- [ ] Fase 7: cutover (1880 → SPA)
