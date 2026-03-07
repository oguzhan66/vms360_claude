import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { vmsApi, storeApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '../components/ui/dialog';
import { Server, Plus, Trash2, Edit, CheckCircle, RefreshCw, Video, Download, Upload } from 'lucide-react';
import { toast } from 'sonner';

const VMSPage = () => {
  const [vmsList, setVmsList] = useState([]);
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [camerasDialogOpen, setCamerasDialogOpen] = useState(false);
  const [editingVms, setEditingVms] = useState(null);
  const [form, setForm] = useState({
    name: '',
    url: '',
    username: '',
    password: ''
  });
  const [testingId, setTestingId] = useState(null);
  const [fetchingCamerasId, setFetchingCamerasId] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [vmsCameras, setVmsCameras] = useState(null);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [importingCameras, setImportingCameras] = useState(false);

  const loadData = async () => {
    try {
      const [vmsRes, storesRes] = await Promise.all([
        vmsApi.getAll(),
        storeApi.getAll()
      ]);
      setVmsList(vmsRes.data);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingVms) {
        await vmsApi.update(editingVms.id, form);
        toast.success('VMS güncellendi');
      } else {
        await vmsApi.create(form);
        toast.success('VMS eklendi');
      }
      setDialogOpen(false);
      setEditingVms(null);
      setForm({ name: '', url: '', username: '', password: '' });
      loadData();
    } catch (e) {
      console.error('Failed to save VMS', e);
      toast.error('İşlem başarısız');
    }
  };

  const handleEdit = (vms) => {
    setEditingVms(vms);
    setForm({
      name: vms.name,
      url: vms.url,
      username: vms.username,
      password: vms.password || ''
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu VMS sunucusunu silmek istediğinize emin misiniz?')) return;
    try {
      await vmsApi.delete(id);
      toast.success('VMS silindi');
      loadData();
    } catch (e) {
      console.error('Failed to delete VMS', e);
      toast.error('Silme başarısız');
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const res = await vmsApi.test(id);
      if (res.data.status === 'connected') {
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
    } catch (e) {
      toast.error('Bağlantı testi başarısız');
    } finally {
      setTestingId(null);
    }
  };

  const handleFetchCameras = async (id) => {
    setFetchingCamerasId(id);
    try {
      const res = await vmsApi.fetchCameras(id);
      setVmsCameras(res.data);
      
      // Find stores linked to this VMS
      const linkedStores = stores.filter(s => s.vms_id === id);
      if (linkedStores.length === 1) {
        setSelectedStoreId(linkedStores[0].id);
      } else {
        setSelectedStoreId('');
      }
      
      setCamerasDialogOpen(true);
      if (res.data.cameras.length > 0) {
        toast.success(`${res.data.cameras.length} kamera bulundu`);
      } else {
        toast.info('VMS\'de kamera bulunamadı');
      }
    } catch (e) {
      console.error('Failed to fetch cameras', e);
      toast.error('Kameralar çekilemedi');
    } finally {
      setFetchingCamerasId(null);
    }
  };

  const handleImportCameras = async () => {
    if (!selectedStoreId) {
      toast.error('Lütfen bir mağaza seçin');
      return;
    }
    
    setImportingCameras(true);
    try {
      const res = await vmsApi.importCameras(vmsCameras.vms_id, {
        store_id: selectedStoreId,
        cameras: vmsCameras.cameras
      });
      
      if (res.data.imported > 0) {
        toast.success(res.data.message);
        setCamerasDialogOpen(false);
      } else {
        toast.info(res.data.message);
      }
    } catch (e) {
      console.error('Failed to import cameras', e);
      toast.error('Kameralar eklenemedi');
    } finally {
      setImportingCameras(false);
    }
  };

  const handleSyncCameras = async (vmsId) => {
    setSyncingId(vmsId);
    try {
      // Use the new full sync endpoint
      const res = await vmsApi.syncAllCameras(vmsId);
      if (res.data.status === 'success') {
        toast.success(res.data.message);
        // Show details
        if (res.data.added > 0 || res.data.updated > 0) {
          toast.info(`Eklenen: ${res.data.added}, Güncellenen: ${res.data.updated}, Devre dışı: ${res.data.deactivated}`);
        }
      } else {
        toast.warning(res.data.message);
      }
    } catch (e) {
      console.error('Failed to sync cameras', e);
      toast.error('Kamera senkronizasyonu başarısız');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAllVms = async () => {
    setSyncingId('all');
    try {
      const res = await vmsApi.syncAllVms();
      if (res.data.total_added > 0 || res.data.total_updated > 0) {
        toast.success(res.data.message);
      } else {
        toast.info('Güncellenecek kamera bulunamadı');
      }
    } catch (e) {
      console.error('Failed to sync all VMS', e);
      toast.error('Toplu senkronizasyon başarısız');
    } finally {
      setSyncingId(null);
    }
  };

  const openNewDialog = () => {
    setEditingVms(null);
    setForm({ name: '', url: '', username: '', password: '' });
    setDialogOpen(true);
  };

  const getLinkedStores = (vmsId) => {
    return stores.filter(s => s.vms_id === vmsId);
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">VMS Yönetimi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Video Yönetim Sistemi sunucularını yönetin
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={handleSyncAllVms}
              disabled={syncingId === 'all'}
              data-testid="sync-all-vms-btn"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${syncingId === 'all' ? 'animate-spin' : ''}`} />
              Tümünü Senkronize Et
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNewDialog} data-testid="add-vms-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  VMS Ekle
                </Button>
              </DialogTrigger>
            <DialogContent className="bg-card border-border">
              <DialogHeader>
                <DialogTitle>{editingVms ? 'VMS Düzenle' : 'Yeni VMS Ekle'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="name">Sunucu Adı</Label>
                  <Input
                    id="name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ana Sunucu"
                    required
                    className="bg-secondary/50 border-border"
                    data-testid="vms-name-input"
                  />
                </div>
                <div>
                  <Label htmlFor="url">Sunucu URL</Label>
                  <Input
                    id="url"
                    value={form.url}
                    onChange={(e) => setForm({ ...form, url: e.target.value })}
                    placeholder="http://192.168.1.100:11012"
                    required
                    className="bg-secondary/50 border-border"
                    data-testid="vms-url-input"
                  />
                </div>
                <div>
                  <Label htmlFor="username">Kullanıcı Adı</Label>
                  <Input
                    id="username"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="admin"
                    required
                    className="bg-secondary/50 border-border"
                    data-testid="vms-username-input"
                  />
                </div>
                <div>
                  <Label htmlFor="password">Şifre (Opsiyonel)</Label>
                  <Input
                    id="password"
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="********"
                    className="bg-secondary/50 border-border"
                    data-testid="vms-password-input"
                  />
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="border-border text-foreground">
                      İptal
                    </Button>
                  </DialogClose>
                  <Button type="submit" data-testid="vms-submit-btn">
                    {editingVms ? 'Güncelle' : 'Ekle'}
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
        ) : vmsList.length > 0 ? (
          <div className="space-y-4">
            {vmsList.map((vms) => {
              const linkedStores = getLinkedStores(vms.id);
              return (
                <div 
                  key={vms.id} 
                  className="store-card"
                  data-testid={`vms-card-${vms.id}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
                        <Server className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold">{vms.name}</h3>
                        <p className="text-sm text-muted-foreground font-mono">{vms.url}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Kullanıcı: {vms.username} | 
                          {vms.is_active ? (
                            <span className="text-emerald-500 ml-1">Aktif</span>
                          ) : (
                            <span className="text-red-500 ml-1">Pasif</span>
                          )}
                          {linkedStores.length > 0 && (
                            <span className="ml-2">| {linkedStores.length} mağaza bağlı</span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleFetchCameras(vms.id)}
                        disabled={fetchingCamerasId === vms.id}
                        className="border-border text-foreground"
                        data-testid={`fetch-cameras-${vms.id}`}
                      >
                        {fetchingCamerasId === vms.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                        <span className="ml-2">Kameraları Çek</span>
                      </Button>
                      {linkedStores.length > 0 && (
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleSyncCameras(vms.id)}
                          disabled={syncingId === vms.id}
                          className="border-border text-foreground"
                          data-testid={`sync-cameras-${vms.id}`}
                        >
                          {syncingId === vms.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          <span className="ml-2">Otomatik Ekle</span>
                        </Button>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleTest(vms.id)}
                        disabled={testingId === vms.id}
                        className="border-border text-foreground"
                        data-testid={`test-vms-${vms.id}`}
                      >
                        {testingId === vms.id ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                        <span className="ml-2">Test</span>
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(vms)}
                        className="border-border text-foreground"
                        data-testid={`edit-vms-${vms.id}`}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDelete(vms.id)}
                        className="border-border text-destructive hover:text-destructive"
                        data-testid={`delete-vms-${vms.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Server className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Henüz VMS sunucusu eklenmedi.</p>
            <p className="text-sm mt-1">Yeni bir VMS ekleyerek başlayabilirsiniz.</p>
          </div>
        )}
      </div>

      {/* Cameras Dialog */}
      <Dialog open={camerasDialogOpen} onOpenChange={setCamerasDialogOpen}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              VMS Kameraları - {vmsCameras?.vms_name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {vmsCameras?.cameras?.length > 0 ? (
              <>
                <div className="p-4 bg-primary/10 border border-primary/30">
                  <p className="text-sm font-medium mb-3">
                    {vmsCameras.total} kamera bulundu. Mağaza seçerek otomatik ekleyin:
                  </p>
                  <div className="flex gap-3">
                    <Select value={selectedStoreId} onValueChange={setSelectedStoreId}>
                      <SelectTrigger className="flex-1 bg-secondary/50 border-border">
                        <SelectValue placeholder="Mağaza seçin" />
                      </SelectTrigger>
                      <SelectContent>
                        {stores.filter(s => s.vms_id === vmsCameras?.vms_id).length > 0 ? (
                          stores.filter(s => s.vms_id === vmsCameras?.vms_id).map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))
                        ) : (
                          stores.map(s => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleImportCameras}
                      disabled={!selectedStoreId || importingCameras}
                      data-testid="import-cameras-btn"
                    >
                      {importingCameras ? (
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Tümünü Ekle
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {vmsCameras.cameras.map((cam, idx) => (
                    <div 
                      key={cam.camera_id || idx} 
                      className="p-3 bg-secondary/30 border border-border flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <Video className="w-5 h-5 text-primary" />
                        <div>
                          <div className="font-mono text-sm">{cam.camera_id}</div>
                          <div className="text-xs text-muted-foreground">
                            Tip: {cam.type === 'counter' ? 'Kişi Sayma' : cam.type === 'queue' ? 'Kuyruk' : 'Analitik'}
                            {cam.has_queue && ' | Kuyruk Algılama'}
                            {cam.has_analytics && ' | Yüz Analitik'}
                          </div>
                          {cam.in_count !== undefined && (
                            <div className="text-xs mt-1">
                              <span className="text-emerald-500">Giriş: {cam.in_count}</span>
                              <span className="text-amber-500 ml-3">Çıkış: {cam.out_count}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Video className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Bu VMS'de aktif kamera bulunamadı.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="border-border text-foreground">Kapat</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </Layout>
  );
};

export default VMSPage;
