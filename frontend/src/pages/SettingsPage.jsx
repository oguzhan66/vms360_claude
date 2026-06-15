import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { settingsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Slider } from '../components/ui/slider';
import { Settings, Save, RefreshCw, Bell, Gauge, Clock, Database, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { vmsEventsApi } from '../services/api';

const SettingsPage = () => {
  const RETENTION_OPTIONS = [30, 90, 180, 365, 730];

  const [settings, setSettings] = useState({
    refresh_interval: 30,
    capacity_warning_percent: 80,
    capacity_critical_percent: 95,
    email_notifications: false,
    notification_email: '',
    person_count_interval: 5,
    analytics_interval: 15,
    data_retention_days: 90,
    disabled_event_types: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [eventTypes, setEventTypes] = useState([]);
  const [collectingNow, setCollectingNow] = useState(false);

  const loadSettings = async () => {
    try {
      const [settRes, typesRes] = await Promise.allSettled([
        settingsApi.get(),
        vmsEventsApi.getTypes(),
      ]);
      if (settRes.status === 'fulfilled') setSettings(settRes.value.data);
      if (typesRes.status === 'fulfilled') setEventTypes(typesRes.value.data.types || []);
    } catch (e) {
      console.error('Failed to load settings', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const toggleEventType = (type) => {
    const disabled = settings.disabled_event_types || [];
    const updated  = disabled.includes(type)
      ? disabled.filter(t => t !== type)
      : [...disabled, type];
    setSettings({ ...settings, disabled_event_types: updated });
  };

  const handleCollectNow = async () => {
    setCollectingNow(true);
    try {
      await vmsEventsApi.collectNow(35);
      toast.success('Event toplama başlatıldı');
      setTimeout(() => vmsEventsApi.getTypes().then(r => setEventTypes(r.data.types || [])), 8000);
    } catch {
      toast.error('Toplama başlatılamadı');
    } finally {
      setCollectingNow(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await settingsApi.update(settings);
      toast.success('Ayarlar kaydedildi');
    } catch (e) {
      console.error('Failed to save settings', e);
      toast.error('Ayarlar kaydedilemedi');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="page-content">
          <div className="text-center py-16 text-muted-foreground">
            Yukleniyor...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Ayarlar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sistem ayarlarini yapilandirin
            </p>
          </div>
          <Button onClick={handleSave} disabled={saving} data-testid="save-settings-btn">
            {saving ? (
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Kaydet
          </Button>
        </div>
      </div>

      <div className="page-content">
        <div className="max-w-2xl space-y-8">
          {/* Refresh Settings */}
          <div className="chart-container">
            <div className="flex items-center gap-3 mb-4">
              <RefreshCw className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Yenileme Ayarlari</h2>
            </div>
            <div className="space-y-4">
              <div>
                <Label htmlFor="refresh_interval">Varsayilan Yenileme Araligi (saniye)</Label>
                <Input
                  id="refresh_interval"
                  type="number"
                  value={settings.refresh_interval}
                  onChange={(e) => setSettings({ ...settings, refresh_interval: parseInt(e.target.value) || 0 })}
                  className="bg-secondary/50 border-white/10 max-w-xs"
                  data-testid="refresh-interval-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Dashboard ve izleme ekranlarinda varsayilan otomatik yenileme suresi
                </p>
              </div>
            </div>
          </div>

          {/* Capacity Thresholds */}
          <div className="chart-container">
            <div className="flex items-center gap-3 mb-4">
              <Gauge className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Doluluk Esikleri</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="capacity_warning">Uyari Esigi (%)</Label>
                <Input
                  id="capacity_warning"
                  type="number"
                  min="0"
                  max="100"
                  value={settings.capacity_warning_percent}
                  onChange={(e) => setSettings({ ...settings, capacity_warning_percent: parseInt(e.target.value) || 0 })}
                  className="bg-secondary/50 border-white/10"
                  data-testid="warning-threshold-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Bu yuzdeye ulasildiginda sari uyari gosterilir
                </p>
              </div>
              <div>
                <Label htmlFor="capacity_critical">Kritik Esigi (%)</Label>
                <Input
                  id="capacity_critical"
                  type="number"
                  min="0"
                  max="100"
                  value={settings.capacity_critical_percent}
                  onChange={(e) => setSettings({ ...settings, capacity_critical_percent: parseInt(e.target.value) || 0 })}
                  className="bg-secondary/50 border-white/10"
                  data-testid="critical-threshold-input"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Bu yuzdeye ulasildiginda kirmizi alarm gosterilir
                </p>
              </div>
            </div>
            
            {/* Preview */}
            <div className="mt-6 p-4 bg-white/5 border border-white/10">
              <div className="text-sm text-muted-foreground mb-3">Onizleme</div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="h-3 bg-white/10 overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500" 
                      style={{ width: `${settings.capacity_warning_percent}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs mt-1">
                    <span className="text-emerald-400">0% - Normal</span>
                    <span className="text-amber-400">{settings.capacity_warning_percent}% - Uyari</span>
                    <span className="text-red-400">{settings.capacity_critical_percent}% - Kritik</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Notification Settings */}
          <div className="chart-container">
            <div className="flex items-center gap-3 mb-4">
              <Bell className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Bildirim Ayarlari</h2>
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>E-posta Bildirimleri</Label>
                  <p className="text-xs text-muted-foreground">
                    Kritik durumlarda e-posta bildirimi gonder
                  </p>
                </div>
                <Switch
                  checked={settings.email_notifications}
                  onCheckedChange={(checked) => setSettings({ ...settings, email_notifications: checked })}
                  data-testid="email-notifications-switch"
                />
              </div>
              
              {settings.email_notifications && (
                <div>
                  <Label htmlFor="notification_email">Bildirim E-postasi</Label>
                  <Input
                    id="notification_email"
                    type="email"
                    value={settings.notification_email || ''}
                    onChange={(e) => setSettings({ ...settings, notification_email: e.target.value })}
                    placeholder="ornek@sirket.com"
                    className="bg-secondary/50 border-white/10 max-w-md"
                    data-testid="notification-email-input"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Data Collection Frequency */}
          <div className="chart-container">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Veri Toplama Sıklığı</h2>
            </div>
            <div className="space-y-6">
              {/* Person counting + queue */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Kişi Sayma / Kuyruk Aralığı</Label>
                  <span className="text-sm font-mono text-primary">
                    {settings.person_count_interval} dk
                  </span>
                </div>
                <Slider
                  min={1}
                  max={60}
                  step={1}
                  value={[settings.person_count_interval]}
                  onValueChange={([v]) => setSettings({ ...settings, person_count_interval: v })}
                  className="max-w-md"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1 max-w-md">
                  <span>1 dk</span>
                  <span>60 dk</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Kişi sayım ve kuyruk verisi ne sıklıkla toplanacak
                </p>
              </div>

              {/* Age / gender */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Yaş / Cinsiyet Analitik Aralığı</Label>
                  <span className="text-sm font-mono text-primary">
                    {settings.analytics_interval} dk
                  </span>
                </div>
                <Slider
                  min={5}
                  max={60}
                  step={5}
                  value={[settings.analytics_interval]}
                  onValueChange={([v]) => setSettings({ ...settings, analytics_interval: v })}
                  className="max-w-md"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1 max-w-md">
                  <span>5 dk</span>
                  <span>60 dk</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Yaş/cinsiyet analitik verisi ne sıklıkla toplanacak
                </p>
              </div>
            </div>
          </div>

          {/* Event Type Filtering */}
          <div className="chart-container">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Filter className="w-5 h-5 text-primary" />
                <div>
                  <h2 className="text-lg font-semibold">Olay Tipi Filtresi</h2>
                  <p className="text-xs text-muted-foreground">Kapalı tipler toplanmaz ve raporlarda görünmez</p>
                </div>
              </div>
              <button
                onClick={handleCollectNow}
                disabled={collectingNow}
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded border border-border bg-secondary/50 hover:bg-secondary text-foreground transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${collectingNow ? 'animate-spin' : ''}`} />
                Şimdi Topla
              </button>
            </div>

            {eventTypes.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Henüz event toplanmadı. "Şimdi Topla" butonuna tıklayın.
              </div>
            ) : (
              <div className="space-y-2">
                {eventTypes.map(t => {
                  const disabled = (settings.disabled_event_types || []).includes(t.type);
                  return (
                    <div
                      key={t.type}
                      className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                        disabled ? 'border-border bg-secondary/10 opacity-60' : 'border-border bg-secondary/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${disabled ? 'bg-red-500' : 'bg-emerald-500'}`} />
                        <div>
                          <div className="text-sm font-medium">{t.label}</div>
                          <div className="text-xs text-muted-foreground font-mono">{t.type} · {t.count.toLocaleString()} kayıt</div>
                        </div>
                      </div>
                      <Switch
                        checked={!disabled}
                        onCheckedChange={() => toggleEventType(t.type)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Değişiklikler "Kaydet" sonrası bir sonraki 30 dk koleksiyonundan itibaren geçerli olur.
            </p>
          </div>

          {/* Data Retention */}
          <div className="chart-container">
            <div className="flex items-center gap-3 mb-4">
              <Database className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Veri Saklama Süresi</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {RETENTION_OPTIONS.map((days) => (
                <button
                  key={days}
                  onClick={() => setSettings({ ...settings, data_retention_days: days })}
                  className={`px-4 py-2 text-sm font-medium border transition-colors ${
                    settings.data_retention_days === days
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary/50 text-muted-foreground border-white/10 hover:border-primary/50 hover:text-foreground'
                  }`}
                >
                  {days >= 365 ? `${days / 365} yıl` : `${days} gün`}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Snapshot verileri bu süre sonunda otomatik silinir (her Pazar 03:00)
            </p>
          </div>

          {/* System Info */}
          <div className="chart-container">
            <div className="flex items-center gap-3 mb-4">
              <Settings className="w-5 h-5 text-primary" />
              <h2 className="text-lg font-semibold">Sistem Bilgisi</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">API Versiyonu:</span>
                <span className="ml-2 font-mono">v2.5.11</span>
              </div>
              <div>
                <span className="text-muted-foreground">Dashboard Versiyonu:</span>
                <span className="ml-2 font-mono">v1.0.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SettingsPage;
