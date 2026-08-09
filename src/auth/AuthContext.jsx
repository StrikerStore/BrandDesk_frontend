import { createContext, useContext } from 'react';

// Routes sit between App and the screens that need the signed-in user, so the
// user can no longer be threaded through as a prop.
const AuthContext = createContext(null);

export function AuthProvider({ user, onLogout, children }) {
  return (
    <AuthContext.Provider value={{ user, onLogout, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
