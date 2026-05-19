import { useState } from 'react';

const C = {
  teal:     '#1B6B65',
  gold:     '#C9A96E',
  bg:       '#F0EDE6',
  charcoal: '#1C1A16',
  border:   '#E8E3DA',
  grid:     '#E2DDD4',
};

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
  const [hovered, setHovered] = useState(null);

  const validStops = (stops || [])
    .filter(s => s.visible !== false && s.latitude != null && s.longitude != null)
    .sort((a, b) => a.order - b.order);

  if (validStops.length < 2) return null;

  const VW = 800, VH = 440;
  const INNER_PAD = 56;
  const pts = projectStops(validStops, VW, VH, INNER_PAD);
  const routePath = smoothPath(pts);

  return (
    <div style={{ borderRadius: '12px', overflow: 'hidden', border: `1px solid ${C.border}`, background: '#BDD5E0' }}>
      <svg
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block' }}
        aria-label={`Route map: ${validStops.map(s => s.name).join(' → ')}`}
      >
        {/* Ocean */}
        <rect width={VW} height={VH} fill="#BDD5E0" />
        {/* Land mass */}
        <rect
          x={VW * 0.055} y={VH * 0.06}
          width={VW * 0.89} height={VH * 0.88}
          rx={VH * 0.10} ry={VH * 0.10}
          fill="#D8CBAA" stroke="#B5A48A" strokeWidth="0.7"
        />
        {/* Terrain tint */}
        <rect
          x={VW * 0.28} y={VH * 0.50}
          width={VW * 0.62} height={VH * 0.44}
          rx={VH * 0.07} ry={VH * 0.07}
          fill="#C8A96A" fillOpacity="0.16"
        />

        {/* Route: Morocco-style solid dark line */}
        <path d={routePath} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" strokeLinecap="round" />
        <path d={routePath} fill="none" stroke="#1B3D39" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round" opacity="0.88" />

        {/* Stop labels — drawn before markers so markers sit on top */}
        {pts.map((pt, i) => {
          const isEnd  = i === 0 || i === pts.length - 1;
          const isHov  = hovered === i;
          // Alternate label above/below to reduce overlap for closely spaced stops
          const above  = i % 2 === 0;
          const labelY = above ? pt.y - 15 : pt.y + 23;
          const anchor = pt.x < VW * 0.12 ? 'start'
                       : pt.x > VW * 0.88 ? 'end'
                       : 'middle';
          return (
            <text
              key={`lbl-${i}`}
              x={pt.x}
              y={labelY}
              textAnchor={anchor}
              fontSize={isEnd ? 13.5 : 11}
              fontFamily="Georgia, serif"
              fontWeight={isEnd ? '700' : '400'}
              fill={isHov ? C.teal : C.charcoal}
              opacity={isHov ? 1 : 0.85}
              style={{ pointerEvents: 'none', userSelect: 'none', paintOrder: 'stroke', stroke: '#D8CBAA', strokeWidth: '3', strokeLinejoin: 'round' }}
            >
              {pt.name}
            </text>
          );
        })}

        {/* Stop markers */}
        {pts.map((pt, i) => {
          const n   = pts.length;
          const isMajor = pt.type === 'major' || (pt.type == null && (i === 0 || i === n - 1));
          const isHov   = hovered === i;
          const r       = isMajor ? 7 : 5;
          const canClick = !!onDaySelect && !!pt.dayNumber;
          return (
            <g
              key={`mk-${i}`}
              style={{ cursor: canClick ? 'pointer' : 'default' }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => canClick && onDaySelect(pt.dayNumber)}
            >
              <circle cx={pt.x} cy={pt.y} r={r + 3} fill="white" opacity="0.85" />
              <circle cx={pt.x} cy={pt.y} r={r}
                fill={isMajor ? '#F2E4CB' : '#C8D9D5'}
                stroke={isHov ? C.gold : (isMajor ? C.gold : C.teal)}
                strokeWidth={isMajor ? 1.8 : 1.4}
              />
              {isMajor && (
                <circle cx={pt.x} cy={pt.y} r={r + 5} fill="none" stroke={C.gold} strokeWidth="0.8" opacity="0.4" />
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
