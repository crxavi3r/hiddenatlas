import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from '../lib/api';

// Calls POST /api/auth/sync once per session after the user signs in.
// The backend verifies the Clerk JWT server-side, then upserts the User
// row in PostgreSQL. No user data is sent from the frontend.
export function useUserSync() {
  const { isSignedIn, isLoaded } = useAuth();
  const api = useApi();
  const synced = useRef(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || synced.current) return;

    synced.current = true;
    api.post('/api/auth/sync', {})
      .catch(err => {
        console.error('[useUserSync] sync failed:', err.message);
        synced.current = false; // allow retry on next render if it failed
      });
  }, [isSignedIn, isLoaded]);
}
