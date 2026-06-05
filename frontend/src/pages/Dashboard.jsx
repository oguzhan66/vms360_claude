import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { FilterBar } from '../components/FilterBar';
import { StoreCard } from '../components/StoreCard';
import { StatCard } from '../components/StatCard';
import { AlertPanel } from '../components/AlertPanel';
import { liveDataApi, reportApi, healthApi } from '../services/api';
import api from '../services/api';
import { Users, TrendingUp, TrendingDown, AlertTriangle, Store, ListOrdered, WifiOff, UserCheck, Bell } from 'lucide-react';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const Dashboard = () => {
  const [showAlertPanel, setShowAlertPanel] = useState(false);
  const [activeAlertCount, setActiveAlertCount] = useState(0);
  const [counterData, setCounterData] = useState([]);
  const [queueData, setQueueData] = useState([]);
  const [analyticsData, setAnalyticsData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [counterRes, queueRes, summaryRes, healthRes, analyticsRes] = await Promise.all([
        liveDataApi.getCounter(),
        liveDataApi.getQueue(),
        reportApi.getSummary(filters),
        healthApi.getStatus().catch(() => ({ data: null })),
        reportApi.getAnalytics({ date_range: '1d' }).catch(() => ({ data: null })),
      ]);
      setCounterData(counterRes.data);
      setQueueData(queueRes.data);
      setSummary(summaryRes.data);
      setHealthStatus(healthRes.data);
      setAnalyticsData(analyticsRes.data);
      setLastUpdated(new Date());
      // Aktif uyarı sayısını çek
      try {
        const alertRes = await api.get('/alerts?status=active&limit=50');
        setActiveAlertCount((alertRes.data.alerts || []).length);
      } catch {}
    } catch (e) {
      console.error('Failed to load data', e);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (refreshInterval > 0) {
      const timer = setInterval(loadData, refreshInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [refreshInterval, loadData]);

  const filteredCounterData = counterData.filter(store => {
    if (filters.region_id && store.region_id !== filters.region_id) return false;
    if (filters.city_id && store.city_id !== filters.city_id) return false;
    if (filters.district_id && store.district_id !== filters.district_id) return false;
    if (filters.store_ids && store.store_id !== filters.store_ids) return false;
    return true;
  });

  const statusCounts = {
    normal: filteredCounterData.filter(s => s.status === 'normal').length,
    warning: filteredCounterData.filter(s => s.status === 'warning').length,
    critical: filteredCounterData.filter(s => s.status === 'critical').length,
  };

  const pieData = [
    { name: 'Normal', value: statusCounts.normal, color: '#10B981' },
    { name: 'Uyari', value: statusCounts.warning, color: '#F59E0B' },
    { name: 'Kritik', value: statusCounts.critical, color: '#EF4444' },
  ].filter(d => d.value > 0);

  const totalVisitors = filteredCounterData.reduce((sum, s) => sum + s.current_visitors, 0);
  const totalIn = filteredCounterData.reduce((sum, s) => sum + s.total_in, 0);
  const totalOut = filteredCounterData.reduce((sum, s) => sum + s.total_out, 0);
  const totalQueue = queueData.reduce((sum, s) => sum + s.total_queue_length, 0);

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Tum magazalarin canli izleme paneli
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Uyarı Merkezi butonu */}
            <button
              onClick={() => setShowAlertPanel(true)}
              className="relative flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary rounded-lg border border-border transition-colors"
            >
              <Bell className={`w-4 h-4 ${activeAlertCount > 0 ? 'text-amber-400' : 'text-muted-foreground'}`} />
              <span className="text-sm">Uyarılar</span>
              {activeAlertCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {activeAlertCount}
                </span>
              )}
            </button>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Son guncelleme</div>
              <div className="font-mono text-sm">
                {lastUpdated ? lastUpdated.toLocaleTimeString('tr-TR') : '—'}
              </div>
            </div>
          </div>

        </div>
      </div>

      {showAlertPanel && <AlertPanel onClose={() => setShowAlertPanel(false)} />}

      <div className="page-content">
        <FilterBar 
          onFilterChange={setFilters}
          onRefresh={loadData}
          refreshInterval={refreshInterval}
          onIntervalChange={setRefreshInterval}
          showStoreFilter={true}
        />

        {/* Offline Store Alert - P0: Veri gelmeme alarmı */}
        {healthStatus && healthStatus.summary?.offline > 0 && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6" data-testid="offline-alert">
            <div className="flex items-center gap-3">
              <WifiOff className="w-5 h-5 text-red-500" />
              <div>
                <div className="font-semibold text-red-500">
                  {healthStatus.summary.offline} magaza cevrimdisi
                </div>
                <div className="text-sm text-muted-foreground">
                  {healthStatus.stores
                    ?.filter(s => s.status === 'offline')
                    .map(s => s.store_name)
                    .join(', ')} - Son 30 dakikadir veri alinamiyor
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
          <StatCard 
            label="Toplam Magaza" 
            value={filteredCounterData.length} 
            icon={Store}
            variant="primary"
          />
          <StatCard 
            label="Anlik Ziyaretci" 
            value={totalVisitors} 
            icon={Users}
            variant="success"
          />
          <StatCard 
            label="Toplam Giris" 
            value={totalIn} 
            icon={TrendingUp}
            variant="success"
          />
          <StatCard 
            label="Toplam Cikis" 
            value={totalOut} 
            icon={TrendingDown}
            variant="warning"
          />
          <StatCard 
            label="Toplam Kuyruk" 
            value={totalQueue} 
            icon={ListOrdered}
            variant={totalQueue > 20 ? 'danger' : 'default'}
          />
          <StatCard 
            label="Kritik Magaza" 
            value={statusCounts.critical} 
            icon={AlertTriangle}
            variant="danger"
          />
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          {/* Status Distribution */}
          <div className="chart-container">
            <div className="chart-title">Magaza Durum Dagilimi</div>
            <div className="h-48">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ 
                        background: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '4px',
                        color: 'hsl(var(--foreground))'
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  Veri yok
                </div>
              )}
            </div>
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <div className="w-3 h-3" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{item.name}: {item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Stores by Visitors */}
          <div className="chart-container col-span-2">
            <div className="chart-title">En Yogun Magazalar</div>
            <div className="space-y-3">
              {filteredCounterData
                .filter(s => s.current_visitors > 0)
                .sort((a, b) => b.current_visitors - a.current_visitors)
                .slice(0, 5)
                .map((store, idx) => (
                  <div key={store.store_id} className="flex items-center gap-3">
                    <div className="w-6 h-6 bg-white/5 flex items-center justify-center text-xs font-mono">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{store.store_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {store.district_name}, {store.city_name}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono text-lg font-bold ${store.status === 'critical' ? 'text-red-400' : store.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {store.current_visitors}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        %{store.occupancy_percent}
                      </div>
                    </div>
                    <div className={`w-2 h-8 ${store.status === 'critical' ? 'bg-red-500' : store.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  </div>
                ))}
              {filteredCounterData.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  Henuz magaza eklenmedi
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Kuyruk + Demografik Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">

          {/* Kuyruk Durumu */}
          <div className="chart-container">
            <div className="chart-title flex items-center gap-2">
              <ListOrdered className="w-4 h-4 text-amber-400" />
              Kuyruk Durumu
            </div>
            {queueData.length > 0 ? (
              <div className="space-y-3 mt-2">
                {queueData.map(store => (
                  <div key={store.store_id} className="flex items-center gap-3">
                    <div className="flex-1">
                      <div className="text-sm font-medium">{store.store_name}</div>
                      <div className="text-xs text-muted-foreground">{store.city_name}</div>
                    </div>
                    <div className="text-right">
                      <div className={`font-mono font-bold text-lg ${store.status === 'critical' ? 'text-red-400' : store.status === 'warning' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {store.total_queue_length}
                      </div>
                      <div className="text-xs text-muted-foreground">kişi</div>
                    </div>
                    <div className="w-24">
                      <div className="text-xs text-muted-foreground mb-1">Eşik: {store.queue_threshold}</div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${store.status === 'critical' ? 'bg-red-500' : store.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, (store.total_queue_length / (store.queue_threshold * 2)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    <div className={`w-2 h-8 rounded-full ${store.status === 'critical' ? 'bg-red-500' : store.status === 'warning' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">Kuyruk verisi yok</div>
            )}
          </div>

          {/* Demografik Özet */}
          <div className="chart-container">
            <div className="chart-title flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-purple-400" />
              Yaş/Cinsiyet Özeti (Bugün)
            </div>
            {(() => {
              const total = analyticsData?.summary?.total_detections || 0;
              const male = analyticsData?.gender_distribution?.Male || 0;
              const female = analyticsData?.gender_distribution?.Female || 0;
              const ageDist = analyticsData?.age_distribution || {};
              const ageData = Object.entries(ageDist).map(([k, v]) => ({ age: k, sayi: v }));
              return total > 0 ? (
                <div className="mt-2">
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center p-2 bg-secondary/30 rounded">
                      <div className="text-xl font-mono font-bold">{total}</div>
                      <div className="text-xs text-muted-foreground">Toplam Tespit</div>
                    </div>
                    <div className="text-center p-2 bg-blue-500/10 rounded">
                      <div className="text-xl font-mono font-bold text-blue-400">{male}</div>
                      <div className="text-xs text-muted-foreground">Erkek</div>
                    </div>
                    <div className="text-center p-2 bg-pink-500/10 rounded">
                      <div className="text-xl font-mono font-bold text-pink-400">{female}</div>
                      <div className="text-xs text-muted-foreground">Kadın</div>
                    </div>
                  </div>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={ageData} layout="vertical">
                        <XAxis type="number" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <YAxis dataKey="age" type="category" width={40} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '4px' }} />
                        <Bar dataKey="sayi" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <div className="h-24 flex items-center justify-center text-sm text-muted-foreground">
                  {analyticsData ? 'Bugün analitik verisi yok' : 'Yükleniyor...'}
                </div>
              );
            })()}
          </div>
        </div>

        {/* Store Grid */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tum Magazalar</h2>
          <span className="text-sm text-muted-foreground font-mono">
            {filteredCounterData.length} magaza
          </span>
        </div>

        {loading ? (
          <div className="bento-grid">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="store-card loading-skeleton h-48" />
            ))}
          </div>
        ) : filteredCounterData.length > 0 ? (
          <div className="bento-grid">
            {filteredCounterData.map((store) => (
              <StoreCard key={store.store_id} store={store} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Store className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Henuz magaza eklenmedi.</p>
            <p className="text-sm mt-1">VMS ve magaza tanimlamalarini yaparak baslayabilirsiniz.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Dashboard;
