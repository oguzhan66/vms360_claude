import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { TenantProvider } from "./context/TenantContext";

// Pages
import LoginPage from "./pages/LoginPage";
import Dashboard from "./pages/Dashboard";
import ReportsPage from "./pages/ReportsPage";
import ScheduledReportsPage from "./pages/ScheduledReportsPage";
import VMSPage from "./pages/VMSPage";
import FloorPlansPage from "./pages/FloorPlansPage";
import AlarmHeatmapPage from "./pages/AlarmHeatmapPage";
import StoresPage from "./pages/StoresPage";
import CamerasPage from "./pages/CamerasPage";
import UsersPage from "./pages/UsersPage";
import SettingsPage from "./pages/SettingsPage";
import TenantsPage from "./pages/TenantsPage";

// Protected Route Component
const ProtectedRoute = ({ children, adminOnly = false, superAdminOnly = false }) => {
  const { isAuthenticated, isAdmin, isSuperAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Yükleniyor...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (superAdminOnly && !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return children;
};

// Public Route (redirect if already logged in)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={
        <PublicRoute>
          <LoginPage />
        </PublicRoute>
      } />

      {/* Protected Routes - All Users */}
      <Route path="/" element={
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      } />
      <Route path="/floor-plans" element={
        <ProtectedRoute>
          <FloorPlansPage />
        </ProtectedRoute>
      } />
      <Route path="/alarm-heatmap" element={
        <ProtectedRoute>
          <AlarmHeatmapPage />
        </ProtectedRoute>
      } />
      <Route path="/reports" element={
        <ProtectedRoute>
          <ReportsPage />
        </ProtectedRoute>
      } />
      <Route path="/scheduled-reports" element={
        <ProtectedRoute requireAdmin>
          <ScheduledReportsPage />
        </ProtectedRoute>
      } />

      {/* Super Admin Only */}
      <Route path="/vms" element={
        <ProtectedRoute superAdminOnly>
          <VMSPage />
        </ProtectedRoute>
      } />
      {/* Admin + Super Admin */}
      <Route path="/stores" element={
        <ProtectedRoute adminOnly>
          <StoresPage />
        </ProtectedRoute>
      } />
      <Route path="/cameras" element={
        <ProtectedRoute adminOnly>
          <CamerasPage />
        </ProtectedRoute>
      } />
      <Route path="/users" element={
        <ProtectedRoute adminOnly>
          <UsersPage />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute adminOnly>
          <SettingsPage />
        </ProtectedRoute>
      } />

      {/* Super Admin Only Routes */}
      <Route path="/tenants" element={
        <ProtectedRoute superAdminOnly>
          <TenantsPage />
        </ProtectedRoute>
      } />

      {/* Catch all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <AuthProvider>
        <TenantProvider>
        <div className="App" data-testid="app-container">
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
          <Toaster 
            position="top-right" 
            toastOptions={{
              style: {
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                color: 'hsl(var(--foreground))',
              },
            }}
          />
        </div>
        </TenantProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
