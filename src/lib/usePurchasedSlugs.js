import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from './api';

/**
 * Returns a Set<string> of itinerary slugs purchased by the current user.
 * Returns an empty Set when signed out or while loading.
 *
 * Usage:
 *   const purchasedSlugs = usePurchasedSlugs();
 *   const isPurchased = purchasedSlugs.has(itinerary.id);
 */
export function usePurchasedSlugs() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const [purchasedSlugs, setPurchasedSlugs] = useState(new Set());

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      setPurchasedSlugs(new Set());
      return;
    }
    api.get('/api/itineraries?action=purchases')
      .then(res => res.ok ? res.json() : { slugs: [] })
      .then(({ slugs }) => setPurchasedSlugs(new Set(slugs)))
      .catch(() => setPurchasedSlugs(new Set()));
  }, [isLoaded, isSignedIn]);

  return purchasedSlugs;
}
