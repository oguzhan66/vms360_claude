import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { vmsEventsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { ShieldAlert, Cctv, Car, Download, RefreshCw, Calendar, FileText, Filter, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const REPORT_TYPES = [
  { id: 'alarm',   label: 'Alarm Raporu',   icon: ShieldAlert, description: 'Seviye ve tür bazlı alarm istatistikleri' },
  { id: 'camera',  label: 'Kamera Raporu',  icon: Cctv,        description: 'Kamera bazlı alarm dağılımı' },
  { id: 'lpr',     label: 'LPR / Plaka',    icon: ShieldAlert, description: 'Kapı bazlı araç giriş/çıkış istatistikleri' },
];

const DATE_RANGES = [
  { id: 'today',   label: 'Bugün' },
  { id: '1d',      label: 'Son 24 Saat' },
  { id: '7d',      label: 'Son 7 Gün' },
  { id: '30d',     label: 'Son 30 Gün' },
  { id: 'custom',  label: 'Manuel Seçim' },
];

const LEVEL_COLORS = { Bildirim: '#3B82F6', Alarm: '#F59E0B', Hata: '#EF4444' };
const BAR_COLORS   = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];
const levelMap     = { '0': 'Bildirim', '1': 'Alarm', '2': 'Hata' };

const exportCSV = (rows, filename) => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map(r => headers.map(h => `"${(r[h] ?? '').toString().replace(/"/g, '""')}"`).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

const ReportsPage = () => {
  const [selectedType,     setSelectedType]     = useState('alarm');
  const [dateRange,        setDateRange]        = useState('today');
  const [dateFrom,         setDateFrom]         = useState('');
  const [dateTo,           setDateTo]           = useState('');
  const [levelFilter,      setLevelFilter]      = useState('0,1,2');
  const [data,             setData]             = useState(null);
  const [lprCamData,       setLprCamData]       = useState([]);
  const [loading,          setLoading]          = useState(false);
  const [availableTypes,   setAvailableTypes]   = useState([]);
  const [selectedTypes,    setSelectedTypes]    = useState([]); // boş = tümü
  const [typeDropdownOpen, setTypeDropdownOpen] = useState(false);

  // Mevcut olay tiplerini yükle
  useEffect(() => {
    vmsEventsApi.getTypes().then(r => {
      setAvailableTypes(r.data.types || []);
    }).catch(() => {});
  }, []);

  const toggleType = (type) => {
    setSelectedTypes(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  const buildParams = useCallback(() => {
    const p = { levels: levelFilter };
    if (dateRange === 'today') {
      const d = new Date(); d.setHours(0, 0, 0, 0);
      p.time_from = d.toISOString();
      p.time_to   = new Date().toISOString();
    } else if (dateRange === '1d') {
      const d = new Date(); d.setMinutes(d.getMinutes() - 1440);
      p.time_from = d.toISOString();
      p.time_to   = new Date().toISOString();
    } else if (dateRange === '7d') {
      const d = new Date(); d.setDate(d.getDate() - 7);
      p.time_from = d.toISOString();
      p.time_to   = new Date().toISOString();
    } else if (dateRange === '30d') {
      const d = new Date(); d.setDate(d.getDate() - 30);
      p.time_from = d.toISOString();
      p.time_to   = new Date().toISOString();
    } else if (dateRange === 'custom') {
      if (dateFrom) p.time_from = new Date(dateFrom).toISOString();
      if (dateTo)   p.time_to   = new Date(dateTo).toISOString();
    }
    if (selectedTypes.length > 0) {
      p.types = selectedTypes.join(',');
    }
    return p;
  }, [dateRange, dateFrom, dateTo, levelFilter, selectedTypes]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const p = buildParams();
      const [alarmRes, lprCamRes] = await Promise.allSettled([
        vmsEventsApi.getAlarms(p),
        vmsEventsApi.getLPRByCamera({ time_from: p.time_from, time_to: p.time_to }),
      ]);
      if (alarmRes.status === 'fulfilled') setData(alarmRes.value.data);
      if (lprCamRes.status === 'fulfilled') setLprCamData(lprCamRes.value.data.cameras || []);
    } catch (e) {
      console.error(e);
      toast.error('Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // ── Derived stats ─────────────────────────────────────────────────────────
  const events    = data?.events || [];
  const stats     = data?.stats  || {};

  const levelPie = Object.entries(data?.counts || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => ({ name: k, value: v, color: LEVEL_COLORS[k] || '#6B7280' }));

  const hourlyArr = Array.from({ length: 24 }, (_, h) => ({
    hour: `${String(h).padStart(2, '0')}:00`,
    count: stats.by_hour?.[String(h)] || 0,
  }));

  const camArr = Object.entries(stats.by_camera || {})
    .slice(0, 10)
    .map(([name, count], i) => ({
      name: name.length > 18 ? name.slice(0, 16) + '…' : name,
      count,
      fill: BAR_COLORS[i % BAR_COLORS.length],
    }));

  const typeArr = Object.entries(stats.by_type || {})
    .slice(0, 10)
    .map(([name, count], i) => ({
      name: name.length > 22 ? name.slice(0, 20) + '…' : name,
      count,
      fill: BAR_COLORS[i % BAR_COLORS.length],
    }));

  // Camera-level breakdown for camera report
  const cameraRows = Object.entries(stats.by_camera || {})
    .sort((a, b) => b[1] - a[1])
    .map(([name, total]) => {
      const camEvents = events.filter(e => (e.camera_name || e.camera_id) === name);
      const byLvl = { Bildirim: 0, Alarm: 0, Hata: 0 };
      camEvents.forEach(e => { byLvl[levelMap[String(e.level)] || 'Bildirim']++; });
      return { name, total, ...byLvl };
    });

  // ── Exports ───────────────────────────────────────────────────────────────
  const handleExportCSV = () => {
    const date = new Date().toISOString().slice(0, 10);
    if (selectedType === 'alarm') {
      const rows = events.map(e => ({
        Zaman:    e.time?.replace('T', ' ').slice(0, 19) || '',
        Kamera:   e.camera_name || e.camera_id || '',
        Seviye:   levelMap[String(e.level)] || e.level || '',
        Tip:      e.type || '',
        Açıklama: e.short_desc || '',
        Plaka:    e.plate || '',
        VMS:      e.vms_name || '',
      }));
      exportCSV(rows, `alarm_raporu_${date}.csv`);
    } else if (selectedType === 'camera') {
      exportCSV(cameraRows, `kamera_raporu_${date}.csv`);
    } else if (selectedType === 'lpr') {
      const rows = lprCamData.map(c => ({
        Kamera:     c.camera_name || c.camera_id || '',
        Toplam:     c.total,
        Giriş:      c.entry,
        Çıkış:      c.exit,
        Bilinmiyor: c.unknown,
      }));
      exportCSV(rows, `lpr_kamera_raporu_${date}.csv`);
    }
    toast.success('CSV indirildi');
  };

  const dateLabel = DATE_RANGES.find(r => r.id === dateRange)?.label || '';

  const levelBadge = (level) => {
    const lbl = levelMap[String(level)] || level;
    const cls = lbl === 'Hata' ? 'text-red-400 bg-red-500/10' : lbl === 'Alarm' ? 'text-amber-400 bg-amber-500/10' : 'text-blue-400 bg-blue-500/10';
    return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${cls}`}>{lbl}</span>;
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Raporlar</h1>
            <p className="text-sm text-muted-foreground mt-1">VMS alarm istatistik raporları ve veri dışa aktarma</p>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Report Type Tabs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => setSelectedType(rt.id)}
              className={`p-4 text-left transition-all ${
                selectedType === rt.id ? 'store-card border-primary border-2' : 'store-card hover:border-primary/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center ${selectedType === rt.id ? 'bg-primary/20' : 'bg-secondary'}`}>
                  <rt.icon className={`w-5 h-5 ${selectedType === rt.id ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className={`font-semibold ${selectedType === rt.id ? 'text-primary' : ''}`}>{rt.label}</div>
                  <div className="text-xs text-muted-foreground">{rt.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Filter Bar */}
        <div className="filter-bar mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
            <Calendar className="w-4 h-4" />
            <span>Tarih Aralığı</span>
          </div>

          <select
            value={dateRange}
            onChange={e => setDateRange(e.target.value)}
            className="text-sm rounded border border-border bg-background text-foreground px-3 py-1.5 focus:outline-none"
          >
            {DATE_RANGES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>

          {dateRange === 'custom' && (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground shrink-0">Başlangıç:</Label>
                <Input type="datetime-local" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-44 bg-secondary/50 border-border h-9" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground shrink-0">Bitiş:</Label>
                <Input type="datetime-local" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-44 bg-secondary/50 border-border h-9" />
              </div>
            </>
          )}

          <select
            value={levelFilter}
            onChange={e => setLevelFilter(e.target.value)}
            className="text-sm rounded border border-border bg-background text-foreground px-3 py-1.5 focus:outline-none"
          >
            <option value="0,1,2">Tüm Seviyeler</option>
            <option value="0">Yalnızca Bildirim</option>
            <option value="1">Yalnızca Alarm</option>
            <option value="2">Yalnızca Hata</option>
            <option value="1,2">Alarm + Hata</option>
          </select>

          {/* Olay Tipi Filtresi */}
          {availableTypes.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setTypeDropdownOpen(o => !o)}
                className="flex items-center gap-2 text-sm rounded border border-border bg-background text-foreground px-3 py-1.5 focus:outline-none hover:border-primary/50 transition-colors"
              >
                <Filter className="w-3.5 h-3.5" />
                {selectedTypes.length === 0
                  ? 'Tüm Olay Tipleri'
                  : `${selectedTypes.length} tip seçili`}
                <ChevronDown className="w-3.5 h-3.5 opacity-60" />
              </button>
              {typeDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setTypeDropdownOpen(false)} />
                  <div className="absolute top-full left-0 mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-52">
                  <button
                    className="w-full text-left text-xs px-3 py-2 hover:bg-secondary/50 text-muted-foreground"
                    onClick={() => { setSelectedTypes([]); setTypeDropdownOpen(false); }}
                  >
                    Tümünü Seç (Filtre Yok)
                  </button>
                  <div className="h-px bg-border mx-2 my-1" />
                  {availableTypes.map(t => (
                    <label key={t.type} className="flex items-center gap-2.5 px-3 py-2 hover:bg-secondary/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTypes.includes(t.type)}
                        onChange={() => toggleType(t.type)}
                        className="accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{t.label}</div>
                        <div className="text-xs text-muted-foreground">{t.count.toLocaleString()} kayıt</div>
                      </div>
                    </label>
                  ))}
                </div>
                </>
              )}
            </div>
          )}

          <div className="flex-1" />

          <Button variant="outline" size="sm" onClick={loadReport} disabled={loading} className="border-border text-foreground">
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>

          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={loading || !data} className="border-border text-foreground">
            <Download className="w-4 h-4 mr-2 text-green-500" />
            CSV İndir
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-20 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p>Rapor yükleniyor…</p>
          </div>
        ) : !data ? (
          <div className="text-center py-20 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>Veri yüklenemedi</p>
          </div>
        ) : (
          <>
            {/* ── KPI Cards ─────────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-secondary/30 border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">Toplam Alarm ({dateLabel})</div>
                <div className="text-3xl font-mono font-bold">{data.total}</div>
              </div>
              <div className="bg-blue-500/5 border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">Bildirim</div>
                <div className="text-3xl font-mono font-bold text-blue-600 dark:text-blue-400">{data.counts?.Bildirim ?? 0}</div>
              </div>
              <div className="bg-amber-500/5 border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">Alarm</div>
                <div className="text-3xl font-mono font-bold text-amber-600 dark:text-amber-400">{data.counts?.Alarm ?? 0}</div>
              </div>
              <div className="bg-red-500/5 border border-border rounded-lg p-4">
                <div className="text-xs text-muted-foreground mb-1">Hata</div>
                <div className="text-3xl font-mono font-bold text-red-600 dark:text-red-400">{data.counts?.Hata ?? 0}</div>
              </div>
            </div>

            {/* ── ALARM RAPORU GÖRÜNÜMÜ ─────────────────────────────────────── */}
            {selectedType === 'alarm' && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
                  {/* Level Pie */}
                  <div className="chart-container">
                    <div className="chart-title">Seviye Dağılımı</div>
                    <div className="h-48">
                      {levelPie.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={levelPie} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2} dataKey="value">
                              {levelPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                            </Pie>
                            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
                          </PieChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Veri yok</div>
                      )}
                    </div>
                    <div className="flex justify-center gap-3 mt-2">
                      {levelPie.map((e, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs">
                          <div className="w-3 h-3 rounded-sm" style={{ background: e.color }} />
                          <span className="text-muted-foreground">{e.name}: {e.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Hourly */}
                  <div className="chart-container col-span-2">
                    <div className="chart-title">Saatlik Dağılım</div>
                    <div className="h-52">
                      {hourlyArr.some(d => d.count > 0) ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hourlyArr}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                            <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} interval={3} />
                            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                            <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} formatter={v => [v, 'Alarm']} />
                            <Bar dataKey="count" fill="#F59E0B" radius={[2, 2, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Veri yok</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Alarm Type Bar */}
                {typeArr.length > 0 && (
                  <div className="chart-container mb-6">
                    <div className="chart-title">Alarm Tipi Dağılımı</div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={typeArr} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" width={130} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} formatter={v => [v, 'Alarm']} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {typeArr.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Event Table */}
                <div className="chart-container">
                  <div className="chart-title">Alarm Listesi ({events.length} kayıt)</div>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border">
                          <th className="text-left py-2 pr-4">Zaman</th>
                          <th className="text-left py-2 pr-4">Kamera</th>
                          <th className="text-left py-2 pr-4">Seviye</th>
                          <th className="text-left py-2 pr-4">Tip</th>
                          <th className="text-left py-2">Açıklama</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.slice(0, 200).map((ev, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="py-2 pr-4 font-mono text-xs text-muted-foreground whitespace-nowrap">
                              {ev.time?.replace('T', ' ').slice(0, 19) || '—'}
                            </td>
                            <td className="py-2 pr-4 text-xs">{ev.camera_name || ev.camera_id || '—'}</td>
                            <td className="py-2 pr-4">{levelBadge(ev.level)}</td>
                            <td className="py-2 pr-4 text-xs text-muted-foreground">{ev.type || '—'}</td>
                            <td className="py-2 text-xs text-muted-foreground truncate max-w-xs">{ev.short_desc || '—'}</td>
                          </tr>
                        ))}
                        {events.length === 0 && (
                          <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">Bu aralıkta alarm kaydı yok</td></tr>
                        )}
                        {events.length > 200 && (
                          <tr><td colSpan={5} className="text-center py-2 text-xs text-muted-foreground">… ve {events.length - 200} kayıt daha. Tümü için CSV indirin.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── KAMERA RAPORU GÖRÜNÜMÜ ────────────────────────────────────── */}
            {selectedType === 'camera' && (
              <>
                {/* Camera Bar */}
                <div className="chart-container mb-6">
                  <div className="chart-title">En Çok Alarm Gelen Kameralar</div>
                  <div className="h-64">
                    {camArr.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={camArr} layout="vertical" margin={{ left: 8, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                          <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                          <YAxis dataKey="name" type="category" width={120} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} formatter={v => [v, 'Alarm']} />
                          <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                            {camArr.map((e, i) => <Cell key={i} fill={e.fill} />)}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Veri yok</div>
                    )}
                  </div>
                </div>

                {/* Camera Detail Table */}
                <div className="chart-container">
                  <div className="chart-title">Kamera Bazlı Detay ({cameraRows.length} kamera)</div>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border">
                          <th className="text-left py-2 pr-4">#</th>
                          <th className="text-left py-2 pr-4">Kamera</th>
                          <th className="text-right py-2 pr-4">Toplam</th>
                          <th className="text-right py-2 pr-4">Bildirim</th>
                          <th className="text-right py-2 pr-4">Alarm</th>
                          <th className="text-right py-2">Hata</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cameraRows.map((row, i) => (
                          <tr key={i} className="border-b border-border/50 hover:bg-secondary/20">
                            <td className="py-2 pr-4 text-xs text-muted-foreground">{i + 1}</td>
                            <td className="py-2 pr-4 font-medium text-xs">{row.name}</td>
                            <td className="py-2 pr-4 text-right font-mono font-bold">{row.total}</td>
                            <td className="py-2 pr-4 text-right font-mono text-blue-400">{row.Bildirim}</td>
                            <td className="py-2 pr-4 text-right font-mono text-amber-400">{row.Alarm}</td>
                            <td className="py-2 text-right font-mono text-red-400">{row.Hata}</td>
                          </tr>
                        ))}
                        {cameraRows.length === 0 && (
                          <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Bu aralıkta kamera verisi yok</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}

            {/* ── LPR RAPORU GÖRÜNÜMÜ ───────────────────────────────────────── */}
            {selectedType === 'lpr' && (
              <>
                {/* KPI */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-secondary/30 border border-border rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Toplam Geçiş</div>
                    <div className="text-3xl font-mono font-bold">{lprCamData.reduce((s, c) => s + c.total, 0)}</div>
                  </div>
                  <div className="bg-emerald-500/5 border border-border rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Giriş (BottomUp)</div>
                    <div className="text-3xl font-mono font-bold text-emerald-600 dark:text-emerald-400">{lprCamData.reduce((s, c) => s + c.entry, 0)}</div>
                  </div>
                  <div className="bg-red-500/5 border border-border rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Çıkış (TopDown / Exit)</div>
                    <div className="text-3xl font-mono font-bold text-red-600 dark:text-red-400">{lprCamData.reduce((s, c) => s + c.exit, 0)}</div>
                  </div>
                  <div className="bg-secondary/30 border border-border rounded-lg p-4">
                    <div className="text-xs text-muted-foreground mb-1">Bilinmiyor</div>
                    <div className="text-3xl font-mono font-bold text-muted-foreground">{lprCamData.reduce((s, c) => s + c.unknown, 0)}</div>
                  </div>
                </div>

                {/* Kamera / Kapı tablosu */}
                <div className="chart-container">
                  <div className="chart-title flex items-center gap-2">
                    <Car className="w-4 h-4 text-emerald-500" />
                    Kapı / Kamera Bazlı Geçiş Detayı
                  </div>
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-muted-foreground border-b border-border">
                          <th className="text-left py-2 pr-4">#</th>
                          <th className="text-left py-2 pr-4">Kamera / Kapı</th>
                          <th className="text-right py-2 pr-4">Toplam</th>
                          <th className="text-right py-2 pr-4 text-emerald-600 dark:text-emerald-400">Giriş</th>
                          <th className="text-right py-2 pr-4 text-red-600 dark:text-red-400">Çıkış</th>
                          <th className="text-right py-2 text-muted-foreground">Bilinmiyor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lprCamData.length === 0 ? (
                          <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Bu aralıkta LPR verisi yok</td></tr>
                        ) : lprCamData.map((cam, i) => {
                          const maxTotal = lprCamData[0]?.total || 1;
                          return (
                            <tr key={i} className="border-b border-border/40 hover:bg-secondary/20">
                              <td className="py-2 pr-4 text-muted-foreground text-xs">{i + 1}</td>
                              <td className="py-2 pr-4">
                                <div>{cam.camera_name || cam.camera_id || '—'}</div>
                                <div className="w-full h-1 bg-border rounded-full mt-1 overflow-hidden">
                                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(cam.total / maxTotal) * 100}%` }} />
                                </div>
                              </td>
                              <td className="py-2 pr-4 text-right font-mono font-bold">{cam.total}</td>
                              <td className="py-2 pr-4 text-right font-mono text-emerald-600 dark:text-emerald-400">{cam.entry}</td>
                              <td className="py-2 pr-4 text-right font-mono text-red-600 dark:text-red-400">{cam.exit}</td>
                              <td className="py-2 text-right font-mono text-muted-foreground">{cam.unknown}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default ReportsPage;
