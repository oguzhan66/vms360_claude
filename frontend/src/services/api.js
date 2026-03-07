import axios from 'axios';

const BACKEND_URL = '';
const API = `${BACKEND_URL}/api`;

const api = axios.create({
  baseURL: API,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Token refresh state
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request interceptor - add token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // If 401 and not already retrying
    if (error.response?.status === 401 && !originalRequest._retry) {
      // Skip refresh for login endpoint
      if (originalRequest.url.includes('/auth/login')) {
        return Promise.reject(error);
      }
      
      if (isRefreshing) {
        // Queue requests while refreshing
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }
      
      originalRequest._retry = true;
      isRefreshing = true;
      
      const refreshToken = localStorage.getItem('refresh_token');
      
      if (!refreshToken) {
        // No refresh token, redirect to login
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        window.location.href = '/login';
        return Promise.reject(error);
      }
      
      try {
        // Call refresh endpoint
        const response = await axios.post(`${API}/auth/refresh`, null, {
          params: { refresh_token: refreshToken }
        });
        
        const { access_token, refresh_token: newRefreshToken } = response.data;
        
        // Store new tokens
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', newRefreshToken);
        
        // Update auth header
        api.defaults.headers.Authorization = `Bearer ${access_token}`;
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        
        processQueue(null, access_token);
        
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        // Refresh failed, clear tokens and redirect
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    
    return Promise.reject(error);
  }
);

// VMS Server APIs
export const vmsApi = {
  getAll: () => api.get('/vms'),
  getById: (id) => api.get(`/vms/${id}`),
  create: (data) => api.post('/vms', data),
  update: (id, data) => api.put(`/vms/${id}`, data),
  delete: (id) => api.delete(`/vms/${id}`),
  test: (id) => api.get(`/vms/${id}/test`),
  fetchCameras: (id) => api.get(`/vms/${id}/cameras`),
  importCameras: (id, data) => api.post(`/vms/${id}/import-cameras`, data),
  syncCameras: (id, storeId = null) => api.post(`/vms/${id}/sync-cameras`, null, { params: { store_id: storeId } }),
  updateCameraNames: (id) => api.post(`/vms/${id}/update-camera-names`),
  syncAllCameras: (id) => api.post(`/vms/${id}/sync-all-cameras`),
  syncAllVms: () => api.post('/vms/sync-all'),
};

// Location APIs
export const locationApi = {
  // Regions
  getRegions: () => api.get('/regions'),
  createRegion: (data) => api.post('/regions', data),
  deleteRegion: (id) => api.delete(`/regions/${id}`),
  
  // Cities
  getCities: (regionId = null) => api.get('/cities', { params: { region_id: regionId } }),
  createCity: (data) => api.post('/cities', data),
  deleteCity: (id) => api.delete(`/cities/${id}`),
  
  // Districts
  getDistricts: (cityId = null) => api.get('/districts', { params: { city_id: cityId } }),
  createDistrict: (data) => api.post('/districts', data),
  deleteDistrict: (id) => api.delete(`/districts/${id}`),
  
  // Full hierarchy
  getHierarchy: () => api.get('/hierarchy'),
};

// Store APIs
export const storeApi = {
  getAll: (params = {}) => api.get('/stores', { params }),
  getById: (id) => api.get(`/stores/${id}`),
  create: (data) => api.post('/stores', data),
  update: (id, data) => api.put(`/stores/${id}`, data),
  delete: (id) => api.delete(`/stores/${id}`),
};

// Camera APIs
export const cameraApi = {
  getAll: (storeId = null) => api.get('/cameras', { params: { store_id: storeId } }),
  create: (data) => api.post('/cameras', data),
  delete: (id) => api.delete(`/cameras/${id}`),
};

// Settings APIs
export const settingsApi = {
  get: () => api.get('/settings'),
  update: (data) => api.put('/settings', data),
};

// Live Data APIs
export const liveDataApi = {
  getCounter: (storeIds = null) => api.get('/live/counter', { params: { store_ids: storeIds } }),
  getQueue: (storeIds = null) => api.get('/live/queue', { params: { store_ids: storeIds } }),
  getAnalytics: (params = {}) => api.get('/live/analytics', { params }),
  getAnalyticsByStore: (params = {}) => api.get('/live/analytics/stores', { params }),
};

// Report APIs
export const reportApi = {
  getSummary: (params = {}) => api.get('/reports/summary', { params }),
  getCounter: (params = {}) => api.get('/reports/counter', { params }),
  getQueue: (params = {}) => api.get('/reports/queue', { params }),
  getAnalytics: (params = {}) => api.get('/reports/analytics', { params }),
  export: (reportType = 'counter', format = 'json', params = {}) => api.get('/reports/export', { 
    params: { report_type: reportType, format, ...params },
    responseType: format === 'json' ? 'json' : 'blob'
  }),
  exportPdf: (reportType = 'counter', params = {}) => api.get('/reports/export/pdf', {
    params: { report_type: reportType, ...params },
    responseType: 'blob'
  }),
  // Advanced reports
  getHourlyTraffic: (params = {}) => api.get('/reports/advanced/hourly-traffic', { params }),
  getWeekdayComparison: (params = {}) => api.get('/reports/advanced/weekday-comparison', { params }),
  getStoreComparison: (params = {}) => api.get('/reports/advanced/store-comparison', { params }),
  getQueueAnalysis: (params = {}) => api.get('/reports/advanced/queue-analysis', { params }),
  getDemographics: (params = {}) => api.get('/reports/advanced/demographics', { params }),
};

// Historical Data APIs
export const historicalApi = {
  getCounter: (params = {}) => api.get('/historical/counter', { params }),
  getQueue: (params = {}) => api.get('/historical/queue', { params }),
  getAnalytics: (params = {}) => api.get('/historical/analytics', { params }),
  getSummary: (params = {}) => api.get('/historical/summary', { params }),
  collectNow: () => api.post('/historical/collect-now'),
};

// SMTP Settings APIs
export const smtpApi = {
  get: () => api.get('/settings/smtp'),
  save: (data) => api.post('/settings/smtp', data),
  test: (testEmail) => api.post('/settings/smtp/test', { test_email: testEmail }),
};

// Scheduled Reports APIs
export const scheduledReportApi = {
  getAll: () => api.get('/scheduled-reports'),
  create: (data) => api.post('/scheduled-reports-v2', data),
  update: (id, data) => api.put(`/scheduled-reports/${id}`, data),
  delete: (id) => api.delete(`/scheduled-reports/${id}`),
  sendNow: (id) => api.post(`/scheduled-reports/${id}/send-now`),
};

// Floor Management APIs
export const floorApi = {
  getAll: (storeId = null) => api.get('/floors', { params: { store_id: storeId } }),
  getById: (id) => api.get(`/floors/${id}`),
  create: (data) => api.post('/floors', data),
  update: (id, data) => api.put(`/floors/${id}`, data),
  delete: (id) => api.delete(`/floors/${id}`),
  uploadPlan: (id, formData) => api.post(`/floors/${id}/upload-plan`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  getCameras: (id) => api.get(`/floors/${id}/cameras`),
  getAvailableCameras: (id) => api.get(`/floors/${id}/available-cameras`),
  updateCameraPosition: (floorId, cameraId, data) => api.put(`/floors/${floorId}/cameras/${cameraId}/position`, data),
  removeCameraFromFloor: (floorId, cameraId) => api.delete(`/floors/${floorId}/cameras/${cameraId}/position`),
  // Zone management
  getZones: (floorId) => api.get(`/floors/${floorId}/zones`),
  addZone: (floorId, data) => api.post(`/floors/${floorId}/zones`, data),
  updateZone: (floorId, zoneId, data) => api.put(`/floors/${floorId}/zones/${zoneId}`, data),
  deleteZone: (floorId, zoneId) => api.delete(`/floors/${floorId}/zones/${zoneId}`),
};

// Heatmap APIs
export const heatmapApi = {
  getLive: (floorId) => api.get(`/heatmap/live/${floorId}`),
  getRange: (floorId, params) => api.get(`/heatmap/range/${floorId}`, { params }),
  getStoresWithFloors: () => api.get('/heatmap/stores-with-floors'),
  exportPdf: (data) => api.post('/heatmap/export/pdf', data),
};

// Health Check APIs (P0: Veri gelmeme alarmı)
export const healthApi = {
  getStatus: () => api.get('/health'),
  getStoresHealth: () => api.get('/health/stores'),
};

export default api;
