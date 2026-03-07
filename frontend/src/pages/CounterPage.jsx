import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { FilterBar } from '../components/FilterBar';
import { StoreCard } from '../components/StoreCard';
import { StatCard } from '../components/StatCard';
import { liveDataApi } from '../services/api';
import { Users, TrendingUp, TrendingDown, AlertTriangle, Activity } from 'lucide-react';

const CounterPage = () => {
  const [counterData, setCounterData] = useState([]);
  const [filters, setFilters] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('name');

  const loadData = useCallback(async () => {
    try {
      const res = await liveDataApi.getCounter();
      setCounterData(res.data);
    } catch (e) {
      console.error('Failed to load counter data', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (refreshInterval > 0) {
      const timer = setInterval(loadData, refreshInterval * 1000);
      return () => clearInterval(timer);
    }
  }, [refreshInterval, loadData]);

  const filteredData = counterData.filter(store => {
    if (filters.region_id && store.region_id !== filters.region_id) return false;
    if (filters.city_id && store.city_id !== filters.city_id) return false;
    if (filters.district_id && store.district_id !== filters.district_id) return false;
    if (filters.store_ids && store.store_id !== filters.store_ids) return false;
    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    switch (sortBy) {
      case 'visitors':
        return b.current_visitors - a.current_visitors;
      case 'occupancy':
        return b.occupancy_percent - a.occupancy_percent;
      case 'status':
        const statusOrder = { critical: 0, warning: 1, normal: 2 };
        return statusOrder[a.status] - statusOrder[b.status];
      default:
        return a.store_name.localeCompare(b.store_name);
    }
  });

  const totalVisitors = filteredData.reduce((sum, s) => sum + s.current_visitors, 0);
  const totalIn = filteredData.reduce((sum, s) => sum + s.total_in, 0);
  const totalOut = filteredData.reduce((sum, s) => sum + s.total_out, 0);
  const avgOccupancy = filteredData.length > 0 
    ? Math.round(filteredData.reduce((sum, s) => sum + s.occupancy_percent, 0) / filteredData.length)
    : 0;

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Kisi Sayma</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Magaza giris-cikis ve doluluk takibi
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-mono">{filteredData.length} aktif magaza</span>
            </div>
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

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard 
            label="Anlik Ziyaretci" 
            value={totalVisitors} 
            icon={Users}
            variant="primary"
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
            label="Ort. Doluluk" 
            value={avgOccupancy} 
            suffix="%"
            icon={AlertTriangle}
            variant={avgOccupancy >= 95 ? 'danger' : avgOccupancy >= 80 ? 'warning' : 'default'}
          />
        </div>

        {/* Sort Options */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Magaza Listesi</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sirala:</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-secondary/50 border border-white/10 text-sm px-3 py-1.5 focus:outline-none focus:border-primary"
              data-testid="sort-select"
            >
              <option value="name">Ada Gore</option>
              <option value="visitors">Ziyaretciye Gore</option>
              <option value="occupancy">Doluluga Gore</option>
              <option value="status">Duruma Gore</option>
            </select>
          </div>
        </div>

        {/* Store Grid */}
        {loading ? (
          <div className="bento-grid">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="store-card loading-skeleton h-48" />
            ))}
          </div>
        ) : sortedData.length > 0 ? (
          <div className="bento-grid">
            {sortedData.map((store) => (
              <StoreCard key={store.store_id} store={store} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Veri bulunamadi.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CounterPage;
