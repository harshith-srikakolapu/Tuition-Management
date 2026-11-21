import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api';
import type { AuthResponse, Center, User } from './types';

interface AuthState {
  user: User | null;
  center: Center | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (data: { centerName: string; ownerName: string; email: string; password: string }) => Promise<void>;
  logout: () => void;
  setCenter: (c: Center) => void;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [center, setCenter] = useState<Center | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    setCenter(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    api
      .get<{ user: User; center: Center }>('/auth/me')
      .then((r) => {
        setUser(r.user);
        setCenter(r.center);
      })
      .catch(() => logout())
      .finally(() => setReady(true));
  }, [logout]);

  const accept = (r: AuthResponse) => {
    tokenStore.set(r.token);
    setUser(r.user);
    setCenter(r.center);
  };

  const value: AuthState = {
    user,
    center,
    ready,
    logout,
    setCenter,
    login: async (email, password) => accept(await api.post<AuthResponse>('/auth/login', { email, password })),
    signup: async (data) => accept(await api.post<AuthResponse>('/auth/signup', data)),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}
