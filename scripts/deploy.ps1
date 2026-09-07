# ─── WEG SCADA Deploy Script ─────────────────────────────────────────────────
# Busca el repo, pull, reconstruye las imagenes afectadas, reinicia, verifica.
# Corre desde cualquier directorio en PowerShell.
#
# Nota: rebuild de imagen (no docker cp) — asi los cambios en package.json,
# Dockerfile o archivos nuevos (waveform.js, validate.js, etc.) tambien llegan.
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"

# 1. Encontrar repo
$REPO = $null
$candidates = @(
    "C:\Users\user\weg-scada",
    "C:\Users\$env:USERNAME\weg-scada",
    "$env:USERPROFILE\weg-scada",
    "C:\weg-scada"
)
foreach ($p in $candidates) {
    if (Test-Path "$p\nodered\docker-compose.yml") { $REPO = $p; break }
}
if (-not $REPO) {
    Write-Error "No se encontro el repo weg-scada. Rutas buscadas:`n$($candidates -join "`n")"
    exit 1
}
Write-Host "[1/6] Repo: $REPO" -ForegroundColor Cyan

# 2. Git pull (detecta que cambio)
Set-Location $REPO
Write-Host "[2/6] Git pull..." -ForegroundColor Cyan
$before = (git rev-parse HEAD).Trim()
git pull origin master
if ($LASTEXITCODE -ne 0) { Write-Error "Git pull fallo"; exit 1 }
$after = (git rev-parse HEAD).Trim()
$changed = if ($before -eq $after) { @() } else { (git diff --name-only $before $after) }

# 3. Rebuild frontend si cambio
Set-Location "$REPO\nodered"
if ($before -eq $after -or ($changed -match '^frontend-react/')) {
    Write-Host "[3/6] Rebuild frontend..." -ForegroundColor Cyan
    Push-Location "$REPO\frontend-react"
    npm ci --no-audit --no-fund
    npx vite build
    Pop-Location
    docker compose up -d frontend
} else {
    Write-Host "[3/6] Frontend sin cambios, se omite build" -ForegroundColor DarkGray
}

# 4. Rebuild imagenes de backend afectadas
Write-Host "[4/6] Rebuild imagenes de backend..." -ForegroundColor Cyan
if ($before -eq $after -or ($changed -match '^nodered/weg-modbus-poller/')) {
    Write-Host "  modbus-poller" -ForegroundColor White
    docker compose build modbus-poller
    docker compose up -d modbus-poller
}
if ($before -eq $after -or ($changed -match '^nodered/weg-api/')) {
    Write-Host "  weg-api" -ForegroundColor White
    docker compose build weg-api
    docker compose up -d weg-api
}
if ($changed -match '^nodered/(nginx|mosquitto|grafana)/') {
    Write-Host "  reiniciando frontend/mosquitto/grafana (config)" -ForegroundColor White
    docker compose up -d frontend mosquitto grafana
}

# 5. InfluxDB retention 365d
Write-Host "[5/6] Aplicando retention 365d a InfluxDB..." -ForegroundColor Cyan
docker exec weg-influxdb influx bucket update --name weg_drives --retention 365d 2>&1 | Out-Null
Write-Host "  Retention OK"

# 6. Verificacion final
Write-Host "`n[6/6] Estado final:" -ForegroundColor Cyan
docker compose ps --format "table {{.Name}}`t{{.Status}}"

Write-Host "`n--- Logs poller (ultimos 10) ---" -ForegroundColor White
docker logs weg-modbus-poller 2>&1 | Select-Object -Last 10

Write-Host "`n[DONE] Deploy completado." -ForegroundColor Green
