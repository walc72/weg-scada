# Conexión desde Configuración (Tailscale, réplicas y enlace) — Diseño

Fecha: 2026-09-27 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Depende de: `2026-09-27-replica-branding-design.md` (rama `feat/replica-branding`, PR #54)

## 1. Objetivo

Que la conexión entre planta y réplicas se arme y opere **desde Configuración**, sin SSH:

1. **Tailscale desde la web** (planta y oficina): ver estado, conectar con link de aprobación + QR,
   desconectar.
2. **Planta:** registrar réplicas con **código de enlace** (un token por réplica), listarlas con su
   última conexión y **revocarlas** individualmente.
3. **Oficina:** pegar el código de enlace, probar la conexión, guardar y ver el estado de la
   sincronización; desvincular.

### Criterios de éxito

- Una réplica nueva se enlaza a planta sin editar `.env` ni entrar por SSH (solo pegar el código).
- Revocar una réplica en planta le corta el acceso (401) en el acto, sin afectar a las otras.
- El login de Tailscale se completa desde la UI (link/QR) y la pantalla muestra en qué tailnet quedó.
- La oficina actual (enlazada por `REPLICA_TOKEN` en `.env`) sigue funcionando sin cambios hasta que
  se la migre a un código.

### Fuera de alcance

- Elegir el modo planta/réplica desde la UI (implica prender/apagar el poller = manejar contenedores):
  se sigue eligiendo al instalar (`docker-compose.replica.yml`).
- Tailscale dentro de Docker (se usa el `tailscaled` del sistema).
- Login de Tailscale por auth key.
- Aprobación de pedidos de enlace iniciados por la réplica.

## 2. `weg-agent` (planta y oficina)

Contenedor nuevo `nodered/weg-agent/` (Node 20 + CLI `tailscale`), única pieza con privilegios.

- Monta el socket del sistema: `/var/run/tailscale/tailscaled.sock` (bind mount) y corre como root
  (necesario para operar el LocalAPI con permisos de escritura).
- **Sin puertos publicados**; escucha en la red Docker `weg-network` (`:3400`).
- Toda petición exige `Authorization: Bearer <AGENT_TOKEN>` (comparación timing-safe). `AGENT_TOKEN`
  vacío → el agente responde 503 a todo y loguea el error de configuración.
- **Solo tres operaciones**, sin ejecución de comandos arbitrarios:

| Endpoint | Acción |
|---|---|
| `GET /tailscale/status` | `{ state: 'Running'\|'NeedsLogin'\|'Stopped'\|'NoState'\|'Unavailable', tailnet, user, ip, hostname, authUrl }` a partir de `tailscale status --json` |
| `POST /tailscale/login { hostname }` | Si no hay un login en curso, lanza `tailscale up --hostname=<h> --timeout=0` en segundo plano (proceso hijo del agente) y espera hasta 15 s a que aparezca `AuthURL`; devuelve el status con `authUrl`. Si ya está `Running`, devuelve el status sin hacer nada. |
| `POST /tailscale/logout` | `tailscale logout` |

- `hostname` se valida contra `^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$`; se pasa como argumento (sin shell).
- El CLI se invoca con `--socket=/var/run/tailscale/tailscaled.sock`.
- Si el socket no existe (Tailscale no instalado) → `state: 'Unavailable'`.
- Healthcheck del contenedor: `GET /health` sin token → 200 (no expone estado de Tailscale).

## 3. weg-api: endpoints de sistema

Todo bajo `requireAdmin`. `weg-api` habla con el agente por `http://weg-agent:3400` con
`AGENT_TOKEN` (del env); el token nunca llega al navegador.

| Endpoint | Acción |
|---|---|
| `GET /api/system/tailscale` | proxy de `/tailscale/status` |
| `POST /api/system/tailscale/login` | proxy de login (`{ hostname }`; default: hostname actual o `weg-<rol>`) |
| `POST /api/system/tailscale/logout` | proxy de logout |

Si el agente no responde → 502 con mensaje `Agente del sistema no disponible`.

## 4. Planta: registro de réplicas y código de enlace

### Almacenamiento

`config/replicas.json` (junto a `settings.json`; NO se sirve por `/api/config`):

```json
{ "replicas": [ { "id": "r_8f3a…", "name": "Oficina Tecno", "tokenHash": "<sha256 hex>",
  "createdAt": "…", "lastSeenAt": null, "lastIp": null, "revokedAt": null } ] }
```

El token **nunca** se guarda en claro.

### Código de enlace

`WEGR1-` + base64url(JSON `{ "v": 1, "u": "<url planta>", "t": "<token>", "n": "<nombre>", "i": "<id>" }`).
Token = 32 bytes aleatorios en hex. El código se devuelve **una sola vez** en la respuesta de creación.

### API (solo admin, solo si NO es réplica)

| Endpoint | Acción |
|---|---|
| `GET /api/replicas` | lista `{ id, name, createdAt, lastSeenAt, lastIp, status: 'activa'\|'nunca conectada'\|'revocada' }` + entrada virtual `{ id: 'env', name: 'Réplica heredada (.env)', legacy: true }` si hay `REPLICA_TOKEN` |
| `POST /api/replicas { name, plantUrl }` | crea; devuelve `{ replica, code }`. `name` 1–60 chars; `plantUrl` http(s) válida |
| `DELETE /api/replicas/:id` | revoca (marca `revokedAt`; no borra, para auditoría). `env` no se puede revocar desde la UI (409 con explicación) |

### Autenticación de `/api/replica/*`

- El middleware del router de réplica acepta: token cuyo sha256 coincide con alguna réplica **no
  revocada** (comparación timing-safe por entrada) **o** el `REPLICA_TOKEN` del env (heredado).
- Al autenticar con una réplica registrada, actualiza `lastSeenAt`/`lastIp` (`X-Real-IP`), escribiendo
  el archivo como máximo una vez por minuto por réplica.
- Sin réplicas activas y sin `REPLICA_TOKEN` → 404 (igual que hoy). Rate limit y 401/429 sin cambios.
- El router lee el registro en cada petición (archivo chico) → revocar aplica en el acto.

## 5. Oficina: conexión a planta

### Almacenamiento

`config/replica.json`: `{ "source": "<url>", "token": "<token>", "name": "…", "id": "…",
"pairedAt": "…" }`. Token en claro (se necesita para autenticar); solo en este archivo.

### API (solo admin, solo si ES réplica)

| Endpoint | Acción |
|---|---|
| `POST /api/replica-link/test { code }` | decodifica y llama a `<u>/api/replica/info` con el token (timeout 15 s); devuelve `{ ok, name, source, oldest, newest }` o `{ ok:false, error }` (sin ruta / 401 revocado / timeout / código inválido) |
| `GET /api/replica-link` | `{ source, name, id, pairedAt, tokenMasked: "…a1b2", fromEnv: bool }` (nunca el token) |
| `PUT /api/replica-link { code }` | valida (como `test`), guarda `replica.json`; devuelve `{ ..., sameSource: bool }` |
| `DELETE /api/replica-link` | borra `replica.json` |
| `GET /api/replica-link/status` | proxy de `http://weg-replica:3300/health` |

### weg-replica

- Fuente de conexión: `config/replica.json`; si no existe, `REPLICA_SOURCE`/`REPLICA_TOKEN` del env;
  si tampoco → estado **"sin configurar"** (no termina el proceso; `/health` lo informa).
- Revisa el archivo cada 10 s; si cambia `source` o `token`:
  - mismo `source` → conserva el cursor;
  - otro `source` → **reinicia el cursor** (vuelve a traer desde `oldest`).
  - En ambos casos reconecta el MQTT remoto a la nueva dirección.
- `/health` agrega `configured: bool` y `source`.

## 6. Frontend

- Configuración → pestaña **"Conexión"** (admin):
  - Tarjeta **Tailscale** (siempre): estado, tailnet (destacado), IP, hostname; botón "Conectar" →
    muestra link + **QR** (librería `qrcode`, generado en el navegador) y hace polling del estado
    cada 3 s hasta `Running`; botón "Desconectar" con confirmación doble (en planta, texto extra:
    "Corta las réplicas y el acceso remoto").
  - Tarjeta **Planta** (solo réplica): pegar código → "Probar conexión" → "Guardar y conectar";
    aviso si el código es de otra planta ("el histórico se va a mezclar"); estado de sincronización
    (en vivo, última sync, atraso, último error); "Desvincular".
- Configuración → pestaña **"Réplicas"** (solo planta): "Nueva réplica" (nombre + dirección
  prellenada con `http://<IP Tailscale>:<puerto actual>`), modal con el código de un solo uso y botón
  copiar; lista con estado/última conexión/IP; "Revocar" con confirmación.
- `ReplicaBadge`: usa `lagSec` → si `lagSec > 120`: ámbar "Réplica · poniéndose al día · atraso N h/min".

## 7. Despliegue

- `docker-compose.yml`: servicio `weg-agent` (build `./weg-agent`, `restart: unless-stopped`,
  red `weg-network`, volumen `/var/run/tailscale:/var/run/tailscale`, env `AGENT_TOKEN`), y
  `AGENT_TOKEN` en el env de weg-api. `.env.example`: `AGENT_TOKEN` con comando para generarlo.
- En las dos VMs actuales: generar `AGENT_TOKEN` en `.env`, levantar `weg-agent`, reconstruir
  `weg-api`/`weg-replica` y el frontend. **Deploy a planta requiere OK del usuario.**
- La oficina actual sigue con `REPLICA_TOKEN` del env; migrarla = crear réplica en planta, pegar el
  código en la oficina y quitar el `REPLICA_TOKEN` heredado de planta cuando ya no se use.

## 8. Pruebas

- **Unitarias weg-api:** código de enlace (encode/decode, prefijo, versión, errores); registro
  (crear → token solo en respuesta, hash guardado; revocar; validar token activo/revocado/heredado;
  throttle de `lastSeenAt`); guards (réplicas solo en planta, replica-link solo en réplica, admin);
  proxy al agente (502 si no responde).
- **Unitarias weg-agent:** sin token → 401; token vacío en config → 503; hostname inválido → 400;
  parseo de `tailscale status --json` (Running/NeedsLogin/Unavailable); login no lanza un segundo
  `up` si hay uno en curso (runner inyectado, sin Tailscale real).
- **Unitarias weg-replica:** fuente desde archivo > env > sin configurar; cambio de token conserva
  cursor; cambio de source reinicia cursor y reconecta.
- **E2E local:** planta local genera código → oficina descartable lo pega → sincroniza → revocar →
  401 y estado de error en la oficina. Tailscale real se prueba en las VMs (login/QR con el usuario).
