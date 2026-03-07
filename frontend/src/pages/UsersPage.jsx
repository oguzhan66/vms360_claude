import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
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
import { Users, Plus, Trash2, UserCheck, UserX, Shield, User, Pencil, MapPin, Building, Store } from 'lucide-react';
import { toast } from 'sonner';
import api, { locationApi, storeApi } from '../services/api';

const UsersPage = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  
  // Location data for permissions
  const [regions, setRegions] = useState([]);
  const [cities, setCities] = useState([]);
  const [stores, setStores] = useState([]);
  
  const [form, setForm] = useState({
    username: '',
    password: '',
    full_name: '',
    role: 'operator',
    allowed_region_ids: [],
    allowed_city_ids: [],
    allowed_store_ids: []
  });
  
  const [editForm, setEditForm] = useState({
    full_name: '',
    password: '',
    role: '',
    allowed_region_ids: [],
    allowed_city_ids: [],
    allowed_store_ids: []
  });

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (e) {
      console.error('Failed to load users', e);
      toast.error('Kullanıcılar yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadLocationData = async () => {
    try {
      const [regionsRes, citiesRes, storesRes] = await Promise.all([
        locationApi.getRegions(),
        locationApi.getCities(),
        storeApi.getAll()
      ]);
      setRegions(regionsRes.data);
      setCities(citiesRes.data);
      setStores(storesRes.data);
    } catch (e) {
      console.error('Failed to load location data', e);
    }
  };

  useEffect(() => {
    loadUsers();
    loadLocationData();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await api.post('/auth/register', form);
      toast.success('Kullanıcı eklendi');
      setDialogOpen(false);
      setForm({ 
        username: '', 
        password: '', 
        full_name: '', 
        role: 'operator',
        allowed_region_ids: [],
        allowed_city_ids: [],
        allowed_store_ids: []
      });
      loadUsers();
    } catch (e) {
      console.error('Failed to create user', e);
      toast.error(e.response?.data?.detail || 'Kullanıcı eklenemedi');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success('Kullanıcı silindi');
      loadUsers();
    } catch (e) {
      console.error('Failed to delete user', e);
      toast.error('Silme başarısız');
    }
  };

  const handleToggle = async (id) => {
    try {
      const res = await api.put(`/users/${id}/toggle`);
      toast.success(res.data.is_active ? 'Kullanıcı aktif edildi' : 'Kullanıcı devre dışı bırakıldı');
      loadUsers();
    } catch (e) {
      console.error('Failed to toggle user', e);
      toast.error('İşlem başarısız');
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name,
      password: '',
      role: user.role,
      allowed_region_ids: user.allowed_region_ids || [],
      allowed_city_ids: user.allowed_city_ids || [],
      allowed_store_ids: user.allowed_store_ids || []
    });
    setEditDialogOpen(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const updateData = { 
        full_name: editForm.full_name, 
        role: editForm.role,
        allowed_region_ids: editForm.allowed_region_ids,
        allowed_city_ids: editForm.allowed_city_ids,
        allowed_store_ids: editForm.allowed_store_ids
      };
      if (editForm.password) {
        updateData.password = editForm.password;
      }
      await api.put(`/users/${editingUser.id}`, updateData);
      toast.success('Kullanıcı güncellendi');
      setEditDialogOpen(false);
      setEditingUser(null);
      loadUsers();
    } catch (e) {
      console.error('Failed to update user', e);
      toast.error(e.response?.data?.detail || 'Güncelleme başarısız');
    }
  };

  // Permission toggle helpers
  const toggleRegion = (regionId, formSetter, formState) => {
    const current = formState.allowed_region_ids || [];
    const newList = current.includes(regionId)
      ? current.filter(id => id !== regionId)
      : [...current, regionId];
    formSetter({ ...formState, allowed_region_ids: newList });
  };

  const toggleCity = (cityId, formSetter, formState) => {
    const current = formState.allowed_city_ids || [];
    const newList = current.includes(cityId)
      ? current.filter(id => id !== cityId)
      : [...current, cityId];
    formSetter({ ...formState, allowed_city_ids: newList });
  };

  const toggleStore = (storeId, formSetter, formState) => {
    const current = formState.allowed_store_ids || [];
    const newList = current.includes(storeId)
      ? current.filter(id => id !== storeId)
      : [...current, storeId];
    formSetter({ ...formState, allowed_store_ids: newList });
  };

  // Permission section component
  const PermissionSection = ({ formState, formSetter, isOperator }) => (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MapPin className="w-4 h-4" />
        <span>Erişim Yetkileri</span>
      </div>
      
      {!isOperator && (
        <p className="text-xs text-muted-foreground bg-blue-500/10 p-2 rounded">
          Admin için boş bırakılırsa tüm mağazalara erişim sağlanır.
        </p>
      )}
      
      {isOperator && (
        <p className="text-xs text-muted-foreground bg-yellow-500/10 p-2 rounded">
          Operatör için en az bir yetki seçilmelidir, aksi halde hiçbir veriye erişemez.
        </p>
      )}

      {/* Regions */}
      <div>
        <Label className="text-xs flex items-center gap-2 mb-2">
          <MapPin className="w-3 h-3" /> Bölgeler
        </Label>
        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-secondary/30 rounded">
          {regions.map(region => (
            <div key={region.id} className="flex items-center gap-2">
              <Checkbox
                id={`region-${region.id}`}
                checked={(formState.allowed_region_ids || []).includes(region.id)}
                onCheckedChange={() => toggleRegion(region.id, formSetter, formState)}
              />
              <label htmlFor={`region-${region.id}`} className="text-xs cursor-pointer">
                {region.name}
              </label>
            </div>
          ))}
          {regions.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Bölge bulunamadı</p>}
        </div>
      </div>

      {/* Cities */}
      <div>
        <Label className="text-xs flex items-center gap-2 mb-2">
          <Building className="w-3 h-3" /> Şehirler
        </Label>
        <div className="grid grid-cols-2 gap-2 max-h-32 overflow-y-auto p-2 bg-secondary/30 rounded">
          {cities.slice(0, 20).map(city => (
            <div key={city.id} className="flex items-center gap-2">
              <Checkbox
                id={`city-${city.id}`}
                checked={(formState.allowed_city_ids || []).includes(city.id)}
                onCheckedChange={() => toggleCity(city.id, formSetter, formState)}
              />
              <label htmlFor={`city-${city.id}`} className="text-xs cursor-pointer">
                {city.name}
              </label>
            </div>
          ))}
          {cities.length === 0 && <p className="text-xs text-muted-foreground col-span-2">Şehir bulunamadı</p>}
          {cities.length > 20 && <p className="text-xs text-muted-foreground col-span-2">+{cities.length - 20} daha...</p>}
        </div>
      </div>

      {/* Stores */}
      <div>
        <Label className="text-xs flex items-center gap-2 mb-2">
          <Store className="w-3 h-3" /> Mağazalar
        </Label>
        <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto p-2 bg-secondary/30 rounded">
          {stores.map(store => (
            <div key={store.id} className="flex items-center gap-2">
              <Checkbox
                id={`store-${store.id}`}
                checked={(formState.allowed_store_ids || []).includes(store.id)}
                onCheckedChange={() => toggleStore(store.id, formSetter, formState)}
              />
              <label htmlFor={`store-${store.id}`} className="text-xs cursor-pointer">
                {store.name}
              </label>
            </div>
          ))}
          {stores.length === 0 && <p className="text-xs text-muted-foreground">Mağaza bulunamadı</p>}
        </div>
      </div>
    </div>
  );

  // Get permission summary for display
  const getPermissionSummary = (user) => {
    const regionCount = (user.allowed_region_ids || []).length;
    const cityCount = (user.allowed_city_ids || []).length;
    const storeCount = (user.allowed_store_ids || []).length;
    
    if (user.role === 'admin' && regionCount === 0 && cityCount === 0 && storeCount === 0) {
      return 'Tüm mağazalar';
    }
    
    if (regionCount === 0 && cityCount === 0 && storeCount === 0) {
      return 'Yetki tanımlanmamış';
    }
    
    const parts = [];
    if (regionCount > 0) parts.push(`${regionCount} bölge`);
    if (cityCount > 0) parts.push(`${cityCount} şehir`);
    if (storeCount > 0) parts.push(`${storeCount} mağaza`);
    
    return parts.join(', ');
  };

  return (
    <Layout>
      <div className="page-header">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Kullanıcı Yönetimi</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Sistem kullanıcılarını ve yetkilerini yönetin
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-user-btn">
                <Plus className="w-4 h-4 mr-2" />
                Kullanıcı Ekle
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Yeni Kullanıcı Ekle</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Kullanıcı Adı</Label>
                  <Input
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    placeholder="kullanici"
                    required
                    className="bg-secondary/50 border-border"
                    data-testid="user-username-input"
                  />
                </div>
                <div>
                  <Label>Şifre</Label>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="••••••••"
                    required
                    className="bg-secondary/50 border-border"
                    data-testid="user-password-input"
                  />
                </div>
                <div>
                  <Label>Ad Soyad</Label>
                  <Input
                    value={form.full_name}
                    onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                    placeholder="Ad Soyad"
                    required
                    className="bg-secondary/50 border-border"
                    data-testid="user-fullname-input"
                  />
                </div>
                <div>
                  <Label>Rol</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="bg-secondary/50 border-border" data-testid="user-role-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="operator">Operatör</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Operatör: Sadece izleme yapabilir. Admin: Tüm yetkilere sahip.
                  </p>
                </div>
                
                {/* Permission Section */}
                <PermissionSection 
                  formState={form} 
                  formSetter={setForm} 
                  isOperator={form.role === 'operator'}
                />
                
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="border-border text-foreground">İptal</Button>
                  </DialogClose>
                  <Button type="submit" data-testid="user-submit-btn">Ekle</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="page-content">
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-blue-500/10 border border-blue-500/30">
            <div className="flex items-center gap-3">
              <Shield className="w-8 h-8 text-blue-500" />
              <div>
                <h3 className="font-semibold text-blue-500">Admin</h3>
                <p className="text-sm text-muted-foreground">
                  VMS, mağaza, kamera yönetimi ve kullanıcı ekleme yetkisi
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-3">
              <User className="w-8 h-8 text-emerald-500" />
              <div>
                <h3 className="font-semibold text-emerald-500">Operatör</h3>
                <p className="text-sm text-muted-foreground">
                  Sadece yetkili mağazaların verilerini izleyebilir
                </p>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="store-card loading-skeleton h-20" />
            ))}
          </div>
        ) : users.length > 0 ? (
          <div className="space-y-4">
            {users.map((user) => (
              <div 
                key={user.id} 
                className={`store-card flex items-center justify-between ${!user.is_active ? 'opacity-50' : ''}`}
                data-testid={`user-card-${user.id}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 flex items-center justify-center ${
                    user.role === 'admin' ? 'bg-blue-500/20' : 'bg-emerald-500/20'
                  }`}>
                    {user.role === 'admin' ? (
                      <Shield className="w-6 h-6 text-blue-500" />
                    ) : (
                      <User className="w-6 h-6 text-emerald-500" />
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold">{user.full_name}</h3>
                    <p className="text-sm text-muted-foreground">@{user.username}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 ${
                        user.role === 'admin' ? 'bg-blue-500/20 text-blue-500' : 'bg-emerald-500/20 text-emerald-500'
                      }`}>
                        {user.role === 'admin' ? 'Admin' : 'Operatör'}
                      </span>
                      {!user.is_active && (
                        <span className="text-xs px-2 py-0.5 bg-red-500/20 text-red-500">
                          Devre Dışı
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400">
                        {getPermissionSummary(user)}
                      </span>
                    </div>
                  </div>
                </div>
                {user.username !== currentUser?.username ? (
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEdit(user)}
                      className="border-border text-foreground"
                      data-testid={`edit-user-${user.id}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleToggle(user.id)}
                      className="border-border text-foreground"
                    >
                      {user.is_active ? (
                        <UserX className="w-4 h-4" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleDelete(user.id)}
                      className="border-border text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleEdit(user)}
                      className="border-border text-foreground"
                      data-testid={`edit-self-${user.id}`}
                    >
                      <Pencil className="w-4 h-4 mr-1" />
                      Şifre Değiştir
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Henüz kullanıcı eklenmedi.</p>
          </div>
        )}
      </div>

      {/* Edit User Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Kullanıcı Düzenle</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEditSubmit} className="space-y-4">
            <div>
              <Label>Kullanıcı Adı</Label>
              <Input
                value={editingUser?.username || ''}
                disabled
                className="bg-secondary/30 border-border opacity-60"
              />
              <p className="text-xs text-muted-foreground mt-1">Kullanıcı adı değiştirilemez</p>
            </div>
            <div>
              <Label>Ad Soyad</Label>
              <Input
                value={editForm.full_name}
                onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
                placeholder="Ad Soyad"
                required
                className="bg-secondary/50 border-border"
                data-testid="edit-user-fullname"
              />
            </div>
            <div>
              <Label>Yeni Şifre (Opsiyonel)</Label>
              <Input
                type="password"
                value={editForm.password}
                onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                placeholder="Değiştirmek için yeni şifre girin"
                className="bg-secondary/50 border-border"
                data-testid="edit-user-password"
              />
              <p className="text-xs text-muted-foreground mt-1">Boş bırakırsanız şifre değişmez</p>
            </div>
            <div>
              <Label>Rol</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger className="bg-secondary/50 border-border" data-testid="edit-user-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="operator">Operatör</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* Permission Section */}
            <PermissionSection 
              formState={editForm} 
              formSetter={setEditForm} 
              isOperator={editForm.role === 'operator'}
            />
            
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline" className="border-border text-foreground">İptal</Button>
              </DialogClose>
              <Button type="submit" data-testid="edit-user-submit">Güncelle</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default UsersPage;
