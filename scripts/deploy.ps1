# ─── WEG SCADA Deploy Script ─────────────────────────────────────────────────
# Busca el repo, pull, copia src al contenedor, reinicia, verifica todo.
# Corre desde cualquier directorio en PowerShell.
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
Write-Host "[1/7] Repo: $REPO" -ForegroundColor Cyan

# 2. Git pull
Set-Location $REPO
Write-Host "[2/7] Git pull..." -ForegroundColor Cyan
git pull origin master
if ($LASTEXITCODE -ne 0) { Write-Error "Git pull fallo"; exit 1 }

# 3. Verificar contenedor poller
Write-Host "[3/7] Verificando contenedor weg-modbus-poller..." -ForegroundColor Cyan
$poller = docker ps --filter "name=weg-modbus-poller" --format "{{.Names}}" 2>$null
if (-not $poller) {
    Write-Host "  Contenedor no existe, levantando stack..." -ForegroundColor Yellow
    Set-Location "$REPO\nodered"
    docker compose up -d
    Start-Sleep -Seconds 20
    Set-Location $REPO
}

# 4. Copiar src actualizado al contenedor
Write-Host "[4/7] Copiando src al contenedor..." -ForegroundColor Cyan
$SRC = "$REPO\nodered\weg-modbus-poller\src"
foreach ($f in @("index.js", "connections.js", "parser.js")) {
    $src_file = "$SRC\$f"
    if (Test-Path $src_file) {
        docker cp $src_file "weg-modbus-poller:/app/src/$f"
        Write-Host "  Copiado: $f"
    } else {
        Write-Host "  ADVERTENCIA: No encontrado $src_file" -ForegroundColor Yellow
    }
}

# 5. Reiniciar poller
Write-Host "[5/7] Reiniciando weg-modbus-poller..." -ForegroundColor Cyan
docker restart weg-modbus-poller
Start-Sleep -Seconds 15

# 6. InfluxDB retention 365d
Write-Host "[6/7] Aplicando retention 365d a InfluxDB..." -ForegroundColor Cyan
docker exec weg-influxdb influx bucket update --name weg_drives --retention 365d 2>&1
Write-Host "  Retention OK"

# 7. Verificacion final
Write-Host "`n[7/7] Estado final:" -ForegroundColor Cyan
Write-Host "`n--- Contenedores ---" -ForegroundColor White
docker ps --format "table {{.Names}}`t{{.Status}}"

Write-Host "`n--- Logs poller (ultimos 15) ---" -ForegroundColor White
docker logs weg-modbus-poller 2>&1 | Select-Object -Last 15

Write-Host "`n--- MQTT meters ---" -ForegroundColor White
$job = Start-Job { docker exec weg-mosquitto mosquitto_sub -t "weg/meters/#" -C 1 -v -W 5 2>&1 }
Wait-Job $job -Timeout 8 | Out-Null
$result = Receive-Job $job 2>&1
Remove-Job $job -Force 2>&1 | Out-Null
if ($result) { Write-Host $result -ForegroundColor Green }
else { Write-Host "  Sin mensajes MQTT en weg/meters/#" -ForegroundColor Yellow }

Write-Host "`n[DONE] Deploy completado." -ForegroundColor Green
