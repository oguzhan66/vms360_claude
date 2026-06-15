import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { vmsEventsApi } from '../services/api';
import {
  Car, ScanSearch, RefreshCw, Download, ParkingCircle,
  Clock, BarChart3, Hash
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { toast } from 'sonner';

const TIME_RANGES = [
  { label: 'Son 1 Saat',  value: 60 },
  { label: 'Son 4 Saat',  value: 240 },
  { label: 'Bugün',       value: 1440 },
  { label: 'Son 3 Gün',   value: 4320 },
  { label: 'Son 7 Gün',   value: 10080 },
  { label: 'Son 30 Gün',  value: 43200 },
];

const KPICard = ({ label, value, sub, icon: Icon, color = 'text-primary', bg = 'bg-secondary/40' }) => (
  <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
    <div className={`p-2.5 ${bg} rounded-lg shrink-0`}>
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value ?? '—'}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
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

export default function VmsLPRPage() {
  const [servers, setServers]   = useState([]);
  const [vmsId, setVmsId]       = useState('');
  const [range, setRange]       = useState(1440);
  const [data, setData]         = useState(null);
  const [parking, setParking]   = useState(null);
  const [loading, setLoading]   = useState(false);
  const [plateSearch, setPlateSearch] = useState('');

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
      const params = { last_minutes: range };
      if (vmsId) params.vms_id = vmsId;

      const [lprRes, parkRes] = await Promise.allSettled([
        vmsEventsApi.getLPR(params),
        vmsEventsApi.getLPRParking(vmsId ? { vms_id: vmsId } : {}),
      ]);

      if (lprRes.status === 'fulfilled') setData(lprRes.value.data);
      if (parkRes.status === 'fulfilled') setParking(parkRes.value.data);
    } catch (e) {
      toast.error('Veri alınamadı: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  }, [vmsId, range]);

  useEffect(() => { load(); }, [load]);

  const hourData = data
    ? Array.from({ length: 24 }, (_, h) => ({
        saat: `${String(h).padStart(2, '0')}:00`,
        count: data.stats?.by_hour?.[String(h)] || 0,
      }))
    : [];

  const topPlates = (data?.stats?.top_plates || []).filter(p =>
    !plateSearch || p.plate.toUpperCase().includes(plateSearch.toUpperCase())
  );

  const cameraData = data
    ? Object.entries(data.stats?.by_camera || {})
        .map(([name, count]) => ({ name: name.slice(0, 22), count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
    : [];

  const exportCSV = () => {
    if (!data?.events?.length) return;
    const rows = [
      ['Zaman', 'Kamera', 'Plaka', 'Açıklama'].join(';'),
      ...data.events.map(e => [
        (e.time || '').replace('T', ' ').slice(0, 19),
        e.camera_name || e.camera_id || '',
        e.plate || '',
        (e.short_desc || e.csv_desc || '').replace(/;/g, ','),
      ].join(';')),
    ];
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `plaka_raporu_${new Date().toISOString().slice(0, 10)}.csv`;
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
              <Car className="w-6 h-6 text-emerald-400" />
              Plaka Tanıma İstatistikleri
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              En sık geçiş yapan plakalar ve kamera bazlı dağılım
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
        </div>

        {servers.length === 0 && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 mb-6 text-amber-300 text-sm">
            Henüz VMS sunucusu eklenmemiş. Ayarlar → VMS Yönetimi bölümünden ekleyin.
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <KPICard
            label="Toplam Geçiş"
            value={data?.total ?? '—'}
            icon={ScanSearch}
            color="text-primary"
          />
          <KPICard
            label="Benzersiz Plaka"
            value={data?.unique_plates ?? '—'}
            icon={Car}
            color="text-emerald-400"
            bg="bg-emerald-500/10"
          />
          <KPICard
            label="Park Kapasitesi"
            value={parking ? `${parking.total_current} / ${parking.total_capacity}` : '—'}
            sub={parking ? `%${parking.total_occupancy_percent} dolu` : undefined}
            icon={ParkingCircle}
            color="text-blue-400"
            bg="bg-blue-500/10"
          />
          <KPICard
            label="Saat Başı Ort."
            value={data && range ? Math.round(data.total / (range / 60)) : '—'}
            sub="geçiş/saat"
            icon={Clock}
            color="text-violet-400"
            bg="bg-violet-500/10"
          />
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">VMS&apos;den plaka verileri yükleniyor...</span>
          </div>
        )}

        {!loading && data && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              {/* Saatlik dağılım */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-primary" /> Saatlik Geçiş Dağılımı
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={hourData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="saat" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="Geçiş" fill="#10B981" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Kamera dağılımı */}
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4 text-primary" /> Kamera Bazlı Geçiş
                </h3>
                {cameraData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart
                      data={cameraData}
                      layout="vertical"
                      margin={{ top: 0, right: 20, bottom: 0, left: 10 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={130} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="count" name="Geçiş" fill="#10B981" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[220px] flex items-center justify-center text-muted-foreground text-sm">
                    Kamera verisi yok
                  </div>
                )}
              </div>
            </div>

            {/* Top plates + Event table */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
              {/* Top plates */}
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-sm flex items-center gap-1.5">
                    <Hash className="w-4 h-4 text-primary" /> En Sık Geçiş Yapan Plakalar
                  </h3>
                </div>
                <input
                  type="text"
                  placeholder="Plaka ara..."
                  value={plateSearch}
                  onChange={e => setPlateSearch(e.target.value)}
                  className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 mb-3 focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="overflow-auto max-h-[360px] space-y-1">
                  {topPlates.map((p, i) => (
                    <div key={p.plate} className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                        <span className="font-mono font-bold text-sm tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded">
                          {p.plate}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold font-mono">{p.count}</span>
                        <span className="text-xs text-muted-foreground ml-1">geçiş</span>
                      </div>
                    </div>
                  ))}
                  {topPlates.length === 0 && (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      {plateSearch ? 'Arama sonucu bulunamadı' : 'LPR verisi yok'}
                    </div>
                  )}
                </div>
              </div>

              {/* Event table */}
              <div className="lg:col-span-2 bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3">
                  Son Geçiş Kayıtları
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({data.events?.length || 0} kayıt)
                  </span>
                </h3>
                <div className="overflow-auto max-h-[420px]">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-secondary/80">
                      <tr>
                        {['Zaman', 'Kamera', 'Plaka', 'Açıklama'].map(h => (
                          <th key={h} className="text-left px-3 py-2 font-semibold text-muted-foreground whitespace-nowrap">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(data.events || []).slice(0, 500).map((ev, i) => (
                        <tr key={i} className="border-t border-border/50 hover:bg-secondary/20">
                          <td className="px-3 py-1.5 text-muted-foreground whitespace-nowrap font-mono">
                            {(ev.time || '').replace('T', ' ').slice(0, 19)}
                          </td>
                          <td className="px-3 py-1.5 max-w-[160px] truncate">
                            {ev.camera_name || ev.camera_id || '—'}
                          </td>
                          <td className="px-3 py-1.5">
                            {ev.plate ? (
                              <span className="font-mono font-bold tracking-wider text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 rounded text-[11px]">
                                {ev.plate}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground max-w-[220px] truncate">
                            {ev.short_desc || ev.csv_desc || '—'}
                          </td>
                        </tr>
                      ))}
                      {!data.events?.length && (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                            Seçilen zaman aralığında LPR verisi bulunamadı
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Parking detail */}
            {parking?.by_vms?.length > 0 && parking.total_capacity > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3 flex items-center gap-1.5">
                  <ParkingCircle className="w-4 h-4 text-blue-400" /> Anlık Otopark Doluluk
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {parking.by_vms.map((vms, i) => (
                    <div key={i} className="bg-secondary/30 rounded-lg p-3">
                      <div className="text-xs text-muted-foreground mb-1">{vms.vms_name}</div>
                      <div className="flex items-end gap-2">
                        <span className="text-2xl font-bold font-mono text-blue-400">{vms.current_count}</span>
                        <span className="text-sm text-muted-foreground mb-0.5">/ {vms.parking_size} araç</span>
                      </div>
                      <div className="mt-2 h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-500 rounded-full transition-all"
                          style={{ width: `${Math.min(vms.occupancy_percent, 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">%{vms.occupancy_percent} dolu</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
