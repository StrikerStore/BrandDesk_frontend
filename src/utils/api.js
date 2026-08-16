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

// ── Error handling ───────────────────────────────────────────────────────────
// Every caller used to dig `err.response?.data?.error || err.message` out by
// hand (20+ sites, several of which forgot and swallowed the failure). One
// interceptor normalises the shape and handles the two cases no individual
// caller can sensibly handle on its own: an expired session and a dead network.

// Set by App so the interceptor can drop the user back to login without
// importing React state.
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export function errorMessage(err, fallback = 'Something went wrong') {
  return err?.userMessage || err?.response?.data?.error || err?.message || fallback;
}

api.interceptors.response.use(
  res => res,
  err => {
    const status = err.response?.status;

    if (!err.response) {
      err.userMessage = navigator.onLine
        ? 'Could not reach the server. Check your connection and retry.'
        : 'You are offline. Changes will not be saved until you reconnect.';
    } else if (status === 401) {
      // Don't bounce on the auth probe itself — App uses its failure to decide
      // whether to render the login page in the first place.
      const isAuthProbe = err.config?.url?.includes('/api/users/me')
        || err.config?.url?.includes('/api/users/login');
      err.userMessage = 'Your session expired. Please sign in again.';
      if (!isAuthProbe) {
        localStorage.removeItem('bd_token');
        onUnauthorized?.();
      }
    } else if (status === 403) {
      err.userMessage = err.response.data?.error || 'You do not have permission to do that.';
    } else if (status >= 500) {
      err.userMessage = 'The server hit an error. Please retry in a moment.';
    }

    return Promise.reject(err);
  }
);

// Threads
export const fetchThreads     = (params = {}) => api.get('/api/threads', { params });
export const fetchThread      = (id)          => api.get(`/api/threads/${id}`);
export const updateThread     = (id, data)    => api.patch(`/api/threads/${id}`, data);
export const resolveThread    = (id, data)    => api.post(`/api/threads/${id}/resolve`, data);
// Let axios auto-set Content-Type (including boundary) for FormData; don't override it.
export const sendReply = (gmailId, data) => api.post(`/api/threads/${gmailId}/reply`, data);
export const syncThreads      = ()            => api.post('/api/sync');
export const createManualThread = (data)      => api.post('/api/threads/manual', data);
export const fullSyncThreads  = ()            => api.post('/api/sync?full=true');
export const fetchStats       = (params)      => api.get('/api/threads/stats/overview', { params });

// Pending sends (recall / undo window)
export const cancelPendingSend  = (id) => api.post(`/api/sends/${id}/cancel`);
export const retryPendingSend   = (id) => api.post(`/api/sends/${id}/retry`);
export const discardPendingSend = (id) => api.delete(`/api/sends/${id}`);

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

// Analytics — every endpoint takes the same filter object:
//   { days }  (1 = today)  OR  { from, to }  ISO dates, plus optional brand / agent.
// The server pins `agent` to the caller for non-admins, so it's a display
// preference here, not an access control.
export const fetchAnalyticsOverview  = (p={}) => api.get('/api/analytics/overview',      { params: p });
export const fetchAnalyticsVolume    = (p={}) => api.get('/api/analytics/volume',        { params: p });
export const fetchAnalyticsByBrand   = (p={}) => api.get('/api/analytics/by-brand',      { params: p });
export const fetchAnalyticsByIssue   = (p={}) => api.get('/api/analytics/by-issue',      { params: p });
export const fetchAnalyticsResponse  = (p={}) => api.get('/api/analytics/response-time', { params: p });
export const fetchAnalyticsSla       = (p={}) => api.get('/api/analytics/sla',           { params: p });
export const fetchAnalyticsActions   = (p={}) => api.get('/api/analytics/actions',       { params: p });
export const fetchAnalyticsAgents    = (p={}) => api.get('/api/analytics/agents',        { params: p });
// Leaderboard on the typed resolver name — full history, ignores the agent filter
export const fetchAnalyticsResolvedBy = (p={}) => api.get('/api/analytics/resolved-by',   { params: p });
export const fetchAnalyticsTemplates = ()     => api.get('/api/analytics/templates');

// Admin only — streams a multi-sheet .xlsx
export const downloadAnalyticsExport = (p={}) =>
  api.get('/api/analytics/export', { params: p, responseType: 'blob' });

// Saved views
export const fetchViews = ()       => api.get('/api/views');
export const createView = (data)   => api.post('/api/views', data);
export const deleteView = (id)     => api.delete(`/api/views/${id}`);

// Orders (external DB)
// email is optional — it lets the server match a bare number like "4334"
// against this customer's own orders before falling back to a wider search
export const fetchOrder         = (orderId, email) =>
  api.get(`/api/orders/${encodeURIComponent(orderId)}`, { params: email ? { email } : {} });
export const fetchOrdersByEmail = (email)   => api.get(`/api/orders/customer/${encodeURIComponent(email)}`);

// Thread Actions (per-thread)
export const fetchThreadActions   = (threadId)             => api.get(`/api/threads/${threadId}/actions`);
export const createThreadAction   = (threadId, data)       => api.post(`/api/threads/${threadId}/actions`, data);
export const updateThreadAction   = (threadId, actionId, data) => api.patch(`/api/threads/${threadId}/actions/${actionId}`, data);
export const closeThreadAction    = (threadId, actionId)   => api.post(`/api/threads/${threadId}/actions/${actionId}/close`);

// Actions (global consolidated view)
export const fetchAllActions      = (params = {})          => api.get('/api/actions', { params });
export const updateAction         = (actionId, data)       => api.patch(`/api/actions/${actionId}`, data);
export const closeAction          = (actionId)             => api.post(`/api/actions/${actionId}/close`);

// AI text improvement (OpenRouter)
export const improveText = (text, mode) => api.post('/api/ai/improve', { text, mode });

// Settings
export const fetchSettings   = ()       => api.get('/api/settings');
export const updateSettings  = (data)   => api.patch('/api/settings', data);
export const testAutoAck     = ()       => api.post('/api/settings/test-auto-ack');
export const testAutoResolve = ()       => api.post('/api/settings/test-auto-resolve');

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