# Autenticación del MQTT en vivo (`/mqtt`) — Diseño

Fecha: 2026-09-28 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-09-27-replica-branding-design.md`, `2026-09-27-conexion-ui-design.md` (en master).

## 1. Problema y objetivo

Hoy `/mqtt` (websocket, proxeado por nginx directo a `mosquitto:9001`) es de **lectura anónima**:
cualquiera que llegue al servidor por la red ve la telemetría en vivo, y **revocar una réplica no
corta su en vivo**.

Objetivo: el websocket `/mqtt` exige credencial y las conexiones se **cortan en el acto** al revocar
una réplica, cerrar sesión o vencer la sesión.

### Criterios de éxito

- Sin token válido, `/mqtt` responde 401 (planta y oficina).
- Navegador con sesión (admin u operador) ve el en vivo como hoy.
- Réplica activa ve el en vivo de planta; al revocarla, su websocket se cierra en ≤ 1 s.
- Logout o vencimiento de sesión cierra los websockets de esa sesión.
- El token nunca queda en logs de nginx ni de weg-api.
- El despliegue no deja a la oficina sin en vivo.

### Fuera de alcance

- Cambiar el listener interno 1883 (poller, weg-api, weg-replica local): sigue igual.
- Autenticación dentro de Mosquitto (plugins, usuarios MQTT): Mosquitto sigue anónimo en 9001 pero
  solo alcanzable desde la red Docker, detrás de weg-api.
- Grafana u otros consumidores.

## 2. Proxy del websocket en weg-api

Módulo nuevo `weg-api/src/services/mqttProxy.js`, enganchado al evento `upgrade` del servidor HTTP
de Express (`server.on('upgrade', …)`).

- Solo atiende `upgrade` cuyo path normalizado sea `/mqtt` (minúsculas, sin barra final, sin
  query). Cualquier otro path: se destruye el socket.
- **Credencial** (en este orden):
  1. `Authorization: Bearer <t>` (réplica, Node);
  2. `?token=<t>` en la URL (navegador).
- **Validación → identidad:**

| Credencial | Identidad |
|---|---|
| token de sesión vigente (`validTokens` de auth.js) | `session:<token>` |
| token de réplica activa (`registry.verify`) | `replica:<id>` |
| `REPLICA_TOKEN` del `.env` (heredado) | `replica:env` |

- Inválida → responde `HTTP/1.1 401 Unauthorized` + `Connection: close` y cierra. Rate limit por IP
  (`X-Real-IP`): 10 fallos / 15 min → `429 Too Many Requests`.
- Válida → abre TCP a `MQTT_WS_UPSTREAM` (default `mosquitto:9001`), reenvía la request de upgrade
  con el path `/mqtt` **sin query** y **sin** el header `Authorization`, escribe el `head` recibido y
  hace `pipe` en ambos sentidos. No interpreta MQTT.
- **Registro:** `Map<identidad, Set<socket>>`. Al cerrarse cualquiera de los dos lados, se cierra el
  otro y se quita del registro.
- **Cortes:**
  - `auth.js` expone `onTokenRevoked(fn)`; se llama al hacer logout y al vencer el TTL de 12 h →
    `closeIdentity('session:<token>')`.
  - El registro de réplicas acepta `onRevoke(fn)` → `closeIdentity('replica:<id>')`.
  - Barrido cada 60 s: re-valida cada identidad abierta (sesión vigente / réplica activa / token
    heredado igual) y cierra las que ya no valen.
- **Logs:** nunca la URL ni el token; solo `[MQTT-WS] abierta/cerrada <tipo> desde <ip>` (sin el
  token: la identidad de sesión se loguea como `session:…<4 últimos>`).

## 3. nginx

`nginx/frontend.conf`, `location /mqtt`: `proxy_pass` a `weg-api:3200` (variable
`$api_upstream`), headers de websocket y timeouts de 1 h como hoy, `X-Real-IP $remote_addr`,
`access_log off`.

## 4. Clientes

- **Frontend** (`store/drives.ts`): URL = `…/mqtt?token=<encodeURIComponent(token)>` con el token
  de sesión de `useAuthStore`. Sin token no conecta. Al cortarse por 401, mqtt.js reintenta; el
  banner "RECONECTANDO" existente lo muestra y la siguiente llamada a la API con token inválido
  hace logout (comportamiento actual de `authFetch`).
- **weg-replica** (`src/index.js`): conexión remota con
  `wsOptions: { headers: { Authorization: 'Bearer <token>' } }`.

## 5. Despliegue

1. **Oficina primero** (weg-replica nuevo manda el header; la planta vieja lo ignora) + su
   weg-api, `frontend.conf` y frontend.
2. **Planta después** (weg-api, `frontend.conf`, frontend; ~10 s sin API).
- Reiniciar weg-api invalida las sesiones (ya pasa hoy). Pestañas con frontend viejo en caché
  pierden el en vivo hasta recargar.
- Requiere OK del usuario en cada servidor.

## 6. Pruebas

- **Unitarias weg-api** (`test/mqttProxy.test.js`) con un upstream falso (servidor TCP que responde
  `101 Switching Protocols` y hace eco): token por query y por header → 101 y eco; el upstream NO
  recibe el token (ni en la URL ni en headers); sin token / inválido → 401; 10 fallos → 429; path
  distinto de `/mqtt` → cerrado; revocar sesión (`onTokenRevoked`) → socket cerrado; revocar réplica
  → se cierra la suya y no la de otra; barrido cierra un token que dejó de valer.
- **E2E local:** navegador con sesión → en vivo; sin token → 401; logout → corte; oficina
  descartable enlazada → en vivo por header; revocarla → su websocket se cierra; `mosquitto_sub`/
  cliente ws externo sin token → 401.
