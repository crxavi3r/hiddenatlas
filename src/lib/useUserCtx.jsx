import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { isAdminEmail } from './adminEmails.js';

const DEFAULT = { role: 'user', email: null, isAdmin: false, isDesigner: false, creatorSlug: null, creatorId: null, loading: true };

const UserCtx = createContext(DEFAULT);

export function UserCtxProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [ctx, setCtx] = useState(DEFAULT);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setCtx({ role: 'user', email: null, isAdmin: false, isDesigner: false, creatorSlug: null, creatorId: null, loading: false });
      return;
    }
    getToken()
      .then(token =>
        fetch('/api/auth?action=me', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            const role    = data?.role ?? 'user';
            const email   = data?.email ?? null;
            const isAdmin = role === 'admin' || isAdminEmail(email);
            setCtx({
              role,
              email,
              isAdmin,
              // Designer if: explicit role, admin, OR has an active Creator profile
              isDesigner:  role === 'designer' || isAdmin || !!data?.creatorSlug,
              creatorSlug: data?.creatorSlug ?? null,
              creatorId:   data?.creatorId   ?? null,
              loading:     false,
            });
          })
      )
      .catch(() =>
        setCtx({ role: 'user', email: null, isAdmin: false, isDesigner: false, creatorSlug: null, creatorId: null, loading: false })
      );
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return <UserCtx.Provider value={ctx}>{children}</UserCtx.Provider>;
}

export function useUserCtx() {
  return useContext(UserCtx);
}
