import { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { fetchCurrentUser, setUnauthorizedHandler } from './utils/api.js';
import { AuthProvider } from './auth/AuthContext.jsx';
import { useToast } from './ui/ToastProvider.jsx';
import AppShell from './layouts/AppShell.jsx';
import LoginPage from './pages/LoginPage.jsx';
import InboxPage from './pages/InboxPage.jsx';
import ActionsPage from './pages/ActionsPage.jsx';
import InsightsPage from './pages/InsightsPage.jsx';
import TemplatesPage from './pages/TemplatesPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

export default function App() {
  const [authState, setAuthState] = useState({ loading: true, user: null });
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchCurrentUser()
      .then(({ data }) => setAuthState({ loading: false, user: data }))
      .catch(() => setAuthState({ loading: false, user: null }));
  }, []);

  // A 401 on any request means the session died mid-work. Drop to the login
  // screen and say so, instead of leaving a UI that looks alive but saves
  // nothing. `next` brings the agent back to the exact ticket afterwards.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthState(prev => {
        if (!prev.user) return prev;
        navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`, { replace: true });
        toast.error('Your session expired', { detail: 'Sign in again to continue.' });
        return { loading: false, user: null };
      });
    });
    return () => setUnauthorizedHandler(null);
  }, [toast, navigate, location]);

  const handleLogout = useCallback(() => {
    setAuthState({ loading: false, user: null });
    navigate('/login', { replace: true });
  }, [navigate]);

  if (authState.loading) {
    return (
      <div
        style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        role="status"
        aria-live="polite"
      >
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  if (!authState.user) {
    return (
      <Routes>
        <Route
          path="/login"
          element={<LoginPage onLogin={(user) => setAuthState({ loading: false, user })} />}
        />
        {/* Preserve where they were headed so login can return them there */}
        <Route
          path="*"
          element={<Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />}
        />
      </Routes>
    );
  }

  // Signing in returns you to whatever you were looking at when the session
  // died, not to a generic inbox.
  const nextAfterLogin = new URLSearchParams(location.search).get('next');
  const safeNext = nextAfterLogin?.startsWith('/') && !nextAfterLogin.startsWith('//')
    ? nextAfterLogin
    : '/inbox';

  return (
    <AuthProvider user={authState.user} onLogout={handleLogout}>
      <Routes>
        <Route path="/login" element={<Navigate to={safeNext} replace />} />
        <Route element={<AppShell />}>
          {/* Both inbox routes render the same element, so React reconciles
              rather than remounts — opening a ticket keeps the list's scroll
              position and loaded pages. */}
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/inbox/t/:threadId" element={<InboxPage />} />
          <Route path="/actions" element={<ActionsPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/settings/:tab" element={<SettingsPage />} />
          <Route path="/" element={<Navigate to="/inbox" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}
