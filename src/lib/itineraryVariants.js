// ── Variant hierarchy (most complete → least complete) ───────────────────────
// Mirrors api/_lib/itineraryVariants.js — keep in sync.
export const VARIANT_HIERARCHY = ['premium', 'essential', 'short'];

// ── Frontend-safe price display map ──────────────────────────────────────────
// Used to show per-variant prices on chooser cards and sidebars.
// These must match what is configured in src/data/itineraries.js.
const VARIANT_PRICES = {
  premium:   29,
  essential: 19,
  short:     14,
};

/**
 * Returns the display price for a given variant tier.
 * Falls back to the premium price if the tier is unknown.
 */
export function getVariantPrice(variant) {
  return VARIANT_PRICES[variant] ?? VARIANT_PRICES.premium;
}

/**
 * Given an itinerary object (with `variant` and `parentId`), returns
 * whether a duration/variant selector should be shown on the detail page.
 */
export function shouldShowVariantSelector(itinerary, allItineraries) {
  if (!itinerary.parentId) return false;
  const siblings = allItineraries.filter(
    it => it.parentId === itinerary.parentId && it.id !== itinerary.id
  );
  return siblings.length > 0;
}

/**
 * Returns all variant options for the same parent, ordered by VARIANT_HIERARCHY.
 * Includes the current itinerary itself.
 */
export function getSiblingVariants(itinerary, allItineraries) {
  if (!itinerary.parentId) return [itinerary];
  const siblings = allItineraries.filter(it => it.parentId === itinerary.parentId);
  return siblings.sort((a, b) => {
    const ai = VARIANT_HIERARCHY.indexOf(a.variant ?? '');
    const bi = VARIANT_HIERARCHY.indexOf(b.variant ?? '');
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

/**
 * Returns the highest (most complete) variant available for a parent itinerary.
 * Used to determine the default tier to purchase from the chooser page.
 */
export function getHighestAvailableVariant(availableVariants) {
  for (const tier of VARIANT_HIERARCHY) {
    if (availableVariants?.includes(tier)) return tier;
  }
  return 'premium';
}

/**
 * Returns all variant tiers that should be unlocked when the given variant
 * is purchased (purchased tier + all lower-index tiers that exist).
 * Frontend-only — mirrors the server-side getUnlockableSlugs logic in concept.
 *
 * @param {string} purchasedVariant  - e.g. 'essential'
 * @param {string[]} availableVariants - e.g. ['premium', 'essential', 'short']
 * @returns {string[]} - e.g. ['essential', 'short']
 */
export function getUnlockableVariants(purchasedVariant, availableVariants) {
  const purchasedIdx = VARIANT_HIERARCHY.indexOf(purchasedVariant);
  if (purchasedIdx === -1) return [purchasedVariant];
  return VARIANT_HIERARCHY.filter((tier, idx) =>
    idx >= purchasedIdx && availableVariants?.includes(tier)
  );
}
