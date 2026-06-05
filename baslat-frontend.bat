@echo off
echo VMS360 Frontend baslatiliyor...
cd /d c:\vms360\frontend

if not exist node_modules (
    echo Node modules yukleniyor...
    npm install
)

echo Frontend baslatiliyor: http://localhost:3000
npm start
