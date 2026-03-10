import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';

export function useUserSync() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const synced = useRef(false);

  // [DEBUG] log every auth state change
  useEffect(() => {
    console.log('[useUserSync] state —', { isLoaded, isSignedIn, userId: userId ?? null, synced: synced.current });
  }, [isLoaded, isSignedIn, userId]);

  // Reset on sign-out so the next sign-in triggers a fresh sync.
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      synced.current = false;
    }
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId || synced.current) return;

    async function run() {
      try {
        console.log('[useUserSync] calling getToken()…');
        const token = await getToken();
        console.log('[useUserSync] getToken() result:', token ? `token(${token.slice(0, 12)}…)` : 'NULL');

        if (!token) {
          console.warn('[useUserSync] getToken() returned null — will retry');
          return;
        }

        console.log('[useUserSync] calling POST /api/auth/sync…');
        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        console.log('[useUserSync] /api/auth/sync response status:', res.status);

        if (res.ok) {
          synced.current = true;
          console.log('[useUserSync] sync SUCCESS — synced set to true');
        } else {
          const body = await res.json().catch(() => ({}));
          console.error('[useUserSync] sync FAILED — HTTP', res.status, body);
        }
      } catch (err) {
        console.error('[useUserSync] network error:', err.message);
      }
    }

    run();
  }, [isLoaded, isSignedIn, userId]);
}
