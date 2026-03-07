import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { FilterBar } from '../components/FilterBar';
import { StoreCard } from '../components/StoreCard';
import { StatCard } from '../components/StatCard';
import { liveDataApi, reportApi, healthApi } from '../services/api';
import { Users, TrendingUp, TrendingDown, AlertTriangle, Store, ListOrdered, WifiOff } from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid 
} from 'recharts';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

const Dashboard = () => {
  const [counterData, setCounterData] = useState([]);
  const [queueData, setQueueData] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filters, setFilters] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState(null);

  const loadData = useCallback(async () => {
    try {
      const [counterRes, queueRes, summaryRes, healthRes] = await Promise.all([
        liveDataApi.getCounter(),
        liveDataApi.getQueue(),
        reportApi.getSummary(filters),
        healthApi.getStatus().catch(() => ({ data: null })),
      ]);
      setCounterData(counterRes.data);
      setQueueData(queueRes.data);
      setSummary(summaryRes.data);
      setHealthStatus(healthRes.data);
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
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Son guncelleme</div>
            <div className="font-mono text-sm">{new Date().toLocaleTimeString('tr-TR')}</div>
          </div>
        </div>
      </div>

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
