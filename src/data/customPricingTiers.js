// Centralized custom planning pricing tiers.
// Used by PricingPage, CustomPlanningPage, and api/checkout.js.
// This is the single source of truth — never duplicate these values.

export const CUSTOM_TIERS = [
  {
    key: 'couple',
    label: 'Couple / Duo',
    range: '1–2 travellers',
    groupMin: 1,
    groupMax: 2,
    price: 349,
    displayPrice: '€349',
    customQuote: false,
    best: false,
    features: [
      'Dedicated trip planner',
      'Fully custom day-by-day itinerary',
      'Accommodation shortlist and booking guidance',
      'Restaurant and experience recommendations',
      'Logistics and transport planning',
      '2 rounds of revisions',
      'Final digital itinerary package (PDF)',
    ],
  },
  {
    key: 'small_group',
    label: 'Family / Small Group',
    range: '3–8 travellers',
    groupMin: 3,
    groupMax: 8,
    price: 549,
    displayPrice: '€549',
    customQuote: false,
    best: true,
    features: [
      'Everything in Couple / Duo',
      'Group logistics and transport planning',
      'Multiple accommodation configurations researched',
      'Group dining and activity recommendations',
      '3 rounds of revisions',
      'Final digital itinerary package (PDF)',
    ],
  },
  {
    key: 'large_group',
    label: 'Large Group',
    range: '9–12 travellers',
    groupMin: 9,
    groupMax: 12,
    price: 849,
    displayPrice: '€849',
    customQuote: false,
    best: false,
    features: [
      'Everything in Family / Small Group',
      'Multi-room and villa research',
      'Complex multi-destination logistics planning',
      'Activity and experience sourcing',
      'Child and multi-gen travel considerations',
      'Unlimited revisions',
      'Final digital itinerary package (PDF)',
    ],
  },
  {
    key: 'custom_quote',
    label: '13+ Travellers',
    range: '13+ travellers',
    groupMin: 13,
    groupMax: null,
    price: null,
    displayPrice: 'Custom quote',
    customQuote: true,
    best: false,
    features: [
      'Everything in Large Group',
      'Full scope assessment before pricing',
      'Senior trip planner assigned',
      'Complex multi-destination logistics',
      'Unlimited revisions',
      'Final digital itinerary package (PDF)',
    ],
  },
];

// Options used in the group size <select> on the planning form
export const GROUP_SIZE_OPTIONS = [
  { value: '1-2',  label: '1–2 travellers',  tierKey: 'couple'       },
  { value: '3-8',  label: '3–8 travellers',  tierKey: 'small_group'  },
  { value: '9-12', label: '9–12 travellers', tierKey: 'large_group'  },
  { value: '13+',  label: '13+ travellers',  tierKey: 'custom_quote' },
];

// Map Stripe price env-var name per tier key (for the API layer)
export const TIER_PRICE_ENV = {
  couple:      'STRIPE_CUSTOM_COUPLE_PRICE_ID',
  small_group: 'STRIPE_CUSTOM_SMALL_GROUP_PRICE_ID',
  large_group: 'STRIPE_CUSTOM_LARGE_GROUP_PRICE_ID',
};

// Return the pricing tier for a given group size selector value ('1-2', '3-8', etc.)
export function getTierByGroupSize(groupSizeValue) {
  const option = GROUP_SIZE_OPTIONS.find(o => o.value === groupSizeValue);
  if (!option) return null;
  return CUSTOM_TIERS.find(t => t.key === option.tierKey) ?? null;
}
