import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';

const DEFAULT = { role: 'user', isAdmin: false, isDesigner: false, creatorSlug: null, loading: true };

const UserCtx = createContext(DEFAULT);

export function UserCtxProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [ctx, setCtx] = useState(DEFAULT);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setCtx({ role: 'user', isAdmin: false, isDesigner: false, creatorSlug: null, loading: false });
      return;
    }
    getToken()
      .then(token =>
        fetch('/api/auth?action=me', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            const role = data?.role ?? 'user';
            setCtx({
              role,
              isAdmin:     role === 'admin',
              isDesigner:  role === 'designer' || role === 'admin',
              creatorSlug: data?.creatorSlug ?? null,
              loading:     false,
            });
          })
      )
      .catch(() =>
        setCtx({ role: 'user', isAdmin: false, isDesigner: false, creatorSlug: null, loading: false })
      );
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return <UserCtx.Provider value={ctx}>{children}</UserCtx.Provider>;
}

export function useUserCtx() {
  return useContext(UserCtx);
}
