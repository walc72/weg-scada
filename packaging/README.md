# packaging/ — instalador y releases

Cómo se instala y actualiza WEG SCADA en un servidor sin compilar nada.

## Para instalar

```bash
curl -fsSL https://github.com/walc72/weg-scada/releases/latest/download/install.sh | sudo bash
```

Ver la sección *Instalación rápida* del [README principal](../README.md).

## Cómo se publica un release

1. Crear y pushear un tag `vX.Y.Z` desde `master`:
   ```bash
   git tag -a v1.2.1 -m "v1.2.1 — ..." && git push origin v1.2.1
   ```
2. El workflow [`release.yml`](../.github/workflows/release.yml):
   - construye y publica las imágenes en `ghcr.io/walc72/weg-scada-<servicio>:<versión>` (y `:latest` si es estable): `api`, `poller`, `agent`, `backup`, `replica` y `frontend`, este último con el build de Vite adentro;
   - arma el paquete con `make-release.sh`;
   - sube al release `weg-scada-<versión>.tar.gz` e `install.sh`. Si el release no existe, lo crea con notas automáticas, que después se pueden editar.
3. Un tag con sufijo (`v1.3.0-rc.1`) se publica como *pre-release* y no mueve `:latest`.

También se puede correr a mano (*Actions → Release → Run workflow*): publica las imágenes con la etiqueta indicada (por ejemplo `edge`) y deja el paquete como artifact, sin tocar releases.

> **Primera publicación:** GitHub crea los paquetes de ghcr.io como privados. Hay que pasarlos a **Public** una sola vez (*Package settings → Change visibility*) para que los servidores los bajen sin credenciales.

## Archivos

| Archivo | Qué es |
|---|---|
| `install.sh` | Instalador (se publica suelto en cada release). |
| `weg-scada` | Comando de administración: status, logs, update, superadmin… |
| `make-release.sh` | Arma `weg-scada-<ver>.tar.gz`: compose con imágenes publicadas (sin `build:`), configs de nginx/mosquitto/grafana, plantilla de `config.json`, `.env.example` y `weg-scada`. |
| `config.template.json` | `config.json` inicial de una planta nueva (sin equipos). |

## Probar sin publicar

```bash
bash packaging/make-release.sh prueba out/
# imágenes locales con el mismo nombre, p.ej.:
docker build -t ghcr.io/walc72/weg-scada-api:prueba nodered/weg-api   # (y el resto)
sudo WEG_VERSION=prueba WEG_PACKAGE=out/weg-scada-prueba.tar.gz bash out/install.sh
```

Si no puede bajar las imágenes pero ya están en el equipo, el instalador sigue con esas.

## Layout en el servidor (`/opt/weg-scada`)

```
.env                    claves internas, WEG_VERSION (modo 600)
docker-compose.yml      (+ docker-compose.replica.yml en réplica, vía COMPOSE_FILE)
config/                 config.json, settings.json (usuarios, SMTP, hora del reporte)
reports/  backups/      PDFs del reporte diario y backups de InfluxDB
nginx/ mosquitto/ grafana/
```
