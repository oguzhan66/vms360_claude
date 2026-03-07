#!/bin/bash
#
# VMS360 Servis Kaldırma Scripti
#
# Kullanım: sudo bash uninstall-service.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Hata: Bu script root olarak çalıştırılmalı!${NC}"
    exit 1
fi

echo -e "${YELLOW}VMS360 servisleri kaldırılıyor...${NC}"

# Servisleri durdur
systemctl stop vms360-frontend 2>/dev/null || true
systemctl stop vms360-backend 2>/dev/null || true

# Servisleri devre dışı bırak
systemctl disable vms360-frontend 2>/dev/null || true
systemctl disable vms360-backend 2>/dev/null || true

# Servis dosyalarını sil
rm -f /etc/systemd/system/vms360-backend.service
rm -f /etc/systemd/system/vms360-frontend.service

systemctl daemon-reload

echo ""
read -p "Uygulama dosyalarını da silmek ister misiniz? (/opt/vms360) [y/N]: " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf /opt/vms360
    echo -e "${GREEN}Uygulama dosyaları silindi.${NC}"
fi

read -p "Log dosyalarını da silmek ister misiniz? (/var/log/vms360) [y/N]: " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf /var/log/vms360
    echo -e "${GREEN}Log dosyaları silindi.${NC}"
fi

echo ""
echo -e "${GREEN}VMS360 servisleri kaldırıldı.${NC}"
echo -e "${YELLOW}Not: MongoDB veritabanı silinmedi. Elle silmek için:${NC}"
echo -e "  mongo vms360 --eval 'db.dropDatabase()'"
