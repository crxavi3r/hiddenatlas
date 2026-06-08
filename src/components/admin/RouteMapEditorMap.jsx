import { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TEAL  = '#1B6B65';
const GOLD  = '#C9A96E';
const CHAR  = '#1C1A16';
const MUTED = '#8C8070';

const DAY_PALETTE = ['#1B6B65','#7B5EA7','#C97C3A','#2E86AB','#8B6513','#4A7C59','#9B3535','#5B8DB8','#7A6E00','#2A4B6F'];
const dayColor = d => DAY_PALETTE[((d ?? 1) - 1) % DAY_PALETTE.length];

function pill(active, color) {
  return {
    fontSize: '11.5px', fontWeight: '600', padding: '4px 12px', borderRadius: '20px',
    border: `1.5px solid ${active ? color : '#E8E3DA'}`,
    background: active ? color : 'white', color: active ? 'white' : MUTED,
    cursor: 'pointer', transition: 'all 0.12s', lineHeight: '1.5',
  };
}

// Inject Leaflet tooltip override once
let cssInjected = false;
function injectCSS() {
  if (cssInjected || typeof document === 'undefined') return;
  cssInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    .ha-tip { font-family: Inter, system-ui, sans-serif; font-size: 11px; font-weight: 600;
              padding: 3px 8px; border-radius: 4px; border: 1px solid #E8E3DA;
              color: ${CHAR}; background: white; box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              white-space: nowrap; pointer-events: none; }
    .ha-tip::before { display: none; }
    .ha-tip.leaflet-tooltip-top { margin-top: -6px; }
    .ha-tip-major { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 3px;
                    background: rgba(255,255,255,0.92); border: 1px solid #E8E3DA;
                    color: ${CHAR}; font-family: Inter, system-ui, sans-serif;
                    white-space: nowrap; pointer-events: none; }
    .ha-tip-major::before { display: none; }
  `;
  document.head.appendChild(s);
}

export default function RouteMapEditorMap({ stops = [], selectedStopId, onSelectStop, activeDay, onDayChange }) {
  const mapDivRef   = useRef(null);
  const mapRef      = useRef(null);
  const markersRef  = useRef({});
  const polyRef     = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  const visible    = stops.filter(s => s.visible !== false && s.latitude != null && s.longitude != null);
  const uniqueDays = [...new Set(visible.filter(s => s.dayNumber).map(s => s.dayNumber))].sort((a, b) => a - b);
  const filtered   = activeDay != null ? visible.filter(s => s.dayNumber === activeDay) : visible;

  // Stable dep key — changes only when stop data actually changes
  const stopsKey = filtered.map(s => `${s.id}:${s.latitude}:${s.longitude}:${s.type}:${s.order}`).join('|');

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;
    injectCSS();
    const map = L.map(mapDivRef.current, { zoomControl: true, scrollWheelZoom: true });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com">CARTO</a>',
      subdomains: 'abcd', maxZoom: 20,
    }).addTo(map);
    map.on('click', () => onSelectStop?.(null));
    mapRef.current = map;
    setMapReady(true); // eslint-disable-line react-compiler/react-compiler
    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild markers + polyline when stop data or activeDay changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;

    Object.values(markersRef.current).forEach(m => m.remove());
    markersRef.current = {};
    if (polyRef.current) { polyRef.current.remove(); polyRef.current = null; }

    if (filtered.length === 0) return;

    // Polyline
    const sorted = [...filtered].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const routeColor = activeDay != null ? dayColor(activeDay) : TEAL;
    polyRef.current = L.polyline(sorted.map(s => [s.latitude, s.longitude]), {
      color: routeColor, weight: 2.5, opacity: 0.65, dashArray: '8,5',
    }).addTo(map);

    // Markers
    filtered.forEach(stop => {
      const isMajor  = stop.type === 'major';
      const isSelected = stop.id === selectedStopId;
      const mColor   = stop.dayNumber != null ? dayColor(stop.dayNumber) : routeColor;

      const marker = L.circleMarker([stop.latitude, stop.longitude], {
        radius:      isMajor ? 9 : 6,
        fillColor:   isMajor ? GOLD : mColor,
        color:       isSelected ? CHAR : (isMajor ? '#A07840' : '#1B4540'),
        weight:      isSelected ? 3 : (isMajor ? 2 : 1.5),
        fillOpacity: isSelected ? 1 : 0.88,
        opacity:     1,
      }).addTo(map);

      marker.bindTooltip(stop.name || '—', {
        permanent: isMajor,
        direction: 'top',
        offset: [0, isMajor ? -10 : -8],
        className: isMajor ? 'ha-tip-major' : 'ha-tip',
        opacity: 0.97,
      });

      marker.on('click', e => {
        L.DomEvent.stopPropagation(e);
        onSelectStop?.(stop.id === selectedStopId ? null : stop.id);
      });

      markersRef.current[stop.id] = marker;
    });

    // Fit bounds to filtered stops
    const bounds = L.latLngBounds(filtered.map(s => [s.latitude, s.longitude]));
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: true });
  }, [mapReady, stopsKey, activeDay]); // eslint-disable-line react-hooks/exhaustive-deps

  // Update marker style + fly when selection changes (no full rebuild)
  useEffect(() => {
    if (!mapReady) return;
    const routeColor = activeDay != null ? dayColor(activeDay) : TEAL;

    filtered.forEach(stop => {
      const marker = markersRef.current[stop.id];
      if (!marker) return;
      const isMajor    = stop.type === 'major';
      const isSelected = stop.id === selectedStopId;
      const mColor     = stop.dayNumber != null ? dayColor(stop.dayNumber) : routeColor;

      marker.setRadius(isSelected ? (isMajor ? 12 : 9) : (isMajor ? 9 : 6));
      marker.setStyle({
        fillColor:   isMajor ? GOLD : mColor,
        color:       isSelected ? CHAR : (isMajor ? '#A07840' : '#1B4540'),
        weight:      isSelected ? 3 : (isMajor ? 2 : 1.5),
        fillOpacity: isSelected ? 1 : 0.88,
      });

      if (isSelected && mapRef.current) {
        mapRef.current.flyTo([stop.latitude, stop.longitude], Math.max(mapRef.current.getZoom(), 12), { animate: true, duration: 0.4 });
        marker.openTooltip();
      }
    });
  }, [selectedStopId, mapReady]); // eslint-disable-line react-hooks/exhaustive-deps

  function fitAll() {
    if (!mapRef.current || filtered.length === 0) return;
    const bounds = L.latLngBounds(filtered.map(s => [s.latitude, s.longitude]));
    if (bounds.isValid()) mapRef.current.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: true });
  }

  return (
    <div>
      {/* Day filter pills */}
      {uniqueDays.length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
          <button type="button" onClick={() => onDayChange(null)} style={pill(activeDay == null, TEAL)}>
            All days
          </button>
          {uniqueDays.map(d => (
            <button key={d} type="button" onClick={() => onDayChange(activeDay === d ? null : d)}
              style={pill(activeDay === d, dayColor(d))}>
              Day {d}
            </button>
          ))}
          <button type="button" onClick={fitAll}
            style={{ marginLeft: 'auto', fontSize: '11px', padding: '4px 10px', borderRadius: '6px', border: '1px solid #E8E3DA', background: 'white', color: MUTED, cursor: 'pointer' }}>
            Fit all
          </button>
        </div>
      )}
      {/* Map container */}
      <div ref={mapDivRef} style={{ height: '420px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E8E3DA' }} />
      {/* Attribution note */}
      {filtered.length === 0 && (
        <p style={{ fontSize: '11.5px', color: MUTED, marginTop: '8px', textAlign: 'center' }}>
          No stops to display{activeDay != null ? ` for Day ${activeDay}` : ''}.
        </p>
      )}
    </div>
  );
}
