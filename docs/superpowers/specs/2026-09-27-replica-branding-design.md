# Réplica de oficina + branding configurable — Diseño

Fecha: 2026-09-27 · Estado: aprobado en conversación, pendiente revisión de la spec escrita

## 1. Objetivo

1. **Réplica de oficina:** tener en un servidor de la oficina (Proxmox + Tailscale) el mismo SCADA
   que corre en planta (VM `weg-vm` sobre PME-SERVER, `100.97.47.25`), con **datos en vivo e
   histórico real**, para mostrarlo a clientes. Solo lectura respecto de la planta.
2. **Branding configurable:** desde Configuración, cambiar el **logo**, el **nombre** y el
   **subtítulo** que se muestran en el login, y que los **reportes PDF** usen el logo configurado.

### Criterios de éxito

- El dashboard de la oficina se mueve en tiempo real con los datos de planta (atraso < 5 s).
- Reportes, históricos y reporte diario de la oficina coinciden con los de planta.
- Si la oficina se apaga o se corta el enlace, al volver se pone al día sin huecos.
- La VM de planta no depende de la oficina ni se degrada por ella.
- Cada servidor muestra su propio logo/nombre; sin configurar, todo queda como hoy.

### Fuera de alcance

- Anonimización/renombrado de equipos para demos (el diseño lo permite a futuro, no se hace ahora).
- Replicar usuarios, SMTP, alertas por mail o branding (son locales a cada servidor).
- Escritura desde la oficina hacia la planta (setpoints, config): la oficina es solo lectura.

## 2. Arquitectura

```
 PLANTA (weg-vm, 100.97.47.25)                       OFICINA (Proxmox → VM "weg-demo")
 ┌───────────────────────────────────────┐            ┌──────────────────────────────────────┐
 │ modbus-poller → InfluxDB + Mosquitto   │            │ weg-replica (reemplaza al poller)    │
 │ weg-api                                │◄── HTTP ───│  ├ pull histórico  → InfluxDB local  │
 │  └ /api/replica/*  (REPLICA_TOKEN)     │  Tailscale │  ├ pull config/manual → archivos     │
 │ nginx :9090  /mqtt (ws, solo lectura)  │◄── WS ─────│  └ MQTT en vivo    → Mosquitto local │
 └───────────────────────────────────────┘            │ weg-api (REPLICA_MODE=1) + frontend  │
                                                       └──────────────────────────────────────┘
```

- Modelo **pull**: la oficina pide, la planta solo responde GETs y la suscripción MQTT de solo
  lectura que ya existe. La planta no conoce a la oficina.
- La oficina corre el mismo `docker-compose` con el perfil `replica`: sin `modbus-poller`, con
  `weg-replica`. Frontend, weg-api, InfluxDB y Mosquitto son los mismos.
- Se replica: config de equipos (`config.json`), datos manuales (`manual.json`), histórico de
  InfluxDB (`drive_data`, `meter_data`), telemetría MQTT `weg/#`.
- No se replica: usuarios, SMTP, alertas por mail, branding.

## 3. API de réplica (weg-api, planta)

Nuevo router `weg-api/src/routes/replica.js`, montado en `/api/replica` **antes** de `requireAuth`
en `server.js`, con su propio middleware:

- Auth: `Authorization: Bearer <REPLICA_TOKEN>`, comparación timing-safe (`crypto.timingSafeEqual`
  sobre hashes de igual largo, como el login).
- `REPLICA_TOKEN` vacío o ausente → el router responde **404** a todo (función apagada por defecto).
- Token faltante o incorrecto → **401**. Se aplica el mismo rate limit por IP que el login.

| Endpoint | Respuesta |
|---|---|
| `GET /api/replica/info` | JSON `{ version, bucket, oldest, newest }` (timestamps ISO del primer/último punto) |
| `GET /api/replica/config` | `config.json` completo |
| `GET /api/replica/manual` | `manual.json` (`{}` si no existe) |
| `GET /api/replica/points?since=<ISO>&windowSec=<n>` | `text/plain` en line protocol + headers `X-Next-Cursor`, `X-More` |

### `/points` (paginado por ventana de tiempo)

- Rango Flux `range(start: since, stop: stop)` — `start` inclusivo, `stop` exclusivo — con
  `stop = min(since + windowSec, now − 10s)` (no servir el último ciclo del poller, puede estar a medias).
- `windowSec` por defecto 3600, máximo 86400.
- Measurements: `drive_data`, `meter_data`. Se agrupan los campos del mismo punto (measurement +
  tags + `_time`) en una línea, ordenadas por `_time`.
- `X-Next-Cursor` = `stop` (ISO). Como `stop` es exclusivo y el siguiente `since` inclusivo, no hay
  huecos ni solapamiento, y nunca se parte un timestamp entre páginas.
- `X-More: 1` si `stop < now − 10s` (quedan ventanas por traer); `0` si ya está al día.
- `since >= now − 10s` → cuerpo vacío, cursor sin cambios, `X-More: 0`. `since` inválido → 400.
- Los valores se leen del CSV anotado de Influx (`#datatype`) **sin redondeo** y respetando el tipo
  de cada campo (double / long `i` / boolean / string). `reports.queryInflux` NO sirve para esto:
  redondea a 2 decimales.
- Escribir dos veces el mismo punto en Influx sobrescribe (idempotente) → los reintentos son seguros.
- La config servida por `/config` no incluye `influxdb.token`.

## 4. Servicio `weg-replica` (oficina)

Directorio nuevo `nodered/weg-replica/` (Node 20, misma estructura y Dockerfile non-root que el
poller). Variables: `REPLICA_SOURCE` (ej. `http://100.97.47.25:9090`), `REPLICA_TOKEN`, más las de
InfluxDB/MQTT locales que ya usa el poller.

Tres tareas independientes (la falla de una no frena a las otras):

1. **Histórico**
   - Cursor persistido en volumen: `/data/cursor.json`. Si no existe → `GET /info` y arranca desde
     `oldest − 1ns`.
   - Bucle: `GET /points?since=cursor` → escribe el cuerpo tal cual en InfluxDB local (API de
     escritura, precisión ns) → guarda el cursor **después** de escribir OK.
   - `X-Page-Full: 1` → pide la siguiente página enseguida; si no → espera 30 s.
   - Errores de red/5xx → backoff exponencial 5 s → 5 min. 401 → log de error y reintento cada 5 min.
2. **En vivo**
   - Cliente MQTT por WebSocket a `REPLICA_SOURCE` + `/mqtt`, suscripción `weg/#`.
   - Cada mensaje se republica en el Mosquitto local (`mqtt://mosquitto:1883`) con el mismo topic y
     payload, **siempre con `retain=true`**: todo `weg/#` es retained en el poller de planta, pero el
     flag retain solo viaja en los mensajes retenidos iniciales; sin forzarlo, el broker local
     quedaría con el estado del momento de la conexión. Se ignoran los topics `weg/replica/*`.
     Reconexión automática del cliente MQTT.
3. **Config y manual**
   - Cada 5 min: `GET /config` y `GET /manual`; se reescriben `config/config.json` y
     `config/manual.json` locales solo si el contenido cambió (escritura atómica: tmp + rename).
   - El bloque `influxdb` de la config local (si existe) se conserva: url/org/bucket son de cada
     instalación.
   - La `weg-api` de la oficina necesita un `config.json` para arrancar: en el primer despliegue se
     levanta `weg-replica` primero y se espera a que baje la config.

**Estado:** cada 10 s publica en `weg/replica/status` (retain) `{ lastSync, lagSec, live, error }`
y expone `GET /health` (puerto interno) para el healthcheck del contenedor.

## 5. Modo réplica en weg-api y frontend (oficina)

- `REPLICA_MODE=1` en weg-api:
  - Escrituras de config de equipos, setpoints y `manual` → **409** `"Servidor réplica — los
    cambios se hacen en planta"`.
  - Envío de alertas por mail desactivado.
  - Usuarios, SMTP y branding siguen editables.
  - `GET /api/me` incluye `replica: true|false`.
- Frontend:
  - Si `replica: true`, las secciones de Configuración de equipos/setpoints se muestran solo
    lectura con un aviso.
  - Etiqueta discreta en el header "Réplica · sincronizado hace N s" (lee `weg/replica/status`).
  - Si el enlace se cae, los datos quedan stale y aparece el banner "RECONECTANDO" existente.

## 6. Branding configurable (ambos servidores)

- **Almacenamiento:** servicio propio `services/branding.js`, archivo `config/branding.json`
  (junto a `settings.json`), local a cada servidor: `{ name, subtitle, logoFile }`. Logo guardado
  como archivo `config/branding-logo.(png|jpg)` en el mismo volumen.
- El router de branding se monta **antes** del `express.json` global (límite 1 MB) porque el PUT
  trae el logo en base64 (hasta ~1,4 MB); tiene su propio parser de 2 MB, aplicado después de
  autenticar.
- **Formatos:** PNG o JPG, máx. 1 MB (pdfkit no soporta SVG). Se valida por magic bytes, no solo
  por MIME declarado.
- **API:**
  - `GET /api/branding` — **público** (el login lo necesita antes de autenticarse):
    `{ name, subtitle, logoUrl }`.
  - `GET /api/branding/logo` — público, sirve la imagen (o el `agriplus.png` por defecto),
    con `Cache-Control` corto + ETag.
  - `PUT /api/branding` — `requireAdmin`; body JSON `{ name?, subtitle?, logo?: base64 }`
    (límite de body de esta ruta ~2 MB). `DELETE /api/branding` → restaura por defecto.
- **Defaults:** nombre "Planta de Bombeo", subtítulo actual del login, logo `agriplus.png`.
  Sin configurar, todo queda idéntico a hoy.
- **Frontend:**
  - Store/hook `useBranding` que carga `/api/branding` al iniciar (también sin sesión).
  - Login: logo, nombre y subtítulo en el panel de marca y en la variante mobile.
  - Header (`App.tsx`): logo configurado.
  - `document.title` = nombre.
  - Configuración: sección nueva **"Marca"** (solo admin): nombre, subtítulo, carga de logo con
    vista previa, "Restaurar por defecto".
  - "Powered by Tecno Electric S.A." queda fijo.
- **PDF:** `services/reports.js` usa el logo configurado en lugar de `agriplus.png` fijo
  (ambas ocurrencias), con fallback al por defecto si el archivo no existe o falla.

## 7. Despliegue

- **Oficina:** VM Ubuntu 24.04 en Proxmox (2 vCPU, 4 GB RAM, 40 GB), Docker + Tailscale vía
  cloud-init (mismo esquema que `weg-vm`). VM y no LXC (Docker en LXC requiere nesting/privilegiado).
  Repo + `.env` fresco con `REPLICA_SOURCE`, `REPLICA_TOKEN` y `INFLUXDB_ORG`/`INFLUXDB_BUCKET`
  iguales a planta (`tecnoelectric` / `weg_drives`);
  `docker compose -f docker-compose.yml -f docker-compose.replica.yml up -d`. El override
  desactiva `modbus-poller` (`profiles: ["disabled"]`), agrega `weg-replica` y pone
  `REPLICA_MODE=1` + `DAILY_REPORT_ENABLED=false` en weg-api. El compose de planta no cambia de uso.
- Limitación conocida: la vista **Forma de onda** lee el PM7400 en vivo vía el poller; en la réplica
  no hay poller, así que esa vista muestra error. Se acepta (fuera de alcance).
- **Planta:** agregar `REPLICA_TOKEN` (aleatorio, 32+ bytes) al `.env` de la VM y
  `docker compose up -d --build --no-deps weg-api` (~10 s de corte de API). **Requiere OK explícito
  del usuario en el momento.**
- Revocar acceso de la oficina = cambiar `REPLICA_TOKEN` en planta.

## 8. Pruebas

- **Unitarias (weg-api):** auth del router (sin token configurado → 404, token malo → 401, ok → 200);
  paginado de `/points` (ventana, `X-Next-Cursor`/`X-More`, borde `now − 10s`, `since` inválido →
  400); conversión CSV anotado → line protocol (tipos, escapes, sin redondeo); modo réplica (PUT config/setpoints/manual → 409); branding (validación
  de formato/tamaño, default, restaurar).
- **Unitarias (weg-replica):** el cursor solo avanza tras escritura OK; backoff; republicación MQTT
  con `retain`; escritura de config solo si cambió.
- **Punta a punta (stack local WSL como "planta" + contenedores descartables Influx/Mosquitto/
  weg-replica como "oficina"; después, planta real → VM de oficina):** sync completo
  y comparación de conteo de puntos y primer/último timestamp; mismo reporte diario en ambos;
  corte simulado (parar `weg-replica` 10 min, levantar, verificar sin huecos).
- **Branding:** cambiar logo/nombre/subtítulo, verificar login (desktop y mobile), header, título
  de pestaña y PDF generado.
