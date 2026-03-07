import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { heatmapApi, locationApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Slider } from '../components/ui/slider';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { 
  Layers, Play, Pause, SkipBack, SkipForward, 
  Calendar, RefreshCw, Download, MapPin, Camera, 
  ThermometerSun, Clock, ChevronDown, ChevronUp,
  Eye, Target, ArrowRight, Settings2,
  FileText, GitCompare, Rewind, FastForward, Store, Loader2,
  BarChart3, FileSearch
} from 'lucide-react';
import { toast } from 'sonner';

// Import refactored components
import { MultiFloorGrid } from '../components/heatmap/MultiFloorGrid';

const HeatmapPage = () => {
  const [stores, setStores] = useState([]);
  const [storesWithFloors, setStoresWithFloors] = useState([]);
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedDistrict, setSelectedDistrict] = useState('');
  const [selectedStore, setSelectedStore] = useState('');
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [heatmapData, setHeatmapData] = useState(null);
  const [reportData, setReportData] = useState(null); // Store generated report
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeIndex, setCurrentTimeIndex] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showAllFloors, setShowAllFloors] = useState(false);
  const [multiFloorData, setMultiFloorData] = useState([]);
  const canvasRef = useRef(null);
  const playIntervalRef = useRef(null);
  
  // Advanced heatmap settings
  const [heatmapOpacity, setHeatmapOpacity] = useState(70);
  const [showHotspots, setShowHotspots] = useState(true);
  const [showFlowArrows, setShowFlowArrows] = useState(true);
  const [showCameraLabels, setShowCameraLabels] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [useZoneMask, setUseZoneMask] = useState(false);
  const [showZoneBorders, setShowZoneBorders] = useState(true);
  
  // Report generation mode (removed live mode)
  const [viewMode, setViewMode] = useState('report'); // 'report', 'compare'
  
  // Date range for report generation
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // Default: yesterday
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return d.toISOString().slice(0, 16);
  });
  
  // Comparison
  const [compareDate, setCompareDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    d.setHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  });
  const [compareData, setCompareData] = useState(null);
  const [showCompareOverlay, setShowCompareOverlay] = useState(false);
  
  // Comparison canvases
  const compareCanvasLeftRef = useRef(null);
  const compareCanvasRightRef = useRef(null);
  const diffCanvasRef = useRef(null);

  // Load initial data
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [storesRes, regionsRes, citiesRes] = await Promise.all([
          heatmapApi.getStoresWithFloors(),
          locationApi.getRegions(),
          locationApi.getCities()
        ]);
        setStoresWithFloors(storesRes.data || []);
        setRegions(regionsRes.data);
        setCities(citiesRes.data);
        
        // Load districts
        const districtsRes = await locationApi.getDistricts();
        setDistricts(districtsRes.data);
      } catch (e) {
        console.error('Failed to load data', e);
        toast.error('Veri yüklenemedi');
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, []);

  // Filter stores by region/city/district
  const filteredStores = storesWithFloors.filter(store => {
    if (selectedRegion && store.region_name !== regions.find(r => r.id === selectedRegion)?.name) return false;
    if (selectedCity && store.city_name !== cities.find(c => c.id === selectedCity)?.name) return false;
    if (selectedDistrict && store.district_name !== districts.find(d => d.id === selectedDistrict)?.name) return false;
    return true;
  });

  // Generate heatmap report (ON-DEMAND - main feature)
  const generateHeatmapReport = async () => {
    if (!selectedFloor) {
      toast.error('Önce bir kat seçin');
      return;
    }
    
    try {
      setGeneratingReport(true);
      toast.info('Rapor oluşturuluyor...');
      
      const res = await heatmapApi.getRange(selectedFloor.floor_id, {
        date_from: new Date(dateFrom).toISOString(),
        date_to: new Date(dateTo).toISOString(),
        interval_minutes: 60
      });
      
      if (res.data.timeline_data?.length > 0) {
        setReportData(res.data);
        // Set initial heatmap data from first frame
        const firstFrame = res.data.timeline_data[0];
        setHeatmapData({
          ...res.data,
          cameras: firstFrame.cameras,
          total_visitors: firstFrame.total_in,
          timestamp: firstFrame.timestamp
        });
        setCurrentTimeIndex(0);
        setViewMode('report');
        toast.success(`${res.data.timeline_data.length} veri noktası ile rapor oluşturuldu`);
      } else {
        toast.warning('Seçilen tarih aralığında veri bulunamadı');
        setReportData(null);
        setHeatmapData(null);
      }
    } catch (e) {
      console.error('Failed to generate report', e);
      toast.error('Rapor oluşturulamadı');
    } finally {
      setGeneratingReport(false);
    }
  };

  // Load comparison data
  const loadCompareData = async () => {
    if (!selectedFloor) {
      toast.error('Önce bir kat seçin');
      return;
    }
    
    try {
      setGeneratingReport(true);
      
      // Primary date range (from form)
      const primaryStart = new Date(dateFrom);
      const primaryEnd = new Date(dateTo);
      
      // Compare date range
      const compareStart = new Date(compareDate);
      compareStart.setHours(0, 0, 0, 0);
      const compareEnd = new Date(compareDate);
      compareEnd.setHours(23, 59, 59, 999);
      
      const [primaryRes, compareRes] = await Promise.all([
        heatmapApi.getRange(selectedFloor.floor_id, {
          date_from: primaryStart.toISOString(),
          date_to: primaryEnd.toISOString()
        }),
        heatmapApi.getRange(selectedFloor.floor_id, {
          date_from: compareStart.toISOString(),
          date_to: compareEnd.toISOString()
        })
      ]);
      
      // Calculate comparison stats
      const primaryTotal = primaryRes.data.timeline_data?.reduce((sum, t) => sum + (t.total_in || 0), 0) || 0;
      const compareTotal = compareRes.data.timeline_data?.reduce((sum, t) => sum + (t.total_in || 0), 0) || 0;
      
      const primaryAvg = primaryRes.data.timeline_data?.length > 0 
        ? Math.round(primaryTotal / primaryRes.data.timeline_data.length) 
        : 0;
      const compareAvg = compareRes.data.timeline_data?.length > 0 
        ? Math.round(compareTotal / compareRes.data.timeline_data.length) 
        : 0;
      
      const percentChange = compareAvg > 0 
        ? Math.round(((primaryAvg - compareAvg) / compareAvg) * 100) 
        : 0;
      
      setCompareData({
        primary: primaryRes.data,
        compare: compareRes.data,
        stats: {
          primaryTotal,
          compareTotal,
          primaryAvg,
          compareAvg,
          percentChange,
          primaryDataPoints: primaryRes.data.timeline_data?.length || 0,
          compareDataPoints: compareRes.data.timeline_data?.length || 0
        }
      });
      
      // Also set report data for canvas
      if (primaryRes.data.timeline_data?.length > 0) {
        setReportData(primaryRes.data);
        setHeatmapData({
          ...primaryRes.data,
          cameras: primaryRes.data.timeline_data[0]?.cameras || [],
          total_visitors: primaryRes.data.timeline_data[0]?.total_in || 0
        });
      }
      
      setViewMode('compare');
      setShowCompareOverlay(true);
      
      if (primaryRes.data.timeline_data?.length > 0 || compareRes.data.timeline_data?.length > 0) {
        toast.success('Karşılaştırma raporu oluşturuldu');
      } else {
        toast.warning('Yeterli veri bulunamadı');
      }
    } catch (e) {
      console.error('Failed to load compare data', e);
      toast.error('Karşılaştırma verisi yüklenemedi');
    } finally {
      setGeneratingReport(false);
    }
  };

  // Export heatmap as PDF
  const exportToPDF = async () => {
    if (!canvasRef.current || !heatmapData) {
      toast.error('Önce bir rapor oluşturun');
      return;
    }
    
    try {
      setLoading(true);
      toast.info('PDF raporu oluşturuluyor...');
      
      const canvas = canvasRef.current;
      const canvasImage = canvas.toDataURL('image/png');
      
      const response = await heatmapApi.exportPdf({
        store_id: heatmapData.store_id,
        floor_id: heatmapData.floor_id,
        date_from: dateFrom,
        date_to: dateTo,
        canvas_image: canvasImage
      });
      
      if (response.data.status === 'success' && response.data.pdf_base64) {
        const byteCharacters = atob(response.data.pdf_base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = response.data.filename || `heatmap_report_${new Date().toISOString().slice(0,10)}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        toast.success('PDF raporu indirildi');
      } else {
        throw new Error('PDF oluşturulamadı');
      }
    } catch (e) {
      console.error('Export failed', e);
      toast.error('PDF dışa aktarma başarısız: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  // Handle floor selection
  const handleFloorSelect = (floor) => {
    setShowAllFloors(false);
    setSelectedFloor(floor);
    setReportData(null);
    setHeatmapData(null);
    setCompareData(null);
    setCurrentTimeIndex(0);
  };

  // Load all floors data for multi-floor view
  const loadAllFloorsData = async (storeId) => {
    const store = storesWithFloors.find(s => s.store_id === storeId);
    if (!store || store.floors.length === 0) return;
    
    setLoading(true);
    try {
      // Get latest snapshot for preview (one-time fetch, not live)
      const floorsData = await Promise.all(
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
      
      floorsData.sort((a, b) => a.floor_number - b.floor_number);
      setMultiFloorData(floorsData);
    } catch (e) {
      console.error('Failed to load all floors', e);
      toast.error('Katlar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  // Toggle all floors view
  const toggleAllFloorsView = () => {
    if (!showAllFloors && selectedStore) {
      loadAllFloorsData(selectedStore);
    }
    setShowAllFloors(!showAllFloors);
    if (!showAllFloors) {
      setSelectedFloor(null);
      setHeatmapData(null);
      setReportData(null);
    }
  };

  // Smooth color gradient for heatmap
  const getHeatColorSmooth = (value, opacityMultiplier = 1) => {
    const stops = [
      { pos: 0, r: 0, g: 0, b: 180, a: 0.15 },
      { pos: 0.1, r: 0, g: 60, b: 255, a: 0.25 },
      { pos: 0.2, r: 0, g: 180, b: 255, a: 0.35 },
      { pos: 0.3, r: 0, g: 255, b: 200, a: 0.45 },
      { pos: 0.4, r: 50, g: 255, b: 100, a: 0.5 },
      { pos: 0.5, r: 150, g: 255, b: 0, a: 0.55 },
      { pos: 0.6, r: 255, g: 230, b: 0, a: 0.6 },
      { pos: 0.7, r: 255, g: 180, b: 0, a: 0.65 },
      { pos: 0.8, r: 255, g: 100, b: 0, a: 0.7 },
      { pos: 0.9, r: 255, g: 50, b: 0, a: 0.75 },
      { pos: 1, r: 255, g: 0, b: 0, a: 0.8 }
    ];
    
    let lower = stops[0];
    let upper = stops[stops.length - 1];
    
    for (let i = 0; i < stops.length - 1; i++) {
      if (value >= stops[i].pos && value <= stops[i + 1].pos) {
        lower = stops[i];
        upper = stops[i + 1];
        break;
      }
    }
    
    const range = upper.pos - lower.pos;
    const t = range > 0 ? (value - lower.pos) / range : 0;
    const smoothT = t * t * (3 - 2 * t);
    
    const r = Math.round(lower.r + (upper.r - lower.r) * smoothT);
    const g = Math.round(lower.g + (upper.g - lower.g) * smoothT);
    const b = Math.round(lower.b + (upper.b - lower.b) * smoothT);
    const a = (lower.a + (upper.a - lower.a) * smoothT) * opacityMultiplier;
    
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  // Canvas drawing
  const drawHeatmap = useCallback(() => {
    if (!canvasRef.current || !heatmapData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    const containerWidth = canvas.parentElement?.clientWidth || 800;
    const aspectRatio = heatmapData.height_meters / heatmapData.width_meters;
    canvas.width = containerWidth;
    canvas.height = containerWidth * aspectRatio;
    
    ctx.fillStyle = '#0f0f1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const scale = canvas.width / heatmapData.width_meters;
    
    // Draw floor plan image if available
    if (heatmapData.plan_image_data) {
      const img = new Image();
      img.onload = () => {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        ctx.globalAlpha = 1;
        if (showZoneBorders) drawZones(ctx, scale);
        drawHeatmapOverlay(ctx, scale);
        if (showHotspots) drawHotspotsOnCanvas(ctx, scale);
        if (showFlowArrows) drawFlowArrowsOnCanvas(ctx, scale);
        drawCameras(ctx, scale);
        drawLegend(ctx);
      };
      img.src = heatmapData.plan_image_data;
    } else {
      drawGrid(ctx, scale);
      if (showZoneBorders) drawZones(ctx, scale);
      drawHeatmapOverlay(ctx, scale);
      if (showHotspots) drawHotspotsOnCanvas(ctx, scale);
      if (showFlowArrows) drawFlowArrowsOnCanvas(ctx, scale);
      drawCameras(ctx, scale);
      drawLegend(ctx);
    }
  }, [heatmapData, heatmapOpacity, showHotspots, showFlowArrows, showCameraLabels, useZoneMask, showZoneBorders]);

  // Draw zone boundaries
  const drawZones = (ctx, scale) => {
    if (!heatmapData.zones || heatmapData.zones.length === 0) return;
    
    heatmapData.zones.forEach(zone => {
      if (!zone.points || zone.points.length < 3) return;
      
      ctx.beginPath();
      ctx.moveTo(zone.points[0].x * scale, zone.points[0].y * scale);
      for (let i = 1; i < zone.points.length; i++) {
        ctx.lineTo(zone.points[i].x * scale, zone.points[i].y * scale);
      }
      ctx.closePath();
      
      ctx.fillStyle = zone.type === 'corridor' 
        ? 'rgba(59, 130, 246, 0.1)' 
        : zone.type === 'plaza' 
          ? 'rgba(34, 197, 94, 0.1)'
          : 'rgba(156, 163, 175, 0.1)';
      ctx.fill();
      
      ctx.strokeStyle = zone.color || '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      const centerX = zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length * scale;
      const centerY = zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length * scale;
      
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.font = 'bold 10px Arial';
      const text = zone.name;
      const textWidth = ctx.measureText(text).width;
      ctx.fillRect(centerX - textWidth/2 - 4, centerY - 8, textWidth + 8, 16);
      ctx.fillStyle = zone.color || '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, centerX, centerY);
    });
  };

  const drawGrid = (ctx, scale) => {
    const gridSize = heatmapData.grid_size || 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    
    for (let x = 0; x <= heatmapData.width_meters; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x * scale, 0);
      ctx.lineTo(x * scale, heatmapData.height_meters * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= heatmapData.height_meters; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y * scale);
      ctx.lineTo(heatmapData.width_meters * scale, y * scale);
      ctx.stroke();
    }
    
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, heatmapData.width_meters * scale, heatmapData.height_meters * scale);
  };

  const drawHeatmapOverlay = (ctx, scale) => {
    if (!heatmapData.cameras || heatmapData.cameras.length === 0) return;
    
    const width = heatmapData.width_meters;
    const height = heatmapData.height_meters;
    
    const resolution = 0.3;
    const heatWidth = Math.ceil(width / resolution);
    const heatHeight = Math.ceil(height / resolution);
    
    const isPointInZone = (px, py, zones) => {
      if (!zones || zones.length === 0 || !useZoneMask) return true;
      
      for (const zone of zones) {
        if (!zone.show_heatmap || !zone.points || zone.points.length < 3) continue;
        
        let inside = false;
        const points = zone.points;
        for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
          const xi = points[i].x, yi = points[i].y;
          const xj = points[j].x, yj = points[j].y;
          
          if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
            inside = !inside;
          }
        }
        if (inside) return true;
      }
      return false;
    };
    
    let heatGrid = Array(heatHeight).fill(null).map(() => Array(heatWidth).fill(0));
    let maxHeat = 0;
    const sigma = 4;
    
    heatmapData.cameras.forEach(cam => {
      const camX = cam.position_x;
      const camY = cam.position_y;
      const radius = (cam.influence_radius || 5) * 2;
      const count = cam.current_count || cam.in_count || 1;
      const direction = (cam.direction || 0) * Math.PI / 180;
      const fov = (cam.fov_angle || 90) * Math.PI / 180;
      const intensity = Math.max(1, count) * 15;
      
      for (let py = 0; py < heatHeight; py++) {
        for (let px = 0; px < heatWidth; px++) {
          const worldX = px * resolution;
          const worldY = py * resolution;
          
          if (useZoneMask && !isPointInZone(worldX, worldY, heatmapData.zones)) {
            continue;
          }
          
          const dx = worldX - camX;
          const dy = worldY - camY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          
          if (dist <= radius * 1.5) {
            const angle = Math.atan2(dy, dx);
            let angleDiff = Math.abs(angle - direction);
            if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
            
            const halfFov = fov / 2;
            let fovFactor;
            if (angleDiff <= halfFov) {
              fovFactor = 1.0;
            } else if (angleDiff <= halfFov + Math.PI/6) {
              fovFactor = Math.cos((angleDiff - halfFov) * 3);
              fovFactor = Math.max(0, fovFactor);
            } else {
              fovFactor = 0;
            }
            
            if (fovFactor > 0) {
              const normalizedDist = dist / radius;
              const gaussianDecay = Math.exp(-(normalizedDist * normalizedDist) * sigma);
              const heat = intensity * gaussianDecay * fovFactor;
              heatGrid[py][px] += heat;
              maxHeat = Math.max(maxHeat, heatGrid[py][px]);
            }
          }
        }
      }
    });
    
    // Apply Gaussian blur
    const blurKernel = [
      [1/16, 2/16, 1/16],
      [2/16, 4/16, 2/16],
      [1/16, 2/16, 1/16]
    ];
    
    for (let pass = 0; pass < 4; pass++) {
      const blurredGrid = Array(heatHeight).fill(null).map(() => Array(heatWidth).fill(0));
      
      for (let y = 1; y < heatHeight - 1; y++) {
        for (let x = 1; x < heatWidth - 1; x++) {
          let sum = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              sum += heatGrid[y + ky][x + kx] * blurKernel[ky + 1][kx + 1];
            }
          }
          blurredGrid[y][x] = sum;
        }
      }
      heatGrid = blurredGrid;
    }
    
    // Render heat map
    if (maxHeat > 0) {
      const pixelScale = scale * resolution;
      const opacityMultiplier = heatmapOpacity / 100;
      
      for (let y = 0; y < heatHeight; y++) {
        for (let x = 0; x < heatWidth; x++) {
          const heat = heatGrid[y][x];
          if (heat > 0.005 * maxHeat) {
            const normalizedHeat = Math.pow(Math.min(1, heat / maxHeat), 0.7);
            const color = getHeatColorSmooth(normalizedHeat, opacityMultiplier);
            ctx.fillStyle = color;
            ctx.fillRect(
              x * pixelScale,
              y * pixelScale,
              pixelScale + 0.5,
              pixelScale + 0.5
            );
          }
        }
      }
    }
    
    // Store heat grid for hotspot detection
    if (typeof window !== 'undefined') {
      window._lastHeatGrid = { grid: heatGrid, maxHeat, resolution, width, height };
    }
  };

  // Draw hotspots
  const drawHotspotsOnCanvas = (ctx, scale) => {
    if (!window._lastHeatGrid) return;
    
    const { grid, maxHeat, resolution } = window._lastHeatGrid;
    if (!grid || maxHeat === 0) return;
    
    const threshold = maxHeat * 0.6;
    const hotspots = [];
    
    for (let y = 2; y < grid.length - 2; y++) {
      for (let x = 2; x < grid[0].length - 2; x++) {
        const val = grid[y][x];
        if (val > threshold) {
          let isMax = true;
          for (let dy = -2; dy <= 2 && isMax; dy++) {
            for (let dx = -2; dx <= 2 && isMax; dx++) {
              if (dx === 0 && dy === 0) continue;
              if (grid[y + dy][x + dx] > val) isMax = false;
            }
          }
          if (isMax) {
            hotspots.push({
              x: x * resolution,
              y: y * resolution,
              intensity: val / maxHeat
            });
          }
        }
      }
    }
    
    hotspots.forEach((spot, idx) => {
      const px = spot.x * scale;
      const py = spot.y * scale;
      const size = 20 + spot.intensity * 15;
      
      ctx.strokeStyle = `rgba(255, 50, 50, 0.8)`;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = 'rgba(255, 50, 50, 0.9)';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`#${idx + 1}`, px, py - size - 5);
      
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '10px sans-serif';
      ctx.fillText(`${Math.round(spot.intensity * 100)}%`, px, py + 4);
    });
  };

  // Draw flow arrows
  const drawFlowArrowsOnCanvas = (ctx, scale) => {
    if (!heatmapData.cameras || heatmapData.cameras.length < 2) return;
    
    const cams = heatmapData.cameras;
    
    for (let i = 0; i < cams.length; i++) {
      const cam = cams[i];
      const count = cam.current_count || cam.in_count || 0;
      if (count === 0) continue;
      
      const x = cam.position_x * scale;
      const y = cam.position_y * scale;
      const direction = (cam.direction || 0) * Math.PI / 180;
      const flowLength = 30 + count * 5;
      
      const endX = x + Math.cos(direction) * flowLength;
      const endY = y + Math.sin(direction) * flowLength;
      
      const gradient = ctx.createLinearGradient(x, y, endX, endY);
      gradient.addColorStop(0, 'rgba(100, 200, 255, 0.3)');
      gradient.addColorStop(1, 'rgba(100, 200, 255, 0.8)');
      
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(direction) * 20, y + Math.sin(direction) * 20);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      
      const headSize = 8;
      const headAngle = Math.PI / 6;
      ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
      ctx.beginPath();
      ctx.moveTo(endX, endY);
      ctx.lineTo(
        endX - headSize * Math.cos(direction - headAngle),
        endY - headSize * Math.sin(direction - headAngle)
      );
      ctx.lineTo(
        endX - headSize * Math.cos(direction + headAngle),
        endY - headSize * Math.sin(direction + headAngle)
      );
      ctx.closePath();
      ctx.fill();
      
      if (count > 0) {
        const labelX = x + Math.cos(direction) * (flowLength / 2 + 10);
        const labelY = y + Math.sin(direction) * (flowLength / 2 + 10);
        ctx.fillStyle = 'rgba(100, 200, 255, 0.9)';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${count}`, labelX, labelY);
      }
    }
  };

  const drawCameras = (ctx, scale) => {
    if (!heatmapData.cameras) return;
    
    heatmapData.cameras.forEach(cam => {
      const x = cam.position_x * scale;
      const y = cam.position_y * scale;
      const direction = (cam.direction || 0) * Math.PI / 180;
      const count = cam.current_count || cam.in_count || 0;
      
      ctx.shadowColor = '#4a9eff';
      ctx.shadowBlur = 10;
      ctx.fillStyle = '#4a9eff';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(direction) * 18, y + Math.sin(direction) * 18);
      ctx.stroke();
      
      if (showCameraLabels && cam.name) {
        const label = cam.name.length > 12 ? cam.name.substring(0, 12) + '..' : cam.name;
        const labelWithCount = count > 0 ? `${label} (${count})` : label;
        
        ctx.font = 'bold 11px Arial, sans-serif';
        const textWidth = ctx.measureText(labelWithCount).width;
        const padding = 6;
        const boxWidth = textWidth + padding * 2;
        const boxHeight = 18;
        const boxX = x + 15;
        const boxY = y - boxHeight / 2;
        
        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.beginPath();
        ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 4);
        ctx.fill();
        
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
        
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelWithCount, boxX + padding, y);
      }
    });
  };

  const drawLegend = (ctx) => {
    const legendWidth = 120;
    const legendHeight = 20;
    const x = ctx.canvas.width - legendWidth - 20;
    const y = 20;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 10, y - 25, legendWidth + 20, legendHeight + 50);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText('Yoğunluk', x, y - 5);
    
    const gradient = ctx.createLinearGradient(x, y, x + legendWidth, y);
    gradient.addColorStop(0, 'rgba(0, 0, 255, 0.5)');
    gradient.addColorStop(0.33, 'rgba(0, 255, 255, 0.6)');
    gradient.addColorStop(0.66, 'rgba(255, 255, 0, 0.7)');
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0.8)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, legendWidth, legendHeight);
    
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px sans-serif';
    ctx.fillText('Az', x, y + legendHeight + 12);
    ctx.fillText('Çok', x + legendWidth - 15, y + legendHeight + 12);
    
    // Show report mode indicator
    if (reportData) {
      ctx.fillStyle = 'rgba(59, 130, 246, 0.9)';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText('RAPOR MODU', x, y + legendHeight + 30);
    }
  };

  // Draw comparison heatmaps
  const drawComparisonHeatmaps = useCallback(() => {
    if (!compareData?.primary || !compareData?.compare) return;
    if (!compareCanvasLeftRef.current || !compareCanvasRightRef.current) return;
    
    const floor = heatmapData || compareData.primary;
    if (!floor) return;
    
    const drawOnCanvas = (canvasRef, timelineData, label, color) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      
      const ctx = canvas.getContext('2d');
      const containerWidth = canvas.parentElement?.clientWidth || 400;
      const aspectRatio = (floor.height_meters || 12) / (floor.width_meters || 40);
      canvas.width = containerWidth - 16;
      canvas.height = (containerWidth - 16) * aspectRatio;
      
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const scale = canvas.width / (floor.width_meters || 40);
      const width = floor.width_meters || 40;
      const height = floor.height_meters || 12;
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 0.5;
      const gridSize = floor.grid_size || 1;
      for (let x = 0; x <= width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x * scale, 0);
        ctx.lineTo(x * scale, height * scale);
        ctx.stroke();
      }
      for (let y = 0; y <= height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y * scale);
        ctx.lineTo(width * scale, y * scale);
        ctx.stroke();
      }
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, width * scale, height * scale);
      
      if (!timelineData || timelineData.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Veri yok', canvas.width/2, canvas.height/2);
        return null;
      }
      
      // Aggregate camera data from timeline
      const cameraAggregates = {};
      timelineData.forEach(frame => {
        (frame.cameras || []).forEach(cam => {
          const id = cam.camera_id || cam.camera_vms_id;
          if (!cameraAggregates[id]) {
            cameraAggregates[id] = { ...cam, total_count: 0, samples: 0 };
          }
          cameraAggregates[id].total_count += (cam.in_count || cam.current_count || 0);
          cameraAggregates[id].samples += 1;
        });
      });
      
      const cameras = Object.values(cameraAggregates).map(cam => ({
        ...cam,
        current_count: Math.round(cam.total_count / cam.samples)
      }));
      
      // Draw heatmap
      const resolution = 0.5;
      const heatWidth = Math.ceil(width / resolution);
      const heatHeight = Math.ceil(height / resolution);
      let heatGrid = Array(heatHeight).fill(null).map(() => Array(heatWidth).fill(0));
      let maxHeat = 0;
      const sigma = 4;
      
      cameras.forEach(cam => {
        const camX = cam.position_x || 0;
        const camY = cam.position_y || 0;
        const radius = (cam.influence_radius || 5) * 2;
        const count = cam.current_count || 1;
        const direction = (cam.direction || 0) * Math.PI / 180;
        const fov = (cam.fov_angle || 90) * Math.PI / 180;
        const intensity = Math.max(1, count) * 15;
        
        for (let py = 0; py < heatHeight; py++) {
          for (let px = 0; px < heatWidth; px++) {
            const worldX = px * resolution;
            const worldY = py * resolution;
            const dx = worldX - camX;
            const dy = worldY - camY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            
            if (dist <= radius * 1.5) {
              const angle = Math.atan2(dy, dx);
              let angleDiff = Math.abs(angle - direction);
              if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
              
              const halfFov = fov / 2;
              let fovFactor = angleDiff <= halfFov ? 1.0 : 
                angleDiff <= halfFov + Math.PI/6 ? Math.max(0, Math.cos((angleDiff - halfFov) * 3)) : 0;
              
              if (fovFactor > 0) {
                const normalizedDist = dist / radius;
                const gaussianDecay = Math.exp(-(normalizedDist * normalizedDist) * sigma);
                const heat = intensity * gaussianDecay * fovFactor;
                heatGrid[py][px] += heat;
                maxHeat = Math.max(maxHeat, heatGrid[py][px]);
              }
            }
          }
        }
      });
      
      // Blur
      const blurKernel = [[1/16,2/16,1/16],[2/16,4/16,2/16],[1/16,2/16,1/16]];
      for (let pass = 0; pass < 3; pass++) {
        const blurred = Array(heatHeight).fill(null).map(() => Array(heatWidth).fill(0));
        for (let y = 1; y < heatHeight - 1; y++) {
          for (let x = 1; x < heatWidth - 1; x++) {
            let sum = 0;
            for (let ky = -1; ky <= 1; ky++) {
              for (let kx = -1; kx <= 1; kx++) {
                sum += heatGrid[y + ky][x + kx] * blurKernel[ky + 1][kx + 1];
              }
            }
            blurred[y][x] = sum;
          }
        }
        heatGrid = blurred;
      }
      
      // Render
      if (maxHeat > 0) {
        const pixelScale = scale * resolution;
        for (let y = 0; y < heatHeight; y++) {
          for (let x = 0; x < heatWidth; x++) {
            const heat = heatGrid[y][x];
            if (heat > 0.005 * maxHeat) {
              const normalizedHeat = Math.pow(Math.min(1, heat / maxHeat), 0.7);
              ctx.fillStyle = getHeatColorSmooth(normalizedHeat, 0.7);
              ctx.fillRect(x * pixelScale, y * pixelScale, pixelScale + 0.5, pixelScale + 0.5);
            }
          }
        }
      }
      
      // Draw cameras
      cameras.forEach(cam => {
        const x = (cam.position_x || 0) * scale;
        const y = (cam.position_y || 0) * scale;
        ctx.fillStyle = '#4a9eff';
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      });
      
      return heatGrid;
    };
    
    const primaryGrid = drawOnCanvas(compareCanvasLeftRef, compareData.primary.timeline_data, 'SEÇİLEN DÖNEM', 'rgba(59, 130, 246, 0.8)');
    const compareGrid = drawOnCanvas(compareCanvasRightRef, compareData.compare.timeline_data, 'KARŞILAŞTIRMA', 'rgba(168, 85, 247, 0.8)');
    
    // Draw difference map
    if (showCompareOverlay && diffCanvasRef.current && primaryGrid && compareGrid) {
      const canvas = diffCanvasRef.current;
      const ctx = canvas.getContext('2d');
      const floor = heatmapData || compareData.primary;
      const containerWidth = canvas.parentElement?.clientWidth || 800;
      const aspectRatio = (floor.height_meters || 12) / (floor.width_meters || 40);
      canvas.width = containerWidth - 32;
      canvas.height = (containerWidth - 32) * aspectRatio;
      
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      const scale = canvas.width / (floor.width_meters || 40);
      const resolution = 0.5;
      const heatWidth = primaryGrid[0]?.length || 0;
      const heatHeight = primaryGrid.length || 0;
      
      // Draw grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 0.5;
      const gridSize = floor.grid_size || 1;
      for (let x = 0; x <= (floor.width_meters || 40); x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x * scale, 0);
        ctx.lineTo(x * scale, (floor.height_meters || 12) * scale);
        ctx.stroke();
      }
      for (let y = 0; y <= (floor.height_meters || 12); y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y * scale);
        ctx.lineTo((floor.width_meters || 40) * scale, y * scale);
        ctx.stroke();
      }
      
      const pixelScale = scale * resolution;
      let maxDiff = 0;
      
      for (let y = 0; y < heatHeight; y++) {
        for (let x = 0; x < heatWidth; x++) {
          const diff = Math.abs((primaryGrid[y]?.[x] || 0) - (compareGrid[y]?.[x] || 0));
          maxDiff = Math.max(maxDiff, diff);
        }
      }
      
      if (maxDiff > 0) {
        for (let y = 0; y < heatHeight; y++) {
          for (let x = 0; x < heatWidth; x++) {
            const primaryVal = primaryGrid[y]?.[x] || 0;
            const compareVal = compareGrid[y]?.[x] || 0;
            const diff = primaryVal - compareVal;
            
            if (Math.abs(diff) > 0.01 * maxDiff) {
              const normalizedDiff = Math.min(1, Math.abs(diff) / maxDiff);
              const alpha = 0.3 + normalizedDiff * 0.5;
              
              if (diff > 0) {
                ctx.fillStyle = `rgba(34, 197, 94, ${alpha})`;
              } else {
                ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
              }
              ctx.fillRect(x * pixelScale, y * pixelScale, pixelScale + 0.5, pixelScale + 0.5);
            }
          }
        }
      }
      
      ctx.strokeStyle = 'rgba(234, 179, 8, 0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, (floor.width_meters || 40) * scale, (floor.height_meters || 12) * scale);
      
      // Legend
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(canvas.width - 150, 10, 140, 50);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.8)';
      ctx.fillRect(canvas.width - 140, 20, 20, 12);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText('Seçilen dönem daha yoğun', canvas.width - 115, 30);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
      ctx.fillRect(canvas.width - 140, 38, 20, 12);
      ctx.fillStyle = '#fff';
      ctx.fillText('Karşılaştırma dönemi daha yoğun', canvas.width - 115, 48);
    }
    
  }, [compareData, showCompareOverlay, heatmapData, getHeatColorSmooth]);

  // Effect for comparison mode
  useEffect(() => {
    if (viewMode === 'compare' && compareData) {
      setTimeout(drawComparisonHeatmaps, 100);
    }
  }, [viewMode, compareData, showCompareOverlay, drawComparisonHeatmaps]);

  // Draw simulation frame based on timeline index
  const drawReportFrame = useCallback(() => {
    if (!canvasRef.current || !reportData) return;
    if (!reportData.timeline_data || reportData.timeline_data.length === 0) return;
    
    const frameData = reportData.timeline_data[currentTimeIndex];
    if (!frameData) return;
    
    const frameHeatmapData = {
      ...reportData,
      cameras: frameData.cameras,
      total_visitors: frameData.total_in,
      timestamp: frameData.timestamp
    };
    
    setHeatmapData(frameHeatmapData);
  }, [reportData, currentTimeIndex]);

  useEffect(() => {
    if (viewMode === 'report' && reportData) {
      drawReportFrame();
    }
  }, [currentTimeIndex, viewMode, reportData, drawReportFrame]);

  useEffect(() => {
    if (heatmapData && viewMode !== 'compare') {
      drawHeatmap();
    }
  }, [heatmapData, drawHeatmap, viewMode]);

  // Playback controls for report timeline
  useEffect(() => {
    if (isPlaying && viewMode === 'report' && reportData?.timeline_data?.length > 0) {
      playIntervalRef.current = setInterval(() => {
        setCurrentTimeIndex(prev => {
          if (prev >= reportData.timeline_data.length - 1) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000 / playbackSpeed);
    }
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, viewMode, reportData]);

  const togglePlay = () => setIsPlaying(!isPlaying);
  const skipBack = () => {
    setCurrentTimeIndex(Math.max(0, currentTimeIndex - 1));
  };
  const skipForward = () => {
    const maxIndex = reportData?.timeline_data?.length - 1 || 0;
    setCurrentTimeIndex(Math.min(maxIndex, currentTimeIndex + 1));
  };
  const skipToStart = () => setCurrentTimeIndex(0);
  const skipToEnd = () => {
    const maxIndex = reportData?.timeline_data?.length - 1 || 0;
    setCurrentTimeIndex(maxIndex);
  };

  // Get current timestamp for display
  const getCurrentTimestamp = () => {
    if (reportData?.timeline_data?.[currentTimeIndex]) {
      return new Date(reportData.timeline_data[currentTimeIndex].timestamp).toLocaleString('tr-TR');
    }
    if (heatmapData?.timestamp) {
      return new Date(heatmapData.timestamp).toLocaleString('tr-TR');
    }
    return '-';
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <ThermometerSun className="w-6 h-6 text-primary" />
              Isı Haritası Raporu
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Talep bazlı yoğunluk analizi ve raporlama
            </p>
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={selectedRegion || "all"} onValueChange={(v) => { setSelectedRegion(v === "all" ? "" : v); setSelectedCity(''); setSelectedDistrict(''); }}>
              <SelectTrigger className="w-[140px] bg-secondary/50 border-white/10">
                <SelectValue placeholder="Bölge" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm Bölgeler</SelectItem>
                {regions.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedCity || "all"} onValueChange={(v) => { setSelectedCity(v === "all" ? "" : v); setSelectedDistrict(''); }}>
              <SelectTrigger className="w-[140px] bg-secondary/50 border-white/10">
                <SelectValue placeholder="İl" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm İller</SelectItem>
                {cities.filter(c => !selectedRegion || c.region_id === selectedRegion).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedDistrict || "all"} onValueChange={(v) => setSelectedDistrict(v === "all" ? "" : v)}>
              <SelectTrigger className="w-[140px] bg-secondary/50 border-white/10">
                <SelectValue placeholder="İlçe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tüm İlçeler</SelectItem>
                {districts.filter(d => !selectedCity || d.city_id === selectedCity).map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="page-content">
        {loading && !selectedFloor ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground">Yükleniyor...</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-6">
            {/* Store/Floor Selection Panel */}
            <div className="col-span-1 space-y-4">
              <div className="bg-card border border-white/10 rounded-lg p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" />
                  Mağaza ve Kat Seçimi
                </h3>
                
                {filteredStores.length > 0 ? (
                  <div className="space-y-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                    {filteredStores.map(store => (
                      <div key={store.store_id} className="border border-white/10 rounded-lg overflow-hidden">
                        <div 
                          className="p-3 bg-secondary/30 cursor-pointer flex items-center justify-between"
                          onClick={() => setSelectedStore(selectedStore === store.store_id ? '' : store.store_id)}
                        >
                          <div>
                            <div className="font-medium text-sm">{store.store_name}</div>
                            <div className="text-xs text-muted-foreground">
                              {store.city_name}, {store.district_name}
                            </div>
                          </div>
                          {selectedStore === store.store_id ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </div>
                        
                        {selectedStore === store.store_id && (
                          <div className="p-2 space-y-1">
                            {store.floors.length > 1 && (
                              <Button
                                variant={showAllFloors ? 'default' : 'outline'}
                                size="sm"
                                className="w-full justify-start mb-2 border-primary/30"
                                onClick={toggleAllFloorsView}
                              >
                                <Layers className="w-4 h-4 mr-2" />
                                Tüm Katları Göster ({store.floors.length})
                              </Button>
                            )}
                            
                            {store.floors.map(floor => (
                              <Button
                                key={floor.floor_id}
                                variant={selectedFloor?.floor_id === floor.floor_id ? 'default' : 'ghost'}
                                size="sm"
                                className="w-full justify-start"
                                onClick={() => handleFloorSelect(floor)}
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
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Layers className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Kat planı olan mağaza bulunamadı.</p>
                    <p className="text-xs mt-1">Kat Planları sayfasından ekleyebilirsiniz.</p>
                  </div>
                )}
              </div>

              {/* Report Stats */}
              {reportData && (
                <div className="bg-card border border-white/10 rounded-lg p-4">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-primary" />
                    Rapor Özeti
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Veri Noktası:</span>
                      <span className="font-semibold">{reportData.timeline_data?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Kamera Sayısı:</span>
                      <span className="font-semibold">{heatmapData?.cameras?.length || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Toplam Ziyaretçi:</span>
                      <span className="font-semibold">
                        {reportData.timeline_data?.reduce((sum, t) => sum + (t.total_in || 0), 0) || 0}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Alan:</span>
                      <span className="font-semibold">{reportData.width_meters}x{reportData.height_meters}m</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Heatmap Settings Panel */}
              {heatmapData && (
                <div className="bg-card border border-white/10 rounded-lg p-4">
                  <div 
                    className="font-semibold mb-3 flex items-center justify-between cursor-pointer"
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-4 h-4 text-primary" />
                      Görselleştirme Ayarları
                    </div>
                    {showSettings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                  
                  {showSettings && (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs flex justify-between mb-2">
                          <span className="flex items-center gap-1">
                            <Eye className="w-3 h-3" />
                            Şeffaflık
                          </span>
                          <span className="text-muted-foreground">{heatmapOpacity}%</span>
                        </Label>
                        <Slider
                          value={[heatmapOpacity]}
                          onValueChange={([v]) => setHeatmapOpacity(v)}
                          min={10}
                          max={100}
                          step={5}
                        />
                      </div>
                      
                      <div className="space-y-3 pt-2 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs flex items-center gap-1 cursor-pointer">
                            <Target className="w-3 h-3 text-red-400" />
                            Sıcak Noktalar
                          </Label>
                          <Switch 
                            checked={showHotspots} 
                            onCheckedChange={setShowHotspots}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label className="text-xs flex items-center gap-1 cursor-pointer">
                            <ArrowRight className="w-3 h-3 text-cyan-400" />
                            Akış Okları
                          </Label>
                          <Switch 
                            checked={showFlowArrows} 
                            onCheckedChange={setShowFlowArrows}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between">
                          <Label className="text-xs flex items-center gap-1 cursor-pointer">
                            <Camera className="w-3 h-3 text-blue-400" />
                            Kamera Etiketleri
                          </Label>
                          <Switch 
                            checked={showCameraLabels} 
                            onCheckedChange={setShowCameraLabels}
                          />
                        </div>
                      </div>
                      
                      {heatmapData?.zones?.length > 0 && (
                        <div className="space-y-3 pt-2 border-t border-white/10">
                          <div className="text-xs text-muted-foreground font-medium">Bölge Maskeleme</div>
                          <div className="flex items-center justify-between">
                            <Label className="text-xs flex items-center gap-1 cursor-pointer">
                              <Layers className="w-3 h-3 text-green-400" />
                              Bölge Sınırları
                            </Label>
                            <Switch 
                              checked={showZoneBorders} 
                              onCheckedChange={setShowZoneBorders}
                            />
                          </div>
                          
                          <div className="flex items-center justify-between">
                            <Label className="text-xs flex items-center gap-1 cursor-pointer">
                              <MapPin className="w-3 h-3 text-yellow-400" />
                              Bölge Maskesi
                            </Label>
                            <Switch 
                              checked={useZoneMask} 
                              onCheckedChange={setUseZoneMask}
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
              )}
            </div>

            {/* Main Content Area */}
            <div className="col-span-3">
              {selectedFloor ? (
                <div className="space-y-4">
                  {/* Report Generation Form */}
                  <div className="bg-card border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold flex items-center gap-2">
                          <FileSearch className="w-5 h-5 text-primary" />
                          {selectedFloor.floor_name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {storesWithFloors.find(s => s.floors.some(f => f.floor_id === selectedFloor.floor_id))?.store_name}
                        </p>
                      </div>
                      
                      {reportData && (
                        <Button variant="outline" size="sm" onClick={exportToPDF} disabled={loading} className="border-white/10">
                          <Download className="w-4 h-4 mr-1" />
                          PDF Rapor
                        </Button>
                      )}
                    </div>
                    
                    {/* Report Generation Controls */}
                    <div className="bg-secondary/30 rounded-lg p-4 mb-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-medium text-sm">Rapor Oluştur</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Başlangıç Tarihi</Label>
                          <Input
                            type="datetime-local"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-9 text-sm bg-background/50 border-white/10"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Bitiş Tarihi</Label>
                          <Input
                            type="datetime-local"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-9 text-sm bg-background/50 border-white/10"
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <Button 
                          onClick={generateHeatmapReport} 
                          className="flex-1"
                          disabled={generatingReport}
                        >
                          {generatingReport ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Oluşturuluyor...
                            </>
                          ) : (
                            <>
                              <BarChart3 className="w-4 h-4 mr-2" />
                              Rapor Oluştur
                            </>
                          )}
                        </Button>
                        
                        <Button 
                          variant="outline" 
                          onClick={() => setViewMode(viewMode === 'compare' ? 'report' : 'compare')}
                          className="border-white/10"
                        >
                          <GitCompare className="w-4 h-4 mr-1" />
                          Karşılaştır
                        </Button>
                      </div>
                    </div>
                    
                    {/* Comparison Mode Controls */}
                    {viewMode === 'compare' && (
                      <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4 mb-4">
                        <div className="flex items-center gap-2 mb-3">
                          <GitCompare className="w-4 h-4 text-purple-400" />
                          <span className="font-medium text-sm">Dönem Karşılaştırması</span>
                        </div>
                        <p className="text-xs text-muted-foreground mb-3">
                          Yukarıdaki tarih aralığı ile karşılaştırma tarihini seçin.
                        </p>
                        <div className="flex gap-3">
                          <div className="flex-1">
                            <Label className="text-xs text-muted-foreground">Karşılaştırma Tarihi</Label>
                            <Input
                              type="date"
                              value={compareDate}
                              onChange={(e) => setCompareDate(e.target.value)}
                              className="h-9 text-sm bg-background/50 border-white/10"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button 
                              onClick={loadCompareData}
                              disabled={generatingReport}
                              className="bg-purple-600 hover:bg-purple-700"
                            >
                              {generatingReport ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <GitCompare className="w-4 h-4 mr-1" />
                                  Karşılaştır
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Comparison Stats */}
                        {compareData?.stats && (
                          <div className="grid grid-cols-3 gap-2 mt-4">
                            <div className="bg-blue-500/20 p-2 rounded text-center">
                              <div className="text-xs text-muted-foreground">Seçilen Dönem Ort.</div>
                              <div className="font-bold text-blue-400">{compareData.stats.primaryAvg} kişi</div>
                            </div>
                            <div className="bg-purple-500/20 p-2 rounded text-center">
                              <div className="text-xs text-muted-foreground">Karşılaştırma</div>
                              <div className="font-bold text-purple-400">{compareData.stats.compareAvg} kişi</div>
                            </div>
                            <div className={`p-2 rounded text-center ${
                              compareData.stats.percentChange > 0 
                                ? 'bg-green-500/20' 
                                : compareData.stats.percentChange < 0 
                                  ? 'bg-red-500/20' 
                                  : 'bg-gray-500/20'
                            }`}>
                              <div className="text-xs text-muted-foreground">Değişim</div>
                              <div className={`font-bold ${
                                compareData.stats.percentChange > 0 
                                  ? 'text-green-400' 
                                  : compareData.stats.percentChange < 0 
                                    ? 'text-red-400' 
                                    : 'text-gray-400'
                              }`}>
                                {compareData.stats.percentChange > 0 ? '+' : ''}{compareData.stats.percentChange}%
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Heatmap Display */}
                  {reportData ? (
                    <div className="bg-card border border-white/10 rounded-lg overflow-hidden">
                      {viewMode === 'compare' && compareData ? (
                        /* Comparison View */
                        <div className="p-4">
                          <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                              <div className="text-sm font-medium mb-2 text-blue-400 flex items-center gap-2">
                                <div className="w-2 h-2 bg-blue-400 rounded-full" />
                                Seçilen Dönem ({new Date(dateFrom).toLocaleDateString('tr-TR')} - {new Date(dateTo).toLocaleDateString('tr-TR')})
                              </div>
                              <canvas ref={compareCanvasLeftRef} className="w-full rounded-lg border border-blue-500/30" />
                            </div>
                            <div>
                              <div className="text-sm font-medium mb-2 text-purple-400 flex items-center gap-2">
                                <div className="w-2 h-2 bg-purple-400 rounded-full" />
                                Karşılaştırma ({new Date(compareDate).toLocaleDateString('tr-TR')})
                              </div>
                              <canvas ref={compareCanvasRightRef} className="w-full rounded-lg border border-purple-500/30" />
                            </div>
                          </div>
                          
                          {/* Difference Map */}
                          <div className="flex items-center justify-between mb-2">
                            <div className="text-sm font-medium text-yellow-400 flex items-center gap-2">
                              <div className="w-2 h-2 bg-yellow-400 rounded-full" />
                              Fark Haritası
                            </div>
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">Overlay</Label>
                              <Switch 
                                checked={showCompareOverlay} 
                                onCheckedChange={setShowCompareOverlay}
                              />
                            </div>
                          </div>
                          <canvas ref={diffCanvasRef} className="w-full rounded-lg border border-yellow-500/30" />
                        </div>
                      ) : (
                        /* Normal Report View */
                        <>
                          <div className="p-3 border-b border-white/10 flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">
                              {new Date(dateFrom).toLocaleDateString('tr-TR')} - {new Date(dateTo).toLocaleDateString('tr-TR')}
                            </span>
                            <span className="text-xs text-blue-400 font-medium flex items-center gap-1">
                              <div className="w-2 h-2 bg-blue-400 rounded-full" />
                              RAPOR MODU
                            </span>
                          </div>
                          
                          <div className="p-4">
                            <canvas ref={canvasRef} className="w-full rounded-lg" />
                          </div>
                          
                          {/* Timeline Controls */}
                          {reportData.timeline_data?.length > 1 && (
                            <div className="p-4 border-t border-white/10 bg-secondary/20">
                              <div className="flex items-center gap-2 mb-3">
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Zaman: {getCurrentTimestamp()}
                                </span>
                                <span className="text-xs text-muted-foreground ml-auto">
                                  Frame: {currentTimeIndex + 1} / {reportData.timeline_data.length}
                                </span>
                              </div>
                              
                              {/* Timeline Slider */}
                              <Slider
                                value={[currentTimeIndex]}
                                onValueChange={([v]) => setCurrentTimeIndex(v)}
                                min={0}
                                max={reportData.timeline_data.length - 1}
                                step={1}
                                className="mb-3"
                              />
                              
                              {/* Playback Controls */}
                              <div className="flex items-center justify-center gap-2">
                                <Button variant="outline" size="icon" onClick={skipToStart} className="h-8 w-8 border-white/10">
                                  <Rewind className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={skipBack} className="h-8 w-8 border-white/10">
                                  <SkipBack className="w-4 h-4" />
                                </Button>
                                <Button 
                                  onClick={togglePlay} 
                                  className="h-10 w-10 rounded-full"
                                >
                                  {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                                </Button>
                                <Button variant="outline" size="icon" onClick={skipForward} className="h-8 w-8 border-white/10">
                                  <SkipForward className="w-4 h-4" />
                                </Button>
                                <Button variant="outline" size="icon" onClick={skipToEnd} className="h-8 w-8 border-white/10">
                                  <FastForward className="w-4 h-4" />
                                </Button>
                                
                                <div className="ml-4 flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">Hız:</span>
                                  <Select value={String(playbackSpeed)} onValueChange={(v) => setPlaybackSpeed(Number(v))}>
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
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="bg-card border border-white/10 rounded-lg p-16 text-center">
                      <FileSearch className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                      <h3 className="font-semibold text-lg mb-2">Rapor Oluşturun</h3>
                      <p className="text-muted-foreground text-sm max-w-md mx-auto">
                        Yukarıdaki tarih aralığını seçerek "Rapor Oluştur" butonuna tıklayın.
                        Sistem, seçilen dönem için ısı haritası analizi yapacaktır.
                      </p>
                      <div className="flex items-center justify-center gap-4 mt-6 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <BarChart3 className="w-3 h-3" />
                          Yoğunluk analizi
                        </span>
                        <span className="flex items-center gap-1">
                          <GitCompare className="w-3 h-3" />
                          Dönem karşılaştırması
                        </span>
                        <span className="flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          PDF rapor
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-card border border-white/10 rounded-lg p-16 text-center">
                  <ThermometerSun className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
                  <h3 className="font-semibold text-lg mb-2">Kat Seçin</h3>
                  <p className="text-muted-foreground">
                    Sol panelden mağaza ve kat seçerek rapor oluşturabilirsiniz.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Multi-floor View */}
        {showAllFloors && selectedStore && (
          <div className="mt-6 border-t border-white/10 pt-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Tüm Katlar - {storesWithFloors.find(s => s.store_id === selectedStore)?.store_name}
              </h3>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => loadAllFloorsData(selectedStore)}
                className="border-white/10"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Yenile
              </Button>
            </div>
            
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {multiFloorData.length > 0 ? multiFloorData.map(floorData => (
                  <div 
                    key={floorData.floor_id}
                    className="bg-card border border-white/10 rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group"
                    onClick={() => {
                      const floor = storesWithFloors.find(s => s.store_id === selectedStore)?.floors.find(f => f.floor_id === floorData.floor_id);
                      if (floor) handleFloorSelect(floor);
                    }}
                  >
                    <div className="p-3 border-b border-white/10 bg-secondary/30">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-medium text-sm">{floorData.floor_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            Kat {floorData.floor_number >= 0 ? floorData.floor_number : `B${Math.abs(floorData.floor_number)}`}
                          </span>
                        </div>
                        {floorData.plan_image_data && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                      </div>
                    </div>
                    
                    <div className="p-3">
                      {floorData.error ? (
                        <div className="h-28 bg-secondary/20 rounded flex items-center justify-center">
                          <span className="text-xs text-muted-foreground">Veri yüklenemedi</span>
                        </div>
                      ) : floorData.cameras?.length > 0 ? (
                        <div className="relative h-28 bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded overflow-hidden">
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
                          
                          {floorData.plan_image_data && (
                            <div className="absolute inset-0 opacity-20">
                              <img 
                                src={floorData.plan_image_data} 
                                alt="" 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          
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
                )) : storesWithFloors.find(s => s.store_id === selectedStore)?.floors.map(floor => (
                  <div 
                    key={floor.floor_id}
                    className="bg-card border border-white/10 rounded-lg p-4 cursor-pointer hover:border-primary/50 transition-colors"
                    onClick={() => handleFloorSelect(floor)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{floor.floor_name}</span>
                      {floor.has_plan && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                    </div>
                    <div className="h-28 bg-secondary/30 rounded flex items-center justify-center">
                      <Layers className="w-8 h-8 text-muted-foreground/30" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default HeatmapPage;
