import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';

// ── Single source of truth for access control ─────────────────────────────────
// All admin/designer/backoffice visibility in the UI derives from this context.
// Values of isAdmin and isDesigner are computed server-side in resolveUserCtx.js
// and returned by /api/auth?action=me — the client does not re-derive them.
//
// Admin rules (enforced in api/_lib/resolveUserCtx.js + api/_lib/adminEmails.js):
//   isAdmin    = role === 'admin' OR email ∈ ADMIN_EMAILS
//   isDesigner = role === 'designer' OR isAdmin OR has active Creator profile
//   canAccessBackoffice = isAdmin OR isDesigner

const DEFAULT = {
  isLoggedIn:          false,
  isAdmin:             false,
  isDesigner:          false,
  canAccessBackoffice: false,
  role:                'user',
  email:               null,
  creatorSlug:         null,
  creatorId:           null,
  loading:             true,
};

const UserCtx = createContext(DEFAULT);

export function UserCtxProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [ctx, setCtx] = useState(DEFAULT);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      const next = { ...DEFAULT, loading: false };
      console.log('[useAccess] signed out', next);
      setCtx(next);
      return;
    }

    getToken()
      .then(token => {
        if (!token) {
          // Clerk session not ready or expired — don't send Bearer null to the API.
          // This happens during the brief window after sign-in before the session
          // token is available, or when the session has expired.
          console.warn('[useAccess] getToken() returned null — skipping api/me fetch');
          setCtx({ ...DEFAULT, isLoggedIn: true, loading: false });
          return Promise.resolve();
        }
        return fetch('/api/auth?action=me', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (!data) {
              const next = { ...DEFAULT, isLoggedIn: true, loading: false };
              console.warn('[useAccess] api/me returned null or error', next);
              setCtx(next);
              return;
            }

            // Trust server-computed values — do not re-derive on the client.
            const isAdmin    = data.isAdmin    ?? false;
            const isDesigner = data.isDesigner ?? false;
            const next = {
              isLoggedIn:          true,
              isAdmin,
              isDesigner,
              canAccessBackoffice: isAdmin || isDesigner,
              role:                data.role        ?? 'user',
              email:               data.email       ?? null,
              creatorSlug:         data.creatorSlug ?? null,
              creatorId:           data.creatorId   ?? null,
              loading:             false,
            };
            console.log('[useAccess] resolved', next);
            setCtx(next);
          });
      })
      .catch(err => {
        console.error('[useAccess] fetch error', err);
        setCtx({ ...DEFAULT, isLoggedIn: true, loading: false });
      });
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  return <UserCtx.Provider value={ctx}>{children}</UserCtx.Provider>;
}

// Primary hook — use this everywhere.
export function useAccess() {
  return useContext(UserCtx);
}

// Backward-compat alias — all existing admin pages that import useUserCtx keep working.
export function useUserCtx() {
  return useContext(UserCtx);
}
