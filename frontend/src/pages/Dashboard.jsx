import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { vmsEventsApi } from '../services/api';
import { Car, Bell, AlertTriangle, Info, Server, RefreshCw, ShieldAlert } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

const LEVEL_COLORS = { Bildirim: '#3B82F6', Alarm: '#F59E0B', Hata: '#EF4444' };
const BAR_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

const StatCard = ({ label, value, icon: Icon, color = 'text-foreground', bg = 'bg-secondary/30' }) => (
  <div className={`${bg} border border-border rounded-lg p-4 flex items-center gap-4`}>
    <Icon className={`w-8 h-8 ${color} opacity-80 shrink-0`} />
    <div>
      <div className={`text-2xl font-mono font-bold ${color}`}>{value ?? '—'}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  </div>
);

const Dashboard = () => {
  const [alarmData,     setAlarmData]     = useState(null);
  const [lprData,       setLprData]       = useState(null);
  const [lprByCamera,   setLprByCamera]   = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [lastUpdated,   setLastUpdated]   = useState(null);

  const loadData = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const timeFrom = today.toISOString();
      const timeTo = new Date().toISOString();

      const [alarmRes, lprRes, lprCamRes] = await Promise.allSettled([
        vmsEventsApi.getAlarms({ time_from: timeFrom, time_to: timeTo, levels: '0,1,2' }),
        vmsEventsApi.getLPR({ time_from: timeFrom, time_to: timeTo }),
        vmsEventsApi.getLPRByCamera({ time_from: timeFrom, time_to: timeTo }),
      ]);

      if (alarmRes.status === 'fulfilled') setAlarmData(alarmRes.value.data);
      if (lprRes.status === 'fulfilled') setLprData(lprRes.value.data);
      if (lprCamRes.status === 'fulfilled') setLprByCamera(lprCamRes.value.data.cameras || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Dashboard load error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const timer = setInterval(loadData, 60000);
    return () => clearInterval(timer);
  }, [loadData]);

  // Alarm level pie data
  const levelPieData = alarmData?.counts
    ? Object.entries(alarmData.counts)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => ({ name: k, value: v, color: LEVEL_COLORS[k] || '#6B7280' }))
    : [];

  // Top cameras bar data (top 8)
  const topCameras = alarmData?.stats?.by_camera
    ? Object.entries(alarmData.stats.by_camera)
        .slice(0, 8)
        .map(([name, count], i) => ({ name: name.length > 18 ? name.slice(0, 16) + '…' : name, count, fill: BAR_COLORS[i % BAR_COLORS.length] }))
    : [];

  // Hourly alarm data
  const hourlyData = alarmData?.stats?.by_hour
    ? Array.from({ length: 24 }, (_, h) => ({
        hour: `${String(h).padStart(2, '0')}:00`,
        alarm: alarmData.stats.by_hour[String(h)] || 0,
      }))
    : [];

  // Event type cards (from by_type stats)
  const typeColors = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#EC4899','#14B8A6','#F97316'];
  const TYPE_LABELS = {
    LPR:             'Plaka Tanıma (LPR)',
    NNEvent:         'Neural Network',
    Motion:          'Hareket Algılama',
    FaceRecognition: 'Yüz Tanıma',
    FR:              'Yüz Tanıma',
    Queue:           'Kuyruk Algılama',
    VideoLoss:       'Video Kaybı',
    Connection:      'Bağlantı',
    DiskFull:        'Disk Dolu',
    Analytics:       'Analitik',
  };
  const typeCards = alarmData?.stats?.by_type
    ? Object.entries(alarmData.stats.by_type)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count], i) => ({ type, label: TYPE_LABELS[type] || type, count, color: typeColors[i % typeColors.length] }))
    : [];

  // Top plates
  const topPlates = lprData?.stats?.top_plates?.slice(0, 10) || [];

  const levelMap = { '0': 'Bildirim', '1': 'Alarm', '2': 'Hata' };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Bugünkü alarm ve LPR istatistikleri</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              className="flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary rounded-lg border border-border transition-colors text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Yenile
            </button>
            <div className="text-right text-xs text-muted-foreground">
              <div>Son güncelleme</div>
              <div className="font-mono">{lastUpdated ? lastUpdated.toLocaleTimeString('tr-TR') : '—'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
          <StatCard
            label="Toplam Alarm (Bugün)"
            value={loading ? '…' : (alarmData?.total ?? 0)}
            icon={ShieldAlert}
            color="text-foreground"
            bg="bg-secondary/30"
          />
          <StatCard
            label="Bildirim"
            value={loading ? '…' : (alarmData?.counts?.Bildirim ?? 0)}
            icon={Info}
            color="text-blue-600 dark:text-blue-400"
            bg="bg-blue-500/5"
          />
          <StatCard
            label="Alarm"
            value={loading ? '…' : (alarmData?.counts?.Alarm ?? 0)}
            icon={Bell}
            color="text-amber-600 dark:text-amber-400"
            bg="bg-amber-500/5"
          />
          <StatCard
            label="Hata"
            value={loading ? '…' : (alarmData?.counts?.Hata ?? 0)}
            icon={AlertTriangle}
            color="text-red-600 dark:text-red-400"
            bg="bg-red-500/5"
          />
          <StatCard
            label="LPR Geçiş (Bugün)"
            value={loading ? '…' : (lprData?.total ?? 0)}
            icon={Car}
            color="text-emerald-600 dark:text-emerald-400"
            bg="bg-emerald-500/5"
          />
          <StatCard
            label="Benzersiz Plaka"
            value={loading ? '…' : (lprData?.unique_plates ?? 0)}
            icon={Server}
            color="text-purple-600 dark:text-purple-400"
            bg="bg-purple-500/5"
          />
        </div>

        {/* Event Type Cards */}
        {(loading || typeCards.length > 0) && (
          <div className="mb-6">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Olay Tipi Dağılımı (Bugün)</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {loading
                ? [...Array(4)].map((_, i) => (
                    <div key={i} className="bg-secondary/20 border border-border rounded-lg p-3 animate-pulse h-16" />
                  ))
                : typeCards.map(({ type, label, count, color }) => (
                    <div key={type} className="bg-card border border-border rounded-lg p-3 flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                        <span className="text-xs text-muted-foreground truncate">{label}</span>
                      </div>
                      <div className="text-xl font-mono font-bold" style={{ color }}>{count.toLocaleString()}</div>
                      <div className="text-xs text-muted-foreground font-mono">{type}</div>
                    </div>
                  ))
              }
            </div>
          </div>
        )}

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Alarm Level Pie */}
          <div className="chart-container">
            <div className="chart-title">Alarm Seviye Dağılımı</div>
            <div className="h-48">
              {levelPieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={levelPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={72} paddingAngle={2} dataKey="value">
                      {levelPieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px', color: 'hsl(var(--foreground))' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {loading ? 'Yükleniyor…' : 'Bugün alarm yok'}
                </div>
              )}
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {levelPieData.map((item, i) => (
                <div key={i} className="flex items-center gap-1.5 text-xs">
                  <div className="w-3 h-3 rounded-sm" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Cameras */}
          <div className="chart-container col-span-2">
            <div className="chart-title">En Çok Alarm Gelen Kameralar</div>
            <div className="h-52">
              {topCameras.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topCameras} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" width={110} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }}
                      formatter={(v) => [v, 'Alarm']}
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {topCameras.map((entry, i) => (
                        <Cell key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {loading ? 'Yükleniyor…' : 'Kamera verisi yok'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* LPR Kamera Özeti — kompakt kartlar */}
        {lprByCamera.length > 0 && (
          <div className="mb-6">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
              <Car className="w-3.5 h-3.5" />
              Kapı / Kamera Bazlı Geçişler (Bugün)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {lprByCamera.map((cam, i) => (
                <div key={i} className="bg-card border border-border rounded-lg p-3 space-y-2">
                  <div className="text-sm font-medium truncate">{cam.camera_name || cam.camera_id || '—'}</div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Toplam</span>
                    <span className="font-mono font-bold text-foreground">{cam.total}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <div className="flex-1 bg-emerald-500/10 rounded px-2 py-1 text-center">
                      <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{cam.entry}</div>
                      <div className="text-muted-foreground">Giriş</div>
                    </div>
                    <div className="flex-1 bg-red-500/10 rounded px-2 py-1 text-center">
                      <div className="font-mono font-bold text-red-600 dark:text-red-400">{cam.exit}</div>
                      <div className="text-muted-foreground">Çıkış</div>
                    </div>
                    {cam.unknown > 0 && (
                      <div className="flex-1 bg-secondary/50 rounded px-2 py-1 text-center">
                        <div className="font-mono font-bold text-muted-foreground">{cam.unknown}</div>
                        <div className="text-muted-foreground">?</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Saatlik Alarm Dağılımı */}
          <div className="chart-container">
            <div className="chart-title">Saatlik Alarm Dağılımı (Bugün)</div>
            <div className="h-48">
              {hourlyData.some(d => d.alarm > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={hourlyData} margin={{ left: 0, right: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 9 }} interval={3} />
                    <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }}
                      formatter={(v) => [v, 'Alarm']}
                    />
                    <Bar dataKey="alarm" fill="#F59E0B" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {loading ? 'Yükleniyor…' : 'Bugün alarm yok'}
                </div>
              )}
            </div>
          </div>

          {/* En Çok Geçiş Yapan Plakalar */}
          <div className="chart-container">
            <div className="chart-title flex items-center gap-2">
              <Car className="w-4 h-4 text-emerald-400" />
              En Çok Geçiş Yapan Plakalar (Bugün)
            </div>
            {topPlates.length > 0 ? (
              <div className="space-y-2 mt-2">
                {topPlates.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}</span>
                    <span className="font-mono text-sm font-semibold bg-secondary/50 px-2 py-0.5 rounded tracking-wider">{item.plate}</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.round((item.count / topPlates[0].count) * 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-mono font-bold text-emerald-400 w-8 text-right">{item.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                {loading ? 'Yükleniyor…' : 'Bugün LPR verisi yok'}
              </div>
            )}
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default Dashboard;
