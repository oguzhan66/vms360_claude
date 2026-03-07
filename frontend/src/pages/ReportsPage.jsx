import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { FilterBar } from '../components/FilterBar';
import { reportApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Download, FileSpreadsheet, FileText, FileJson, Users, ListOrdered, BarChart3, Calendar, RefreshCw, FileType } from 'lucide-react';
import { toast } from 'sonner';
import { 
  PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, 
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';

const REPORT_TYPES = [
  { id: 'counter', label: 'Kişi Sayma', icon: Users, description: 'Giriş/çıkış ve doluluk verileri' },
  { id: 'queue', label: 'Kuyruk Analizi', icon: ListOrdered, description: 'Kuyruk uzunlukları ve yoğunluk' },
  { id: 'analytics', label: 'Yaş/Cinsiyet', icon: BarChart3, description: 'Demografik analiz verileri' },
];

const DATE_RANGES = [
  { id: '1d', label: '1 Gün' },
  { id: '1w', label: '1 Hafta' },
  { id: '1m', label: '1 Ay' },
  { id: '1y', label: '1 Yıl' },
  { id: 'custom', label: 'Manuel Seçim' },
];

const COLORS = ['#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6', '#EC4899'];

const ReportsPage = () => {
  const [selectedType, setSelectedType] = useState('counter');
  const [dateRange, setDateRange] = useState('1d');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [filters, setFilters] = useState({});
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const params = {
        ...filters,
        date_range: dateRange,
        ...(dateRange === 'custom' && dateFrom && { date_from: dateFrom }),
        ...(dateRange === 'custom' && dateTo && { date_to: dateTo }),
      };

      let res;
      if (selectedType === 'counter') {
        res = await reportApi.getCounter(params);
      } else if (selectedType === 'queue') {
        res = await reportApi.getQueue(params);
      } else {
        res = await reportApi.getAnalytics(params);
      }
      setReport(res.data);
    } catch (e) {
      console.error('Failed to load report', e);
      toast.error('Rapor yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [selectedType, dateRange, dateFrom, dateTo, filters]);

  const handleExport = async (format) => {
    setExporting(true);
    try {
      const params = {
        ...filters,
        date_range: dateRange,
        ...(dateRange === 'custom' && dateFrom && { date_from: dateFrom }),
        ...(dateRange === 'custom' && dateTo && { date_to: dateTo }),
      };

      if (format === 'pdf') {
        const res = await reportApi.exportPdf(selectedType, params);
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `rapor_${selectedType}_${new Date().toISOString().slice(0,10)}.pdf`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        toast.success('PDF raporu indirildi');
        return;
      }

      const res = await reportApi.export(selectedType, format, params);
      
      if (format === 'json') {
        const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `rapor_${selectedType}_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      } else {
        const url = window.URL.createObjectURL(new Blob([res.data]));
        const link = document.createElement('a');
        link.href = url;
        const ext = format === 'excel' ? 'xlsx' : 'csv';
        link.setAttribute('download', `rapor_${selectedType}_${new Date().toISOString().slice(0,10)}.${ext}`);
        document.body.appendChild(link);
        link.click();
        link.remove();
      }
      
      toast.success(`${format.toUpperCase()} raporu indirildi`);
    } catch (e) {
      console.error('Export failed', e);
      toast.error('Dışa aktarma başarısız');
    } finally {
      setExporting(false);
    }
  };

  const getDateRangeLabel = () => {
    const range = DATE_RANGES.find(r => r.id === dateRange);
    if (dateRange === 'custom' && dateFrom && dateTo) {
      return `${dateFrom} - ${dateTo}`;
    }
    return range?.label || '';
  };

  // Chart data for different report types
  const getStatusData = () => {
    if (!report?.summary) return [];
    const s = report.summary;
    return [
      { name: 'Normal', value: s.stores_normal || 0, color: '#10B981' },
      { name: 'Uyarı', value: s.stores_warning || 0, color: '#F59E0B' },
      { name: 'Kritik', value: s.stores_critical || 0, color: '#EF4444' },
    ].filter(d => d.value > 0);
  };

  const getGenderData = () => {
    if (!report?.gender_distribution) return [];
    const g = report.gender_distribution;
    return [
      { name: 'Erkek', value: g.Male || 0, color: '#3B82F6' },
      { name: 'Kadın', value: g.Female || 0, color: '#EC4899' },
    ].filter(d => d.value > 0);
  };

  const getAgeData = () => {
    if (!report?.age_distribution) return [];
    return Object.entries(report.age_distribution).map(([key, value], idx) => ({
      name: key,
      value,
      fill: COLORS[idx % COLORS.length]
    }));
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Raporlar</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Detaylı analiz raporları ve veri dışa aktarma
            </p>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Report Type Selection */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {REPORT_TYPES.map((type) => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`p-4 text-left transition-all ${
                selectedType === type.id 
                  ? 'store-card border-primary border-2' 
                  : 'store-card hover:border-primary/50'
              }`}
              data-testid={`report-type-${type.id}`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 flex items-center justify-center ${
                  selectedType === type.id ? 'bg-primary/20' : 'bg-secondary'
                }`}>
                  <type.icon className={`w-5 h-5 ${selectedType === type.id ? 'text-primary' : 'text-muted-foreground'}`} />
                </div>
                <div>
                  <div className={`font-semibold ${selectedType === type.id ? 'text-primary' : ''}`}>
                    {type.label}
                  </div>
                  <div className="text-xs text-muted-foreground">{type.description}</div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Date Range & Filters */}
        <div className="filter-bar mb-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>Tarih Aralığı</span>
          </div>

          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36 bg-secondary/50 border-border" data-testid="date-range-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_RANGES.map((range) => (
                <SelectItem key={range.id} value={range.id}>{range.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {dateRange === 'custom' && (
            <>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Başlangıç:</Label>
                <Input
                  type="datetime-local"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-48 bg-secondary/50 border-border"
                  data-testid="date-from-input"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm text-muted-foreground">Bitiş:</Label>
                <Input
                  type="datetime-local"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-48 bg-secondary/50 border-border"
                  data-testid="date-to-input"
                />
              </div>
            </>
          )}

          <div className="flex-1" />

          <Button 
            variant="outline" 
            size="sm" 
            onClick={loadReport}
            disabled={loading}
            className="border-border text-foreground"
            data-testid="refresh-report-btn"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Yenile
          </Button>
        </div>

        {/* Location Filters */}
        <FilterBar 
          onFilterChange={setFilters}
          showRefresh={false}
          showStoreFilter={true}
        />

        {/* Export Buttons */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm text-muted-foreground">Dışa Aktar:</span>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleExport('excel')}
            disabled={exporting || loading}
            className="border-border text-foreground"
            data-testid="export-excel"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2 text-green-500" />
            Excel (.xlsx)
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleExport('csv')}
            disabled={exporting || loading}
            className="border-border text-foreground"
            data-testid="export-csv"
          >
            <FileText className="w-4 h-4 mr-2 text-blue-500" />
            CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleExport('json')}
            disabled={exporting || loading}
            className="border-border text-foreground"
            data-testid="export-json"
          >
            <FileJson className="w-4 h-4 mr-2 text-amber-500" />
            JSON
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => handleExport('pdf')}
            disabled={exporting || loading}
            className="border-border text-foreground"
            data-testid="export-pdf"
          >
            <FileType className="w-4 h-4 mr-2 text-red-500" />
            PDF
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-16 text-muted-foreground">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p>Rapor yükleniyor...</p>
          </div>
        ) : report ? (
          <>
            {/* Report Summary */}
            <div className="chart-container mb-6">
              <div className="chart-title flex items-center gap-2">
                {REPORT_TYPES.find(t => t.id === selectedType)?.icon && (
                  <span>{(() => { const Icon = REPORT_TYPES.find(t => t.id === selectedType)?.icon; return Icon ? <Icon className="w-5 h-5 text-primary" /> : null; })()}</span>
                )}
                {REPORT_TYPES.find(t => t.id === selectedType)?.label} Raporu - {getDateRangeLabel()}
              </div>
              
              {/* Counter Report Summary */}
              {selectedType === 'counter' && report.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-4">
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Toplam Mağaza</div>
                    <div className="text-2xl font-mono font-bold">{report.summary.total_stores}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Toplam Giriş</div>
                    <div className="text-2xl font-mono font-bold text-emerald-500">{report.summary.total_in?.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Toplam Çıkış</div>
                    <div className="text-2xl font-mono font-bold text-amber-500">{report.summary.total_out?.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Mevcut Ziyaretçi</div>
                    <div className="text-2xl font-mono font-bold">{report.summary.current_visitors?.toLocaleString()}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Ort. Doluluk</div>
                    <div className="text-2xl font-mono font-bold">%{report.summary.avg_occupancy}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Kritik Mağaza</div>
                    <div className="text-2xl font-mono font-bold text-red-500">{report.summary.stores_critical}</div>
                  </div>
                </div>
              )}

              {/* Queue Report Summary */}
              {selectedType === 'queue' && report.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Toplam Mağaza</div>
                    <div className="text-2xl font-mono font-bold">{report.summary.total_stores}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Toplam Kuyruk</div>
                    <div className="text-2xl font-mono font-bold text-amber-500">{report.summary.total_queue_length}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Ort. Kuyruk/Mağaza</div>
                    <div className="text-2xl font-mono font-bold">{report.summary.avg_queue_per_store}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Kritik Mağaza</div>
                    <div className="text-2xl font-mono font-bold text-red-500">{report.summary.stores_critical}</div>
                  </div>
                </div>
              )}

              {/* Analytics Report Summary */}
              {selectedType === 'analytics' && report.summary && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Toplam Tespit</div>
                    <div className="text-2xl font-mono font-bold">{report.summary.total_detections}</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Erkek</div>
                    <div className="text-2xl font-mono font-bold text-blue-500">{report.summary.male_count} (%{report.summary.male_percent})</div>
                  </div>
                  <div className="p-3 bg-secondary/30 border border-border">
                    <div className="text-xs text-muted-foreground">Kadın</div>
                    <div className="text-2xl font-mono font-bold text-pink-500">{report.summary.female_count} (%{report.summary.female_percent})</div>
                  </div>
                </div>
              )}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Status Distribution Chart (Counter & Queue) */}
              {(selectedType === 'counter' || selectedType === 'queue') && (
                <div className="chart-container">
                  <div className="chart-title">Mağaza Durum Dağılımı</div>
                  <div className="h-64">
                    {getStatusData().length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPie>
                          <Pie
                            data={getStatusData()}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {getStatusData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              background: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              color: 'hsl(var(--foreground))'
                            }}
                          />
                        </RechartsPie>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">Veri yok</div>
                    )}
                  </div>
                  <div className="flex justify-center gap-4 mt-2">
                    {getStatusData().map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3" style={{ background: item.color }} />
                        <span>{item.name}: {item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Gender Distribution (Analytics) */}
              {selectedType === 'analytics' && (
                <div className="chart-container">
                  <div className="chart-title">Cinsiyet Dağılımı</div>
                  <div className="h-64">
                    {getGenderData().length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <RechartsPie>
                          <Pie
                            data={getGenderData()}
                            cx="50%"
                            cy="50%"
                            innerRadius={50}
                            outerRadius={80}
                            paddingAngle={2}
                            dataKey="value"
                          >
                            {getGenderData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip 
                            contentStyle={{ 
                              background: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              color: 'hsl(var(--foreground))'
                            }}
                          />
                        </RechartsPie>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">Veri yok</div>
                    )}
                  </div>
                  <div className="flex justify-center gap-4 mt-2">
                    {getGenderData().map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-sm">
                        <div className="w-3 h-3" style={{ background: item.color }} />
                        <span>{item.name}: {item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Age Distribution (Analytics) */}
              {selectedType === 'analytics' && (
                <div className="chart-container">
                  <div className="chart-title">Yaş Dağılımı</div>
                  <div className="h-64">
                    {getAgeData().some(d => d.value > 0) ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={getAgeData()} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                          <YAxis 
                            dataKey="name" 
                            type="category" 
                            stroke="hsl(var(--muted-foreground))"
                            width={60}
                          />
                          <Tooltip 
                            contentStyle={{ 
                              background: 'hsl(var(--card))', 
                              border: '1px solid hsl(var(--border))',
                              color: 'hsl(var(--foreground))'
                            }}
                          />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                            {getAgeData().map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-muted-foreground">Veri yok</div>
                    )}
                  </div>
                </div>
              )}

              {/* Store Bar Chart (Counter) */}
              {selectedType === 'counter' && report.stores?.length > 0 && (
                <div className="chart-container">
                  <div className="chart-title">En Yoğun Mağazalar</div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart 
                        data={report.stores.slice(0, 8).map(s => ({
                          name: s.store_name?.substring(0, 12) || '',
                          visitors: s.current_visitors || 0
                        }))} 
                        layout="vertical"
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" />
                        <YAxis 
                          dataKey="name" 
                          type="category" 
                          stroke="hsl(var(--muted-foreground))"
                          width={100}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            background: 'hsl(var(--card))', 
                            border: '1px solid hsl(var(--border))',
                            color: 'hsl(var(--foreground))'
                          }}
                        />
                        <Bar dataKey="visitors" fill="#3B82F6" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>

            {/* Detail Table */}
            <div className="chart-container">
              <div className="chart-title">Detay Tablosu</div>
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    {selectedType === 'counter' && (
                      <tr>
                        <th>Mağaza</th>
                        <th>Bölge</th>
                        <th>İl</th>
                        <th>İlçe</th>
                        <th>Giriş</th>
                        <th>Çıkış</th>
                        <th>Mevcut</th>
                        <th>Kapasite</th>
                        <th>Doluluk</th>
                        <th>Durum</th>
                      </tr>
                    )}
                    {selectedType === 'queue' && (
                      <tr>
                        <th>Mağaza</th>
                        <th>Bölge</th>
                        <th>İl</th>
                        <th>İlçe</th>
                        <th>Kuyruk</th>
                        <th>Eşik</th>
                        <th>Durum</th>
                      </tr>
                    )}
                    {selectedType === 'analytics' && (
                      <tr>
                        <th>Zaman</th>
                        <th>Kamera</th>
                        <th>Yaş</th>
                        <th>Cinsiyet</th>
                        <th>Tanınma</th>
                      </tr>
                    )}
                  </thead>
                  <tbody>
                    {selectedType === 'counter' && report.stores?.map((store) => (
                      <tr key={store.store_id}>
                        <td className="font-medium">{store.store_name}</td>
                        <td>{store.region_name}</td>
                        <td>{store.city_name}</td>
                        <td>{store.district_name}</td>
                        <td className="font-mono text-emerald-500">{store.total_in}</td>
                        <td className="font-mono text-amber-500">{store.total_out}</td>
                        <td className="font-mono font-bold">{store.current_visitors}</td>
                        <td className="font-mono">{store.capacity}</td>
                        <td className="font-mono">%{store.occupancy_percent}</td>
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
                    {selectedType === 'queue' && report.stores?.map((store) => (
                      <tr key={store.store_id}>
                        <td className="font-medium">{store.store_name}</td>
                        <td>{store.region_name}</td>
                        <td>{store.city_name}</td>
                        <td>{store.district_name}</td>
                        <td className="font-mono font-bold">{store.total_queue_length}</td>
                        <td className="font-mono">{store.queue_threshold}</td>
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
                    {((selectedType === 'counter' && !report.stores?.length) || 
                      (selectedType === 'queue' && !report.stores?.length)) && (
                      <tr>
                        <td colSpan={10} className="text-center py-8 text-muted-foreground">
                          Veri bulunamadı
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Rapor yüklenemedi</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default ReportsPage;
