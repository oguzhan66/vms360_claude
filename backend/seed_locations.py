"""
Türkiye Bölge, İl ve İlçe Verilerini Ekleyen Script
"""
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import uuid
from datetime import datetime, timezone

# Türkiye Coğrafi Bölgeleri ve İlleri
TURKEY_DATA = {
    "Marmara": {
        "İstanbul": ["Kadıköy", "Beşiktaş", "Şişli", "Bakırköy", "Ataşehir", "Üsküdar", "Maltepe", "Kartal", "Pendik", "Beyoğlu", "Fatih", "Sarıyer", "Beykoz", "Eyüp", "Bahçelievler"],
        "Bursa": ["Nilüfer", "Osmangazi", "Yıldırım", "Mudanya", "Gemlik", "İnegöl"],
        "Kocaeli": ["İzmit", "Gebze", "Darıca", "Körfez", "Gölcük"],
        "Tekirdağ": ["Çorlu", "Çerkezköy", "Süleymanpaşa", "Ergene"],
        "Balıkesir": ["Altıeylül", "Karesi", "Bandırma", "Edremit"],
        "Sakarya": ["Adapazarı", "Serdivan", "Erenler"],
        "Edirne": ["Merkez", "Keşan", "Uzunköprü"],
        "Kırklareli": ["Merkez", "Lüleburgaz", "Babaeski"],
        "Yalova": ["Merkez", "Çınarcık", "Altınova"],
        "Çanakkale": ["Merkez", "Biga", "Çan"],
        "Bilecik": ["Merkez", "Bozüyük", "Söğüt"]
    },
    "Ege": {
        "İzmir": ["Konak", "Karşıyaka", "Bornova", "Buca", "Çiğli", "Bayraklı", "Karabağlar", "Gaziemir", "Balçova", "Narlıdere"],
        "Aydın": ["Efeler", "Nazilli", "Kuşadası", "Söke", "Didim"],
        "Denizli": ["Merkezefendi", "Pamukkale", "Çivril"],
        "Muğla": ["Bodrum", "Fethiye", "Marmaris", "Milas", "Menteşe", "Dalaman"],
        "Manisa": ["Yunusemre", "Şehzadeler", "Akhisar", "Turgutlu"],
        "Afyonkarahisar": ["Merkez", "Sandıklı", "Dinar"],
        "Kütahya": ["Merkez", "Tavşanlı", "Simav"],
        "Uşak": ["Merkez", "Banaz", "Eşme"]
    },
    "Akdeniz": {
        "Antalya": ["Muratpaşa", "Kepez", "Konyaaltı", "Alanya", "Manavgat", "Serik", "Side"],
        "Adana": ["Seyhan", "Çukurova", "Yüreğir", "Sarıçam", "Ceyhan"],
        "Mersin": ["Mezitli", "Yenişehir", "Toroslar", "Akdeniz", "Tarsus"],
        "Hatay": ["Antakya", "İskenderun", "Defne", "Samandağ"],
        "Kahramanmaraş": ["Onikişubat", "Dulkadiroğlu", "Elbistan"],
        "Osmaniye": ["Merkez", "Kadirli", "Düziçi"],
        "Isparta": ["Merkez", "Yalvaç", "Eğirdir"],
        "Burdur": ["Merkez", "Bucak", "Gölhisar"]
    },
    "İç Anadolu": {
        "Ankara": ["Çankaya", "Keçiören", "Mamak", "Etimesgut", "Yenimahalle", "Sincan", "Altındağ", "Pursaklar", "Gölbaşı"],
        "Konya": ["Selçuklu", "Meram", "Karatay", "Ereğli", "Akşehir"],
        "Kayseri": ["Melikgazi", "Kocasinan", "Talas", "Develi"],
        "Eskişehir": ["Odunpazarı", "Tepebaşı", "Sivrihisar"],
        "Sivas": ["Merkez", "Şarkışla", "Zara"],
        "Kırıkkale": ["Merkez", "Yahşihan", "Keskin"],
        "Aksaray": ["Merkez", "Ortaköy", "Güzelyurt"],
        "Niğde": ["Merkez", "Bor", "Ulukışla"],
        "Nevşehir": ["Merkez", "Ürgüp", "Avanos"],
        "Kırşehir": ["Merkez", "Kaman", "Mucur"],
        "Yozgat": ["Merkez", "Sorgun", "Yerköy"],
        "Karaman": ["Merkez", "Ermenek", "Ayrancı"],
        "Çankırı": ["Merkez", "Çerkeş", "Ilgaz"]
    },
    "Karadeniz": {
        "Samsun": ["İlkadım", "Atakum", "Canik", "Bafra", "Çarşamba"],
        "Trabzon": ["Ortahisar", "Akçaabat", "Yomra", "Of"],
        "Ordu": ["Altınordu", "Ünye", "Fatsa", "Perşembe"],
        "Giresun": ["Merkez", "Bulancak", "Espiye"],
        "Rize": ["Merkez", "Çayeli", "Ardeşen", "Pazar"],
        "Artvin": ["Merkez", "Hopa", "Arhavi"],
        "Zonguldak": ["Merkez", "Ereğli", "Çaycuma"],
        "Kastamonu": ["Merkez", "Tosya", "Taşköprü"],
        "Sinop": ["Merkez", "Boyabat", "Gerze"],
        "Amasya": ["Merkez", "Merzifon", "Suluova"],
        "Tokat": ["Merkez", "Erbaa", "Turhal", "Niksar"],
        "Çorum": ["Merkez", "Osmancık", "Sungurlu"],
        "Bartın": ["Merkez", "Amasra", "Ulus"],
        "Karabük": ["Merkez", "Safranbolu", "Eskipazar"],
        "Düzce": ["Merkez", "Akçakoca", "Cumayeri"],
        "Bolu": ["Merkez", "Gerede", "Mudurnu"],
        "Gümüşhane": ["Merkez", "Kelkit", "Şiran"],
        "Bayburt": ["Merkez", "Aydıntepe", "Demirözü"]
    },
    "Doğu Anadolu": {
        "Erzurum": ["Yakutiye", "Palandöken", "Aziziye", "Oltu"],
        "Malatya": ["Battalgazi", "Yeşilyurt", "Darende"],
        "Van": ["İpekyolu", "Tuşba", "Edremit", "Erciş"],
        "Elazığ": ["Merkez", "Kovancılar", "Karakoçan"],
        "Ağrı": ["Merkez", "Patnos", "Doğubayazıt"],
        "Kars": ["Merkez", "Sarıkamış", "Kağızman"],
        "Erzincan": ["Merkez", "Tercan", "Üzümlü"],
        "Muş": ["Merkez", "Malazgirt", "Bulanık"],
        "Bitlis": ["Merkez", "Tatvan", "Ahlat"],
        "Hakkari": ["Merkez", "Yüksekova", "Çukurca"],
        "Iğdır": ["Merkez", "Tuzluca", "Aralık"],
        "Ardahan": ["Merkez", "Göle", "Çıldır"],
        "Bingöl": ["Merkez", "Genç", "Karlıova"],
        "Tunceli": ["Merkez", "Pertek", "Çemişgezek"]
    },
    "Güneydoğu Anadolu": {
        "Gaziantep": ["Şahinbey", "Şehitkamil", "Oğuzeli", "Nizip", "İslahiye"],
        "Diyarbakır": ["Bağlar", "Kayapınar", "Yenişehir", "Sur", "Bismil", "Ergani"],
        "Şanlıurfa": ["Eyyübiye", "Haliliye", "Karaköprü", "Siverek", "Viranşehir"],
        "Mardin": ["Artuklu", "Kızıltepe", "Midyat", "Nusaybin"],
        "Batman": ["Merkez", "Kozluk", "Sason"],
        "Siirt": ["Merkez", "Kurtalan", "Eruh"],
        "Şırnak": ["Merkez", "Cizre", "Silopi", "İdil"],
        "Adıyaman": ["Merkez", "Kahta", "Gölbaşı"],
        "Kilis": ["Merkez", "Musabeyli", "Elbeyli"]
    }
}

async def seed_locations():
    """Veritabanına Türkiye lokasyonlarını ekler"""
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'vms_dashboard')
    
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    # Mevcut verileri temizle
    await db.regions.delete_many({})
    await db.cities.delete_many({})
    await db.districts.delete_many({})
    
    print("Türkiye lokasyonları ekleniyor...")
    
    region_count = 0
    city_count = 0
    district_count = 0
    
    for region_name, cities in TURKEY_DATA.items():
        # Bölge ekle
        region_id = str(uuid.uuid4())
        region_doc = {
            "id": region_id,
            "name": region_name,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.regions.insert_one(region_doc)
        region_count += 1
        
        for city_name, districts in cities.items():
            # İl ekle
            city_id = str(uuid.uuid4())
            city_doc = {
                "id": city_id,
                "region_id": region_id,
                "name": city_name,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.cities.insert_one(city_doc)
            city_count += 1
            
            for district_name in districts:
                # İlçe ekle
                district_id = str(uuid.uuid4())
                district_doc = {
                    "id": district_id,
                    "city_id": city_id,
                    "name": district_name,
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.districts.insert_one(district_doc)
                district_count += 1
    
    print(f"✅ {region_count} bölge eklendi")
    print(f"✅ {city_count} il eklendi")
    print(f"✅ {district_count} ilçe eklendi")
    print(f"Toplam: {region_count + city_count + district_count} kayıt")
    
    client.close()

if __name__ == "__main__":
    asyncio.run(seed_locations())
