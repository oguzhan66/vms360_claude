import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { storeApi, vmsApi, locationApi } from '../services/api';
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
import { Store, Plus, Trash2, Edit, MapPin, Users, Server, Camera, Video } from 'lucide-react';
import { toast } from 'sonner';
import api from '../services/api';

const StoresPage = () => {
  const [stores, setStores] = useState([]);
  const [vmsList, setVmsList] = useState([]);
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [editingStore, setEditingStore] = useState(null);
  const [vmsCameras, setVmsCameras] = useState([]);
  const [loadingCameras, setLoadingCameras] = useState(false);
  const [form, setForm] = useState({
    name: '',
    district_id: '',
    vms_id: '',
    capacity: 100,
    queue_threshold: 5,
    counter_camera_ids: [],
    queue_camera_ids: [],
    analytics_camera_ids: []
  });
  const [locationForm, setLocationForm] = useState({
    type: 'region',
    name: '',
    parent_id: ''
  });
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedCity, setSelectedCity] = useState('');

  const loadData = async () => {
    try {
      const [storesRes, vmsRes, regionsRes, citiesRes, districtsRes] = await Promise.all([
        storeApi.getAll(),
        vmsApi.getAll(),
        locationApi.getRegions(),
        locationApi.getCities(),
        locationApi.getDistricts()
      ]);
      setStores(storesRes.data);
      setVmsList(vmsRes.data);
      setRegions(regionsRes.data);
      setCities(citiesRes.data);
      setDistricts(districtsRes.data);
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

  useEffect(() => {
    if (selectedRegion) {
      locationApi.getCities(selectedRegion).then(res => setCities(res.data));
      setSelectedCity('');
    }
  }, [selectedRegion]);

  useEffect(() => {
    if (selectedCity) {
      locationApi.getDistricts(selectedCity).then(res => setDistricts(res.data));
    }
  }, [selectedCity]);

  // Load cameras when VMS is selected
  const loadVmsCameras = async (vmsId) => {
    if (!vmsId) {
      setVmsCameras([]);
      return;
    }
    setLoadingCameras(true);
    try {
      const res = await api.get(`/vms/${vmsId}/cameras`);
      setVmsCameras(res.data.cameras || []);
    } catch (e) {
      console.error('Failed to load cameras', e);
      setVmsCameras([]);
    } finally {
      setLoadingCameras(false);
    }
  };

  useEffect(() => {
    if (form.vms_id) {
      loadVmsCameras(form.vms_id);
    }
  }, [form.vms_id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const submitData = {
        ...form,
        counter_camera_ids: form.counter_camera_ids || [],
        queue_camera_ids: form.queue_camera_ids || [],
        analytics_camera_ids: form.analytics_camera_ids || []
      };
      
      if (editingStore) {
        await storeApi.update(editingStore.id, submitData);
        toast.success('Magaza guncellendi');
      } else {
        await storeApi.create(submitData);
        toast.success('Magaza eklendi');
      }
      setDialogOpen(false);
      setEditingStore(null);
      setForm({ name: '', district_id: '', vms_id: '', capacity: 100, queue_threshold: 5, counter_camera_ids: [], queue_camera_ids: [], analytics_camera_ids: [] });
      setVmsCameras([]);
      loadData();
    } catch (e) {
      console.error('Failed to save store', e);
      toast.error('Islem basarisiz');
    }
  };

  const handleLocationSubmit = async (e) => {
    e.preventDefault();
    try {
      if (locationForm.type === 'region') {
        await locationApi.createRegion({ name: locationForm.name });
      } else if (locationForm.type === 'city') {
        await locationApi.createCity({ name: locationForm.name, parent_id: locationForm.parent_id });
      } else {
        await locationApi.createDistrict({ name: locationForm.name, parent_id: locationForm.parent_id });
      }
      toast.success('Konum eklendi');
      setLocationDialogOpen(false);
      setLocationForm({ type: 'region', name: '', parent_id: '' });
      loadData();
    } catch (e) {
      console.error('Failed to add location', e);
      toast.error('Konum eklenemedi');
    }
  };

  const handleEdit = (store) => {
    setEditingStore(store);
    setForm({
      name: store.name,
      district_id: store.district_id,
      vms_id: store.vms_id,
      capacity: store.capacity,
      queue_threshold: store.queue_threshold,
      counter_camera_ids: store.counter_camera_ids || [],
      queue_camera_ids: store.queue_camera_ids || [],
      analytics_camera_ids: store.analytics_camera_ids || []
    });
    // Load cameras for the store's VMS
    if (store.vms_id) {
      loadVmsCameras(store.vms_id);
    }
    setDialogOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu magazayi silmek istediginize emin misiniz?')) return;
    try {
      await storeApi.delete(id);
      toast.success('Magaza silindi');
      loadData();
    } catch (e) {
      console.error('Failed to delete store', e);
      toast.error('Silme basarisiz');
    }
  };

  const getDistrictInfo = (districtId) => {
    const district = districts.find(d => d.id === districtId);
    if (!district) return { district: '', city: '', region: '' };
    const city = cities.find(c => c.id === district.city_id);
    const region = city ? regions.find(r => r.id === city.region_id) : null;
    return {
      district: district.name,
      city: city?.name || '',
      region: region?.name || ''
    };
  };

  const getVmsName = (vmsId) => {
    const vms = vmsList.find(v => v.id === vmsId);
    return vms?.name || '-';
  };

  const openNewDialog = () => {
    setEditingStore(null);
    setForm({ name: '', district_id: '', vms_id: '', capacity: 100, queue_threshold: 5 });
    setDialogOpen(true);
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Magaza Yonetimi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Magazalari ve konumlari yonetin
            </p>
          </div>
          <div className="flex gap-2">
            <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="border-white/10" data-testid="add-location-btn">
                  <MapPin className="w-4 h-4 mr-2" />
                  Konum Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle>Yeni Konum Ekle</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleLocationSubmit} className="space-y-4">
                  <div>
                    <Label>Konum Tipi</Label>
                    <Select 
                      value={locationForm.type} 
                      onValueChange={(v) => setLocationForm({ ...locationForm, type: v, parent_id: '' })}
                    >
                      <SelectTrigger className="bg-secondary/50 border-white/10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="region">Bolge</SelectItem>
                        <SelectItem value="city">Il</SelectItem>
                        <SelectItem value="district">Ilce</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  {locationForm.type === 'city' && (
                    <div>
                      <Label>Bolge</Label>
                      <Select 
                        value={locationForm.parent_id} 
                        onValueChange={(v) => setLocationForm({ ...locationForm, parent_id: v })}
                      >
                        <SelectTrigger className="bg-secondary/50 border-white/10">
                          <SelectValue placeholder="Bolge secin" />
                        </SelectTrigger>
                        <SelectContent>
                          {regions.map(r => (
                            <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {locationForm.type === 'district' && (
                    <div>
                      <Label>Il</Label>
                      <Select 
                        value={locationForm.parent_id} 
                        onValueChange={(v) => setLocationForm({ ...locationForm, parent_id: v })}
                      >
                        <SelectTrigger className="bg-secondary/50 border-white/10">
                          <SelectValue placeholder="Il secin" />
                        </SelectTrigger>
                        <SelectContent>
                          {cities.map(c => (
                            <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  <div>
                    <Label>Konum Adi</Label>
                    <Input
                      value={locationForm.name}
                      onChange={(e) => setLocationForm({ ...locationForm, name: e.target.value })}
                      placeholder="Konum adi"
                      required
                      className="bg-secondary/50 border-white/10"
                    />
                  </div>
                  
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="border-white/10">Iptal</Button>
                    </DialogClose>
                    <Button type="submit">Ekle</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={openNewDialog} data-testid="add-store-btn">
                  <Plus className="w-4 h-4 mr-2" />
                  Magaza Ekle
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-card border-white/10">
                <DialogHeader>
                  <DialogTitle>{editingStore ? 'Magaza Duzenle' : 'Yeni Magaza Ekle'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <Label>Magaza Adi</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Magaza adi"
                      required
                      className="bg-secondary/50 border-white/10"
                      data-testid="store-name-input"
                    />
                  </div>

                  <div>
                    <Label>Bolge</Label>
                    <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                      <SelectTrigger className="bg-secondary/50 border-white/10">
                        <SelectValue placeholder="Bolge secin" />
                      </SelectTrigger>
                      <SelectContent>
                        {regions.map(r => (
                          <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Il</Label>
                    <Select value={selectedCity} onValueChange={setSelectedCity} disabled={!selectedRegion}>
                      <SelectTrigger className="bg-secondary/50 border-white/10">
                        <SelectValue placeholder="Il secin" />
                      </SelectTrigger>
                      <SelectContent>
                        {cities.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Ilce</Label>
                    <Select 
                      value={form.district_id} 
                      onValueChange={(v) => setForm({ ...form, district_id: v })}
                      disabled={!selectedCity}
                    >
                      <SelectTrigger className="bg-secondary/50 border-white/10">
                        <SelectValue placeholder="Ilce secin" />
                      </SelectTrigger>
                      <SelectContent>
                        {districts.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>VMS Sunucusu</Label>
                    <Select 
                      value={form.vms_id} 
                      onValueChange={(v) => setForm({ ...form, vms_id: v })}
                    >
                      <SelectTrigger className="bg-secondary/50 border-white/10">
                        <SelectValue placeholder="VMS secin" />
                      </SelectTrigger>
                      <SelectContent>
                        {vmsList.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Kapasite</Label>
                      <Input
                        type="number"
                        value={form.capacity}
                        onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 0 })}
                        className="bg-secondary/50 border-white/10"
                        data-testid="store-capacity-input"
                      />
                    </div>
                    <div>
                      <Label>Kuyruk Esigi</Label>
                      <Input
                        type="number"
                        value={form.queue_threshold}
                        onChange={(e) => setForm({ ...form, queue_threshold: parseInt(e.target.value) || 0 })}
                        className="bg-secondary/50 border-white/10"
                        data-testid="store-queue-input"
                      />
                    </div>
                  </div>

                  {/* Camera Selection Section */}
                  {form.vms_id && (
                    <div className="border-t border-border pt-4 mt-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Camera className="w-4 h-4 text-primary" />
                        <Label className="text-sm font-semibold">Kamera Secimi</Label>
                        {loadingCameras && <span className="text-xs text-muted-foreground">(Yukleniyor...)</span>}
                      </div>
                      
                      {vmsCameras.length > 0 ? (
                        <div className="space-y-4">
                          {/* Counter Cameras - Multi Select */}
                          <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">
                              Kisi Sayma Kameralari ({form.counter_camera_ids?.length || 0} secili)
                            </Label>
                            <div className="max-h-32 overflow-y-auto border border-white/10 rounded p-2 space-y-1 bg-secondary/30">
                              {vmsCameras.filter(c => !c.disabled).map(cam => (
                                <label key={cam.camera_id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/5 p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={form.counter_camera_ids?.includes(cam.camera_id)}
                                    onChange={(e) => {
                                      const ids = form.counter_camera_ids || [];
                                      if (e.target.checked) {
                                        setForm({ ...form, counter_camera_ids: [...ids, cam.camera_id] });
                                      } else {
                                        setForm({ ...form, counter_camera_ids: ids.filter(id => id !== cam.camera_id) });
                                      }
                                    }}
                                    className="rounded"
                                  />
                                  <span className={cam.has_counter ? 'text-green-400' : ''}>
                                    {cam.name}
                                  </span>
                                  {cam.has_counter && <span className="text-xs text-green-400">(Sayac)</span>}
                                  {cam.in_count > 0 && <span className="text-xs text-muted-foreground">- {cam.in_count} giris</span>}
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Queue Cameras - Multi Select */}
                          <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">
                              Kuyruk Analizi Kameralari ({form.queue_camera_ids?.length || 0} secili)
                            </Label>
                            <div className="max-h-32 overflow-y-auto border border-white/10 rounded p-2 space-y-1 bg-secondary/30">
                              {vmsCameras.filter(c => !c.disabled).map(cam => (
                                <label key={cam.camera_id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/5 p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={form.queue_camera_ids?.includes(cam.camera_id)}
                                    onChange={(e) => {
                                      const ids = form.queue_camera_ids || [];
                                      if (e.target.checked) {
                                        setForm({ ...form, queue_camera_ids: [...ids, cam.camera_id] });
                                      } else {
                                        setForm({ ...form, queue_camera_ids: ids.filter(id => id !== cam.camera_id) });
                                      }
                                    }}
                                    className="rounded"
                                  />
                                  <span className={cam.has_queue ? 'text-blue-400' : ''}>
                                    {cam.name}
                                  </span>
                                  {cam.has_queue && <span className="text-xs text-blue-400">(Kuyruk - {cam.zones?.length || 0} bolge)</span>}
                                </label>
                              ))}
                            </div>
                          </div>

                          {/* Analytics Cameras - Multi Select */}
                          <div>
                            <Label className="text-xs text-muted-foreground mb-2 block">
                              Yas/Cinsiyet Analizi Kameralari ({form.analytics_camera_ids?.length || 0} secili)
                            </Label>
                            <div className="max-h-32 overflow-y-auto border border-white/10 rounded p-2 space-y-1 bg-secondary/30">
                              {vmsCameras.filter(c => !c.disabled).map(cam => (
                                <label key={cam.camera_id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-white/5 p-1 rounded">
                                  <input
                                    type="checkbox"
                                    checked={form.analytics_camera_ids?.includes(cam.camera_id)}
                                    onChange={(e) => {
                                      const ids = form.analytics_camera_ids || [];
                                      if (e.target.checked) {
                                        setForm({ ...form, analytics_camera_ids: [...ids, cam.camera_id] });
                                      } else {
                                        setForm({ ...form, analytics_camera_ids: ids.filter(id => id !== cam.camera_id) });
                                      }
                                    }}
                                    className="rounded"
                                  />
                                  <span className={cam.has_analytics ? 'text-purple-400' : ''}>
                                    {cam.name}
                                  </span>
                                  {cam.has_analytics && <span className="text-xs text-purple-400">(Analitik)</span>}
                                </label>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {loadingCameras ? 'Kameralar yukleniyor...' : 'Bu VMS\'de kamera bulunamadi'}
                        </p>
                      )}
                    </div>
                  )}

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline" className="border-white/10">Iptal</Button>
                    </DialogClose>
                    <Button type="submit" data-testid="store-submit-btn">
                      {editingStore ? 'Guncelle' : 'Ekle'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      <div className="page-content">
        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="store-card loading-skeleton h-24" />
            ))}
          </div>
        ) : stores.length > 0 ? (
          <div className="space-y-4">
            {stores.map((store) => {
              const location = getDistrictInfo(store.district_id);
              return (
                <div 
                  key={store.id} 
                  className="store-card flex items-center justify-between"
                  data-testid={`store-card-${store.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-primary/10 flex items-center justify-center">
                      <Store className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{store.name}</h3>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{location.district}, {location.city}, {location.region}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          Kapasite: {store.capacity}
                        </span>
                        <span className="flex items-center gap-1">
                          <Server className="w-3 h-3" />
                          VMS: {getVmsName(store.vms_id)}
                        </span>
                      </div>
                      {/* Camera Indicators */}
                      <div className="flex items-center gap-2 mt-2">
                        {(store.counter_camera_id || store.counter_camera_ids?.length > 0) && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded">
                            <Video className="w-3 h-3" />
                            Sayaç {store.counter_camera_ids?.length > 1 ? `(${store.counter_camera_ids.length})` : ''}
                          </span>
                        )}
                        {(store.queue_camera_id || store.queue_camera_ids?.length > 0) && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-amber-500/10 text-amber-500 rounded">
                            <Video className="w-3 h-3" />
                            Kuyruk {store.queue_camera_ids?.length > 1 ? `(${store.queue_camera_ids.length})` : ''}
                          </span>
                        )}
                        {(store.analytics_camera_id || store.analytics_camera_ids?.length > 0) && (
                          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-purple-500/10 text-purple-500 rounded">
                            <Video className="w-3 h-3" />
                            Analitik {store.analytics_camera_ids?.length > 1 ? `(${store.analytics_camera_ids.length})` : ''}
                          </span>
                        )}
                        {!store.counter_camera_id && !store.queue_camera_id && !store.analytics_camera_id && 
                         (!store.counter_camera_ids || store.counter_camera_ids.length === 0) &&
                         (!store.queue_camera_ids || store.queue_camera_ids.length === 0) &&
                         (!store.analytics_camera_ids || store.analytics_camera_ids.length === 0) && (
                          <span className="text-xs text-muted-foreground italic">Kamera atanmadı</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEdit(store)}
                      className="border-white/10"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDelete(store.id)}
                      className="border-white/10 text-red-400 hover:text-red-300"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Store className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Henuz magaza eklenmedi.</p>
            <p className="text-sm mt-1">Once konum (Bolge &gt; Il &gt; Ilce) ekleyin, sonra magaza tanimlayabilirsiniz.</p>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default StoresPage;
