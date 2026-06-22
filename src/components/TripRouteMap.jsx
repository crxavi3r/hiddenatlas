/**
 * TripRouteMap — Leaflet map for the My Trips workspace.
 *
 * Shows three overlapping data layers on one map:
 *   1. ItineraryDayStop records (original route — gold/teal markers)
 *   2. TripItem records with coordinates (user-added places — blue markers)
 *   3. TripBooking records with coordinates (confirmed bookings — amber markers)
 *
 * Markers display sequential visit-order numbers that mirror the Day by Day view.
 *
 * Props:
 *   itineraryStops  — transformed ItineraryDayStop records with lat/lng
 *   tripItems       — raw TripItem records from workspace
 *   tripBookings    — raw TripBooking records from workspace
 *   tripDays        — raw TripDay records (for correct day ordering)
 *   trip            — Trip record (used for country context when geocoding)
 *   getToken        — () => Promise<string> — Clerk token for API saves
 *   onRefresh       — () => void — reload workspace after coordinate save
 */
import { useState, useEffect, useRef, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TEAL   = '#1B6B65';
const GOLD   = '#C9A96E';
const ITEM_C = '#3B82A0';  // user-added TripItem
const BOOK_C = '#C97C3A';  // TripBooking / confirmed
const CHAR   = '#1C1A16';
const MUTED  = '#8C8070';
const SERIF  = "'Playfair Display', Georgia, serif";

const DAY_PALETTE = ['#1B6B65','#7B5EA7','#C97C3A','#2E86AB','#8B6513','#4A7C59','#9B3535','#5B8DB8','#7A6E00','#2A4B6F'];
const dayColor = d => DAY_PALETTE[((d ?? 1) - 1) % DAY_PALETTE.length];

const ITEM_TYPE_LABELS = {
  place: 'Place', restaurant: 'Restaurant', hotel: 'Hotel', activity: 'Activity',
  experience: 'Experience', transport: 'Transport', note: 'Note', other: 'Other',
};
const BOOKING_TYPE_LABELS = {
  flight: 'Flight', hotel: 'Hotel', restaurant: 'Restaurant', activity: 'Activity',
  transport: 'Transport', tour: 'Tour', car: 'Car rental', other: 'Booking',
};

function pillStyle(active, color) {
  return {
    fontSize: '12px', fontWeight: '600', padding: '5px 14px', borderRadius: '20px',
    border: `1.5px solid ${active ? color : '#E8E3DA'}`,
    background: active ? color : 'white', color: active ? 'white' : MUTED,
    cursor: 'pointer', transition: 'all 0.15s', lineHeight: '1.5',
    flexShrink: 0,
  };
}

let cssInjected = false;
function injectCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .ha-num-marker { display:flex; align-items:center; justify-content:center; border-radius:50%; color:white; font-weight:700; font-family:Inter,system-ui,sans-serif; box-sizing:border-box; line-height:1; }
    .ha-trip-tip { font-family: Inter, system-ui, sans-serif; font-size: 11px; font-weight: 600;
                   padding: 3px 8px; border-radius: 4px; border: 1px solid #E8E3DA;
                   color: ${CHAR}; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                   white-space: nowrap; }
    .ha-trip-tip::before { display: none; }
    .ha-trip-tip.leaflet-tooltip-top { margin-top: -6px; }
    .ha-trip-major { font-family: Georgia, serif; font-size: 10.5px; font-weight: 700;
                     padding: 3px 8px; border-radius: 3px;
                     background: rgba(255,255,255,0.93); border: 1px solid rgba(201,169,110,0.35);
                     color: ${CHAR}; white-space: nowrap;
                     box-shadow: 0 2px 7px rgba(28,26,22,0.08); }
    .ha-trip-major::before { display: none; }
    .leaflet-control-zoom { border: 1px solid #E8E3DA !important; border-radius: 6px !important; overflow: hidden; }
    .leaflet-control-zoom a { color: ${MUTED} !important; border-bottom-color: #E8E3DA !important; }
    .leaflet-control-zoom a:hover { color: ${CHAR} !important; background: #F8F5F0 !important; }
    .leaflet-control-attribution { font-size: 9px !important; font-family: Inter, system-ui, sans-serif !important; background: rgba(255,255,255,0.55) !important; color: rgba(100,90,80,0.75) !important; padding: 2px 7px !important; box-shadow: none !important; border: none !important; }
    .leaflet-control-attribution a { color: rgba(100,90,80,0.75) !important; text-decoration: none !important; }
    .leaflet-control-attribution a:hover { color: rgba(27,107,101,0.9) !important; text-decoration: underline !important; }
  `;
  document.head.appendChild(s);
}

// Build a geocoding query from an item's location data + trip context
function buildItemQuery(item, trip) {
  const loc = (item.locationName || item.address || item.title || '').trim();
  const ctx = [trip?.destination, trip?.country].filter(Boolean).join(', ');
  return ctx ? `${loc}, ${ctx}` : loc;
}

// Returns the visit-ordered array of all trip locations, mirroring the Day by Day view order.
// Per-day order: itinerary stops (by sortOrder) → user items (by sortOrder) → day-only bookings.
// Bookings linked to a stop/item are interleaved right after their parent.
// Only items with valid lat/lng receive a sequenceNumber; others get sequenceNumber: null.
function getOrderedTripLocations({ itineraryStops, tripItems, tripBookings, tripDays, activeDay }) {
  const sortedDays = [...(tripDays || [])].sort((a, b) => (a.sortOrder || a.dayNumber) - (b.sortOrder || b.dayNumber));
  const days = activeDay ? sortedDays.filter(d => d.dayNumber === activeDay) : sortedDays;

  // Fallback: no tripDays provided — flatten using dayNumber alone
  if (!days.length) {
    const itin  = activeDay ? itineraryStops.filter(s => s.dayNumber === activeDay) : itineraryStops;
    const items = (activeDay ? tripItems.filter(i => i.dayNumber === activeDay) : tripItems)
      .filter(i => !i.isHidden).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const books = activeDay ? tripBookings.filter(b => b.dayNumber === activeDay) : tripBookings;
    let seq = 0;
    return [
      ...itin.map(s  => ({ ...s, _kind: 'itin' })),
      ...items.map(i => ({ ...i, _kind: 'item' })),
      ...books.map(b => ({ ...b, _kind: 'booking' })),
    ].map(x => ({ ...x, sequenceNumber: (x.latitude != null && x.longitude != null) ? ++seq : null }));
  }

  const result = [];

  for (const tripDay of days) {
    const dn = tripDay.dayNumber;

    // Itinerary stops for this day (already pre-sorted by MapTab via dayNumber+sortOrder)
    const dayStops = itineraryStops.filter(s => s.dayNumber === dn);

    // User items for this day, sorted by sortOrder
    const dayItems = tripItems
      .filter(i => i.tripDayId === tripDay.id && !i.isHidden)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    // All bookings for this day
    const dayBookings = tripBookings.filter(b =>
      b.tripDayId === tripDay.id || (!b.tripDayId && b.dayNumber === dn),
    );

    // Split bookings: linked to a stop, linked to an item, or free-floating day-level
    const stopBookMap = {};
    const itemBookMap = {};
    const dayOnlyBooks = [];
    dayBookings.forEach(b => {
      const sid = b.metadata?.itineraryDayStopId;
      const iid = b.tripItemId;
      if (sid && dayStops.some(s => s.id === sid)) {
        (stopBookMap[sid] = stopBookMap[sid] || []).push(b);
      } else if (iid) {
        (itemBookMap[iid] = itemBookMap[iid] || []).push(b);
      } else {
        dayOnlyBooks.push(b);
      }
    });

    for (const stop of dayStops) {
      result.push({ ...stop, _kind: 'itin' });
      for (const b of (stopBookMap[stop.id] || [])) result.push({ ...b, _kind: 'booking', dayNumber: dn });
    }

    for (const item of dayItems) {
      result.push({ ...item, _kind: 'item' });
      for (const b of (itemBookMap[item.id] || [])) result.push({ ...b, _kind: 'booking', dayNumber: dn });
    }

    [...dayOnlyBooks]
      .sort((a, b) => ((a.date || a.createdAt || '') < (b.date || b.createdAt || '') ? -1 : 1))
      .forEach(b => result.push({ ...b, _kind: 'booking', dayNumber: dn }));
  }

  let seq = 0;
  return result.map(x => ({ ...x, sequenceNumber: (x.latitude != null && x.longitude != null) ? ++seq : null }));
}

// Slightly offset markers that share the same grid cell so all remain accessible.
function offsetDuplicates(items) {
  const counts = {};
  return items.map(item => {
    if (item.latitude == null || item.longitude == null) return item;
    const key = `${item.latitude.toFixed(4)},${item.longitude.toFixed(4)}`;
    const idx  = counts[key] ?? 0;
    counts[key] = idx + 1;
    if (idx === 0) return item;
    const angle = (idx * 60 * Math.PI) / 180;
    const d     = 0.0003;
    return { ...item, latitude: item.latitude + d * Math.sin(angle), longitude: item.longitude + d * Math.cos(angle) };
  });
}

// Build a numbered circular Leaflet divIcon.
function makeNumberedIcon(seqNum, fillColor, edgeColor, isSelected, isMajor) {
  const base   = isMajor ? 26 : 22;
  const size   = isSelected ? base + 4 : base;
  const fSize  = seqNum >= 100 ? '8px' : seqNum >= 10 ? '9px' : '10px';
  const bw     = isSelected ? '2.5px' : '2px';
  const shadow = isSelected
    ? '0 0 0 3px rgba(28,26,22,0.18),0 3px 10px rgba(0,0,0,0.35)'
    : '0 2px 4px rgba(0,0,0,0.22)';
  const bc = isSelected ? CHAR : edgeColor;

  return L.divIcon({
    className: '',
    html: `<div class="ha-num-marker" style="width:${size}px;height:${size}px;background:${fillColor};border:${bw} solid ${bc};font-size:${fSize};box-shadow:${shadow};">${seqNum}</div>`,
    iconSize:      [size, size],
    iconAnchor:    [Math.floor(size / 2), Math.floor(size / 2)],
    tooltipAnchor: [0, -(Math.ceil(size / 2) + 4)],
  });
}

export default function TripRouteMap({ itineraryStops = [], tripItems = [], tripBookings = [], tripDays = [], trip, onRefresh }) {
  const { getToken } = useAuth();
  const mapDivRef  = useRef(null);
  const mapRef     = useRef(null);
  const markersRef = useRef({});
  const polyRef    = useRef(null);
  const [mapReady,     setMapReady]     = useState(false);
  const [selected,     setSelected]     = useState(null);   // { item, itemType }
  const [activeDay,    setActiveDay]    = useState(null);
  const [geocodingIds, setGeocodingIds] = useState({});     // id → 'loading'|'done'|'error'
  const [isMobile,     setIsMobile]     = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Ordered locations matching Day by Day view — recomputed on every day filter change
  const orderedLocations = useMemo(
    () => getOrderedTripLocations({ itineraryStops, tripItems, tripBookings, tripDays, activeDay }),
    [itineraryStops, tripItems, tripBookings, tripDays, activeDay],
  );

  // Visible on map (valid lat/lng), with duplicate-coordinate offset applied
  const visibleLocations = useMemo(
    () => offsetDuplicates(orderedLocations.filter(l => l.latitude != null && l.longitude != null)),
    [orderedLocations],
  );

  // Itinerary stops only — used for the route polyline
  const polylinePoints = useMemo(
    () => [...visibleLocations.filter(l => l._kind === 'itin')].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [visibleLocations],
  );

  // Day filter pill options (all unique day numbers across all layers)
  const allDays = useMemo(() => [...new Set([
    ...itineraryStops.filter(s => s.dayNumber).map(s => s.dayNumber),
    ...tripItems.filter(i => i.dayNumber && !i.isHidden).map(i => i.dayNumber),
    ...tripBookings.filter(b => b.dayNumber).map(b => b.dayNumber),
  ])].sort((a, b) => a - b), [itineraryStops, tripItems, tripBookings]);

  // Items/bookings that have a location name but no coordinates ("Needs location" section)
  const missingItems = [
    ...tripItems.filter(i => (i.locationName || i.address) && !i.latitude && i.isHidden !== true)
                .map(i => ({ ...i, _kind: 'item' })),
    ...tripBookings.filter(b => (b.locationName || b.address) && !b.latitude)
                   .map(b => ({ ...b, _kind: 'booking' })),
  ];

  const hasMap   = visibleLocations.length > 0;
  const stopsKey = visibleLocations.map(l =>
    `${l.id}:${l.latitude?.toFixed(6)}:${l.longitude?.toFixed(6)}:${l.sequenceNumber}`,
  ).join('|');

  // Init Leaflet once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    injectCSS();
    const map = L.map(mapDivRef.current, { zoomControl: true, scrollWheelZoom: false });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · © <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd', maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; setMapReady(false); };
  }, []); // init once

  // Rebuild all markers + polyline whenever visible data or day filter changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    if (polyRef.current) { polyRef.current.remove(); polyRef.current = null; }
    if (!hasMap) return;

    // Route polyline — itinerary stops only
    if (polylinePoints.length >= 2) {
      const color = activeDay ? dayColor(activeDay) : TEAL;
      polyRef.current = L.polyline(polylinePoints.map(s => [s.latitude, s.longitude]), {
        color, weight: 2, opacity: 0.55, dashArray: '8,5',
      }).addTo(map);
    }

    // Numbered markers for every visible location
    visibleLocations.forEach(loc => {
      const isSelected = selected?.item.id === loc.id;
      const kind    = loc._kind;
      const isMajor = loc.type === 'major' || loc.isMajorStop;

      let fillColor, edgeColor;
      if (kind === 'item') {
        fillColor = ITEM_C; edgeColor = '#2A5F7A';
      } else if (kind === 'booking') {
        fillColor = BOOK_C; edgeColor = '#8A4A18';
      } else {
        fillColor = isMajor ? GOLD : TEAL;
        edgeColor = isMajor ? '#9A7430' : '#1B4540';
      }

      const icon   = makeNumberedIcon(loc.sequenceNumber, fillColor, edgeColor, isSelected, isMajor);
      const marker = L.marker([loc.latitude, loc.longitude], { icon }).addTo(map);

      const label = loc.name || loc.title || '';
      if (label) {
        marker.bindTooltip(label, {
          permanent:  isMajor,
          direction:  'top',
          offset:     [0, -(Math.ceil((isMajor ? 26 : 22) / 2) + 4)],
          className:  isMajor ? 'ha-trip-major' : 'ha-trip-tip',
          opacity:    0.97,
        });
      }

      marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        setSelected(prev => prev?.item.id === loc.id ? null : { item: loc, itemType: loc._kind });
      });

      markersRef.current[loc.id] = marker;
    });

    if (visibleLocations.length > 0) {
      const bounds = L.latLngBounds(visibleLocations.map(l => [l.latitude, l.longitude]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13, animate: true });
    }
  }, [mapReady, stopsKey, activeDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update selected marker icon without a full rebuild
  useEffect(() => {
    if (!mapReady) return;
    visibleLocations.forEach(loc => {
      const marker = markersRef.current[loc.id];
      if (!marker) return;
      const isSelected = selected?.item.id === loc.id;
      const kind    = loc._kind;
      const isMajor = loc.type === 'major' || loc.isMajorStop;

      let fillColor, edgeColor;
      if (kind === 'item') {
        fillColor = ITEM_C; edgeColor = '#2A5F7A';
      } else if (kind === 'booking') {
        fillColor = BOOK_C; edgeColor = '#8A4A18';
      } else {
        fillColor = isMajor ? GOLD : TEAL;
        edgeColor = isMajor ? '#9A7430' : '#1B4540';
      }

      marker.setIcon(makeNumberedIcon(loc.sequenceNumber, fillColor, edgeColor, isSelected, isMajor));

      if (isSelected && mapRef.current) {
        mapRef.current.flyTo([loc.latitude, loc.longitude], Math.max(mapRef.current.getZoom(), 11), { animate: true, duration: 0.4 });
        if (marker.getTooltip()) marker.openTooltip();
      }
    });
  }, [selected, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Client-side geocoding for items/bookings missing coords
  async function geocodeAndSave(entry) {
    const { id, _kind } = entry;
    setGeocodingIds(s => ({ ...s, [id]: 'loading' }));
    try {
      const query = buildItemQuery(entry, trip);
      if (!query.trim()) throw new Error('No location text');
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=3`,
        { headers: { 'User-Agent': 'HiddenAtlas/1.0 (hiddenatlas.travel)', 'Accept-Language': 'en' } },
      );
      const results = await resp.json();
      if (!results?.length) throw new Error('Not found');
      const { lat, lon } = results[0];
      const token = await getToken();
      const endpoint = _kind === 'booking'
        ? `/api/trips?action=booking&bookingId=${id}`
        : `/api/trips?action=item&itemId=${id}`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: parseFloat(lat), longitude: parseFloat(lon) }),
      });
      setGeocodingIds(s => ({ ...s, [id]: 'done' }));
      onRefresh?.();
    } catch {
      setGeocodingIds(s => ({ ...s, [id]: 'error' }));
    }
  }

  function handleDayChange(d) { setActiveDay(d); setSelected(null); }

  const sel     = selected?.item;
  const selKind = selected?.itemType;

  const hasItinMajor = visibleLocations.some(l => l._kind === 'itin' && (l.type === 'major' || l.isMajorStop));
  const hasItinStop  = visibleLocations.some(l => l._kind === 'itin' && !(l.type === 'major' || l.isMajorStop));
  const hasItems     = visibleLocations.some(l => l._kind === 'item');
  const hasBookings  = visibleLocations.some(l => l._kind === 'booking');

  // Legend dot shared style
  const legendDot = (bg, border) => ({
    width: '14px', height: '14px', borderRadius: '50%', background: bg,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    border: `1.5px solid ${border}`, fontSize: '7px', fontWeight: '700', color: 'white',
    flexShrink: 0,
  });

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Day filter pills */}
      {allDays.length > 1 && (
        <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px', marginBottom: '10px', scrollbarWidth: 'none' }}>
          <button type="button" onClick={() => handleDayChange(null)} style={pillStyle(activeDay == null, TEAL)}>All days</button>
          {allDays.map(d => (
            <button key={d} type="button" onClick={() => handleDayChange(activeDay === d ? null : d)} style={pillStyle(activeDay === d, dayColor(d))}>
              Day {d}
            </button>
          ))}
        </div>
      )}

      {/* Map */}
      <div ref={mapDivRef} style={{
        height: isMobile ? '300px' : '420px', borderRadius: '10px', overflow: 'hidden',
        border: '1px solid #E8E3DA', boxShadow: '0 2px 16px rgba(28,26,22,0.07)',
      }} />

      {/* Map legend */}
      <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', marginTop: '8px' }}>
        {hasItinMajor && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(GOLD, '#9A7430')}>1</span> Major stop
          </span>
        )}
        {hasItinStop && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(TEAL, '#1B4540')}>2</span> Route stop
          </span>
        )}
        {!hasItinMajor && !hasItinStop && itineraryStops.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(TEAL, '#1B4540')}>1</span> Itinerary stop
          </span>
        )}
        {hasItems && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(ITEM_C, '#2A5F7A')}>3</span> Your places
          </span>
        )}
        {hasBookings && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(BOOK_C, '#8A4A18')}>4</span> Bookings
          </span>
        )}
      </div>

      {/* Selected item details card */}
      {sel && (
        <div style={{
          marginTop: '14px', background: 'white', borderRadius: '10px',
          border: '1px solid #E8E3DA', padding: '16px 20px',
          boxShadow: '0 2px 12px rgba(28,26,22,0.06)',
          display: 'flex', gap: '14px', alignItems: 'flex-start',
        }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, marginTop: '6px',
            background: selKind === 'item' ? ITEM_C : selKind === 'booking' ? BOOK_C : ((sel.type === 'major' || sel.isMajorStop) ? GOLD : TEAL),
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
              <h4 style={{ fontFamily: SERIF, fontSize: '17px', fontWeight: '600', color: CHAR, margin: 0, lineHeight: '1.3' }}>
                {sel.name || sel.title}
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                {sel.sequenceNumber && (
                  <span style={{
                    fontSize: '10px', fontWeight: '700', color: 'white',
                    background: selKind === 'item' ? ITEM_C : selKind === 'booking' ? BOOK_C : ((sel.type === 'major' || sel.isMajorStop) ? GOLD : TEAL),
                    padding: '2px 7px', borderRadius: '10px',
                  }}>
                    #{sel.sequenceNumber}
                  </span>
                )}
                {sel.dayNumber && (
                  <span style={{ fontSize: '10.5px', fontWeight: '600', letterSpacing: '0.7px', color: TEAL, background: '#EFF6F5', padding: '3px 9px', borderRadius: '12px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                    Day {sel.dayNumber}
                  </span>
                )}
              </div>
            </div>

            {(selKind === 'item' || selKind === 'booking') && (
              <p style={{ fontSize: '11.5px', color: MUTED, margin: '0 0 6px', fontWeight: '500' }}>
                {selKind === 'item' ? (ITEM_TYPE_LABELS[sel.type] || sel.type) : (BOOKING_TYPE_LABELS[sel.type] || 'Booking')}
              </p>
            )}

            {(sel.description || sel.notes) && (
              <p style={{ fontSize: '13.5px', color: MUTED, lineHeight: '1.65', margin: '0 0 8px' }}>
                {sel.description || sel.notes}
              </p>
            )}

            {(sel.startTime || sel.time) && (
              <p style={{ fontSize: '12.5px', color: MUTED, margin: '0 0 4px' }}>
                {sel.startTime || sel.time}{sel.endTime ? ` – ${sel.endTime}` : ''}
              </p>
            )}

            {sel.locationName && (
              <p style={{ fontSize: '12.5px', color: MUTED, margin: '0 0 4px' }}>{sel.locationName}</p>
            )}

            {selKind === 'booking' && sel.provider && (
              <p style={{ fontSize: '12px', color: MUTED, margin: '0 0 4px' }}>
                {sel.provider}{sel.confirmationReference ? ` · Ref: ${sel.confirmationReference}` : ''}
              </p>
            )}
          </div>
          <button type="button" onClick={() => setSelected(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '-2px' }}>×</button>
        </div>
      )}

      {/* No map data fallback */}
      {!hasMap && (
        <div style={{ marginTop: '14px', padding: '20px', background: '#FAF8F4', border: '1px solid #E8E3DA', borderRadius: '8px', textAlign: 'center' }}>
          <p style={{ fontSize: '13.5px', color: MUTED, marginBottom: '4px' }}>Map unavailable — no coordinates found for route stops.</p>
          <p style={{ fontSize: '12px', color: '#B5AA99' }}>Coordinates can be added from the backoffice CMS editor.</p>
        </div>
      )}

      {/* Needs location section */}
      {missingItems.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.2px', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>
            Needs location
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {missingItems.map(entry => {
              const gs = geocodingIds[entry.id];
              return (
                <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13.5px', fontWeight: '600', color: CHAR, marginBottom: '2px' }}>{entry.title}</p>
                    {entry.locationName && <p style={{ fontSize: '12px', color: MUTED }}>{entry.locationName}</p>}
                    {entry.dayNumber && <p style={{ fontSize: '11px', color: '#B5AA99' }}>Day {entry.dayNumber}</p>}
                    {gs === 'done' && <p style={{ fontSize: '11.5px', color: TEAL, marginTop: '3px' }}>Coordinates found</p>}
                    {gs === 'error' && <p style={{ fontSize: '11.5px', color: '#C0392B', marginTop: '3px' }}>Could not find coordinates</p>}
                  </div>
                  {gs !== 'done' && getToken && (
                    <button type="button" onClick={() => geocodeAndSave(entry)} disabled={gs === 'loading'}
                      style={{ fontSize: '11.5px', fontWeight: '600', color: gs === 'loading' ? MUTED : TEAL, background: 'none', border: `1px solid ${gs === 'loading' ? '#E8E3DA' : '#1B6B65'}`, borderRadius: '6px', padding: '5px 10px', cursor: gs === 'loading' ? 'default' : 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                      {gs === 'loading' ? 'Finding…' : 'Find location'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
