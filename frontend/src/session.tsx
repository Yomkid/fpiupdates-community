import { savePushOwner } from './push-owner';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError, type User } from './api';
type State = {
  user: User | null;
  loading: boolean;
  unavailable: boolean;
  setUser: (user: User | null) => void;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};
const Context = createContext<State | null>(null);
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  async function refresh() {
    try {
      setUser(await api<User>('/auth/me'));
      setUnavailable(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setUser(null);
        setUnavailable(false);
      } else setUnavailable(true);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 401)) throw error;
    }
    savePushOwner(null);
    setUser(null);
  }
  return (
    <Context.Provider value={{ user, loading, unavailable, setUser, refresh, logout }}>
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  const state = useContext(Context);
  if (!state) throw new Error('SessionProvider missing');
  return state;
}
