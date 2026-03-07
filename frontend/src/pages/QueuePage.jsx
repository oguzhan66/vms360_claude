import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { FilterBar } from '../components/FilterBar';
import { QueueCard } from '../components/QueueCard';
import { StatCard } from '../components/StatCard';
import { liveDataApi } from '../services/api';
import { ListOrdered, AlertTriangle, Users, Activity } from 'lucide-react';

const QueuePage = () => {
  const [queueData, setQueueData] = useState([]);
  const [filters, setFilters] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const res = await liveDataApi.getQueue();
      setQueueData(res.data);
    } catch (e) {
      console.error('Failed to load queue data', e);
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

  const filteredData = queueData.filter(store => {
    if (filters.region_id && store.region_id !== filters.region_id) return false;
    if (filters.city_id && store.city_id !== filters.city_id) return false;
    if (filters.district_id && store.district_id !== filters.district_id) return false;
    if (filters.store_ids && store.store_id !== filters.store_ids) return false;
    return true;
  });

  const totalQueue = filteredData.reduce((sum, s) => sum + s.total_queue_length, 0);
  const criticalStores = filteredData.filter(s => s.status === 'critical').length;
  const warningStores = filteredData.filter(s => s.status === 'warning').length;
  const normalStores = filteredData.filter(s => s.status === 'normal').length;

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Kuyruk Analizi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Magaza kuyruk uzunluklari ve yogunluk takibi
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-mono">{filteredData.length} magaza</span>
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
            label="Toplam Kuyruk" 
            value={totalQueue} 
            icon={ListOrdered}
            variant="primary"
          />
          <StatCard 
            label="Kritik Magaza" 
            value={criticalStores} 
            icon={AlertTriangle}
            variant="danger"
          />
          <StatCard 
            label="Uyari" 
            value={warningStores} 
            icon={AlertTriangle}
            variant="warning"
          />
          <StatCard 
            label="Normal" 
            value={normalStores} 
            icon={Users}
            variant="success"
          />
        </div>

        {/* Queue Cards */}
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Kuyruk Durumu</h2>
        </div>

        {loading ? (
          <div className="bento-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="store-card loading-skeleton h-56" />
            ))}
          </div>
        ) : filteredData.length > 0 ? (
          <div className="bento-grid">
            {filteredData
              .sort((a, b) => {
                const statusOrder = { critical: 0, warning: 1, normal: 2 };
                return statusOrder[a.status] - statusOrder[b.status];
              })
              .map((data) => (
                <QueueCard key={data.store_id} data={data} />
              ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <ListOrdered className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Kuyruk verisi bulunamadi.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default QueuePage;
