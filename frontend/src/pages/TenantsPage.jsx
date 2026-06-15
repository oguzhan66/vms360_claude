import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '../components/ui/dialog';
import {
  Building2, Plus, Trash2, Pencil, BarChart3, Store, Camera, Users,
  UserCog, KeyRound, CheckCircle2, AlertCircle, ChevronDown, ChevronUp,
  UserPlus, X, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { tenantsApi } from '../services/api';
import api from '../services/api';

const PLAN_LABELS = { basic: 'Temel', pro: 'Pro', enterprise: 'Kurumsal' };
const PLAN_COLORS = {
  basic: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  pro: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  enterprise: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
};

const defaultTenantForm = { name: '', slug: '', plan: 'basic', max_stores: 10, max_cameras: 50 };
const defaultAdminForm = { full_name: '', username: '', password: '' };
const defaultUserForm = { full_name: '', username: '', password: '', role: 'operator' };

const slugify = (val) => val.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

const TenantsPage = () => {
  const [tenants, setTenants] = useState([]);
  const [tenantAdmins, setTenantAdmins] = useState({});
  const [tenantUsers, setTenantUsers] = useState({});   // {tenantId: [all users]}
  const [expandedTenant, setExpandedTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Tenant dialogs
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState(null);
  const [tenantForm, setTenantForm] = useState(defaultTenantForm);

  // Admin (main) dialog
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminTenant, setAdminTenant] = useState(null);
  const [adminForm, setAdminForm] = useState(defaultAdminForm);
  const [adminCreated, setAdminCreated] = useState(false);

  // Sub-user dialog
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserTenantId, setAddUserTenantId] = useState(null);
  const [userForm, setUserForm] = useState(defaultUserForm);

  // Stats dialog
  const [statsOpen, setStatsOpen] = useState(false);
  const [stats, setStats] = useState(null);

  const loadTenants = async () => {
    setLoading(true);
    try {
      const res = await tenantsApi.getAll();
      setTenants(res.data);
    } catch {
      toast.error('Tenant listesi yüklenemedi');
    } finally {
      setLoading(false);
    }
  };

  const loadAdmins = useCallback(async (tenantList) => {
    const results = {};
    await Promise.all(tenantList.map(async (t) => {
      try {
        const res = await api.get('/users', { params: { tenant_id: t.id } });
        const users = res.data.filter(u => u.tenant_id === t.id);
        const admins = users.filter(u => u.role === 'admin');
        results[t.id] = admins[0] || null;
      } catch {
        results[t.id] = null;
      }
    }));
    setTenantAdmins(results);
  }, []);

  const loadTenantUsers = async (tenantId) => {
    try {
      const res = await api.get('/users', { params: { tenant_id: tenantId } });
      setTenantUsers(prev => ({ ...prev, [tenantId]: res.data.filter(u => u.tenant_id === tenantId) }));
    } catch {
      toast.error('Kullanıcılar yüklenemedi');
    }
  };

  const toggleExpand = (tenantId) => {
    if (expandedTenant === tenantId) {
      setExpandedTenant(null);
    } else {
      setExpandedTenant(tenantId);
      loadTenantUsers(tenantId);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  useEffect(() => {
    if (tenants.length > 0) loadAdmins(tenants);
  }, [tenants, loadAdmins]);

  // ===== TENANT CRUD =====
  const handleCreate = async () => {
    if (!tenantForm.name || !tenantForm.slug) return toast.error('Ad ve şirket kodu zorunludur');
    setSaving(true);
    try {
      const res = await tenantsApi.create({
        ...tenantForm,
        max_stores: Number(tenantForm.max_stores),
        max_cameras: Number(tenantForm.max_cameras),
      });
      toast.success('Müşteri oluşturuldu');
      setCreateOpen(false);
      setTenantForm(defaultTenantForm);
      await loadTenants();
      // Immediately open admin creation for the new tenant
      setAdminTenant(res.data);
      setAdminForm(defaultAdminForm);
      setAdminCreated(false);
      setAdminOpen(true);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    setSaving(true);
    try {
      await tenantsApi.update(editingTenant.id, {
        ...tenantForm,
        max_stores: Number(tenantForm.max_stores),
        max_cameras: Number(tenantForm.max_cameras),
        is_active: editingTenant.is_active,
      });
      toast.success('Müşteri güncellendi');
      setEditOpen(false);
      loadTenants();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Hata oluştu');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (tenant) => {
    try {
      await tenantsApi.update(tenant.id, { is_active: !tenant.is_active });
      toast.success(tenant.is_active ? 'Pasif yapıldı' : 'Aktifleştirildi');
      loadTenants();
    } catch { toast.error('Durum güncellenemedi'); }
  };

  const handleDelete = async (tenant) => {
    if (!window.confirm(`"${tenant.name}" ve tüm verileri silinecek. Emin misiniz?`)) return;
    try {
      await tenantsApi.delete(tenant.id);
      toast.success('Müşteri silindi');
      loadTenants();
    } catch (e) { toast.error(e.response?.data?.detail || 'Silinemedi'); }
  };

  const handleShowStats = async (tenant) => {
    try {
      const res = await tenantsApi.getStats(tenant.id);
      setStats(res.data);
      setStatsOpen(true);
    } catch { toast.error('İstatistikler yüklenemedi'); }
  };

  const openEdit = (tenant) => {
    setEditingTenant(tenant);
    setTenantForm({
      name: tenant.name, slug: tenant.slug,
      plan: tenant.plan, max_stores: tenant.max_stores, max_cameras: tenant.max_cameras,
    });
    setEditOpen(true);
  };

  // ===== SUB-USER MANAGEMENT =====
  const openAddUser = (tenantId) => {
    setAddUserTenantId(tenantId);
    setUserForm(defaultUserForm);
    setAddUserOpen(true);
  };

  const handleAddUser = async () => {
    if (!userForm.full_name || !userForm.username || !userForm.password) return toast.error('Tüm alanlar zorunludur');
    setSaving(true);
    try {
      await api.post('/auth/register', { ...userForm, tenant_id: addUserTenantId });
      toast.success('Kullanıcı oluşturuldu');
      setAddUserOpen(false);
      loadTenantUsers(addUserTenantId);
      loadTenants();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Kullanıcı oluşturulamadı');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId, tenantId) => {
    if (!window.confirm('Kullanıcı silinecek. Emin misiniz?')) return;
    try {
      await api.delete(`/users/${userId}`);
      toast.success('Silindi');
      loadTenantUsers(tenantId);
      loadTenants();
    } catch { toast.error('Silinemedi'); }
  };

  const handleToggleUser = async (userId, tenantId) => {
    try {
      await api.put(`/users/${userId}/toggle`);
      loadTenantUsers(tenantId);
    } catch { toast.error('Durum güncellenemedi'); }
  };

  // ===== ADMIN MANAGEMENT =====
  const openAdminDialog = (tenant) => {
    setAdminTenant(tenant);
    setAdminForm(defaultAdminForm);
    setAdminCreated(false);
    setAdminOpen(true);
  };

  const handleSaveAdmin = async () => {
    if (!adminForm.full_name || !adminForm.username || !adminForm.password) {
      return toast.error('Tüm alanlar zorunludur');
    }
    setSaving(true);
    try {
      // If admin already exists, delete them first (reset)
      const existing = tenantAdmins[adminTenant.id];
      if (existing) {
        await api.delete(`/users/${existing.id}`);
      }
      await api.post('/auth/register', {
        full_name: adminForm.full_name,
        username: adminForm.username,
        password: adminForm.password,
        role: 'admin',
        tenant_id: adminTenant.id,
      });
      setAdminCreated(true);
      await loadTenants();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Kullanıcı oluşturulamadı');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Tenant Yönetimi</h1>
            <span className="text-sm text-muted-foreground ml-2">{tenants.length} müşteri</span>
          </div>
          <Button onClick={() => { setTenantForm(defaultTenantForm); setCreateOpen(true); }}>
            <Plus className="w-4 h-4 mr-2" /> Yeni Müşteri
          </Button>
        </div>

        {/* Tenant List */}
        {loading ? (
          <div className="text-center py-12 text-muted-foreground">Yükleniyor...</div>
        ) : tenants.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">Henüz müşteri yok. "Yeni Müşteri" ile başlayın.</div>
        ) : (
          <div className="space-y-3">
            {tenants.map((t) => {
              const admin = tenantAdmins[t.id];
              return (
                <div key={t.id} className="border rounded-lg bg-card p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Left: Tenant Info */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{t.name}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PLAN_COLORS[t.plan] || ''}`}>
                            {PLAN_LABELS[t.plan] || t.plan}
                          </span>
                          {!t.is_active && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-200">Pasif</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">{t.slug}</span>
                          <span className="text-xs text-muted-foreground">·</span>
                          <span className="text-xs text-muted-foreground">Şirket kodu: <strong className="font-mono">{t.slug}</strong></span>
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-1.5 flex-wrap">
                          <span className="flex items-center gap-1"><Store className="w-3 h-3" />{t.store_count}/{t.max_stores} lokasyon</span>
                          <span className="flex items-center gap-1"><Camera className="w-3 h-3" />{t.camera_count}/{t.max_cameras} kamera</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3" />{t.user_count} kullanıcı</span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Admin Status + Actions */}
                    <div className="flex flex-col gap-2 shrink-0">
                      {/* Admin Status */}
                      <div className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border ${
                        admin
                          ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300'
                          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {admin
                          ? <><CheckCircle2 className="w-3.5 h-3.5" /> Ana Admin: <strong>@{admin.username}</strong></>
                          : <><AlertCircle className="w-3.5 h-3.5" /> Ana admin tanımlanmamış</>
                        }
                      </div>

                      {/* Action Buttons */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Button size="sm" variant="outline" onClick={() => handleShowStats(t)} title="İstatistikler">
                          <BarChart3 className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEdit(t)} title="Düzenle">
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleToggleActive(t)}>
                          {t.is_active ? 'Pasif Yap' : 'Aktifleştir'}
                        </Button>
                        <Button
                          size="sm"
                          variant={admin ? 'outline' : 'default'}
                          onClick={() => openAdminDialog(t)}
                          className={!admin ? 'bg-amber-500 hover:bg-amber-600 text-white border-0' : ''}
                        >
                          {admin
                            ? <><KeyRound className="w-3.5 h-3.5 mr-1" /> Şifresi Sıfırla</>
                            : <><UserCog className="w-3.5 h-3.5 mr-1" /> Admin Oluştur</>
                          }
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => toggleExpand(t.id)} title="Kullanıcıları göster/gizle">
                          <Users className="w-3.5 h-3.5 mr-1" />
                          {expandedTenant === t.id ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDelete(t)} title="Sil">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Users Panel */}
                  {expandedTenant === t.id && (
                    <div className="border-t bg-muted/30 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium flex items-center gap-1.5">
                          <Users className="w-4 h-4" /> Kullanıcılar — {t.name}
                        </span>
                        <Button size="sm" onClick={() => openAddUser(t.id)}>
                          <UserPlus className="w-3.5 h-3.5 mr-1" /> Kullanıcı Ekle
                        </Button>
                      </div>

                      {!tenantUsers[t.id] ? (
                        <p className="text-sm text-muted-foreground">Yükleniyor...</p>
                      ) : tenantUsers[t.id].length === 0 ? (
                        <p className="text-sm text-muted-foreground">Henüz kullanıcı yok.</p>
                      ) : (
                        <div className="space-y-2">
                          {tenantUsers[t.id].map(u => (
                            <div key={u.id} className="flex items-center justify-between bg-background rounded-md px-3 py-2 border">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{u.full_name}</span>
                                <span className="text-xs text-muted-foreground">@{u.username}</span>
                                <span className={`text-xs px-1.5 py-0.5 rounded ${u.role === 'admin' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300'}`}>
                                  {u.role === 'admin' ? 'Admin' : 'Operatör'}
                                </span>
                                {!u.is_active && <span className="text-xs text-red-500">Pasif</span>}
                              </div>
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" onClick={() => handleToggleUser(u.id, t.id)} title={u.is_active ? 'Pasif yap' : 'Aktifleştir'}>
                                  {u.is_active ? <X className="w-3.5 h-3.5 text-red-500" /> : <Check className="w-3.5 h-3.5 text-green-500" />}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDeleteUser(u.id, t.id)}>
                                  <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Create Tenant Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Yeni Müşteri Ekle</DialogTitle></DialogHeader>
            <TenantForm form={tenantForm} setForm={setTenantForm} />
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">İptal</Button></DialogClose>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? 'Oluşturuluyor...' : 'Oluştur ve Admin Tanımla →'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Tenant Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Müşteri Düzenle</DialogTitle></DialogHeader>
            <TenantForm form={tenantForm} setForm={setTenantForm} />
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">İptal</Button></DialogClose>
              <Button onClick={handleEdit} disabled={saving}>{saving ? 'Kaydediliyor...' : 'Kaydet'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Admin Create/Reset Dialog */}
        <Dialog open={adminOpen} onOpenChange={(o) => { if (!o) { setAdminOpen(false); setAdminCreated(false); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserCog className="w-5 h-5" />
                {tenantAdmins[adminTenant?.id] ? 'Admin Şifresini Sıfırla' : 'Ana Admin Oluştur'}
                {adminTenant && (
                  <span className="text-sm font-normal text-muted-foreground">— {adminTenant.name}</span>
                )}
              </DialogTitle>
            </DialogHeader>

            {adminCreated ? (
              /* Success screen */
              <div className="space-y-4">
                <div className="rounded-lg border border-green-200 bg-green-50 dark:bg-green-950 dark:border-green-800 p-4">
                  <div className="flex items-center gap-2 text-green-700 dark:text-green-300 font-semibold mb-3">
                    <CheckCircle2 className="w-5 h-5" /> Hesap hazır!
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    Aşağıdaki bilgileri müşterinize iletin:
                  </p>
                  <div className="space-y-2 font-mono text-sm bg-background rounded p-3 border">
                    <div><span className="text-muted-foreground">Giriş adresi: </span><strong>localhost:3001</strong></div>
                    <div><span className="text-muted-foreground">Şirket kodu:  </span><strong>{adminTenant?.slug}</strong></div>
                    <div><span className="text-muted-foreground">Kullanıcı adı:</span><strong> {adminForm.username}</strong></div>
                    <div><span className="text-muted-foreground">Şifre:        </span><strong>{adminForm.password}</strong></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Müşteri giriş yaptıktan sonra kendi kullanıcılarını ve ayarlarını kendisi oluşturabilir.
                  </p>
                </div>
                <DialogFooter>
                  <Button onClick={() => { setAdminOpen(false); setAdminCreated(false); }}>Tamam</Button>
                </DialogFooter>
              </div>
            ) : (
              /* Form */
              <div className="space-y-4">
                {tenantAdmins[adminTenant?.id] && (
                  <div className="rounded-md bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
                    Mevcut admin (<strong>@{tenantAdmins[adminTenant?.id]?.username}</strong>) silinerek yeni bilgilerle değiştirilecek.
                  </div>
                )}
                <div className="space-y-1">
                  <Label>Ad Soyad</Label>
                  <Input
                    value={adminForm.full_name}
                    onChange={e => setAdminForm(f => ({ ...f, full_name: e.target.value }))}
                    placeholder="Ad Soyad"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Kullanıcı Adı</Label>
                  <Input
                    value={adminForm.username}
                    onChange={e => setAdminForm(f => ({ ...f, username: e.target.value }))}
                    placeholder="kullanici_adi"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Şifre</Label>
                  <Input
                    type="password"
                    value={adminForm.password}
                    onChange={e => setAdminForm(f => ({ ...f, password: e.target.value }))}
                    placeholder="••••••••"
                  />
                </div>
                <div className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Bu hesap <strong>Admin</strong> yetkisiyle oluşturulur. Müşteri giriş yaptıktan sonra
                  kendi operatörlerini <strong>Kullanıcılar</strong> sayfasından ekleyebilir.
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">İptal</Button></DialogClose>
                  <Button onClick={handleSaveAdmin} disabled={saving}>
                    {saving ? 'Oluşturuluyor...' : 'Hesabı Oluştur'}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Sub-User Dialog */}
        <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Kullanıcı Ekle
                <span className="text-sm font-normal text-muted-foreground">
                  — {tenants.find(t => t.id === addUserTenantId)?.name}
                </span>
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Ad Soyad</Label>
                <Input value={userForm.full_name} onChange={e => setUserForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Ad Soyad" />
              </div>
              <div className="space-y-1">
                <Label>Kullanıcı Adı</Label>
                <Input value={userForm.username} onChange={e => setUserForm(f => ({ ...f, username: e.target.value }))} placeholder="kullanici_adi" />
              </div>
              <div className="space-y-1">
                <Label>Şifre</Label>
                <Input type="password" value={userForm.password} onChange={e => setUserForm(f => ({ ...f, password: e.target.value }))} placeholder="••••••••" />
              </div>
              <div className="space-y-1">
                <Label>Rol</Label>
                <Select value={userForm.role} onValueChange={v => setUserForm(f => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin (Tüm yetki)</SelectItem>
                    <SelectItem value="operator">Operatör (Sadece görüntüleme)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground bg-muted rounded p-2">
                Giriş için şirket kodu: <strong className="font-mono">{tenants.find(t => t.id === addUserTenantId)?.slug}</strong>
              </p>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">İptal</Button></DialogClose>
              <Button onClick={handleAddUser} disabled={saving}>{saving ? 'Oluşturuluyor...' : 'Oluştur'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stats Dialog */}
        <Dialog open={statsOpen} onOpenChange={setStatsOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Kullanım — {stats?.tenant?.name}</DialogTitle></DialogHeader>
            {stats && (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Lokasyonlar', value: `${stats.usage?.stores} / ${stats.usage?.store_limit}`, pct: stats.usage?.store_usage_pct },
                  { label: 'Kameralar', value: `${stats.usage?.cameras} / ${stats.usage?.camera_limit}`, pct: stats.usage?.camera_usage_pct },
                  { label: 'Kullanıcılar', value: stats.usage?.users },
                  { label: 'Snapshot', value: stats.usage?.snapshots?.toLocaleString() },
                ].map(({ label, value, pct }) => (
                  <div key={label} className="border rounded p-3">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="font-semibold">{value}</p>
                    {pct !== undefined && (
                      <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-primary'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild><Button variant="outline">Kapat</Button></DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
};

const TenantForm = ({ form, setForm }) => (
  <div className="space-y-4">
    <div className="space-y-1">
      <Label>Müşteri Adı</Label>
      <Input
        value={form.name}
        onChange={e => setForm(f => ({ ...f, name: e.target.value, slug: slugify(e.target.value) }))}
        placeholder="Örn: ABC Perakende"
      />
    </div>
    <div className="space-y-1">
      <Label>
        Şirket Kodu
        <span className="text-xs text-muted-foreground font-normal ml-1">(giriş ekranında kullanılır)</span>
      </Label>
      <Input
        value={form.slug}
        onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
        placeholder="abc-perakende"
      />
    </div>
    <div className="space-y-1">
      <Label>Paket</Label>
      <Select value={form.plan} onValueChange={v => setForm(f => ({ ...f, plan: v }))}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="basic">Temel</SelectItem>
          <SelectItem value="pro">Pro</SelectItem>
          <SelectItem value="enterprise">Kurumsal</SelectItem>
        </SelectContent>
      </Select>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label>Maks. Lokasyon</Label>
        <Input type="number" min={1} value={form.max_stores} onChange={e => setForm(f => ({ ...f, max_stores: e.target.value }))} />
      </div>
      <div className="space-y-1">
        <Label>Maks. Kamera</Label>
        <Input type="number" min={1} value={form.max_cameras} onChange={e => setForm(f => ({ ...f, max_cameras: e.target.value }))} />
      </div>
    </div>
  </div>
);

export default TenantsPage;
