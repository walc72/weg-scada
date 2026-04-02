@echo off
REM ============================================================================
REM WEG SCADA - Daily Backup (Windows Task Scheduler)
REM
REM Schedule: Task Scheduler -> Create Basic Task -> Daily at 02:00
REM Action: Start a program -> this .bat file
REM ============================================================================

set BACKUP_DIR=%~dp0backups\%date:~6,4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%
set BACKUP_DIR=%BACKUP_DIR: =0%
mkdir "%BACKUP_DIR%" 2>nul

echo === WEG SCADA Backup %date% %time% ===
echo Backup dir: %BACKUP_DIR%

REM Backup InfluxDB
echo Backing up InfluxDB...
docker exec projects-influxdb-1 influx backup /tmp/influx-backup -t "u54oZUhFSS1ECuUvCtOYhxaEJ18mPPwqp8cZPZqkbrvs1NQ47OwH99SupjPWpkromjQOnL2nBAaaf8St9dkt1g=="
docker cp projects-influxdb-1:/tmp/influx-backup "%BACKUP_DIR%\influxdb"
docker exec projects-influxdb-1 rm -rf /tmp/influx-backup

REM Backup Node-RED flows
echo Backing up Node-RED flows...
docker cp projects-nodered-1:/data/flows.json "%BACKUP_DIR%\flows.json"
docker cp projects-nodered-1:/data/flows_cred.json "%BACKUP_DIR%\flows_cred.json" 2>nul

REM Backup config
echo Backing up config...
copy "%~dp0weg-modbus-poller\config.json" "%BACKUP_DIR%\config.json"

REM Backup Grafana dashboards
echo Backing up Grafana dashboards...
xcopy "%~dp0grafana" "%BACKUP_DIR%\grafana" /E /I /Q

echo === Backup complete: %BACKUP_DIR% ===

REM Keep last 14 backups, delete older
for /f "skip=14 delims=" %%d in ('dir /b /o-d "%~dp0backups\*" 2^>nul') do (
    echo Deleting old backup: %%d
    rmdir /s /q "%~dp0backups\%%d"
)
