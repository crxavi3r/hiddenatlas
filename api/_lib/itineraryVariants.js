// ── Variant hierarchy (most complete → least complete) ───────────────────────
// The order here determines unlock logic: buying a higher-index tier unlocks
// that tier and all tiers below it (if they exist for that itinerary).
export const VARIANT_HIERARCHY = ['premium', 'essential', 'short'];

// ── Server-side itinerary variant configuration ──────────────────────────────
// Maps parent slug → { availableVariants, slugs }
// When a new multi-version itinerary is added, register it here.
// Single-version itineraries do NOT need to be registered.
export const ITINERARY_VARIANTS = {
  'california-american-west': {
    availableVariants: ['premium', 'essential', 'short'],
    slugs: {
      premium:   'california-american-west-16-days',
      essential: 'california-american-west-12-days',
      short:     'california-american-west-8-days',
    },
  },
  // Future multi-version itineraries go here, e.g.:
  // 'japan-grand-cultural-journey': {
  //   availableVariants: ['premium', 'essential'],
  //   slugs: {
  //     premium:   'japan-grand-cultural-journey-15-days',
  //     essential: 'japan-grand-cultural-journey-10-days',
  //   },
  // },
};

// ── Reverse map: child slug → { parent, variant } ────────────────────────────
// Auto-generated from ITINERARY_VARIANTS — do not edit manually.
export const SLUG_TO_VARIANT = Object.fromEntries(
  Object.entries(ITINERARY_VARIANTS).flatMap(([parent, config]) =>
    Object.entries(config.slugs).map(([variant, slug]) => [slug, { parent, variant }])
  )
);

// ── Stripe price ID resolution ────────────────────────────────────────────────
// Maps variant tier to the correct Stripe Price ID from environment variables.
// Falls back to STRIPE_PRICE_PREMIUM if a tier-specific var is not set.
export function getVariantPriceId(variant) {
  const map = {
    premium:   process.env.STRIPE_PRICE_PREMIUM   || process.env.STRIPE_PRICE_ID,
    essential: process.env.STRIPE_PRICE_PREMIUM_ESSENTIAL,
    short:     process.env.STRIPE_PRICE_PREMIUM_SHORT,
  };
  return map[variant] || map.premium || null;
}

// ── Unlock logic ──────────────────────────────────────────────────────────────
// Returns all slugs that should receive a Purchase record when the given
// slug is purchased. Hierarchical: buying premium unlocks essential + short
// if those variants exist for the same parent itinerary.
//
// Examples:
//   parent has premium + essential + short:
//     buying premium   → [premium, essential, short]
//     buying essential → [essential, short]
//     buying short     → [short]
//
//   parent has premium + short only:
//     buying premium   → [premium, short]
//     buying short     → [short]
//
//   single-version itinerary (not in ITINERARY_VARIANTS):
//     buying slug      → [slug]
export function getUnlockableSlugs(purchasedSlug) {
  const entry = SLUG_TO_VARIANT[purchasedSlug];

  // Not a multi-version itinerary — only unlock the purchased slug itself
  if (!entry) return [purchasedSlug];

  const config = ITINERARY_VARIANTS[entry.parent];
  if (!config) return [purchasedSlug];

  const purchasedIdx = VARIANT_HIERARCHY.indexOf(entry.variant);
  const result = [];

  for (const variant of VARIANT_HIERARCHY) {
    const idx = VARIANT_HIERARCHY.indexOf(variant);
    // Unlock purchased tier and all tiers below it (higher index = lower tier)
    if (idx >= purchasedIdx && config.availableVariants.includes(variant)) {
      const slug = config.slugs[variant];
      if (slug) result.push(slug);
    }
  }

  return result.length ? result : [purchasedSlug];
}
