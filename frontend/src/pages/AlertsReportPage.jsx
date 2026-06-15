import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import api from '../services/api';
import {
  Bell, AlertTriangle, CheckCircle, Clock, TrendingUp, Store,
  Download, Mail, RefreshCw, ChevronDown, ChevronUp,
  ListOrdered, Users, Filter
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend
} from 'recharts';
import { toast } from 'sonner';

/* ─── sabitler ─────────────────────────────────────────────────────────── */
const TYPE_LABEL  = { counter: 'Kişi Sayma', queue: 'Kuyruk' };
const LEVEL_LABEL = { critical: 'Kritik', warning: 'Uyarı' };
const LEVEL_CLS   = {
  critical: 'bg-red-500/10 border-red-500/30 text-red-400',
  warning:  'bg-amber-500/10 border-amber-500/30 text-amber-400',
};
const TypeIcon = { counter: Users, queue: ListOrdered };

/* ─── KPI kart ──────────────────────────────────────────────────────────── */
const KPICard = ({ label, value, icon: Icon, color = 'text-primary', sub }) => (
  <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
    <div className="p-2.5 bg-secondary/40 rounded-lg shrink-0">
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold font-mono ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  </div>
);

/* ─── tek uyarı satırı (akordiyon içinde) ───────────────────────────────── */
const AlertRow = ({ alert, expanded, onToggle }) => {
  const isActive = !alert.cleared_at;
  const Icon = TypeIcon[alert.alert_type] || Bell;
  const cls  = LEVEL_CLS[alert.level] || 'bg-secondary/30 border-border text-muted-foreground';
  return (
    <div className={`rounded border ${isActive ? 'border-red-500/30' : 'border-border/60'} overflow-hidden`}>
      <div
        className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-secondary/20 transition-colors"
        onClick={onToggle}
      >
        <div className={`p-1 rounded border ${cls} shrink-0`}>
          <Icon className="w-3 h-3" />
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${cls}`}>
            {LEVEL_LABEL[alert.level]}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {TYPE_LABEL[alert.alert_type]}
          </span>
          <span className="text-xs text-muted-foreground">
            {(alert.started_at || '').slice(0, 16).replace('T', ' ')}
          </span>
          {alert.duration_minutes && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />{alert.duration_minutes} dk
            </span>
          )}
          {isActive && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/20 border border-red-500/40 text-red-400 font-bold animate-pulse">
              AKTİF
            </span>
          )}
        </div>
        <div className="text-right shrink-0 mr-1">
          <div className="text-xs font-mono font-bold">
            {alert.alert_type === 'counter' ? `%${alert.peak_value}` : `${alert.peak_value} kişi`}
          </div>
        </div>
        {expanded
          ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </div>
      {expanded && (
        <div className="px-3 pb-2.5 pt-1.5 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground bg-secondary/10">
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5">Başlangıç</div>
            <div className="text-foreground font-mono">{(alert.started_at || '').slice(0, 19).replace('T', ' ')}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5">Bitiş</div>
            <div className="text-foreground font-mono">{alert.cleared_at ? alert.cleared_at.slice(0, 19).replace('T', ' ') : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5">Süre</div>
            <div className="text-foreground font-mono">{alert.duration_minutes ? `${alert.duration_minutes} dk` : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider mb-0.5">Maks. Değer / Eşik</div>
            <div className="text-foreground font-mono">
              {alert.alert_type === 'counter' ? `%${alert.peak_value}` : `${alert.peak_value} kişi`}
              {' / '}
              {alert.threshold ?? alert.threshold_percent ?? '—'}{alert.threshold_percent ? '%' : ''}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ─── lokasyon akordiyon grubu ────────────────────────────────────────────── */
const StoreAccordion = ({ storeName, alerts }) => {
  const [open, setOpen] = useState(false);
  const [expandedRow, setExpandedRow] = useState(null);

  const critical = alerts.filter(a => a.level === 'critical').length;
  const warning  = alerts.filter(a => a.level === 'warning').length;
  const active   = alerts.filter(a => !a.cleared_at).length;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      {/* Grup başlığı */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary/20 transition-colors text-left"
        onClick={() => { setOpen(v => !v); setExpandedRow(null); }}
      >
        <Store className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="flex-1 font-semibold text-sm">{storeName}</span>

        {/* Sayaçlar */}
        <div className="flex items-center gap-2 text-xs">
          {active > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/20 border border-red-500/30 text-red-400 font-bold animate-pulse">
              {active} aktif
            </span>
          )}
          {critical > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 font-medium">
              {critical} kritik
            </span>
          )}
          {warning > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
              {warning} uyarı
            </span>
          )}
          <span className="text-muted-foreground">{alerts.length} toplam</span>
        </div>

        {open
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
      </button>

      {/* Satırlar */}
      {open && (
        <div className="border-t border-border/50 px-3 py-2 space-y-1.5 bg-secondary/5">
          {alerts.map((a, i) => (
            <AlertRow
              key={i}
              alert={a}
              expanded={expandedRow === i}
              onToggle={() => setExpandedRow(expandedRow === i ? null : i)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/* ─── pill filtre butonu ─────────────────────────────────────────────────── */
const Pill = ({ label, active, onClick, color }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 text-xs rounded-full border font-medium transition-colors ${
      active
        ? color || 'bg-primary border-primary text-primary-foreground'
        : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
    }`}
  >
    {label}
  </button>
);

/* ─── yardımcılar ───────────────────────────────────────────────────────── */
const today   = () => new Date().toISOString().split('T')[0];
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const PRESETS = [
  { label: 'Bugün',  from: today(),     to: today() },
  { label: '7 Gün',  from: daysAgo(7),  to: today() },
  { label: '30 Gün', from: daysAgo(30), to: today() },
];

/* ─── ana sayfa ─────────────────────────────────────────────────────────── */
const AlertsReportPage = () => {
  const [dateFrom,    setDateFrom]  = useState(daysAgo(7));
  const [dateTo,      setDateTo]    = useState(today());
  const [alertType,   setAlertType] = useState('all');   // API filtresi
  const [levelFilter, setLevel]     = useState('all');   // lokal
  const [storeFilter, setStore]     = useState('all');   // lokal
  const [alerts,      setAlerts]    = useState([]);
  const [stats,       setStats]     = useState(null);
  const [loading,     setLoading]   = useState(false);
  const [recipient,   setRecipient] = useState('');
  const [sending,     setSending]   = useState(false);
  const [activeTab,   setActiveTab] = useState('list');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const base  = `date_from=${dateFrom}&date_to=${dateTo}`;
      const typeQ = alertType !== 'all' ? `&alert_type=${alertType}` : '';
      const [aRes, sRes] = await Promise.all([
        api.get(`/alerts?${base}${typeQ}&limit=1000`),
        api.get(`/alerts/stats?${base}${typeQ}`),
      ]);
      setAlerts(aRes.data.alerts || []);
      setStats(sRes.data);
    } catch {
      toast.error('Veriler yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, alertType]);

  useEffect(() => { load(); }, [load]);

  const applyPreset = (p) => { setDateFrom(p.from); setDateTo(p.to); };

  const exportCSV = () => {
    const p = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
    if (alertType !== 'all') p.append('alert_type', alertType);
    if (levelFilter !== 'all') p.append('level', levelFilter);
    if (storeFilter !== 'all') p.append('store_id', storeFilter);
    window.open(`/api/alerts/export?${p}`, '_blank');
  };

  const sendReport = async () => {
    setSending(true);
    try {
      const res = await api.post('/alerts/send-report', {
        date_from: dateFrom, date_to: dateTo,
        alert_type: alertType !== 'all' ? alertType : undefined,
        recipient: recipient || undefined,
      });
      if (res.data.success) toast.success(res.data.message);
      else toast.error(res.data.message);
    } catch { toast.error('Gönderilemedi'); }
    finally { setSending(false); }
  };

  /* benzersiz lokasyonlar (yüklenen veriden) */
  const storeOptions = Array.from(
    alerts.reduce((m, a) => { if (!m.has(a.store_id)) m.set(a.store_id, a.store_name); return m; }, new Map()),
    ([id, name]) => ({ id, name })
  ).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  /* lokal filtre */
  const filtered = alerts.filter(a =>
    (levelFilter === 'all' || a.level === levelFilter) &&
    (storeFilter === 'all' || a.store_id === storeFilter)
  );

  /* lokasyon bazlı gruplama */
  const byStore = filtered.reduce((acc, a) => {
    const key = a.store_id;
    if (!acc[key]) acc[key] = { name: a.store_name, alerts: [] };
    acc[key].alerts.push(a);
    return acc;
  }, {});
  const storeGroups = Object.values(byStore).sort((a, b) => {
    const aActive = a.alerts.filter(x => !x.cleared_at).length;
    const bActive = b.alerts.filter(x => !x.cleared_at).length;
    if (bActive !== aActive) return bActive - aActive;
    return b.alerts.length - a.alerts.length;
  });

  /* grafik verisi */
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const items = (stats?.hourly_distribution || []).filter(x => x.hour === h);
    return {
      hour:     String(h).padStart(2, '0'),
      critical: items.find(x => x.level === 'critical')?.count || 0,
      warning:  items.find(x => x.level === 'warning')?.count  || 0,
    };
  });
  const dailyData = (stats?.daily_summary || []).map(d => ({
    date: d.date?.slice(5), critical: d.critical, warning: d.warning, toplam: d.total,
  }));
  const tooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', fontSize: '12px' };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-400" />
              Uyarı Raporu
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Kişi sayma ve kuyruk uyarılarının geçmişi</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportCSV}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors">
              <Download className="w-4 h-4" /> CSV İndir
            </button>
            <button onClick={load}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-secondary/50 hover:bg-secondary border border-border rounded-lg transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Yenile
            </button>
          </div>
        </div>
      </div>

      <div className="page-content space-y-4">

        {/* ── Tarih + Preset filtresi ── */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex gap-1">
              {PRESETS.map(p => (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                    dateFrom === p.from && dateTo === p.to
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary/30 border-border text-muted-foreground hover:text-foreground'
                  }`}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Başlangıç</div>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="bg-secondary/30 border border-border rounded px-2 py-1.5 text-sm h-8" />
              </div>
              <div>
                <div className="text-[10px] text-muted-foreground mb-1">Bitiş</div>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="bg-secondary/30 border border-border rounded px-2 py-1.5 text-sm h-8" />
              </div>
            </div>
          </div>
        </div>

        {/* ── KPI ── */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <KPICard label="Toplam Uyarı" value={stats.total_alerts} icon={Bell}         color="text-primary" />
            <KPICard label="Kritik"        value={stats.critical}     icon={AlertTriangle} color="text-red-400"    sub="seviye" />
            <KPICard label="Uyarı"         value={stats.warning}      icon={AlertTriangle} color="text-amber-400"  sub="seviye" />
            <KPICard label="Aktif"         value={stats.active}       icon={Clock}         color="text-orange-400" sub="hâlâ açık" />
            <KPICard label="Ort. Süre"
              value={stats.avg_duration_minutes ? `${stats.avg_duration_minutes} dk` : '—'}
              icon={TrendingUp} color="text-blue-400" sub="kapanan uyarılar" />
          </div>
        )}

        {/* ── Tab ── */}
        <div className="flex gap-1 bg-secondary/30 border border-border rounded-lg p-1 w-fit">
          {[
            { id: 'list',   label: 'Uyarı Listesi' },
            { id: 'chart',  label: 'Grafikler' },
            { id: 'stores', label: 'Lokasyon Özeti' },
          ].map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === t.id ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* ── LİSTE ── */}
        {!loading && activeTab === 'list' && (
          <div className="space-y-3">

            {/* Pill filtreler */}
            <div className="flex flex-wrap items-center gap-4">
              {/* Tür filtresi */}
              <div className="flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Tür:</span>
                <Pill label="Tümü"       active={alertType === 'all'}     onClick={() => setAlertType('all')} />
                <Pill label="Kişi Sayma" active={alertType === 'counter'} onClick={() => setAlertType('counter')}
                  color="bg-blue-600 border-blue-500 text-white" />
                <Pill label="Kuyruk"     active={alertType === 'queue'}   onClick={() => setAlertType('queue')}
                  color="bg-violet-600 border-violet-500 text-white" />
              </div>

              {/* Seviye filtresi */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Seviye:</span>
                <Pill label="Tümü"   active={levelFilter === 'all'}      onClick={() => setLevel('all')} />
                <Pill label="Kritik" active={levelFilter === 'critical'} onClick={() => setLevel('critical')}
                  color="bg-red-600 border-red-500 text-white" />
                <Pill label="Uyarı"  active={levelFilter === 'warning'}  onClick={() => setLevel('warning')}
                  color="bg-amber-500 border-amber-400 text-white" />
              </div>

              {/* Lokasyon filtresi — dropdown */}
              {storeOptions.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <select
                    value={storeFilter}
                    onChange={e => setStore(e.target.value)}
                    className="bg-secondary/30 border border-border rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
                  >
                    <option value="all">Tüm Lokasyonlar</option>
                    {storeOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <span className="text-xs text-muted-foreground ml-auto">
                {filtered.length} kayıt · {storeGroups.length} lokasyon
              </span>
            </div>

            {/* Lokasyon akordiyon grupları */}
            {storeGroups.length > 0 ? (
              <div className="space-y-2">
                {storeGroups.map(g => (
                  <StoreAccordion key={g.name} storeName={g.name} alerts={g.alerts} />
                ))}
              </div>
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                <Bell className="w-12 h-12 mx-auto mb-4 opacity-30" />
                <p>Bu dönemde uyarı bulunamadı</p>
              </div>
            )}
          </div>
        )}

        {/* ── GRAFİKLER ── */}
        {!loading && activeTab === 'chart' && stats && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm font-medium mb-1">Saatlik Uyarı Dağılımı</div>
              <p className="text-xs text-muted-foreground mb-4">Hangi saatlerde daha fazla uyarı oluşuyor</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} margin={{ left: -10, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                    <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [v, n === 'critical' ? 'Kritik' : 'Uyarı']} />
                    <Legend formatter={v => v === 'critical' ? 'Kritik' : 'Uyarı'} />
                    <Bar dataKey="critical" stackId="a" fill="#EF4444" name="critical" />
                    <Bar dataKey="warning"  stackId="a" fill="#F59E0B" name="warning" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {dailyData.length > 1 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-sm font-medium mb-1">Günlük Trend</div>
                <p className="text-xs text-muted-foreground mb-4">Seçilen dönem boyunca uyarı sayısının değişimi</p>
                <div className="h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyData} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis allowDecimals={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend formatter={v => ({ critical: 'Kritik', warning: 'Uyarı', toplam: 'Toplam' })[v] || v} />
                      <Line type="monotone" dataKey="toplam"   stroke="#6366f1" strokeWidth={2}   dot={false} name="toplam" />
                      <Line type="monotone" dataKey="critical" stroke="#EF4444" strokeWidth={1.5} dot={false} name="critical" strokeDasharray="4 2" />
                      <Line type="monotone" dataKey="warning"  stroke="#F59E0B" strokeWidth={1.5} dot={false} name="warning"  strokeDasharray="4 2" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── MAĞAZA ÖZETİ ── */}
        {!loading && activeTab === 'stores' && stats && (
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/30 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Lokasyon</th>
                  <th className="text-center px-4 py-3 font-medium text-red-400">Kritik</th>
                  <th className="text-center px-4 py-3 font-medium text-amber-400">Uyarı</th>
                  <th className="text-center px-4 py-3 font-medium text-foreground">Toplam</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Dağılım</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {(stats.by_store || []).map((s, i) => {
                  const maxTotal = Math.max(...(stats.by_store || []).map(x => x.total), 1);
                  const critPct  = s.total > 0 ? (s.critical / s.total * 100) : 0;
                  const warnPct  = s.total > 0 ? (s.warning  / s.total * 100) : 0;
                  return (
                    <tr key={i} className="hover:bg-secondary/20 transition-colors">
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <Store className="w-4 h-4 text-muted-foreground shrink-0" />
                        {s.store_name}
                      </td>
                      <td className="text-center px-4 py-3 font-mono font-bold text-red-400">{s.critical || '—'}</td>
                      <td className="text-center px-4 py-3 font-mono font-bold text-amber-400">{s.warning || '—'}</td>
                      <td className="text-center px-4 py-3 font-mono font-bold">{s.total}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden" style={{ maxWidth: '120px' }}>
                            <div className="h-full flex">
                              <div className="bg-red-500 h-full" style={{ width: `${critPct}%` }} />
                              <div className="bg-amber-500 h-full" style={{ width: `${warnPct}%` }} />
                            </div>
                          </div>
                          <div className="w-16 h-1.5 bg-border rounded-full overflow-hidden">
                            <div className="h-full bg-primary/60 rounded-full" style={{ width: `${(s.total / maxTotal) * 100}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── E-posta ── */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Raporu E-posta ile Gönder</span>
          </div>
          <div className="flex gap-2">
            <input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="E-posta adresi (boş = SMTP varsayılanı)"
              className="flex-1 bg-secondary/30 border border-border rounded-lg px-3 py-2 text-sm"
            />
            <button onClick={sendReport} disabled={sending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:opacity-90 disabled:opacity-50 transition-opacity">
              <Mail className="w-4 h-4" />
              {sending ? 'Gönderiliyor...' : 'Gönder'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Aktif filtreler uygulanarak {dateFrom} – {dateTo} aralığının özeti gönderilir.
          </p>
        </div>

      </div>
    </Layout>
  );
};

export default AlertsReportPage;
