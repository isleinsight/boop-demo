import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiFetch } from '../api/client';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(null);
  const [user, setUser]   = useState(null);
  const [loading, setLoading] = useState(true);

  // Load token/user from storage
  useEffect(() => {
    (async () => {
      try {
        const t = await AsyncStorage.getItem('boop_jwt');
        const u = await AsyncStorage.getItem('boopUser');
        if (t) setToken(t);
        if (u) setUser(JSON.parse(u));
      } catch {}
      setLoading(false);
    })();
  }, []);

  // Verify token by hitting /api/me
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const me = await apiFetch('/api/me', { token });
        setUser(me);
        await AsyncStorage.setItem('boopUser', JSON.stringify(me));
      } catch {
        // invalid token
        await AsyncStorage.multiRemove(['boop_jwt', 'boopUser']);
        setToken(null);
        setUser(null);
      }
    })();
  }, [token]);

  const login = async (email, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    const t = data?.token;
    const u = data?.user || null;
    if (!t) throw new Error('Login failed: no token');
    setToken(t);
    setUser(u);
    await AsyncStorage.setItem('boop_jwt', t);
    if (u) await AsyncStorage.setItem('boopUser', JSON.stringify(u));
    return true;
  };

  const logout = async () => {
    try { await apiFetch('/api/logout', { method: 'POST', token }); } catch {}
    await AsyncStorage.multiRemove(['boop_jwt', 'boopUser']);
    setToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({ token, user, login, logout, loading }), [token, user, loading]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
