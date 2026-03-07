/**
 * HeatmapSettingsPanel Component
 * Controls for heatmap visualization settings
 */
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { Switch } from '../ui/switch';
import { Settings2, Target, ArrowRight, Camera, Layers, MapPin, ChevronDown, ChevronUp } from 'lucide-react';

export const HeatmapSettingsPanel = ({
  expanded,
  onToggle,
  opacity,
  onOpacityChange,
  showHotspots,
  onShowHotspotsChange,
  showFlowArrows,
  onShowFlowArrowsChange,
  showCameraLabels,
  onShowCameraLabelsChange,
  showZoneBorders,
  onShowZoneBordersChange,
  useZoneMask,
  onUseZoneMaskChange,
  hasZones,
  heatmapData
}) => {
  return (
    <div className="bg-card border border-white/10 rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        className="w-full justify-between p-3 h-auto rounded-none"
        onClick={onToggle}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Settings2 className="w-4 h-4 text-primary" />
          Görselleştirme Ayarları
        </span>
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </Button>
      
      {expanded && (
        <div className="p-3 border-t border-white/10 space-y-4">
          {/* Floor Info */}
          {heatmapData && (
            <div className="text-xs space-y-1 pb-3 border-b border-white/10">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alan:</span>
                <span>{heatmapData.width_meters}m x {heatmapData.height_meters}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Grid:</span>
                <span>{heatmapData.grid_size}m x {heatmapData.grid_size}m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Kamera:</span>
                <span>{heatmapData.cameras?.length || 0}</span>
              </div>
            </div>
          )}
          
          {/* Opacity Slider */}
          <div>
            <Label className="text-xs flex justify-between mb-2">
              <span>Şeffaflık</span>
              <span className="text-muted-foreground">{Math.round(opacity * 100)}%</span>
            </Label>
            <Slider
              value={[opacity]}
              onValueChange={([v]) => onOpacityChange(v)}
              min={0.1}
              max={1}
              step={0.05}
            />
          </div>
          
          {/* Toggle Options */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1 cursor-pointer">
                <Target className="w-3 h-3 text-red-400" />
                Sıcak Noktalar
              </Label>
              <Switch 
                checked={showHotspots} 
                onCheckedChange={onShowHotspotsChange}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1 cursor-pointer">
                <ArrowRight className="w-3 h-3 text-cyan-400" />
                Akış Okları
              </Label>
              <Switch 
                checked={showFlowArrows} 
                onCheckedChange={onShowFlowArrowsChange}
              />
            </div>
            
            <div className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-1 cursor-pointer">
                <Camera className="w-3 h-3 text-blue-400" />
                Kamera Etiketleri
              </Label>
              <Switch 
                checked={showCameraLabels} 
                onCheckedChange={onShowCameraLabelsChange}
              />
            </div>
          </div>
          
          {/* Zone Masking Options */}
          {hasZones && (
            <div className="space-y-3 pt-2 border-t border-white/10">
              <div className="text-xs text-muted-foreground font-medium">Bölge Maskeleme</div>
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1 cursor-pointer">
                  <Layers className="w-3 h-3 text-green-400" />
                  Bölge Sınırları
                </Label>
                <Switch 
                  checked={showZoneBorders} 
                  onCheckedChange={onShowZoneBordersChange}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1 cursor-pointer">
                  <MapPin className="w-3 h-3 text-yellow-400" />
                  Bölge Maskesi
                </Label>
                <Switch 
                  checked={useZoneMask} 
                  onCheckedChange={onUseZoneMaskChange}
                />
              </div>
              <p className="text-[10px] text-muted-foreground">
                Açık olduğunda ısı haritası sadece tanımlı bölgelerde gösterilir
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default HeatmapSettingsPanel;
