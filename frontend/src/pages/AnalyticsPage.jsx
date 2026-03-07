import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { FilterBar } from '../components/FilterBar';
import { StatCard } from '../components/StatCard';
import { liveDataApi } from '../services/api';
import { Users, UserCircle, Activity, TrendingUp, Store } from 'lucide-react';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';

const COLORS = {
  Male: '#3B82F6',
  Female: '#EC4899'
};

const AGE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const AnalyticsStoreCard = ({ store }) => {
  const genderData = [
    { name: 'Erkek', value: store.male_count, color: COLORS.Male },
    { name: 'Kadın', value: store.female_count, color: COLORS.Female },
  ].filter(d => d.value > 0);

  const ageData = Object.entries(store.age_distribution || {}).map(([key, value], idx) => ({
    name: key,
    value,
    fill: AGE_COLORS[idx % AGE_COLORS.length]
  }));

  return (
    <div className="store-card p-4" data-testid={`analytics-store-card-${store.store_id}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-500/10 flex items-center justify-center rounded">
            <Store className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">{store.store_name}</h3>
            <p className="text-xs text-muted-foreground">
              {store.district_name}, {store.city_name}
            </p>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold font-mono">{store.total_detections}</div>
          <div className="text-xs text-muted-foreground">Tespit</div>
        </div>
      </div>

      {/* Gender Stats */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-blue-500/10 p-2 rounded text-center">
          <div className="text-lg font-bold font-mono text-blue-400">{store.male_count}</div>
          <div className="text-xs text-muted-foreground">Erkek</div>
          <div className="text-xs text-blue-400">{store.male_percent}%</div>
        </div>
        <div className="bg-pink-500/10 p-2 rounded text-center">
          <div className="text-lg font-bold font-mono text-pink-400">{store.female_count}</div>
          <div className="text-xs text-muted-foreground">Kadın</div>
          <div className="text-xs text-pink-400">{store.female_percent}%</div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Gender Pie */}
        <div className="h-32">
          {genderData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={genderData}
                  cx="50%"
                  cy="50%"
                  innerRadius={25}
                  outerRadius={45}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {genderData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    background: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Veri yok
            </div>
          )}
        </div>

        {/* Age Bar */}
        <div className="h-32">
          {ageData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ageData} layout="vertical" margin={{ left: -20, right: 5 }}>
                <XAxis type="number" hide />
                <YAxis 
                  dataKey="name" 
                  type="category" 
                  tick={{ fill: 'hsl(var(--foreground))', fontSize: 9 }}
                  width={35}
                />
                <Tooltip 
                  contentStyle={{ 
                    background: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '4px',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px'
                  }}
                  formatter={(value) => [value, 'Kişi']}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {ageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
              Veri yok
            </div>
          )}
        </div>
      </div>

      {/* Camera Info */}
      {store.analytics_camera_id && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <span className="text-xs text-muted-foreground">
            Kamera: {store.analytics_camera_id.slice(0, 8)}...
          </span>
        </div>
      )}
    </div>
  );
};

const AnalyticsPage = () => {
  const [storeData, setStoreData] = useState([]);
  const [summaryData, setSummaryData] = useState(null);
  const [filters, setFilters] = useState({});
  const [refreshInterval, setRefreshInterval] = useState(30);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState('detections');

  const loadData = useCallback(async () => {
    try {
      const [storesRes, summaryRes] = await Promise.all([
        liveDataApi.getAnalyticsByStore(),
        liveDataApi.getAnalytics({ lastMinutes: 60 })
      ]);
      setStoreData(storesRes.data);
      setSummaryData(summaryRes.data);
    } catch (e) {
      console.error('Failed to load analytics data', e);
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

  const filteredData = storeData.filter(store => {
    if (filters.region_id && store.region_id !== filters.region_id) return false;
    if (filters.city_id && store.city_id !== filters.city_id) return false;
    if (filters.district_id && store.district_id !== filters.district_id) return false;
    if (filters.store_ids && store.store_id !== filters.store_ids) return false;
    return true;
  });

  const sortedData = [...filteredData].sort((a, b) => {
    switch (sortBy) {
      case 'detections':
        return b.total_detections - a.total_detections;
      case 'male':
        return b.male_percent - a.male_percent;
      case 'female':
        return b.female_percent - a.female_percent;
      default:
        return a.store_name.localeCompare(b.store_name);
    }
  });

  // Calculate totals from filtered data
  const totalDetections = filteredData.reduce((sum, s) => sum + s.total_detections, 0);
  const totalMale = filteredData.reduce((sum, s) => sum + s.male_count, 0);
  const totalFemale = filteredData.reduce((sum, s) => sum + s.female_count, 0);
  const malePercent = totalDetections > 0 ? Math.round((totalMale / totalDetections) * 100) : 0;
  const femalePercent = totalDetections > 0 ? Math.round((totalFemale / totalDetections) * 100) : 0;

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Yaş / Cinsiyet Analizi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mağaza bazlı demografik veriler
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-mono">{filteredData.length} mağaza</span>
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
            label="Toplam Tespit" 
            value={totalDetections} 
            icon={Users}
            variant="primary"
          />
          <StatCard 
            label="Erkek" 
            value={totalMale} 
            suffix={`(${malePercent}%)`}
            icon={UserCircle}
            variant="default"
          />
          <StatCard 
            label="Kadın" 
            value={totalFemale}
            suffix={`(${femalePercent}%)`}
            icon={UserCircle}
            variant="default"
          />
        </div>

        {/* Overall Charts */}
        {summaryData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Gender Distribution */}
            <div className="chart-container">
              <div className="chart-title">Genel Cinsiyet Dağılımı</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Erkek', value: summaryData.gender_distribution.Male, color: COLORS.Male },
                        { name: 'Kadın', value: summaryData.gender_distribution.Female, color: COLORS.Female },
                      ].filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {[COLORS.Male, COLORS.Female].map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
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
              </div>
            </div>

            {/* Age Distribution */}
            <div className="chart-container">
              <div className="chart-title">Genel Yaş Dağılımı</div>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart 
                    data={Object.entries(summaryData.age_distribution).map(([key, value], idx) => ({
                      name: key, value, fill: AGE_COLORS[idx]
                    }))} 
                    layout="vertical"
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" tick={{ fill: 'hsl(var(--foreground))' }} />
                    <YAxis 
                      dataKey="name" 
                      type="category" 
                      stroke="hsl(var(--muted-foreground))"
                      width={50}
                      tick={{ fill: 'hsl(var(--foreground))', fontSize: 11 }}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        background: 'hsl(var(--card))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '4px',
                        color: 'hsl(var(--foreground))'
                      }}
                      formatter={(value) => [value, 'Kişi']}
                    />
                    <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                      {AGE_COLORS.map((color, index) => (
                        <Cell key={`cell-${index}`} fill={color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}

        {/* Sort Options */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Mağaza Listesi</h2>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sırala:</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="bg-secondary/50 border border-white/10 text-sm px-3 py-1.5 focus:outline-none focus:border-primary"
              data-testid="sort-select"
            >
              <option value="name">Ada Göre</option>
              <option value="detections">Tespit Sayısına Göre</option>
              <option value="male">Erkek Oranına Göre</option>
              <option value="female">Kadın Oranına Göre</option>
            </select>
          </div>
        </div>

        {/* Store Grid */}
        {loading ? (
          <div className="bento-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="store-card loading-skeleton h-72" />
            ))}
          </div>
        ) : sortedData.length > 0 ? (
          <div className="bento-grid">
            {sortedData.map((store) => (
              <AnalyticsStoreCard key={store.store_id} store={store} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Veri bulunamadı.</p>
            <p className="text-sm mt-2">Mağazalara analitik kamera atandığından emin olun.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AnalyticsPage;
