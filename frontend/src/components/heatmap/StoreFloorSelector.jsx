/**
 * StoreFloorSelector Component
 * Sidebar component for selecting stores and floors
 */
import { Button } from '../ui/button';
import { Store, ChevronDown, ChevronUp, Layers } from 'lucide-react';

export const StoreFloorSelector = ({
  storesWithFloors,
  selectedStore,
  selectedFloor,
  showAllFloors,
  onStoreSelect,
  onFloorSelect,
  onToggleAllFloors
}) => {
  return (
    <div className="bg-card border border-white/10 rounded-lg overflow-hidden">
      <div className="p-3 border-b border-white/10">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <Store className="w-4 h-4 text-primary" />
          Mağaza & Kat Seçimi
        </h3>
      </div>
      
      <div className="max-h-64 overflow-y-auto">
        {storesWithFloors.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            Kat tanımlı mağaza bulunamadı
          </div>
        ) : (
          storesWithFloors.map(store => (
            <div key={store.store_id} className="border-b border-white/5 last:border-b-0">
              <Button
                variant="ghost"
                className="w-full justify-between p-3 h-auto rounded-none hover:bg-white/5"
                onClick={() => onStoreSelect(store.store_id)}
              >
                <span className="flex items-center gap-2 text-sm">
                  <Store className="w-4 h-4" />
                  {store.store_name}
                  <span className="text-xs text-muted-foreground">
                    ({store.floors.length} kat)
                  </span>
                </span>
                {selectedStore === store.store_id ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </Button>
              
              {selectedStore === store.store_id && (
                <div className="p-2 space-y-1">
                  {/* All Floors Toggle */}
                  {store.floors.length > 1 && (
                    <Button
                      variant={showAllFloors ? 'default' : 'outline'}
                      size="sm"
                      className="w-full justify-start mb-2 border-primary/30"
                      onClick={onToggleAllFloors}
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      Tüm Katları Göster ({store.floors.length})
                    </Button>
                  )}
                  
                  {/* Individual Floor Selection */}
                  {store.floors.map(floor => (
                    <Button
                      key={floor.floor_id}
                      variant={selectedFloor?.floor_id === floor.floor_id ? 'default' : 'ghost'}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => onFloorSelect(floor)}
                      disabled={showAllFloors}
                    >
                      <Layers className="w-4 h-4 mr-2" />
                      {floor.floor_name}
                      {floor.has_plan && (
                        <span className="ml-auto w-2 h-2 bg-green-500 rounded-full" />
                      )}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default StoreFloorSelector;
