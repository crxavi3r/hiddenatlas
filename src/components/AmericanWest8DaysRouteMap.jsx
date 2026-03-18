import { useState, useEffect, useRef } from 'react';

// ── Viewport & projection — California only ──────────────────────────────────
const VW = 900, VH = 620;
const X0 = -125.5, X1 = -115.5, Y0 = 32.3, Y1 = 39.2;

function proj(lon, lat) {
  const x = ((lon - X0) / (X1 - X0)) * VW;
  const y = ((Y1 - lat) / (Y1 - Y0)) * VH;
  return [x, y];
}

// ── Cities ───────────────────────────────────────────────────────────────────
const CITIES = [
  { id: 'san-francisco', name: 'San Francisco', days: '1–2', dayStart: 1, lon: -122.42, lat: 37.77, tier: 1, labelDx: -16, labelAnchor: 'end',   desc: 'The bay, Coit Tower, Chinatown and City Hall on foot.' },
  { id: 'big-sur',       name: 'Big Sur',       days: '3',   dayStart: 3, lon: -121.79, lat: 36.27, tier: 2, labelDx: 13,  labelAnchor: 'start', desc: 'Bixby Bridge and the 90-mile coastal cliff highway.' },
  { id: 'santa-barbara', name: 'Santa Barbara', days: '4–5', dayStart: 4, lon: -119.70, lat: 34.42, tier: 1, labelDx: 13,  labelAnchor: 'start', desc: 'The American Riviera: the Mission and the Funk Zone.' },
  { id: 'los-angeles',   name: 'Los Angeles',   days: '6–7', dayStart: 6, lon: -118.24, lat: 34.05, tier: 1, labelDx: -14, labelAnchor: 'end',   desc: 'Venice Beach, Santa Monica and the Pacific Coast Highway.' },
  { id: 'san-diego',     name: 'San Diego',     days: '8',   dayStart: 8, lon: -117.16, lat: 32.72, tier: 1, labelDx: 14,  labelAnchor: 'start', desc: 'La Jolla cove, sea lions and the final Pacific coast.' },
];

// Route waypoints — coastal alignment
const ROUTE_LONLAT = [
  [-122.42, 37.77], // SF
  [-122.15, 37.10], // South peninsula (unlabelled)
  [-121.90, 36.60], // Santa Cruz area (unlabelled)
  [-121.79, 36.27], // Big Sur
  [-120.67, 35.28], // SLO area (unlabelled)
  [-119.70, 34.42], // Santa Barbara
  [-119.18, 34.20], // Ventura (unlabelled)
  [-118.24, 34.05], // LA
  [-117.16, 32.72], // San Diego
];

const STOP_FRACTIONS = [0, 0.24, 0.55, 0.74, 1.0];

const PREVIEW_LABELED = new Set(['san-francisco', 'santa-barbara', 'los-angeles', 'san-diego']);

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

function pathLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i-1][0], dy = pts[i][1] - pts[i-1][1];
    len += Math.sqrt(dx*dx + dy*dy);
  }
  return len;
}

const routePts = buildSpline(ROUTE_LONLAT.map(([lon, lat]) => proj(lon, lat)));
const TOTAL_LEN = pathLength(routePts);
function lengthAtFraction(f) { return f * TOTAL_LEN; }

// ── California outline ───────────────────────────────────────────────────────
const CA_COAST = [
  [-124.2,39.1],[-123.8,39.0],[-122.8,37.9],[-122.5,37.6],
  [-122.4,36.9],[-121.9,36.3],[-121.0,35.6],[-120.6,35.1],[-120.1,34.5],
  [-119.7,34.4],[-119.1,34.1],[-118.5,34.0],[-117.7,33.5],[-117.3,33.1],
  [-117.1,32.6],[-116.1,32.5],
];
const CA_EAST = [
  [-116.1,32.5],[-115.5,32.7],[-115.5,39.1],[-124.2,39.1],
];
const CA_POLY = [...CA_COAST, ...CA_EAST];

function stateToSvg(lonlat) {
  return lonlat.map(([lon, lat]) => proj(lon, lat).map(v => v.toFixed(1)).join(',')).join(' ');
}

// ── Component ────────────────────────────────────────────────────────────────
export default function AmericanWest8DaysRouteMap({ isUnlocked, onDaySelect }) {
  const [activeIdx, setActiveIdx] = useState(0);
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
    setActiveIdx(idx);
  }

  const svgPath = toSvgPath(routePts);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", userSelect: 'none' }}>
      <style>{`
        @keyframes aw8-slideUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .aw8-card-anim { animation: aw8-slideUp 0.35s ease forwards; }
      `}</style>

      {/* Map SVG */}
      <div style={{ position: 'relative', background: '#F4F1EC', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E8E3DA' }}>
        <svg viewBox={`0 0 ${VW} ${VH}`} style={{ width: '100%', display: 'block' }}>

          {/* California state fill */}
          <polygon points={stateToSvg(CA_POLY)} fill="#E5DECE" stroke="#CFC8B8" strokeWidth="1.2" />

          {/* State label */}
          {(() => { const [x, y] = proj(-120.5, 37.0); return (
            <text x={x} y={y} textAnchor="middle"
              fill="#B5AA95" fontSize="11" fontWeight="600" letterSpacing="2.5" fontFamily="Inter, sans-serif">
              CALIFORNIA
            </text>
          ); })()}

          {/* Pacific Ocean label */}
          {(() => { const [x, y] = proj(-124.0, 35.5); return (
            <text x={x} y={y} textAnchor="middle" fill="#9EB8C0" fontSize="10" fontWeight="500"
              fontFamily="Georgia, serif" fontStyle="italic">Pacific Ocean</text>
          ); })()}

          {/* Highway 1 / Pacific Coast Highway label */}
          {(() => { const [x, y] = proj(-122.2, 36.8); return (
            <text x={x} y={y} textAnchor="middle" fill="#A09483" fontSize="8.5"
              fontFamily="Georgia, serif" fontStyle="italic" transform={`rotate(-72, ${x}, ${y})`}>
              Highway 1
            </text>
          ); })()}

          {/* Route path — ghost */}
          <path d={svgPath} fill="none" stroke="#1B6B65" strokeWidth="3" strokeOpacity="0.12" strokeLinecap="round" />

          {/* Route path — animated reveal */}
          <path
            ref={pathRef}
            d={svgPath}
            fill="none"
            stroke="#1B6B65"
            strokeWidth="3"
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
                {isActive && (
                  <circle cx={x} cy={y} r={t.r + 8} fill="none" stroke={t.stroke} strokeWidth="1.2" strokeOpacity="0.35" />
                )}
                <circle cx={x} cy={y} r={t.r}
                  fill={isPast ? t.fill : '#F4F1EC'}
                  stroke={isPast ? t.stroke : '#C4B99E'}
                  strokeWidth={isActive ? 2.2 : 1.4}
                  style={{ transition: 'all 0.4s' }}
                />
                <text
                  x={x + city.labelDx} y={y - 10}
                  textAnchor={city.labelAnchor}
                  fill={isPast ? '#1C1A16' : '#A09483'}
                  fontSize={isActive ? '11.5' : '10.5'}
                  fontWeight={isActive ? '700' : '500'}
                  fontFamily="Inter, sans-serif"
                  style={{ transition: 'all 0.3s' }}
                >
                  {city.name}
                </text>
                {isPast && (
                  <text
                    x={x + city.labelDx} y={y + 2}
                    textAnchor={city.labelAnchor}
                    fill={t.stroke} fontSize="9" fontWeight="600"
                    fontFamily="Inter, sans-serif" opacity={isLocked ? 0.55 : 1}
                  >
                    {isLocked ? '·  ·  ·' : `Days ${city.days}`}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
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
      <div key={`mob-${activeStop.id}`} className="aw8-card-anim" style={{
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
