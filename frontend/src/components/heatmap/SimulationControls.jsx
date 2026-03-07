/**
 * SimulationControls Component
 * Playback controls for heatmap simulation
 */
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Slider } from '../ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { 
  Play, Pause, SkipBack, SkipForward, 
  Rewind, FastForward, Loader2 
} from 'lucide-react';

export const SimulationControls = ({
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  onLoadData,
  loading,
  isPlaying,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onRewind,
  onFastForward,
  currentFrame,
  totalFrames,
  onFrameChange,
  playbackSpeed,
  onSpeedChange,
  currentTimestamp,
  simulationData
}) => {
  const formatTimestamp = (ts) => {
    if (!ts) return '--:--';
    const date = new Date(ts);
    return date.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* Date Range Selection */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Başlangıç</Label>
          <Input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => onDateFromChange(e.target.value)}
            className="h-8 text-xs bg-secondary/50 border-white/10"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Bitiş</Label>
          <Input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => onDateToChange(e.target.value)}
            className="h-8 text-xs bg-secondary/50 border-white/10"
          />
        </div>
      </div>
      
      <Button 
        onClick={onLoadData} 
        disabled={loading}
        className="w-full"
        size="sm"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Yükleniyor...
          </>
        ) : (
          'Verileri Yükle'
        )}
      </Button>
      
      {/* Playback Controls */}
      {simulationData && totalFrames > 0 && (
        <div className="space-y-3 pt-3 border-t border-white/10">
          {/* Timeline Slider */}
          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>{formatTimestamp(currentTimestamp)}</span>
              <span>Frame {currentFrame + 1} / {totalFrames}</span>
            </div>
            <Slider
              value={[currentFrame]}
              onValueChange={([v]) => onFrameChange(v)}
              max={totalFrames - 1}
              step={1}
            />
          </div>
          
          {/* Control Buttons */}
          <div className="flex items-center justify-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={onRewind}
              className="h-8 w-8 p-0 border-white/10"
              title="Başa Git"
            >
              <Rewind className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={onSkipBack}
              className="h-8 w-8 p-0 border-white/10"
              title="Geri"
            >
              <SkipBack className="w-4 h-4" />
            </Button>
            
            <Button
              variant={isPlaying ? 'destructive' : 'default'}
              size="sm"
              onClick={onPlayPause}
              className="h-10 w-10 p-0"
              title={isPlaying ? 'Duraklat' : 'Oynat'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5" />
              ) : (
                <Play className="w-5 h-5" />
              )}
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={onSkipForward}
              className="h-8 w-8 p-0 border-white/10"
              title="İleri"
            >
              <SkipForward className="w-4 h-4" />
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={onFastForward}
              className="h-8 w-8 p-0 border-white/10"
              title="Sona Git"
            >
              <FastForward className="w-4 h-4" />
            </Button>
          </div>
          
          {/* Speed Control */}
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">Hız:</Label>
            <Select value={String(playbackSpeed)} onValueChange={(v) => onSpeedChange(Number(v))}>
              <SelectTrigger className="w-20 h-8 text-xs bg-secondary/50 border-white/10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0.5">0.5x</SelectItem>
                <SelectItem value="1">1x</SelectItem>
                <SelectItem value="2">2x</SelectItem>
                <SelectItem value="4">4x</SelectItem>
                <SelectItem value="8">8x</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationControls;
