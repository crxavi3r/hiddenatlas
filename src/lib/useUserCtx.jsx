import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth, useUser } from '@clerk/clerk-react';

// ── Single source of truth for access control ─────────────────────────────────
// All admin/designer/backoffice visibility in the UI derives from this context.
// Values of isAdmin and isDesigner are computed server-side in resolveUserCtx.js
// and returned by /api/auth?action=me — the client does not re-derive them.
//
// Admin rules (enforced in api/_lib/resolveUserCtx.js + api/_lib/adminEmails.js):
//   isAdmin    = role === 'admin' OR email ∈ ADMIN_EMAILS
//   isDesigner = role === 'designer' OR isAdmin OR has active Creator profile
//   canAccessBackoffice = isAdmin OR isDesigner
//
// CLIENT-SIDE FALLBACK: When the API call fails (DB error, network, 503),
// known admin emails always get isAdmin=true so navigation never breaks.
const HARDCODED_ADMIN_EMAILS = new Set([
  'cristiano.xavier@hiddenatlas.travel',
  'cristiano.xavier@outlook.com',
]);

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
  const { user } = useUser();
  const [ctx, setCtx] = useState(DEFAULT);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn) {
      const next = { ...DEFAULT, loading: false };
      console.log('[useAccess] signed out', next);
      setCtx(next);
      return;
    }

    // Client-side admin override — matches server-side ADMIN_EMAILS list.
    // Used as a fallback when /api/auth?action=me fails so admin navigation
    // never breaks due to a transient DB error.
    const primaryEmail = user?.primaryEmailAddress?.emailAddress?.toLowerCase() ?? null;
    const clientAdmin  = primaryEmail ? HARDCODED_ADMIN_EMAILS.has(primaryEmail) : false;

    getToken()
      .then(token => {
        if (!token) {
          // Clerk session not ready or expired — don't send Bearer null to the API.
          console.warn('[useAccess] getToken() returned null — skipping api/me fetch');
          setCtx({
            ...DEFAULT,
            isLoggedIn:          true,
            isAdmin:             clientAdmin,
            isDesigner:          clientAdmin,
            canAccessBackoffice: clientAdmin,
            email:               primaryEmail,
            loading:             false,
          });
          return Promise.resolve();
        }
        return fetch('/api/auth?action=me', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => (r.ok ? r.json() : null))
          .then(data => {
            if (!data) {
              // API failed (503, 500, etc.) — fall back to client-side email check.
              const next = {
                ...DEFAULT,
                isLoggedIn:          true,
                isAdmin:             clientAdmin,
                isDesigner:          clientAdmin,
                canAccessBackoffice: clientAdmin,
                email:               primaryEmail,
                loading:             false,
              };
              console.warn('[useAccess] api/me returned null or error — clientAdmin fallback:', clientAdmin, next);
              setCtx(next);
              return;
            }

            // Trust server-computed values; merge client-side admin override for resilience.
            const isAdmin    = (data.isAdmin    ?? false) || clientAdmin;
            const isDesigner = (data.isDesigner ?? false) || isAdmin;
            const next = {
              isLoggedIn:          true,
              isAdmin,
              isDesigner,
              canAccessBackoffice: isAdmin || isDesigner,
              role:                data.role        ?? 'user',
              email:               data.email       ?? primaryEmail,
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
        setCtx({
          ...DEFAULT,
          isLoggedIn:          true,
          isAdmin:             clientAdmin,
          isDesigner:          clientAdmin,
          canAccessBackoffice: clientAdmin,
          email:               primaryEmail,
          loading:             false,
        });
      });
  }, [isLoaded, isSignedIn, user]); // eslint-disable-line react-hooks/exhaustive-deps

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
