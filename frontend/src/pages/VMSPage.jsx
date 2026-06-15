import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { vmsApi } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '../components/ui/dialog';
import { Server, Plus, Trash2, Edit, CheckCircle, RefreshCw, Video, Download, Upload, FolderOpen, Pencil, Check, X } from 'lucide-react';
import { toast } from 'sonner';

const UNGROUPED = '__ungrouped__';

const VMSPage = () => {
  const [vmsList, setVmsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [camerasDialogOpen, setCamerasDialogOpen] = useState(false);
  const [editingVms, setEditingVms] = useState(null);
  const [filterGroup, setFilterGroup] = useState('');
  const [renamingGroup, setRenamingGroup] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [form, setForm] = useState({
    name: '',
    url: '',
    username: '',
    password: '',
    group_name: ''
  });
  const [newGroupInput, setNewGroupInput] = useState(false);
  const [testingId, setTestingId] = useState(null);
  const [fetchingCamerasId, setFetchingCamerasId] = useState(null);
  const [syncingId, setSyncingId] = useState(null);
  const [vmsCameras, setVmsCameras] = useState(null);
  const [importingCameras, setImportingCameras] = useState(false);
  const [importingCameraId, setImportingCameraId] = useState(null);

  const loadData = async () => {
    try {
      const vmsRes = await vmsApi.getAll();
      setVmsList(vmsRes.data);
    } catch (e) {
      console.error('Failed to load data', e);
      toast.error('Veri yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // Collect distinct group names from existing VMS list
  const existingGroups = [...new Set(
    vmsList.map(v => v.group_name).filter(Boolean)
  )].sort();

  // Group VMS list by group_name
  const grouped = vmsList.reduce((acc, vms) => {
    const key = vms.group_name || UNGROUPED;
    if (!acc[key]) acc[key] = [];
    acc[key].push(vms);
    return acc;
  }, {});

  // Filtered groups
  const groupKeys = Object.keys(grouped).sort((a, b) => {
    if (a === UNGROUPED) return 1;
    if (b === UNGROUPED) return -1;
    return a.localeCompare(b);
  });
  const visibleKeys = filterGroup
    ? groupKeys.filter(k => k === filterGroup)
    : groupKeys;

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
      setForm({ name: '', url: '', username: '', password: '', group_name: '' });
      setNewGroupInput(false);
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
      password: vms.password || '',
      group_name: vms.group_name || ''
    });
    setNewGroupInput(false);
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu VMS sunucusunu silmek istediğinize emin misiniz?')) return;
    try {
      await vmsApi.delete(id);
      toast.success('VMS silindi');
      loadData();
    } catch (e) {
      toast.error('Silme başarısız');
    }
  };

  const handleRenameGroupConfirm = async (oldName) => {
    const newName = renameValue.trim();
    if (!newName || newName === oldName) { setRenamingGroup(null); return; }
    try {
      await vmsApi.renameGroup(oldName, newName);
      toast.success(`Grup "${oldName}" → "${newName}" olarak yeniden adlandırıldı`);
      setRenamingGroup(null);
      if (filterGroup === oldName) setFilterGroup(newName);
      loadData();
    } catch (e) {
      toast.error('Yeniden adlandırma başarısız');
    }
  };

  const handleDeleteGroup = async (groupName, type) => {
    if (!window.confirm(`"${groupName}" grubunu silmek istiyor musunuz? Gruptaki öğeler grupsuz kalacak.`)) return;
    try {
      if (type === 'vms') await vmsApi.deleteGroup(groupName);
      else await storeApi.deleteGroup(groupName);
      toast.success(`"${groupName}" grubu silindi`);
      if (filterGroup === groupName) setFilterGroup('');
      loadData();
    } catch (e) {
      toast.error('Grup silme başarısız');
    }
  };

  const handleTest = async (id) => {
    setTestingId(id);
    try {
      const res = await vmsApi.test(id);
      if (res.data.status === 'connected') toast.success(res.data.message);
      else toast.error(res.data.message);
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
      setCamerasDialogOpen(true);
      if (res.data.cameras.length > 0) toast.success(`${res.data.cameras.length} kamera bulundu`);
      else toast.info('VMS\'de kamera bulunamadı');
    } catch (e) {
      toast.error('Kameralar çekilemedi');
    } finally {
      setFetchingCamerasId(null);
    }
  };

  const handleImportCameras = async (cameraIds) => {
    const ids = cameraIds || vmsCameras.cameras.map(c => c.camera_id);
    if (!ids.length) return;
    if (ids.length === 1) setImportingCameraId(ids[0]);
    else setImportingCameras(true);
    try {
      const res = await vmsApi.importCameras(vmsCameras.vms_id, { camera_ids: ids });
      if (res.data.imported > 0) {
        toast.success(res.data.message);
        if (!cameraIds) setCamerasDialogOpen(false);
        // Refresh camera list to show updated status
        const refreshed = await vmsApi.fetchCameras(vmsCameras.vms_id);
        setVmsCameras(refreshed.data);
      } else {
        toast.info(res.data.message);
      }
    } catch (e) {
      toast.error('Kameralar eklenemedi');
    } finally {
      setImportingCameras(false);
      setImportingCameraId(null);
    }
  };

  const handleSyncCameras = async (vmsId) => {
    setSyncingId(vmsId);
    try {
      const res = await vmsApi.syncAllCameras(vmsId);
      if (res.data.status === 'success') {
        toast.success(res.data.message);
        if (res.data.added > 0 || res.data.updated > 0)
          toast.info(`Eklenen: ${res.data.added}, Güncellenen: ${res.data.updated}, Devre dışı: ${res.data.deactivated}`);
      } else toast.warning(res.data.message);
    } catch (e) {
      toast.error('Kamera senkronizasyonu başarısız');
    } finally {
      setSyncingId(null);
    }
  };

  const handleSyncAllVms = async () => {
    setSyncingId('all');
    try {
      const res = await vmsApi.syncAllVms();
      if (res.data.total_added > 0 || res.data.total_updated > 0) toast.success(res.data.message);
      else toast.info('Güncellenecek kamera bulunamadı');
    } catch (e) {
      toast.error('Toplu senkronizasyon başarısız');
    } finally {
      setSyncingId(null);
    }
  };

  const openNewDialog = () => {
    setEditingVms(null);
    setForm({ name: '', url: '', username: '', password: '', group_name: '' });
    setNewGroupInput(false);
    setDialogOpen(true);
  };

  // Group field: select existing or type new
  const GroupField = () => (
    <div>
      <Label>Grup</Label>
      {!newGroupInput ? (
        <div className="flex gap-2">
          <select
            value={form.group_name}
            onChange={e => {
              if (e.target.value === '__new__') { setNewGroupInput(true); setForm({ ...form, group_name: '' }); }
              else setForm({ ...form, group_name: e.target.value });
            }}
            className="flex-1 h-9 text-sm rounded border border-border bg-secondary/50 text-foreground px-2 focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">— Grupsuz —</option>
            {existingGroups.map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
            <option value="__new__">+ Yeni grup oluştur...</option>
          </select>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input
            autoFocus
            value={form.group_name}
            onChange={e => setForm({ ...form, group_name: e.target.value })}
            placeholder="Grup adı girin"
            className="flex-1 bg-secondary/50 border-border"
          />
          <Button type="button" variant="outline" size="sm" onClick={() => { setNewGroupInput(false); setForm({ ...form, group_name: '' }); }}>
            İptal
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">VMS Yönetimi</h1>
            <p className="text-sm text-muted-foreground mt-1">Video Yönetim Sistemi sunucularını yönetin</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleSyncAllVms} disabled={syncingId === 'all'} data-testid="sync-all-vms-btn">
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
                  <GroupField />
                  <div>
                    <Label htmlFor="name">Sunucu Adı</Label>
                    <Input id="name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                      placeholder="Ana Sunucu" required className="bg-secondary/50 border-border" data-testid="vms-name-input" />
                  </div>
                  <div>
                    <Label htmlFor="url">Sunucu URL</Label>
                    <Input id="url" value={form.url} onChange={e => setForm({ ...form, url: e.target.value })}
                      placeholder="http://192.168.1.100:11012" required className="bg-secondary/50 border-border" data-testid="vms-url-input" />
                  </div>
                  <div>
                    <Label htmlFor="username">Kullanıcı Adı</Label>
                    <Input id="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })}
                      placeholder="admin" required className="bg-secondary/50 border-border" data-testid="vms-username-input" />
                  </div>
                  <div>
                    <Label htmlFor="password">Şifre (Opsiyonel)</Label>
                    <Input id="password" type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })}
                      placeholder="********" className="bg-secondary/50 border-border" data-testid="vms-password-input" />
                  </div>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="border-border text-foreground">İptal</Button>
                    </DialogClose>
                    <Button type="submit" data-testid="vms-submit-btn">{editingVms ? 'Güncelle' : 'Ekle'}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="page-content">
        {/* Group filter */}
        {existingGroups.length > 0 && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="text-xs text-muted-foreground font-medium">Grup Filtresi:</span>
            <button
              onClick={() => setFilterGroup('')}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${!filterGroup ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
            >
              Tümü ({vmsList.length})
            </button>
            {existingGroups.map(g => (
              <button
                key={g}
                onClick={() => setFilterGroup(filterGroup === g ? '' : g)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterGroup === g ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
              >
                {g} ({grouped[g]?.length || 0})
              </button>
            ))}
            {grouped[UNGROUPED] && (
              <button
                onClick={() => setFilterGroup(filterGroup === UNGROUPED ? '' : UNGROUPED)}
                className={`text-xs px-3 py-1 rounded-full border transition-colors ${filterGroup === UNGROUPED ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'}`}
              >
                Grupsuz ({grouped[UNGROUPED].length})
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => <div key={i} className="store-card loading-skeleton h-24" />)}
          </div>
        ) : vmsList.length > 0 ? (
          <div className="space-y-6">
            {visibleKeys.map(groupKey => (
              <div key={groupKey}>
                {/* Group header */}
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen className="w-4 h-4 text-primary/70" />
                  {renamingGroup === groupKey ? (
                    <>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleRenameGroupConfirm(groupKey); if (e.key === 'Escape') setRenamingGroup(null); }}
                        className="text-sm font-semibold bg-transparent border-b border-primary outline-none px-1 w-40"
                      />
                      <button onClick={() => handleRenameGroupConfirm(groupKey)} className="text-green-400 hover:text-green-300"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setRenamingGroup(null)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-semibold text-foreground/80">
                        {groupKey === UNGROUPED ? 'Grupsuz' : groupKey}
                      </span>
                      <span className="text-xs text-muted-foreground">({grouped[groupKey].length})</span>
                      {groupKey !== UNGROUPED && (
                        <>
                          <button onClick={() => { setRenamingGroup(groupKey); setRenameValue(groupKey); }} className="text-muted-foreground hover:text-primary ml-1"><Pencil className="w-3 h-3" /></button>
                          <button onClick={() => handleDeleteGroup(groupKey, 'vms')} className="text-muted-foreground hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                        </>
                      )}
                    </>
                  )}
                  <div className="flex-1 h-px bg-border ml-1" />
                </div>

                <div className="space-y-3">
                  {grouped[groupKey].map(vms => {
                    return (
                      <div key={vms.id} className="store-card" data-testid={`vms-card-${vms.id}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
                              <Server className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                              <h3 className="font-semibold">{vms.name}</h3>
                              <p className="text-sm text-muted-foreground font-mono">{vms.url}</p>
                              <p className="text-xs text-muted-foreground mt-1">
                                Kullanıcı: {vms.username} |{' '}
                                {vms.is_active
                                  ? <span className="text-emerald-500">Aktif</span>
                                  : <span className="text-red-500">Pasif</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => handleFetchCameras(vms.id)}
                              disabled={fetchingCamerasId === vms.id} className="border-border text-foreground"
                              data-testid={`fetch-cameras-${vms.id}`}>
                              {fetchingCamerasId === vms.id
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <Download className="w-4 h-4" />}
                              <span className="ml-2">Kameraları Çek</span>
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleTest(vms.id)}
                              disabled={testingId === vms.id} className="border-border text-foreground"
                              data-testid={`test-vms-${vms.id}`}>
                              {testingId === vms.id
                                ? <RefreshCw className="w-4 h-4 animate-spin" />
                                : <CheckCircle className="w-4 h-4" />}
                              <span className="ml-2">Test</span>
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleEdit(vms)}
                              className="border-border text-foreground" data-testid={`edit-vms-${vms.id}`}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleDelete(vms.id)}
                              className="border-border text-destructive hover:text-destructive"
                              data-testid={`delete-vms-${vms.id}`}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
            <DialogTitle>VMS Kameraları — {vmsCameras?.vms_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {vmsCameras?.cameras?.length > 0 ? (
              <>
                {/* Toplu ekle */}
                <div className="flex items-center justify-between p-3 bg-primary/10 border border-primary/30 rounded-lg">
                  <span className="text-sm font-medium">
                    {vmsCameras.total} kamera bulundu
                  </span>
                  <Button
                    size="sm"
                    onClick={() => handleImportCameras(null)}
                    disabled={importingCameras}
                    data-testid="import-cameras-btn"
                  >
                    {importingCameras
                      ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      : <Upload className="w-4 h-4 mr-2" />}
                    Tümünü Ekle
                  </Button>
                </div>

                {/* Kamera listesi */}
                <div className="space-y-2">
                  {vmsCameras.cameras.map((cam, idx) => {
                    const alreadyAdded = cam.in_db;
                    return (
                      <div key={cam.camera_id || idx} className="p-3 bg-secondary/30 border border-border rounded flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Video className="w-5 h-5 text-primary shrink-0" />
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">{cam.name || cam.camera_id}</div>
                            <div className="text-xs text-muted-foreground font-mono truncate">{cam.camera_id}</div>
                            {cam.disabled && (
                              <span className="text-xs text-red-500">Devre dışı</span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant={alreadyAdded ? 'outline' : 'default'}
                          disabled={alreadyAdded || importingCameraId === cam.camera_id}
                          onClick={() => handleImportCameras([cam.camera_id])}
                          className="shrink-0"
                        >
                          {importingCameraId === cam.camera_id
                            ? <RefreshCw className="w-3 h-3 animate-spin" />
                            : alreadyAdded
                              ? <><CheckCircle className="w-3 h-3 mr-1 text-emerald-500" /> Eklendi</>
                              : <><Plus className="w-3 h-3 mr-1" /> Ekle</>}
                        </Button>
                      </div>
                    );
                  })}
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
    </Layout>
  );
};

export default VMSPage;
