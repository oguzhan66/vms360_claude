# VMS360 Retail Panel - Lokal Kurulum Rehberi

## İçindekiler
1. [Gereksinimler](#gereksinimler)
2. [Hızlı Başlangıç](#hızlı-başlangıç)
3. [Manuel Kurulum](#manuel-kurulum)
4. [Servis Modu Kurulumu](#servis-modu-kurulumu)
5. [Docker Kurulumu](#docker-kurulumu)
6. [Sorun Giderme](#sorun-giderme)

---

## Gereksinimler

### Yazılım Gereksinimleri
- **Python 3.10+** 
- **Node.js 18+** ve **Yarn**
- **MongoDB 6.0+** (local veya cloud)
- **Git**

### Sistem Gereksinimleri
- RAM: Minimum 4GB
- Disk: 2GB boş alan

---

## 1. Projeyi İndirme

```bash
# Projeyi klonlayın
git clone <repo-url> vms360-retail-panel
cd vms360-retail-panel
```

---

## 2. MongoDB Kurulumu

### Seçenek A: Lokal MongoDB

**Windows:**
1. https://www.mongodb.com/try/download/community adresinden indirin
2. Kurulumu tamamlayın
3. MongoDB Compass ile bağlantıyı test edin

**macOS:**
```bash
brew tap mongodb/brew
brew install mongodb-community
brew services start mongodb-community
```

**Ubuntu/Debian:**
```bash
sudo apt update
sudo apt install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb
```

### Seçenek B: MongoDB Atlas (Cloud - Ücretsiz)
1. https://cloud.mongodb.com adresine gidin
2. Ücretsiz cluster oluşturun
3. Connection string'i alın: `mongodb+srv://user:pass@cluster.mongodb.net/vms360`

---

## 3. Backend Kurulumu

```bash
# Backend klasörüne gidin
cd backend

# Virtual environment oluşturun
python -m venv venv

# Virtual environment'ı aktifleyin
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Bağımlılıkları yükleyin
pip install -r requirements.txt

# .env dosyasını oluşturun
cp .env.example .env
```

### Backend .env Dosyası
```env
# MongoDB Bağlantısı
MONGO_URL=mongodb://localhost:27017
DB_NAME=vms360

# JWT Ayarları (değiştirin!)
JWT_SECRET_KEY=your-super-secret-key-change-this-in-production

# Uygulama Ayarları
DEBUG=true
```

### Türkiye Konum Verilerini Yükleme
```bash
# Seed script'ini çalıştırın
python seed_locations.py
```

### Backend'i Başlatma
```bash
# Development modunda çalıştırma
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

Backend şu adreste çalışacak: `http://localhost:8001`

API Docs: `http://localhost:8001/docs`

---

## 4. Frontend Kurulumu

```bash
# Yeni terminal açın
cd frontend

# Bağımlılıkları yükleyin
yarn install

# .env dosyasını oluşturun
cp .env.example .env
```

### Frontend .env Dosyası
```env
REACT_APP_BACKEND_URL=http://localhost:8001
```

### Frontend'i Başlatma
```bash
yarn start
```

Frontend şu adreste çalışacak: `http://localhost:3000`

---

## 5. Varsayılan Kullanıcılar

Uygulama ilk çalıştığında otomatik olarak oluşturulur:

| Rol | Kullanıcı Adı | Şifre |
|-----|---------------|-------|
| Admin | admin | 12345 |
| Operatör | operator | 12345 |

⚠️ **ÖNEMLİ:** Production ortamında şifreleri değiştirin!

---

## 6. VMS Sunucusu Ekleme

1. Admin olarak giriş yapın
2. **VMS Yönetimi** sayfasına gidin
3. **+ Yeni VMS** butonuna tıklayın
4. VMS bilgilerini girin:
   - URL: `http://213.14.158.166:11012` (test sunucusu)
   - Kullanıcı: `admin`
   - Şifre: (boş bırakın)
5. **Bağlantıyı Test Et** butonuna tıklayın
6. Kaydedin

---

## 7. Servis Modu Kurulumu (Önerilen)

Uygulama sistem servisi olarak çalışır, bilgisayar açıldığında otomatik başlar.

### Linux (Ubuntu/Debian) - Systemd

```bash
# 1. Kurulum scriptini çalıştırın
cd services
sudo bash install-service.sh

# 2. Servisleri başlatın
sudo systemctl start vms360-backend
sudo systemctl start vms360-frontend

# 3. Durumu kontrol edin
sudo systemctl status vms360-backend
sudo systemctl status vms360-frontend
```

**Servis Yönetim Komutları:**
```bash
# Yönetim scripti ile
./vms360-ctl.sh start    # Başlat
./vms360-ctl.sh stop     # Durdur
./vms360-ctl.sh restart  # Yeniden başlat
./vms360-ctl.sh status   # Durum
./vms360-ctl.sh logs     # Canlı loglar

# Veya systemctl ile
sudo systemctl start vms360-backend
sudo systemctl stop vms360-backend
sudo systemctl restart vms360-backend
sudo systemctl enable vms360-backend   # Başlangıçta otomatik çalıştır
sudo systemctl disable vms360-backend  # Otomatik başlatmayı kapat
```

**Dizin Yapısı (Kurulumdan Sonra):**
```
/opt/vms360/
├── backend/         # Backend uygulama
├── frontend/build/  # Frontend (derlenmiş)
└── nginx/           # Nginx yapılandırması

/var/log/vms360/
├── backend.log      # Backend logları
├── backend-error.log
├── nginx-access.log
└── nginx-error.log
```

### Windows - NSSM ile

Windows'ta NSSM (Non-Sucking Service Manager) kullanılır.

**Ön Gereksinimler:**
1. NSSM'i indirin: https://nssm.cc/download
2. nssm.exe'yi `C:\Windows\System32` klasörüne kopyalayın

```batch
REM 1. Kurulum scriptini yönetici olarak çalıştırın
cd services
install-windows.bat

REM 2. Servisleri başlatın
net start VMS360-Backend
net start VMS360-Frontend

REM 3. Veya yönetim scripti ile
vms360-ctl.bat start
vms360-ctl.bat status
```

**Windows Hizmetleri:**
- `services.msc` ile servis yönetimi yapılabilir
- VMS360-Backend ve VMS360-Frontend servisleri görünecek

---

## 8. Docker Kurulumu

### Docker Compose ile (En Kolay)

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:6.0
    container_name: vms360-mongodb
    restart: always
    volumes:
      - mongodb_data:/data/db
    ports:
      - "27017:27017"

  backend:
    build: ./backend
    container_name: vms360-backend
    restart: always
    depends_on:
      - mongodb
    environment:
      - MONGO_URL=mongodb://mongodb:27017
      - DB_NAME=vms360
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
    ports:
      - "8001:8001"

  frontend:
    build: ./frontend
    container_name: vms360-frontend
    restart: always
    depends_on:
      - backend
    environment:
      - REACT_APP_BACKEND_URL=http://localhost:8001
    ports:
      - "3000:3000"

volumes:
  mongodb_data:
```

**Çalıştırma:**
```bash
# JWT secret oluşturun
export JWT_SECRET_KEY=$(openssl rand -hex 32)

# Docker compose ile başlatın
docker-compose up -d
```

### Backend Dockerfile
```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Seed locations on first run
RUN python seed_locations.py || true

EXPOSE 8001

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001"]
```

### Frontend Dockerfile
```dockerfile
FROM node:18-alpine as build

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
```

### Frontend nginx.conf
```nginx
server {
    listen 3000;
    server_name localhost;
    
    root /usr/share/nginx/html;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    location /api {
        proxy_pass http://backend:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

---

## 8. Sorun Giderme

### MongoDB Bağlantı Hatası
```bash
# MongoDB servisini kontrol edin
sudo systemctl status mongodb

# Log'ları kontrol edin
sudo tail -f /var/log/mongodb/mongod.log
```

### Backend Başlamıyor
```bash
# Virtual environment aktif mi kontrol edin
which python

# Bağımlılıkları tekrar yükleyin
pip install -r requirements.txt --force-reinstall
```

### Frontend Build Hatası
```bash
# Node modules'ı temizleyin
rm -rf node_modules
yarn install
```

### Port Çakışması
```bash
# Windows - port kullanan process'i bulun
netstat -ano | findstr :8001

# macOS/Linux
lsof -i :8001
kill -9 <PID>
```

---

## 9. Güvenlik Kontrol Listesi

Production'a geçmeden önce:

- [ ] JWT_SECRET_KEY değiştirin (en az 32 karakter)
- [ ] Admin/Operator şifrelerini değiştirin
- [ ] MongoDB'yi şifre ile koruyun
- [ ] HTTPS kullanın (nginx/caddy ile)
- [ ] Firewall kuralları ayarlayın
- [ ] DEBUG=false yapın

---

## 10. Destek

Sorularınız için:
- GitHub Issues açın
- Dokümantasyonu kontrol edin

---

## Hızlı Başlangıç (Özet)

```bash
# 1. Klonla
git clone <repo-url> && cd vms360-retail-panel

# 2. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # MONGO_URL ve JWT_SECRET_KEY düzenle
python seed_locations.py
uvicorn server:app --host 0.0.0.0 --port 8001 --reload &

# 3. Frontend (yeni terminal)
cd frontend
yarn install
cp .env.example .env  # REACT_APP_BACKEND_URL=http://localhost:8001
yarn start

# 4. Tarayıcıda aç
# http://localhost:3000
# Giriş: admin / 12345
```
