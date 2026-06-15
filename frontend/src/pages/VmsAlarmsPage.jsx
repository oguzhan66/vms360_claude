import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { vmsEventsApi } from '../services/api';
import {
  Bell, ShieldAlert, AlertTriangle, Info, RefreshCw,
  Camera, Clock, TrendingUp, Download
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, PieChart, Pie, Cell, Legend
} from 'recharts';
import { toast } from 'sonner';

const TIME_RANGES = [
  { label: 'Son 1 Saat',   value: 60 },
  { label: 'Son 4 Saat',   value: 240 },
  { label: 'Bugün',        value: 1440 },
  { label: 'Son 3 Gün',    value: 4320 },
  { label: 'Son 7 Gün',    value: 10080 },
  { label: 'Son 30 Gün',   value: 43200 },
];

const LEVELS = [
  { label: 'Tümü',       value: '0,1,2' },
  { label: 'Alarm',      value: '1' },
  { label: 'Bildirim',   value: '0' },
  { label: 'Hata',       value: '2' },
];

const LEVEL_COLORS = {
  'Bildirim': '#3B82F6',
  'Alarm':    '#F59E0B',
  'Hata':     '#EF4444',
};

const PIE_COLORS = ['#3B82F6', '#F59E0B', '#EF4444', '#10B981', '#8B5CF6'];

const KPICard = ({ label, value, icon: Icon, color = 'text-primary', bg = 'bg-secondary/40' }) => (
  <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
    <div className={`p-2.5 ${bg} rounded-lg shrink-0`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value ?? '—'}</div>
    </div>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded p-2 text-xs shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>{p.name}: <strong>{p.value}</strong></p>
      ))}
    </div>
  );
};

export default function VmsAlarmsPage() {
  const [servers, setServers]     = useState([]);
  const [vmsId, setVmsId]         = useState('');
  const [range, setRange]         = useState(1440);
  const [levelFilter, setLevel]   = useState('0,1,2');
  const [data, setData]           = useState(null);
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    vmsEventsApi.getServers()
      .then(r => {
        setServers(r.data);
        if (r.data.length === 1) setVmsId(r.data[0].id);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { last_minutes: range, levels: levelFilter };
      if (vmsId) params.vms_id = vmsId;
      const res = await vmsEventsApi.getAlarms(params);
      setData(res.data);
    } catch (e) {
      toast.error('VMS verisi alınamadı: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  }, [vmsId, range, levelFilter]);

  useEffect(() => { load(); }, [load]);

  // Prepare chart data
  const hourData = data
    ? Array.from({ length: 24 }, (_, h) => ({
        saat: `${String(h).padStart(2, '0')}:00`,
        count: data.stats?.by_hour?.[String(h)] || 0,
      }))
    : [];

  const cameraData = data
    ? Object.entries(data.stats?.by_camera || {})
        .map(([name, count]) => ({ name: name.slice(0, 20), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12)
    : [];

  const levelPieData = data
    ? Object.entries(data.stats?.by_level || {})
        .map(([name, value], i) => ({ name, value, fill: PIE_COLORS[i % PIE_COLORS.length] }))
        .filter(d => d.value > 0)
    : [];

  const typeData = data
    ? Object.entries(data.stats?.by_type || {})
        .map(([name, count]) => ({ name: name.slice(0, 25), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];

  const counts = data?.counts || {};

  const exportCSV = () => {
    if (!data?.events?.length) return;
    const rows = [
      ['Zaman', 'Kamera', 'Seviye', 'Tip', 'Açıklama'].join(';'),
      ...data.events.map(e => [
        (e.time || '').replace('T', ' ').slice(0, 19),
        e.camera_name || e.camera_id || '',
        e.level === '0' ? 'Bildirim' : e.level === '1' ? 'Alarm' : e.level === '2' ? 'Hata' : e.level,
        e.type || '',
        (e.short_desc || '').replace(/;/g, ','),
      ].join(';')),
    ];
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `alarm_raporu_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="page-container">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="w-6 h-6 text-amber-400" />
              Alarm İstatistikleri
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              En çok alarm üretilen noktalar ve olay dağılımı
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportCSV}
              disabled={!data?.events?.length}
              className="btn-secondary flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border disabled:opacity-40"
            >
              <Download className="w-4 h-4" /> CSV
            </button>
            <button
              onClick={load}
              disabled={loading}
              className="btn-primary flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-6 p-3 bg-card border border-border rounded-lg">
          {servers.length > 1 && (
            <select
              value={vmsId}
              onChange={e => setVmsId(e.target.value)}
              className="text-sm rounded border border-border bg-background px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Tüm VMS</option>
              {servers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <div className="flex gap-1 flex-wrap">
            {TIME_RANGES.map(t => (
              <button
                key={t.value}
                onClick={() => setRange(t.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  range === t.value
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap">
            {LEVELS.map(l => (
              <button
                key={l.value}
                onClick={() => setLevel(l.value)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  levelFilter === l.value
                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-300'
                    : 'border-border text-muted-foreground hover:bg-secondary'
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {servers.length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6 text-amber-700 dark:text-amber-200 text-sm">
            Henüz VMS sunucusu eklenmemiş. Ayarlar → VMS Yönetimi bölümünden ekleyin.
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KPICard label="Toplam Olay"  value={data?.total ?? '—'} icon={Bell}          color="text-primary" />
          <KPICard label="Bildirim"     value={counts['Bildirim'] ?? '—'} icon={Info}   color="text-blue-600 dark:text-blue-400" bg="bg-blue-500/10" />
          <KPICard label="Alarm"        value={counts['Alarm'] ?? '—'}    icon={AlertTriangle} color="text-amber-600 dark:text-amber-400" bg="bg-amber-500/10" />
          <KPICard label="Hata"         value={counts['Hata'] ?? '—'}     icon={ShieldAlert}   color="text-red-600 dark:text-red-400" bg="bg-red-500/10" />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">VMS&apos;den veriler yükleniyor...</span>
          </div>
        )}

        {!loading && data && (
          <>
            {/* Top row charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              {/* Saatlik dağılım */}
              <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" /> Saatlik Alarm Dağılımı
                </h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={hourData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="saat" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Alarm" fill="#F59E0B" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Seviye pasta */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-primary" /> Seviye Dağılımı
                </h3>
                {levelPieData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={levelPieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        labelLine={false}
                      >
                        {levelPieData.map((entry, i) => (
                          <Cell key={i} fill={LEVEL_COLORS[entry.name] || PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-muted-foreground text-sm">
                    Veri yok
                  </div>
                )}
              </div>
            </div>

            {/* Bottom row charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* En çok alarm üretilen kameralar */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Camera className="w-4 h-4 text-primary" /> En Fazla Alarm — Kamera Bazlı
                </h3>
                {cameraData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={cameraData}
                      layout="vertical"
                      margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Alarm" fill="#F59E0B" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                    Veri yok
                  </div>
                )}
              </div>

              {/* Olay tipleri */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Bell className="w-4 h-4 text-primary" /> Olay Tipi Dağılımı
                </h3>
                {typeData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={typeData}
                      layout="vertical"
                      margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={160} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Adet" fill="#8B5CF6" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[260px] flex items-center justify-center text-muted-foreground text-sm">
                    Veri yok
                  </div>
                )}
              </div>
            </div>

            {/* Event table */}
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-sm">
                  Olay Listesi
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({data.events?.length || 0} kayıt)
                  </span>
                </h3>
              </div>
              <div className="overflow-auto max-h-[400px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-secondary/80">
                    <tr>
                      {['Zaman', 'Kamera', 'Seviye', 'Tip', 'Açıklama'].map(h => (
                        <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.events || []).slice(0, 500).map((ev, i) => {
                      const lvlLabel = ev.level === '0' ? 'Bildirim' : ev.level === '1' ? 'Alarm' : ev.level === '2' ? 'Hata' : ev.level;
                      const lvlCls   = ev.level === '2' ? 'text-red-400 bg-red-500/10 border-red-500/30'
                                     : ev.level === '1' ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                                     :                    'text-blue-400 bg-blue-500/10 border-blue-500/30';
                      return (
                        <tr key={i} className="border-t border-border/50 hover:bg-secondary/20">
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap font-mono">
                            {(ev.time || '').replace('T', ' ').slice(0, 19)}
                          </td>
                          <td className="px-3 py-1.5 max-w-[180px] truncate">
                            {ev.camera_name || ev.camera_id || '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            <span className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold ${lvlCls}`}>
                              {lvlLabel}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[160px] truncate">
                            {ev.type || '—'}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[250px] truncate">
                            {ev.short_desc || ev.csv_desc || '—'}
                          </td>
                        </tr>
                      );
                    })}
                    {!data.events?.length && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                          Seçilen zaman aralığında olay bulunamadı
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
