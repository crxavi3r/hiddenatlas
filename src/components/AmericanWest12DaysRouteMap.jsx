import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// ── Viewport & projection ────────────────────────────────────────────────────
const VW = 900, VH = 590;
const X0 = -126.0, X1 = -107.5, Y0 = 31.0, Y1 = 42.2;

function proj(lon, lat) {
  const x = ((lon - X0) / (X1 - X0)) * VW;
  const y = ((Y1 - lat) / (Y1 - Y0)) * VH;
  return [x, y];
}

// ── Cities ───────────────────────────────────────────────────────────────────
const CITIES = [
  { id: 'san-francisco', name: 'San Francisco', days: '1–2', dayStart: 1, lon: -122.42, lat: 37.77, tier: 1, labelDx: -16, labelAnchor: 'end',   desc: 'The bay, City Hall, Coit Tower and Chinatown on foot.' },
  { id: 'yosemite',      name: 'Yosemite',      days: '3–4', dayStart: 3, lon: -119.54, lat: 37.74, tier: 2, labelDx: 13,  labelAnchor: 'start', desc: 'Glacier Point, El Capitan and Vernal Fall.' },
  { id: 'las-vegas',     name: 'Las Vegas',     days: '5–7', dayStart: 5, lon: -115.14, lat: 36.17, tier: 1, labelDx: 13,  labelAnchor: 'start', desc: 'The Strip at night, the High Roller and Fremont Street.' },
  { id: 'grand-canyon',  name: 'Grand Canyon',  days: '8–9', dayStart: 8, lon: -112.14, lat: 36.06, tier: 1, labelDx: -14, labelAnchor: 'end',   desc: 'Hoover Dam en route, South Rim and helicopter.' },
  { id: 'los-angeles',   name: 'Los Angeles',   days: '10–11', dayStart: 10, lon: -118.24, lat: 34.05, tier: 1, labelDx: -14, labelAnchor: 'end', desc: 'Venice Beach, Santa Monica and Malibu coast.' },
  { id: 'san-diego',     name: 'San Diego',     days: '12',  dayStart: 12, lon: -117.16, lat: 32.72, tier: 1, labelDx: 14,  labelAnchor: 'start', desc: 'La Jolla cove and the final Pacific coastline.' },
];

// Route waypoints including unlabelled intermediates for smooth path
const ROUTE_LONLAT = [
  [-122.42, 37.77], // SF
  [-119.54, 37.74], // Yosemite
  [-119.02, 35.37], // Bakersfield (unlabelled)
  [-115.14, 36.17], // Las Vegas
  [-113.90, 35.20], // Kingman area (unlabelled)
  [-112.14, 36.06], // Grand Canyon
  [-114.60, 34.85], // Needles area (unlabelled)
  [-118.24, 34.05], // LA
  [-117.16, 32.72], // San Diego
];

// Fraction of route total length at which each CITY stop is reached
const STOP_FRACTIONS = [0, 0.13, 0.43, 0.58, 0.90, 1.0];

const PREVIEW_LABELED = new Set(['san-francisco', 'grand-canyon', 'los-angeles', 'san-diego']);

const TIER = {
  1: { fill: '#F2E4CB', stroke: '#C9A96E', r: 7 },
  2: { fill: '#C8D9D5', stroke: '#2A5248', r: 5 },
};

// ── Catmull-Rom spline ───────────────────────────────────────────────────────
function catmullPoint(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * ((2*p1[0]) + (-p0[0]+p2[0])*t + (2*p0[0]-5*p1[0]+4*p2[0]-p3[0])*t2 + (-p0[0]+3*p1[0]-3*p2[0]+p3[0])*t3),
    0.5 * ((2*p1[1]) + (-p0[1]+p2[1])*t + (2*p0[1]-5*p1[1]+4*p2[1]-p3[1])*t2 + (-p0[1]+3*p1[1]-3*p2[1]+p3[1])*t3),
  ];
}

function buildSpline(pts) {
  const extended = [pts[0], ...pts, pts[pts.length - 1]];
  const segments = [];
  for (let i = 1; i < extended.length - 2; i++) {
    const seg = [];
    for (let t = 0; t <= 1; t += 0.05) {
      seg.push(catmullPoint(extended[i-1], extended[i], extended[i+1], extended[i+2], t));
    }
    segments.push(seg);
  }
  return segments.flat();
}

function toSvgPath(pts) {
  if (!pts.length) return '';
  return 'M ' + pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' L ');
}

// ── Total path length utility ────────────────────────────────────────────────
function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1];
    len += Math.sqrt(dx*dx + dy*dy);
  }
  return len;
}

// ── Build route data ─────────────────────────────────────────────────────────
const routePts = buildSpline(ROUTE_LONLAT.map(([lon, lat]) => proj(lon, lat)));
const TOTAL_LEN = pathLength(routePts);

function lengthAtFraction(f) { return f * TOTAL_LEN; }

// ── State outlines (simplified) ──────────────────────────────────────────────
// California coast + east border (simplified polygons)
const CA_COAST = [
  [-124.2,41.9],[-124.0,40.4],[-123.8,39.0],[-122.8,37.9],[-122.5,37.6],
  [-122.4,36.9],[-121.9,36.3],[-121.0,35.6],[-120.6,35.1],[-120.1,34.5],
  [-119.7,34.4],[-119.1,34.1],[-118.5,34.0],[-117.7,33.5],[-117.3,33.1],
  [-117.1,32.6],[-116.1,32.5],[-114.7,32.7],
];
const CA_EAST = [
  [-114.7,32.7],[-114.6,34.8],[-114.5,35.1],[-114.6,35.8],[-115.0,35.9],
  [-114.1,37.5],[-114.0,38.5],[-114.0,41.9],[-124.2,41.9],
];
const CA_POLY = [...CA_COAST, ...CA_EAST];

const NV_POLY = [
  [-114.0,38.5],[-114.0,37.5],[-115.0,35.9],[-114.6,35.8],[-114.5,35.1],
  [-114.6,34.8],[-114.7,32.7],[-114.6,32.7],[-120.0,39.0],[-120.0,42.0],[-114.0,42.0],[-114.0,38.5],
];
const AZ_POLY = [
  [-114.7,32.7],[-114.8,32.5],[-109.0,31.3],[-109.0,37.0],[-114.5,37.0],
  [-114.5,35.1],[-114.6,34.8],[-114.7,32.7],
];
const UT_STRIP = [
  [-114.0,41.9],[-114.0,42.0],[-109.0,42.0],[-109.0,37.0],[-114.5,37.0],
  [-114.5,35.1],[-114.6,34.8],[-114.6,32.7],
];
const OR_STRIP = [
  [-124.2,41.9],[-124.2,46.2],[-116.5,46.2],[-116.5,42.0],[-114.0,42.0],[-114.0,41.9],[-124.2,41.9],
];

function stateToSvg(lonlat) {
  return lonlat.map(([lon, lat]) => proj(lon, lat).map(v => v.toFixed(1)).join(',')).join(' ');
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AmericanWest12DaysRouteMap({ isUnlocked, onDaySelect }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [animating, setAnimating] = useState(false);
  const pathRef = useRef(null);
  const [dashTotal, setDashTotal] = useState(2000);

  useEffect(() => {
    if (pathRef.current) setDashTotal(pathRef.current.getTotalLength());
  }, []);

  const activeStop = CITIES[activeIdx];
  const revealLen = lengthAtFraction(STOP_FRACTIONS[activeIdx]);
  const dashOffset = dashTotal - revealLen;

  function goTo(idx) {
    if (idx === activeIdx) return;
    setAnimating(true);
    setActiveIdx(idx);
    setTimeout(() => setAnimating(false), 600);
  }

  const svgPath = toSvgPath(routePts);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", userSelect: 'none' }}>
      <style>{`
        @keyframes aw12-slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .aw12-card-anim { animation: aw12-slideUp 0.35s ease forwards; }
      `}</style>

      {/* Map SVG */}
      <div style={{ position: 'relative', background: '#F4F1EC', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E8E3DA' }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>

          {/* State fills */}
          <polygon points={stateToSvg(OR_STRIP)}  fill="#EBE5D8" stroke="#D8D0C0" strokeWidth="0.8" />
          <polygon points={stateToSvg(UT_STRIP)}  fill="#EBE5D8" stroke="#D8D0C0" strokeWidth="0.8" />
          <polygon points={stateToSvg(NV_POLY)}   fill="#EAE4D6" stroke="#D8D0C0" strokeWidth="0.8" />
          <polygon points={stateToSvg(AZ_POLY)}   fill="#E9E2D3" stroke="#D8D0C0" strokeWidth="0.8" />
          <polygon points={stateToSvg(CA_POLY)}   fill="#E5DECE" stroke="#CFC8B8" strokeWidth="1.0" />

          {/* State labels */}
          {[
            { label: 'CALIFORNIA',  lon: -121.5, lat: 38.5 },
            { label: 'NEVADA',      lon: -116.5, lat: 39.2 },
            { label: 'ARIZONA',     lon: -111.5, lat: 34.5 },
          ].map(({ label, lon, lat }) => {
            const [x, y] = proj(lon, lat);
            return (
              <text key={label} x={x} y={y} textAnchor="middle"
                fill="#B5AA95" fontSize="9" fontWeight="600" letterSpacing="2" fontFamily="Inter, sans-serif">
                {label}
              </text>
            );
          })}

          {/* Pacific Ocean label */}
          {(() => { const [x, y] = proj(-124.0, 35.5); return (
            <text x={x} y={y} textAnchor="middle" fill="#9EB8C0" fontSize="9.5" fontWeight="500"
              fontFamily="Georgia, serif" fontStyle="italic">Pacific Ocean</text>
          ); })()}

          {/* Route path — ghost */}
          <path d={svgPath} fill="none" stroke="#1B6B65" strokeWidth="2.5" strokeOpacity="0.12" strokeLinecap="round" />

          {/* Route path — animated reveal */}
          <path
            ref={pathRef}
            d={svgPath}
            fill="none"
            stroke="#1B6B65"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={`${dashTotal}`}
            strokeDashoffset={`${dashOffset}`}
            style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.4,0,0.2,1)' }}
          />

          {/* City markers */}
          {CITIES.map((city, i) => {
            const [x, y] = proj(city.lon, city.lat);
            const t = TIER[city.tier];
            const isActive = i === activeIdx;
            const isPast = i <= activeIdx;
            const isLocked = !isUnlocked && !PREVIEW_LABELED.has(city.id);

            return (
              <g key={city.id} style={{ cursor: 'pointer' }} onClick={() => goTo(i)}>
                {/* Pulse ring on active */}
                {isActive && (
                  <circle cx={x} cy={y} r={t.r + 8} fill="none" stroke={t.stroke} strokeWidth="1.2" strokeOpacity="0.35" />
                )}
                {/* Dot */}
                <circle cx={x} cy={y} r={t.r}
                  fill={isPast ? t.fill : '#F4F1EC'}
                  stroke={isPast ? t.stroke : '#C4B99E'}
                  strokeWidth={isActive ? 2.2 : 1.4}
                  style={{ transition: 'all 0.4s' }}
                />
                {/* Label */}
                <text
                  x={x + city.labelDx} y={y - 10}
                  textAnchor={city.labelAnchor}
                  fill={isPast ? '#1C1A16' : '#A09483'}
                  fontSize={isActive ? '11' : '10'}
                  fontWeight={isActive ? '700' : '500'}
                  fontFamily="Inter, sans-serif"
                  style={{ transition: 'all 0.3s' }}
                >
                  {city.name}
                </text>
                {/* Days label — only show for reached stops */}
                {isPast && (
                  <text
                    x={x + city.labelDx} y={y + 1}
                    textAnchor={city.labelAnchor}
                    fill={t.stroke} fontSize="8.5" fontWeight="600"
                    fontFamily="Inter, sans-serif" opacity={isLocked ? 0.55 : 1}
                  >
                    {isLocked ? '·  ·  ·' : `Days ${city.days}`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Desktop tooltip card */}
        <div key={activeStop.id} className="aw12-card-anim" style={{
          display: 'none',
          position: 'absolute', bottom: '16px', right: '16px',
          background: 'white', borderRadius: '8px', padding: '14px 16px',
          boxShadow: '0 4px 20px rgba(28,26,22,0.12)', border: '1px solid #E8E3DA',
          maxWidth: '220px', minWidth: '180px',
          ['@media (min-width: 600px)']: { display: 'block' },
        }}>
          <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '4px' }}>
            {isUnlocked || PREVIEW_LABELED.has(activeStop.id) ? `Days ${activeStop.days}` : 'Locked'}
          </p>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>{activeStop.name}</p>
          {(isUnlocked || PREVIEW_LABELED.has(activeStop.id)) && (
            <p style={{ fontSize: '11.5px', color: '#6B6156', lineHeight: '1.5' }}>{activeStop.desc}</p>
          )}
        </div>
      </div>

      {/* Journey Progress Slider */}
      <div style={{ marginTop: '20px', padding: '0 4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: '#9C9488' }}>
            Journey Progress
          </span>
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#1B6B65' }}>
            {`Day ${activeStop.dayStart} · ${activeStop.name}`}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={CITIES.length - 1}
          value={activeIdx}
          onChange={e => goTo(Number(e.target.value))}
          style={{ width: '100%', accentColor: '#1B6B65', cursor: 'pointer', height: '4px' }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
          {CITIES.map((city, i) => (
            <button
              key={city.id}
              onClick={() => goTo(i)}
              style={{
                background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                fontSize: '10px', fontWeight: i === activeIdx ? '700' : '400',
                color: i <= activeIdx ? '#1B6B65' : '#B5AA99',
                transition: 'color 0.25s',
              }}
            >
              {city.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile bottom card */}
      <div key={`mob-${activeStop.id}`} className="aw12-card-anim" style={{
        marginTop: '16px', background: 'white', borderRadius: '8px',
        padding: '16px 20px', border: '1px solid #E8E3DA',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '3px' }}>
            {isUnlocked || PREVIEW_LABELED.has(activeStop.id) ? `Days ${activeStop.days}` : 'Premium'}
          </p>
          <p style={{ fontSize: '15px', fontWeight: '600', color: '#1C1A16' }}>{activeStop.name}</p>
          {(isUnlocked || PREVIEW_LABELED.has(activeStop.id)) && (
            <p style={{ fontSize: '12px', color: '#6B6156', marginTop: '3px', lineHeight: '1.5' }}>{activeStop.desc}</p>
          )}
        </div>
        {isUnlocked && (
          <button
            onClick={() => onDaySelect && onDaySelect(activeStop.dayStart)}
            style={{
              background: '#1B6B65', color: 'white', border: 'none',
              borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Jump to Day {activeStop.dayStart}
          </button>
        )}
      </div>
    </div>
  );
}
