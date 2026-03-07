import { ListOrdered, MapPin, AlertTriangle } from 'lucide-react';

export const QueueCard = ({ data }) => {
  const getStatusClass = (status) => {
    switch (status) {
      case 'critical': return 'status-critical';
      case 'warning': return 'status-warning';
      default: return 'status-normal';
    }
  };

  const getOccupancyClass = (status) => {
    switch (status) {
      case 'critical': return 'critical';
      case 'warning': return 'warning';
      default: return 'normal';
    }
  };

  return (
    <div 
      className={`store-card ${getStatusClass(data.status)}`}
      data-testid={`queue-card-${data.store_id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm text-foreground">{data.store_name}</h3>
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{data.district_name}, {data.city_name}</span>
          </div>
        </div>
        <div className={`status-dot ${getOccupancyClass(data.status)}`} />
      </div>

      <div className="flex items-center gap-3 mt-4">
        <div className="flex-1">
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Toplam Kuyruk</div>
          <div className={`font-mono text-2xl font-bold ${getStatusClass(data.status)} flex items-center gap-2`}>
            <ListOrdered className="w-5 h-5" />
            {data.total_queue_length}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Esik</div>
          <div className="font-mono text-sm text-muted-foreground">{data.queue_threshold}</div>
        </div>
      </div>

      {data.zones && data.zones.length > 0 && (
        <div className="mt-4 pt-3 border-t border-white/5">
          <div className="text-xs text-muted-foreground mb-2">Bolgeler</div>
          <div className="grid grid-cols-2 gap-2">
            {data.zones.map((zone, idx) => (
              <div 
                key={idx} 
                className={`flex items-center justify-between p-2 ${zone.is_queue ? 'bg-amber-500/10 border border-amber-500/30' : 'bg-white/5'}`}
              >
                <span className="text-xs text-muted-foreground">
                  {zone.camera_name} - Z{zone.zone_index}
                </span>
                <span className={`font-mono text-sm font-semibold ${zone.is_queue ? 'text-amber-400' : 'text-foreground'}`}>
                  {zone.queue_length}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.status === 'critical' && (
        <div className="mt-3 p-2 bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-xs text-red-400">
          <AlertTriangle className="w-4 h-4" />
          Kuyruk esik degerinin 2 katina ulasti!
        </div>
      )}
    </div>
  );
};

export default QueueCard;
