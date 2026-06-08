import { useState } from 'react';

const C = {
  teal:     '#1B6B65',
  gold:     '#C9A96E',
  bg:       '#F0EDE6',
  charcoal: '#1C1A16',
  border:   '#E8E3DA',
  grid:     '#E2DDD4',
};

// Per-day accent colours cycling through a curated palette
const DAY_PALETTE = [
  '#1B6B65', // teal
  '#C9A96E', // gold
  '#7B5EA7', // violet
  '#3D8B7A', // sea-green
  '#B85C38', // terracotta
  '#4A7FB5', // slate-blue
  '#8B6914', // amber-dark
  '#2E7D4F', // forest
  '#9C3D54', // rose
  '#5C6B8A', // grey-blue
];

function dayColor(dayNumber) {
  if (!dayNumber) return C.teal;
  return DAY_PALETTE[(dayNumber - 1) % DAY_PALETTE.length];
}

// Project an array of { latitude, longitude } stops to SVG pixel coordinates.
// Returns the same objects extended with { x, y }.
function projectStops(validStops, svgW, svgH, innerPad) {
  const lats = validStops.map(s => s.latitude);
  const lngs = validStops.map(s => s.longitude);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const latSpan = latMax - latMin || 1;
  const lngSpan = lngMax - lngMin || 1;
  const PAD = 0.18;
  const bMinLat = latMin - latSpan * PAD;
  const bMaxLat = latMax + latSpan * PAD;
  const bMinLng = lngMin - lngSpan * PAD;
  const bMaxLng = lngMax + lngSpan * PAD;

  const drawW = svgW - innerPad * 2;
  const drawH = svgH - innerPad * 2;

  return validStops.map(s => ({
    ...s,
    x: innerPad + ((s.longitude - bMinLng) / (bMaxLng - bMinLng)) * drawW,
    y: innerPad + (1 - (s.latitude - bMinLat) / (bMaxLat - bMinLat)) * drawH,
  }));
}

// Catmull-Rom → cubic Bezier path
function smoothPath(pts) {
  if (pts.length < 2) return '';
  if (pts.length === 2) return `M${pts[0].x},${pts[0].y} L${pts[1].x},${pts[1].y}`;
  let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const t = 0.45;
    const cp1x = (p1.x + (p2.x - p0.x) * t / 3).toFixed(1);
    const cp1y = (p1.y + (p2.y - p0.y) * t / 3).toFixed(1);
    const cp2x = (p2.x - (p3.x - p1.x) * t / 3).toFixed(1);
    const cp2y = (p2.y - (p3.y - p1.y) * t / 3).toFixed(1);
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

export default function DynamicRouteMap({ stops = [], onDaySelect }) {
  const [hovered,      setHovered]      = useState(null);
  const [activeDay,    setActiveDay]    = useState(null);

  const allValid = (stops || [])
    .filter(s => s.visible !== false && s.latitude != null && s.longitude != null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const validStops = activeDay != null
    ? allValid.filter(s => s.day === activeDay || s.dayNumber === activeDay)
    : allValid;

  if (allValid.length < 2) return null;

  const VW = 800, VH = 440;
  const INNER_PAD = 56;
  const pts = projectStops(validStops.length >= 2 ? validStops : allValid, VW, VH, INNER_PAD);
  const routePath = smoothPath(pts);

  // Unique days for the filter pills
  const uniqueDays = [...new Set(allValid.map(s => s.day ?? s.dayNumber).filter(Boolean))].sort((a, b) => a - b);
  const hasMultipleDays = uniqueDays.length > 1;

  // First stop of each day (for day-label badges on map)
  const dayFirstIdx = {};
  pts.forEach((pt, i) => {
    const d = pt.day ?? pt.dayNumber;
    if (d != null && dayFirstIdx[d] == null) dayFirstIdx[d] = i;
  });

  return (
    <div>
      {/* Day filter pills */}
      {hasMultipleDays && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
          <button
            onClick={() => setActiveDay(null)}
            style={{
              padding: '4px 12px', borderRadius: '16px', border: '1px solid',
              fontSize: '11.5px', fontWeight: '600', cursor: 'pointer',
              borderColor: activeDay == null ? C.teal : C.border,
              background:  activeDay == null ? '#EFF6F5' : 'white',
              color:        activeDay == null ? C.teal : '#6B6156',
            }}
          >All days</button>
          {uniqueDays.map(d => (
            <button
              key={d}
              onClick={() => setActiveDay(activeDay === d ? null : d)}
              style={{
                padding: '4px 12px', borderRadius: '16px', border: '1px solid',
                fontSize: '11.5px', fontWeight: '600', cursor: 'pointer',
                borderColor: activeDay === d ? dayColor(d) : C.border,
                background:  activeDay === d ? `${dayColor(d)}18` : 'white',
                color:       activeDay === d ? dayColor(d) : '#6B6156',
              }}
            >Day {d}</button>
          ))}
        </div>
      )}

      <div style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}`, background: C.bg }}>
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          style={{ width: '100%', height: 'auto', display: 'block' }}
          aria-label={`Route map: ${allValid.map(s => s.name).join(' → ')}`}
        >
          {/* Background */}
          <rect width={VW} height={VH} fill={C.bg} />
          {/* Subtle reference grid */}
          {[0.25, 0.5, 0.75].map(t => (
            <g key={t}>
              <line x1={VW * t} y1={0} x2={VW * t} y2={VH} stroke={C.grid} strokeWidth="0.5" />
              <line x1={0} y1={VH * t} x2={VW} y2={VH * t} stroke={C.grid} strokeWidth="0.5" />
            </g>
          ))}

          {/* Route: gold glow + teal dashed */}
          <path d={routePath} fill="none" stroke={C.gold} strokeWidth="3.5" strokeOpacity="0.3" strokeLinecap="round" />
          <path d={routePath} fill="none" stroke={C.teal} strokeWidth="1.5" strokeDasharray="9,5" strokeOpacity="0.7" strokeLinecap="round" />

          {/* Stop labels */}
          {pts.map((pt, i) => {
            const isEnd  = i === 0 || i === pts.length - 1;
            const isHov  = hovered === i;
            const above  = i % 2 === 0;
            const labelY = above ? pt.y - 15 : pt.y + 23;
            const anchor = pt.x < VW * 0.12 ? 'start'
                         : pt.x > VW * 0.88 ? 'end'
                         : 'middle';
            const d = pt.day ?? pt.dayNumber;
            const col = isHov ? C.teal : (d ? dayColor(d) : C.charcoal);
            return (
              <text
                key={`lbl-${i}`}
                x={pt.x}
                y={labelY}
                textAnchor={anchor}
                fontSize={isEnd ? 13.5 : 11}
                fontFamily="Georgia, serif"
                fontWeight={isEnd ? '700' : '400'}
                fill={col}
                opacity={isHov ? 1 : 0.85}
                style={{ pointerEvents: 'none', userSelect: 'none' }}
              >
                {pt.name}
              </text>
            );
          })}

          {/* Stop markers */}
          {pts.map((pt, i) => {
            const n      = pts.length;
            const d      = pt.day ?? pt.dayNumber;
            const col    = dayColor(d);
            const isMajor = pt.type === 'major' || pt.isMajorStop || (pt.type == null && (i === 0 || i === n - 1));
            const isHov   = hovered === i;
            const r       = isMajor ? 7 : 5;
            const canClick = !!onDaySelect && !!d;
            return (
              <g
                key={`mk-${i}`}
                style={{ cursor: canClick ? 'pointer' : 'default' }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => canClick && onDaySelect(d)}
              >
                <circle cx={pt.x} cy={pt.y} r={r + 3} fill="white" opacity="0.85" />
                <circle cx={pt.x} cy={pt.y} r={r}
                  fill={isMajor ? `${col}28` : `${col}18`}
                  stroke={isHov ? C.gold : col}
                  strokeWidth={isMajor ? 1.8 : 1.4}
                />
                {isMajor && (
                  <circle cx={pt.x} cy={pt.y} r={r + 5} fill="none" stroke={col} strokeWidth="0.8" opacity="0.4" />
                )}
                {/* Day number badge on first stop of each day */}
                {d != null && dayFirstIdx[d] === i && hasMultipleDays && (
                  <g>
                    <circle cx={pt.x + r + 2} cy={pt.y - r - 2} r={7} fill={col} />
                    <text x={pt.x + r + 2} y={pt.y - r - 2} textAnchor="middle" dominantBaseline="central"
                      fontSize="8" fontWeight="700" fill="white" style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      {d}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
