# Herramienta gráfica de licencias — Diseño

Fecha: 2026-10-22 · Estado: aprobado en conversación, pendiente revisión de la spec escrita
Contexto: `2026-10-22-licencias-design.md` (formato de la licencia, `scripts/license.js`).

## 1. Problema y objetivo

Hoy las licencias se firman con `scripts/license.js sign` desde una consola, y en la PC del
integrador eso exige Docker en WSL porque no hay Node en Windows. Además, para ampliar la licencia
de un cliente hay que recordar qué tenía y volver a tipear todo.

Objetivo: una página local que el integrador abre con doble clic para firmar licencias nuevas y
modificar las existentes eligiendo al cliente de una lista, sin instalar nada ni usar comandos.
Cada licencia firmada queda guardada.

### Criterios de éxito

- Abrir `licencias.html` con doble clic en Edge o Chrome, elegir `C:\licencias-weg`, escribir la
  frase y firmar, sin comandos ni instalaciones.
- La licencia que firma la página la acepta el SCADA (`verify` de `license.js`) exactamente igual
  que una firmada por `scripts/license.js`.
- Ampliar la licencia de un cliente: elegirlo en la lista, cambiar módulos o límites y firmar.
- Cada licencia queda en `emitidas.csv` (con el texto) y como `.txt` en `licencias\`.
- Si la frase es incorrecta o la firma no verifica, no se guarda nada y se avisa.

### Fuera de alcance

- Crear la clave (`keygen` sigue por comando; se usa una sola vez).
- Revocar licencias entregadas (son perpetuas; se baja firmando una menor).
- Enviar la licencia al cliente.
- Editar o borrar filas del historial desde la página.
- Firefox (no implementa `showDirectoryPicker`).

## 2. Entrega y ubicación

- Archivo único `scripts/licencias.html` en el repo: HTML + CSS + JS inline, sin dependencias ni
  recursos externos (funciona sin internet).
- Se copia a `C:\licencias-weg\licencias.html` y se abre desde ahí. El pie muestra la versión
  (`v1`); al cambiar, se vuelve a copiar.
- Va en la rama `feat/licencias` (PR #77), antes del merge, para que la migración de planta ya se
  firme con la página.
- La herramienta de comandos (`scripts/license.js`) se mantiene y escribe el mismo historial.

## 3. Uso

1. **Carpeta.** Botón "Elegir carpeta" → `showDirectoryPicker({ mode: 'readwrite' })`. El handle se
   guarda en IndexedDB; en las siguientes aperturas se ofrece "Usar C:\licencias-weg" y solo se
   pide confirmar el permiso (`requestPermission`). La carpeta debe contener `private.pem`; si no,
   se avisa "No encuentro private.pem en esta carpeta".
2. **Frase de paso.** Campo de contraseña; con ella se descifra `private.pem`. La clave descifrada
   queda en memoria (CryptoKey no extraíble) mientras la pestaña esté abierta; la frase no se
   guarda en ningún lado. Error → "Frase de paso incorrecta".
3. **Lista de clientes.** Leída de `emitidas.csv`, una fila por `(cliente, installId)` con la
   licencia más reciente: cliente, ID (8 primeros caracteres, completo al pasar el mouse), fecha,
   módulos y límites. Botón **Modificar** por fila; botón **Nueva licencia** arriba. Si el CSV no
   existe, la lista está vacía con el texto "Todavía no hay licencias emitidas".
4. **Formulario.**
   - Cliente (obligatorio), ID de instalación (formato UUID, se pasa a minúsculas), una casilla
     por cada módulo (`medidores`, `caudales`, `unifilar`, `generadores`, `comunicaciones`,
     `replica`, `backup`, con nombre legible), límites A, B, C (enteros ≥ 0).
   - "Modificar" carga los valores de la última licencia de esa fila; el ID queda fijo.
   - Resumen de cambios antes de firmar: "B 18 → 23", "+ generadores", "− backup"; en una
     licencia nueva, el resumen lista todo.
   - Botón **Firmar y guardar**.
5. **Resultado.** El texto de la licencia con botón **Copiar** (`navigator.clipboard`, con
   alternativa de seleccionar el texto) y el nombre del `.txt` guardado.
6. **Verificar.** Pestaña aparte: pegar un texto → muestra cliente, ID, fecha, módulos, límites y
   "Firma válida" / "Firma inválida" / "No es una licencia (formato)", con la clave pública de
   producción. No necesita carpeta ni frase.

## 4. Criptografía

- **Clave privada:** el PEM de `keygen` es `ENCRYPTED PRIVATE KEY` (PKCS#8 cifrado, PBES2 con
  PBKDF2-HMAC-SHA256 y AES-256-CBC). La página lo decodifica con un lector DER mínimo, toma salt,
  iteraciones, PRF e IV de los parámetros PBES2, deriva la clave con `crypto.subtle.deriveBits`
  (PBKDF2), descifra con `AES-CBC` y la importa con `importKey('pkcs8', …, 'Ed25519', false,
  ['sign'])`. Un PRF o cifrado distinto del esperado → error "Formato de clave no soportado".
- **Formato:** idéntico a `license.js`: payload `{ v: 1, installId, cliente, emitida, modulos,
  limites: { A, B, C } }` en ese orden de campos; texto `base64url(JSON) + "." +
  base64url(firma Ed25519 de los bytes UTF-8 del JSON)`.
- **Autoverificación:** antes de guardar, la página verifica la firma con la clave pública de
  producción (la misma constante PEM que `license.js`, copiada) y que el `installId` coincida. Si
  falla, no guarda nada y muestra "La firma no coincide con la clave pública del SCADA".
- **Fecha:** `emitida` es la fecha **local** (YYYY-MM-DD). `scripts/license.js` se corrige para
  usar también la fecha local.

## 5. Archivos

- **`emitidas.csv`:** cabecera `fecha,cliente,installId,modulos,A,B,C,licencia`; módulos unidos
  con `|`; campos con coma, comilla o salto de línea entre comillas (RFC 4180). Si el archivo
  existe con la cabecera vieja (sin `licencia`), al primer guardado se reescribe la cabecera con la
  columna nueva y las filas viejas quedan con `licencia` vacía. Se escribe el archivo completo
  (lectura + agregado + escritura), sin perder filas. `scripts/license.js` escribe la misma
  columna.
- **Filas viejas sin texto:** se listan; "Modificar" carga sus datos pero no hay texto anterior.
- **`.txt`:** en `licencias\` (se crea si no existe), nombre
  `<Cliente>_<installId[0..8]>_<fecha>.txt`; en el nombre del cliente, todo lo que no sea letra,
  número, `-` o `_` se reemplaza por `_`; si el archivo existe se agrega `-2`, `-3`… Contenido: el
  texto de la licencia y una línea final.
- El orden de guardado es: firmar → autoverificar → escribir `.txt` → escribir CSV. Si falla la
  escritura, se muestra el error y el texto igual queda en pantalla para copiar.

## 6. Estructura y pruebas

- La lógica sin interfaz (lector DER y descifrado de la clave, armado y firma de la licencia,
  verificación, CSV, nombre de archivo, resumen de cambios) va en un bloque
  `<script id="core">` del HTML que expone `window.LicCore` y no toca el DOM.
- Pruebas automáticas (`node:test`, en `nodered/weg-api/test/licenciasHtml.test.js`, que CI ya
  corre): extraen el bloque `core` del HTML y lo ejecutan en `vm` con el `crypto.webcrypto` de Node.
  - Una clave creada con `keygen` de `scripts/license.js` se abre con la frase correcta; con otra
    frase da "Frase de paso incorrecta".
  - Una licencia firmada por la página la acepta `verify` de `license.js` (con la pública de la
    clave de prueba), y el texto es idéntico al de `signLicense` para el mismo payload.
  - La autoverificación rechaza una firma hecha con otra clave.
  - CSV: ida y vuelta con comas, comillas y saltos de línea en el cliente; migración de la
    cabecera vieja; la lista agrupa por `(cliente, installId)` y toma la más reciente.
  - Nombre de archivo: caracteres raros y `-2` cuando existe.
  - Resumen de cambios: límites y módulos agregados y quitados.
  - La constante de clave pública del HTML es igual a `PUBLIC_KEY` de `license.js`.
- Prueba manual (usuario, en su PC con la clave real): abrir la página desde `C:\licencias-weg`,
  firmar una licencia "Prueba", verla en la lista y en `licencias\`, y verificarla.
