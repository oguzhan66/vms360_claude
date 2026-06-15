import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  Store,
  Settings,
  Cctv,
  FileText,
  Sun,
  Moon,
  LogOut,
  UserCog,
  CalendarClock,
  Flame,
  Layers,
  Menu,
  X,
  Building2,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { Button } from './ui/button';

const SU   = ['super_admin'];
const AD   = ['admin', 'super_admin'];
const ALL  = ['admin', 'operator', 'super_admin'];

const allNavItems = [
  // ── Sistem Yöneticisi ──────────────────────────
  { path: '/tenants',           icon: Building2,       label: 'Tenant Yönetimi',        roles: SU  },
  { path: '/vms',               icon: Server,          label: 'VMS Yönetimi',           roles: SU  },
  // ── Admin + Sistem Yöneticisi ──────────────────
  { path: '/stores',            icon: Store,           label: 'Sahalar / Lokasyonlar',  roles: AD  },
  { path: '/cameras',           icon: Cctv,            label: 'Kameralar',              roles: AD  },
  // ── Tüm roller ────────────────────────────────
  { path: '/',                  icon: LayoutDashboard, label: 'Dashboard',              roles: ALL },
  { path: '/alarm-heatmap',     icon: Flame,           label: 'Alarm Haritası',         roles: ALL },
  { path: '/floor-plans',       icon: Layers,          label: 'Bölge Planları',         roles: AD  },
  { path: '/reports',           icon: FileText,        label: 'Raporlar',               roles: ALL },
  { path: '/scheduled-reports', icon: CalendarClock,   label: 'Planlı Raporlar',        roles: AD  },
  { path: '/users',             icon: UserCog,         label: 'Kullanıcılar',           roles: AD  },
  { path: '/settings',          icon: Settings,        label: 'Ayarlar',                roles: AD  },
];

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_retail-footfall/artifacts/bjfv2q4b_image.png';

export const Layout = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin, isSuperAdmin } = useAuth();
  const { tenants, activeTenantId, setActiveTenantId, currentTenant, activeTenant } = useTenant();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const closeSidebar = () => setSidebarOpen(false);

  // Filter nav items based on user role
  const navItems = allNavItems.filter(item =>
    item.roles.includes(user?.role || 'operator')
  );

  return (
    <div className="app-container">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="sidebar-overlay" onClick={closeSidebar} />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`} data-testid="sidebar">

        {/* ── Rol Renk Bandı ── */}
        <div className={`w-full px-4 py-2 text-xs font-semibold tracking-wide text-white flex items-center gap-2 ${
          isSuperAdmin
            ? 'bg-gradient-to-r from-rose-700 to-red-600'
            : isAdmin
              ? 'bg-gradient-to-r from-indigo-600 to-violet-600'
              : 'bg-gradient-to-r from-teal-600 to-emerald-600'
        }`}>
          <span className="w-2 h-2 rounded-full bg-white/70 inline-block shrink-0" />
          <span className="truncate">
            {isSuperAdmin
              ? (activeTenant ? `${activeTenant.name} — Sistem Yöneticisi` : 'Sistem Yöneticisi')
              : isAdmin
                ? (currentTenant ? currentTenant.name : 'Yönetici Paneli')
                : (currentTenant ? currentTenant.name : 'Operatör Paneli')}
          </span>
        </div>

        <div className="sidebar-header relative">
          {/* Theme Toggle */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-8 h-8 p-0 absolute top-2 right-2"
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {/* Logo */}
          <div className="flex items-center gap-4 pr-10">
            <img src={LOGO_URL} alt="VMS360 Logo" className="w-20 h-20 object-contain rounded-xl" />
            <div className="flex flex-col">
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
                VMS360
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Stats & LPR
              </span>
            </div>
          </div>
        </div>

        {/* User Info */}
        {user && (
          <div className="px-4 py-3 border-b border-border">
            <div className="text-sm font-medium truncate">{user.full_name}</div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <span>@{user.username}</span>
              <span className={`px-1.5 py-0.5 text-[10px] rounded ${
                isSuperAdmin ? 'bg-rose-500/20 text-rose-400'
                : isAdmin ? 'bg-indigo-500/20 text-indigo-400'
                : 'bg-teal-500/20 text-teal-400'
              }`}>
                {isSuperAdmin ? 'Sistem Yöneticisi' : isAdmin ? 'Yönetici' : 'Operatör'}
              </span>
            </div>
          </div>
        )}

        {/* Tenant Selector — super_admin only */}
        {isSuperAdmin && (
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted-foreground mb-1.5 font-medium uppercase tracking-wide">Çalışılan Müşteri</div>
            <select
              value={activeTenantId || ''}
              onChange={e => { setActiveTenantId(e.target.value || null); window.location.reload(); }}
              className="w-full text-xs rounded border border-border bg-background text-foreground px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">— Tüm Müşteriler —</option>
              {tenants.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            {activeTenantId && (
              <div className="mt-1 text-[10px] text-rose-400">
                Sadece bu müşterinin verisi görünür
              </div>
            )}
          </div>
        )}
        
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={closeSidebar}
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
              data-testid={`nav-${item.path.replace('/', '') || 'dashboard'}`}
            >
              <item.icon />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        
        <div className="mt-auto p-4 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            className="w-full justify-start text-foreground hover:text-primary hover:bg-destructive/10"
            data-testid="logout-btn"
          >
            <LogOut className="w-4 h-4 mr-2" />
            <span className="font-medium">Çıkış Yap</span>
          </Button>
          <div className="text-xs text-muted-foreground mt-3 text-center">
            <div className="font-semibold bg-gradient-to-r from-blue-400/70 to-cyan-400/70 bg-clip-text text-transparent">
              VMS360 Stats &amp; LPR
            </div>
            <div className="mt-1 opacity-50 text-[10px]">v1.0.0</div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {/* Mobile hamburger button */}
        <button
          className="mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Menüyü aç"
        >
          <Menu className="w-5 h-5" />
        </button>
        {children}
      </main>
    </div>
  );
};

export default Layout;
