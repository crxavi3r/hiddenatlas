/**
 * TripRouteMap — Leaflet map for the My Trips workspace.
 *
 * Shows three overlapping data layers on one map:
 *   1. ItineraryDayStop records (original route — gold/teal markers)
 *   2. TripItem records with coordinates (user-added places — blue markers)
 *   3. TripBooking records with coordinates (confirmed bookings — amber markers)
 *
 * Props:
 *   itineraryStops  — transformed ItineraryDayStop records with lat/lng
 *   tripItems       — raw TripItem records from workspace
 *   tripBookings    — raw TripBooking records from workspace
 *   trip            — Trip record (used for country context when geocoding)
 *   getToken        — () => Promise<string> — Clerk token for API saves
 *   onRefresh       — () => void — reload workspace after coordinate save
 */
import { useState, useEffect, useRef } from 'react';
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

// Item type → display label
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
    .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,0.7) !important; padding: 2px 6px !important; }
  `;
  document.head.appendChild(s);
}

// Build a geocoding query from an item's location data + trip context
function buildItemQuery(item, trip) {
  const loc = (item.locationName || item.address || item.title || '').trim();
  const ctx = [trip?.destination, trip?.country].filter(Boolean).join(', ');
  return ctx ? `${loc}, ${ctx}` : loc;
}

export default function TripRouteMap({ itineraryStops = [], tripItems = [], tripBookings = [], trip, onRefresh }) {
  const { getToken } = useAuth();
  const mapDivRef  = useRef(null);
  const mapRef     = useRef(null);
  const markersRef = useRef({});
  const polyRef    = useRef(null);
  const [mapReady,     setMapReady]     = useState(false);
  const [selected,     setSelected]     = useState(null);  // { item, itemType }
  const [activeDay,    setActiveDay]    = useState(null);
  const [geocodingIds, setGeocodingIds] = useState({});    // { id: 'loading'|'done'|'error' }
  const [isMobile,     setIsMobile]     = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Categorise stops
  const validItin  = itineraryStops.filter(s => s.latitude != null && s.longitude != null);
  const validItems = tripItems.filter(i => i.latitude != null && i.longitude != null && i.isHidden !== true);
  const validBooks = tripBookings.filter(b => b.latitude != null && b.longitude != null);

  // Items/bookings that have a location but no coords (show in "Needs location" section)
  const missingItems = [
    ...tripItems.filter(i => (i.locationName || i.address) && !i.latitude && i.isHidden !== true)
                .map(i => ({ ...i, _kind: 'item' })),
    ...tripBookings.filter(b => (b.locationName || b.address) && !b.latitude)
                   .map(b => ({ ...b, _kind: 'booking' })),
  ];

  const allDays = [...new Set([
    ...validItin.filter(s => s.dayNumber).map(s => s.dayNumber),
    ...validItems.filter(i => i.dayNumber).map(i => i.dayNumber),
    ...validBooks.filter(b => b.dayNumber).map(b => b.dayNumber),
  ])].sort((a, b) => a - b);

  const filtered = {
    itin:  activeDay ? validItin.filter(s => s.dayNumber === activeDay)  : validItin,
    items: activeDay ? validItems.filter(i => i.dayNumber === activeDay) : validItems,
    books: activeDay ? validBooks.filter(b => b.dayNumber === activeDay) : validBooks,
  };
  const allFiltered = [...filtered.itin, ...filtered.items, ...filtered.books];

  const stopsKey = allFiltered.map(s => `${s.id}:${s.latitude}:${s.longitude}`).join('|');
  const hasMap   = allFiltered.length > 0;

  // Init Leaflet
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    injectCSS();
    const map = L.map(mapDivRef.current, { zoomControl: true, scrollWheelZoom: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd', maxZoom: 18,
    }).addTo(map);
    mapRef.current = map;
    setMapReady(true);
    return () => { map.remove(); mapRef.current = null; setMapReady(false); };
  }, []); // init once

  // Rebuild markers + polyline
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    if (polyRef.current) { polyRef.current.remove(); polyRef.current = null; }
    if (!hasMap) return;

    // Route polyline — itinerary stops only
    if (filtered.itin.length >= 2) {
      const sorted = [...filtered.itin].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const color  = activeDay ? dayColor(activeDay) : TEAL;
      polyRef.current = L.polyline(sorted.map(s => [s.latitude, s.longitude]), {
        color, weight: 2, opacity: 0.55, dashArray: '8,5',
      }).addTo(map);
    }

    const addMarker = (item, fillColor, edgeColor, isMajor, label) => {
      const isSelected = selected && selected.item.id === item.id;
      const marker = L.circleMarker([item.latitude, item.longitude], {
        radius:      isMajor ? 9 : (fillColor === ITEM_C || fillColor === BOOK_C ? 7 : 5.5),
        fillColor,
        color:       isSelected ? CHAR : edgeColor,
        weight:      isSelected ? 2.5 : (isMajor ? 1.8 : 1.5),
        fillOpacity: isSelected ? 1 : 0.88,
        opacity:     1,
      }).addTo(map);
      marker.bindTooltip(label, {
        permanent:  isMajor,
        direction:  'top',
        offset:     [0, isMajor ? -11 : -8],
        className:  isMajor ? 'ha-trip-major' : 'ha-trip-tip',
        opacity:    0.97,
      });
      marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        setSelected(prev => prev?.item.id === item.id ? null : { item, itemType: item._type });
      });
      markersRef.current[item.id] = marker;
    };

    // Itinerary stops
    filtered.itin.forEach(s => {
      const isMajor = s.type === 'major' || s.isMajorStop;
      addMarker({ ...s, _type: 'itin' }, isMajor ? GOLD : TEAL, isMajor ? '#9A7430' : '#1B4540', isMajor, s.name);
    });
    // TripItems
    filtered.items.forEach(i => {
      addMarker({ ...i, _type: 'item' }, ITEM_C, '#2A5F7A', false, i.title);
    });
    // TripBookings
    filtered.books.forEach(b => {
      addMarker({ ...b, _type: 'booking' }, BOOK_C, '#8A4A18', false, b.title);
    });

    if (allFiltered.length > 0) {
      const bounds = L.latLngBounds(allFiltered.map(s => [s.latitude, s.longitude]));
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13, animate: true });
    }
  }, [mapReady, stopsKey, activeDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update selected marker styling
  useEffect(() => {
    if (!mapReady) return;
    allFiltered.forEach(item => {
      const marker = markersRef.current[item.id];
      if (!marker) return;
      const isSelected = selected?.item.id === item.id;
      const isMajor    = item.type === 'major' || item.isMajorStop;
      const kind       = item._type || (filtered.items.includes(item) ? 'item' : filtered.books.includes(item) ? 'booking' : 'itin');
      const fc = kind === 'item' ? ITEM_C : kind === 'booking' ? BOOK_C : (isMajor ? GOLD : TEAL);
      const ec = kind === 'item' ? '#2A5F7A' : kind === 'booking' ? '#8A4A18' : (isMajor ? '#9A7430' : '#1B4540');
      marker.setRadius(isSelected ? 11 : (isMajor ? 9 : (kind !== 'itin' ? 7 : 5.5)));
      marker.setStyle({ fillColor: fc, color: isSelected ? CHAR : ec, weight: isSelected ? 2.5 : (isMajor ? 1.8 : 1.5), fillOpacity: isSelected ? 1 : 0.88 });
      if (isSelected && mapRef.current) {
        mapRef.current.flyTo([item.latitude, item.longitude], Math.max(mapRef.current.getZoom(), 11), { animate: true, duration: 0.4 });
        marker.openTooltip();
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
        { headers: { 'User-Agent': 'HiddenAtlas/1.0 (hiddenatlas.travel)', 'Accept-Language': 'en' } }
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

  const sel = selected?.item;
  const selKind = selected?.itemType;

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
        {validItin.length > 0 && (
          <>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', background: GOLD, display: 'inline-block', border: '1.5px solid #9A7430' }} /> Major stop
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: TEAL, display: 'inline-block', border: '1.5px solid #1B4540' }} /> Route stop
            </span>
          </>
        )}
        {validItems.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: ITEM_C, display: 'inline-block', border: '1.5px solid #2A5F7A' }} /> Your places
          </span>
        )}
        {validBooks.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: BOOK_C, display: 'inline-block', border: '1.5px solid #8A4A18' }} /> Bookings
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
            width: '9px', height: '9px', borderRadius: '50%', flexShrink: 0, marginTop: '6px',
            background: selKind === 'item' ? ITEM_C : selKind === 'booking' ? BOOK_C : ((sel.type === 'major' || sel.isMajorStop) ? GOLD : TEAL),
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '4px' }}>
              <h4 style={{ fontFamily: SERIF, fontSize: '17px', fontWeight: '600', color: CHAR, margin: 0, lineHeight: '1.3' }}>
                {sel.name || sel.title}
              </h4>
              {sel.dayNumber && (
                <span style={{ fontSize: '10.5px', fontWeight: '600', letterSpacing: '0.7px', color: TEAL, background: '#EFF6F5', padding: '3px 9px', borderRadius: '12px', flexShrink: 0, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                  Day {sel.dayNumber}
                </span>
              )}
            </div>

            {/* Type label */}
            {(selKind === 'item' || selKind === 'booking') && (
              <p style={{ fontSize: '11.5px', color: MUTED, margin: '0 0 6px', fontWeight: '500' }}>
                {selKind === 'item' ? (ITEM_TYPE_LABELS[sel.type] || sel.type) : (BOOKING_TYPE_LABELS[sel.type] || 'Booking')}
              </p>
            )}

            {/* Description / notes */}
            {(sel.description || sel.notes) && (
              <p style={{ fontSize: '13.5px', color: MUTED, lineHeight: '1.65', margin: '0 0 8px' }}>
                {sel.description || sel.notes}
              </p>
            )}

            {/* Time */}
            {(sel.startTime || sel.time) && (
              <p style={{ fontSize: '12.5px', color: MUTED, margin: '0 0 4px' }}>
                {sel.startTime || sel.time}{sel.endTime ? ` – ${sel.endTime}` : ''}
              </p>
            )}

            {/* Location name */}
            {sel.locationName && (
              <p style={{ fontSize: '12.5px', color: MUTED, margin: '0 0 4px' }}>{sel.locationName}</p>
            )}

            {/* Booking-specific: provider + reference */}
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
