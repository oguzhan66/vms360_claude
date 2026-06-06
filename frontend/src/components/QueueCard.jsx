import { useState } from 'react';
import { ListOrdered, MapPin, AlertTriangle, CheckCircle, ChevronDown, ChevronUp } from 'lucide-react';

const isHexId = (name) => !name || /^[0-9a-f-]{6,}$/i.test(name.trim());
const formatZoneName = (cameraName, zoneIndex) => {
  if (isHexId(cameraName)) return `Kasa ${zoneIndex + 1}`;
  return cameraName;
};

export const QueueCard = ({ data }) => {
  const [showEmpty, setShowEmpty] = useState(false);

  const statusColor = {
    critical: { dot: 'critical', border: 'status-critical', text: 'text-red-400', bar: 'bg-red-500', badge: 'bg-red-500/15 text-red-400' },
    warning:  { dot: 'warning',  border: 'status-warning',  text: 'text-amber-400', bar: 'bg-amber-500', badge: 'bg-amber-500/15 text-amber-400' },
    normal:   { dot: 'normal',   border: 'status-normal',   text: 'text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400' },
  }[data.status] || { dot: 'normal', border: 'status-normal', text: 'text-emerald-400', bar: 'bg-emerald-500', badge: 'bg-emerald-500/15 text-emerald-400' };

  const threshold = data.queue_threshold || 1;
  const total = data.total_queue_length || 0;
  const barPercent = Math.min(100, (total / (threshold * 2)) * 100);

  const zones = data.zones || [];
  const activeZones = zones.filter(z => z.queue_length > 0);
  const emptyZones = zones.filter(z => z.queue_length === 0);
  const totalZones = zones.length;

  const kasaLabel = totalZones === 0 ? null
    : activeZones.length === 0 ? `${totalZones} kasanın tamamı boş`
    : activeZones.length === totalZones ? `${activeZones.length} kasanın tamamında kuyruk var`
    : `${activeZones.length}/${totalZones} kasada kuyruk var`;

  const statusLabel = { critical: 'Kritik', warning: 'Uyarı', normal: 'Normal' }[data.status] || 'Normal';

  return (
    <div className={`store-card ${statusColor.border}`} data-testid={`queue-card-${data.store_id}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm text-foreground">{data.store_name}</h3>
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{data.district_name}, {data.city_name}</span>
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor.badge}`}>
          {statusLabel}
        </span>
      </div>

      {/* Ana Metrik */}
      <div className="flex items-end justify-between mt-3">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Toplam Kuyruk</div>
          <div className={`font-mono text-3xl font-bold ${statusColor.text} flex items-center gap-2`}>
            <ListOrdered className="w-5 h-5" />
            {total}
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>Eşik: <span className="font-mono font-semibold text-foreground">{threshold}</span></div>
          {kasaLabel && (
            <div className={`mt-1 font-medium ${activeZones.length > 0 ? statusColor.text : 'text-emerald-400'}`}>
              {kasaLabel}
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${statusColor.bar}`}
            style={{ width: `${barPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
          <span>0</span>
          <span>eşik: {threshold}</span>
          <span>{threshold * 2}</span>
        </div>
      </div>

      {/* Kasa detayları */}
      {totalZones > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs text-muted-foreground">Kasa Detayı</div>
            <div className="text-[10px] text-muted-foreground">{totalZones} kasa</div>
          </div>

          {/* Aktif kasalar (kuyruklu) — her zaman göster */}
          {activeZones.length > 0 && (
            <div className="space-y-1 mb-2">
              {activeZones.map((zone, i) => {
                const origIdx = zones.indexOf(zone);
                const name = formatZoneName(zone.camera_name, origIdx);
                const pct = Math.min(100, (zone.queue_length / (threshold * 2)) * 100);
                return (
                  <div key={i} className="flex items-center gap-2 px-2 py-1.5 rounded bg-amber-500/10 border border-amber-500/20">
                    <span className="text-xs text-muted-foreground truncate flex-1" title={name}>{name}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1 bg-white/10 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="font-mono text-sm font-bold text-amber-400 w-4 text-right">{zone.queue_length}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Boş kasalar — collapse edilebilir */}
          {emptyZones.length > 0 && (
            <div>
              <button
                onClick={() => setShowEmpty(v => !v)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                {showEmpty ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                {showEmpty ? 'Boş kasaları gizle' : `${emptyZones.length} boş kasa`}
              </button>
              {showEmpty && (
                <div className="mt-1 max-h-32 overflow-y-auto space-y-1 pr-0.5">
                  {emptyZones.map((zone, i) => {
                    const origIdx = zones.indexOf(zone);
                    const name = formatZoneName(zone.camera_name, origIdx);
                    return (
                      <div key={i} className="flex items-center justify-between px-2 py-1 rounded bg-white/5">
                        <span className="text-xs text-muted-foreground truncate" title={name}>{name}</span>
                        <span className="font-mono text-xs text-muted-foreground ml-2">0</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Uyarı banner */}
      {data.status === 'critical' && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 rounded flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          Kuyruk eşik değerinin 2 katına ulaştı!
        </div>
      )}
      {data.status === 'normal' && total === 0 && (
        <div className="mt-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded flex items-center gap-2 text-xs text-emerald-400">
          <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
          Kuyruk yok
        </div>
      )}
    </div>
  );
};

export default QueueCard;
