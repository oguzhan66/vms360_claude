import { Users, TrendingUp, TrendingDown, MapPin } from 'lucide-react';

export const StoreCard = ({ store, onClick }) => {
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
      className={`store-card ${getStatusClass(store.status)} cursor-pointer hover:border-white/20 transition-colors`}
      onClick={onClick}
      data-testid={`store-card-${store.store_id}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-sm text-foreground">{store.store_name}</h3>
          <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
            <MapPin className="w-3 h-3" />
            <span>{store.district_name}, {store.city_name}</span>
          </div>
        </div>
        <div className={`status-dot ${getOccupancyClass(store.status)}`} />
      </div>

      <div className="grid grid-cols-3 gap-3 mt-4">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Giren</div>
          <div className="font-mono text-lg font-semibold text-emerald-400 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {store.total_in}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Cikan</div>
          <div className="font-mono text-lg font-semibold text-amber-400 flex items-center gap-1">
            <TrendingDown className="w-3 h-3" />
            {store.total_out}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">Mevcut</div>
          <div className={`font-mono text-lg font-semibold ${getStatusClass(store.status)}`}>
            {store.current_visitors}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-muted-foreground">Doluluk</span>
          <span className={`font-mono font-semibold ${getStatusClass(store.status)}`}>
            {store.occupancy_percent}%
          </span>
        </div>
        <div className="occupancy-bar">
          <div 
            className={`occupancy-fill ${getOccupancyClass(store.status)}`}
            style={{ width: `${Math.min(store.occupancy_percent, 100)}%` }}
          />
        </div>
        <div className="text-xs text-muted-foreground mt-1 font-mono">
          Kapasite: {store.capacity}
        </div>
      </div>
    </div>
  );
};

export default StoreCard;
