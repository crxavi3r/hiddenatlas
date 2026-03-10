import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { API_BASE } from '../lib/api';

// Calls POST /api/auth/sync once per session after the user signs in.
// Uses getToken() directly to guarantee the Bearer token is attached.
export function useUserSync() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const synced = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || synced.current) return;

    async function run() {
      synced.current = true;
      try {
        const token = await getToken();

        const res = await fetch(`${API_BASE}/api/auth/sync`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({}),
        });

        if (!res.ok) {
          console.error('[useUserSync] sync failed — HTTP', res.status);
          synced.current = false;
        }
      } catch (err) {
        console.error('[useUserSync] network error:', err.message);
        synced.current = false;
      }
    }

    run();
  }, [isSignedIn, isLoaded]);
}
