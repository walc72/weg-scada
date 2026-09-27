# Réplica de oficina

Servidor de solo lectura que muestra el SCADA de planta (en vivo + histórico)
para demos. Diseño: `docs/superpowers/specs/2026-09-27-replica-branding-design.md`.

## Cómo funciona

- Planta (`weg-vm`) expone `/api/replica/*` protegido con `REPLICA_TOKEN`.
- La oficina corre el mismo stack sin `modbus-poller` y con `weg-replica`, que:
  - trae el histórico de InfluxDB por ventanas de 1 h (cursor en el volumen `replica-data`);
  - puentea MQTT `weg/#` de planta al Mosquitto local (en vivo);
  - baja `config.json` y `manual.json` cada 5 min.
- La `weg-api` de oficina corre con `REPLICA_MODE=1`: equipos/setpoints/lluvia-río son solo
  lectura (409); usuarios, correo y marca son locales. Sin alertas ni reporte diario automático.
- La vista Forma de onda no funciona en la réplica (lee el medidor en vivo por Modbus).

## Planta (una vez)

1. Generar token: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   (o `openssl rand -hex 32`).
2. Agregar `REPLICA_TOKEN=<token>` al `.env` de `~/weg-scada/nodered` en la VM.
3. `docker compose up -d --build --no-deps weg-api` (~10 s sin API).
4. Probar: `curl -s -H "Authorization: Bearer <token>" http://127.0.0.1:9090/api/replica/info`

Revocar la oficina = cambiar `REPLICA_TOKEN` y repetir el paso 3.

## Oficina

1. VM Ubuntu 24.04 (2 vCPU, 4 GB, 40 GB) con Docker y Tailscale (tailnet de planta).
2. Copiar el repo a `~/weg-scada`; `.env` en `nodered/` a partir de `.env.example`, con:
   - `INFLUXDB_ORG=tecnoelectric`, `INFLUXDB_BUCKET=weg_drives`, `INFLUXDB_TOKEN`/`INFLUXDB_PASSWORD` nuevos;
   - `AUTH_PASSWORD_HASH` / `OPERADOR_PASSWORD_HASH` propios de la oficina;
   - `REPLICA_SOURCE=http://100.97.47.25:9090`, `REPLICA_TOKEN=<token de planta>`.
3. Frontend: copiar un `dist` de producción (`VITE_DATA_MODE=live`) a `frontend-react/dist`.
4. Primer arranque (weg-api necesita `config.json`):
   ```bash
   C="docker compose -f docker-compose.yml -f docker-compose.replica.yml"
   $C up -d --build influxdb mosquitto weg-replica
   until [ -s config/config.json ]; do sleep 5; done
   $C up -d --build
   ```
5. Ver estado: `docker logs -f weg-replica` y
   `docker exec weg-replica wget -qO- http://127.0.0.1:3300/health`.
