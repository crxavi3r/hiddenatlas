import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';

export function useUserSync() {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const synced = useRef(false);

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
        const token = await getToken();
        if (!token) return;

        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.ok) {
          synced.current = true;
        }
      } catch {
        // silent — will retry on next render if needed
      }
    }

    run();
  }, [isLoaded, isSignedIn, userId]);
}
