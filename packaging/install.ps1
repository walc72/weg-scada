# =============================================================================
# WEG SCADA - Instalador pre-compilado (Windows + Docker Desktop)
# No requiere compilar: carga las imagenes ya construidas y levanta el stack.
# =============================================================================
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

Write-Host "=== WEG SCADA - Instalacion ===" -ForegroundColor Cyan

# 0. Verificar Docker
try { docker version --format '{{.Server.Version}}' | Out-Null }
catch { Write-Error "Docker no esta corriendo. Abri Docker Desktop y volve a intentar."; exit 1 }

# 1. Cargar imagenes pre-construidas
Write-Host "[1/4] Cargando imagenes Docker (puede tardar)..." -ForegroundColor Cyan
docker load -i "images\weg-scada-images.tar.gz"

# 2. Preparar .env
if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "[2/4] Se creo el archivo .env desde la plantilla." -ForegroundColor Yellow
    Write-Host "      IMPORTANTE: completá INFLUXDB_TOKEN, AUTH_PASSWORD y GF_ADMIN_PASSWORD." -ForegroundColor Yellow
    notepad .env
    Read-Host "      Presioná Enter cuando hayas guardado el .env para continuar"
} else {
    Write-Host "[2/4] .env ya existe, se conserva." -ForegroundColor DarkGray
}

# 3. Levantar el stack
Write-Host "[3/4] Levantando el stack..." -ForegroundColor Cyan
docker compose up -d

# 4. Estado
Start-Sleep -Seconds 8
Write-Host "[4/4] Estado de los contenedores:" -ForegroundColor Cyan
docker compose ps

Write-Host ""
Write-Host "=== Listo ===" -ForegroundColor Green
Write-Host "  SCADA:   http://localhost:9090" -ForegroundColor Green
Write-Host "  Grafana: http://localhost:3000" -ForegroundColor Green
Write-Host ""
Write-Host "Nota: para llegar a equipos en OTRAS redes/sitios (Tailscale), habilita" -ForegroundColor Yellow
Write-Host "      'tailscale up --accept-routes' en este host y aproba las rutas." -ForegroundColor Yellow
