@echo off
title VMS360 - Yeniden Baslatiliyor...
echo.
echo ========================================
echo   VMS360 Retail Panel - Restart
echo ========================================
echo.
echo Servisler durduruluyor...
cd /d "C:\vms360"
docker compose down
echo.
echo Servisler baslatiliyor...
docker compose up -d
echo.
echo ========================================
echo   VMS360 basarıyla yeniden baslatildi!
echo   Adres: http://localhost:3001
echo ========================================
echo.
timeout /t 4 /nobreak >nul
