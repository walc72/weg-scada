@echo off
REM ============================================================================
REM WEG SCADA - Daily Backup (Windows Task Scheduler)
REM
REM Schedule: Task Scheduler -> Create Basic Task -> Daily at 02:00
REM Action: Start a program -> this .bat file
REM
REM El token de InfluxDB se lee desde .env (nunca hardcodearlo aca).
REM ============================================================================

setlocal enabledelayedexpansion

set BACKUP_DIR=%~dp0backups\%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%
set BACKUP_DIR=%BACKUP_DIR: =0%
mkdir "%BACKUP_DIR%" 2>nul

echo === WEG SCADA Backup %date% %time% ===
echo Backup dir: %BACKUP_DIR%

REM Leer INFLUXDB_TOKEN desde .env
set INFLUXDB_TOKEN=
for /f "usebackq tokens=1,* delims==" %%a in ("%~dp0.env") do (
    if "%%a"=="INFLUXDB_TOKEN" set INFLUXDB_TOKEN=%%b
)
if "%INFLUXDB_TOKEN%"=="" (
    echo ERROR: INFLUXDB_TOKEN no encontrado en %~dp0.env
    exit /b 1
)

REM Backup InfluxDB (backup nativo consistente)
echo Backing up InfluxDB...
docker exec weg-influxdb influx backup /tmp/influx-backup -t "%INFLUXDB_TOKEN%"
if errorlevel 1 (
    echo ERROR: fallo el backup de InfluxDB
    exit /b 1
)
docker cp weg-influxdb:/tmp/influx-backup "%BACKUP_DIR%\influxdb"
docker exec weg-influxdb rm -rf /tmp/influx-backup

REM Backup config (la config viva montada en los contenedores)
echo Backing up config...
copy "%~dp0config\config.json" "%BACKUP_DIR%\config.json"

REM Backup Grafana dashboards
echo Backing up Grafana dashboards...
xcopy "%~dp0grafana" "%BACKUP_DIR%\grafana" /E /I /Q

echo === Backup complete: %BACKUP_DIR% ===

REM Keep last 14 backups, delete older
for /f "skip=14 delims=" %%d in ('dir /b /o-d "%~dp0backups\*" 2^>nul') do (
    echo Deleting old backup: %%d
    rmdir /s /q "%~dp0backups\%%d"
)
