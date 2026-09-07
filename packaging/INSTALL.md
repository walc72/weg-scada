# WEG SCADA — Instalación pre-compilada (Windows + Docker Desktop)

Este paquete trae **todo pre-construido**: las imágenes Docker de `weg-api` y
`modbus-poller` ya compiladas y el frontend ya buildeado. **No hace falta Node
ni compilar nada** — solo cargar las imágenes y levantar el stack.

## Requisitos

- Windows con **Docker Desktop** instalado y **corriendo** (backend WSL2).
- Conexión a internet la primera vez (para bajar InfluxDB, Grafana, Mosquitto y
  Nginx desde Docker Hub — son imágenes públicas).

## Pasos

1. Descomprimí este paquete en una carpeta, p.ej. `C:\weg-scada`.

2. Abrí **PowerShell** en esa carpeta y ejecutá:

   ```powershell
   .\install.ps1
   ```

   El instalador:
   - Carga las imágenes pre-construidas (`docker load`).
   - Crea el archivo `.env` desde la plantilla y lo abre en Notepad para que
     completes las credenciales (**INFLUXDB_TOKEN**, **AUTH_PASSWORD**,
     **GF_ADMIN_PASSWORD** como mínimo).
   - Levanta el stack con `docker compose up -d`.

   > Si PowerShell bloquea el script, ejecutá una vez:
   > `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`

3. Accedé:
   - **SCADA**: http://localhost:9090
   - **Grafana**: http://localhost:3000

## Acceso a los equipos industriales

- Si este host es el **subnet router** de la red industrial (p.ej. PME-SERVER,
  conectado a 192.168.10.x), el SCADA llega a esos drives/medidores **de forma
  nativa** por la LAN — no hace falta nada extra.
- Para equipos en **otros sitios/redes** (p.ej. Buey Rodeo 192.168.3.x, o el
  reconectador 192.168.20.x), este host necesita **Tailscale** con rutas:

  ```
  tailscale up --accept-routes --accept-dns=false
  ```

  y las rutas aprobadas en el admin console de la tailnet (y el subnet router
  del sitio remoto online).

## Configuración

- Los drives y medidores se administran desde la pestaña **Configuración** de la
  app (agregar/editar/borrar, con validación).
- La config viva es `config\config.json`. Ya viene con los 4 medidores PM y los
  drives WEG cargados; ajustá las IPs según tu red.

## Actualizar / detener

```powershell
docker compose ps               # ver estado
docker compose logs -f weg-api  # ver logs
docker compose down             # detener (conserva los datos en volúmenes)
docker compose up -d            # volver a levantar
```

Los datos (InfluxDB, Grafana) viven en volúmenes de Docker y persisten entre
reinicios.
