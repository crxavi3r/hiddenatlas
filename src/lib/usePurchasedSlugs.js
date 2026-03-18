import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from './api';
import { itineraries } from '../data/itineraries';

// Build a reverse map: child id → parentId
const CHILD_TO_PARENT = Object.fromEntries(
  itineraries.filter(it => it.parentId).map(it => [it.id, it.parentId])
);

/**
 * Returns a Set<string> of itinerary slugs purchased by the current user.
 * Child slugs automatically expand to include their parent ID so listing
 * cards on parent/chooser pages show the "Purchased" badge.
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
      .then(({ slugs }) => {
        const expanded = new Set(slugs);
        for (const slug of slugs) {
          const parentId = CHILD_TO_PARENT[slug];
          if (parentId) expanded.add(parentId);
        }
        setPurchasedSlugs(expanded);
      })
      .catch(() => setPurchasedSlugs(new Set()));
  }, [isLoaded, isSignedIn]);

  return purchasedSlugs;
}
