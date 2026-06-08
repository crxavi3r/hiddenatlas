/**
 * resolveItineraryRouteMap.js
 *
 * Single resolver for route map data — used by both web and PDF renderers.
 *
 * Priority:
 *   1. ItineraryDayStop records (structured DB stops with showOnMap=true + coordinates)
 *   2. Normalized CMS stops (itinerary.routeMapStops with valid coordinates)
 *   3. None — callers fall back to legacy hardcoded components if applicable
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
 * @param {Array}  [dayStops] Optional ItineraryDayStop records from the DB
 * @returns {{
 *   enabled: boolean,
 *   source: 'day_stops' | 'normalized' | 'none',
 *   title: string,
 *   locations: Array<{
 *     id?: string, name: string, day?: number,
 *     latitude: number, longitude: number,
 *     type: 'major' | 'stop', visible: boolean, order: number
 *   }>
 * }}
 */
export function resolveItineraryRouteMap(itinerary, dayStops) {
  const id = itinerary.id || itinerary.slug || '';

  // Priority 1: structured DB day stops with showOnMap + coordinates
  if (Array.isArray(dayStops) && dayStops.length > 0) {
    const valid = dayStops
      .filter(s => s.showOnMap !== false && s.latitude != null && s.longitude != null)
      .sort((a, b) => (a.dayNumber - b.dayNumber) || ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)));

    if (valid.length >= 2) {
      const locations = valid.map((s, i) => ({
        id:        s.id,
        name:      s.title,
        day:       s.dayNumber,
        latitude:  s.latitude,
        longitude: s.longitude,
        type:      s.isMajorStop ? 'major' : normalizeType(null, i, valid.length),
        visible:   true,
        order:     i + 1,
      }));

      console.log('[resolveRouteMap]', id, {
        source: 'day_stops',
        stops: locations.length,
        days: [...new Set(locations.map(l => l.day))].length,
      });

      return { enabled: true, source: 'day_stops', title: itinerary.title || '', locations };
    }
  }

  // Priority 2: normalized CMS stops from content.routeMap.stops
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
