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

// Build a geocoding query from an item's location data + trip context.
// _fallbackLocation carries address from a linked booking when the item itself has no address.
function buildItemQuery(item, trip) {
  const loc = (item.locationName || item.address || item._fallbackLocation || item.title || item.name || '').trim();
  const ctx = [trip?.destination, trip?.country].filter(Boolean).join(', ');
  return ctx ? `${loc}, ${ctx}` : loc;
}

// Returns the visit-ordered array of all trip locations, mirroring the Day by Day view order.
// Normalisation rule: bookings linked to a stop (via metadata.itineraryDayStopId) or to a
// TripItem (via tripItemId) are NOT independent map locations — they are merged into their
// parent entity. This prevents duplicate markers for event + booking pairs.
// The booking data is attached as _linkedBookings on the parent entry.
// If the parent has no coords but a linked booking does, the booking's coords are used as fallback.
function getOrderedTripLocations({ itineraryStops, tripItems, tripBookings, tripDays, activeDay }) {
  const sortedDays = [...(tripDays || [])].sort((a, b) => (a.sortOrder || a.dayNumber) - (b.sortOrder || b.dayNumber));
  const days = activeDay ? sortedDays.filter(d => d.dayNumber === activeDay) : sortedDays;

  // Helper: build booking aggregation maps for a set of bookings and stops
  function buildBookMaps(books, stops) {
    const stopBookMap = {}, itemBookMap = {}, freeBooks = [];
    books.forEach(b => {
      const sid = b.metadata?.itineraryDayStopId;
      const iid = b.tripItemId;
      if (sid && stops.some(s => s.id === sid)) {
        (stopBookMap[sid] = stopBookMap[sid] || []).push(b);
      } else if (iid) {
        (itemBookMap[iid] = itemBookMap[iid] || []).push(b);
      } else {
        freeBooks.push(b);
      }
    });
    return { stopBookMap, itemBookMap, freeBooks };
  }

  // Fallback: no tripDays provided — flatten using dayNumber alone
  if (!days.length) {
    const itin  = activeDay ? itineraryStops.filter(s => s.dayNumber === activeDay) : itineraryStops;
    const items = (activeDay ? tripItems.filter(i => i.dayNumber === activeDay) : tripItems)
      .filter(i => !i.isHidden).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const books = activeDay ? tripBookings.filter(b => b.dayNumber === activeDay) : tripBookings;
    const { stopBookMap, itemBookMap, freeBooks } = buildBookMaps(books, itin);
    let seq = 0;
    return [
      ...itin.map(s => {
        const linked = stopBookMap[s.id] || [];
        const lat = s.latitude ?? linked.find(b => b.latitude != null)?.latitude ?? null;
        const lng = s.longitude ?? linked.find(b => b.longitude != null)?.longitude ?? null;
        return { ...s, _kind: 'itin', latitude: lat, longitude: lng, _linkedBookings: linked };
      }),
      ...items.map(i => {
        const linked = itemBookMap[i.id] || [];
        const lat = i.latitude ?? linked.find(b => b.latitude != null)?.latitude ?? null;
        const lng = i.longitude ?? linked.find(b => b.longitude != null)?.longitude ?? null;
        return { ...i, _kind: 'item', latitude: lat, longitude: lng, _linkedBookings: linked };
      }),
      ...freeBooks.map(b => ({ ...b, _kind: 'booking' })),
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

    const { stopBookMap, itemBookMap, freeBooks: dayOnlyBooks } = buildBookMaps(dayBookings, dayStops);

    for (const stop of dayStops) {
      const linked = stopBookMap[stop.id] || [];
      // Use booking coords as fallback when the stop itself has no coordinates
      const lat = stop.latitude ?? linked.find(b => b.latitude != null)?.latitude ?? null;
      const lng = stop.longitude ?? linked.find(b => b.longitude != null)?.longitude ?? null;
      result.push({ ...stop, _kind: 'itin', latitude: lat, longitude: lng, _linkedBookings: linked });
      // Linked bookings are merged into the stop — no separate markers
    }

    for (const item of dayItems) {
      const linked = itemBookMap[item.id] || [];
      // Use booking coords as fallback when the item itself has no coordinates
      const lat = item.latitude ?? linked.find(b => b.latitude != null)?.latitude ?? null;
      const lng = item.longitude ?? linked.find(b => b.longitude != null)?.longitude ?? null;
      result.push({ ...item, _kind: 'item', latitude: lat, longitude: lng, _linkedBookings: linked });
      // Linked bookings are merged into the item — no separate markers
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

// ─────────────────────────────────────────────────────────────────────────────
// Location picker helpers
// ─────────────────────────────────────────────────────────────────────────────

// Normalize a string that might use comma as decimal separator.
function parseCoord(s) {
  if (s == null || s === '') return null;
  const n = parseFloat(String(s).trim().replace(',', '.'));
  return isNaN(n) ? null : n;
}

// Try to parse "lat, lng" (Google Maps paste, semicolons, etc.) into two coords.
// Returns { lat, lng } or null if the string doesn't look like a coordinate pair.
function tryParsePair(s) {
  const t = s.trim();
  // Must contain exactly one comma or semicolon separating two decimal numbers
  const m = t.match(/^([-+]?\d+[.,]?\d*)\s*[,;]\s*([-+]?\d+[.,]?\d*)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  if (isNaN(lat) || isNaN(lng)) return null;
  // Sanity: at least one number must be non-integer (real coords) OR look plausible
  if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) return { lat, lng };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// LocationPickerModal — Search / Manual / Map-click picker
// ─────────────────────────────────────────────────────────────────────────────
function LocationPickerModal({ entry, trip, onConfirm, onClose }) {
  const isEdit = entry.latitude != null;
  const [tab, setTab] = useState('search');

  // Shared coordinate state — all three tabs read/write these
  const [lat, setLat] = useState(isEdit ? String(entry.latitude) : '');
  const [lng, setLng] = useState(isEdit ? String(entry.longitude) : '');

  // Search tab state
  const [searchQuery,   setSearchQuery]   = useState(() => buildItemQuery(entry, trip));
  const [searchResults, setSearchResults] = useState([]);
  const [searching,     setSearching]     = useState(false);
  const [searchError,   setSearchError]   = useState('');

  // Mini-map tab refs
  const pickerDivRef    = useRef(null);
  const pickerMapRef    = useRef(null);
  const pickerMarkerRef = useRef(null);

  // Computed numbers
  const latNum = parseCoord(lat);
  const lngNum = parseCoord(lng);
  const isValid = latNum !== null && lngNum !== null
    && latNum >= -90  && latNum <= 90
    && lngNum >= -180 && lngNum <= 180;

  // ESC to close
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Auto-search on open when entry has no coords
  useEffect(() => {
    if (!isEdit && searchQuery.trim()) doSearch(searchQuery);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function doSearch(q) {
    if (!q.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const r = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5`,
        { headers: { 'User-Agent': 'HiddenAtlas/1.0 (hiddenatlas.travel)', 'Accept-Language': 'en' } },
      );
      const data = await r.json();
      if (!data?.length) setSearchError('No results found — try a different term.');
      else setSearchResults(data);
    } catch {
      setSearchError('Search failed. Check your connection and try again.');
    } finally {
      setSearching(false);
    }
  }

  function selectResult(r) {
    setLat(parseFloat(r.lat).toFixed(6));
    setLng(parseFloat(r.lon).toFixed(6));
    setSearchResults([]);
    setSearchError('');
  }

  // Paste handler for the lat field — detects "lat, lng" pairs
  function handleLatInput(val) {
    const pair = tryParsePair(val);
    if (pair) {
      setLat(String(pair.lat));
      setLng(String(pair.lng));
    } else {
      setLat(val);
    }
  }

  // ── Mini-map lifecycle ──────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'map') return;
    if (!pickerDivRef.current || pickerMapRef.current) return;

    injectCSS(); // reuse shared CSS injector
    const initLat = (isValid ? latNum : null) ?? 20;
    const initLng = (isValid ? lngNum : null) ?? 0;
    const zoom    = isValid ? 13 : 2;

    const map = L.map(pickerDivRef.current, { zoomControl: true, scrollWheelZoom: true });
    map.attributionControl.setPrefix(false);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OSM</a> · © <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd', maxZoom: 18,
    }).addTo(map);
    map.setView([initLat, initLng], zoom);

    const marker = L.marker([initLat, initLng], {
      draggable: true,
      icon: L.divIcon({
        className: '',
        html: `<div style="width:22px;height:22px;border-radius:50%;background:${TEAL};border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);cursor:grab;box-sizing:border-box;"></div>`,
        iconSize: [22, 22], iconAnchor: [11, 11],
      }),
    }).addTo(map);

    marker.on('dragend', e => {
      const p = e.target.getLatLng();
      setLat(p.lat.toFixed(6));
      setLng(p.lng.toFixed(6));
    });

    map.on('click', e => {
      marker.setLatLng(e.latlng);
      setLat(e.latlng.lat.toFixed(6));
      setLng(e.latlng.lng.toFixed(6));
    });

    pickerMapRef.current    = map;
    pickerMarkerRef.current = marker;
    return () => { map.remove(); pickerMapRef.current = null; pickerMarkerRef.current = null; };
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync marker when lat/lng change from other tabs
  useEffect(() => {
    if (!pickerMarkerRef.current || !isValid) return;
    const cur = pickerMarkerRef.current.getLatLng();
    if (Math.abs(cur.lat - latNum) > 1e-5 || Math.abs(cur.lng - lngNum) > 1e-5) {
      pickerMarkerRef.current.setLatLng([latNum, lngNum]);
      pickerMapRef.current?.panTo([latNum, lngNum]);
    }
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Style helpers ──────────────────────────────────────────────────────────
  const BORDER = '#E8E3DA';
  const tabBtn = active => ({
    padding: '9px 16px', fontSize: '12.5px', fontWeight: active ? '700' : '400',
    color: active ? TEAL : MUTED, background: 'none', border: 'none', cursor: 'pointer',
    borderBottom: active ? `2px solid ${TEAL}` : '2px solid transparent',
    marginBottom: '-1px', transition: 'color 0.15s', lineHeight: '1',
  });
  const inputSt = (invalid) => ({
    width: '100%', padding: '10px 12px', border: `1px solid ${invalid ? '#C0392B' : BORDER}`,
    borderRadius: '6px', fontSize: '13.5px', color: CHAR,
    fontFamily: 'Inter, system-ui, sans-serif', outline: 'none', boxSizing: 'border-box',
  });
  const labelSt = {
    display: 'block', fontSize: '10.5px', fontWeight: '700',
    letterSpacing: '1.5px', textTransform: 'uppercase', color: TEAL, marginBottom: '6px',
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 3000,
      background: 'rgba(28,26,22,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        background: 'white', borderRadius: '14px',
        width: '100%', maxWidth: '480px',
        maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(28,26,22,0.28)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px 0', borderBottom: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px' }}>
            <div>
              <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>
                {isEdit ? 'Edit location' : 'Find location'}
              </p>
              <h3 style={{ fontFamily: SERIF, fontSize: '17px', fontWeight: '600', color: CHAR, margin: 0, lineHeight: '1.3' }}>
                {entry.title || entry.name}
              </h3>
              {entry.locationName && (
                <p style={{ fontSize: '12px', color: MUTED, marginTop: '3px' }}>{entry.locationName}</p>
              )}
            </div>
            <button type="button" onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '20px', lineHeight: 1, padding: '2px', flexShrink: 0 }}>×</button>
          </div>
          <div style={{ display: 'flex' }}>
            <button type="button" onClick={() => setTab('search')} style={tabBtn(tab === 'search')}>Search</button>
            <button type="button" onClick={() => setTab('manual')} style={tabBtn(tab === 'manual')}>Manual</button>
            <button type="button" onClick={() => setTab('map')}    style={tabBtn(tab === 'map')}>Map</button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────────── */}
        <div style={{ padding: '20px 24px', flex: 1 }}>
          {/* Coords preview strip */}
          {isValid && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', background: '#EFF6F5', borderRadius: '7px', marginBottom: '16px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: TEAL, flexShrink: 0 }} />
              <span style={{ fontSize: '12.5px', color: TEAL, fontWeight: '600', fontFamily: 'monospace' }}>
                {latNum.toFixed(5)}, {lngNum.toFixed(5)}
              </span>
            </div>
          )}

          {/* ── Search tab ─────────────────────────────────────────────────── */}
          {tab === 'search' && (
            <div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                <input
                  type="text" value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doSearch(searchQuery)}
                  placeholder="Place name or address…"
                  autoFocus
                  style={{ ...inputSt(false), flex: 1 }}
                />
                <button type="button" onClick={() => doSearch(searchQuery)} disabled={searching}
                  style={{ padding: '10px 16px', background: TEAL, color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: searching ? 'default' : 'pointer', opacity: searching ? 0.7 : 1, flexShrink: 0 }}>
                  {searching ? '…' : 'Search'}
                </button>
              </div>
              {searchError && (
                <p style={{ fontSize: '12.5px', color: '#B04040', marginBottom: '8px' }}>{searchError}</p>
              )}
              {searchResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {searchResults.map((r, i) => {
                    const parts = r.display_name.split(',');
                    return (
                      <button key={i} type="button" onClick={() => selectResult(r)}
                        style={{ textAlign: 'left', padding: '10px 14px', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '8px', cursor: 'pointer', transition: 'border-color 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = TEAL}
                        onMouseLeave={e => e.currentTarget.style.borderColor = BORDER}>
                        <p style={{ fontSize: '13.5px', fontWeight: '600', color: CHAR, marginBottom: '2px', lineHeight: '1.3' }}>
                          {parts[0]}
                        </p>
                        <p style={{ fontSize: '11.5px', color: MUTED, lineHeight: '1.4', marginBottom: '3px' }}>
                          {parts.slice(1, 4).join(',').trim()}
                        </p>
                        <p style={{ fontSize: '10.5px', color: '#B5AA99', fontFamily: 'monospace' }}>
                          {parseFloat(r.lat).toFixed(5)}, {parseFloat(r.lon).toFixed(5)}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
              {!searching && !searchError && searchResults.length === 0 && (
                <p style={{ fontSize: '12.5px', color: MUTED, lineHeight: '1.6' }}>
                  Enter a place name or address and press Search or ↵.
                </p>
              )}
            </div>
          )}

          {/* ── Manual tab ─────────────────────────────────────────────────── */}
          {tab === 'manual' && (
            <div>
              <p style={{ fontSize: '12.5px', color: MUTED, lineHeight: '1.6', marginBottom: '16px' }}>
                Enter decimal coordinates, or paste a <strong style={{ fontWeight: '600', color: CHAR }}>"lat, lng"</strong> pair (e.g. from Google Maps) directly into the Latitude field.
              </p>
              <div style={{ marginBottom: '14px' }}>
                <label style={labelSt}>Latitude</label>
                <input
                  type="text" value={lat}
                  onChange={e => handleLatInput(e.target.value)}
                  placeholder="e.g. 42.107246"
                  style={inputSt(latNum !== null && (latNum < -90 || latNum > 90))}
                />
                {latNum !== null && (latNum < -90 || latNum > 90) && (
                  <p style={{ fontSize: '11.5px', color: '#B04040', marginTop: '4px' }}>Must be between −90 and 90.</p>
                )}
              </div>
              <div>
                <label style={labelSt}>Longitude</label>
                <input
                  type="text" value={lng}
                  onChange={e => setLng(e.target.value)}
                  placeholder="e.g. -8.260819"
                  style={inputSt(lngNum !== null && (lngNum < -180 || lngNum > 180))}
                />
                {lngNum !== null && (lngNum < -180 || lngNum > 180) && (
                  <p style={{ fontSize: '11.5px', color: '#B04040', marginTop: '4px' }}>Must be between −180 and 180.</p>
                )}
              </div>
            </div>
          )}

          {/* ── Map tab ────────────────────────────────────────────────────── */}
          {tab === 'map' && (
            <div>
              <p style={{ fontSize: '12.5px', color: MUTED, marginBottom: '10px', lineHeight: '1.5' }}>
                Click on the map or drag the marker to set the location.
              </p>
              <div ref={pickerDivRef} style={{ height: '270px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${BORDER}` }} />
              {isValid && (
                <p style={{ fontSize: '11px', color: MUTED, marginTop: '6px', textAlign: 'center', fontFamily: 'monospace' }}>
                  {latNum.toFixed(5)}, {lngNum.toFixed(5)}
                </p>
              )}
              {!isValid && (
                <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '6px', textAlign: 'center' }}>
                  Click anywhere on the map to set a pin.
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        <div style={{ padding: '16px 24px 24px', display: 'flex', gap: '10px', justifyContent: 'flex-end', borderTop: `1px solid ${BORDER}`, flexShrink: 0 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '10px 20px', background: 'transparent', color: MUTED, border: `1px solid ${BORDER}`, borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
            Cancel
          </button>
          <button type="button" onClick={() => isValid && onConfirm(latNum, lngNum)} disabled={!isValid}
            style={{ padding: '10px 20px', background: isValid ? TEAL : '#E8E3DA', color: isValid ? 'white' : '#B5AA99', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: isValid ? 'pointer' : 'not-allowed', transition: 'background 0.15s' }}>
            Save location
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TripRouteMap({ itineraryStops = [], tripItems = [], tripBookings = [], tripDays = [], trip, onRefresh }) {
  const { getToken } = useAuth();
  const mapDivRef  = useRef(null);
  const mapRef     = useRef(null);
  const markersRef = useRef({});
  const polyRef    = useRef(null);
  const [mapReady,       setMapReady]       = useState(false);
  const [selected,       setSelected]       = useState(null);   // { item, itemType }
  const [activeDay,      setActiveDay]      = useState(null);
  const [coordOverrides, setCoordOverrides] = useState({});     // id → { latitude, longitude }
  const [locationModal,  setLocationModal]  = useState(null);   // entry to edit, or null
  const [isMobile,       setIsMobile]       = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Apply optimistic coord overrides on top of server data so the map updates
  // immediately after "Save location" without waiting for a full refresh.
  const effectiveTripItems = useMemo(() =>
    tripItems.map(i => {
      const ov = coordOverrides[i.id];
      return ov ? { ...i, latitude: ov.latitude, longitude: ov.longitude } : i;
    }),
    [tripItems, coordOverrides],
  );
  const effectiveTripBookings = useMemo(() =>
    tripBookings.map(b => {
      const ov = coordOverrides[b.id];
      return ov ? { ...b, latitude: ov.latitude, longitude: ov.longitude } : b;
    }),
    [tripBookings, coordOverrides],
  );

  // Ordered locations matching Day by Day view — recomputed on every day filter change
  const orderedLocations = useMemo(
    () => getOrderedTripLocations({ itineraryStops, tripItems: effectiveTripItems, tripBookings: effectiveTripBookings, tripDays, activeDay }),
    [itineraryStops, effectiveTripItems, effectiveTripBookings, tripDays, activeDay],
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
    ...effectiveTripItems.filter(i => i.dayNumber && !i.isHidden).map(i => i.dayNumber),
    ...effectiveTripBookings.filter(b => b.dayNumber).map(b => b.dayNumber),
  ])].sort((a, b) => a - b), [itineraryStops, effectiveTripItems, effectiveTripBookings]);

  // Bookings linked to a stop or item are aggregated into their parent entity on the map.
  // They must not create independent "Needs location" entries — that would duplicate the parent.
  const linkedBookingIds = new Set(
    effectiveTripBookings
      .filter(b => b.tripItemId || b.metadata?.itineraryDayStopId)
      .map(b => b.id),
  );

  // Items/bookings that have a location name but no coordinates ("Needs location" section).
  // When a TripItem has no coords but a linked booking has address info, attach it as
  // _fallbackLocation so geocoding uses the more specific address.
  const missingItems = [
    ...effectiveTripItems
      .filter(i => (i.locationName || i.address) && !i.latitude && i.isHidden !== true)
      .map(i => {
        const linkedBook = effectiveTripBookings.find(b => b.tripItemId === i.id && (b.locationName || b.address));
        return {
          ...i,
          _kind: 'item',
          _fallbackLocation: linkedBook ? (linkedBook.locationName || linkedBook.address) : null,
        };
      }),
    // Only free-floating bookings (not linked to any stop or item) appear independently
    ...effectiveTripBookings
      .filter(b => !linkedBookingIds.has(b.id) && (b.locationName || b.address) && !b.latitude)
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

  // Apply coords optimistically then persist to server in background
  async function handleLocationSave(id, kind, lat, lng) {
    setCoordOverrides(s => ({ ...s, [id]: { latitude: lat, longitude: lng } }));
    setLocationModal(null);
    try {
      const token = await getToken();
      const endpoint = kind === 'booking'
        ? `/api/trips?action=booking&bookingId=${id}`
        : `/api/trips?action=item&itemId=${id}`;
      await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ latitude: lat, longitude: lng }),
      });
      onRefresh?.();
    } catch {
      // Override stays in place even if server write fails; refresh will reconcile
    }
  }

  function openLocationModal(entry) { setLocationModal(entry); }

  function handleDayChange(d) { setActiveDay(d); setSelected(null); }

  const sel     = selected?.item;
  const selKind = selected?.itemType;

  const itinMajorCount = visibleLocations.filter(l => l._kind === 'itin' && (l.type === 'major' || l.isMajorStop)).length;
  const itinStopCount  = visibleLocations.filter(l => l._kind === 'itin' && !(l.type === 'major' || l.isMajorStop)).length;
  const itemsCount     = visibleLocations.filter(l => l._kind === 'item').length;
  const bookingsCount  = visibleLocations.filter(l => l._kind === 'booking').length;

  const hasItinMajor = itinMajorCount > 0;
  const hasItinStop  = itinStopCount > 0;
  const hasItems     = itemsCount > 0;
  const hasBookings  = bookingsCount > 0;

  // Legend dot shared style — plain color swatch, no number (pin numbers stay on the map itself)
  const legendDot = (bg, border) => ({
    width: '12px', height: '12px', borderRadius: '50%', background: bg,
    border: `1.5px solid ${border}`, flexShrink: 0,
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
            <span style={legendDot(GOLD, '#9A7430')} /> Major stop ({itinMajorCount})
          </span>
        )}
        {hasItinStop && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(TEAL, '#1B4540')} /> Route stop ({itinStopCount})
          </span>
        )}
        {!hasItinMajor && !hasItinStop && itineraryStops.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(TEAL, '#1B4540')} /> Itinerary stop
          </span>
        )}
        {hasItems && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(ITEM_C, '#2A5F7A')} /> Your places ({itemsCount})
          </span>
        )}
        {hasBookings && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: MUTED }}>
            <span style={legendDot(BOOK_C, '#8A4A18')} /> Bookings ({bookingsCount})
          </span>
        )}
      </div>

      {/* Location count summary — counts normalised physical locations, not raw records */}
      {(visibleLocations.length > 0 || missingItems.length > 0) && (
        <p style={{ fontSize: '11.5px', color: MUTED, marginTop: '5px' }}>
          {visibleLocations.length > 0 && `${visibleLocations.length} location${visibleLocations.length !== 1 ? 's' : ''} on map`}
          {visibleLocations.length > 0 && missingItems.length > 0 && ' · '}
          {missingItems.length > 0 && `${missingItems.length} needs location`}
        </p>
      )}

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

            {/* Linked bookings — shown when a stop/item has associated booking data */}
            {sel._linkedBookings?.length > 0 && (
              <div style={{ marginTop: '8px', borderTop: '1px solid #F0EBE3', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {sel._linkedBookings.map(b => {
                  const bMeta = b.metadata || {};
                  const bTime = b.type === 'hotel'
                    ? (bMeta.checkInDate ? `Check-in ${bMeta.checkInDate}${bMeta.checkInTime ? ` ${bMeta.checkInTime}` : ''}` : null)
                    : (b.time || null);
                  return (
                    <div key={b.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '12px', color: MUTED }}>
                      <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: BOOK_C, flexShrink: 0, marginTop: '4px' }} />
                      <span style={{ flex: 1 }}>
                        {bTime && <span style={{ marginRight: '4px' }}>{bTime} ·</span>}
                        <span style={{ fontWeight: '600', color: CHAR }}>{b.title}</span>
                        {b.provider && <span style={{ marginLeft: '4px' }}>({b.provider})</span>}
                        {b.confirmationReference && (
                          <span style={{ marginLeft: '5px', fontFamily: 'monospace', fontSize: '11px', color: TEAL }}>#{b.confirmationReference}</span>
                        )}
                        {b.url && (
                          <a href={b.url} target="_blank" rel="noopener noreferrer"
                            style={{ marginLeft: '6px', color: TEAL, fontSize: '11px' }}>↗</a>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {getToken && selKind !== 'itin' && (
              <button type="button"
                onClick={() => openLocationModal({ ...sel, _kind: selKind })}
                style={{ marginTop: '8px', fontSize: '11.5px', fontWeight: '600', color: TEAL, background: 'none', border: `1px solid ${TEAL}`, borderRadius: '6px', padding: '4px 10px', cursor: 'pointer' }}>
                Edit location
              </button>
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

      {/* Location picker modal */}
      {locationModal && (
        <LocationPickerModal
          entry={locationModal}
          trip={trip}
          onConfirm={(lat, lng) => handleLocationSave(locationModal.id, locationModal._kind, lat, lng)}
          onClose={() => setLocationModal(null)}
        />
      )}

      {/* Needs location section */}
      {missingItems.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.2px', textTransform: 'uppercase', color: MUTED, marginBottom: '10px' }}>
            Needs location
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {missingItems.map(entry => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 14px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '13.5px', fontWeight: '600', color: CHAR, marginBottom: '2px' }}>{entry.title}</p>
                  {entry.locationName && <p style={{ fontSize: '12px', color: MUTED }}>{entry.locationName}</p>}
                  {entry.dayNumber && <p style={{ fontSize: '11px', color: '#B5AA99' }}>Day {entry.dayNumber}</p>}
                </div>
                {getToken && (
                  <button type="button" onClick={() => openLocationModal(entry)}
                    style={{ fontSize: '11.5px', fontWeight: '600', color: TEAL, background: 'none', border: `1px solid ${TEAL}`, borderRadius: '6px', padding: '5px 10px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    Find location
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
