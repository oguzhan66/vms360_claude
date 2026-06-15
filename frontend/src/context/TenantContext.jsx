import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { tenantsApi } from '../services/api';

const TenantContext = createContext(null);

export function TenantProvider({ children }) {
  const { isSuperAdmin, user } = useAuth();
  const [tenants, setTenants] = useState([]);
  const [currentTenant, setCurrentTenant] = useState(null);
  const [activeTenantId, setActiveTenantIdState] = useState(() => {
    return localStorage.getItem('activeTenantId') || null;
  });

  const loadTenants = useCallback(async () => {
    if (!isSuperAdmin) return;
    try {
      const res = await tenantsApi.getAll();
      setTenants(res.data || []);
    } catch {
      setTenants([]);
    }
  }, [isSuperAdmin]);

  const loadCurrentTenant = useCallback(async () => {
    if (isSuperAdmin || !user?.tenant_id) return;
    try {
      const res = await tenantsApi.getMy();
      setCurrentTenant(res.data || null);
    } catch {
      setCurrentTenant(null);
    }
  }, [isSuperAdmin, user?.tenant_id]);

  useEffect(() => {
    if (isSuperAdmin) {
      loadTenants();
      setCurrentTenant(null);
    } else {
      setTenants([]);
      setActiveTenantIdState(null);
      localStorage.removeItem('activeTenantId');
      loadCurrentTenant();
    }
  }, [isSuperAdmin, loadTenants, loadCurrentTenant]);

  const setActiveTenantId = (id) => {
    setActiveTenantIdState(id);
    if (id) {
      localStorage.setItem('activeTenantId', id);
    } else {
      localStorage.removeItem('activeTenantId');
    }
  };

  const activeTenant = tenants.find(t => t.id === activeTenantId) || null;

  return (
    <TenantContext.Provider value={{ tenants, activeTenantId, activeTenant, currentTenant, setActiveTenantId, loadTenants }}>
      {children}
    </TenantContext.Provider>
  );
}

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant must be used within TenantProvider');
  return ctx;
}
