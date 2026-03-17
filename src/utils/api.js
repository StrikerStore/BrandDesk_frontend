import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3001',
  withCredentials: true,
});

// In production cross-domain setups, cookies may be blocked by SameSite rules.
// We also store the token in localStorage as fallback and send via Authorization header.
api.interceptors.request.use(config => {
  const token = localStorage.getItem('bd_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Threads
export const fetchThreads     = (params = {}) => api.get('/api/threads', { params });
export const fetchThread      = (id)          => api.get(`/api/threads/${id}`);
export const updateThread     = (id, data)    => api.patch(`/api/threads/${id}`, data);
export const resolveThread    = (id, data)    => api.post(`/api/threads/${id}/resolve`, data);
export const sendReply        = (gmailId, data) => api.post(`/api/threads/${gmailId}/reply`, data);
export const syncThreads      = ()            => api.post('/api/sync');
export const fullSyncThreads  = ()            => api.post('/api/sync?full=true');
export const fetchStats       = ()            => api.get('/api/threads/stats/overview');

// Customers
export const fetchCustomer       = (email)        => api.get(`/api/customers/${encodeURIComponent(email)}`);
export const updateCustomerNotes = (email, notes) => api.patch(`/api/customers/${encodeURIComponent(email)}/notes`, { notes });
export const createCustomer      = (data)         => api.post('/api/customers', data);

// Templates
export const fetchTemplates   = (params = {}) => api.get('/api/templates', { params });
export const createTemplate   = (data)        => api.post('/api/templates', data);
export const updateTemplate   = (id, data)    => api.put(`/api/templates/${id}`, data);
export const deleteTemplate   = (id)          => api.delete(`/api/templates/${id}`);
export const trackTemplateUse = (id)          => api.post(`/api/templates/${id}/use`);

// Brands
export const fetchBrands = () => api.get('/api/brands');

// Analytics
export const fetchAnalyticsOverview   = ()        => api.get('/api/analytics/overview');
export const fetchAnalyticsVolume     = (days=30) => api.get('/api/analytics/volume',        { params: { days } });
export const fetchAnalyticsByBrand    = ()        => api.get('/api/analytics/by-brand');
export const fetchAnalyticsByIssue    = ()        => api.get('/api/analytics/by-issue');
export const fetchAnalyticsResponse   = (days=30) => api.get('/api/analytics/response-time', { params: { days } });
export const fetchAnalyticsResolvedBy = ()        => api.get('/api/analytics/resolved-by');
export const fetchAnalyticsSla        = ()        => api.get('/api/analytics/sla');
export const fetchAnalyticsTemplates  = ()        => api.get('/api/analytics/templates');

// Saved views
export const fetchViews = ()       => api.get('/api/views');
export const createView = (data)   => api.post('/api/views', data);
export const deleteView = (id)     => api.delete(`/api/views/${id}`);

// Orders (external DB)
export const fetchOrder         = (orderId) => api.get(`/api/orders/${encodeURIComponent(orderId)}`);
export const fetchOrdersByEmail = (email)   => api.get(`/api/orders/customer/${encodeURIComponent(email)}`);

// AI text improvement (OpenRouter)
export const improveText = (text, mode) => api.post('/api/ai/improve', { text, mode });

// Settings
export const fetchSettings   = ()       => api.get('/api/settings');
export const updateSettings  = (data)   => api.patch('/api/settings', data);
export const testAutoAck     = ()       => api.post('/api/settings/test-auto-ack');
export const testAutoClose   = ()       => api.post('/api/settings/test-auto-close');

// User management (admin only)
export const fetchUsers      = ()         => api.get('/api/users');
export const createUser      = (data)     => api.post('/api/users', data);
export const updateUser      = (id, data) => api.patch(`/api/users/${id}`, data);
export const deactivateUser  = (id)       => api.delete(`/api/users/${id}`);

// Auth
export const loginUser = async (data) => {
  const res = await api.post('/api/users/login', data);
  if (res.data?.token) localStorage.setItem('bd_token', res.data.token);
  return res;
};
export const logoutUser = async () => {
  localStorage.removeItem('bd_token');
  return api.post('/api/users/logout');
};
export const fetchCurrentUser = () => api.get('/api/users/me');
export const updateCurrentUser= (data) => api.patch('/api/users/me', data);
export const fetchAuthStatus  = ()     => api.get('/auth/status');
export const logout           = ()     => { localStorage.removeItem('bd_token'); return api.post('/api/users/logout'); };

export default api;