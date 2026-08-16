/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, isDemoMode } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMe().then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setLoading(false));
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    isDemoMode,
    async login(whatsappNumber, code) { const data = await api.verifyLogin(whatsappNumber, code); setUser(data.user); return data.user; },
    async logout() { await api.logout(); setUser(isDemoMode ? (await api.getMe()).user : null); },
    setUser
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus digunakan di dalam AuthProvider');
  return context;
}
