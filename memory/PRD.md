# VMS360 Retail Panel - PRD

## Proje Özeti
Sagitech VMS entegrasyonlu perakende analitik dashboard uygulaması. Kişi sayma, yaş/cinsiyet analizi ve kuyruk analizi özellikleri içerir.

## Kullanıcı Rolleri
- **Admin**: Tam yetki (VMS yönetimi, kullanıcı yönetimi, tüm raporlar)
- **Operator**: Kısıtlı yetki (atanan mağazaların verileri)

## Temel Özellikler

### Tamamlanan Özellikler
- [x] Kişi sayma dashboard
- [x] Kuyruk analizi
- [x] Yaş/cinsiyet analizi
- [x] VMS entegrasyonu (Sagitech)
- [x] Çoklu mağaza desteği
- [x] Kullanıcı yetkilendirme (OAuth2 + JWT)
- [x] Planlı rapor gönderimi (SMTP)
- [x] Redis önbellekleme
- [x] Sentry hata takibi
- [x] Kamera yönetimi sayfası
- [x] Gelişmiş rapor filtreleme
- [x] Debug endpoints

### Son Düzeltmeler (2026-03-01)

#### ✅ Planlı Raporlar - Boş İçerik Sorunu ÇÖZÜLDÜü
- **Sorun**: "1 hafta" seçildiğinde zamanlanmış rapor boş içerik gönderiyordu
- **Kök Neden**: 
  1. Veritabanında `date_range: null` olarak kaydedilmişti
  2. `report.get("date_range", "1d")` - Python'da dict key mevcut ama değeri `None` ise default değer döndürülmez
  3. `routers/scheduled_reports.py` dosyası eski versiyon ve `date_range` desteklemiyordu
- **Çözüm**:
  1. `report.get("date_range") or "1d"` kullanıldı (None değeri için fallback)
  2. `routers/scheduled_reports.py` router devre dışı bırakıldı
  3. `server.py`'deki endpoint'ler aktif edildi (tam date_range desteği)
  4. `/api/debug/fix-null-date-ranges` endpoint'i ile mevcut NULL değerler düzeltildi
- **Test Sonuçları**: 
  - `1d`: 8 giriş
  - `7d`: 8869 giriş  
  - `30d`: 9357 giriş

### Önceki Düzeltmeler (2026-02-28)

#### ✅ Kuyruk Raporu Mantığı Düzeltildi
- **Sorun**: "Kuyruk" sütununda anlamsız yüksek değerler (tüm ölçümlerin SUM'u) gösteriliyordu
- **Çözüm**: Rapor artık anlamlı metrikler gösteriyor:
  - **Ort. Kuyruk**: Ortalama kuyruk uzunluğu
  - **Maks. Kuyruk**: Gözlenen maksimum kuyruk
  - **Eşik Aşım**: Eşiğin kaç kez aşıldığı
  - **Ölçüm Sayısı**: Kaç ölçüm yapıldığı
- **"Bilinmiyor" Sorunu**: Artık mağaza eşleşmesi olmayan veriler filtreleniyor

#### ✅ Planlı Raporlar - Tarih Aralığı Format Sorunu
- Backend artık hem "7d" hem "1w" formatını destekliyor
- Rapor kartlarında "Tarih Aralığı" bilgisi gösterilmeye başlandı

### Önceki Düzeltmeler (2026-02-25)
- [x] Haftalık/aylık rapor export'ta veri tutarsızlığı düzeltildi
- [x] Excel raporlarına lokasyon bilgileri (Bölge, İl, İlçe) eklendi
- [x] TOPLAM satırı eklendi

## Veri Akışı

```
VMS (Sagitech) 
    ↓ (her 5 dakikada bir)
counter_snapshots / queue_snapshots / analytics_snapshots
    ↓ (gece 23:59)
daily_summaries (günlük özet)
    ↓
Dashboard & Raporlar
```

## Veritabanı Tabloları

| Tablo | Açıklama |
|-------|----------|
| `counter_snapshots` | 5 dk'lık kişi sayma verileri |
| `queue_snapshots` | 5 dk'lık kuyruk verileri |
| `analytics_snapshots` | 5 dk'lık yaş/cinsiyet verileri |
| `daily_summaries` | Günlük özet (23:59'da oluşur) |
| `hourly_aggregates` | Saatlik agregasyon |
| `stores` | Mağaza bilgileri |
| `cameras` | Kamera bilgileri |
| `vms_servers` | VMS sunucu bilgileri |
| `scheduled_reports` | Planlı raporlar (date_range, store_ids, filters) |

## API Endpoints

### Debug
- `GET /api/debug/data-check` - Veritabanı durum kontrolü
- `GET /api/debug/date-range-compare` - Tarih aralığı karşılaştırması
- `GET /api/debug/analytics-check` - Analytics veri kontrolü
- `GET /api/debug/scheduled-reports-check` - Planlı raporların date_range durumu
- `GET /api/debug/test-report-generation` - Rapor üretimini test et (date_range param)
- `POST /api/debug/fix-null-date-ranges` - NULL date_range değerlerini düzelt

### Raporlar
- `GET /api/reports/counter` - Kişi sayma raporu
- `GET /api/reports/queue` - Kuyruk raporu (YENİ METRİKLER)
- `GET /api/reports/analytics` - Yaş/cinsiyet raporu
- `GET /api/reports/export` - Excel/CSV export

### Planlı Raporlar
- `GET /api/scheduled-reports` - Tüm planlı raporları listele
- `POST /api/scheduled-reports` - Yeni rapor oluştur (date_range destekli)
- `PUT /api/scheduled-reports/{id}` - Raporu güncelle (exclude_unset=True)
- `DELETE /api/scheduled-reports/{id}` - Raporu sil
- `POST /api/scheduled-reports/{id}/send-now` - Manuel gönder

## Bekleyen Sorunlar

### P2: Manuel Tarih Seçimi
- **Durum**: Planlanıyor
- **İstek**: Gelişmiş raporlarda takvimden özel tarih aralığı seçimi
- **Not**: Şu an sadece preset'ler var (1 Gün, 1 Hafta, 1 Ay)

## Gelecek Görevler

### P1 (Yüksek Öncelik)
- [ ] S3/MinIO entegrasyonu (kat planı görselleri için)
- [ ] Celery ile arka plan işleri (ölçeklendirme)

### P2 (Orta Öncelik)
- [ ] Manuel tarih seçimi (takvim picker)
- [ ] UTC standardizasyonu
- [ ] Mobil uyumluluk

### P3 (Düşük Öncelik)
- [ ] Mikroservis mimarisine geçiş
- [ ] Anomali tespiti

## Credentials (Test)
- Admin: `admin` / `12345`
- Operator: `operator` / `12345`

## Teknik Notlar

### Önemli Kod Değişiklikleri (2026-03-01)
1. **`server.py` line ~4916**: `report.get('date_range') or '1d'` kullanıldı
2. **`server.py` line ~117**: `scheduled_reports_router` devre dışı bırakıldı
3. **Yeni debug endpoint'leri**: `/api/debug/test-report-generation`, `/api/debug/fix-null-date-ranges`
