import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';

/**
 * Syncs the authenticated Clerk user to the Neon database once per session.
 *
 * Mobile-safe design:
 * - Waits for isLoaded AND isSignedIn before attempting sync.
 * - Calls getToken() only after Clerk is fully initialised.
 * - Never sends a request without a valid Bearer token.
 * - Marks synced only after a confirmed 200 response.
 * - Resets on sign-out so a subsequent sign-in re-syncs correctly.
 */
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
    // All three conditions must be true before attempting sync.
    if (!isLoaded || !isSignedIn || !userId || synced.current) return;

    async function run() {
      try {
        const token = await getToken();

        // getToken() can return null if Clerk has not yet exchanged the OAuth
        // code for a session token (common on mobile after redirect). Bail out
        // without marking synced — the effect will retry when dependencies update.
        if (!token) {
          console.warn('[useUserSync] getToken() returned null — will retry');
          return;
        }

        const res = await fetch('/api/auth/sync', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (res.ok) {
          synced.current = true;
        } else {
          console.error('[useUserSync] sync failed — HTTP', res.status);
        }
      } catch (err) {
        console.error('[useUserSync] network error:', err.message);
      }
    }

    run();
  }, [isLoaded, isSignedIn, userId]);
}
