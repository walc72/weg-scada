# Lectura DNP3 de reguladores (Toshiba / TSEA) — Diseño

Fecha: 2026-10-29 · Estado: diseño aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-10-28-unifilar-equipos-design.md` (mapa de puntos de reconectadores y reguladores),
`2026-10-29-puntos-libres-design.md` (mediciones y señales libres), PR #95 (banco de reguladores).

## 1. Problema y objetivo

En el sitio Toshiba (192.168.11.x, por el RUTX Toshiba) hay controladores de regulador TSEA que
**solo hablan DNP3 TCP**: 192.168.11.6 y 192.168.11.7, puerto 20000, outstation 10. El gateway
TSEA (.5) tiene un Modbus TCP (502, unit 2) que hoy no se puede usar (devuelve «dirección
inválida» y quedó sin responder; se retoma aparte). El poller solo lee Modbus.

Objetivo: que el poller lea **DNP3 directo, solo lectura**, y que .6 y .7 aparezcan como
reguladores normales (tarjeta, detalle, banco, mímico, fasorial si corresponde, tendencias,
reportes, alarmas), sin hardware nuevo.

### Criterios de éxito

- Un regulador con `protocolo: 'dnp3'` y el modelo `tsea-dnp3` se da de alta en Configuración y
  muestra en vivo tensión, corriente, TAP, automático/remoto, señales y alarmas de .6 / .7.
- El poller **nunca** envía comandos ni escrituras: solo READ de class 0 y confirmaciones de
  aplicación de las respuestas que lo pidan. No lee ni confirma eventos (class 1–3) ni
  respuestas no solicitadas.
- Si el equipo no responde, pasa a offline / «Sin enlace» con la misma lógica que los Modbus.
- Los equipos Modbus no cambian de comportamiento (payload, Influx, tiempos de ciclo).

### Fuera de alcance

- Comandos DNP3 (CROB, salidas analógicas), sincronización de hora, habilitar/deshabilitar
  no solicitados, lectura de eventos, DNP3 serie, DNP3 seguro (SAv5).
- Reconectadores por DNP3 (el diseño lo permite, pero no se prueba ni se ofrece en el modelo).
- El gateway TSEA (.5) por Modbus.

## 2. Hallazgos en campo (2026-10-29, solo lectura)

- .6 y .7 responden en DNP3 TCP 20000 como outstation **10**. Aceptan lectura de class 0 con
  varias direcciones de maestro; con maestro 3, .6 cortó una vez. Mandan no solicitados al
  maestro **1** (dirección configurada en los equipos).
- Class 0 (por equipo = un regulador): 13 BI (g1v2), 2 BO status (g10v2), 2 contadores (g20v1),
  3 AI (g30v1), 2 AO status (g40v1). El orden coincide con el mapa del PDF de la app TSEA
  (`pt.pdf`): BI 0 HIGHB, 1 INB, 2 LOWB, 3 OLTCR (subiendo), 4 OLTCL (bajando), 5 OLTCINH,
  6 PFDI (flujo inverso), 7 AUT, 8 BLQ, 9 MAN, 10 REM, 11 MAN, 12 NEUTRAL; AI 0 tensión ×100,
  1 corriente ×100, 2 TAP.
- Valores leídos en .6: AI0 12010 (120,10 V en base 120), AI1 6310, AI2 0, BI12 (neutral) = 1,
  BI10 (remoto) = 1, contador 8182, AO0 12181 (121,81 V, probable consigna), AO1 12908 (sin
  identificar).
- Lectura de la rama en planta (2026-10-29, maestro 3): .6 y .7 responden class 0 en ~0,5 s, 22 puntos, sin
  errores con la ruta Tailscale caliente; tras un rato sin tráfico los primeros pedidos pueden perderse
  (unos ciclos «sin respuesta»). Por eso el modelo usa **maestro 3**: no se toma la dirección 1, a la
  que los equipos mandan sus no solicitados.
- Leer class 1–3 consume los eventos del outstation (en la primera prueba se consumieron los de
  .6): por eso solo class 0.

## 3. Modelo

### 3.1 Regulador (config)

| Campo | Modbus (hoy) | DNP3 (nuevo) |
|---|---|---|
| `protocolo` | ausente o `'modbus'` | `'dnp3'` |
| `ip`, `port` | port por defecto 502 | port por defecto **20000** |
| `unitId` | 0–255 | no se usa |
| `dnp3` | — | `{ outstation: 0–65519 (por defecto 10), maestro: 0–65519 (por defecto 1) }` |
| `mapa` | puntos Modbus | puntos DNP3 (§3.2) |

`enabled`, `enlace`, `banco`, `tapMin/tapMax`, licencia (nivel B) y nombre único: sin cambios.

### 3.2 Punto DNP3 del mapa

`{ key, obj, addr, escala?, bit?, valor?, texto?, nombre?, unidad?, decimales?, principal?, rol? }`

- `obj` ∈ `bi` (g1), `bo` (g10), `ctr` (g20), `ai` (g30), `ao` (g40). `addr` = índice DNP3
  (0–65535). No llevan `fc`, `tipo` ni `orden`.
- `bi` / `bo` son sí/no (como `tipo: 'bool'`): no admiten `escala`, `bit`, `valor`.
- `ctr` / `ai` / `ao` son numéricos: admiten `escala`; `bit` / `valor` como en u16/s16 (para
  sacar una señal de un analógico).
- Las reglas de keys (numéricas vs sí/no), `med`/`senal`, sumas, principal, rol y el límite
  de 1–64 puntos son las mismas que para Modbus.
- Calidad: si el flag ONLINE (bit 0) del punto viene en 0, el valor es `null`.

### 3.3 Modelo `tsea-dnp3` (mapa por defecto, un regulador)

| Key / nombre | Punto | Extra |
|---|---|---|
| `v` | ai 0 | escala 0.01 (V secundario, base 120) |
| `i` | ai 1 | escala 0.01 |
| `tap` | ai 2 | |
| `vConsigna` | ao 0 | escala 0.01 |
| `auto` | bi 7 | |
| `remoto` | bi 10 | |
| `alarma` «Bloqueado» | bi 8 | |
| `alarma` «Cambio de toma inhibido» | bi 5 | |
| senal «Motor elevando» | bi 3 | principal |
| senal «Motor bajando» | bi 4 | principal |
| senal «Tensión sobre el rango» | bi 0 | |
| senal «Tensión en rango» | bi 1 | |
| senal «Tensión bajo el rango» | bi 2 | |
| senal «Flujo inverso» | bi 6 | |
| senal «Neutral» | bi 12 | |
| med «Operaciones» | ctr 0 | principal |

La descripción del modelo indica: tensión en secundario (ajustar `escala` con la relación del
TV para ver tensión de línea), outstation 10, maestro 3, puerto 20000, y que AO1 / BO 0–1 /
ctr 1 no están identificados.

## 4. Poller

### 4.1 `src/dnp3.js` (nuevo)

Maestro DNP3 TCP mínimo, solo lectura.

- **Enlace:** tramas `05 64`, CRC DNP3 (poly 0x3D65, reflejado 0xA6BC, complemento) por cabecera
  y por cada bloque de 16 bytes; CTRL del maestro `0xC4` (primaria, unconfirmed user data).
  Se ignoran las tramas de enlace de otros tipos (p. ej. link status).
- **Transporte:** un segmento por pedido (FIR|FIN); al recibir, reensambla segmentos por
  FIR/FIN y secuencia.
- **Aplicación:** pedido `READ` (FC 0x01) de `g60v1` qualifier `0x06` (class 0). Respuesta
  `0x81` con FIR/FIN de aplicación (respuestas multi-fragmento se acumulan hasta FIN). Si la
  respuesta trae CON, se envía `CONFIRM` (FC 0x00) con su secuencia. Los fragmentos no
  solicitados (`0x82`) se descartan **sin confirmar**.
- **Objetos decodificados:** g1v1 (bits empacados), g1v2, g10v1, g10v2, g20v1, g20v2, g20v5,
  g20v6, g30v1–v5, g40v1–v3; qualifiers 0x00, 0x01 (rango 8/16 bits), 0x17, 0x28 (con
  prefijo de índice). Un objeto no soportado o un fragmento truncado hace fallar esa lectura (sin
  datos parciales; el regulador queda sin datos / offline por la lógica habitual de offline) y se
  registra una vez por conexión en el log.
- **Conexión:** una por `ip:port` (y outstation/maestro), persistente; un pedido en vuelo por
  conexión; timeout de respuesta 5 s. Ante timeout o error se cierra y el próximo ciclo
  reconecta. Mismas estadísticas que `connections` (para `/api/status` del poller).
- **Interfaz:** `integrity(ip, port, outstation, maestro) → Promise<Map<'obj:idx', {v, online}>|null>`
  (`null` = sin respuesta).

### 4.2 `points.js`

- `readPointsDnp3(item, integrity) → { online, vals }` con la misma forma que `readPoints`:
  una lectura integrity por ciclo; cada punto toma su `obj:addr`; aplica escala / bit / valor
  (la misma lógica de `decode` para numéricos); `online` = hubo respuesta. Sin `comOk`.
- `valoresDe`, `extrasDe`, `alarmasDe`, `campoLine`: sin cambios.

### 4.3 `index.js`

`pollCampo` elige `readPointsDnp3` cuando `item.protocolo === 'dnp3'`; el resto del ciclo
(offline, enlace, licencia, MQTT, Influx) no cambia. Los equipos DNP3 se agrupan por
`ip:port` como los Modbus, para no frenar a los demás.

## 5. API

- `validate.js`: `protocolo` ∈ {`modbus`, `dnp3`}; con `dnp3`, `dnp3.outstation` / `dnp3.maestro`
  enteros 0–65519 y reglas de §3.2 por punto (sin `fc`/`tipo`/`orden`; `obj` del conjunto;
  `addr` 0–65535). Con `modbus` (o sin `protocolo`), las reglas de hoy, y se rechaza `obj`.
- `modelos.js`: modelo `tsea-dnp3` (§3.3) con `protocolo: 'dnp3'`, `port: 20000`,
  `dnp3: { outstation: 10, maestro: 3 }`.
- Reportes, alarmas y réplica: sin cambios (trabajan sobre el payload y `campo_data`).

## 6. Portal

- Formulario del regulador: al elegir un modelo DNP3 (o «Protocolo: DNP3»), el puerto pasa a
  20000 por defecto, se ocultan `unitId` y se muestran «Outstation» y «Maestro».
- Editor de mapa: con DNP3, la columna «fc» pasa a «Tipo DNP3» (bi, bo, ctr, ai, ao) y
  «Dirección» a «Índice»; se ocultan «Tipo» y «Orden»; `escala`/`bit`/`valor` solo en tipos
  numéricos. Cambiar el tipo limpia los campos que no aplican (como el cambio de key).
- Tarjetas, detalle, banco, mímico, tendencias y reportes: sin cambios.

## 7. Pruebas

- **Poller (unitarias):** CRC (vector real `05 64 05 0b 03 00 0a 00` → `c4 25`); armado del
  pedido de class 0; parseo de una respuesta real capturada de .6 (fixture en hex) con
  BI/BO/contadores/AI/AO; multi-segmento y multi-fragmento; CON → confirm; no solicitado
  descartado sin confirm; flag ONLINE en 0 → `null`; objeto no soportado; `readPointsDnp3`
  con escala/bit/valor.
- **API:** reglas de §5; modelo `tsea-dnp3` válido; un mapa Modbus con `obj` rechazado.
- **Frontend:** build.
- **Integración (dind, imagen edge):** outstation DNP3 simulado (Node, responde class 0 con los
  objetos de §2, CON en la respuesta y un no solicitado al conectar); regulador `tsea-dnp3`
  en vivo, offline al apagar el simulador, banco y mímico.
- **En planta (antes del release):** lectura con la imagen edge contra .6 y .7 (solo class 0)
  y comparación con la app TSEA.

## 8. Puesta en planta

Con el release y el OK del usuario: alta de «Toshiba RG-6» (192.168.11.6) y «Toshiba RG-7»
(192.168.11.7) con el modelo `tsea-dnp3`, enlace «RUTX Toshiba» y banco «Toshiba», por script
con `--dry`, respaldo de `config.json`, validación y chequeo de licencia de la API (2 B más).
Nombres finales a confirmar con el usuario.

## 9. Release

v1.12.0 (el dibujo del unifilar, parte B, pasa a v1.13.0).
