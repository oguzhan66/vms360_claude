import { useState, useEffect, useRef } from 'react';
import { Layout } from '../components/Layout';
import api, { storeApi } from '../services/api';
import { ThermometerSun, BarChart3, RefreshCw, Clock, TrendingUp, Store, Activity, Camera } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell
} from 'recharts';
import { toast } from 'sonner';

const heatColor = (v) => {
  if (v <= 0) return 'rgb(20,20,40)';
  if (v < 25) return `rgb(${Math.round(v * 4)},${Math.round(v * 8)},${Math.round(200 - v * 3)})`;
  if (v < 50) return `rgb(${Math.round(v * 5)},${Math.round(200 - v)},${Math.round(100 - v * 2)})`;
  if (v < 75) return `rgb(${Math.round(200 + v)},${Math.round(v * 2)},0)`;
  return `rgb(255,${Math.round(255 - v * 2)},0)`;
};

const SummaryCard = ({ icon: Icon, label, value, sub, color = 'text-primary' }) => (
  <div className="bg-card/50 border border-border rounded-lg p-4 flex items-center gap-3">
    <div className="p-2 bg-secondary/40 rounded-lg">
      <Icon className={`w-5 h-5 ${color}`} />
    </div>
    <div className="min-w-0">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold font-mono truncate ${color}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
    </div>
  </div>
);

// Mini heatmap grid (küçük boyutlu)
const MiniGrid = ({ grid, cols, rows, cameras = [] }) => {
  if (!grid || grid.length === 0) return (
    <div className="flex items-center justify-center h-20 text-xs text-muted-foreground">Veri yok</div>
  );
  const cellH = Math.max(4, Math.floor(80 / rows));
  return (
    <div className="relative w-full" style={{ height: `${cellH * rows}px` }}>
      <div style={{ display: 'grid', gridTemplateRows: `repeat(${rows}, ${cellH}px)`, width: '100%', height: '100%' }}>
        {grid.map((row, ri) => (
          <div key={ri} style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
            {row.map((val, ci) => (
              <div key={ci} style={{ background: heatColor(val) }} />
            ))}
          </div>
        ))}
      </div>
      {/* Kamera noktaları - mini */}
      {cameras.map((cam, i) => (
        <div
          key={i}
          title={cam.name}
          style={{
            position: 'absolute',
            left: `${cam.x_pct}%`,
            top: `${cam.y_pct}%`,
            transform: 'translate(-50%,-50%)',
            width: 6, height: 6,
            borderRadius: '50%',
            background: '#fff',
            border: '1px solid rgba(0,0,0,0.5)',
            zIndex: 2,
          }}
        />
      ))}
    </div>
  );
};

// Tek mağaza için mini kart (tüm mağazalar görünümünde)
const StoreGaussCard = ({ store, dataType, dateParams, onSelect }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { date_from, date_to } = dateParams;
    api.get(`/heatmap/density/gaussian/${store.id}?data_type=${dataType}&date_from=${date_from}&date_to=${date_to}&grid_cols=20&grid_rows=12`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [store.id, dataType, dateParams]);

  const hasData = data && data.grid && data.grid.length > 0 && data.active_cameras?.length > 0;
  const maxDensity = hasData ? Math.max(...data.active_cameras.map(c => c.value)) : 0;

  return (
    <div
      className="bg-card/50 border border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors"
      onClick={() => onSelect(store.id)}
    >
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold truncate">{store.name}</span>
          <span className="text-[10px] text-muted-foreground ml-2 flex-shrink-0">
            {data?.active_cameras?.length ?? 0} kamera
          </span>
        </div>
        <div className="text-[10px] text-muted-foreground">{store.district_name || ''}</div>
      </div>

      <div className="mx-0">
        {loading ? (
          <div className="h-20 bg-secondary/20 animate-pulse" />
        ) : (
          <MiniGrid
            grid={data?.grid ?? []}
            cols={data?.grid_cols ?? 20}
            rows={data?.grid_rows ?? 12}
            cameras={data?.active_cameras ?? []}
          />
        )}
      </div>

      <div className="px-3 py-2 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
          {hasData ? `Peak: ${Math.round(maxDensity)}` : 'Veri yok'}
        </span>
        <span className="text-[10px] text-primary">Detay →</span>
      </div>
    </div>
  );
};

const DensityHeatmapPage = () => {
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState('all');
  const [dataType, setDataType] = useState('counter');
  const [dateRange, setDateRange] = useState('7d');
  const [loading, setLoading] = useState(false);
  const [matrixData, setMatrixData] = useState(null);
  const [gaussData, setGaussData] = useState(null);
  const [activeTab, setActiveTab] = useState('matrix');
  const [hoveredHour, setHoveredHour] = useState(null);
  const [tooltip, setTooltip] = useState(null);

  useEffect(() => {
    storeApi.getAll().then(r => setStores(r.data || []));
  }, []);

  const getDateRange = () => {
    const today = new Date().toISOString().split('T')[0];
    const days = dateRange === '1d' ? 1 : dateRange === '7d' ? 7 : 30;
    return {
      date_from: new Date(Date.now() - days * 86400000).toISOString().split('T')[0],
      date_to: today
    };
  };

  const loadMatrix = async () => {
    setLoading(true);
    try {
      const { date_from, date_to } = getDateRange();
      const params = new URLSearchParams({ data_type: dataType, date_from, date_to });
      if (selectedStore !== 'all') params.append('store_id', selectedStore);
      const res = await api.get(`/heatmap/density/time-matrix?${params}`);
      setMatrixData(res.data);
    } catch {
      toast.error('Matris yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadGaussian = async () => {
    if (selectedStore === 'all') return; // all stores uses StoreGaussCard
    setLoading(true);
    try {
      const { date_from, date_to } = getDateRange();
      const res = await api.get(`/heatmap/density/gaussian/${selectedStore}?data_type=${dataType}&date_from=${date_from}&date_to=${date_to}`);
      setGaussData(res.data);
    } catch {
      toast.error('Gaussian analiz yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'matrix') loadMatrix();
    else loadGaussian();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore, dataType, dateRange, activeTab]);

  const hours = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, '0'));

  const hourlyTotals = matrixData
    ? hours.map((h, idx) => ({
        hour: `${h}:00`,
        total: matrixData.stores.reduce((sum, s) => sum + (s.hourly[idx]?.value || 0), 0),
      }))
    : [];

  const globalTotal = hourlyTotals.reduce((s, h) => s + h.total, 0);
  const peakHourEntry = hourlyTotals.reduce((best, h) => h.total > best.total ? h : best, { hour: '-', total: 0 });
  const quietHourEntry = hourlyTotals.filter(h => h.total > 0).reduce((min, h) => h.total < min.total ? h : min, { hour: '-', total: Infinity });
  const busiestStore = matrixData?.stores.reduce((best, s) => {
    const tot = s.hourly.reduce((sum, h) => sum + h.value, 0);
    return tot > best.total ? { name: s.store_name, total: tot } : best;
  }, { name: '-', total: 0 });
  const maxHourlyTotal = Math.max(...hourlyTotals.map(h => h.total), 1);

  const dateParams = getDateRange();

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ThermometerSun className="w-6 h-6 text-orange-400" />
            <div>
              <h1 className="text-xl font-bold">Yoğunluk Analizi</h1>
              <p className="text-sm text-muted-foreground">Mağaza ve saat bazlı trafik yoğunluğu</p>
            </div>
          </div>
        </div>
      </div>

      <div className="page-content space-y-5">
        {/* Kontroller */}
        <div className="flex flex-wrap gap-3 items-center">
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
            className="bg-secondary/30 border border-border rounded px-3 py-2 text-sm">
            <option value="all">Tüm Mağazalar</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="flex rounded border border-border overflow-hidden">
            {['counter', 'queue'].map(t => (
              <button key={t} onClick={() => setDataType(t)}
                className={`px-3 py-2 text-sm ${dataType === t ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'}`}>
                {t === 'counter' ? 'Kişi Sayma' : 'Kuyruk'}
              </button>
            ))}
          </div>

          <div className="flex rounded border border-border overflow-hidden">
            {[{ v: '1d', l: 'Bugün' }, { v: '7d', l: '7 Gün' }, { v: '30d', l: '30 Gün' }].map(r => (
              <button key={r.v} onClick={() => setDateRange(r.v)}
                className={`px-3 py-2 text-sm ${dateRange === r.v ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'}`}>
                {r.l}
              </button>
            ))}
          </div>

          <div className="flex rounded border border-border overflow-hidden ml-auto">
            <button onClick={() => setActiveTab('matrix')}
              className={`px-3 py-2 text-sm flex items-center gap-1 ${activeTab === 'matrix' ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'}`}>
              <BarChart3 className="w-3.5 h-3.5" /> Saat Matrisi
            </button>
            <button onClick={() => setActiveTab('gaussian')}
              className={`px-3 py-2 text-sm flex items-center gap-1 border-l border-border ${activeTab === 'gaussian' ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground hover:text-foreground'}`}>
              <ThermometerSun className="w-3.5 h-3.5" /> Alan Yoğunluğu
            </button>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-40">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        )}

        {/* SAAT MATRİSİ */}
        {!loading && activeTab === 'matrix' && matrixData && (
          <>
            {matrixData.stores.length > 0 && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <SummaryCard icon={Activity} label="Toplam Trafik" value={globalTotal.toLocaleString('tr')}
                  sub={`${matrixData.stores.length} mağaza, ${dateRange === '1d' ? 'bugün' : dateRange === '7d' ? '7 günlük' : '30 günlük'} ort.`} color="text-primary" />
                <SummaryCard icon={Clock} label="En Yoğun Saat" value={peakHourEntry.hour}
                  sub={`${peakHourEntry.total.toLocaleString('tr')} toplam ziyaretçi`} color="text-orange-400" />
                <SummaryCard icon={TrendingUp} label="En Sakin Saat" value={quietHourEntry.hour === '-' ? '-' : quietHourEntry.hour}
                  sub="En düşük trafik saati" color="text-blue-400" />
                <SummaryCard icon={Store} label="En Yoğun Mağaza" value={busiestStore?.name || '-'}
                  sub={busiestStore?.total ? `${busiestStore.total.toLocaleString('tr')} toplam` : ''} color="text-emerald-400" />
              </div>
            )}

            {matrixData.stores.length > 0 && (
              <div className="bg-card/50 border border-border rounded-lg p-4">
                <div className="text-sm font-medium mb-1">Saatlik Trafik Dağılımı</div>
                <p className="text-xs text-muted-foreground mb-4">
                  Tüm mağazaların saate göre toplam ziyaretçi dağılımı.
                </p>
                <div className="h-44">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={hourlyTotals} margin={{ left: -10, right: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="hour" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} interval={1} />
                      <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px', color: 'hsl(var(--foreground))', fontSize: '12px' }}
                        formatter={(v) => [v.toLocaleString('tr'), 'Ziyaretçi']}
                      />
                      <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                        {hourlyTotals.map((h, i) => (
                          <Cell key={i} fill={h.hour === peakHourEntry.hour ? '#f59e0b' : `hsl(var(--primary) / ${0.4 + (h.total / maxHourlyTotal) * 0.6})`} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-400 inline-block" /> En yoğun saat</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-primary inline-block opacity-80" /> Diğer saatler</span>
                </div>
              </div>
            )}

            <div className="bg-card/50 border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-1">
                <div>
                  <div className="text-sm font-medium">Mağaza × Saat Yoğunluk Matrisi</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Her hücre = o saatteki <span className="text-foreground font-medium">ortalama {matrixData?.value_label || 'kişi'} sayısı</span>.
                    {' '}<span className="text-amber-400 font-semibold">Peak</span> = mağazanın en yoğun saati.
                    {' '}<span className="text-blue-400 font-semibold">Genel Top.</span> = tüm saatlerin toplamı.
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">Düşük</span>
                  <div className="flex h-3 w-32 rounded overflow-hidden">
                    {Array.from({ length: 20 }, (_, i) => (
                      <div key={i} style={{ background: heatColor(i * 5), flex: 1 }} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">Yüksek</span>
                </div>
              </div>

              {matrixData.stores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">Bu dönemde veri yok</div>
              ) : (
                <div className="overflow-x-auto overflow-y-auto mt-3" style={{ maxHeight: '480px' }}>
                  <table className="w-full text-xs border-collapse" style={{ minWidth: '900px' }}>
                    <thead className="sticky top-0 z-10 bg-card">
                      <tr>
                        <th className="text-left pr-4 py-2 text-muted-foreground font-normal whitespace-nowrap" style={{ width: '140px' }}>Mağaza</th>
                        {hours.map(h => (
                          <th key={h}
                            className={`text-center py-2 text-muted-foreground font-normal transition-colors ${hoveredHour === h ? 'text-foreground bg-white/5' : ''}`}
                            style={{ width: '36px', minWidth: '32px' }}
                            onMouseEnter={() => setHoveredHour(h)}
                            onMouseLeave={() => setHoveredHour(null)}>
                            {h}
                          </th>
                        ))}
                        <th className="text-center px-3 text-amber-400 font-normal whitespace-nowrap">Peak</th>
                        <th className="text-center px-3 text-blue-400 font-normal whitespace-nowrap">Genel Top.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matrixData.stores.map(store => {
                        const storeTotal = Math.round(store.hourly.reduce((s, h) => s + h.value, 0));
                        return (
                          <tr key={store.store_id} className="group">
                            <td className="pr-4 py-1.5 text-xs whitespace-nowrap font-medium truncate group-hover:text-foreground text-muted-foreground transition-colors"
                              style={{ maxWidth: '140px' }} title={store.store_name}>
                              {store.store_name}
                            </td>
                            {store.hourly.map((h, idx) => {
                              const pct = matrixData.global_max > 0 ? h.value / matrixData.global_max * 100 : 0;
                              const isHovered = hoveredHour === hours[idx];
                              const rounded = Math.round(h.value);
                              return (
                                <td key={h.hour}
                                  title={`${store.store_name} — Saat ${hours[idx]}:00 — Ort. ${rounded} ${matrixData.value_label}`}
                                  style={{ background: heatColor(pct), cursor: 'default', outline: isHovered ? '1px solid rgba(255,255,255,0.3)' : 'none' }}
                                  className="text-center"
                                  onMouseEnter={() => setHoveredHour(hours[idx])}
                                  onMouseLeave={() => setHoveredHour(null)}>
                                  {rounded > 0 ? (
                                    <span className="text-white font-mono leading-7 block" style={{ fontSize: '10px' }}>{rounded}</span>
                                  ) : (
                                    <span className="leading-7 block text-white/20" style={{ fontSize: '10px' }}>·</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="text-center px-3 font-mono font-bold text-amber-400 text-xs">{store.peak_hour}</td>
                            <td className="text-center px-3 font-mono font-bold text-blue-400 text-xs">
                              {storeTotal > 0 ? storeTotal.toLocaleString('tr') : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-secondary/20">
                        <td className="pr-4 py-2 text-xs font-bold text-foreground">Tüm Mağ.</td>
                        {hourlyTotals.map((h, idx) => {
                          const rounded = Math.round(h.total);
                          return (
                            <td key={idx}
                              title={`Saat ${hours[idx]}:00 — Tüm mağazalar toplam ort. ${rounded} ${matrixData?.value_label || 'kişi'}`}
                              className={`text-center text-xs font-mono font-bold py-2 ${h.hour === peakHourEntry.hour ? 'text-amber-400' : 'text-foreground'}`}
                              onMouseEnter={() => setHoveredHour(hours[idx])}
                              onMouseLeave={() => setHoveredHour(null)}>
                              {rounded > 0 ? rounded : <span className="text-muted-foreground font-normal">—</span>}
                            </td>
                          );
                        })}
                        <td className="text-center px-3 text-amber-400 font-bold text-xs">{peakHourEntry.hour}</td>
                        <td className="text-center px-3 font-mono font-bold text-blue-400 text-xs">{Math.round(globalTotal).toLocaleString('tr')}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ALAN YOĞUNLUĞU — TÜM MAĞAZALAR */}
        {!loading && activeTab === 'gaussian' && selectedStore === 'all' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Mağaza Alan Yoğunluğu</div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Her mağazanın kamera dağılımına göre hesaplanan alan yoğunluk haritası.
                  Detaylar için mağaza kartına tıklayın.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Düşük</span>
                <div className="flex h-3 w-24 rounded overflow-hidden">
                  {Array.from({ length: 12 }, (_, i) => (
                    <div key={i} style={{ background: heatColor(i * 8.5), flex: 1 }} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground">Yüksek</span>
              </div>
            </div>

            {stores.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">Mağaza bulunamadı</div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {stores.map(store => (
                  <StoreGaussCard
                    key={store.id}
                    store={store}
                    dataType={dataType}
                    dateParams={dateParams}
                    onSelect={(id) => setSelectedStore(id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ALAN YOĞUNLUĞU — TEKİL MAĞAZA */}
        {!loading && activeTab === 'gaussian' && selectedStore !== 'all' && (
          <div className="space-y-4">
            {!gaussData ? (
              <div className="text-center py-8 text-muted-foreground">Yükleniyor...</div>
            ) : gaussData.grid.length === 0 ? (
              <div className="bg-card/50 border border-border rounded-lg p-8 text-center text-muted-foreground">
                <Camera className="w-10 h-10 mx-auto mb-3 opacity-40" />
                <div className="text-sm font-medium mb-1">{gaussData.message || 'Bu mağaza için veri yok'}</div>
                <div className="text-xs">Kameraları kat planına yerleştirin ya da farklı bir tarih aralığı seçin.</div>
              </div>
            ) : (
              <>
                {/* KPI satırı */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <SummaryCard icon={Camera} label="Aktif Kamera"
                    value={gaussData.active_cameras?.length ?? 0}
                    sub="Veri olan kamera sayısı" color="text-primary" />
                  <SummaryCard icon={ThermometerSun} label="En Yoğun Kamera"
                    value={gaussData.active_cameras?.[0]?.name ?? '-'}
                    sub={`Değer: ${Math.round(gaussData.active_cameras?.[0]?.value ?? 0)}`} color="text-orange-400" />
                  <SummaryCard icon={Activity} label="Izgara Boyutu"
                    value={`${gaussData.grid_cols}×${gaussData.grid_rows}`}
                    sub="Hücre sayısı" color="text-blue-400" />
                  <SummaryCard icon={Store} label="Konum Verisi"
                    value={gaussData.has_positions ? 'Kat planından' : 'Varsayılan'}
                    sub={gaussData.has_positions ? 'Kameralar konumlandırılmış' : 'Tüm kameralar merkezde'}
                    color={gaussData.has_positions ? 'text-emerald-400' : 'text-amber-400'} />
                </div>

                {gaussData.note && (
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded text-xs text-amber-400">
                    ⚠️ {gaussData.note}
                  </div>
                )}

                {/* Ana heatmap + kamera overlay */}
                <div className="bg-card/50 border border-border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-medium">Alan Yoğunluk Haritası</div>
                      <p className="text-xs text-muted-foreground">
                        Beyaz noktalar kamera konumlarını gösterir. Kırmızı = yoğun, mavi = seyrek.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Boş</span>
                      <div className="flex h-3 w-32 rounded overflow-hidden">
                        {Array.from({ length: 20 }, (_, i) => (
                          <div key={i} style={{ background: heatColor(i * 5), flex: 1 }} />
                        ))}
                      </div>
                      <span className="text-xs text-muted-foreground">Yoğun</span>
                    </div>
                  </div>

                  {/* Grid + kamera overlay */}
                  <div className="relative border border-border rounded overflow-hidden w-full"
                    style={{ aspectRatio: `${gaussData.grid_cols}/${gaussData.grid_rows}`, maxHeight: '480px' }}>
                    {/* Heatmap grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateRows: `repeat(${gaussData.grid_rows}, 1fr)`,
                      width: '100%',
                      height: '100%',
                      position: 'absolute',
                      inset: 0
                    }}>
                      {gaussData.grid.map((row, rowIdx) => (
                        <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: `repeat(${gaussData.grid_cols}, 1fr)` }}>
                          {row.map((val, colIdx) => (
                            <div key={colIdx} style={{ background: heatColor(val) }} title={`Yoğunluk: ${val}%`} />
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* Kamera nokta overlay */}
                    {gaussData.active_cameras?.map((cam, i) => {
                      const isHot = i < 3;
                      return (
                        <div
                          key={cam.camera_id}
                          style={{
                            position: 'absolute',
                            left: `${cam.x_pct}%`,
                            top: `${cam.y_pct}%`,
                            transform: 'translate(-50%, -50%)',
                            zIndex: 10,
                          }}
                        >
                          {/* Pulse ring for hot cameras */}
                          {isHot && (
                            <div style={{
                              position: 'absolute',
                              width: 28, height: 28,
                              borderRadius: '50%',
                              border: '2px solid rgba(255,255,255,0.6)',
                              top: -8, left: -8,
                              animation: 'ping 1.5s cubic-bezier(0,0,0.2,1) infinite',
                              opacity: 0.5,
                            }} />
                          )}
                          <div
                            title={`${cam.name}: ${Math.round(cam.value)}`}
                            style={{
                              width: 12, height: 12,
                              borderRadius: '50%',
                              background: isHot ? '#ffffff' : 'rgba(255,255,255,0.7)',
                              border: `2px solid ${isHot ? '#f59e0b' : 'rgba(255,255,255,0.4)'}`,
                              boxShadow: isHot ? '0 0 8px rgba(245,158,11,0.8)' : '0 0 4px rgba(0,0,0,0.5)',
                              cursor: 'default',
                              position: 'relative',
                            }}
                          />
                          {/* Kamera adı etiketi */}
                          <div style={{
                            position: 'absolute',
                            top: 14,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.75)',
                            color: '#fff',
                            fontSize: 9,
                            padding: '1px 4px',
                            borderRadius: 3,
                            whiteSpace: 'nowrap',
                            pointerEvents: 'none',
                          }}>
                            {cam.name}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Kamera listesi — sıralı */}
                <div className="bg-card/50 border border-border rounded-lg p-4">
                  <div className="text-sm font-medium mb-3">Kamera Yoğunluk Sıralaması</div>
                  <div className="space-y-2">
                    {[...gaussData.active_cameras]
                      .sort((a, b) => b.value - a.value)
                      .map((cam, i) => {
                        const pct = gaussData.active_cameras.length > 0
                          ? cam.value / Math.max(...gaussData.active_cameras.map(c => c.value)) * 100
                          : 0;
                        return (
                          <div key={cam.camera_id} className="flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-5 text-right">{i + 1}.</span>
                            <span className="text-xs font-medium w-32 truncate" title={cam.name}>{cam.name}</span>
                            <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${pct}%`, background: heatColor(pct) }}
                              />
                            </div>
                            <span className="font-mono text-xs text-foreground w-12 text-right">{Math.round(cam.value)}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ping {
          75%, 100% { transform: scale(2); opacity: 0; }
        }
      `}</style>
    </Layout>
  );
};

export default DensityHeatmapPage;
