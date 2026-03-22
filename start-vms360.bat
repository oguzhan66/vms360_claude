@echo off
REM VMS360 - Otomatik Baslangic Scripti
REM Bu script Task Scheduler tarafindan calistirilir

REM Docker Desktop'in hazir olmasini bekle
:wait_docker
docker info >nul 2>&1
if %errorLevel% neq 0 (
    timeout /t 5 /nobreak >nul
    goto wait_docker
)

REM Servisleri baslat
cd /d "C:\vms360"
docker compose up -d

exit /b 0
