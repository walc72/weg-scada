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

## Enlazar una réplica (desde la web)

1. **Planta** → Configuración → Réplicas → **Nueva réplica**: nombre + dirección con la que la réplica
   llega a la planta (se prellena con la IP de Tailscale). Copiar el **código de enlace** (se muestra
   una sola vez).
2. **Oficina** → Configuración → Conexión:
   - Tarjeta **Tailscale** → Conectar → abrir el link o escanear el QR **con la cuenta del tailnet
     correcto** (en una ventana privada si el navegador tiene otra sesión de Tailscale abierta). La
     tarjeta muestra el tailnet en el que quedó.
   - Tarjeta **Planta** → pegar el código → Probar conexión → Guardar y conectar.
3. Revocar: Planta → Réplicas → Revocar. Corta al instante el histórico y la configuración (401).
   **Limitación:** el en vivo (`/mqtt` de planta) es de lectura anónima — lo usa el propio frontend
   sin login — así que una réplica revocada sigue viendo los valores en vivo mientras llegue a la
   planta por la red. Para cortarlo del todo: quitarle la ruta de red (share de Tailscale / firewall).

## Instalar una oficina nueva

1. VM Ubuntu 24.04 con Docker y Tailscale **instalado** (no hace falta loguearlo: se hace desde la web).
2. Copiar el repo a `~/weg-scada`; `.env` a partir de `.env.example` con secretos propios
   (`INFLUXDB_*`, `AUTH_PASSWORD_HASH`, `OPERADOR_PASSWORD_HASH`, `AGENT_TOKEN`) e
   `INFLUXDB_ORG=tecnoelectric`, `INFLUXDB_BUCKET=weg_drives`.
3. `mkdir -p nodered/config && sudo chown -R 1001:65533 nodered/config`
4. Frontend de producción en `frontend-react/dist`.
5. `docker compose -f docker-compose.yml -f docker-compose.replica.yml up -d --build`
6. Entrar como admin y enlazar desde Configuración → Conexión.
7. Estado: `docker logs -f weg-replica` y `docker exec weg-replica wget -qO- http://127.0.0.1:3300/health`.

Heredado: `REPLICA_SOURCE`/`REPLICA_TOKEN` en el `.env` siguen funcionando si no hay enlace guardado
(en planta, `REPLICA_TOKEN` aparece como "Réplica heredada (.env)"; se quita borrándolo del `.env`).
