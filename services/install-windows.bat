@echo off
REM VMS360 Retail Panel - Windows Servis Kurulum Scripti
REM Yönetici olarak çalıştırın
REM
REM Bu script NSSM (Non-Sucking Service Manager) kullanır
REM https://nssm.cc/download

setlocal enabledelayedexpansion

echo ========================================
echo   VMS360 Retail Panel - Windows Kurulum
echo ========================================
echo.

REM Yönetici kontrolü
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo HATA: Bu script yonetici olarak calistirilmali!
    echo Sag tikla -^> "Yonetici olarak calistir"
    pause
    exit /b 1
)

REM NSSM kontrolü
where nssm >nul 2>&1
if %errorLevel% neq 0 (
    echo HATA: NSSM bulunamadi!
    echo Lutfen https://nssm.cc/download adresinden indirin
    echo ve PATH'e ekleyin.
    pause
    exit /b 1
)

REM Değişkenler
set INSTALL_DIR=C:\vms360
set CURRENT_DIR=%~dp0..

echo Kurulum dizini: %INSTALL_DIR%
echo.

REM 1. Dizinleri oluştur
echo [1/6] Dizinler olusturuluyor...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\backend" mkdir "%INSTALL_DIR%\backend"
if not exist "%INSTALL_DIR%\frontend" mkdir "%INSTALL_DIR%\frontend"
if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"

REM 2. Backend kopyala
echo [2/6] Backend kopyalaniyor...
xcopy /E /I /Y "%CURRENT_DIR%\backend\*" "%INSTALL_DIR%\backend\"

REM 3. Frontend kopyala
echo [3/6] Frontend kopyalaniyor...
xcopy /E /I /Y "%CURRENT_DIR%\frontend\*" "%INSTALL_DIR%\frontend\"

REM 4. Backend kurulumu
echo [4/6] Backend kuruluyor...
cd /d "%INSTALL_DIR%\backend"
python -m venv venv
call venv\Scripts\activate
pip install --upgrade pip
pip install -r requirements.txt
call venv\Scripts\deactivate

if not exist ".env" (
    copy .env.example .env
    echo .env dosyasi olusturuldu. Lutfen MONGO_URL ayarlayin!
)

REM 5. Frontend kurulumu
echo [5/6] Frontend kuruluyor...
cd /d "%INSTALL_DIR%\frontend"
if not exist ".env" (
    copy .env.example .env
    echo REACT_APP_BACKEND_URL=http://localhost:8001> .env
)
call yarn install
call yarn build

REM 6. Windows servisleri oluştur
echo [6/6] Windows servisleri olusturuluyor...

REM Backend servisi
nssm install VMS360-Backend "%INSTALL_DIR%\backend\venv\Scripts\python.exe"
nssm set VMS360-Backend AppParameters "-m uvicorn server:app --host 0.0.0.0 --port 8001"
nssm set VMS360-Backend AppDirectory "%INSTALL_DIR%\backend"
nssm set VMS360-Backend AppStdout "%INSTALL_DIR%\logs\backend.log"
nssm set VMS360-Backend AppStderr "%INSTALL_DIR%\logs\backend-error.log"
nssm set VMS360-Backend Description "VMS360 Retail Panel Backend API"
nssm set VMS360-Backend Start SERVICE_AUTO_START

REM Frontend servisi (serve ile)
cd /d "%INSTALL_DIR%\frontend"
call npm install -g serve
nssm install VMS360-Frontend "serve"
nssm set VMS360-Frontend AppParameters "-s build -l 3000"
nssm set VMS360-Frontend AppDirectory "%INSTALL_DIR%\frontend"
nssm set VMS360-Frontend AppStdout "%INSTALL_DIR%\logs\frontend.log"
nssm set VMS360-Frontend AppStderr "%INSTALL_DIR%\logs\frontend-error.log"
nssm set VMS360-Frontend Description "VMS360 Retail Panel Frontend"
nssm set VMS360-Frontend Start SERVICE_AUTO_START

echo.
echo ========================================
echo   Kurulum Tamamlandi!
echo ========================================
echo.
echo Servisleri baslatmak icin:
echo   net start VMS360-Backend
echo   net start VMS360-Frontend
echo.
echo Veya Windows Hizmetleri'nden yonetin:
echo   services.msc
echo.
echo Tarayicida acin: http://localhost:3000
echo Giris: admin / 12345
echo.
echo ONEMLI: Production'da sifreleri degistirin!
echo.
pause
