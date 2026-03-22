import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  ListOrdered,
  BarChart3,
  Server,
  Store,
  Settings,
  Cctv,
  FileText,
  Sun,
  Moon,
  LogOut,
  UserCog,
  TrendingUp,
  CalendarClock,
  Activity,
  Layers,
  ThermometerSun,
  Menu,
  X
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/button';

const allNavItems = [
  { path: '/', icon: LayoutDashboard, label: 'Dashboard', roles: ['admin', 'operator'] },
  { path: '/counter', icon: Users, label: 'Kişi Sayma', roles: ['admin', 'operator'] },
  { path: '/queue', icon: ListOrdered, label: 'Kuyruk Analizi', roles: ['admin', 'operator'] },
  { path: '/analytics', icon: BarChart3, label: 'Yaş/Cinsiyet', roles: ['admin', 'operator'] },
  { path: '/heatmap', icon: ThermometerSun, label: 'Isı Haritası', roles: ['admin', 'operator'] },
  { path: '/reports', icon: FileText, label: 'Raporlar', roles: ['admin', 'operator'] },
  { path: '/advanced-reports', icon: TrendingUp, label: 'Gelişmiş Raporlar', roles: ['admin', 'operator'] },
  { path: '/advanced-analytics', icon: Activity, label: 'Gelişmiş Analitik', roles: ['admin', 'operator'] },
  { path: '/scheduled-reports', icon: CalendarClock, label: 'Planlı Raporlar', roles: ['admin'] },
  { path: '/vms', icon: Server, label: 'VMS Yönetimi', roles: ['admin'] },
  { path: '/stores', icon: Store, label: 'Mağazalar', roles: ['admin'] },
  { path: '/floor-plans', icon: Layers, label: 'Kat Planları', roles: ['admin'] },
  { path: '/cameras', icon: Cctv, label: 'Kameralar', roles: ['admin'] },
  { path: '/users', icon: UserCog, label: 'Kullanıcılar', roles: ['admin'] },
  { path: '/settings', icon: Settings, label: 'Ayarlar', roles: ['admin'] },
];

const LOGO_URL = 'https://customer-assets.emergentagent.com/job_retail-footfall/artifacts/bjfv2q4b_image.png';

export const Layout = ({ children }) => {
  const { theme, toggleTheme } = useTheme();
  const { user, logout, isAdmin } = useAuth();
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
        <div className="sidebar-header relative">
          {/* Theme Toggle - Top Right */}
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleTheme}
            className="w-8 h-8 p-0 absolute top-2 right-2"
            data-testid="theme-toggle"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
          
          {/* Logo and Brand */}
          <div className="flex items-center gap-4 pr-10">
            <img 
              src={LOGO_URL} 
              alt="VMS360 Logo" 
              className="w-20 h-20 object-contain rounded-xl"
            />
            <div className="flex flex-col">
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
                VMS360
              </span>
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest">
                Retail Panel
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
              <span className={`px-1.5 py-0.5 text-[10px] ${
                isAdmin ? 'bg-blue-500/20 text-blue-500' : 'bg-emerald-500/20 text-emerald-500'
              }`}>
                {isAdmin ? 'Admin' : 'Operatör'}
              </span>
            </div>
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
              VMS360 Retail Panel
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
