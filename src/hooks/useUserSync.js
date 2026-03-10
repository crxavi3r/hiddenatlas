import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';

// Calls the Vercel serverless function at /api/auth/sync once per session
// after Clerk confirms the user is signed in. The function verifies the JWT
// server-side and upserts the User row in Neon. No user data sent from client.
export function useUserSync() {
  const { userId, getToken } = useAuth();
  const synced = useRef(false);

  useEffect(() => {
    if (!userId || synced.current) return;

    async function run() {
      synced.current = true;
      try {
        const token = await getToken();
        const res = await fetch('/api/auth/sync', {
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
  }, [userId]);
}
