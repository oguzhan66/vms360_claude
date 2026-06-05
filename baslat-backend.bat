@echo off
echo VMS360 Backend baslatiliyor...
cd /d c:\vms360\backend

if not exist venv (
    echo Virtual environment olusturuluyor...
    python -m venv venv
    echo Bagimliliklar yukleniyor...
    venv\Scripts\pip install -r requirements.txt
)

echo Backend baslatiliyor: http://localhost:8001
venv\Scripts\uvicorn server:app --host 0.0.0.0 --port 8001
