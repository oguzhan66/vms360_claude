#!/bin/bash
#
# VMS360 Servis Yönetim Scripti
#
# Kullanım:
#   ./vms360-ctl.sh start    - Tüm servisleri başlat
#   ./vms360-ctl.sh stop     - Tüm servisleri durdur
#   ./vms360-ctl.sh restart  - Tüm servisleri yeniden başlat
#   ./vms360-ctl.sh status   - Servis durumlarını göster
#   ./vms360-ctl.sh logs     - Canlı logları göster
#

ACTION=$1

case $ACTION in
    start)
        echo "VMS360 servisleri başlatılıyor..."
        sudo systemctl start vms360-backend
        sleep 2
        sudo systemctl start vms360-frontend
        echo "Servisler başlatıldı."
        ;;
    
    stop)
        echo "VMS360 servisleri durduruluyor..."
        sudo systemctl stop vms360-frontend
        sudo systemctl stop vms360-backend
        echo "Servisler durduruldu."
        ;;
    
    restart)
        echo "VMS360 servisleri yeniden başlatılıyor..."
        sudo systemctl restart vms360-backend
        sleep 2
        sudo systemctl restart vms360-frontend
        echo "Servisler yeniden başlatıldı."
        ;;
    
    status)
        echo "======== VMS360 Servis Durumu ========"
        echo ""
        echo "--- Backend ---"
        systemctl status vms360-backend --no-pager
        echo ""
        echo "--- Frontend (Nginx) ---"
        systemctl status vms360-frontend --no-pager
        echo ""
        echo "--- MongoDB ---"
        systemctl status mongod --no-pager 2>/dev/null || systemctl status mongodb --no-pager
        ;;
    
    logs)
        echo "Canlı loglar gösteriliyor (Ctrl+C ile çıkış)..."
        tail -f /var/log/vms360/backend.log /var/log/vms360/nginx-access.log
        ;;
    
    *)
        echo "VMS360 Servis Yönetim Scripti"
        echo ""
        echo "Kullanım: $0 {start|stop|restart|status|logs}"
        echo ""
        echo "Komutlar:"
        echo "  start   - Tüm servisleri başlat"
        echo "  stop    - Tüm servisleri durdur"
        echo "  restart - Tüm servisleri yeniden başlat"
        echo "  status  - Servis durumlarını göster"
        echo "  logs    - Canlı logları göster"
        exit 1
        ;;
esac
