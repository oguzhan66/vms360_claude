@echo off
title VMS360 - Baslatiliyor...
echo ============================================
echo   VMS360 Retail Panel - Baslatiliyor
echo ============================================
echo.

REM 8005 portunu temizle
echo Port 8005 kontrol ediliyor...
for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr :8005 ^| findstr LISTENING') do (
    echo Onceki oturum kapatiliyor (PID: %%a)...
    taskkill /PID %%a /F >nul 2>&1
)
timeout /t 1 /nobreak >nul

REM Backend + Frontend .exe baslat
echo VMS360 baslatiliyor...
start "VMS360" /MIN c:\vms360\dist\vms360-backend.exe

REM Hazir olmasini bekle
:WAIT
timeout /t 2 /nobreak >nul
curl -s http://localhost:8005/health >nul 2>&1
if errorlevel 1 goto WAIT

REM Tarayici ac
echo.
echo Tarayici aciliyor: http://localhost:8005
start http://localhost:8005

echo.
echo ============================================
echo   VMS360 calisiyor!  http://localhost:8005
echo   Kullanici: admin / Sifre: 12345
echo ============================================
