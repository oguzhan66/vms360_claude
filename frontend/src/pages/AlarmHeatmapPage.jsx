import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { floorApi, vmsEventsApi } from '../services/api';
import { Flame, RefreshCw, ShieldAlert, Info } from 'lucide-react';

const TIME_RANGES = [
  { label: 'Son 1 Saat',  value: '60' },
  { label: 'Son 4 Saat',  value: '240' },
  { label: 'Bugün',       value: 'today' },
  { label: 'Son 7 Gün',   value: '10080' },
  { label: 'Son 30 Gün',  value: '43200' },
];

// Cool → warm colormap  0=blue  0.5=green→yellow  1=red
const intensityToRGB = (t) => {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.25) return [0,                       Math.round(t * 4 * 255),          255];
  if (t < 0.5)  return [0,                       255,                               Math.round((1 - (t - 0.25) * 4) * 255)];
  if (t < 0.75) return [Math.round((t - 0.5) * 4 * 255), 255,                     0];
  return               [255, Math.round((1 - (t - 0.75) * 4) * 255), 0];
};

const AlarmHeatmapPage = () => {
  const [floors, setFloors] = useState([]);
  const [selectedFloorId, setSelectedFloorId] = useState('');
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [alarmData, setAlarmData] = useState(null);
  const [timeRange, setTimeRange] = useState('today');
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    floorApi.getAll().then(r => setFloors(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedFloorId) { setSelectedFloor(null); setCameras([]); return; }
    Promise.all([
      floorApi.getById(selectedFloorId),
      floorApi.getAvailableCameras(selectedFloorId),
    ]).then(([fr, cr]) => {
      setSelectedFloor(fr.data);
      setCameras(cr.data.positioned_cameras || []);
    }).catch(() => {});
  }, [selectedFloorId]);

  const fetchAlarms = useCallback(async () => {
    setLoading(true);
    try {
      let params = { levels: '0,1,2' };
      if (timeRange === 'today') {
        const d = new Date(); d.setHours(0, 0, 0, 0);
        params.time_from = d.toISOString();
        params.time_to   = new Date().toISOString();
      } else {
        params.last_minutes = parseInt(timeRange);
      }
      const r = await vmsEventsApi.getAlarms(params);
      setAlarmData(r.data);
    } catch (e) {
      console.error('Alarm fetch error', e);
    } finally {
      setLoading(false);
    }
  }, [timeRange]);

  useEffect(() => { fetchAlarms(); }, [fetchAlarms]);

  // ── Canvas drawing ─────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedFloor) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    // Background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, W, H);

    // Scale
    const scale = Math.min(W / selectedFloor.width_meters, H / selectedFloor.height_meters) * 0.88;
    const oX = (W - selectedFloor.width_meters * scale) / 2;
    const oY = (H - selectedFloor.height_meters * scale) / 2;

    // Grid
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 0.5;
    const gs = selectedFloor.grid_size || 5;
    for (let x = 0; x <= selectedFloor.width_meters; x += gs) {
      ctx.beginPath();
      ctx.moveTo(oX + x * scale, oY);
      ctx.lineTo(oX + x * scale, oY + selectedFloor.height_meters * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= selectedFloor.height_meters; y += gs) {
      ctx.beginPath();
      ctx.moveTo(oX, oY + y * scale);
      ctx.lineTo(oX + selectedFloor.width_meters * scale, oY + y * scale);
      ctx.stroke();
    }

    // Floor border
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.strokeRect(oX, oY, selectedFloor.width_meters * scale, selectedFloor.height_meters * scale);

    const doHeatmap = () => {
      // Build alarm count per camera
      const events = alarmData?.events || [];
      const byId   = {};
      const byName = {};
      events.forEach(e => {
        if (e.camera_id)   byId[e.camera_id]                         = (byId[e.camera_id]   || 0) + 1;
        if (e.camera_name) byName[(e.camera_name || '').toLowerCase()] = (byName[(e.camera_name || '').toLowerCase()] || 0) + 1;
      });

      const camAlarms = cameras.map(cam => ({
        ...cam,
        alarmCount: byId[cam.camera_vms_id] ?? byName[(cam.name || '').toLowerCase()] ?? 0,
      }));

      const maxA = Math.max(1, ...camAlarms.map(c => c.alarmCount));

      // ── Heatmap layer ──────────────────────────────────────────────
      if (camAlarms.some(c => c.alarmCount > 0)) {
        const hc = document.createElement('canvas');
        hc.width = W; hc.height = H;
        const hx = hc.getContext('2d');
        hx.globalCompositeOperation = 'lighter';

        camAlarms.forEach(cam => {
          if (cam.alarmCount === 0) return;
          const norm = cam.alarmCount / maxA;
          const cx   = oX + cam.position_x * scale;
          const cy   = oY + cam.position_y * scale;
          const r    = (cam.influence_radius || 8) * scale * 1.4;

          const g = hx.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0,   `rgba(255,255,255,${Math.min(0.95, norm)})`);
          g.addColorStop(0.4, `rgba(255,255,255,${Math.min(0.6,  norm * 0.6)})`);
          g.addColorStop(1,   'rgba(255,255,255,0)');
          hx.fillStyle = g;
          hx.beginPath();
          hx.arc(cx, cy, r, 0, Math.PI * 2);
          hx.fill();
        });

        // Colorize pixel-by-pixel
        const id   = hx.getImageData(0, 0, W, H);
        const data = id.data;
        for (let i = 0; i < data.length; i += 4) {
          const v = Math.min(1, data[i] / 255);
          if (v < 0.01) { data[i + 3] = 0; continue; }
          const [r, g, b] = intensityToRGB(v);
          data[i]     = r;
          data[i + 1] = g;
          data[i + 2] = b;
          data[i + 3] = Math.round(Math.min(1, v * 1.6) * 210);
        }
        hx.putImageData(id, 0, 0);

        ctx.globalAlpha = 0.82;
        ctx.drawImage(hc, 0, 0);
        ctx.globalAlpha = 1;
      }

      // ── Camera markers ─────────────────────────────────────────────
      camAlarms.forEach(cam => {
        const cx = oX + cam.position_x * scale;
        const cy = oY + cam.position_y * scale;
        const n  = cam.alarmCount;
        const norm = n / maxA;

        // Glow ring for alarmed cameras
        if (n > 0) {
          const [r, g, b] = intensityToRGB(norm);
          ctx.beginPath();
          ctx.arc(cx, cy, 14, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},0.25)`;
          ctx.fill();
        }

        // Dot
        ctx.beginPath();
        ctx.arc(cx, cy, 10, 0, Math.PI * 2);
        if (n > 0) {
          const [r, g, b] = intensityToRGB(norm);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
        } else {
          ctx.fillStyle = '#475569';
        }
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Count label
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), cx, cy);

        // Camera name
        ctx.font = '9px sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        ctx.textBaseline = 'top';
        const label = (cam.name || '').slice(0, 16);
        // Label bg
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(15,23,42,0.7)';
        ctx.fillRect(cx - tw / 2 - 2, cy + 12, tw + 4, 12);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(label, cx, cy + 13);
      });
    };

    // Draw floor plan image if available, then overlay
    if (selectedFloor.plan_image_data) {
      const img = new Image();
      img.onload = () => {
        ctx.globalAlpha = 0.42;
        ctx.drawImage(img, oX, oY, selectedFloor.width_meters * scale, selectedFloor.height_meters * scale);
        ctx.globalAlpha = 1;
        doHeatmap();
      };
      img.src = selectedFloor.plan_image_data;
    } else {
      doHeatmap();
    }
  }, [selectedFloor, cameras, alarmData]);

  useEffect(() => { draw(); }, [draw]);

  // ── Sidebar summary ────────────────────────────────────────────────────────
  const events = alarmData?.events || [];
  const byId   = {};
  events.forEach(e => { if (e.camera_id) byId[e.camera_id] = (byId[e.camera_id] || 0) + 1; });
  const byName = {};
  events.forEach(e => { const k = (e.camera_name || '').toLowerCase(); if (k) byName[k] = (byName[k] || 0) + 1; });

  const camSummary = cameras
    .map(c => ({
      name: c.name,
      count: byId[c.camera_vms_id] ?? byName[(c.name || '').toLowerCase()] ?? 0,
    }))
    .sort((a, b) => b.count - a.count);
  const maxCount = Math.max(1, ...camSummary.map(c => c.count));

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              Alarm Haritası
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Kamera bazlı alarm yoğunluk haritası</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={timeRange}
              onChange={e => setTimeRange(e.target.value)}
              className="text-sm rounded border border-border bg-background text-foreground px-3 py-1.5 focus:outline-none"
            >
              {TIME_RANGES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <button
              onClick={fetchAlarms}
              className="flex items-center gap-2 px-3 py-1.5 bg-secondary/50 hover:bg-secondary border border-border rounded text-sm transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Plan selector */}
        <div className="mb-4">
          <select
            value={selectedFloorId}
            onChange={e => setSelectedFloorId(e.target.value)}
            className="text-sm rounded border border-border bg-background text-foreground px-3 py-2 w-full max-w-sm focus:outline-none"
          >
            <option value="">— Bölge Planı Seçin —</option>
            {floors.map(f => (
              <option key={f.id} value={f.id}>
                {f.store_name ? `${f.store_name} / ` : ''}{f.name}
              </option>
            ))}
          </select>
        </div>

        {!selectedFloorId ? (
          <div className="text-center py-24 text-muted-foreground">
            <Flame className="w-14 h-14 mx-auto mb-4 opacity-20" />
            <p className="text-base">Alarm haritasını görüntülemek için bir bölge planı seçin.</p>
            <p className="text-sm mt-2 opacity-60">Önce "Bölge Planları" sayfasından plan ve kamera konumları tanımlanmalıdır.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
            {/* Canvas */}
            <div className="xl:col-span-3 bg-card border border-border rounded-lg overflow-hidden">
              <canvas ref={canvasRef} width={1200} height={700} className="w-full" />
              {/* Legend */}
              <div className="px-4 py-2.5 flex flex-wrap items-center gap-4 border-t border-border text-xs text-muted-foreground">
                <span>Alarm Yoğunluğu:</span>
                <div className="flex items-center gap-0.5">
                  {[0, 0.2, 0.4, 0.6, 0.8, 1].map(t => {
                    const [r, g, b] = intensityToRGB(t);
                    return (
                      <div key={t} className="w-8 h-4 first:rounded-l last:rounded-r"
                        style={{ backgroundColor: `rgb(${r},${g},${b})` }} />
                    );
                  })}
                </div>
                <span>Düşük → Yüksek</span>
                {loading && <span className="ml-auto animate-pulse">Yükleniyor…</span>}
                {alarmData && !loading && (
                  <span className="ml-auto">
                    Toplam <strong className="text-amber-600 dark:text-amber-400">{alarmData.total}</strong> alarm · {cameras.length} kamera
                  </span>
                )}
              </div>
            </div>

            {/* Right panel */}
            <div className="xl:col-span-1 bg-card border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                Kamera Alarm Sayıları
              </h3>

              {cameras.length === 0 ? (
                <div className="text-xs text-muted-foreground text-center py-6 space-y-2">
                  <p>Bu planda konumlandırılmış kamera yok.</p>
                  <div className="flex items-start gap-1.5 mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded">
                    <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-amber-600 dark:text-amber-400">"Bölge Planları" sayfasından kamera konumları tanımlayın.</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
                  {camSummary.map((cam, i) => {
                    const norm = cam.count / maxCount;
                    const [r, g, b] = intensityToRGB(norm);
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="text-muted-foreground truncate max-w-[140px]">{cam.name}</span>
                          <span className={`font-mono font-bold ${cam.count > 0 ? '' : 'text-muted-foreground'}`}
                            style={cam.count > 0 ? { color: `rgb(${r},${g},${b})` } : undefined}>
                            {cam.count}
                          </span>
                        </div>
                        <div className="h-1.5 bg-secondary/60 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${(cam.count / maxCount) * 100}%`,
                              backgroundColor: cam.count > 0 ? `rgb(${r},${g},${b})` : 'transparent',
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {alarmData && cameras.length > 0 && (
                <div className="pt-3 border-t border-border space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Toplam Alarm</span>
                    <span className="font-mono font-bold text-amber-600 dark:text-amber-400">{alarmData.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Bildirim</span>
                    <span className="font-mono text-blue-400">{alarmData.counts?.Bildirim ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Alarm</span>
                    <span className="font-mono text-amber-600 dark:text-amber-400">{alarmData.counts?.Alarm ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Hata</span>
                    <span className="font-mono text-red-400">{alarmData.counts?.Hata ?? 0}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default AlarmHeatmapPage;
