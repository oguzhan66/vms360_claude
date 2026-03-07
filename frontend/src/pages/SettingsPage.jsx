import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { settingsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Settings, Save, RefreshCw, Bell, Gauge } from 'lucide-react';
import { toast } from 'sonner';

const SettingsPage = () => {
  const [settings, setSettings] = useState({
    refresh_interval: 30,
    capacity_warning_percent: 80,
    capacity_critical_percent: 95,
    email_notifications: false,
    notification_email: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = async () => {
    try {
      const res = await settingsApi.get();
      setSettings(res.data);
    } catch (e) {
      console.error('Failed to load settings', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

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
