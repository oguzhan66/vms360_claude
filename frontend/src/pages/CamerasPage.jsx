import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { cameraApi, storeApi } from '../services/api';
import api from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '../components/ui/dialog';
import { Cctv, Plus, Trash2, Store, Video, Search, CheckSquare, Square, RefreshCw, Filter, Power, PowerOff } from 'lucide-react';
import { toast } from 'sonner';

const CamerasPage = () => {
  const [cameras, setCameras] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusAction, setStatusAction] = useState('deactivate'); // 'activate' or 'deactivate'
  const [form, setForm] = useState({
    store_id: '',
    camera_vms_id: '',
    name: '',
    type: 'counter'
  });
  
  // Multi-select state
  const [selectedCameras, setSelectedCameras] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStore, setFilterStore] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [deleting, setDeleting] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  const loadData = async () => {
    try {
      const [camerasRes, storesRes] = await Promise.all([
        cameraApi.getAll(),
        storeApi.getAll()
      ]);
      setCameras(camerasRes.data);
      setStores(storesRes.data);
    } catch (e) {
      console.error('Failed to load data', e);
      toast.error('Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filter cameras
  const filteredCameras = cameras.filter(cam => {
    const matchesSearch = 
      cam.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cam.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cam.camera_vms_id?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStore = filterStore === 'all' || cam.store_id === filterStore;
    const matchesType = filterType === 'all' || cam.type === filterType;
    const matchesStatus = filterStatus === 'all' || 
      (filterStatus === 'active' && cam.is_active !== false) ||
      (filterStatus === 'inactive' && cam.is_active === false);
    return matchesSearch && matchesStore && matchesType && matchesStatus;
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await cameraApi.create(form);
      toast.success('Kamera eklendi');
      setDialogOpen(false);
      setForm({ store_id: '', camera_vms_id: '', name: '', type: 'counter' });
      loadData();
    } catch (e) {
      console.error('Failed to add camera', e);
      toast.error('Kamera eklenemedi');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu kamerayı silmek istediğinize emin misiniz?')) return;
    try {
      await cameraApi.delete(id);
      toast.success('Kamera silindi');
      loadData();
    } catch (e) {
      console.error('Failed to delete camera', e);
      toast.error('Silme başarısız');
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedCameras.length === 0) return;
    
    setDeleting(true);
    try {
      const res = await api.post('/cameras/bulk-delete', {
        camera_ids: selectedCameras
      });
      
      toast.success(res.data.message);
      setSelectedCameras([]);
      setDeleteDialogOpen(false);
      loadData();
    } catch (e) {
      console.error('Failed to delete cameras', e);
      toast.error('Silme işlemi başarısız');
    } finally {
      setDeleting(false);
    }
  };

  // Bulk status update handler
  const handleBulkStatusUpdate = async () => {
    if (selectedCameras.length === 0) return;
    
    setUpdatingStatus(true);
    try {
      const res = await api.post('/cameras/bulk-status', {
        camera_ids: selectedCameras,
        is_active: statusAction === 'activate'
      });
      
      toast.success(res.data.message);
      setSelectedCameras([]);
      setStatusDialogOpen(false);
      loadData();
    } catch (e) {
      console.error('Failed to update camera status', e);
      toast.error('Durum güncelleme başarısız');
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Single camera status toggle
  const handleToggleStatus = async (camera) => {
    try {
      const newStatus = camera.is_active === false ? true : false;
      await api.patch(`/cameras/${camera.id}/status?is_active=${newStatus}`);
      toast.success(newStatus ? 'Kamera aktif edildi' : 'Kamera pasif yapıldı');
      loadData();
    } catch (e) {
      console.error('Failed to toggle camera status', e);
      toast.error('Durum değiştirilemedi');
    }
  };

  // Open status dialog with action
  const openStatusDialog = (action) => {
    setStatusAction(action);
    setStatusDialogOpen(true);
  };

  // Toggle single camera selection
  const toggleCamera = (cameraId) => {
    setSelectedCameras(prev => 
      prev.includes(cameraId) 
        ? prev.filter(id => id !== cameraId)
        : [...prev, cameraId]
    );
  };

  // Select all visible cameras
  const selectAll = () => {
    const visibleIds = filteredCameras.map(c => c.id);
    setSelectedCameras(visibleIds);
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedCameras([]);
  };

  const getStoreName = (storeId) => {
    const store = stores.find(s => s.id === storeId);
    return store?.name || 'Atanmamış';
  };

  const getTypeLabel = (type) => {
    switch (type) {
      case 'counter': return 'Kişi Sayma';
      case 'queue': return 'Kuyruk';
      case 'analytics': return 'Analitik';
      default: return type || 'Bilinmiyor';
    }
  };

  const getTypeColor = (type) => {
    switch (type) {
      case 'counter': return 'bg-emerald-500/20 text-emerald-500';
      case 'queue': return 'bg-amber-500/20 text-amber-500';
      case 'analytics': return 'bg-blue-500/20 text-blue-500';
      default: return 'bg-gray-500/20 text-gray-500';
    }
  };

  // Count active/inactive in selection
  const selectedActiveCount = selectedCameras.filter(id => {
    const cam = cameras.find(c => c.id === id);
    return cam && cam.is_active !== false;
  }).length;
  const selectedInactiveCount = selectedCameras.length - selectedActiveCount;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">Kamera Yönetimi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mağazalara kamera atayın ve yönetin
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={loadData}
              disabled={loading}
              data-testid="refresh-cameras-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Yenile
            </Button>
            
            {/* Bulk Actions */}
            {selectedCameras.length > 0 && (
              <>
                {selectedActiveCount > 0 && (
                  <Button 
                    variant="outline"
                    onClick={() => openStatusDialog('deactivate')}
                    className="border-orange-500 text-orange-500 hover:bg-orange-500/10"
                    data-testid="bulk-deactivate-btn"
                  >
                    <PowerOff className="w-4 h-4 mr-2" />
                    Pasif Yap ({selectedActiveCount})
                  </Button>
                )}
                {selectedInactiveCount > 0 && (
                  <Button 
                    variant="outline"
                    onClick={() => openStatusDialog('activate')}
                    className="border-green-500 text-green-500 hover:bg-green-500/10"
                    data-testid="bulk-activate-btn"
                  >
                    <Power className="w-4 h-4 mr-2" />
                    Aktif Yap ({selectedInactiveCount})
                  </Button>
                )}
                <Button 
                  variant="destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                  data-testid="bulk-delete-btn"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Sil ({selectedCameras.length})
                </Button>
              </>
            )}
            
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button data-testid="add-camera-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Kamera Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-border">
                <DialogHeader>
                  <DialogTitle className="text-foreground">Yeni Kamera Ekle</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Mağaza</Label>
                    <Select 
                      value={form.store_id} 
                      onValueChange={(v) => setForm({ ...form, store_id: v })}
                    >
                      <SelectTrigger className="bg-background border-border" data-testid="camera-store-select">
                        <SelectValue placeholder="Mağaza seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.map(s => (
                          <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Kamera VMS ID</Label>
                    <Input
                      value={form.camera_vms_id}
                      onChange={(e) => setForm({ ...form, camera_vms_id: e.target.value })}
                      placeholder="VMS sistemindeki kamera ID'si"
                      required
                      className="bg-background border-border"
                      data-testid="camera-vms-id-input"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Sagitech VMS'deki kamera UUID'si
                    </p>
                  </div>

                  <div>
                    <Label>Kamera Adı</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Giriş Kamerası"
                      required
                      className="bg-background border-border"
                      data-testid="camera-name-input"
                    />
                  </div>

                  <div>
                    <Label>Kamera Tipi</Label>
                    <Select 
                      value={form.type} 
                      onValueChange={(v) => setForm({ ...form, type: v })}
                    >
                      <SelectTrigger className="bg-background border-border" data-testid="camera-type-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="counter">Kişi Sayma</SelectItem>
                        <SelectItem value="queue">Kuyruk Algılama</SelectItem>
                        <SelectItem value="analytics">Yüz Analitik (Yaş/Cinsiyet)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="border-border">İptal</Button>
                    </DialogClose>
                    <Button type="submit" data-testid="camera-submit-btn">Ekle</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-gray-100 dark:bg-slate-800/80 rounded-lg border border-gray-200 dark:border-slate-600">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Filter className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="text-gray-900 dark:text-white font-semibold">Filtreler:</span>
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Kamera ID veya isim ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 h-9 bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white"
              data-testid="camera-search"
            />
          </div>

          {/* Store Filter */}
          <Select value={filterStore} onValueChange={setFilterStore}>
            <SelectTrigger className="w-40 h-9 text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white" data-testid="filter-store">
              <SelectValue placeholder="Mağaza" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Mağazalar</SelectItem>
              {stores.map(s => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-36 h-9 text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white" data-testid="filter-type">
              <SelectValue placeholder="Tip" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Tipler</SelectItem>
              <SelectItem value="counter">Kişi Sayma</SelectItem>
              <SelectItem value="queue">Kuyruk</SelectItem>
              <SelectItem value="analytics">Analitik</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-32 h-9 text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white" data-testid="filter-status">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tüm Durumlar</SelectItem>
              <SelectItem value="active">Aktif</SelectItem>
              <SelectItem value="inactive">Pasif</SelectItem>
            </SelectContent>
          </Select>

          {/* Selection Actions */}
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={selectAll}
              className="h-9 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600"
              data-testid="select-all-btn"
            >
              <CheckSquare className="w-4 h-4 mr-1" />
              Tümünü Seç
            </Button>
            {selectedCameras.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={deselectAll}
                className="h-9 border-gray-300 dark:border-slate-500 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-slate-600"
                data-testid="deselect-all-btn"
              >
                <Square className="w-4 h-4 mr-1" />
                Seçimi Kaldır
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Toplam: <strong className="text-foreground">{cameras.length}</strong> kamera</span>
          <span>Aktif: <strong className="text-green-600 dark:text-green-400">{cameras.filter(c => c.is_active !== false).length}</strong></span>
          <span>Pasif: <strong className="text-orange-600 dark:text-orange-400">{cameras.filter(c => c.is_active === false).length}</strong></span>
          <span>Gösterilen: <strong className="text-foreground">{filteredCameras.length}</strong></span>
          {selectedCameras.length > 0 && (
            <span className="text-blue-600 dark:text-blue-400">
              Seçili: <strong>{selectedCameras.length}</strong>
            </span>
          )}
        </div>

        {/* Camera List */}
        {loading ? (
          <div className="text-center py-16">
            <RefreshCw className="w-8 h-8 mx-auto mb-4 animate-spin text-primary" />
            <p className="text-muted-foreground">Yükleniyor...</p>
          </div>
        ) : filteredCameras.length > 0 ? (
          <div className="space-y-2">
            {filteredCameras.map((camera) => (
              <div 
                key={camera.id}
                className={`p-4 rounded-lg border transition-colors ${
                  selectedCameras.includes(camera.id)
                    ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700'
                    : camera.is_active === false 
                      ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800/50 opacity-75'
                      : 'bg-card border-border hover:bg-accent/50'
                }`}
                data-testid={`camera-card-${camera.id}`}
              >
                <div className="flex items-center gap-4">
                  {/* Checkbox */}
                  <Checkbox
                    checked={selectedCameras.includes(camera.id)}
                    onCheckedChange={() => toggleCamera(camera.id)}
                    data-testid={`camera-checkbox-${camera.id}`}
                  />

                  {/* Camera Icon */}
                  <div className={`p-2 rounded-lg ${camera.is_active === false ? 'bg-gray-500/20 text-gray-500' : getTypeColor(camera.type)}`}>
                    <Video className="w-5 h-5" />
                  </div>

                  {/* Camera Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`font-semibold ${camera.is_active === false ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {camera.name}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${camera.is_active === false ? 'bg-gray-500/20 text-gray-500' : getTypeColor(camera.type)}`}>
                        {getTypeLabel(camera.type)}
                      </span>
                      {camera.is_active === false && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-400">
                          Pasif
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1">
                        <Store className="w-3 h-3" />
                        {getStoreName(camera.store_id)}
                      </span>
                      <span className="font-mono text-xs">
                        ID: {camera.camera_vms_id?.substring(0, 8)}...
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {/* Toggle Status Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleToggleStatus(camera)}
                      className={camera.is_active === false 
                        ? "text-green-500 hover:text-green-600 hover:bg-green-500/10" 
                        : "text-orange-500 hover:text-orange-600 hover:bg-orange-500/10"
                      }
                      title={camera.is_active === false ? "Aktif Yap" : "Pasif Yap"}
                      data-testid={`toggle-status-${camera.id}`}
                    >
                      {camera.is_active === false ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </Button>
                    
                    {/* Delete Button */}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(camera.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                      data-testid={`delete-camera-${camera.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Cctv className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Kamera bulunamadı.</p>
            {(searchTerm || filterStore !== 'all' || filterType !== 'all' || filterStatus !== 'all') ? (
              <p className="text-sm mt-1">Filtreleri temizleyerek tüm kameraları görebilirsiniz.</p>
            ) : (
              <p className="text-sm mt-1">Önce mağaza tanımlayıp sonra kamera ekleyebilirsiniz.</p>
            )}
          </div>
        )}
      </div>

      {/* Bulk Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">Kameraları Sil</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">
              <strong className="text-foreground">{selectedCameras.length}</strong> kamerayı silmek istediğinize emin misiniz?
            </p>
            <p className="text-sm text-red-500 mt-2">
              Bu işlem geri alınamaz. Silinen kameralar mağaza atamalarından da kaldırılacaktır.
            </p>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="border-border">İptal</Button>
            </DialogClose>
            <Button 
              variant="destructive" 
              onClick={handleBulkDelete}
              disabled={deleting}
              data-testid="confirm-bulk-delete-btn"
            >
              {deleting ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              {selectedCameras.length} Kamerayı Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Status Update Confirmation Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {statusAction === 'activate' ? 'Kameraları Aktif Yap' : 'Kameraları Pasif Yap'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-muted-foreground">
              <strong className="text-foreground">
                {statusAction === 'activate' ? selectedInactiveCount : selectedActiveCount}
              </strong> kamerayı {statusAction === 'activate' ? 'aktif' : 'pasif'} yapmak istediğinize emin misiniz?
            </p>
            {statusAction === 'deactivate' && (
              <p className="text-sm text-orange-500 mt-2">
                Pasif kameralar veri toplamayacak ancak silinmeyecektir.
              </p>
            )}
            {statusAction === 'activate' && (
              <p className="text-sm text-green-500 mt-2">
                Aktif kameralar tekrar veri toplamaya başlayacaktır.
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="border-border">İptal</Button>
            </DialogClose>
            <Button 
              variant={statusAction === 'activate' ? 'default' : 'outline'}
              onClick={handleBulkStatusUpdate}
              disabled={updatingStatus}
              className={statusAction === 'deactivate' ? 'border-orange-500 text-orange-500 hover:bg-orange-500/10' : ''}
              data-testid="confirm-bulk-status-btn"
            >
              {updatingStatus ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : statusAction === 'activate' ? (
                <Power className="w-4 h-4 mr-2" />
              ) : (
                <PowerOff className="w-4 h-4 mr-2" />
              )}
              {statusAction === 'activate' ? `${selectedInactiveCount} Kamerayı Aktif Yap` : `${selectedActiveCount} Kamerayı Pasif Yap`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default CamerasPage;
