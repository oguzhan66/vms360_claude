import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { smtpApi, scheduledReportApi, storeApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '../components/ui/dialog';
import { Switch } from '../components/ui/switch';
import { Checkbox } from '../components/ui/checkbox';
import { 
  Mail, Clock, Calendar, Plus, Trash2, Send, Settings, 
  FileSpreadsheet, FileJson, FileText, Play, Pencil, Check, X, Store, Filter
} from 'lucide-react';
import { toast } from 'sonner';

const REPORT_TYPES = [
  { id: 'counter', label: 'Kişi Sayma', description: 'Mağaza bazlı giriş/çıkış verileri' },
  { id: 'queue', label: 'Kuyruk Raporu', description: 'Kuyruk uzunlukları ve durumları' },
  { id: 'analytics', label: 'Yaş/Cinsiyet Analizi', description: 'Demografik veriler' },
  { id: 'hourly_traffic', label: 'Saatlik Trafik', description: 'Saatlik ziyaretçi dağılımı' },
  { id: 'weekday_comparison', label: 'Haftalık Karşılaştırma', description: 'Son 7 gün karşılaştırması' },
  { id: 'store_comparison', label: 'Mağaza Karşılaştırma', description: 'Mağazalar arası performans' },
  { id: 'queue_analysis', label: 'Kuyruk Analizi (Detaylı)', description: 'Bekleme süreleri' },
  { id: 'demographics', label: 'Demografik Analiz (Detaylı)', description: 'Yaş ve cinsiyet dağılımı' },
  { id: 'all', label: 'Tüm Raporlar', description: 'Tüm analiz raporları' },
];

const FREQUENCIES = [
  { id: 'daily', label: 'Günlük' },
  { id: 'weekly', label: 'Haftalık' },
  { id: 'monthly', label: 'Aylık' },
];

const FORMATS = [
  { id: 'excel', label: 'Excel (.xlsx)', icon: FileSpreadsheet },
  { id: 'csv', label: 'CSV (.csv)', icon: FileText },
  { id: 'json', label: 'JSON (.json)', icon: FileJson },
];

const WEEKDAYS = [
  { id: 0, label: 'Pazartesi' },
  { id: 1, label: 'Salı' },
  { id: 2, label: 'Çarşamba' },
  { id: 3, label: 'Perşembe' },
  { id: 4, label: 'Cuma' },
  { id: 5, label: 'Cumartesi' },
  { id: 6, label: 'Pazar' },
];

const ScheduledReportsPage = () => {
  const [loading, setLoading] = useState(true);
  const [reports, setReports] = useState([]);
  const [stores, setStores] = useState([]);
  const [smtpSettings, setSmtpSettings] = useState(null);
  const [smtpDialogOpen, setSmtpDialogOpen] = useState(false);
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [editingReport, setEditingReport] = useState(null);
  const [testEmail, setTestEmail] = useState('');
  const [testingSmtp, setTestingSmtp] = useState(false);
  
  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: 587,
    username: '',
    password: '',
    from_email: '',
    from_name: 'VMS360 Rapor Sistemi',
    use_tls: true
  });

  const [reportForm, setReportForm] = useState({
    name: '',
    report_type: 'counter',
    format: 'excel',
    frequency: 'daily',
    send_time: '08:00',
    send_day: null,
    recipients: '',
    // New filter fields
    store_ids: [],
    date_range: '1d',
    hour_from: null,
    hour_to: null,
    gender_filter: null,
    min_queue_length: 0
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [smtpRes, reportsRes, storesRes] = await Promise.all([
        smtpApi.get().catch(() => ({ data: null })),
        scheduledReportApi.getAll().catch(() => ({ data: [] })),
        storeApi.getAll().catch(() => ({ data: [] }))
      ]);
      
      if (smtpRes.data && Object.keys(smtpRes.data).length > 0) {
        setSmtpSettings(smtpRes.data);
        setSmtpForm({ ...smtpForm, ...smtpRes.data, password: '' });
      }
      setReports(reportsRes.data || []);
      setStores(storesRes.data || []);
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSMTP = async (e) => {
    e.preventDefault();
    try {
      await smtpApi.save(smtpForm);
      toast.success('SMTP ayarları kaydedildi');
      setSmtpSettings({ ...smtpForm });
      setSmtpDialogOpen(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'SMTP ayarları kaydedilemedi');
    }
  };

  const handleTestSMTP = async () => {
    if (!testEmail) {
      toast.error('Test e-posta adresi girin');
      return;
    }
    setTestingSmtp(true);
    try {
      const res = await smtpApi.test(testEmail);
      toast.success(res.data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Test başarısız');
    } finally {
      setTestingSmtp(false);
    }
  };

  const handleCreateReport = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...reportForm,
        recipients: reportForm.recipients.split(',').map(r => r.trim()).filter(r => r),
        send_day: reportForm.frequency === 'weekly' ? parseInt(reportForm.send_day) : 
                  reportForm.frequency === 'monthly' ? parseInt(reportForm.send_day) : null,
        hour_from: reportForm.hour_from ? parseInt(reportForm.hour_from) : null,
        hour_to: reportForm.hour_to ? parseInt(reportForm.hour_to) : null,
        min_queue_length: parseInt(reportForm.min_queue_length) || 0
      };
      
      if (editingReport) {
        await scheduledReportApi.update(editingReport.id, data);
        toast.success('Planlı rapor güncellendi');
      } else {
        await scheduledReportApi.create(data);
        toast.success('Planlı rapor oluşturuldu');
      }
      
      setReportDialogOpen(false);
      setEditingReport(null);
      resetReportForm();
      loadData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'İşlem başarısız');
    }
  };

  const handleDeleteReport = async (id) => {
    if (!window.confirm('Bu planlı raporu silmek istediğinize emin misiniz?')) return;
    try {
      await scheduledReportApi.delete(id);
      toast.success('Planlı rapor silindi');
      loadData();
    } catch (e) {
      toast.error('Silme işlemi başarısız');
    }
  };

  const handleSendNow = async (id) => {
    try {
      const res = await scheduledReportApi.sendNow(id);
      toast.success(res.data.message);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Gönderim başarısız');
    }
  };

  const handleToggleActive = async (report) => {
    try {
      await scheduledReportApi.update(report.id, { is_active: !report.is_active });
      toast.success(report.is_active ? 'Rapor devre dışı bırakıldı' : 'Rapor aktif edildi');
      loadData();
    } catch (e) {
      toast.error('İşlem başarısız');
    }
  };

  const openEditReport = (report) => {
    setEditingReport(report);
    setReportForm({
      name: report.name,
      report_type: report.report_type,
      format: report.format,
      frequency: report.frequency,
      send_time: report.send_time,
      send_day: report.send_day,
      recipients: report.recipients.join(', '),
      store_ids: report.store_ids || [],
      date_range: report.date_range || '1d',
      hour_from: report.hour_from,
      hour_to: report.hour_to,
      gender_filter: report.gender_filter,
      min_queue_length: report.min_queue_length || 0
    });
    setReportDialogOpen(true);
  };

  const resetReportForm = () => {
    setReportForm({
      name: '',
      report_type: 'counter',
      format: 'excel',
      frequency: 'daily',
      send_time: '08:00',
      send_day: null,
      recipients: '',
      store_ids: [],
      date_range: '1d',
      hour_from: null,
      hour_to: null,
      gender_filter: null,
      min_queue_length: 0
    });
  };

  const toggleStoreSelection = (storeId) => {
    setReportForm(prev => ({
      ...prev,
      store_ids: prev.store_ids.includes(storeId)
        ? prev.store_ids.filter(id => id !== storeId)
        : [...prev.store_ids, storeId]
    }));
  };

  const selectAllStores = () => {
    setReportForm(prev => ({
      ...prev,
      store_ids: stores.map(s => s.id)
    }));
  };

  const clearStoreSelection = () => {
    setReportForm(prev => ({
      ...prev,
      store_ids: []
    }));
  };

  const getReportTypeLabel = (type) => REPORT_TYPES.find(r => r.id === type)?.label || type;
  const getFrequencyLabel = (freq) => FREQUENCIES.find(f => f.id === freq)?.label || freq;
  const getFormatLabel = (format) => FORMATS.find(f => f.id === format)?.label || format;

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Planlı Raporlar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Otomatik e-posta ile rapor gönderimi
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => setSmtpDialogOpen(true)}
              className="border-border text-foreground"
              data-testid="smtp-settings-btn"
            >
              <Settings className="w-4 h-4 mr-2" />
              SMTP Ayarları
            </Button>
            <Button
              onClick={() => { resetReportForm(); setEditingReport(null); setReportDialogOpen(true); }}
              disabled={!smtpSettings}
              data-testid="add-schedule-btn"
            >
              <Plus className="w-4 h-4 mr-2" />
              Yeni Plan
            </Button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* SMTP Status Card */}
        <div className={`p-4 mb-6 border ${smtpSettings ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 flex items-center justify-center ${smtpSettings ? 'bg-emerald-500/20' : 'bg-amber-500/20'}`}>
              <Mail className={`w-6 h-6 ${smtpSettings ? 'text-emerald-500' : 'text-amber-500'}`} />
            </div>
            <div className="flex-1">
              <h3 className={`font-semibold ${smtpSettings ? 'text-emerald-500' : 'text-amber-500'}`}>
                {smtpSettings ? 'SMTP Yapılandırıldı' : 'SMTP Yapılandırılmadı'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {smtpSettings 
                  ? `${smtpSettings.host}:${smtpSettings.port} - ${smtpSettings.from_email}`
                  : 'Planlı rapor göndermek için önce SMTP ayarlarını yapılandırın'}
              </p>
            </div>
            {smtpSettings && (
              <Button variant="outline" size="sm" onClick={() => setSmtpDialogOpen(true)} className="border-border text-foreground">
                Düzenle
              </Button>
            )}
          </div>
        </div>

        {/* Reports List */}
        {loading ? (
          <div className="text-center py-16 text-muted-foreground">Yükleniyor...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16">
            <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Henüz Planlı Rapor Yok</h3>
            <p className="text-muted-foreground mb-4">
              İlk planlı raporunuzu oluşturun ve otomatik e-posta almaya başlayın
            </p>
            <Button onClick={() => { resetReportForm(); setReportDialogOpen(true); }} disabled={!smtpSettings}>
              <Plus className="w-4 h-4 mr-2" />
              İlk Raporu Oluştur
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {reports.map((report) => (
              <div 
                key={report.id} 
                className={`store-card ${!report.is_active ? 'opacity-60' : ''}`}
                data-testid={`schedule-card-${report.id}`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 flex items-center justify-center ${report.is_active ? 'bg-primary/20' : 'bg-secondary'}`}>
                      <Clock className={`w-5 h-5 ${report.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{report.name}</h3>
                      <p className="text-xs text-muted-foreground">{getReportTypeLabel(report.report_type)}</p>
                    </div>
                  </div>
                  <Switch 
                    checked={report.is_active} 
                    onCheckedChange={() => handleToggleActive(report)}
                    data-testid={`toggle-${report.id}`}
                  />
                </div>

                <div className="space-y-2 text-sm mb-4">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Sıklık:</span>
                    <span className="font-medium">{getFrequencyLabel(report.frequency)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Saat:</span>
                    <span className="font-mono font-medium">{report.send_time}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Tarih Aralığı:</span>
                    <span className="font-medium">
                      {report.date_range === '1d' ? 'Son 1 Gün' : 
                       report.date_range === '7d' ? 'Son 7 Gün' : 
                       report.date_range === '30d' ? 'Son 30 Gün' : 
                       report.date_range || '1 Gün'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Format:</span>
                    <span className="font-medium">{getFormatLabel(report.format)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Alıcılar:</span>
                    <span className="font-medium text-xs">{report.recipients.length} kişi</span>
                  </div>
                  {report.last_sent && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Son Gönderim:</span>
                      <span className="text-xs">{new Date(report.last_sent).toLocaleString('tr-TR')}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-3 border-t border-border">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleSendNow(report.id)}
                    className="flex-1 border-border text-foreground"
                    data-testid={`send-now-${report.id}`}
                  >
                    <Play className="w-4 h-4 mr-1" />
                    Şimdi Gönder
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => openEditReport(report)}
                    className="border-border text-foreground"
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => handleDeleteReport(report.id)}
                    className="border-border text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SMTP Settings Dialog */}
      <Dialog open={smtpDialogOpen} onOpenChange={setSmtpDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle>SMTP Ayarları</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveSMTP} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>SMTP Sunucu</Label>
                <Input
                  value={smtpForm.host}
                  onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })}
                  placeholder="smtp.gmail.com"
                  required
                  className="bg-secondary/50 border-border"
                  data-testid="smtp-host"
                />
              </div>
              <div>
                <Label>Port</Label>
                <Input
                  type="number"
                  value={smtpForm.port}
                  onChange={(e) => setSmtpForm({ ...smtpForm, port: parseInt(e.target.value) })}
                  placeholder="587"
                  required
                  className="bg-secondary/50 border-border"
                  data-testid="smtp-port"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Kullanıcı Adı</Label>
                <Input
                  value={smtpForm.username}
                  onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })}
                  placeholder="email@domain.com"
                  required
                  className="bg-secondary/50 border-border"
                  data-testid="smtp-username"
                />
              </div>
              <div>
                <Label>Şifre</Label>
                <Input
                  type="password"
                  value={smtpForm.password}
                  onChange={(e) => setSmtpForm({ ...smtpForm, password: e.target.value })}
                  placeholder={smtpSettings ? "Değiştirmek için yeni şifre girin" : "SMTP şifresi"}
                  required={!smtpSettings}
                  className="bg-secondary/50 border-border"
                  data-testid="smtp-password"
                />
                {smtpSettings && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Boş bırakırsanız mevcut şifre korunur
                  </p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Gönderen E-posta</Label>
                <Input
                  type="email"
                  value={smtpForm.from_email}
                  onChange={(e) => setSmtpForm({ ...smtpForm, from_email: e.target.value })}
                  placeholder="noreply@domain.com"
                  required
                  className="bg-secondary/50 border-border"
                  data-testid="smtp-from-email"
                />
              </div>
              <div>
                <Label>Gönderen Adı</Label>
                <Input
                  value={smtpForm.from_name}
                  onChange={(e) => setSmtpForm({ ...smtpForm, from_name: e.target.value })}
                  placeholder="VMS360 Rapor Sistemi"
                  className="bg-secondary/50 border-border"
                  data-testid="smtp-from-name"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch 
                checked={smtpForm.use_tls} 
                onCheckedChange={(v) => setSmtpForm({ ...smtpForm, use_tls: v })}
                data-testid="smtp-tls"
              />
              <Label className="cursor-pointer">TLS Kullan (Önerilen)</Label>
            </div>

            <div className="border-t border-border pt-4 mt-4">
              <Label className="mb-2 block">SMTP Testi</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="test@email.com"
                  className="bg-secondary/50 border-border flex-1"
                  data-testid="smtp-test-email"
                />
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleTestSMTP}
                  disabled={testingSmtp || !smtpSettings}
                  className="border-border text-foreground"
                  data-testid="smtp-test-btn"
                >
                  <Send className={`w-4 h-4 mr-2 ${testingSmtp ? 'animate-pulse' : ''}`} />
                  Test
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">Önce ayarları kaydedin, sonra test edin</p>
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="border-border text-foreground">İptal</Button>
              </DialogClose>
              <Button type="submit" data-testid="smtp-save-btn">Kaydet</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create/Edit Report Dialog */}
      <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReport ? 'Raporu Düzenle' : 'Yeni Planlı Rapor'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateReport} className="space-y-4">
            <div>
              <Label>Plan Adı</Label>
              <Input
                value={reportForm.name}
                onChange={(e) => setReportForm({ ...reportForm, name: e.target.value })}
                placeholder="Günlük Trafik Raporu"
                required
                className="bg-secondary/50 border-border"
                data-testid="report-name"
              />
            </div>

            <div>
              <Label>Rapor Tipi</Label>
              <Select value={reportForm.report_type} onValueChange={(v) => setReportForm({ ...reportForm, report_type: v })}>
                <SelectTrigger className="bg-secondary/50 border-border" data-testid="report-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPORT_TYPES.map((type) => (
                    <SelectItem key={type.id} value={type.id}>
                      <div>
                        <div className="font-medium">{type.label}</div>
                        <div className="text-xs text-muted-foreground">{type.description}</div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Format</Label>
                <Select value={reportForm.format} onValueChange={(v) => setReportForm({ ...reportForm, format: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border" data-testid="report-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FORMATS.map((format) => (
                      <SelectItem key={format.id} value={format.id}>
                        <div className="flex items-center gap-2">
                          <format.icon className="w-4 h-4" />
                          {format.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Sıklık</Label>
                <Select value={reportForm.frequency} onValueChange={(v) => setReportForm({ ...reportForm, frequency: v, send_day: null })}>
                  <SelectTrigger className="bg-secondary/50 border-border" data-testid="report-frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCIES.map((freq) => (
                      <SelectItem key={freq.id} value={freq.id}>{freq.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Gönderim Saati</Label>
                <Input
                  type="time"
                  value={reportForm.send_time}
                  onChange={(e) => setReportForm({ ...reportForm, send_time: e.target.value })}
                  required
                  className="bg-secondary/50 border-border"
                  data-testid="report-time"
                />
              </div>
              {reportForm.frequency === 'weekly' && (
                <div>
                  <Label>Gönderim Günü</Label>
                  <Select value={reportForm.send_day?.toString()} onValueChange={(v) => setReportForm({ ...reportForm, send_day: parseInt(v) })}>
                    <SelectTrigger className="bg-secondary/50 border-border" data-testid="report-weekday">
                      <SelectValue placeholder="Gün seçin" />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((day) => (
                        <SelectItem key={day.id} value={day.id.toString()}>{day.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {reportForm.frequency === 'monthly' && (
                <div>
                  <Label>Ayın Günü</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={reportForm.send_day || ''}
                    onChange={(e) => setReportForm({ ...reportForm, send_day: parseInt(e.target.value) })}
                    placeholder="1-31"
                    className="bg-secondary/50 border-border"
                    data-testid="report-monthday"
                  />
                </div>
              )}
            </div>

            <div>
              <Label>Alıcı E-posta Adresleri</Label>
              <Input
                value={reportForm.recipients}
                onChange={(e) => setReportForm({ ...reportForm, recipients: e.target.value })}
                placeholder="email1@domain.com, email2@domain.com"
                required
                className="bg-secondary/50 border-border"
                data-testid="report-recipients"
              />
              <p className="text-xs text-muted-foreground mt-1">Birden fazla e-posta için virgülle ayırın</p>
            </div>

            {/* Filter Section */}
            <div className="border-t border-border pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="w-4 h-4 text-blue-500" />
                <Label className="text-sm font-semibold">Rapor Filtreleri</Label>
              </div>

              {/* Store Selection */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm">Mağaza Seçimi</Label>
                  <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm" onClick={selectAllStores} className="h-6 text-xs">
                      Tümünü Seç
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={clearStoreSelection} className="h-6 text-xs">
                      Temizle
                    </Button>
                  </div>
                </div>
                <div className="bg-secondary/30 rounded-lg p-3 max-h-32 overflow-y-auto space-y-2">
                  {stores.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Mağaza bulunamadı</p>
                  ) : (
                    stores.map(store => (
                      <div key={store.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`store-${store.id}`}
                          checked={reportForm.store_ids.includes(store.id)}
                          onCheckedChange={() => toggleStoreSelection(store.id)}
                        />
                        <label htmlFor={`store-${store.id}`} className="text-sm cursor-pointer flex-1">
                          {store.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {reportForm.store_ids.length === 0 ? 'Tüm mağazalar dahil' : `${reportForm.store_ids.length} mağaza seçili`}
                </p>
              </div>

              {/* Date Range */}
              <div className="mb-4">
                <Label className="text-sm">Tarih Aralığı</Label>
                <Select value={reportForm.date_range} onValueChange={(v) => setReportForm({ ...reportForm, date_range: v })}>
                  <SelectTrigger className="bg-secondary/50 border-border mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1d">Son 1 Gün</SelectItem>
                    <SelectItem value="7d">Son 7 Gün</SelectItem>
                    <SelectItem value="30d">Son 30 Gün</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Report-specific filters */}
              {reportForm.report_type === 'hourly_traffic' && (
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <Label className="text-sm">Başlangıç Saati</Label>
                    <Select value={reportForm.hour_from?.toString() || ''} onValueChange={(v) => setReportForm({ ...reportForm, hour_from: v ? parseInt(v) : null })}>
                      <SelectTrigger className="bg-secondary/50 border-border mt-1">
                        <SelectValue placeholder="Seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 24}, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>{`${i.toString().padStart(2, '0')}:00`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-sm">Bitiş Saati</Label>
                    <Select value={reportForm.hour_to?.toString() || ''} onValueChange={(v) => setReportForm({ ...reportForm, hour_to: v ? parseInt(v) : null })}>
                      <SelectTrigger className="bg-secondary/50 border-border mt-1">
                        <SelectValue placeholder="Seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from({length: 24}, (_, i) => (
                          <SelectItem key={i} value={i.toString()}>{`${i.toString().padStart(2, '0')}:00`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {reportForm.report_type === 'demographics' && (
                <div className="mb-4">
                  <Label className="text-sm">Cinsiyet Filtresi</Label>
                  <Select value={reportForm.gender_filter || 'all'} onValueChange={(v) => setReportForm({ ...reportForm, gender_filter: v === 'all' ? null : v })}>
                    <SelectTrigger className="bg-secondary/50 border-border mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tümü</SelectItem>
                      <SelectItem value="Male">Sadece Erkek</SelectItem>
                      <SelectItem value="Female">Sadece Kadın</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {reportForm.report_type === 'queue_analysis' && (
                <div className="mb-4">
                  <Label className="text-sm">Minimum Kuyruk Uzunluğu</Label>
                  <Input
                    type="number"
                    min="0"
                    value={reportForm.min_queue_length}
                    onChange={(e) => setReportForm({ ...reportForm, min_queue_length: parseInt(e.target.value) || 0 })}
                    placeholder="0"
                    className="bg-secondary/50 border-border mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Bu değerin altındaki kuyruklar rapora dahil edilmez</p>
                </div>
              )}
            </div>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="border-border text-foreground">İptal</Button>
              </DialogClose>
              <Button type="submit" data-testid="report-save-btn">
                {editingReport ? 'Güncelle' : 'Oluştur'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default ScheduledReportsPage;
