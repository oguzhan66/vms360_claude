# VMS360 Retail Panel - Kurulum ve Kullanım Rehberi

## İçindekiler
1. [Gereksinimler](#gereksinimler)
2. [Hızlı Başlangıç (Docker)](#hızlı-başlangıç-docker)
3. [Otomatik Başlangıç Kurulumu](#otomatik-başlangıç-kurulumu)
4. [Servis Yönetimi](#servis-yönetimi)
5. [Manuel Kurulum](#manuel-kurulum)
6. [Sorun Giderme](#sorun-giderme)
7. [Güvenlik Kontrol Listesi](#güvenlik-kontrol-listesi)

---

## Gereksinimler

- **Docker Desktop** (Windows) — [indir](https://www.docker.com/products/docker-desktop/)
- RAM: Minimum 4GB
- Disk: 5GB boş alan

> Docker Desktop kuruluysa başka bir şey gerekmez. Python, Node.js, MongoDB kurmanıza gerek yok.

---

## Hızlı Başlangıç (Docker)

```bash
# Projeyi klonlayın
git clone https://github.com/oguzhan66/vms360_claude.git
cd vms360_claude

# Servisleri başlatın
docker compose up -d
```

Tarayıcıda açın: **http://localhost:3001**

| Rol | Kullanıcı Adı | Şifre |
|-----|---------------|-------|
| Admin | admin | 12345 |
| Operatör | operator | 12345 |

> ⚠️ Production ortamında şifreleri değiştirin!

---

## Otomatik Başlangıç Kurulumu

PC açıldığında VMS360'ın otomatik başlaması için aşağıdaki adımları uygulayın.

### 1. Docker Desktop'ı Otomatik Başlatma

Docker Desktop sistem tepsisine sağ tıklayın → **Settings** → **General** → **Start Docker Desktop when you log in** seçeneğini işaretleyin.

### 2. VMS360'ı Otomatik Başlatma

Windows Başlangıç klasörüne kısayol eklenmiştir. Kurulum sırasında bu işlem zaten yapılmıştır:

```
C:\Users\<kullanıcı>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\VMS360.lnk
```

Bu kısayol oturum açıldığında `start-vms360.bat` scriptini çalıştırır. Script, Docker hazır olana kadar bekler ve ardından `docker compose up -d` komutunu çalıştırır.

**Manuel kurulum gerekirse:**
```bash
# start-vms360.bat dosyasına kısayol oluşturun ve Başlangıç klasörüne koyun
# Başlangıç klasörünü açmak için: Win+R → shell:startup
```

---

## Servis Yönetimi

### Masaüstü Kısayolu ile Restart

Masaüstündeki **"VMS360 Restart"** kısayoluna çift tıklayın.
Servisler otomatik olarak durdurulup yeniden başlatılır.

### Komut Satırı ile Yönetim

```bash
# Başlat
docker compose up -d

# Durdur
docker compose down

# Yeniden başlat
docker compose restart

# Durum görüntüle
docker compose ps

# Logları izle
docker compose logs -f

# Sadece backend logları
docker compose logs -f backend
```

### Hazır Scriptler

| Script | Açıklama |
|--------|----------|
| `start-vms360.bat` | Docker hazır olunca servisleri başlatır (otomatik başlangıç için) |
| `restart-vms360.bat` | Servisleri durdurur ve yeniden başlatır |
| `setup-autostart.bat` | Otomatik başlangıç kurulumunu yapar (yönetici gerektirir) |

---

## Servis Adresleri

| Servis | Adres |
|--------|-------|
| Frontend (Panel) | http://localhost:3001 |
| Backend API | http://localhost:8001 |
| API Dokümantasyon | http://localhost:8001/docs |
| MongoDB | localhost:27017 |

---

## Manuel Kurulum

Docker kullanmak istemiyorsanız aşağıdaki adımları izleyin.

### Gereksinimler

- Python 3.10+
- Node.js 18+ ve Yarn
- MongoDB 6.0+

### Backend

```bash
cd backend

# Virtual environment oluşturun
python -m venv venv

# Aktifleştirin
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Bağımlılıkları yükleyin
pip install -r requirements.txt

# .env dosyası oluşturun
cp .env.example .env
# MONGO_URL ve JWT_SECRET_KEY düzenleyin

# Türkiye konum verilerini yükleyin
python seed_locations.py

# Başlatın
uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

### Frontend

```bash
cd frontend

yarn install
cp .env.example .env
# REACT_APP_BACKEND_URL=http://localhost:8001

yarn start
```

---

## Sorun Giderme

### Servisler Başlamıyor

```bash
# Container durumunu kontrol edin
docker compose ps

# Logları inceleyin
docker compose logs backend
docker compose logs frontend
```

### Tarayıcıda Açılmıyor

```bash
# Port çakışması kontrolü
netstat -ano | findstr :3001
netstat -ano | findstr :8001
```

### Docker Desktop Hazır Değil Hatası

`start-vms360.bat` scripti Docker hazır olana kadar otomatik bekler. Docker Desktop açılmamışsa önce açın, ardından script çalışmaya devam eder.

### Servisleri Sıfırdan Yeniden Oluşturma

```bash
# Container ve image'ları silip yeniden oluştur
docker compose down
docker compose up -d --build
```

---

## Güvenlik Kontrol Listesi

Production'a geçmeden önce:

- [ ] `JWT_SECRET_KEY` değiştirin (en az 32 karakter)
- [ ] Admin ve Operator şifrelerini değiştirin
- [ ] MongoDB şifre korumasını aktifleştirin
- [ ] HTTPS kullanın (nginx/caddy ile)
- [ ] Firewall kurallarını ayarlayın
