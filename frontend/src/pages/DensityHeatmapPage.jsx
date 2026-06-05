import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import api, { storeApi } from '../services/api';
import { ThermometerSun, BarChart3, RefreshCw } from 'lucide-react';
import {
  ResponsiveContainer, Tooltip
} from 'recharts';
import { toast } from 'sonner';

// Renk skalası: 0→mavi, 50→sarı, 100→kırmızı
const heatColor = (v) => {
  if (v <= 0) return 'rgb(20,20,40)';
  if (v < 25) return `rgb(${Math.round(v * 4)},${Math.round(v * 8)},${Math.round(200 - v * 3)})`;
  if (v < 50) return `rgb(${Math.round(v * 5)},${Math.round(200 - v)},${Math.round(100 - v * 2)})`;
  if (v < 75) return `rgb(${Math.round(200 + v)},${Math.round(v * 2)},0)`;
  return `rgb(255,${Math.round(255 - v * 2)},0)`;
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
    } catch (e) {
      toast.error('Matris yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadGaussian = async () => {
    if (selectedStore === 'all') {
      toast.error('Gaussian analiz için mağaza seçin');
      return;
    }
    setLoading(true);
    try {
      const { date_from, date_to } = getDateRange();
      const res = await api.get(`/heatmap/density/gaussian/${selectedStore}?data_type=${dataType}&date_from=${date_from}&date_to=${date_to}`);
      setGaussData(res.data);
    } catch (e) {
      toast.error('Gaussian analiz yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const run = async () => {
      if (activeTab === 'matrix') await loadMatrix();
      else await loadGaussian();
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStore, dataType, dateRange, activeTab]);

  const hours = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2,'0')}:00`);

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <ThermometerSun className="w-6 h-6 text-orange-400" />
          <div>
            <h1 className="text-xl font-bold">Yoğunluk Analizi</h1>
            <p className="text-sm text-muted-foreground">Floor plan olmadan kamera verisiyle yoğunluk haritası</p>
          </div>
        </div>
      </div>

      <div className="page-content space-y-4">
        {/* Kontroller */}
        <div className="flex flex-wrap gap-3 items-center">
          <select value={selectedStore} onChange={e => setSelectedStore(e.target.value)}
            className="bg-secondary/30 border border-border rounded px-3 py-2 text-sm">
            <option value="all">Tüm Mağazalar</option>
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="flex rounded border border-border overflow-hidden">
            {['counter','queue'].map(t => (
              <button key={t} onClick={() => setDataType(t)}
                className={`px-3 py-2 text-sm ${dataType === t ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground'}`}>
                {t === 'counter' ? 'Kişi Sayma' : 'Kuyruk'}
              </button>
            ))}
          </div>

          <div className="flex rounded border border-border overflow-hidden">
            {[{v:'1d',l:'Bugün'},{v:'7d',l:'7 Gün'},{v:'30d',l:'30 Gün'}].map(r => (
              <button key={r.v} onClick={() => setDateRange(r.v)}
                className={`px-3 py-2 text-sm ${dateRange === r.v ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground'}`}>
                {r.l}
              </button>
            ))}
          </div>

          <div className="flex rounded border border-border overflow-hidden ml-auto">
            <button onClick={() => setActiveTab('matrix')}
              className={`px-3 py-2 text-sm flex items-center gap-1 ${activeTab === 'matrix' ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground'}`}>
              <BarChart3 className="w-3.5 h-3.5" /> Saat Matrisi
            </button>
            <button onClick={() => setActiveTab('gaussian')}
              className={`px-3 py-2 text-sm flex items-center gap-1 border-l border-border ${activeTab === 'gaussian' ? 'bg-primary text-primary-foreground' : 'bg-secondary/30 text-muted-foreground'}`}>
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
          <div className="bg-card/50 border border-border rounded-lg p-4">
            <div className="text-sm font-medium mb-1">
              Mağaza × Saat Yoğunluk Matrisi
              <span className="text-xs text-muted-foreground ml-2">
                — {matrixData.value_label} — koyu kırmızı = en yoğun
              </span>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Her hücredeki sayı: o saatte ortalama <strong>{matrixData.value_label.toLowerCase()}</strong>.
              Siyah = 0 (boş), turuncu = orta, kırmızı = yüksek yoğunluk.
              <strong className="text-amber-400 ml-2">Peak</strong> = gün içi en yoğun saat.
            </p>

            {matrixData.stores.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">Bu dönemde veri yok</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      <th className="text-left pr-3 py-1 text-muted-foreground font-normal whitespace-nowrap w-32">Mağaza</th>
                      {hours.map(h => (
                        <th key={h} className="text-center px-0.5 py-1 text-muted-foreground font-normal"
                          style={{ width: '3.5%', minWidth: '28px' }}>
                          {h.slice(0,2)}
                        </th>
                      ))}
                      <th className="text-center px-2 text-muted-foreground font-normal whitespace-nowrap">Peak</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrixData.stores.map(store => (
                      <tr key={store.store_id}>
                        <td className="pr-3 py-1 text-xs whitespace-nowrap font-medium truncate max-w-32"
                          title={store.store_name}>{store.store_name}</td>
                        {store.hourly.map(h => {
                          const pct = matrixData.global_max > 0 ? h.value / matrixData.global_max * 100 : 0;
                          return (
                            <td key={h.hour} title={`${h.label}: ${h.value}`}
                              style={{ background: heatColor(pct), cursor: 'default' }}
                              className="py-2 text-center rounded-sm">
                              {h.value > 0 && pct > 30 ? (
                                <span className="text-white font-mono" style={{ fontSize: '9px' }}>
                                  {Math.round(h.value)}
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                        <td className="text-center px-2 font-mono font-semibold text-amber-400">
                          {store.peak_hour}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Renk lejantı */}
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs text-muted-foreground">Düşük</span>
                  <div className="flex h-3 w-48 rounded overflow-hidden">
                    {Array.from({length: 20}, (_, i) => (
                      <div key={i} style={{ background: heatColor(i * 5), flex: 1 }} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">Yüksek</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GAUSSIAN YÜKLEMESİ */}
        {!loading && activeTab === 'gaussian' && (
          <div className="bg-card/50 border border-border rounded-lg p-4">
            {!gaussData ? (
              <div className="text-center py-8 text-muted-foreground">Mağaza seçin ve analiz yüklensin</div>
            ) : gaussData.grid.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{gaussData.message || 'Veri yok'}</div>
            ) : (
              <>
                <div className="text-sm font-medium mb-1">
                  Alan Yoğunluk Haritası — Gaussian Modeli
                </div>
                <p className="text-xs text-muted-foreground mb-1">
                  Her kameranın etki alanı matematiksel Gauss fonksiyonuyla hesaplanmıştır.
                  Kırmızı bölgeler kişilerin en çok toplandığı ya da beklediği alanları gösterir.
                </p>
                {gaussData.note && (
                  <p className="text-xs text-amber-400 mb-3">⚠️ {gaussData.note}</p>
                )}

                {/* Grid */}
                <div className="border border-border rounded overflow-hidden"
                  style={{ display: 'grid', gridTemplateRows: `repeat(${gaussData.grid_rows}, 1fr)` }}>
                  {gaussData.grid.map((row, rowIdx) => (
                    <div key={rowIdx} style={{ display: 'grid', gridTemplateColumns: `repeat(${gaussData.grid_cols}, 1fr)` }}>
                      {row.map((val, colIdx) => (
                        <div key={colIdx}
                          style={{ background: heatColor(val), height: '28px' }}
                          title={`Yoğunluk: ${val}%`}
                        />
                      ))}
                    </div>
                  ))}
                </div>

                {/* Aktif kameralar */}
                {gaussData.active_cameras?.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-medium mb-2">Aktif Kameralar</div>
                    <div className="flex flex-wrap gap-2">
                      {gaussData.active_cameras.map(c => (
                        <div key={c.camera_id} className="px-2 py-1 bg-secondary/30 rounded text-xs">
                          {c.name}: <span className="font-mono font-bold text-amber-400">{Math.round(c.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Lejant */}
                <div className="flex items-center gap-2 mt-4">
                  <span className="text-xs text-muted-foreground">Boş</span>
                  <div className="flex h-3 w-48 rounded overflow-hidden">
                    {Array.from({length: 20}, (_, i) => (
                      <div key={i} style={{ background: heatColor(i * 5), flex: 1 }} />
                    ))}
                  </div>
                  <span className="text-xs text-muted-foreground">Yoğun</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default DensityHeatmapPage;
