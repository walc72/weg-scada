@echo off
REM ============================================================================
REM WEG SCADA - Instalador Automatico
REM
REM Ejecutar como Administrador en la PC destino (pme-server)
REM Requisitos: Windows 10/11 Pro, Internet
REM
REM Instala: Git, Docker Desktop, clona repo, configura IPs locales, levanta stack
REM ============================================================================

echo.
echo ============================================
echo   WEG SCADA - Instalador Automatico
echo ============================================
echo.

REM Check admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: Ejecutar como Administrador
    echo Click derecho -^> Ejecutar como administrador
    pause
    exit /b 1
)

REM ── 1. Install Git if not present ──
where git >nul 2>&1
if %errorLevel% neq 0 (
    echo [1/5] Instalando Git...
    powershell -Command "Invoke-WebRequest -Uri 'https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.2/Git-2.47.1.2-64-bit.exe' -OutFile '%TEMP%\git-installer.exe'"
    %TEMP%\git-installer.exe /VERYSILENT /NORESTART
    set "PATH=%PATH%;C:\Program Files\Git\bin"
    echo Git instalado.
) else (
    echo [1/5] Git ya instalado.
)

REM ── 2. Install Docker Desktop if not present ──
where docker >nul 2>&1
if %errorLevel% neq 0 (
    echo [2/5] Instalando Docker Desktop...
    echo      Esto puede tardar varios minutos...
    powershell -Command "Invoke-WebRequest -Uri 'https://desktop.docker.com/win/main/amd64/Docker%%20Desktop%%20Installer.exe' -OutFile '%TEMP%\docker-installer.exe'"
    %TEMP%\docker-installer.exe install --quiet --accept-license
    echo.
    echo ============================================
    echo   Docker instalado. REINICIAR LA PC.
    echo   Despues de reiniciar, ejecutar este
    echo   script de nuevo.
    echo ============================================
    pause
    exit /b 0
) else (
    echo [2/5] Docker ya instalado.
)

REM ── 3. Clone repo ──
set INSTALL_DIR=C:\WEG-SCADA
if not exist "%INSTALL_DIR%" (
    echo [3/5] Clonando repositorio...
    git clone https://github.com/walc72/weg-scada.git "%INSTALL_DIR%"
) else (
    echo [3/5] Actualizando repositorio...
    cd /d "%INSTALL_DIR%"
    git pull origin master
)

cd /d "%INSTALL_DIR%\nodered"

REM ── 4. Configure for local network ──
echo [4/5] Configurando para red local...

REM Create .env from example if not exists
if not exist ".env" (
    copy .env.example .env
    echo      .env creado desde .env.example - EDITAR credenciales despues
)

REM Write local config.json (direct IPs, no Tailscale proxies)
echo { > weg-modbus-poller\config.json
echo   "pollIntervalMs": 2000, >> weg-modbus-poller\config.json
echo   "influxWriteIntervalMs": 10000, >> weg-modbus-poller\config.json
echo   "mqtt": { >> weg-modbus-poller\config.json
echo     "broker": "mqtt://weg-mosquitto:1883", >> weg-modbus-poller\config.json
echo     "topicPrefix": "weg/drives", >> weg-modbus-poller\config.json
echo     "statusTopic": "weg/status" >> weg-modbus-poller\config.json
echo   }, >> weg-modbus-poller\config.json
echo   "influxdb": { >> weg-modbus-poller\config.json
echo     "url": "http://influxdb:8086", >> weg-modbus-poller\config.json
echo     "org": "tecnoelectric", >> weg-modbus-poller\config.json
echo     "bucket": "weg_drives", >> weg-modbus-poller\config.json
echo     "token": "weg-influxdb-token-2026" >> weg-modbus-poller\config.json
echo   }, >> weg-modbus-poller\config.json
echo   "gateways": [ >> weg-modbus-poller\config.json
echo     { "name": "PLC M241 Agriplus", "ip": "192.168.10.40", "port": 502, "site": "Agriplus" }, >> weg-modbus-poller\config.json
echo     { "name": "Gateway Agrocaraya", "ip": "192.168.10.70", "port": 502, "site": "Agrocaraya" } >> weg-modbus-poller\config.json
echo   ], >> weg-modbus-poller\config.json
echo   "devices": [ >> weg-modbus-poller\config.json
echo     { "name": "SAER 1", "type": "CFW900", "site": "Agriplus", "ip": "192.168.10.100", "port": 502, "unitId": 1 }, >> weg-modbus-poller\config.json
echo     { "name": "SAER 2", "type": "CFW900", "site": "Agriplus", "ip": "192.168.10.101", "port": 502, "unitId": 1 }, >> weg-modbus-poller\config.json
echo     { "name": "SAER 3", "type": "CFW900", "site": "Agriplus", "ip": "192.168.10.102", "port": 502, "unitId": 1 }, >> weg-modbus-poller\config.json
echo     { "name": "SAER 4", "type": "CFW900", "site": "Agriplus", "ip": "192.168.10.103", "port": 502, "unitId": 1 }, >> weg-modbus-poller\config.json
echo     { "name": "SAER 8", "type": "SSW900", "site": "Agriplus", "ip": "192.168.10.40", "port": 502, "unitId": 1, "regOffset": 0, "statusOffset": 140 }, >> weg-modbus-poller\config.json
echo     { "name": "SAER 5", "type": "SSW900", "site": "Agriplus", "ip": "192.168.10.40", "port": 502, "unitId": 1, "regOffset": 70, "statusOffset": 152 }, >> weg-modbus-poller\config.json
echo     { "name": "SSW900 Agrocaraya", "type": "SSW900", "site": "Agrocaraya", "ip": "192.168.10.70", "port": 502, "unitId": 4 } >> weg-modbus-poller\config.json
echo   ] >> weg-modbus-poller\config.json
echo } >> weg-modbus-poller\config.json

echo      Config local generado (IPs directas 192.168.10.x)

REM ── 5. Build and start ──
echo [5/5] Levantando stack Docker...
echo      Esto puede tardar varios minutos la primera vez...

docker compose up -d --build

echo.
echo ============================================
echo   WEG SCADA - Instalacion completa!
echo.
echo   Dashboard:  http://localhost:1880/dashboard
echo   Grafana:    http://localhost:3000
echo   API:        http://localhost:3200
echo.
echo   IMPORTANTE: Editar nodered\.env con las
echo   credenciales correctas.
echo ============================================
pause
