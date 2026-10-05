import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem('epc_user');
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('epc_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api
      .get('/auth/me')
      .then(({ data }) => {
        setUser(data.user);
        localStorage.setItem('epc_user', JSON.stringify(data.user));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('epc_token', data.token);
    localStorage.setItem('epc_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    // Mandatory publish-before-exit: flush all local data to the cloud so the
    // owner always sees the latest. Best-effort with a short timeout, and only
    // for roles that write locally (never the view-only admin/auditor).
    if (user && user.role !== 'admin' && user.role !== 'auditor') {
      try {
        await Promise.race([
          api.post('/system/flush-on-exit'),
          new Promise((r) => setTimeout(r, 6000)),
        ]);
      } catch { /* offline / not configured — sign out anyway */ }
    }
    localStorage.removeItem('epc_token');
    localStorage.removeItem('epc_user');
    setUser(null);
  }, [user]);

  // 'editor' is a super-admin — it has every admin power, plus exclusive tools.
  const isEditor = user?.role === 'editor';
  const isAdmin = user?.role === 'admin' || isEditor;
  // 'auditor' is a dedicated read-only reviewer (statutory/internal audit).
  const isAuditor = user?.role === 'auditor';
  // The plain admin is a cloud-facing view/export role. Importing & OCR (which
  // are CPU-heavy on the free cloud tier) are reserved for the operator and the
  // editor super-admin, who run the app locally. Auditors never write.
  const canImport = !!user && user.role !== 'admin' && user.role !== 'auditor';
  // Admin is strictly view-only: no export/download, no create/edit/delete.
  const canExport = !!user && user.role !== 'admin';
  const canWrite = !!user && user.role !== 'admin' && user.role !== 'auditor';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isEditor, isAuditor, canImport, canExport, canWrite }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
