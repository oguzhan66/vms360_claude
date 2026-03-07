import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { 
  TrendingUp, TrendingDown, Users, Clock, BarChart3, 
  Calendar, Target, MapPin, AlertTriangle, Zap,
  ArrowUpRight, ArrowDownRight, RefreshCw, Download, FileSpreadsheet, FileText, Filter
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell, CartesianGrid, Legend,
  AreaChart, Area, ComposedChart
} from 'recharts';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../components/ui/dropdown-menu';
import api, { locationApi, storeApi } from '../services/api';
import { toast } from 'sonner';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

// Stat Card Component
const StatCard = ({ title, value, change, icon: Icon, trend }) => (
  <Card className="bg-card/50 border-white/10">
    <CardContent className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold font-mono mt-1">{value}</p>
          {change !== undefined && (
            <div className={`flex items-center gap-1 text-xs mt-1 ${trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-muted-foreground'}`}>
              {trend === 'up' ? <ArrowUpRight className="w-3 h-3" /> : trend === 'down' ? <ArrowDownRight className="w-3 h-3" /> : null}
              <span>{change > 0 ? '+' : ''}{change}%</span>
            </div>
          )}
        </div>
        <div className="w-10 h-10 bg-primary/10 flex items-center justify-center rounded-lg">
          <Icon className="w-5 h-5 text-primary" />
        </div>
      </div>
    </CardContent>
  </Card>
);

// Alert Card Component
const AlertCard = ({ level, title, description, time }) => (
  <div className={`p-3 rounded-lg border ${level === 'high' ? 'bg-red-500/10 border-red-500/30' : level === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-blue-500/10 border-blue-500/30'}`}>
    <div className="flex items-start gap-3">
      <AlertTriangle className={`w-4 h-4 mt-0.5 ${level === 'high' ? 'text-red-400' : level === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`} />
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
        {time && <p className="text-xs text-muted-foreground mt-1">{time}</p>}
      </div>
    </div>
  </div>
);

const AdvancedAnalyticsPage = () => {
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [period, setPeriod] = useState('week');
  const [exporting, setExporting] = useState(false);
  
  // Filter states
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [stores, setStores] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedCity, setSelectedCity] = useState('all');
  const [selectedStore, setSelectedStore] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  
  // Data states
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [hourlyTraffic, setHourlyTraffic] = useState(null);
  const [trends, setTrends] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [demographics, setDemographics] = useState(null);
  const [storeComparison, setStoreComparison] = useState(null);
  const [regionAnalysis, setRegionAnalysis] = useState(null);
  const [capacityUtil, setCapacityUtil] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [peakAlerts, setPeakAlerts] = useState(null);
  const [queueAnalytics, setQueueAnalytics] = useState(null);

  // Load filter data
  useEffect(() => {
    const loadFilters = async () => {
      try {
        const [regionsRes, citiesRes, storesRes] = await Promise.all([
          locationApi.getRegions(),
          locationApi.getCities(),
          storeApi.getAll()
        ]);
        setRegions(regionsRes.data || []);
        setCities(citiesRes.data || []);
        setStores(storesRes.data || []);
      } catch (e) {
        console.error('Failed to load filter data', e);
      }
    };
    loadFilters();
    
    // Set default date range (last 7 days)
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    setDateTo(today.toISOString().split('T')[0]);
    setDateFrom(lastWeek.toISOString().split('T')[0]);
  }, []);

  // Filter cities based on selected region
  const filteredCities = selectedRegion === 'all' 
    ? cities 
    : cities.filter(c => c.region_id === selectedRegion);

  // Filter stores based on selected city/region
  const filteredStores = stores.filter(s => {
    if (selectedStore !== 'all') return true;
    if (selectedCity !== 'all') {
      const city = cities.find(c => c.id === selectedCity);
      // Need to check store's district -> city relationship
      return true; // Simplified - all stores shown
    }
    return true;
  });

  // Build query params for API calls
  const buildQueryParams = () => {
    const params = new URLSearchParams();
    if (selectedStore !== 'all') {
      params.append('store_id', selectedStore);
    }
    if (selectedRegion !== 'all') {
      params.append('region_id', selectedRegion);
    }
    if (selectedCity !== 'all') {
      params.append('city_id', selectedCity);
    }
    if (dateFrom) {
      params.append('date_from', dateFrom);
    }
    if (dateTo) {
      params.append('date_to', dateTo);
    }
    return params.toString();
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Build query string with all filters including date range
      const buildFullQuery = (baseParams = {}) => {
        const params = new URLSearchParams();
        if (selectedStore !== 'all') params.append('store_id', selectedStore);
        if (selectedRegion !== 'all') params.append('region_id', selectedRegion);
        if (selectedCity !== 'all') params.append('city_id', selectedCity);
        if (dateFrom) params.append('date_from', dateFrom);
        if (dateTo) params.append('date_to', dateTo);
        Object.entries(baseParams).forEach(([k, v]) => params.append(k, v));
        return params.toString() ? `?${params.toString()}` : '';
      };
      
      const [
        summaryRes,
        hourlyRes,
        trendsRes,
        comparisonRes,
        demographicsRes,
        storeCompRes,
        regionRes,
        capacityRes,
        forecastRes,
        peakRes,
        queueRes
      ] = await Promise.all([
        api.get(`/analytics/dashboard-summary${buildFullQuery()}`),
        api.get(`/analytics/hourly-traffic${buildFullQuery()}`),
        api.get(`/analytics/trends${buildFullQuery({ period })}`),
        api.get(`/analytics/comparison${buildFullQuery({ compare_type: 'week' })}`),
        api.get(`/analytics/demographics${buildFullQuery()}`),
        api.get(`/analytics/store-comparison${buildFullQuery()}`),
        api.get(`/analytics/region-analysis${buildFullQuery()}`),
        api.get(`/analytics/capacity-utilization${buildFullQuery()}`),
        api.get(`/analytics/forecast${buildFullQuery()}`),
        api.get(`/analytics/peak-alerts${buildFullQuery()}`),
        api.get(`/analytics/queue-analytics${buildFullQuery()}`)
      ]);
      
      setDashboardSummary(summaryRes.data);
      setHourlyTraffic(hourlyRes.data);
      setTrends(trendsRes.data);
      setComparison(comparisonRes.data);
      setDemographics(demographicsRes.data);
      setStoreComparison(storeCompRes.data);
      setRegionAnalysis(regionRes.data);
      setCapacityUtil(capacityRes.data);
      setForecast(forecastRes.data);
      setPeakAlerts(peakRes.data);
      setQueueAnalytics(queueRes.data);
    } catch (e) {
      console.error('Failed to load analytics', e);
    } finally {
      setLoading(false);
    }
  }, [period, selectedStore, selectedRegion, selectedCity, dateFrom, dateTo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Export functions
  const handleExport = async (format) => {
    setExporting(true);
    try {
      const queryParams = buildQueryParams();
      
      // Prepare export data
      const exportData = {
        report_type: 'advanced_analytics',
        tab: activeTab,
        period: period,
        filters: {
          region: selectedRegion !== 'all' ? regions.find(r => r.id === selectedRegion)?.name : 'Tümü',
          city: selectedCity !== 'all' ? cities.find(c => c.id === selectedCity)?.name : 'Tümü',
          store: selectedStore !== 'all' ? stores.find(s => s.id === selectedStore)?.name : 'Tümü',
          date_from: dateFrom,
          date_to: dateTo
        },
        data: {
          summary: dashboardSummary,
          hourly_traffic: hourlyTraffic,
          trends: trends,
          demographics: demographics,
          store_comparison: storeComparison,
          queue_analytics: queueAnalytics
        }
      };

      if (format === 'excel') {
        const response = await api.post('/reports/export/excel', exportData, {
          responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `gelismis_analitik_${new Date().toISOString().split('T')[0]}.xlsx`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('Excel raporu indirildi');
      } else if (format === 'pdf') {
        const response = await api.post('/reports/export/pdf', exportData, {
          responseType: 'blob'
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `gelismis_analitik_${new Date().toISOString().split('T')[0]}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('PDF raporu indirildi');
      } else if (format === 'json') {
        const dataStr = JSON.stringify(exportData, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const link = document.createElement('a');
        link.setAttribute('href', dataUri);
        link.setAttribute('download', `gelismis_analitik_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('JSON raporu indirildi');
      }
    } catch (e) {
      console.error('Export failed', e);
      toast.error('Export başarısız');
    } finally {
      setExporting(false);
    }
  };

  // Reset filters
  const handleResetFilters = () => {
    setSelectedRegion('all');
    setSelectedCity('all');
    setSelectedStore('all');
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    setDateTo(today.toISOString().split('T')[0]);
    setDateFrom(lastWeek.toISOString().split('T')[0]);
  };

  if (loading && !dashboardSummary) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-96">
          <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="page-header">
        <div className="flex flex-col gap-4">
          {/* Title Row */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">Gelişmiş Analitik</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Detaylı performans analizi ve tahminler
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Export Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" disabled={exporting} data-testid="export-btn">
                    {exporting ? (
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="w-4 h-4 mr-2" />
                    )}
                    Dışa Aktar
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleExport('excel')} data-testid="export-excel">
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    Excel (.xlsx)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('pdf')} data-testid="export-pdf">
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport('json')} data-testid="export-json">
                    <Download className="w-4 h-4 mr-2" />
                    JSON
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              
              <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Yenile
              </Button>
            </div>
          </div>

          {/* Filters Row */}
          <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-100 dark:bg-slate-800/80 rounded-lg border border-gray-200 dark:border-slate-600">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="text-gray-900 dark:text-white font-semibold">Filtreler:</span>
            </div>
            
            {/* Region Filter */}
            <Select value={selectedRegion} onValueChange={(v) => { setSelectedRegion(v); setSelectedCity('all'); }}>
              <SelectTrigger className="w-36 h-9 text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600" data-testid="filter-region">
                <SelectValue placeholder="Bölge" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Bölgeler</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* City Filter */}
            <Select value={selectedCity} onValueChange={setSelectedCity}>
              <SelectTrigger className="w-36 h-9 text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600" data-testid="filter-city">
                <SelectValue placeholder="Şehir" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Şehirler</SelectItem>
                {filteredCities.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Store Filter */}
            <Select value={selectedStore} onValueChange={setSelectedStore}>
              <SelectTrigger className="w-40 h-9 text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600" data-testid="filter-store">
                <SelectValue placeholder="Mağaza" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Mağazalar</SelectItem>
                {stores.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Date Range */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 px-3 text-sm bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-500 rounded-md text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="filter-date-from"
              />
              <span className="text-sm text-gray-900 dark:text-white font-medium">-</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 px-3 text-sm bg-white dark:bg-slate-700 border border-gray-300 dark:border-slate-500 rounded-md text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                data-testid="filter-date-to"
              />
            </div>

            {/* Period */}
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-28 h-9 text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600" data-testid="filter-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Haftalık</SelectItem>
                <SelectItem value="month">Aylık</SelectItem>
                <SelectItem value="quarter">Çeyreklik</SelectItem>
              </SelectContent>
            </Select>

            {/* Reset Filters */}
            <Button variant="outline" size="sm" onClick={handleResetFilters} className="h-9 text-sm border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600">
              Sıfırla
            </Button>
          </div>

          {/* Active Filters Display */}
          {(selectedRegion !== 'all' || selectedCity !== 'all' || selectedStore !== 'all') && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-muted-foreground">Aktif filtreler:</span>
              {selectedRegion !== 'all' && (
                <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded">
                  {regions.find(r => r.id === selectedRegion)?.name}
                </span>
              )}
              {selectedCity !== 'all' && (
                <span className="px-2 py-1 bg-green-500/20 text-green-400 rounded">
                  {cities.find(c => c.id === selectedCity)?.name}
                </span>
              )}
              {selectedStore !== 'all' && (
                <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded">
                  {stores.find(s => s.id === selectedStore)?.name}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="page-content">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-secondary/30 p-1">
            <TabsTrigger value="overview">Genel Bakış</TabsTrigger>
            <TabsTrigger value="traffic">Trafik Analizi</TabsTrigger>
            <TabsTrigger value="demographics">Demografi</TabsTrigger>
            <TabsTrigger value="stores">Mağaza Performansı</TabsTrigger>
            <TabsTrigger value="forecast">Tahmin & Uyarılar</TabsTrigger>
            <TabsTrigger value="queue">Kuyruk Analizi</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard 
                title="Bugünkü Ziyaretçi" 
                value={dashboardSummary?.quick_stats?.today_visitors?.toLocaleString() || 0}
                change={dashboardSummary?.quick_stats?.visitor_change_percent}
                trend={dashboardSummary?.quick_stats?.visitor_change_percent > 0 ? 'up' : 'down'}
                icon={Users}
              />
              <StatCard 
                title="Ortalama Doluluk" 
                value={`${dashboardSummary?.quick_stats?.avg_occupancy || 0}%`}
                icon={BarChart3}
              />
              <StatCard 
                title="Ort. Bekleme Süresi" 
                value={`${dashboardSummary?.quick_stats?.avg_wait_time_min || 0} dk`}
                icon={Clock}
              />
              <StatCard 
                title="Toplam Mağaza" 
                value={dashboardSummary?.quick_stats?.total_stores || 0}
                icon={MapPin}
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Hourly Traffic */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Saatlik Ziyaretçi Trafiği</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={hourlyTraffic?.hourly_data || []}>
                        <defs>
                          <linearGradient id="colorIn" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="hour_label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Area type="monotone" dataKey="in_count" stroke="#3B82F6" fill="url(#colorIn)" name="Giriş" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2">
                    <span>En Yoğun: {hourlyTraffic?.peak_hour}</span>
                    <span>Toplam: {hourlyTraffic?.total_in?.toLocaleString()} giriş</span>
                  </div>
                </CardContent>
              </Card>

              {/* Weekly Trend */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Haftalık Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={trends?.daily_data?.slice(-7) || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Bar dataKey="in_count" fill="#3B82F6" name="Ziyaretçi" radius={[4, 4, 0, 0]} />
                        <Line type="monotone" dataKey="in_count" stroke="#10B981" strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-between text-xs mt-2">
                    <span className={`${trends?.week_over_week_change > 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {trends?.week_over_week_change > 0 ? '↑' : '↓'} {Math.abs(trends?.week_over_week_change || 0)}% geçen haftaya göre
                    </span>
                    <span className="text-muted-foreground">Ort: {trends?.average_daily?.toLocaleString()}/gün</span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Alerts */}
            {peakAlerts?.peak_periods?.length > 0 && (
              <Card className="bg-card/50 border-white/10">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    Bugünkü Yoğunluk Uyarıları
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {peakAlerts.peak_periods.map((alert, idx) => (
                      <AlertCard 
                        key={idx}
                        level={alert.alert_level}
                        title={`${alert.period} Yoğunluğu`}
                        description={`${alert.start_time} - ${alert.end_time} arası %${alert.expected_capacity_percent} doluluk bekleniyor`}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* TRAFFIC TAB */}
          <TabsContent value="traffic" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Detailed Hourly */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm">Saatlik Detaylı Trafik</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={hourlyTraffic?.hourly_data || []}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="hour_label" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Legend />
                        <Bar dataKey="in_count" fill="#3B82F6" name="Giriş" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="out_count" fill="#10B981" name="Çıkış" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Period Comparison */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm">Dönem Karşılaştırması</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground">Bu Hafta</p>
                        <p className="text-2xl font-bold font-mono text-blue-400">
                          {comparison?.current_period?.total_visitors?.toLocaleString()}
                        </p>
                      </div>
                      <div className="p-4 bg-gray-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground">Geçen Hafta</p>
                        <p className="text-2xl font-bold font-mono text-gray-400">
                          {comparison?.previous_period?.total_visitors?.toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      {comparison?.changes?.trend === 'up' ? (
                        <TrendingUp className="w-6 h-6 text-green-400" />
                      ) : (
                        <TrendingDown className="w-6 h-6 text-red-400" />
                      )}
                      <span className={`text-xl font-bold ${comparison?.changes?.trend === 'up' ? 'text-green-400' : 'text-red-400'}`}>
                        {comparison?.changes?.visitor_change_percent > 0 ? '+' : ''}{comparison?.changes?.visitor_change_percent}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Daily Trend */}
            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-sm">Günlük Trend ({period === 'week' ? 'Son 7 Gün' : period === 'month' ? 'Son 30 Gün' : 'Son 90 Gün'})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends?.daily_data || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} tickFormatter={(v) => v.slice(5)} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="in_count" stroke="#3B82F6" strokeWidth={2} dot={{ r: 3 }} name="Ziyaretçi" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DEMOGRAPHICS TAB */}
          <TabsContent value="demographics" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Gender Distribution */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm">Cinsiyet Dağılımı</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={(demographics?.gender_data || []).filter(d => d.gender === 'Male' || d.gender === 'Female')}
                          dataKey="count"
                          nameKey="gender"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          label={({ gender, percent }) => `${gender === 'Male' ? 'Erkek' : 'Kadın'}: ${(percent * 100).toFixed(1)}%`}
                        >
                          {(demographics?.gender_data || []).filter(d => d.gender === 'Male' || d.gender === 'Female').map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.gender === 'Male' ? '#3B82F6' : '#EC4899'} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Target Audience */}
              <Card className="bg-card/50 border-white/10 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Hedef Kitle Analizi</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-purple-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground">Birincil Hedef Kitle</p>
                        <p className="text-xl font-bold text-purple-400">{demographics?.insights?.primary_target}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          En yoğun yaş grubu
                        </p>
                      </div>
                      <div className="p-4 bg-pink-500/10 rounded-lg">
                        <p className="text-xs text-muted-foreground">İkincil Hedef Kitle</p>
                        <p className="text-xl font-bold text-pink-400">{demographics?.insights?.secondary_target}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          İkinci en yoğun yaş grubu
                        </p>
                      </div>
                    </div>
                    <div className="p-4 bg-secondary/30 rounded-lg">
                      <p className="text-sm font-medium mb-2">Öneriler</p>
                      <ul className="text-xs text-muted-foreground space-y-1">
                        {demographics?.insights?.recommendations?.map((rec, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <Zap className="w-3 h-3 text-yellow-400 mt-0.5" />
                            {rec}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Age Distribution Trend */}
            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-sm">Saate Göre Demografik Değişim</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={demographics?.age_data || []}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="age_group" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                      <Bar dataKey="count" fill="#8B5CF6" name="Ziyaretçi Sayısı" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* STORES TAB */}
          <TabsContent value="stores" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Store Ranking */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm">Mağaza Performans Sıralaması</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {storeComparison?.stores?.map((store, idx) => (
                      <div key={store.store_id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${idx === 0 ? 'bg-yellow-500/20 text-yellow-400' : idx === 1 ? 'bg-gray-400/20 text-gray-300' : idx === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-secondary text-muted-foreground'}`}>
                            {idx + 1}
                          </span>
                          <div>
                            <p className="text-sm font-medium">{store.store_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {store.visitors_per_day?.toLocaleString()} ziyaretçi/gün
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-mono">{store.occupancy_percent?.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">Doluluk</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Capacity Utilization */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm">Kapasite Kullanım Oranları</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 bg-green-500/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-green-400">{capacityUtil?.distribution?.optimal || 0}</p>
                        <p className="text-xs text-muted-foreground">Optimal</p>
                      </div>
                      <div className="p-4 bg-yellow-500/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-yellow-400">{capacityUtil?.distribution?.under_utilized || 0}</p>
                        <p className="text-xs text-muted-foreground">Düşük Kullanım</p>
                      </div>
                      <div className="p-4 bg-red-500/10 rounded-lg text-center">
                        <p className="text-2xl font-bold text-red-400">{capacityUtil?.distribution?.over_capacity || 0}</p>
                        <p className="text-xs text-muted-foreground">Aşırı Kalabalık</p>
                      </div>
                    </div>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={capacityUtil?.stores || []} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                          <YAxis dataKey="store_name" type="category" width={100} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                          <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                          <Bar dataKey="utilization_percent" fill="#3B82F6" name="Kapasite %" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Region Analysis */}
            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-sm">Bölge Bazlı Analiz</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {regionAnalysis?.regions?.map((region, idx) => (
                    <div key={region.region_id} className="p-4 bg-secondary/30 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium">{region.region_name}</p>
                        <span className={`text-xs px-2 py-0.5 rounded ${region.trend === 'up' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {region.trend === 'up' ? '↑' : '↓'} {Math.abs(region.change_percent)}%
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-muted-foreground">Mağaza Sayısı</p>
                          <p className="font-mono">{region.store_count}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Toplam Ziyaretçi</p>
                          <p className="font-mono">{region.total_visitors?.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* FORECAST TAB */}
          <TabsContent value="forecast" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* 7-Day Forecast */}
              <Card className="bg-card/50 border-white/10 lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">7 Günlük Ziyaretçi Tahmini</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={forecast?.daily_forecast || []}>
                        <defs>
                          <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day_name" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                        <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                        <Area type="monotone" dataKey="predicted_visitors" stroke="#8B5CF6" fill="url(#colorForecast)" name="Tahmini Ziyaretçi" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Recommendations */}
              <Card className="bg-card/50 border-white/10">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="w-4 h-4 text-purple-400" />
                    Öneriler
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {forecast?.recommendations?.map((rec, idx) => (
                      <div key={idx} className="p-3 bg-secondary/30 rounded-lg">
                        <div className="flex items-start gap-2">
                          <Zap className={`w-4 h-4 mt-0.5 ${rec.priority === 'high' ? 'text-red-400' : rec.priority === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`} />
                          <div>
                            <p className="text-sm">{rec.message}</p>
                            <p className="text-xs text-muted-foreground mt-1">{rec.detail}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Peak Time Predictions */}
            <Card className="bg-card/50 border-white/10">
              <CardHeader>
                <CardTitle className="text-sm">Yoğunluk Tahminleri</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {forecast?.peak_predictions?.map((pred, idx) => (
                    <div key={idx} className={`p-4 rounded-lg ${pred.intensity === 'high' ? 'bg-red-500/10 border border-red-500/30' : pred.intensity === 'medium' ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-green-500/10 border border-green-500/30'}`}>
                      <p className="text-sm font-medium">{pred.day_name}</p>
                      <p className="text-xs text-muted-foreground">{pred.date}</p>
                      <div className="mt-2">
                        <p className={`text-lg font-bold font-mono ${pred.intensity === 'high' ? 'text-red-400' : pred.intensity === 'medium' ? 'text-yellow-400' : 'text-green-400'}`}>
                          {pred.predicted_visitors?.toLocaleString()}
                        </p>
                        <p className="text-xs text-muted-foreground">tahmini ziyaretçi</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* QUEUE TAB */}
          <TabsContent value="queue" className="space-y-6">
            {/* Queue Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard 
                title="Toplam Mağaza" 
                value={queueAnalytics?.summary?.total_stores || 0}
                icon={MapPin}
              />
              <StatCard 
                title="Ort. Bekleme Süresi" 
                value={`${queueAnalytics?.summary?.avg_wait_time_min || 0} dk`}
                icon={Clock}
              />
              <StatCard 
                title="Dikkat Gereken" 
                value={queueAnalytics?.summary?.stores_needing_attention || 0}
                icon={AlertTriangle}
              />
              <StatCard 
                title="Verimlilik" 
                value={`${queueAnalytics?.summary?.avg_efficiency || 0}%`}
                icon={Zap}
              />
            </div>

            {/* Store Queue Details */}
            <div className="space-y-4">
              {queueAnalytics?.stores?.map((store) => (
                <Card key={store.store_id} className="bg-card/50 border-white/10">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">{store.store_name}</CardTitle>
                      <span className={`text-xs px-2 py-1 rounded ${store.status === 'critical' ? 'bg-red-500/20 text-red-400' : store.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-green-500/20 text-green-400'}`}>
                        {store.status === 'critical' ? 'Kritik' : store.status === 'warning' ? 'Uyarı' : 'Normal'}
                      </span>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">Toplam Kasa</p>
                        <p className="text-lg font-bold font-mono">{store.total_checkouts}</p>
                      </div>
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">Aktif Kasa</p>
                        <p className="text-lg font-bold font-mono">{store.active_checkouts}</p>
                      </div>
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">Ort. Bekleme</p>
                        <p className="text-lg font-bold font-mono">{store.avg_wait_time_min} dk</p>
                      </div>
                      <div className="p-3 bg-secondary/30 rounded-lg">
                        <p className="text-xs text-muted-foreground">Verimlilik</p>
                        <p className="text-lg font-bold font-mono">{store.efficiency_percent}%</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {store.checkouts?.map((checkout, idx) => (
                        <div key={idx} className={`p-2 rounded-lg ${checkout.is_active ? 'bg-green-500/10 border border-green-500/30' : 'bg-gray-500/10 border border-gray-500/30'}`}>
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-medium">Kasa {checkout.checkout_number}</p>
                            <span className={`w-2 h-2 rounded-full ${checkout.is_active ? 'bg-green-400' : 'bg-gray-400'}`} />
                          </div>
                          <p className="text-sm font-mono mt-1">{checkout.queue_length} kişi</p>
                          <p className="text-xs text-muted-foreground">{checkout.wait_time_min} dk bekleme</p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default AdvancedAnalyticsPage;
