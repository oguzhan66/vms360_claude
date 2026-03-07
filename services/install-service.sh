#!/bin/bash
#
# VMS360 Retail Panel - Servis Kurulum Scripti
# Ubuntu/Debian için
#
# Kullanım: sudo bash install-service.sh
#

set -e

# Renkli çıktı
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  VMS360 Retail Panel - Servis Kurulumu ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Root kontrolü
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Hata: Bu script root olarak çalıştırılmalı!${NC}"
    echo "Kullanım: sudo bash install-service.sh"
    exit 1
fi

# Değişkenler
INSTALL_DIR="/opt/vms360"
LOG_DIR="/var/log/vms360"
SERVICE_USER="www-data"
CURRENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo -e "${YELLOW}Kurulum dizini: ${INSTALL_DIR}${NC}"
echo -e "${YELLOW}Kaynak dizin: ${CURRENT_DIR}${NC}"
echo ""

# 1. Gerekli paketleri yükle
echo -e "${GREEN}[1/8] Gerekli paketler yükleniyor...${NC}"
apt update
apt install -y python3 python3-venv python3-pip nginx nodejs npm mongodb-org || apt install -y python3 python3-venv python3-pip nginx nodejs npm mongodb

# Yarn kurulumu
npm install -g yarn

# 2. Dizinleri oluştur
echo -e "${GREEN}[2/8] Dizinler oluşturuluyor...${NC}"
mkdir -p ${INSTALL_DIR}/{backend,frontend,nginx}
mkdir -p ${LOG_DIR}
chown -R ${SERVICE_USER}:${SERVICE_USER} ${LOG_DIR}

# 3. Backend kurulumu
echo -e "${GREEN}[3/8] Backend kuruluyor...${NC}"
cp -r ${CURRENT_DIR}/backend/* ${INSTALL_DIR}/backend/
cd ${INSTALL_DIR}/backend

# Virtual environment
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
deactivate

# .env dosyası
if [ ! -f .env ]; then
    cp .env.example .env
    # JWT secret oluştur
    JWT_SECRET=$(openssl rand -hex 32)
    sed -i "s/JWT_SECRET_KEY=.*/JWT_SECRET_KEY=${JWT_SECRET}/" .env
    echo -e "${YELLOW}.env dosyası oluşturuldu. Lütfen MONGO_URL ayarını kontrol edin!${NC}"
fi

chown -R ${SERVICE_USER}:${SERVICE_USER} ${INSTALL_DIR}/backend

# 4. Frontend kurulumu
echo -e "${GREEN}[4/8] Frontend kuruluyor...${NC}"
cp -r ${CURRENT_DIR}/frontend/* ${INSTALL_DIR}/frontend/
cd ${INSTALL_DIR}/frontend

# .env dosyası
if [ ! -f .env ]; then
    cp .env.example .env
    # Backend URL'i ayarla
    echo "REACT_APP_BACKEND_URL=http://localhost" > .env
fi

# Node modules ve build
yarn install
yarn build

chown -R ${SERVICE_USER}:${SERVICE_USER} ${INSTALL_DIR}/frontend

# 5. Nginx yapılandırması
echo -e "${GREEN}[5/8] Nginx yapılandırılıyor...${NC}"
cp ${CURRENT_DIR}/services/vms360-nginx.conf ${INSTALL_DIR}/nginx/vms360.conf

# 6. Systemd servis dosyalarını kopyala
echo -e "${GREEN}[6/8] Servis dosyaları kopyalanıyor...${NC}"
cp ${CURRENT_DIR}/services/vms360-backend.service /etc/systemd/system/
cp ${CURRENT_DIR}/services/vms360-frontend.service /etc/systemd/system/

# 7. Servisleri etkinleştir
echo -e "${GREEN}[7/8] Servisler etkinleştiriliyor...${NC}"
systemctl daemon-reload

# MongoDB'yi başlat
systemctl enable mongod || systemctl enable mongodb
systemctl start mongod || systemctl start mongodb

# VMS360 servislerini etkinleştir
systemctl enable vms360-backend
systemctl enable vms360-frontend

# 8. Konum verilerini yükle
echo -e "${GREEN}[8/8] Türkiye konum verileri yükleniyor...${NC}"
cd ${INSTALL_DIR}/backend
source venv/bin/activate
python seed_locations.py || true
deactivate

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Kurulum Tamamlandı!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Servisleri başlatmak için:"
echo -e "  ${YELLOW}sudo systemctl start vms360-backend${NC}"
echo -e "  ${YELLOW}sudo systemctl start vms360-frontend${NC}"
echo ""
echo -e "Durumu kontrol etmek için:"
echo -e "  ${YELLOW}sudo systemctl status vms360-backend${NC}"
echo -e "  ${YELLOW}sudo systemctl status vms360-frontend${NC}"
echo ""
echo -e "Logları görmek için:"
echo -e "  ${YELLOW}tail -f /var/log/vms360/backend.log${NC}"
echo -e "  ${YELLOW}tail -f /var/log/vms360/nginx-access.log${NC}"
echo ""
echo -e "Tarayıcıda açın: ${GREEN}http://localhost${NC}"
echo -e "Giriş bilgileri: ${YELLOW}admin / 12345${NC}"
echo ""
echo -e "${RED}ÖNEMLİ: Production'da şifreleri değiştirin!${NC}"
