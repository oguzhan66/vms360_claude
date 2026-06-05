@echo off
echo VMS360 Node.js Backend baslatiliyor...

REM 8001 portunu kullanan islemi sonlandir
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8001 ^| findstr LISTENING') do (
    echo Port 8001 kapatiliyor (PID: %%a)...
    taskkill /PID %%a /F >nul 2>&1
)

timeout /t 1 /nobreak >nul

cd /d c:\vms360\backend-node
echo Backend baslatiliyor: http://localhost:8001
node server.js
