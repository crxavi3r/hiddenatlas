/**
 * resolveItineraryRouteMap.js
 *
 * Single resolver for route map data — used by both web and PDF renderers.
 *
 * Priority:
 *   1. Normalized CMS stops (itinerary.routeMapStops with valid coordinates)
 *   2. None — callers fall back to legacy hardcoded components if applicable
 *
 * Accepts both internal type values: 'major'/'stop' and 'major_stop'/'route_stop'.
 */

function normalizeType(type, i, n) {
  if (type === 'major' || type === 'major_stop') return 'major';
  if (type === 'stop'  || type === 'route_stop') return 'stop';
  return (i === 0 || i === n - 1) ? 'major' : 'stop';
}

/**
 * Resolve the canonical route map for an itinerary.
 *
 * @param {object} itinerary  Requires: id, title, routeMapStops?
 * @returns {{
 *   enabled: boolean,
 *   source: 'normalized' | 'none',
 *   title: string,
 *   locations: Array<{
 *     id?: string, name: string, day?: number,
 *     latitude: number, longitude: number,
 *     type: 'major' | 'stop', visible: boolean, order: number
 *   }>
 * }}
 */
export function resolveItineraryRouteMap(itinerary) {
  const id = itinerary.id || itinerary.slug || '';
  const allStops = itinerary.routeMapStops || [];

  const valid = allStops
    .filter(s => s.visible !== false && s.latitude != null && s.longitude != null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (valid.length >= 2) {
    const locations = valid.map((s, i) => ({
      id:        s.id,
      name:      s.name,
      day:       s.dayNumber ?? null,
      latitude:  s.latitude,
      longitude: s.longitude,
      type:      normalizeType(s.type, i, valid.length),
      visible:   true,
      order:     s.order ?? i + 1,
    }));

    console.log('[resolveRouteMap]', id, {
      source: 'normalized',
      stops: locations.length,
      types: locations.reduce((a, l) => { a[l.type] = (a[l.type] || 0) + 1; return a; }, {}),
    });

    return { enabled: true, source: 'normalized', title: itinerary.title || '', locations };
  }

  console.log('[resolveRouteMap]', id, { source: 'none', rawStops: allStops.length });
  return { enabled: false, source: 'none', title: itinerary.title || '', locations: [] };
}
