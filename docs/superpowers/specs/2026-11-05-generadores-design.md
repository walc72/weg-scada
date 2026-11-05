# Módulo Generadores (DSE 8610 MKII) — diseño

Fecha: 2026-11-05. Aprobado por el usuario en la conversación.

## Objetivo

Monitorear grupos electrógenos. Primer modelo: **Deep Sea DSE 8610 MKII**, leído por Modbus RTU a través de un
gateway Modbus TCP→RTU (ADAM-4572, PAS600 u otro). La pantalla se inspira en GenMonitor (walc72/genmonitor), pero
GenMonitor no tiene el mapa del DSE: las direcciones salen del estándar **GenComm** de Deep Sea.

Fuera de alcance (etapa 2): comandos remotos (arranque, parada, modo), el generador en el dibujo del unifilar y otros
modelos (InteliLite 4 AMF25, InteliLite 9, Smartgen HGM6120N). Con el esquema armado, cada modelo nuevo es sumar su mapa.

## Enfoque: un tipo más de «equipo de campo»

Reconectadores (`reco`) y reguladores (`reg`) ya usan un mapa de puntos genérico (`weg-modbus-poller/src/points.js`):
medidas, señales y alarmas, cada una con registro, tipo y escala. El poller lee el mapa, publica en MQTT
(`CAMPO[kind].prefix`), escribe `campo_data` en Influx y las alarmas pasan por alerts/alarmLog.

El generador se suma como el kind **`gen`**:

- **Config:** lista `generadores` en `config.json`, con la misma forma que `reguladores`: `name`, `ip`, `port`, `unitId`,
  `modelo`, `mapa`, `enabled`, `fueraServicio` y lo demás que use ese kind.
- **Poller:** `CAMPO.gen = { list: 'generadores', prefix: 'weg/gen' }` y `LISTS.gen` en links. Todo lo que hoy itera
  `CAMPO`, o pregunta por `reco`/`reg`, contempla `gen`. Va con el módulo de licencia **`generadores`** (no `unifilar`).
- **Modelos:** `MODELOS.dse8610` (`kind: 'gen'`) y `'otro-gen'`. `CAMPO_MODELOS.gen = ['dse8610', 'otro']` en `validate.js`.

## Mapa por defecto DSE 8610 MKII (GenComm)

Dirección Modbus = página × 256 + desplazamiento. Registros de 16 bits; los de 32 bits van palabra alta primero
(orden BE). Todo FC 3. **Direcciones a verificar en puesta en marcha** (algunas varían por firmware), como en los
otros modelos.

| key / med | Página:desp. | Addr | Tipo | Escala | Unidad |
|---|---|---|---|---|---|
| `modo` (0 stop, 1 auto, 2 manual, 3 prueba con carga, 4 auto con restauración manual, 5 config., 6 prueba sin carga) | 3:4 | 772 | u16 | | |
| Presión de aceite | 4:0 | 1024 | u16 | 1 | kPa |
| Temperatura refrigerante | 4:1 | 1025 | s16 | 1 | °C |
| Nivel de combustible | 4:3 | 1027 | u16 | 1 | % |
| Tensión alternador de carga | 4:4 | 1028 | u16 | 0,1 | V |
| Tensión de batería | 4:5 | 1029 | u16 | 0,1 | V |
| `rpm` | 4:6 | 1030 | u16 | 1 | rpm |
| `hz` Frecuencia generador | 4:7 | 1031 | u16 | 0,1 | Hz |
| `vl1n` `vl2n` `vl3n` | 4:8/10/12 | 1032/1034/1036 | u32 | 0,1 | V |
| `vl1l2` `vl2l3` `vl3l1` | 4:14/16/18 | 1038/1040/1042 | u32 | 0,1 | V |
| `il1` `il2` `il3` | 4:20/22/24 | 1044/1046/1048 | u32 | 0,1 | A |
| Frecuencia de red | 4:35 | 1059 | u16 | 0,1 | Hz |
| Tensión de red L1-N | 4:36 | 1060 | u32 | 0,1 | V |
| `kw` Potencia activa total | 6:0 | 1536 | s32 | 0,001 | kW |
| Potencia aparente total | 6:8 | 1544 | s32 | 0,001 | kVA |
| `fp` Factor de potencia | 6:21 | 1557 | s16 | 0,01 | |
| `horas` Horas de marcha | 7:6 | 1798 | u32 | 1/3600 | h |
| Energía generada | 7:8 | 1800 | u32 | 0,1 | kWh |
| `arranques` Arranques | 7:16 | 1808 | u32 | 1 | |

Las claves sin nombre propio van como `med` con `nombre`, `unidad` y `rol` (como en los modelos actuales) y
`principal: true` para kW, tensión, frecuencia, batería, combustible y horas.

### Alarmas: página 154 (4 bits por alarma)

GenComm informa cada alarma con un nibble: 0 desactivada, 1 inactiva, **2 advertencia, 3 parada, 4 disparo
eléctrico**, 8–14 indicaciones inactivas o reservadas, 15 no implementada. Alarma `k` (1 = primera):
registro `39424 + 1 + floor((k-1)/4)`, desplazamiento `12 - 4 * ((k-1) % 4)` (alarma 1 en los bits altos del registro).

**Extensión del mapa de puntos:** campo opcional `nib` (desplazamiento: 0, 4, 8 o 12).
`v = (raw >> nib) & 0xF`. Si el punto es `alarma`, queda activo con `v` ∈ {2, 3, 4}. Si alerts/alarmLog permiten
prioridad por alarma, 2 = advertencia y 3/4 = falla; si no, todas como falla del equipo. `nib` no se combina con
`bit` ni con `valor`. La validación lo rechaza en tipos de 32 bits, `bool` o fuera de {0, 4, 8, 12}.

Alarmas del mapa por defecto (GenComm, en orden, a verificar):

1. Parada de emergencia
2. Baja presión de aceite
3. Alta temperatura de refrigerante
4. Baja temperatura de refrigerante
5. Baja velocidad
6. Sobrevelocidad
7. Baja frecuencia del generador
8. Alta frecuencia del generador
9. Baja tensión del generador
10. Alta tensión del generador
11. Baja tensión de batería
12. Alta tensión de batería
13. Falla del alternador de carga
14. Falla de arranque
15. Falla de parada
16. Falla de cierre del generador
17. Falla de cierre de red
18. Falla del sensor de presión de aceite
19. Pérdida del pickup magnético
20. Pickup magnético en circuito abierto
21. Sobrecorriente del generador
22. Calibración perdida
23. Bajo nivel de combustible

### Estado derivado (como `getModo` de GenMonitor)

Prioridad:

1. **Sin comunicación**
2. **Fuera de servicio**
3. **Alarma**: alguna alarma activa; parada o disparo ⇒ falla
4. **En carga**: rpm > 300 y kW > 0,5
5. **En marcha**: rpm > 300
6. **Automático**: modo = 1, motor parado
7. **Parado**

Se calcula en el frontend a partir de los valores publicados; si conviene reutilizarlo en mails o informes, en un
helper compartido.

## Licencia

Nuevo tipo de equipo **`generadores`** en el cupo por tipo (`TIPOS` de `license.js`, copia idéntica en el poller), en
la etiqueta del portal (`TIPO_LABEL`) y en `scripts/license.js --equipos`. Para licencias por nivel, `gen` cuenta
como nivel **C** («Generadores y medidores con forma de onda», como dice el texto actual). Módulo requerido:
`generadores`. Sin el módulo, los generadores no se leen ni cuentan (igual que medidores sin `medidores`).

El panel license.wleenk.com suma el tipo en su formulario y en `normalizeLimits` (PR aparte en wleenk-license-server).

## Portal

- **Configuración → Equipos:** pestaña **Generadores** con el mismo editor que reguladores. Alta con modelo DSE 8610
  (copia el mapa por defecto, editable en el editor de mapa), botón fuera de servicio y cupo de licencia
  (`full('generadores')`).
- **Menú «Generadores»** (ícono de grupo/rayo), visible con el módulo `generadores`:
  - **Tarjetas por grupo:** nombre, estado con color (convenciones ISA-101 del portal), modo, kW, tensión L-L
    promedio, frecuencia, batería, combustible, horas, arranques y alarmas activas.
  - **Detalle** (clic o ruta `/generadores/:name`):
    - Generador: V L-N y L-L, I por fase, kW, kVA, FP y Hz.
    - Red: Hz y V.
    - Motor: rpm, refrigerante, aceite, batería, alternador de carga y combustible.
    - Contadores: horas, arranques y kWh.
    - Alarmas activas.
    - Tendencias (kW, tensión, frecuencia, temperatura, combustible) con la serie de `campo_data` como en `CampoEquipo`.
  - Reutilizar `CampoEquipo`/`CampoSection` donde se pueda; vista nueva solo donde la de campo no alcance.
- **Alarmas, Comunicaciones, Históricos y Mis gráficos:** el kind `gen` aparece donde aparecen `reco`/`reg`.
- **Tutorial/mocks:** un generador de ejemplo en el modo mock.

## Pruebas

- `points`: decodificación `nib` (alarma 1 en bits altos, valores 2/3/4 activos, 0/1/8/15 inactivos) y u32 BE.
- **Modelos:** el mapa DSE valida contra `validate.js` y las direcciones de las alarmas siguen la fórmula.
- **Licencia:** `generadores` por tipo y gen → nivel C. Sin módulo no cuenta.
- `retained`/poller: `CAMPO.gen`, excedidos y fuera de servicio.
- **Frontend:** estado derivado (función pura con test) y vista previa en mock.
- **Prueba real:** un simulador Modbus TCP con el mapa (script en `scripts/` o en el test) antes de tener el equipo.
