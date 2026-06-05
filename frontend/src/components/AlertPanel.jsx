import { useState, useEffect } from 'react';
import { AlertTriangle, X, Clock, TrendingUp, ListOrdered, Mail, Download, ChevronDown, ChevronUp } from 'lucide-react';
import api from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

const LEVEL_COLOR = { critical: '#EF4444', warning: '#F59E0B' };
const TYPE_LABEL = { counter: 'Kişi Sayma', queue: 'Kuyruk' };
const LEVEL_LABEL = { critical: 'Kritik', warning: 'Uyarı' };

export const AlertPanel = ({ onClose }) => {
  const [alerts, setAlerts] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('today');
  const [filterType, setFilterType] = useState('all');
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [recipient, setRecipient] = useState('');
  const [expanded, setExpanded] = useState(null);

  const dateRange = {
    today: { date_from: new Date().toISOString().split('T')[0], date_to: new Date().toISOString().split('T')[0] },
    week: { date_from: new Date(Date.now() - 7*86400000).toISOString().split('T')[0], date_to: new Date().toISOString().split('T')[0] },
    month: { date_from: new Date(Date.now() - 30*86400000).toISOString().split('T')[0], date_to: new Date().toISOString().split('T')[0] },
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const { date_from, date_to } = dateRange[tab];
      const params = new URLSearchParams({ date_from, date_to, limit: '200' });
      if (filterType !== 'all') params.append('alert_type', filterType);
      const [alertsRes, statsRes] = await Promise.all([
        api.get(`/alerts?${params}`),
        api.get(`/alerts/stats?date_from=${date_from}&date_to=${date_to}${filterType !== 'all' ? `&alert_type=${filterType}` : ''}`)
      ]);
      setAlerts(alertsRes.data.alerts || []);
      setStats(statsRes.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [tab, filterType]);

  const sendReport = async () => {
    setSending(true);
    setSendMsg('');
    try {
      const { date_from, date_to } = dateRange[tab];
      const res = await api.post('/alerts/send-report', {
        date_from, date_to,
        alert_type: filterType !== 'all' ? filterType : undefined,
        recipient: recipient || undefined
      });
      setSendMsg(res.data.success ? `✅ ${res.data.message}` : `❌ ${res.data.message}`);
    } catch (e) {
      setSendMsg('❌ Gönderilemedi');
    } finally {
      setSending(false);
    }
  };

  // Saatlik grafik verisi (her saat için warning+critical topla)
  const hourlyData = Array.from({ length: 24 }, (_, h) => {
    const items = (stats?.hourly_distribution || []).filter(x => x.hour === h);
    return {
      hour: `${String(h).padStart(2,'0')}:00`,
      critical: items.find(x => x.level === 'critical')?.count || 0,
      warning: items.find(x => x.level === 'warning')?.count || 0,
    };
  });

  const activeAlerts = alerts.filter(a => !a.cleared_at);
  const clearedAlerts = alerts.filter(a => a.cleared_at);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl h-full bg-card border-l border-border overflow-y-auto flex flex-col shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border p-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-lg">Uyarı Merkezi</h2>
            {activeAlerts.length > 0 && (
              <span className="px-2 py-0.5 bg-red-500 text-white text-xs rounded-full font-bold">
                {activeAlerts.length} aktif
              </span>
            )}
          </div>
          <button onClick={onClose} className="p-1 hover:bg-secondary rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4 flex-1">
          {/* Filtreler */}
          <div className="flex gap-2 flex-wrap">
            {['today','week','month'].map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 text-sm rounded ${tab === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
                {t === 'today' ? 'Bugün' : t === 'week' ? '7 Gün' : '30 Gün'}
              </button>
            ))}
            <div className="ml-auto flex gap-2">
              {['all','counter','queue'].map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className={`px-3 py-1 text-sm rounded ${filterType === t ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                  {t === 'all' ? 'Tümü' : t === 'counter' ? 'Kişi Sayma' : 'Kuyruk'}
                </button>
              ))}
            </div>
          </div>

          {/* Özet kartlar */}
          {stats && (
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-secondary/30 rounded text-center">
                <div className="text-2xl font-mono font-bold">{stats.total_alerts}</div>
                <div className="text-xs text-muted-foreground">Toplam Uyarı</div>
              </div>
              <div className="p-3 bg-red-500/10 rounded text-center">
                <div className="text-2xl font-mono font-bold text-red-400">
                  {stats.daily_summary?.reduce((s, d) => s + d.critical, 0) || 0}
                </div>
                <div className="text-xs text-muted-foreground">Kritik</div>
              </div>
              <div className="p-3 bg-amber-500/10 rounded text-center">
                <div className="text-2xl font-mono font-bold text-amber-400">
                  {stats.daily_summary?.reduce((s, d) => s + d.warning, 0) || 0}
                </div>
                <div className="text-xs text-muted-foreground">Uyarı</div>
              </div>
            </div>
          )}

          {/* Saatlik dağılım grafiği */}
          {stats && stats.total_alerts > 0 && (
            <div className="bg-secondary/20 rounded p-3">
              <div className="text-sm font-medium mb-2">Saatlik Uyarı Dağılımı</div>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData}>
                    <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }}
                      interval={3} tickFormatter={v => v.slice(0,2)} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} />
                    <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px', fontSize: '12px' }} />
                    <Bar dataKey="critical" stackId="a" fill="#EF4444" name="Kritik" />
                    <Bar dataKey="warning" stackId="a" fill="#F59E0B" name="Uyarı" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Aktif uyarılar */}
          {activeAlerts.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse inline-block" />
                Aktif Uyarılar ({activeAlerts.length})
              </div>
              <div className="space-y-2">
                {activeAlerts.map((a, i) => (
                  <AlertItem key={i} alert={a} expanded={expanded === i} onToggle={() => setExpanded(expanded === i ? null : i)} />
                ))}
              </div>
            </div>
          )}

          {/* Geçmiş uyarılar */}
          {clearedAlerts.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-muted-foreground mb-2">
                Geçmiş Uyarılar ({clearedAlerts.length})
              </div>
              <div className="space-y-2">
                {clearedAlerts.slice(0, 20).map((a, i) => (
                  <AlertItem key={i} alert={a} expanded={expanded === `c${i}`} onToggle={() => setExpanded(expanded === `c${i}` ? null : `c${i}`)} />
                ))}
              </div>
            </div>
          )}

          {!loading && alerts.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>Bu dönemde uyarı yok</p>
            </div>
          )}
        </div>

        {/* E-posta gönder */}
        <div className="sticky bottom-0 bg-card border-t border-border p-4">
          <div className="flex gap-2">
            <input
              value={recipient}
              onChange={e => setRecipient(e.target.value)}
              placeholder="E-posta (boş = varsayılan)"
              className="flex-1 bg-secondary/30 border border-border rounded px-3 py-2 text-sm"
            />
            <button onClick={sendReport} disabled={sending}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded text-sm hover:opacity-90 disabled:opacity-50">
              <Mail className="w-4 h-4" />
              {sending ? 'Gönderiliyor...' : 'Rapor Gönder'}
            </button>
          </div>
          {sendMsg && <p className="text-xs mt-2">{sendMsg}</p>}
        </div>
      </div>
    </div>
  );
};

const AlertItem = ({ alert, expanded, onToggle }) => {
  const isActive = !alert.cleared_at;
  const TypeIcon = alert.alert_type === 'counter' ? TrendingUp : ListOrdered;
  const levelColor = alert.level === 'critical' ? 'text-red-400 bg-red-500/10' : 'text-amber-400 bg-amber-500/10';

  return (
    <div className={`rounded border ${isActive ? 'border-red-500/30' : 'border-border'} overflow-hidden`}>
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-secondary/20" onClick={onToggle}>
        <div className={`p-1.5 rounded ${levelColor}`}>
          <TypeIcon className="w-3.5 h-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{alert.store_name}</div>
          <div className="text-xs text-muted-foreground">
            {TYPE_LABEL[alert.alert_type]} · {LEVEL_LABEL[alert.level]} ·{' '}
            {alert.started_at?.slice(11, 16)}
            {isActive ? <span className="text-red-400 ml-1 font-semibold">● Aktif</span> : ` → ${alert.cleared_at?.slice(11, 16)}`}
          </div>
        </div>
        {alert.duration_minutes && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="w-3 h-3" />{alert.duration_minutes} dk
          </div>
        )}
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>
      {expanded && (
        <div className="px-3 pb-3 border-t border-border/50 pt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
          <div>Maks. Değer: <span className="text-foreground font-mono">
            {alert.alert_type === 'counter' ? `%${alert.peak_value}` : `${alert.peak_value} kişi`}
          </span></div>
          <div>Eşik: <span className="text-foreground font-mono">
            {alert.threshold_percent ? `%${alert.threshold_percent}` : alert.threshold}
          </span></div>
          <div>Başlangıç: <span className="text-foreground">{alert.started_at?.slice(0,19).replace('T',' ')}</span></div>
          <div>Bitiş: <span className="text-foreground">{alert.cleared_at?.slice(0,19).replace('T',' ') || '—'}</span></div>
        </div>
      )}
    </div>
  );
};

export default AlertPanel;
