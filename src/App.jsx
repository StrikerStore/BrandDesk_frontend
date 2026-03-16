import { useState, useEffect } from 'react';
import { fetchCurrentUser } from './utils/api.js';
import LoginPage from './pages/LoginPage.jsx';
import InboxPage from './pages/InboxPage.jsx';

export default function App() {
  const [authState, setAuthState] = useState({ loading: true, user: null });

  useEffect(() => {
    fetchCurrentUser()
      .then(({ data }) => setAuthState({ loading: false, user: data }))
      .catch(() => setAuthState({ loading: false, user: null }));
  }, []);

  if (authState.loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>Loading…</div>
      </div>
    );
  }

  if (!authState.user) {
    return <LoginPage onLogin={(user) => setAuthState({ loading: false, user })} />;
  }

  return (
    <InboxPage
      user={authState.user}
      onLogout={() => setAuthState({ loading: false, user: null })}
    />
  );
}