// Centralized mapping from persisted Trip.source enum values to display labels
// and badge styles. Import this wherever source badges are rendered so the
// wording and visual treatment stay in sync across the app.
//
// Stored values (never change these):
//   AI_GENERATED | FREE_JOURNEY | PREMIUM_JOURNEY
//
// Style follows the same solid-bg / white-text convention used by ItineraryCard
// and the "Purchased" badge in MyTrips — teal for free/AI, gold for premium.

export const TRIP_SOURCE = {
  AI_GENERATED:    { label: 'AI Planner', bg: '#1B6B65', color: 'white' },
  FREE_JOURNEY:    { label: 'Free',       bg: '#1B6B65', color: 'white' },
  PREMIUM_JOURNEY: { label: 'Premium',    bg: '#C9A96E', color: 'white' },
};

// Returns the display config for a given source string.
// Falls back to AI_GENERATED for null / unknown values.
export function getTripSource(source) {
  return TRIP_SOURCE[source] ?? TRIP_SOURCE.AI_GENERATED;
}
