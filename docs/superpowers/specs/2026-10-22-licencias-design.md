# Licencias por módulo y por dispositivo — Diseño

Fecha: 2026-10-22 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-09-27-replica-branding-design.md` (réplica), roles superadmin/admin/operador (PR #59).

## 1. Problema y objetivo

weg-scada se vende a clientes que pagan una licencia base, módulos opcionales y una cantidad de
dispositivos. Hoy todo está habilitado para todos y no hay límite de equipos.

Objetivo: cada instalación tiene una **licencia firmada por el integrador** que dice qué módulos
están habilitados y cuántos dispositivos de cada nivel se pueden leer. El cliente puede tener root
en la VM, así que la licencia no se puede editar a mano: cualquier cambio invalida la firma.

### Decisiones tomadas

- Licencia **firmada sin conexión** (Ed25519). No hay servidor de licencias.
- **Perpetua**: no vence. El soporte anual se cobra fuera del sistema.
- **Atada a la instalación** mediante un ID de instalación.
- La réplica de oficina usa la licencia de planta; no tiene licencia propia.

### Criterios de éxito

- Sin licencia válida, la instalación arranca en modo base (sección 4.4) y muestra su ID.
- Al pegar una licencia válida aparecen los módulos licenciados y se aplican los límites.
- Una licencia modificada, de otra instalación o firmada con otra clave se rechaza con el motivo.
- Editar `config.json` a mano para pasar el límite no hace que se lean más equipos.
- Bajar un límite o quitar un módulo nunca borra config ni histórico.
- Planta y oficina pasan a la versión con licencias sin quedar nunca en modo base.

### Fuera de alcance

- Protección contra quien modifica el código o arma su propia imagen. El repo y las imágenes de
  ghcr son públicos; pasarlos a privados es una decisión aparte.
- Protección contra la clonación de la VM con su volumen `config/` (el ID viaja con la copia).
  Atar al hardware rompería las migraciones de VM.
- Vencimientos, revocación remota, licencias por suscripción.
- Los módulos nuevos (caudales, unifilar, generadores, comunicaciones, backup externo): esta spec
  solo define sus nombres y cómo se cuentan sus equipos. Cada uno se construye en su propia spec.

## 2. La licencia

### 2.1 Contenido

```json
{
  "v": 1,
  "installId": "7f3c2a9e-…",
  "cliente": "Agriplus",
  "emitida": "2026-10-22",
  "modulos": ["medidores", "caudales", "unifilar", "generadores", "comunicaciones", "replica", "backup"],
  "limites": { "A": 20, "B": 20, "C": 2 }
}
```

- `v`: versión del formato. Una versión desconocida se rechaza.
- `modulos`: subconjunto de la lista de la sección 2.3. Un nombre desconocido se rechaza al firmar
  y se ignora al verificar (para que una licencia de una versión más nueva no rompa una más vieja).
- `limites`: enteros ≥ 0 por nivel. Un nivel ausente vale 0.

### 2.2 Formato de entrega

Un solo texto: `base64url(JSON del contenido) + "." + base64url(firma Ed25519 del JSON)`.
Se pega en el portal o se copia a un archivo. Sin saltos de línea; se toleran espacios al
principio y al final.

### 2.3 Módulos

| Nombre | Habilita |
|---|---|
| (base, siempre) | Dashboard, tendencias, reportes, alarmas, usuarios, variadores |
| `medidores` | Medidores de energía, Forma de Onda, demanda |
| `caudales` | Caudal por bomba y Tendencias → Caudales |
| `unifilar` | Menú Unifilar |
| `generadores` | Menú y configuración de Generadores |
| `comunicaciones` | Estado de equipos Ubiquiti y Teltonika |
| `replica` | Réplica de oficina |
| `backup` | Backup externo |

### 2.4 Niveles de dispositivo

Tabla única en `license.js`. Se cuentan solo los equipos habilitados (`enabled !== false`).

| Equipo | Lista en config | Nivel |
|---|---|---|
| Variador | `devices[]` | B |
| Medidor | `meters[]` | B, o C si tiene `waveform` |
| Caudalímetro, equipo de red | (futuro) | A |
| Reconectador, regulador | (futuro) | B |
| Generador | (futuro) | C |

Los equipos futuros se agregan a la tabla cuando se construye su módulo.

## 3. Archivos y claves

En `config/` (el mismo volumen que `config.json`, incluido en el backup y conservado por
`weg-scada update`):

- `install-id`: UUID v4 en texto. weg-api lo crea al arrancar **solo si no existe**, y no lo
  cambia nunca.
- `license.key`: el texto de la licencia. Si falta o es inválida, rige el modo base.

Ninguno se sirve por `GET /api/config`.

Claves:

- La **clave privada** vive solo en la PC del integrador (`C:\licencias-weg\private.pem`), fuera del
  repo, **cifrada con una frase de paso**. No hace falta un servidor: firmar es un comando local.
  Copia de seguridad en el gestor de contraseñas (archivo adjunto + la frase) y en un USB guardado
  aparte.
  - Si se pierde: las instalaciones existentes siguen funcionando, pero no se pueden emitir ni
    ampliar licencias. Recuperación: nueva clave, nueva versión con la clave pública nueva y
    re-emitir las licencias de todos los clientes.
  - Si se filtra: cualquiera puede firmar licencias. Misma recuperación.
- La **clave pública** está en el código de `license.js` como constante PEM.

## 4. Verificación y aplicación

### 4.1 `license.js`

Módulo sin dependencias (solo `crypto` y `fs` de Node). La misma copia en
`weg-api/src/services/license.js` y `weg-modbus-poller/src/license.js`.

- `verify(texto, installId, { checkInstall = true })` → `{ ok, motivo, cliente, modulos, limites }`.
  Motivos: `sin-licencia`, `formato`, `firma`, `version`, `otra-instalacion`.
- `load(configDir)` → lee `install-id` y `license.key` y devuelve el resultado de `verify`, o el
  modo base si algo falla.
- `tier(tipo, equipo)` → `'A' | 'B' | 'C'`, según la tabla 2.4.
- `usage(config)` → `{ A, B, C }` de los equipos habilitados.
- `allowed(config, lic)` → nombres de los equipos que entran en el límite: los primeros N de cada
  nivel en el orden de la config.
- `hasModule(lic, nombre)`.
- `encode(payload, firma)` / `decode(texto)`: los usa también la herramienta de firma.

weg-api y el poller recargan la licencia cuando cambia `license.key`, con un watcher sobre ese
archivo igual al que ya vigila `config.json`.

### 4.2 weg-api

- `GET /api/license` (cualquier usuario logueado): `{ installId, ok, motivo, cliente, modulos,
  limites, uso }`.
- `PUT /api/license` (solo superadmin): recibe el texto, lo verifica y, si es válido, lo guarda en
  `license.key` (tmp + rename). Si no es válido responde 400 con el motivo y no toca el archivo.
- `PUT` de config, devices y meters: 400 si el resultado pasa algún límite
  (`"Límite de la licencia: nivel B 21/20"`) o agrega equipos de un módulo no licenciado.
- Rutas de módulo: 403 si el módulo no está habilitado. Hoy: `/api/waveform` requiere `medidores`
  y `/api/replica/*` requiere `replica`. Las rutas de los módulos futuros se protegen al construirlos.

### 4.3 Poller

- Lee solo los equipos de `allowed(config, lic)`. Los demás se publican por MQTT con
  `online: false` y `license: 'excedido'` y no se escriben en InfluxDB.
- Sin el módulo `medidores` no lee medidores.
- No modifica `config.json`.

### 4.4 Modo base (sin licencia o licencia inválida)

- Módulos: ninguno.
- Límites: `{ A: 2, B: 2, C: 2 }`.
- Aviso fijo en el portal: "Sin licencia" con el motivo.

### 4.5 Frontend

- Store de licencia cargado de `GET /api/license` después del login.
- Cada ítem del menú (`App.tsx`) puede declarar `module`; se oculta si no está licenciado.
  Forma de Onda declara `medidores`.
- Las tarjetas de medidores se ocultan sin `medidores`.
- Las tarjetas con `license: 'excedido'` muestran "Fuera de licencia".
- En Configuración, el botón "Agregar" se deshabilita con el mensaje del límite cuando el nivel
  está lleno.
- Pestaña **Configuración → Licencia**: ID de instalación con botón Copiar, cliente, módulos, uso
  por nivel (`B 18/20`). El superadmin ve además un campo para pegar una licencia nueva; el admin
  ve todo en solo lectura.

## 5. Réplica de oficina

- Planta expone `GET /api/replica/license` (mismo esquema de auth que `/api/replica/config`) que
  devuelve el texto de su `license.key`.
- weg-replica lo baja junto con `config.json` y el manual y lo guarda en su `config/license.key`.
- En modo réplica, weg-api verifica con `checkInstall: false`: valida la firma pero no el
  `installId`, porque la licencia es de planta. La réplica no aplica límites de dispositivos (no
  lee equipos).
- Si planta no tiene el módulo `replica`, `/api/replica/*` responde 403 y la oficina muestra
  "La licencia de planta no incluye réplica".

## 6. Herramienta de firma (`scripts/license.js`)

Usa `encode`/`decode` de `weg-api/src/services/license.js`. Nunca guarda claves en el repo.

- `keygen --out <dir>`: pide una frase de paso dos veces, crea `private.pem` cifrado con ella
  (PKCS#8 + AES-256, nativo de Node) y muestra la clave pública para pegar en `license.js`. Se
  ejecuta una sola vez. Se niega a sobrescribir un `private.pem` existente.
- `sign` pide la frase de paso para abrir la clave; nunca se pasa por argumento ni queda en el
  historial de la consola.
- `sign --key <private.pem> --id <uuid> --cliente <nombre> --modulos <a,b,…> --A <n> --B <n> --C <n>`:
  valida el UUID y los nombres de módulo, muestra el texto y agrega una línea a `emitidas.csv` en
  la carpeta de la clave (fecha, cliente, ID, módulos, límites).
- `show <texto>`: muestra el contenido. Si encuentra la clave pública, además verifica la firma.

Ampliar una licencia es firmar una nueva con los totales y pegarla encima.

## 7. Migración de planta y oficina

En cada VM, **antes** de actualizar a v1.3.0:

1. `uuidgen | sudo tee /opt/weg-scada/config/install-id`
2. En la PC del integrador: `node scripts/license.js sign --id <ese ID> --cliente Agriplus …`
3. Copiar el texto a `/opt/weg-scada/config/license.key`.
4. `sudo weg-scada update`.

La oficina necesita solo los pasos 1 y 4: baja la licencia de planta. Antes de desplegar, verificar
que cada VM corre master (ver el incidente del 2026-09-28).

No hay "modo heredado" para instalaciones viejas: sería una puerta trasera (borrar `license.key`
para quedar sin límites).

Clientes nuevos: instalan, ven el ID en Configuración → Licencia y reciben la licencia.

## 8. Pruebas

`node --test` en weg-api y en el poller.

- **Firma**: licencia válida pasa. Byte cambiado → `firma`. Otro ID → `otra-instalacion`. Otra
  clave → `firma`. Texto basura → `formato`. `v` desconocido → `version`. Todas caen en modo base.
- **Réplica**: `checkInstall: false` acepta la licencia de otro ID y sigue rechazando una firma mala.
- **Conteo**: niveles por tipo, deshabilitados no cuentan, medidor con `waveform` es C.
- **API**: `PUT` de config sobre el límite → 400; `/api/waveform` sin `medidores` → 403;
  `PUT /api/license` como admin → 403 y con texto inválido → 400 sin tocar el archivo.
- **Poller**: 22 variadores con límite B 20 → lee 20 y publica 2 como `excedido`.
- **Copias**: un test compara byte a byte las dos copias de `license.js`.

Prueba manual con docker-in-docker en WSL antes del release: instalación limpia en modo base con
ID visible; pegar licencia → aparecen los módulos; pegar una licencia menor → se apagan los equipos
de más y la config queda intacta.

## 9. Release

v1.3.0. Despliegue según la sección 7.
