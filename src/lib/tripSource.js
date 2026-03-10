// Centralized mapping from persisted Trip.source enum values to display labels
// and badge styles. Import this wherever source badges are rendered so the
// wording and visual treatment stay in sync across the app.
//
// Stored values (never change these):
//   AI_GENERATED | FREE_JOURNEY | PREMIUM_JOURNEY
//
// Color logic:
//   FREE_JOURNEY    — neutral stone (#F4F1EC bg / #8C8070 text): open, no cost
//   AI_GENERATED    — brand teal   (#1B6B65 bg / white text):    primary product action
//   PREMIUM_JOURNEY — warm gold    (#C9A96E bg / white text):    paid, high-value

export const TRIP_SOURCE = {
  FREE_JOURNEY:    { label: 'Free',       bg: '#F4F1EC', color: '#6B6156' },
  AI_GENERATED:    { label: 'AI Planner', bg: '#1B6B65', color: 'white'   },
  PREMIUM_JOURNEY: { label: 'Premium',    bg: '#C9A96E', color: 'white'   },
};

// Returns the display config for a given source string.
// Falls back to AI_GENERATED for null / unknown values.
export function getTripSource(source) {
  return TRIP_SOURCE[source] ?? TRIP_SOURCE.AI_GENERATED;
}
