/**
 * PublicRouteMap — Leaflet-based interactive map for public itinerary pages and My Trips.
 *
 * Props:
 *   stops       — { id?, name, latitude, longitude, dayNumber?, type?, isMajorStop?, visible?, order?, description? }
 *   isUnlocked  — show day labels / description / jump button (default true)
 *   onDaySelect — (dayNumber) => void — called when user clicks "Jump to Day N"
 *   height      — map height in px (default 420)
 */
import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TEAL  = '#1B6B65';
const GOLD  = '#C9A96E';
const CHAR  = '#1C1A16';
const MUTED = '#8C8070';
const SERIF = "'Playfair Display', Georgia, serif";

const DAY_PALETTE = ['#1B6B65','#7B5EA7','#C97C3A','#2E86AB','#8B6513','#4A7C59','#9B3535','#5B8DB8','#7A6E00','#2A4B6F'];
const dayColor = d => DAY_PALETTE[((d ?? 1) - 1) % DAY_PALETTE.length];

function pillStyle(active, color) {
  return {
    fontSize: '12px', fontWeight: '600', padding: '5px 14px', borderRadius: '20px',
    border: `1.5px solid ${active ? color : '#E8E3DA'}`,
    background: active ? color : 'white', color: active ? 'white' : MUTED,
    cursor: 'pointer', transition: 'all 0.15s', lineHeight: '1.5',
  };
}

let cssInjected = false;
function injectCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .ha-pub-tip { font-family: Inter, system-ui, sans-serif; font-size: 11px; font-weight: 600;
                  padding: 3px 8px; border-radius: 4px; border: 1px solid #E8E3DA;
                  color: ${CHAR}; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.08);
                  white-space: nowrap; }
    .ha-pub-tip::before { display: none; }
    .ha-pub-tip.leaflet-tooltip-top { margin-top: -6px; }
    .ha-pub-major { font-family: Georgia, serif; font-size: 10.5px; font-weight: 700;
                    padding: 3px 8px; border-radius: 3px;
                    background: rgba(255,255,255,0.93); border: 1px solid rgba(201,169,110,0.35);
                    color: ${CHAR}; white-space: nowrap;
                    box-shadow: 0 2px 7px rgba(28,26,22,0.08); }
    .ha-pub-major::before { display: none; }
    .leaflet-control-zoom { border: 1px solid #E8E3DA !important; border-radius: 6px !important; overflow: hidden; }
    .leaflet-control-zoom a { color: ${MUTED} !important; border-bottom-color: #E8E3DA !important; font-size: 14px !important; }
    .leaflet-control-zoom a:hover { color: ${CHAR} !important; background: #F8F5F0 !important; }
    .leaflet-control-attribution { font-size: 9px !important; background: rgba(255,255,255,0.75) !important; padding: 2px 6px !important; }
  `;
  document.head.appendChild(s);
}

export default function PublicRouteMap({ stops = [], isUnlocked = true, onDaySelect, height = 420 }) {
  // All hooks must come before any conditional return
  const mapDivRef   = useRef(null);
  const mapRef      = useRef(null);
  const markersRef  = useRef({});
  const polyRef     = useRef(null);
  const [mapReady,     setMapReady]     = useState(false);
  const [selectedStop, setSelectedStop] = useState(null);
  const [activeDay,    setActiveDay]    = useState(null);

  const valid      = (stops || []).filter(s => s.visible !== false && s.latitude != null && s.longitude != null);
  const uniqueDays = [...new Set(valid.filter(s => s.dayNumber).map(s => s.dayNumber))].sort((a, b) => a - b);
  const filtered   = activeDay != null ? valid.filter(s => s.dayNumber === activeDay) : valid;
  const stopsKey   = filtered.map(s => `${s.id || s.name}:${s.latitude}:${s.longitude}:${s.type}`).join('|');

  // Init Leaflet map once
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
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild markers + polyline when stops or day filter changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    if (polyRef.current) { polyRef.current.remove(); polyRef.current = null; }
    if (filtered.length === 0) return;

    const sorted = [...filtered].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const routeColor = activeDay != null ? dayColor(activeDay) : TEAL;
    polyRef.current = L.polyline(sorted.map(s => [s.latitude, s.longitude]), {
      color: routeColor, weight: 2, opacity: 0.55, dashArray: '8,5',
    }).addTo(map);

    filtered.forEach(stop => {
      const isMajor    = stop.type === 'major' || stop.isMajorStop === true;
      const isSelected = selectedStop && (selectedStop.id === stop.id || selectedStop.name === stop.name);
      const mColor     = stop.dayNumber != null ? dayColor(stop.dayNumber) : routeColor;

      const marker = L.circleMarker([stop.latitude, stop.longitude], {
        radius:      isMajor ? 9 : 5.5,
        fillColor:   isMajor ? GOLD : mColor,
        color:       isSelected ? CHAR : (isMajor ? '#9A7430' : '#1B4540'),
        weight:      isSelected ? 2.5 : (isMajor ? 1.8 : 1.5),
        fillOpacity: isSelected ? 1 : 0.90,
        opacity:     1,
      }).addTo(map);

      marker.bindTooltip(stop.name || '—', {
        permanent:  isMajor,
        direction:  'top',
        offset:     [0, isMajor ? -11 : -8],
        className:  isMajor ? 'ha-pub-major' : 'ha-pub-tip',
        opacity:    0.97,
      });

      marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        setSelectedStop(prev => {
          const same = prev && (prev.id === stop.id || prev.name === stop.name);
          return same ? null : stop;
        });
      });

      markersRef.current[stop.id || stop.name] = marker;
    });

    const bounds = L.latLngBounds(filtered.map(s => [s.latitude, s.longitude]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13, animate: true });
  }, [mapReady, stopsKey, activeDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker styling when selection changes (no full rebuild)
  useEffect(() => {
    if (!mapReady) return;
    const routeColor = activeDay != null ? dayColor(activeDay) : TEAL;
    filtered.forEach(stop => {
      const key    = stop.id || stop.name;
      const marker = markersRef.current[key];
      if (!marker) return;
      const isMajor    = stop.type === 'major' || stop.isMajorStop === true;
      const isSelected = selectedStop && (selectedStop.id === stop.id || selectedStop.name === stop.name);
      const mColor     = stop.dayNumber != null ? dayColor(stop.dayNumber) : routeColor;

      marker.setRadius(isSelected ? (isMajor ? 12 : 8) : (isMajor ? 9 : 5.5));
      marker.setStyle({
        fillColor:   isMajor ? GOLD : mColor,
        color:       isSelected ? CHAR : (isMajor ? '#9A7430' : '#1B4540'),
        weight:      isSelected ? 2.5 : (isMajor ? 1.8 : 1.5),
        fillOpacity: isSelected ? 1 : 0.90,
      });
      if (isSelected && mapRef.current) {
        mapRef.current.flyTo([stop.latitude, stop.longitude], Math.max(mapRef.current.getZoom(), 11), { animate: true, duration: 0.4 });
        marker.openTooltip();
      }
    });
  }, [selectedStop, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  // Early return for insufficient data (after all hooks)
  if (valid.length < 2) return null;

  function handleDayChange(d) {
    setActiveDay(d);
    setSelectedStop(null);
  }

  const selIsMajor = selectedStop && (selectedStop.type === 'major' || selectedStop.isMajorStop === true);
  const selColor   = selectedStop?.dayNumber != null ? dayColor(selectedStop.dayNumber) : TEAL;
  const dotColor   = selIsMajor ? GOLD : selColor;

  return (
    <div style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* Day filter pills */}
      {uniqueDays.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <button type="button" onClick={() => handleDayChange(null)} style={pillStyle(activeDay == null, TEAL)}>
            All days
          </button>
          {uniqueDays.map(d => (
            <button key={d} type="button" onClick={() => handleDayChange(activeDay === d ? null : d)}
              style={pillStyle(activeDay === d, dayColor(d))}>
              Day {d}
            </button>
          ))}
        </div>
      )}

      {/* Leaflet map */}
      <div ref={mapDivRef} style={{
        height: `${height}px`, borderRadius: '10px', overflow: 'hidden',
        border: '1px solid #E8E3DA', boxShadow: '0 2px 16px rgba(28,26,22,0.07)',
      }} />

      {/* Stop details card */}
      {selectedStop && (
        <div style={{
          marginTop: '14px', background: 'white', borderRadius: '10px',
          border: '1px solid #E8E3DA', padding: '16px 20px',
          boxShadow: '0 2px 12px rgba(28,26,22,0.06)',
          display: 'flex', gap: '14px', alignItems: 'flex-start',
        }}>
          <div style={{
            width: '9px', height: '9px', borderRadius: '50%',
            background: dotColor, flexShrink: 0, marginTop: '6px',
          }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '6px' }}>
              <h4 style={{ fontFamily: SERIF, fontSize: '17px', fontWeight: '600', color: CHAR, margin: 0, lineHeight: '1.3' }}>
                {selectedStop.name}
              </h4>
              {isUnlocked && selectedStop.dayNumber && (
                <span style={{
                  fontSize: '10.5px', fontWeight: '600', letterSpacing: '0.7px',
                  color: TEAL, background: '#EFF6F5', padding: '3px 9px',
                  borderRadius: '12px', flexShrink: 0, textTransform: 'uppercase', whiteSpace: 'nowrap',
                }}>
                  Day {selectedStop.dayNumber}
                </span>
              )}
            </div>
            {isUnlocked && selectedStop.description && (
              <p style={{ fontSize: '13.5px', color: MUTED, lineHeight: '1.65', margin: '0 0 10px' }}>
                {selectedStop.description}
              </p>
            )}
            {!isUnlocked && (
              <p style={{ fontSize: '12.5px', color: MUTED, margin: '4px 0 0', fontStyle: 'italic' }}>
                Purchase this itinerary to unlock full route details.
              </p>
            )}
            {isUnlocked && onDaySelect && selectedStop.dayNumber && (
              <button type="button"
                onClick={() => { onDaySelect(selectedStop.dayNumber); setSelectedStop(null); }}
                style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: TEAL }}>
                Jump to Day {selectedStop.dayNumber} →
              </button>
            )}
          </div>
          <button type="button" onClick={() => setSelectedStop(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: 0, fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '-2px' }}>
            ×
          </button>
        </div>
      )}
    </div>
  );
}
