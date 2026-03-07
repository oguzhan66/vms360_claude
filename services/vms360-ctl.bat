@echo off
REM VMS360 Windows Servis Yonetimi

if "%1"=="" goto usage

if "%1"=="start" (
    echo VMS360 servisleri baslatiliyor...
    net start VMS360-Backend
    timeout /t 2 /nobreak >nul
    net start VMS360-Frontend
    echo Servisler baslatildi.
    goto end
)

if "%1"=="stop" (
    echo VMS360 servisleri durduruluyor...
    net stop VMS360-Frontend
    net stop VMS360-Backend
    echo Servisler durduruldu.
    goto end
)

if "%1"=="restart" (
    echo VMS360 servisleri yeniden baslatiliyor...
    net stop VMS360-Frontend
    net stop VMS360-Backend
    timeout /t 2 /nobreak >nul
    net start VMS360-Backend
    timeout /t 2 /nobreak >nul
    net start VMS360-Frontend
    echo Servisler yeniden baslatildi.
    goto end
)

if "%1"=="status" (
    echo ======== VMS360 Servis Durumu ========
    echo.
    sc query VMS360-Backend
    echo.
    sc query VMS360-Frontend
    goto end
)

if "%1"=="logs" (
    echo Backend loglari aciliyor...
    start notepad C:\vms360\logs\backend.log
    goto end
)

:usage
echo VMS360 Windows Servis Yonetimi
echo.
echo Kullanim: vms360-ctl.bat {start^|stop^|restart^|status^|logs}
echo.
echo Komutlar:
echo   start   - Tum servisleri baslat
echo   stop    - Tum servisleri durdur
echo   restart - Tum servisleri yeniden baslat
echo   status  - Servis durumlarini goster
echo   logs    - Log dosyasini ac
goto end

:end
