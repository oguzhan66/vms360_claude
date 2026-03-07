/**
 * MultiFloorGrid Component
 * Displays all floors of a store in a grid layout
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '../ui/button';
import { Layers, RefreshCw, Camera } from 'lucide-react';
import { heatmapApi } from '../../services/api';
import { toast } from 'sonner';

export const MultiFloorGrid = ({ 
  store, 
  storesWithFloors, 
  onFloorSelect,
  onClose 
}) => {
  const [loading, setLoading] = useState(false);
  const [floorsData, setFloorsData] = useState([]);

  // Load all floors data
  const loadAllFloorsData = useCallback(async () => {
    if (!store || !store.floors || store.floors.length === 0) return;
    
    setLoading(true);
    try {
      const data = await Promise.all(
        store.floors.map(async (floor) => {
          try {
            const res = await heatmapApi.getLive(floor.floor_id);
            return {
              ...res.data,
              floor_number: floor.floor_number,
              floor_name: floor.floor_name
            };
          } catch (e) {
            return {
              floor_id: floor.floor_id,
              floor_name: floor.floor_name,
              floor_number: floor.floor_number,
              cameras: [],
              error: true
            };
          }
        })
      );
      
      // Sort by floor number
      data.sort((a, b) => a.floor_number - b.floor_number);
      setFloorsData(data);
    } catch (e) {
      console.error('Failed to load all floors', e);
      toast.error('Katlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  }, [store]);

  useEffect(() => {
    loadAllFloorsData();
  }, [loadAllFloorsData]);

  const handleFloorClick = (floorData) => {
    const floor = store.floors.find(f => f.floor_id === floorData.floor_id);
    if (floor && onFloorSelect) {
      onFloorSelect(floor);
    }
  };

  const getFloorLabel = (floorNumber) => {
    if (floorNumber < 0) return `Kat B${Math.abs(floorNumber)}`;
    return `Kat ${floorNumber}`;
  };

  return (
    <div className="mt-6 border-t border-white/10 pt-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary" />
          Tüm Katlar - {store?.store_name}
        </h3>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadAllFloorsData}
          className="border-white/10"
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Yenile
        </Button>
      </div>
      
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {floorsData.map(floorData => (
            <div 
              key={floorData.floor_id}
              className="bg-card border border-white/10 rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group"
              onClick={() => handleFloorClick(floorData)}
            >
              {/* Floor Header */}
              <div className="p-3 border-b border-white/10 bg-secondary/30">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-sm">{floorData.floor_name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {getFloorLabel(floorData.floor_number)}
                    </span>
                  </div>
                  {floorData.plan_image_data && (
                    <span className="w-2 h-2 bg-green-500 rounded-full" />
                  )}
                </div>
              </div>
              
              {/* Mini Heatmap Preview */}
              <div className="p-3">
                {floorData.error ? (
                  <div className="h-28 bg-secondary/20 rounded flex items-center justify-center">
                    <span className="text-xs text-muted-foreground">Veri yüklenemedi</span>
                  </div>
                ) : floorData.cameras?.length > 0 ? (
                  <div className="relative h-28 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded overflow-hidden">
                    {/* Mini camera markers */}
                    {floorData.cameras.slice(0, 5).map((cam, i) => {
                      const x = ((cam.position_x || 0) / (floorData.width_meters || 40)) * 100;
                      const y = ((cam.position_y || 0) / (floorData.height_meters || 30)) * 100;
                      const intensity = Math.min(100, (cam.current_count || 0) * 10);
                      return (
                        <div 
                          key={i}
                          className="absolute"
                          style={{
                            left: `${Math.max(5, Math.min(95, x))}%`,
                            top: `${Math.max(5, Math.min(95, y))}%`,
                            transform: 'translate(-50%, -50%)'
                          }}
                        >
                          <div 
                            className="w-6 h-6 rounded-full blur-sm"
                            style={{
                              background: `radial-gradient(circle, rgba(59, 130, 246, ${0.3 + intensity/200}) 0%, transparent 70%)`
                            }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-2 h-2 bg-blue-500 rounded-full" />
                          </div>
                        </div>
                      );
                    })}
                    
                    {/* Floor plan overlay hint */}
                    {floorData.plan_image_data && (
                      <div className="absolute inset-0 opacity-20">
                        <img 
                          src={floorData.plan_image_data} 
                          alt="" 
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                    
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="text-xs font-medium text-primary">Detay Görüntüle</span>
                    </div>
                  </div>
                ) : (
                  <div className="h-28 bg-secondary/20 rounded flex items-center justify-center">
                    <div className="text-center">
                      <Camera className="w-5 h-5 mx-auto text-muted-foreground/30 mb-1" />
                      <span className="text-xs text-muted-foreground">Kamera yok</span>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Floor Stats */}
              <div className="px-3 pb-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {floorData.cameras?.length || 0} kamera
                </span>
                <span className="text-muted-foreground">
                  {floorData.width_meters || 0}x{floorData.height_meters || 0}m
                </span>
                {floorData.total_visitors > 0 && (
                  <span className="text-blue-400 font-medium">
                    {floorData.total_visitors} ziyaretçi
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MultiFloorGrid;
