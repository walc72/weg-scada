# Módulo Comunicaciones — Diseño

Fecha: 2026-10-26 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-10-22-licencias-design.md` (módulo `comunicaciones`, nivel A), poller
`nodered/weg-modbus-poller`.

## 1. Problema y objetivo

Los variadores, medidores y caudalímetros llegan a la VM de planta por radioenlaces Ubiquiti
airMAX y routers 4G Teltonika RUT. Hoy, cuando un equipo queda **Offline**, no se sabe si falló el
equipo o el enlace que lo conecta, y no hay forma de ver la señal de los enlaces desde el portal.

Objetivo: ver en vivo el estado de los equipos de comunicación (en línea, señal, calidad) y que las
tarjetas de los equipos de campo indiquen **«Sin enlace»** cuando el que cayó es su enlace.

### Decisiones tomadas

- Equipos: Ubiquiti **airMAX** (airOS) y Teltonika **RUT** (4G).
- Lectura por **SNMP v2c** con community de solo lectura, desde el poller existente (nuevo
  `src/snmp.js`, librería `net-snmp`). Sin contenedor nuevo.
- Relación **«Conectado por»**: cada conexión Modbus elige de qué equipo de comunicación depende.
- Sin avisos por mail ni histórico de señal en esta versión.

### Criterios de éxito

- Con equipos cargados, la vista Comunicaciones muestra cada uno en línea o caído, con su señal y
  calidad, actualizado cada 30 s.
- Si cae un enlace, los equipos que dependen de él muestran «Sin enlace · <enlace>» en lugar de
  «Offline» dentro de los 90 s.
- Sin el módulo `comunicaciones`, nada cambia: no se lee SNMP, no se muestra el menú y `enlace` se
  ignora.
- La lectura SNMP nunca frena las lecturas Modbus.

### Fuera de alcance

- Avisos por mail y umbrales de señal.
- Histórico de señal en Tendencias.
- Seguir la cadena completa de enlaces (radio → radio → router); se muestra solo el directo.
- SNMP v3, otras marcas (MikroTik, Cambium…), acciones remotas (reiniciar un equipo).

## 2. Configuración (`config.json`)

### 2.1 Equipos de comunicación (`comms[]`, nuevo, al lado de `meters` y `flowmeters`)

```json
{ "name": "Radio Pozo 3", "tipo": "airmax", "ip": "192.168.10.20",
  "community": "public", "enabled": true, "enlace": "Router 4G Central" }
```

- `tipo` ∈ {`airmax`, `rut`}. `community` por defecto `public`. Puerto 161, SNMP v2c.
- `enlace` (opcional): equipo de comunicación del que depende este. Solo informativo en la vista
  (no se sigue la cadena).

### 2.2 «Conectado por» (`enlace`)

- Campo opcional `enlace` (nombre de un `comms[]`) en `gateways[]`, `devices[]` sin gateway,
  `meters[]` y `flowmeters[]`.
- Los `devices[]` con `gateway` heredan el `enlace` del gateway (no tienen el propio).

### 2.3 Validación (API, `validateConfig`)

- `comms`: nombre único y no vacío, IPv4 válida, `tipo` conocido, `community` texto de 1–64
  caracteres.
- `enlace`: si está, debe nombrar un `comms[]` existente; un `comms` no puede ser su propio enlace.
- Licencia: `comms` habilitados requieren el módulo `comunicaciones` y cuentan como nivel A.

## 3. Lectura SNMP (poller, `src/snmp.js`)

- Cada **30 s**, un GET por equipo habilitado con los OID de su `tipo`; timeout 3 s, sin
  reintentos dentro del ciclo. Los equipos se leen en paralelo, fuera del ciclo Modbus.
- Tabla de OID por `tipo` dentro de `snmp.js` (se ajusta en la puesta en marcha contra equipos
  reales, como el TUF):
  - **airmax** (UBNT-AirMAX-MIB y MIB-II): señal y ruido (dBm), CCQ/calidad (%), capacidad TX/RX
    (Mbps), SSID o equipo remoto, uptime.
  - **rut** (TELTONIKA-MIB y MIB-II): RSSI/RSRP (dBm), operador, tipo de red, uptime.
- 3 lecturas fallidas seguidas = **caído** (misma regla que `offline.js`); la primera respuesta
  buena lo vuelve a en línea.
- MQTT retenido `weg/comm/<sanitizado>`:
  `{ name, tipo, online, desde, signal, noise, quality, txMbps, rxMbps, remoto, operador, red,
  uptime, ts }`. `desde` = momento del último cambio de estado. Un campo que el equipo no informa
  va `null`.
- Un equipo quitado de la config o deshabilitado limpia su tópico retenido (como hoy los demás).

### 3.1 «Sin enlace»

- Al publicar un variador, medidor o caudalímetro **offline**, el poller resuelve su enlace
  (propio, o el del gateway) y, si ese equipo de comunicación está caído, agrega
  `sinEnlace: "<nombre>"` al payload.
- Con el enlace en línea, sin enlace configurado o sin el módulo: payload como hoy.

## 4. Portal

### 4.1 Menú Comunicaciones (`/comunicaciones`)

Visible para todos los roles con el módulo `comunicaciones`. Una tarjeta por equipo:

- Nombre, tipo (airMAX / RUT), IP, estado (**En línea** / **Caído desde hh:mm**), uptime.
- **airMAX**: señal con barra de color (buena ≥ −65 dBm, regular −65 a −75, débil < −75), ruido,
  CCQ %, capacidad TX/RX, remoto.
- **RUT**: señal con la misma barra (por RSRP/RSSI), operador, tipo de red.
- **Equipos detrás**: variadores, medidores y caudalímetros cuyo enlace es este.
- «Depende de <enlace>» si el equipo tiene `enlace`.

### 4.2 Tarjetas de equipos de campo

- Con `sinEnlace`, el estado dice **«Sin enlace · <nombre>»** (gris azulado) en lugar del
  «Offline» rojo, con el nombre como link a `/comunicaciones`.
- La alarma de equipo offline en Alarmas lleva el mismo texto.

### 4.3 Configuración → Dispositivos

- Sección nueva **«Equipos de comunicación»** (alta, edición, baja: nombre, tipo, IP, community,
  habilitado, depende de), con el mismo patrón que `FlowmetersSection`.
- Selector **«Conectado por»** (vacío = ninguno) en cada gateway, variador directo, medidor y
  caudalímetro.
- El contador de licencia suma los `comms` al nivel A.

## 5. Licencia (`license.js`, las dos copias idénticas)

- `tier('comm') = 'A'`.
- `usage(config, lic)` y `allowed(config, lic)` incluyen `comms` (habilitados; solo con el módulo
  `comunicaciones` cuando se pasa `lic`). `allowed` devuelve además `comms: Set<string>`.
- Orden de asignación dentro del nivel A: después de `flowmeters`.

## 6. Réplica de oficina

- `weg-replica` suscribe además `weg/comm/+` para el en vivo.
- La config replicada ya trae `comms` y `enlace` (viajan en `config.json`).
- La oficina no lee SNMP: muestra lo que publica la planta.

## 7. Pruebas

- **snmp.js**: mapeo OID → campos para airMAX y RUT contra un agente SNMP falso (`net-snmp` como
  agente en el test); timeout → 3 fallas → caído → vuelve; campos ausentes en `null`.
- **sinEnlace**: herencia gateway → variadores; enlace en línea → «Offline» normal; enlace caído →
  `sinEnlace`; sin módulo → se ignora.
- **API**: validación de `comms` y de `enlace` (nombre inexistente, enlace a sí mismo).
- **license.js**: `comms` nivel A, solo con el módulo; test de igualdad de copias.
- **Réplica**: suscribe `weg/comm/+`.
- **Frontend**: build y la vista con datos falsos.
- **Integración (docker-in-docker)**: agente SNMP falso con respuestas de airMAX; un gateway con
  `enlace` a él; apagar el agente → «Sin enlace». Equipos reales en la puesta en marcha.

## 8. Release

v1.6.0. Planta y después oficina con `sudo weg-scada update`. Hasta cargar equipos de comunicación
en el portal no cambia nada visible.
