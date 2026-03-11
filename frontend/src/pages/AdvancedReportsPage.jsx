import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { reportApi, storeApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Clock, Calendar, TrendingUp, Users, BarChart3, 
  PieChart as PieChartIcon, LineChart as LineChartIcon,
  Store, AlertTriangle, RefreshCw, Download, FileType
} from 'lucide-react';
import { toast } from 'sonner';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, Area, AreaChart
} from 'recharts';

const CHART_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

const DATE_RANGES = [
  { id: '1d', label: '1 Gün' },
  { id: '1w', label: '1 Hafta' },
  { id: '1m', label: '1 Ay' },
  { id: '1y', label: '1 Yıl' },
];

const REPORT_SECTIONS = [
  { id: 'traffic', label: 'Trafik Analizi', icon: TrendingUp, description: 'Saatlik ve günlük ziyaretçi trendi' },
  { id: 'comparison', label: 'Mağaza Karşılaştırma', icon: Store, description: 'Mağazalar arası performans analizi' },
  { id: 'queue', label: 'Kuyruk Analizi', icon: Clock, description: 'Bekleme süreleri ve yoğunluk' },
  { id: 'demographics', label: 'Demografik Analiz', icon: Users, description: 'Yaş ve cinsiyet dağılımı' },
];

const AdvancedReportsPage = () => {
  const [activeSection, setActiveSection] = useState('traffic');
  const [dateRange, setDateRange] = useState('1d');
  const [chartType, setChartType] = useState('bar'); // 'bar', 'pie', 'line'
  const [loading, setLoading] = useState(false);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('all');
  
  // Report data states
  const [hourlyData, setHourlyData] = useState(null);
  const [weekdayData, setWeekdayData] = useState(null);
  const [storeComparison, setStoreComparison] = useState(null);
  const [queueAnalysis, setQueueAnalysis] = useState(null);
  const [demographics, setDemographics] = useState(null);

  useEffect(() => {
    loadStores();
  }, []);

  const loadStores = async () => {
    try {
      const res = await storeApi.getAll();
      setStores(res.data);
    } catch (e) {
      console.error('Failed to load stores', e);
    }
  };

  const loadReportData = async () => {
    setLoading(true);
    try {
      const params = { 
        date_range: dateRange,
        ...(selectedStore !== 'all' && { store_ids: selectedStore })
      };
      
      const [hourlyRes, weekdayRes, storeRes, queueRes, demoRes] = await Promise.all([
        reportApi.getHourlyTraffic(params),
        reportApi.getWeekdayComparison(params),
        reportApi.getStoreComparison(params),
        reportApi.getQueueAnalysis(params),
        reportApi.getDemographics(params),
      ]);
      
      setHourlyData(hourlyRes.data);
      setWeekdayData(weekdayRes.data);
      setStoreComparison(storeRes.data);
      setQueueAnalysis(queueRes.data);
      setDemographics(demoRes.data);
    } catch (e) {
      console.error('Failed to load reports', e);
      toast.error('Raporlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [dateRange, selectedStore]);

  const handleExportPdf = async (reportType) => {
    try {
      const res = await reportApi.exportPdf(reportType);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `rapor_${reportType}_${new Date().toISOString().slice(0,10)}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('PDF raporu indirildi');
    } catch (e) {
      console.error('PDF export failed', e);
      toast.error('PDF dışa aktarma başarısız');
    }
  };

  // Chart Type Selector Component
  const ChartTypeSelector = () => (
    <div className="flex items-center gap-2 bg-secondary/30 p-1 rounded">
      <Button
        variant={chartType === 'bar' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setChartType('bar')}
        className="h-8"
        data-testid="chart-type-bar"
      >
        <BarChart3 className="w-4 h-4" />
      </Button>
      <Button
        variant={chartType === 'pie' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setChartType('pie')}
        className="h-8"
        data-testid="chart-type-pie"
      >
        <PieChartIcon className="w-4 h-4" />
      </Button>
      <Button
        variant={chartType === 'line' ? 'default' : 'ghost'}
        size="sm"
        onClick={() => setChartType('line')}
        className="h-8"
        data-testid="chart-type-line"
      >
        <LineChartIcon className="w-4 h-4" />
      </Button>
    </div>
  );

  // Render chart based on type
  const renderChart = (data, dataKey, nameKey, title) => {
    if (!data || data.length === 0) {
      return <div className="h-64 flex items-center justify-center text-muted-foreground">Veri yok</div>;
    }

    const chartData = data.map((item, idx) => ({
      ...item,
      fill: CHART_COLORS[idx % CHART_COLORS.length]
    }));

    if (chartType === 'pie') {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              paddingAngle={2}
              dataKey={dataKey}
              nameKey={nameKey}
              label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              contentStyle={{ 
                background: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === 'line') {
      return (
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey={nameKey} stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
            <Tooltip 
              contentStyle={{ 
                background: 'hsl(var(--card))', 
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))'
              }}
            />
            <Area type="monotone" dataKey={dataKey} stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.3} />
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    // Default: Bar chart
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis dataKey={nameKey} stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
          <Tooltip 
            contentStyle={{ 
              background: 'hsl(var(--card))', 
              border: '1px solid hsl(var(--border))',
              color: 'hsl(var(--foreground))'
            }}
          />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.is_peak ? '#10B981' : '#3B82F6'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Gelişmiş Raporlar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detaylı analiz ve karşılaştırma raporları
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ChartTypeSelector />
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger className="w-44 bg-secondary/50 border-border" data-testid="store-select">
                <Store className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Mağaza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Mağazalar</SelectItem>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="w-32 bg-secondary/50 border-border" data-testid="date-range-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_RANGES.map((range) => (
                  <SelectItem key={range.id} value={range.id}>{range.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadReportData}
              disabled={loading}
              className="border-border text-foreground"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleExportPdf(activeSection === 'traffic' ? 'counter' : activeSection === 'comparison' ? 'store_comparison' : activeSection === 'queue' ? 'queue' : 'demographics')}
              className="border-border text-foreground"
              data-testid="export-pdf-btn"
            >
              <FileType className="w-4 h-4 mr-2 text-red-500" />
              PDF
            </Button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Section Tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {REPORT_SECTIONS.map((section) => (
            <button
              key={section.id}
              onClick={() => setActiveSection(section.id)}
              className={`p-4 text-left transition-all ${
                activeSection === section.id 
                  ? 'store-card border-primary border-2' 
                  : 'store-card hover:border-primary/50'
              }`}
              data-testid={`section-${section.id}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center ${
                  activeSection === section.id ? 'bg-primary/20' : 'bg-secondary'
                }`}>
                  <section.icon className={`w-5 h-5 ${activeSection === section.id ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className={`font-semibold text-sm ${activeSection === section.id ? 'text-primary' : ''}`}>
                    {section.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{section.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p>Raporlar yükleniyor...</p>
          </div>
        ) : (
          <>
            {/* Traffic Analysis Section */}
            {activeSection === 'traffic' && (
              <div className="space-y-6">
                {/* Summary Cards */}
                {hourlyData && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="stat-card">
                      <div className="stat-label">Toplam Ziyaretçi</div>
                      <div className="stat-value">{hourlyData.total_visitors?.toLocaleString()}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Yoğun Saat Trafiği</div>
                      <div className="stat-value text-emerald-500">{hourlyData.peak_hour_traffic?.toLocaleString()}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Normal Saat Trafiği</div>
                      <div className="stat-value text-blue-500">{hourlyData.off_peak_traffic?.toLocaleString()}</div>
                    </div>
                    <div className="stat-card">
                      <div className="stat-label">Yoğun Saatler</div>
                      <div className="stat-value text-sm">{hourlyData.peak_hours?.join(', ')}</div>
                    </div>
                  </div>
                )}

                {/* Hourly Traffic Chart */}
                <div className="chart-container">
                  <div className="chart-title flex items-center justify-between">
                    <span>Saatlik Trafik Dağılımı</span>
                    <span className="text-xs text-muted-foreground">Yeşil: Yoğun saatler</span>
                  </div>
                  {renderChart(hourlyData?.hourly_data, 'visitors', 'hour', 'Saatlik Trafik')}
                </div>

                {/* Weekday Comparison */}
                {weekdayData && (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="stat-card">
                        <div className="stat-label">Hafta İçi Toplam</div>
                        <div className="stat-value">{weekdayData.weekday_total?.toLocaleString()}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Hafta Sonu Toplam</div>
                        <div className="stat-value text-emerald-500">{weekdayData.weekend_total?.toLocaleString()}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Hafta İçi Ortalama</div>
                        <div className="stat-value">{weekdayData.weekday_avg?.toLocaleString()}</div>
                      </div>
                      <div className="stat-card">
                        <div className="stat-label">Hafta Sonu Artış</div>
                        <div className="stat-value text-emerald-500">+%{weekdayData.weekend_increase_percent}</div>
                      </div>
                    </div>

                    <div className="chart-container">
                      <div className="chart-title">Haftalık Trafik Dağılımı</div>
                      {renderChart(weekdayData.daily_data, 'visitors', 'day', 'Günlük Trafik')}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Store Comparison Section */}
            {activeSection === 'comparison' && storeComparison && (
              <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="stat-card">
                    <div className="stat-label">Toplam Mağaza</div>
                    <div className="stat-value">{storeComparison.total_stores}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Ort. Giriş</div>
                    <div className="stat-value">{storeComparison.average_entries?.toLocaleString()}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Ortalama Doluluk</div>
                    <div className="stat-value">%{storeComparison.average_occupancy ?? 0}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Analiz Süresi</div>
                    <div className="stat-value text-sm">{storeComparison.date_from} → {storeComparison.date_to}</div>
                  </div>
                </div>

                {/* Top & Bottom Performers */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {storeComparison.top_performer && (
                    <div className="chart-container border-emerald-500/30">
                      <div className="chart-title text-emerald-500">En İyi Performans</div>
                      <div className="p-4">
                        <h3 className="text-lg font-bold">{storeComparison.top_performer.store_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {[storeComparison.top_performer.city, storeComparison.top_performer.district].filter(Boolean).join(', ') || '—'}
                        </p>
                        <div className="grid grid-cols-4 gap-3 mt-4">
                          <div>
                            <div className="text-xs text-muted-foreground">Toplam Giriş</div>
                            <div className="text-xl font-mono font-bold text-emerald-500">{storeComparison.top_performer.total_in?.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Doluluk</div>
                            <div className="text-xl font-mono font-bold">%{storeComparison.top_performer.occupancy_percent}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Ort. Kuyruk</div>
                            <div className="text-xl font-mono font-bold">{storeComparison.top_performer.avg_queue_length}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Ort. Fark</div>
                            <div className="text-xl font-mono font-bold text-emerald-500">
                              {storeComparison.top_performer.deviation_percent >= 0 ? '+' : ''}{storeComparison.top_performer.deviation_percent}%
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  {storeComparison.bottom_performer && storeComparison.stores?.length > 1 && (
                    <div className="chart-container border-amber-500/30">
                      <div className="chart-title text-amber-500">Geliştirilmeli</div>
                      <div className="p-4">
                        <h3 className="text-lg font-bold">{storeComparison.bottom_performer.store_name}</h3>
                        <p className="text-sm text-muted-foreground">
                          {[storeComparison.bottom_performer.city, storeComparison.bottom_performer.district].filter(Boolean).join(', ') || '—'}
                        </p>
                        <div className="grid grid-cols-4 gap-3 mt-4">
                          <div>
                            <div className="text-xs text-muted-foreground">Toplam Giriş</div>
                            <div className="text-xl font-mono font-bold text-amber-500">{storeComparison.bottom_performer.total_in?.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Doluluk</div>
                            <div className="text-xl font-mono font-bold">%{storeComparison.bottom_performer.occupancy_percent}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Ort. Kuyruk</div>
                            <div className="text-xl font-mono font-bold">{storeComparison.bottom_performer.avg_queue_length}</div>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground">Ort. Fark</div>
                            <div className="text-xl font-mono font-bold text-amber-500">{storeComparison.bottom_performer.deviation_percent}%</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Charts Row: Giriş + Doluluk */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="chart-container">
                    <div className="chart-title">Toplam Giriş Karşılaştırması</div>
                    {renderChart(
                      storeComparison.stores?.map(s => ({ name: s.store_name?.substring(0, 14), value: s.total_in })),
                      'value', 'name', 'Toplam Giriş'
                    )}
                  </div>
                  <div className="chart-container">
                    <div className="chart-title">Doluluk Oranı Karşılaştırması (%)</div>
                    {renderChart(
                      storeComparison.stores?.map(s => ({ name: s.store_name?.substring(0, 14), value: s.occupancy_percent })),
                      'value', 'name', 'Doluluk %'
                    )}
                  </div>
                </div>

                {/* Charts Row: Kuyruk + Demografik */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="chart-container">
                    <div className="chart-title">Ortalama Kuyruk Uzunluğu</div>
                    {renderChart(
                      storeComparison.stores?.map(s => ({ name: s.store_name?.substring(0, 14), value: s.avg_queue_length })),
                      'value', 'name', 'Ort. Kuyruk'
                    )}
                  </div>
                  <div className="chart-container">
                    <div className="chart-title">Cinsiyet Dağılımı (Toplam)</div>
                    {renderChart(
                      storeComparison.stores?.map(s => ({
                        name: s.store_name?.substring(0, 14),
                        Erkek: s.male_count,
                        Kadın: s.female_count,
                      })),
                      'Erkek', 'name', 'Cinsiyet'
                    )}
                  </div>
                </div>

                {/* Detailed Table */}
                <div className="chart-container">
                  <div className="chart-title">Detaylı Mağaza Listesi</div>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mağaza</th>
                          <th>Konum</th>
                          <th>Toplam Giriş</th>
                          <th>Toplam Çıkış</th>
                          <th>Doluluk</th>
                          <th>Ort. Kuyruk</th>
                          <th>Erkek</th>
                          <th>Kadın</th>
                          <th>Performans</th>
                        </tr>
                      </thead>
                      <tbody>
                        {storeComparison.stores?.map((store) => (
                          <tr key={store.store_id}>
                            <td className="font-medium">{store.store_name}</td>
                            <td className="text-muted-foreground">
                              {[store.city, store.district].filter(Boolean).join(', ') || '—'}
                            </td>
                            <td className="font-mono text-emerald-500">{store.total_in?.toLocaleString()}</td>
                            <td className="font-mono text-amber-500">{store.total_out?.toLocaleString()}</td>
                            <td className="font-mono">%{store.occupancy_percent}</td>
                            <td className="font-mono">{store.avg_queue_length}</td>
                            <td className="font-mono text-blue-400">
                              {store.male_count} <span className="text-xs text-muted-foreground">(%{store.male_percent})</span>
                            </td>
                            <td className="font-mono text-pink-400">
                              {store.female_count} <span className="text-xs text-muted-foreground">(%{store.female_percent})</span>
                            </td>
                            <td>
                              <span className={`inline-flex px-2 py-0.5 text-xs rounded ${
                                store.performance === 'above' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-amber-500/20 text-amber-500'
                              }`}>
                                {store.deviation_percent >= 0 ? '+' : ''}{store.deviation_percent}%
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Queue Analysis Section */}
            {activeSection === 'queue' && queueAnalysis && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="stat-card">
                    <div className="stat-label">Toplam Mağaza</div>
                    <div className="stat-value">{queueAnalysis.total_stores}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Toplam Kuyruk</div>
                    <div className="stat-value text-amber-500">{queueAnalysis.total_queue_length}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Ort. Kuyruk</div>
                    <div className="stat-value">{queueAnalysis.average_queue_length}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Ort. Bekleme</div>
                    <div className="stat-value">{queueAnalysis.average_wait_time_minutes} dk</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Eşik Aşan</div>
                    <div className="stat-value text-red-500">{queueAnalysis.stores_exceeding_threshold}</div>
                  </div>
                </div>

                {/* Critical Hours Alert */}
                <div className="p-4 bg-amber-500/10 border border-amber-500/30 flex items-center gap-4">
                  <AlertTriangle className="w-8 h-8 text-amber-500" />
                  <div>
                    <h3 className="font-semibold text-amber-500">Kritik Saat Dilimleri</h3>
                    <p className="text-sm text-muted-foreground">
                      En yoğun kuyruk zamanları: {queueAnalysis.critical_hours?.join(', ')}
                    </p>
                  </div>
                </div>

                {/* Queue Chart */}
                <div className="chart-container">
                  <div className="chart-title">Mağaza Kuyruk Durumu</div>
                  {renderChart(
                    queueAnalysis.stores?.map(s => ({ 
                      name: s.store_name?.substring(0, 12), 
                      visitors: s.queue_length,
                      threshold: s.threshold
                    })),
                    'visitors', 
                    'name', 
                    'Kuyruk Uzunluğu'
                  )}
                </div>

                {/* Queue Details Table */}
                <div className="chart-container">
                  <div className="chart-title">Kuyruk Detayları</div>
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Mağaza</th>
                          <th>Kuyruk</th>
                          <th>Eşik</th>
                          <th>Tahmini Bekleme</th>
                          <th>Durum</th>
                        </tr>
                      </thead>
                      <tbody>
                        {queueAnalysis.stores?.map((store) => (
                          <tr key={store.store_id}>
                            <td className="font-medium">{store.store_name}</td>
                            <td className="font-mono font-bold">{store.queue_length}</td>
                            <td className="font-mono text-muted-foreground">{store.threshold}</td>
                            <td className="font-mono">{store.estimated_wait_minutes} dk</td>
                            <td>
                              <span className={`inline-flex px-2 py-0.5 text-xs ${
                                store.status === 'critical' ? 'bg-red-500/20 text-red-500' :
                                store.status === 'warning' ? 'bg-amber-500/20 text-amber-500' :
                                'bg-emerald-500/20 text-emerald-500'
                              }`}>
                                {store.status === 'critical' ? 'Kritik' : store.status === 'warning' ? 'Uyarı' : 'Normal'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Demographics Section */}
            {activeSection === 'demographics' && demographics && (
              <div className="space-y-6">
                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="stat-card">
                    <div className="stat-label">Toplam Tespit</div>
                    <div className="stat-value">{demographics.total_detections}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Baskın Cinsiyet</div>
                    <div className="stat-value text-blue-500">
                      {demographics.primary_gender === 'Male' ? 'Erkek' : demographics.primary_gender === 'Female' ? 'Kadın' : 'Bilinmiyor'}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Baskın Yaş Grubu</div>
                    <div className="stat-value">{demographics.primary_age_group}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">Hedef Kitle</div>
                    <div className="stat-value text-sm">{demographics.insights?.dominant_demographic}</div>
                  </div>
                </div>

                {/* Age Category Summary */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="chart-container">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Genç (18-24)</span>
                      <span className="font-mono font-bold text-emerald-500">%{demographics.insights?.young_ratio}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${demographics.insights?.young_ratio || 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {demographics.age_categories?.young_18_24} kişi
                    </div>
                  </div>
                  <div className="chart-container">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Yetişkin (25-44)</span>
                      <span className="font-mono font-bold text-blue-500">%{demographics.insights?.adult_ratio}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${demographics.insights?.adult_ratio || 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {demographics.age_categories?.adult_25_44} kişi
                    </div>
                  </div>
                  <div className="chart-container">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Olgun (45+)</span>
                      <span className="font-mono font-bold text-purple-500">%{demographics.insights?.mature_ratio}</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-purple-500 transition-all"
                        style={{ width: `${demographics.insights?.mature_ratio || 0}%` }}
                      />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {demographics.age_categories?.mature_45_plus} kişi
                    </div>
                  </div>
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Gender Chart */}
                  <div className="chart-container">
                    <div className="chart-title">Cinsiyet Dağılımı</div>
                    {renderChart(
                      Object.entries(demographics.gender_distribution || {}).map(([key, value]) => ({
                        name: key === 'Male' ? 'Erkek' : key === 'Female' ? 'Kadın' : 'Bilinmiyor',
                        visitors: value
                      })),
                      'visitors',
                      'name',
                      'Cinsiyet'
                    )}
                    <div className="flex justify-center gap-4 mt-4">
                      {Object.entries(demographics.gender_percent || {}).map(([key, value], idx) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <div className="w-3 h-3" style={{ background: CHART_COLORS[idx] }} />
                          <span>{key === 'Male' ? 'Erkek' : key === 'Female' ? 'Kadın' : 'Bilinmiyor'}: %{value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Age Chart */}
                  <div className="chart-container">
                    <div className="chart-title">Yaş Dağılımı</div>
                    {renderChart(
                      Object.entries(demographics.age_distribution || {}).map(([key, value]) => ({
                        name: key,
                        visitors: value
                      })),
                      'visitors',
                      'name',
                      'Yaş Grubu'
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
};

export default AdvancedReportsPage;
