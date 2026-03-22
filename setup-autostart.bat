@echo off
REM VMS360 - Otomatik Baslangic Kurulumu
REM Yonetici olarak calistirin!

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo HATA: Yonetici yetkisi gerekli!
    echo Sag tikla - "Yonetici olarak calistir"
    pause
    exit /b 1
)

echo ========================================
echo   VMS360 Otomatik Baslangic Kurulumu
echo ========================================
echo.

REM Eski gorevi sil (varsa)
schtasks /delete /tn "VMS360-Autostart" /f >nul 2>&1

REM Yeni Task Scheduler gorevi olustur
echo [1/2] Task Scheduler gorevi olusturuluyor...
schtasks /create ^
    /tn "VMS360-Autostart" ^
    /tr "\"C:\vms360\start-vms360.bat\"" ^
    /sc ONSTART ^
    /ru SYSTEM ^
    /rl HIGHEST ^
    /delay 0002:00 ^
    /f

if %errorLevel% neq 0 (
    echo HATA: Gorev olusturulamadi!
    pause
    exit /b 1
)

REM Masaustu kisayolu olustur
echo [2/2] Masaustu kisayolu olusturuluyor...
set DESKTOP=%PUBLIC%\Desktop
set SHORTCUT=%DESKTOP%\VMS360 Restart.lnk
set SCRIPT_PATH=C:\vms360\restart-vms360.bat

powershell -NoProfile -Command ^
    "$ws = New-Object -ComObject WScript.Shell; ^
     $sc = $ws.CreateShortcut('%SHORTCUT%'); ^
     $sc.TargetPath = 'cmd.exe'; ^
     $sc.Arguments = '/c \"C:\vms360\restart-vms360.bat\"'; ^
     $sc.WorkingDirectory = 'C:\vms360'; ^
     $sc.WindowStyle = 1; ^
     $sc.IconLocation = '%SystemRoot%\System32\shell32.dll,238'; ^
     $sc.Description = 'VMS360 Retail Panel Restart'; ^
     $sc.Save()"

echo.
echo ========================================
echo   Kurulum Tamamlandi!
echo ========================================
echo.
echo [OK] PC acilisinda VMS360 otomatik baslar
echo      (Docker Desktop'tan 2 dakika sonra)
echo.
echo [OK] Masaustunde "VMS360 Restart" kisayolu olusturuldu
echo      Cift tikla -^> kolayca yeniden baslat
echo.
echo NOT: Docker Desktop'in Windows baslangicindan
echo      acildigina emin olun (sistem tepsisi ayari).
echo.
pause
