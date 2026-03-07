import { useState, useEffect, useRef, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { floorApi, storeApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Slider } from '../components/ui/slider';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '../components/ui/dialog';
import { 
  Layers, Plus, Trash2, Edit, Upload, Camera, 
  Move, RotateCw, Eye, MapPin, Save, X, Settings,
  Hexagon, Pencil, Check, CornerDownLeft
} from 'lucide-react';
import { toast } from 'sonner';
import { Switch } from '../components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const FloorPlansPage = () => {
  const [floors, setFloors] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFloor, setEditingFloor] = useState(null);
  const [selectedFloor, setSelectedFloor] = useState(null);
  const [cameraDialogOpen, setCameraDialogOpen] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [positionedCameras, setPositionedCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const canvasRef = useRef(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 700 });
  
  const [form, setForm] = useState({
    store_id: '',
    name: '',
    floor_number: 0,
    width_meters: 50,
    height_meters: 30,
    grid_size: 2
  });

  const [cameraForm, setCameraForm] = useState({
    position_x: 0,
    position_y: 0,
    direction: 0,
    fov_angle: 90,
    influence_radius: 5
  });

  // Zone drawing states
  const [activeTab, setActiveTab] = useState('cameras');
  const [zones, setZones] = useState([]);
  const [isDrawingZone, setIsDrawingZone] = useState(false);
  const [currentZonePoints, setCurrentZonePoints] = useState([]);
  const [selectedZone, setSelectedZone] = useState(null);
  const [zoneForm, setZoneForm] = useState({
    name: '',
    type: 'corridor',
    color: '#3b82f6',
    show_heatmap: true
  });

  const ZONE_TYPES = [
    { value: 'corridor', label: 'Koridor', color: '#3b82f6' },
    { value: 'entrance', label: 'Giriş', color: '#22c55e' },
    { value: 'plaza', label: 'Meydan', color: '#f59e0b' },
    { value: 'shop', label: 'Mağaza', color: '#8b5cf6' },
    { value: 'restricted', label: 'Yasak Bölge', color: '#ef4444' },
    { value: 'general', label: 'Genel', color: '#6b7280' }
  ];

  const loadData = async () => {
    try {
      const [floorsRes, storesRes] = await Promise.all([
        floorApi.getAll(),
        storeApi.getAll()
      ]);
      setFloors(floorsRes.data);
      setStores(storesRes.data);
    } catch (e) {
      console.error('Failed to load data', e);
      toast.error('Veri yuklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingFloor) {
        await floorApi.update(editingFloor.id, form);
        toast.success('Kat guncellendi');
      } else {
        await floorApi.create(form);
        toast.success('Kat eklendi');
      }
      setDialogOpen(false);
      setEditingFloor(null);
      setForm({ store_id: '', name: '', floor_number: 0, width_meters: 50, height_meters: 30, grid_size: 2 });
      loadData();
    } catch (e) {
      console.error('Failed to save floor', e);
      toast.error('Islem basarisiz');
    }
  };

  const handleEdit = (floor) => {
    setEditingFloor(floor);
    setForm({
      store_id: floor.store_id,
      name: floor.name,
      floor_number: floor.floor_number || 0,
      width_meters: floor.width_meters || 50,
      height_meters: floor.height_meters || 30,
      grid_size: floor.grid_size || 2
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu kati silmek istediginize emin misiniz?')) return;
    try {
      await floorApi.delete(id);
      toast.success('Kat silindi');
      if (selectedFloor?.id === id) setSelectedFloor(null);
      loadData();
    } catch (e) {
      console.error('Failed to delete floor', e);
      toast.error('Silme basarisiz');
    }
  };

  const handleUploadPlan = async (floorId, file) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      await floorApi.uploadPlan(floorId, formData);
      toast.success('Kat plani yuklendi');
      loadData();
      // Refresh selected floor if it's the same
      if (selectedFloor?.id === floorId) {
        const res = await floorApi.getById(floorId);
        setSelectedFloor(res.data);
      }
    } catch (e) {
      console.error('Failed to upload plan', e);
      toast.error(e.response?.data?.detail || 'Yukleme basarisiz');
    }
  };

  const openCameraDialog = async (floor) => {
    setSelectedFloor(floor);
    setActiveTab('cameras');
    setSelectedCamera(null);
    setSelectedZone(null);
    setIsDrawingZone(false);
    setCurrentZonePoints([]);
    try {
      const [camerasRes, zonesRes] = await Promise.all([
        floorApi.getAvailableCameras(floor.id),
        floorApi.getZones(floor.id)
      ]);
      setAvailableCameras(camerasRes.data.available_cameras || []);
      setPositionedCameras(camerasRes.data.positioned_cameras || []);
      setZones(zonesRes.data.zones || []);
      setCameraDialogOpen(true);
    } catch (e) {
      console.error('Failed to load data', e);
      toast.error('Veriler yuklenemedi');
    }
  };

  // Zone management functions
  const startDrawingZone = () => {
    setSelectedCamera(null);
    setSelectedZone(null);
    setIsDrawingZone(true);
    setCurrentZonePoints([]);
    setZoneForm({ name: '', type: 'corridor', color: '#3b82f6', show_heatmap: true });
  };

  const cancelDrawingZone = () => {
    setIsDrawingZone(false);
    setCurrentZonePoints([]);
  };

  const completeZone = async () => {
    if (currentZonePoints.length < 3) {
      toast.error('En az 3 nokta gerekli');
      return;
    }
    if (!zoneForm.name.trim()) {
      toast.error('Bölge adı gerekli');
      return;
    }

    try {
      const res = await floorApi.addZone(selectedFloor.id, {
        name: zoneForm.name,
        type: zoneForm.type,
        color: zoneForm.color,
        show_heatmap: zoneForm.show_heatmap,
        points: currentZonePoints.map(p => ({ x: p.x, y: p.y }))
      });
      toast.success('Bölge eklendi');
      setZones(prev => [...prev, res.data.zone]);
      setIsDrawingZone(false);
      setCurrentZonePoints([]);
    } catch (e) {
      console.error('Failed to add zone', e);
      toast.error('Bölge eklenemedi');
    }
  };

  const deleteZone = async (zoneId) => {
    if (!window.confirm('Bu bölgeyi silmek istediğinize emin misiniz?')) return;
    try {
      await floorApi.deleteZone(selectedFloor.id, zoneId);
      toast.success('Bölge silindi');
      setZones(prev => prev.filter(z => z.id !== zoneId));
      if (selectedZone?.id === zoneId) setSelectedZone(null);
    } catch (e) {
      console.error('Failed to delete zone', e);
      toast.error('Silme başarısız');
    }
  };

  const updateZone = async () => {
    if (!selectedZone) return;
    try {
      await floorApi.updateZone(selectedFloor.id, selectedZone.id, {
        name: zoneForm.name,
        type: zoneForm.type,
        color: zoneForm.color,
        show_heatmap: zoneForm.show_heatmap
      });
      toast.success('Bölge güncellendi');
      setZones(prev => prev.map(z => 
        z.id === selectedZone.id 
          ? { ...z, name: zoneForm.name, type: zoneForm.type, color: zoneForm.color, show_heatmap: zoneForm.show_heatmap }
          : z
      ));
      setSelectedZone(null);
    } catch (e) {
      console.error('Failed to update zone', e);
      toast.error('Güncelleme başarısız');
    }
  };

  const selectZoneForEdit = (zone) => {
    setSelectedCamera(null);
    setIsDrawingZone(false);
    setCurrentZonePoints([]);
    setSelectedZone(zone);
    setZoneForm({
      name: zone.name,
      type: zone.type,
      color: zone.color,
      show_heatmap: zone.show_heatmap !== false
    });
  };

  const selectCameraForPlacement = (camera) => {
    setSelectedCamera(camera);
    setCameraForm({
      position_x: camera.position_x || selectedFloor.width_meters / 2,
      position_y: camera.position_y || selectedFloor.height_meters / 2,
      direction: camera.direction || 0,
      fov_angle: camera.fov_angle || 90,
      influence_radius: camera.influence_radius || 5
    });
  };

  const saveCameraPosition = async () => {
    if (!selectedCamera || !selectedFloor) return;
    try {
      await floorApi.updateCameraPosition(
        selectedFloor.id, 
        selectedCamera.id || selectedCamera.camera_vms_id,
        cameraForm
      );
      toast.success('Kamera konumu kaydedildi');
      // Refresh cameras
      const res = await floorApi.getAvailableCameras(selectedFloor.id);
      setAvailableCameras(res.data.available_cameras || []);
      setPositionedCameras(res.data.positioned_cameras || []);
      setSelectedCamera(null);
    } catch (e) {
      console.error('Failed to save camera position', e);
      toast.error('Kaydetme basarisiz');
    }
  };

  const removeCameraFromFloor = async (camera) => {
    if (!selectedFloor) return;
    try {
      await floorApi.removeCameraFromFloor(
        selectedFloor.id,
        camera.id || camera.camera_vms_id
      );
      toast.success('Kamera kattan kaldirildi');
      // Refresh cameras
      const res = await floorApi.getAvailableCameras(selectedFloor.id);
      setAvailableCameras(res.data.available_cameras || []);
      setPositionedCameras(res.data.positioned_cameras || []);
    } catch (e) {
      console.error('Failed to remove camera', e);
      toast.error('Kaldirma basarisiz');
    }
  };

  // Canvas drawing for floor plan preview
  const drawFloorPlanPreview = useCallback(() => {
    if (!canvasRef.current || !selectedFloor) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Calculate scale
    const scaleX = canvas.width / selectedFloor.width_meters;
    const scaleY = canvas.height / selectedFloor.height_meters;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    const offsetX = (canvas.width - selectedFloor.width_meters * scale) / 2;
    const offsetY = (canvas.height - selectedFloor.height_meters * scale) / 2;
    
    // Draw grid
    ctx.strokeStyle = '#333355';
    ctx.lineWidth = 0.5;
    const gridSize = selectedFloor.grid_size || 2;
    for (let x = 0; x <= selectedFloor.width_meters; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x * scale, offsetY);
      ctx.lineTo(offsetX + x * scale, offsetY + selectedFloor.height_meters * scale);
      ctx.stroke();
    }
    for (let y = 0; y <= selectedFloor.height_meters; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y * scale);
      ctx.lineTo(offsetX + selectedFloor.width_meters * scale, offsetY + y * scale);
      ctx.stroke();
    }
    
    // Draw floor plan image if available
    if (selectedFloor.plan_image_data) {
      const img = new Image();
      img.onload = () => {
        ctx.globalAlpha = 0.7;
        ctx.drawImage(img, offsetX, offsetY, selectedFloor.width_meters * scale, selectedFloor.height_meters * scale);
        ctx.globalAlpha = 1;
        drawZones(ctx, scale, offsetX, offsetY);
        drawCameras(ctx, scale, offsetX, offsetY);
        drawCurrentZonePoints(ctx, scale, offsetX, offsetY);
      };
      img.src = selectedFloor.plan_image_data;
    } else {
      // Draw floor outline
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.strokeRect(offsetX, offsetY, selectedFloor.width_meters * scale, selectedFloor.height_meters * scale);
      drawZones(ctx, scale, offsetX, offsetY);
      drawCameras(ctx, scale, offsetX, offsetY);
      drawCurrentZonePoints(ctx, scale, offsetX, offsetY);
    }
  }, [selectedFloor, positionedCameras, selectedCamera, cameraForm, zones, selectedZone, currentZonePoints, isDrawingZone]);

  // Draw existing zones
  const drawZones = (ctx, scale, offsetX, offsetY) => {
    zones.forEach(zone => {
      if (!zone.points || zone.points.length < 3) return;
      
      const isSelected = selectedZone?.id === zone.id;
      const color = zone.color || '#3b82f6';
      
      // Draw zone fill
      ctx.fillStyle = isSelected ? `${color}40` : `${color}25`;
      ctx.beginPath();
      zone.points.forEach((pt, i) => {
        const x = offsetX + pt.x * scale;
        const y = offsetY + pt.y * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.closePath();
      ctx.fill();
      
      // Draw zone border
      ctx.strokeStyle = isSelected ? color : `${color}80`;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.setLineDash(isSelected ? [] : [5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw zone label
      const centerX = zone.points.reduce((sum, p) => sum + p.x, 0) / zone.points.length;
      const centerY = zone.points.reduce((sum, p) => sum + p.y, 0) / zone.points.length;
      const labelX = offsetX + centerX * scale;
      const labelY = offsetY + centerY * scale;
      
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Label background
      const textMetrics = ctx.measureText(zone.name);
      ctx.fillStyle = `${color}cc`;
      ctx.fillRect(labelX - textMetrics.width/2 - 4, labelY - 8, textMetrics.width + 8, 16);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(zone.name, labelX, labelY);
    });
  };

  // Draw zone points while drawing
  const drawCurrentZonePoints = (ctx, scale, offsetX, offsetY) => {
    if (!isDrawingZone || currentZonePoints.length === 0) return;
    
    const color = zoneForm.color || '#3b82f6';
    
    // Draw lines between points
    if (currentZonePoints.length > 1) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      currentZonePoints.forEach((pt, i) => {
        const x = offsetX + pt.x * scale;
        const y = offsetY + pt.y * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      
      // Draw dashed line back to start if 3+ points
      if (currentZonePoints.length >= 3) {
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        const last = currentZonePoints[currentZonePoints.length - 1];
        const first = currentZonePoints[0];
        ctx.moveTo(offsetX + last.x * scale, offsetY + last.y * scale);
        ctx.lineTo(offsetX + first.x * scale, offsetY + first.y * scale);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    
    // Draw points
    currentZonePoints.forEach((pt, i) => {
      const x = offsetX + pt.x * scale;
      const y = offsetY + pt.y * scale;
      
      ctx.fillStyle = i === 0 ? '#22c55e' : color;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fill();
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();
      
      // Point number
      ctx.font = 'bold 10px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y);
    });
  };

  const drawCameras = (ctx, scale, offsetX, offsetY) => {
    // Draw positioned cameras
    positionedCameras.forEach(cam => {
      const x = offsetX + cam.position_x * scale;
      const y = offsetY + cam.position_y * scale;
      const radius = cam.influence_radius * scale;
      const direction = (cam.direction || 0) * Math.PI / 180;
      const fov = (cam.fov_angle || 90) * Math.PI / 180;
      
      // Draw FOV cone
      ctx.fillStyle = 'rgba(74, 158, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, direction - fov/2, direction + fov/2);
      ctx.closePath();
      ctx.fill();
      
      // Draw camera icon
      ctx.fillStyle = '#4a9eff';
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw direction indicator
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(direction) * 15, y + Math.sin(direction) * 15);
      ctx.stroke();
    });
    
    // Draw selected camera being positioned
    if (selectedCamera && cameraForm) {
      const x = offsetX + cameraForm.position_x * scale;
      const y = offsetY + cameraForm.position_y * scale;
      const radius = cameraForm.influence_radius * scale;
      const direction = cameraForm.direction * Math.PI / 180;
      const fov = cameraForm.fov_angle * Math.PI / 180;
      
      // Draw FOV cone
      ctx.fillStyle = 'rgba(255, 193, 7, 0.3)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, radius, direction - fov/2, direction + fov/2);
      ctx.closePath();
      ctx.fill();
      
      // Draw camera icon (yellow for selected)
      ctx.fillStyle = '#ffc107';
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw direction
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(direction) * 20, y + Math.sin(direction) * 20);
      ctx.stroke();
    }
  };

  useEffect(() => {
    if (cameraDialogOpen && selectedFloor) {
      setTimeout(drawFloorPlanPreview, 100);
    }
  }, [cameraDialogOpen, selectedFloor, positionedCameras, selectedCamera, cameraForm, zones, selectedZone, currentZonePoints, isDrawingZone, drawFloorPlanPreview]);

  const handleCanvasClick = (e) => {
    if (!selectedFloor || !canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // Calculate scale
    const scaleX = canvas.width / selectedFloor.width_meters;
    const scaleY = canvas.height / selectedFloor.height_meters;
    const scale = Math.min(scaleX, scaleY) * 0.9;
    const offsetX = (canvas.width - selectedFloor.width_meters * scale) / 2;
    const offsetY = (canvas.height - selectedFloor.height_meters * scale) / 2;
    
    // Convert to floor coordinates
    const floorX = (clickX - offsetX) / scale;
    const floorY = (clickY - offsetY) / scale;
    
    // Clamp to floor bounds
    const clampedX = Math.max(0, Math.min(selectedFloor.width_meters, floorX));
    const clampedY = Math.max(0, Math.min(selectedFloor.height_meters, floorY));
    
    // Zone drawing mode
    if (isDrawingZone) {
      setCurrentZonePoints(prev => [...prev, { 
        x: Math.round(clampedX * 10) / 10, 
        y: Math.round(clampedY * 10) / 10 
      }]);
      return;
    }
    
    // Camera placement mode
    if (selectedCamera) {
      setCameraForm(prev => ({
        ...prev,
        position_x: Math.round(clampedX * 10) / 10,
        position_y: Math.round(clampedY * 10) / 10
      }));
    }
  };

  const openNewDialog = () => {
    setEditingFloor(null);
    setForm({ store_id: '', name: '', floor_number: 0, width_meters: 50, height_meters: 30, grid_size: 2 });
    setDialogOpen(true);
  };

  const getStoreName = (storeId) => {
    const store = stores.find(s => s.id === storeId);
    return store?.name || '-';
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Kat Plani Yonetimi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Magazalarin kat planlarini ve kamera konumlarini yonetin
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNewDialog} data-testid="add-floor-btn">
                <Plus className="w-4 h-4 mr-2" />
                Kat Ekle
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-white/10">
              <DialogHeader>
                <DialogTitle>{editingFloor ? 'Kat Duzenle' : 'Yeni Kat Ekle'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Magaza</Label>
                  <Select 
                    value={form.store_id} 
                    onValueChange={(v) => setForm({ ...form, store_id: v })}
                    disabled={!!editingFloor}
                  >
                    <SelectTrigger className="bg-secondary/50 border-white/10">
                      <SelectValue placeholder="Magaza secin" />
                    </SelectTrigger>
                    <SelectContent>
                      {stores.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Kat Adi</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Ornek: Zemin Kat"
                      required
                      className="bg-secondary/50 border-white/10"
                      data-testid="floor-name-input"
                    />
                  </div>
                  <div>
                    <Label>Kat Numarasi</Label>
                    <Input
                      type="number"
                      value={form.floor_number}
                      onChange={(e) => setForm({ ...form, floor_number: parseInt(e.target.value) || 0 })}
                      placeholder="0 = Zemin"
                      className="bg-secondary/50 border-white/10"
                      data-testid="floor-number-input"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Genislik (metre)</Label>
                    <Input
                      type="number"
                      value={form.width_meters}
                      onChange={(e) => setForm({ ...form, width_meters: parseFloat(e.target.value) || 50 })}
                      step="0.1"
                      className="bg-secondary/50 border-white/10"
                    />
                  </div>
                  <div>
                    <Label>Uzunluk (metre)</Label>
                    <Input
                      type="number"
                      value={form.height_meters}
                      onChange={(e) => setForm({ ...form, height_meters: parseFloat(e.target.value) || 30 })}
                      step="0.1"
                      className="bg-secondary/50 border-white/10"
                    />
                  </div>
                </div>

                <div>
                  <Label>Izgara Boyutu (metre) - Varsayilan: 2x2m</Label>
                  <Input
                    type="number"
                    value={form.grid_size}
                    onChange={(e) => setForm({ ...form, grid_size: parseFloat(e.target.value) || 2 })}
                    step="0.5"
                    min="0.5"
                    max="10"
                    className="bg-secondary/50 border-white/10"
                  />
                </div>

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="border-white/10">Iptal</Button>
                  </DialogClose>
                  <Button type="submit" data-testid="floor-submit-btn">
                    {editingFloor ? 'Guncelle' : 'Ekle'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="store-card loading-skeleton h-24" />
            ))}
          </div>
        ) : floors.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {floors.map((floor) => (
              <div 
                key={floor.id} 
                className="store-card"
                data-testid={`floor-card-${floor.id}`}
              >
                <div className="flex gap-4">
                  {/* Floor Plan Preview */}
                  <div className="flex-shrink-0">
                    {floor.plan_image_data ? (
                      <div className="w-40 h-28 rounded-lg overflow-hidden border border-white/10 bg-secondary/30">
                        <img 
                          src={floor.plan_image_data} 
                          alt={floor.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-40 h-28 rounded-lg border border-dashed border-white/20 bg-secondary/20 flex flex-col items-center justify-center">
                        <Layers className="w-8 h-8 text-muted-foreground/30 mb-1" />
                        <span className="text-xs text-muted-foreground">Plan Yok</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Floor Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold text-base">{floor.name}</h3>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                          <MapPin className="w-3 h-3" />
                          <span>{floor.store_name || getStoreName(floor.store_id)}</span>
                          <span className="text-xs ml-2 px-1.5 py-0.5 bg-secondary rounded">
                            Kat {floor.floor_number >= 0 ? floor.floor_number : `B${Math.abs(floor.floor_number)}`}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
                          <span className="flex items-center gap-1">
                            <span className="font-medium">{floor.width_meters}m x {floor.height_meters}m</span>
                          </span>
                          <span>Izgara: {floor.grid_size}m</span>
                          {floor.plan_image_data ? (
                            <span className="text-green-500 flex items-center gap-1">
                              <div className="w-2 h-2 bg-green-500 rounded-full" />
                              Plan yüklendi
                            </span>
                          ) : (
                            <span className="text-amber-500">Plan yüklenmedi</span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 mt-3">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/jpg"
                          className="hidden"
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleUploadPlan(floor.id, e.target.files[0]);
                            }
                          }}
                        />
                        <Button variant="outline" size="sm" className="border-white/10" asChild>
                          <span>
                            <Upload className="w-4 h-4 mr-1" />
                            Plan Yükle
                          </span>
                        </Button>
                      </label>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => openCameraDialog(floor)}
                        className="border-white/10"
                      >
                        <Camera className="w-4 h-4 mr-1" />
                        Düzenle
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(floor)}
                        className="border-white/10"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDelete(floor.id)}
                        className="border-white/10 text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Layers className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Henüz kat planı eklenmedi.</p>
            <p className="text-sm mt-1">Önce mağaza seçin, sonra katın boyutlarını ve planını yükleyin.</p>
          </div>
        )}
      </div>

      {/* Camera & Zone Management Dialog */}
      <Dialog open={cameraDialogOpen} onOpenChange={setCameraDialogOpen}>
        <DialogContent className="bg-card border-white/10 max-w-[95vw] w-[95vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg">
              Kat Planı Düzenleme - {selectedFloor?.name}
            </DialogTitle>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 bg-secondary/50 max-w-md">
              <TabsTrigger value="cameras" className="flex items-center gap-2">
                <Camera className="w-4 h-4" />
                Kameralar
              </TabsTrigger>
              <TabsTrigger value="zones" className="flex items-center gap-2">
                <Hexagon className="w-4 h-4" />
                Bölgeler
              </TabsTrigger>
            </TabsList>

            <div className="grid grid-cols-4 gap-6 mt-4">
              {/* Floor Plan Canvas - Shared between tabs */}
              <div className="col-span-3 border border-white/10 rounded-lg p-4 bg-secondary/30">
                <canvas
                  ref={canvasRef}
                  width={canvasSize.width}
                  height={canvasSize.height}
                  onClick={handleCanvasClick}
                  className="w-full cursor-crosshair rounded-lg"
                  style={{ maxHeight: '700px' }}
                />
                <div className="text-sm text-muted-foreground mt-3 text-center">
                  {isDrawingZone 
                    ? `Bölge çiziliyor (${currentZonePoints.length} nokta) - Tıklayarak nokta ekleyin`
                    : selectedCamera 
                      ? 'Kamerayı yerleştirecek konuma tıklayın' 
                      : activeTab === 'zones' 
                        ? '"Bölge Çiz" butonuna tıklayıp harita üzerinde poligon oluşturun'
                        : 'Sol listeden kamera seçin'}
                </div>
              </div>

              {/* Right Panel - Changes based on tab */}
              <TabsContent value="cameras" className="m-0 space-y-4">
                {/* Positioned Cameras */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-blue-500" />
                    Yerleştirilmiş ({positionedCameras.length})
                  </h4>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {positionedCameras.map(cam => (
                      <div 
                        key={cam.id || cam.camera_vms_id}
                        className={`flex items-center justify-between p-2 rounded text-sm cursor-pointer hover:bg-white/5 ${
                          selectedCamera?.camera_vms_id === cam.camera_vms_id ? 'bg-blue-500/20 border border-blue-500/50' : 'bg-secondary/50'
                        }`}
                        onClick={() => selectCameraForPlacement(cam)}
                      >
                        <span className="truncate text-xs">{cam.name}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeCameraFromFloor(cam);
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {positionedCameras.length === 0 && (
                      <p className="text-xs text-muted-foreground">Henüz kamera yerleştirilmedi</p>
                    )}
                  </div>
                </div>

                {/* Available Cameras */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Camera className="w-4 h-4 text-amber-500" />
                    Mevcut ({availableCameras.length})
                  </h4>
                  <div className="max-h-36 overflow-y-auto space-y-1">
                    {availableCameras.map(cam => (
                      <div 
                        key={cam.id || cam.camera_vms_id}
                        className={`flex items-center justify-between p-2 rounded text-sm cursor-pointer hover:bg-white/5 ${
                          selectedCamera?.camera_vms_id === cam.camera_vms_id ? 'bg-amber-500/20 border border-amber-500/50' : 'bg-secondary/50'
                        }`}
                        onClick={() => selectCameraForPlacement(cam)}
                      >
                        <span className="truncate text-xs">{cam.name}</span>
                        <Plus className="w-4 h-4 text-muted-foreground" />
                      </div>
                    ))}
                    {availableCameras.length === 0 && (
                      <p className="text-xs text-muted-foreground">Tüm kameralar yerleştirildi</p>
                    )}
                  </div>
                </div>

                {/* Camera Position Controls */}
                {selectedCamera && (
                  <div className="border-t border-white/10 pt-4">
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      {selectedCamera.name}
                    </h4>
                    
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">X (m)</Label>
                          <Input
                            type="number"
                            value={cameraForm.position_x}
                            onChange={(e) => setCameraForm(prev => ({ ...prev, position_x: parseFloat(e.target.value) || 0 }))}
                            step="0.1"
                            className="h-8 text-sm bg-secondary/50 border-white/10"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Y (m)</Label>
                          <Input
                            type="number"
                            value={cameraForm.position_y}
                            onChange={(e) => setCameraForm(prev => ({ ...prev, position_y: parseFloat(e.target.value) || 0 }))}
                            step="0.1"
                            className="h-8 text-sm bg-secondary/50 border-white/10"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-xs flex justify-between">
                          <span>Yön (derece)</span>
                          <span className="text-muted-foreground">{cameraForm.direction}°</span>
                        </Label>
                        <Slider
                          value={[cameraForm.direction]}
                          onValueChange={([v]) => setCameraForm(prev => ({ ...prev, direction: v }))}
                          max={360}
                          step={5}
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label className="text-xs flex justify-between">
                          <span>Görüş Açısı (FOV)</span>
                          <span className="text-muted-foreground">{cameraForm.fov_angle}°</span>
                        </Label>
                        <Slider
                          value={[cameraForm.fov_angle]}
                          onValueChange={([v]) => setCameraForm(prev => ({ ...prev, fov_angle: v }))}
                          min={30}
                          max={180}
                          step={5}
                          className="mt-2"
                        />
                      </div>

                      <div>
                        <Label className="text-xs flex justify-between">
                          <span>Etki Yarıçapı</span>
                          <span className="text-muted-foreground">{cameraForm.influence_radius}m</span>
                        </Label>
                        <Slider
                          value={[cameraForm.influence_radius]}
                          onValueChange={([v]) => setCameraForm(prev => ({ ...prev, influence_radius: v }))}
                          min={1}
                          max={20}
                          step={0.5}
                          className="mt-2"
                        />
                      </div>

                      <Button onClick={saveCameraPosition} className="w-full">
                        <Save className="w-4 h-4 mr-2" />
                        Konumu Kaydet
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="zones" className="m-0 space-y-4">
                {/* Zone Drawing Controls */}
                {isDrawingZone ? (
                  <div className="space-y-3 p-3 bg-primary/10 rounded-lg border border-primary/30">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Pencil className="w-4 h-4 text-primary" />
                      Yeni Bölge Çiziliyor
                    </h4>
                    
                    <div>
                      <Label className="text-xs">Bölge Adı</Label>
                      <Input
                        value={zoneForm.name}
                        onChange={(e) => setZoneForm(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="Örn: Ana Koridor"
                        className="h-8 text-sm bg-secondary/50 border-white/10"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-xs">Bölge Tipi</Label>
                      <Select 
                        value={zoneForm.type} 
                        onValueChange={(v) => {
                          const typeInfo = ZONE_TYPES.find(t => t.value === v);
                          setZoneForm(prev => ({ ...prev, type: v, color: typeInfo?.color || prev.color }));
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm bg-secondary/50 border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ZONE_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded" style={{ backgroundColor: t.color }} />
                                {t.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Isı Haritasında Göster</Label>
                      <Switch
                        checked={zoneForm.show_heatmap}
                        onCheckedChange={(v) => setZoneForm(prev => ({ ...prev, show_heatmap: v }))}
                      />
                    </div>
                    
                    <div className="text-xs text-muted-foreground">
                      {currentZonePoints.length} nokta eklendi
                      {currentZonePoints.length > 0 && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="h-6 ml-2 text-xs"
                          onClick={() => setCurrentZonePoints(prev => prev.slice(0, -1))}
                        >
                          <CornerDownLeft className="w-3 h-3 mr-1" />
                          Son Noktayı Geri Al
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={cancelDrawingZone}
                        className="flex-1 border-white/10"
                      >
                        <X className="w-4 h-4 mr-1" />
                        İptal
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={completeZone}
                        disabled={currentZonePoints.length < 3 || !zoneForm.name.trim()}
                        className="flex-1"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        Tamamla
                      </Button>
                    </div>
                  </div>
                ) : selectedZone ? (
                  <div className="space-y-3 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Edit className="w-4 h-4 text-blue-400" />
                      Bölge Düzenleniyor
                    </h4>
                    
                    <div>
                      <Label className="text-xs">Bölge Adı</Label>
                      <Input
                        value={zoneForm.name}
                        onChange={(e) => setZoneForm(prev => ({ ...prev, name: e.target.value }))}
                        className="h-8 text-sm bg-secondary/50 border-white/10"
                      />
                    </div>
                    
                    <div>
                      <Label className="text-xs">Bölge Tipi</Label>
                      <Select 
                        value={zoneForm.type} 
                        onValueChange={(v) => {
                          const typeInfo = ZONE_TYPES.find(t => t.value === v);
                          setZoneForm(prev => ({ ...prev, type: v, color: typeInfo?.color || prev.color }));
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm bg-secondary/50 border-white/10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ZONE_TYPES.map(t => (
                            <SelectItem key={t.value} value={t.value}>
                              <span className="flex items-center gap-2">
                                <span className="w-3 h-3 rounded" style={{ backgroundColor: t.color }} />
                                {t.label}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Isı Haritasında Göster</Label>
                      <Switch
                        checked={zoneForm.show_heatmap}
                        onCheckedChange={(v) => setZoneForm(prev => ({ ...prev, show_heatmap: v }))}
                      />
                    </div>
                    
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => setSelectedZone(null)}
                        className="flex-1 border-white/10"
                      >
                        <X className="w-4 h-4 mr-1" />
                        İptal
                      </Button>
                      <Button 
                        size="sm" 
                        onClick={updateZone}
                        className="flex-1"
                      >
                        <Save className="w-4 h-4 mr-1" />
                        Kaydet
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={startDrawingZone} className="w-full">
                    <Pencil className="w-4 h-4 mr-2" />
                    Yeni Bölge Çiz
                  </Button>
                )}

                {/* Existing Zones List */}
                <div>
                  <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    <Hexagon className="w-4 h-4 text-primary" />
                    Mevcut Bölgeler ({zones.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {zones.map(zone => (
                      <div 
                        key={zone.id}
                        className={`flex items-center justify-between p-2 rounded text-sm cursor-pointer hover:bg-white/5 ${
                          selectedZone?.id === zone.id ? 'bg-blue-500/20 border border-blue-500/50' : 'bg-secondary/50'
                        }`}
                        onClick={() => selectZoneForEdit(zone)}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span 
                            className="w-3 h-3 rounded flex-shrink-0" 
                            style={{ backgroundColor: zone.color || '#3b82f6' }} 
                          />
                          <span className="truncate text-xs">{zone.name}</span>
                          <span className="text-[10px] text-muted-foreground">
                            ({ZONE_TYPES.find(t => t.value === zone.type)?.label || zone.type})
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-red-400 hover:text-red-300 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteZone(zone.id);
                          }}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                    {zones.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-4">
                        Henüz bölge tanımlanmadı.<br/>
                        "Yeni Bölge Çiz" ile başlayın.
                      </p>
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default FloorPlansPage;
