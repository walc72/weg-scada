# packaging/ — Paquete pre-compilado

Herramienta para generar el paquete de instalación **pre-compilado** (Windows +
Docker Desktop), pensado para máquinas donde compilar imágenes da problemas
(credenciales de Docker Desktop, sin Node, etc.).

## Generar el paquete

Desde la raíz del repo, con Docker corriendo:

```bash
bash packaging/build-bundle.sh [version]     # default: 1.0.0
```

Produce `weg-scada-<version>-prebuilt-windows.zip` en la raíz del repo. El script:

1. Construye y taggea las imágenes `weg-scada-weg-api:<ver>` y
   `weg-scada-modbus-poller:<ver>`.
2. Las guarda comprimidas (`docker save | gzip`).
3. Buildea el frontend en un contenedor `node:20`.
4. Transforma el `docker-compose.yml` (`build:` → `image:`, dist bundleado).
5. Copia configs (nginx, mosquitto, grafana), el `config.json` template, el
   `.env.example`, el instalador y la guía.
6. Empaqueta todo en el `.zip`.

## Contenido del paquete

- `install.ps1` — instalador para la PC destino (carga imágenes + levanta).
- `INSTALL.md` — guía de instalación para el usuario final.
- `docker-compose.yml` — versión pre-built (sin `build:`).
- `images/weg-scada-images.tar.gz` — imágenes custom ya construidas.
- `frontend/dist/` — frontend ya buildeado.
- `config/`, `nginx/`, `mosquitto/`, `grafana/`, `.env.example`.

## Publicar en un release

```bash
gh release upload v<version> weg-scada-<version>-prebuilt-windows.zip
```

## Archivos

- `build-bundle.sh` — generador del paquete (este es el único que se ejecuta).
- `install.ps1` / `INSTALL.md` — se **copian dentro** del paquete; editalos acá.
