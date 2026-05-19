import { useState, useRef, useEffect, useCallback } from 'react';

// ── Projection ─────────────────────────────────────────────────────────────────
// Northern England bounding box: lon 3.5°W–0.3°E, lat 53.4–55.3°N
const VW = 800, VH = 400;
const X0 = -3.5, X1 = 0.3, Y0 = 53.4, Y1 = 55.3;

const proj = (lon, lat) => [
  (lon - X0) / (X1 - X0) * VW,
  (1 - (lat - Y0) / (Y1 - Y0)) * VH,
];

function toSvgPath(coords) {
  return coords.map(([lon, lat], i) => {
    const [x, y] = proj(lon, lat);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

// ── Land polygon ───────────────────────────────────────────────────────────────
// Northern England: land fills most of the map; North Sea on the east,
// Irish Sea / Solway on the northwest.
const LAND = [
  [-3.5, 53.4],
  // South border east
  [-2.0, 53.4], [-0.5, 53.4],
  // East (North Sea) coast going north
  [0.2, 53.7], [0.2, 54.1], [0.1, 54.4], [0.0, 54.8],
  // Northumberland coast toward Scotland
  [-0.4, 55.1], [-0.8, 55.3],
  // Scottish border
  [-1.5, 55.3], [-2.5, 55.3],
  // Solway Firth / NW
  [-3.0, 55.1], [-3.2, 55.0],
  // Cumbrian coast (Irish Sea) south
  [-3.5, 54.7], [-3.5, 54.3], [-3.4, 54.0],
  [-3.3, 53.8], [-3.5, 53.5], [-3.5, 53.4],
];

// Lake District upland tint
const LAKE_DISTRICT = [
  [-3.4, 54.3], [-3.1, 54.65], [-2.7, 54.65],
  [-2.7, 54.35], [-3.0, 54.2], [-3.4, 54.3],
];

// Yorkshire Dales / Pennines upland tint
const PENNINES = [
  [-2.5, 53.9], [-2.3, 54.2], [-2.0, 54.4],
  [-1.9, 54.6], [-1.7, 54.8], [-1.5, 54.9],
  [-1.4, 54.7], [-1.6, 54.5], [-1.8, 54.2],
  [-2.0, 54.0], [-2.2, 53.8], [-2.5, 53.9],
];

const LAND_D          = toSvgPath(LAND);
const LAKE_DISTRICT_D = toSvgPath(LAKE_DISTRICT);
const PENNINES_D      = toSvgPath(PENNINES);

// ── Catmull-Rom route path ─────────────────────────────────────────────────────
function catmullPath(lonlats, tension = 0.22) {
  const pts = lonlats.map(([lon, lat]) => proj(lon, lat));
  const n = pts.length;
  let d = `M ${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    const cp1 = [p1[0] + (p2[0] - p0[0]) * tension, p1[1] + (p2[1] - p0[1]) * tension];
    const cp2 = [p2[0] - (p3[0] - p1[0]) * tension, p2[1] - (p3[1] - p1[1]) * tension];
    d += ` C ${cp1[0].toFixed(1)},${cp1[1].toFixed(1)} ${cp2[0].toFixed(1)},${cp2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

// ── City data — Leeds → Malham → Ambleside → Grasmere → Durham → Whitby → Scarborough → York ──
const CITIES = [
  {
    id: 'leeds', name: 'Leeds', lon: -1.55, lat: 53.80, tier: 2,
    days: '1', dayStart: 1,
    desc: 'Start of the road north: gateway city for the Yorkshire Dales and beyond',
    labelDx: 12, labelAnchor: 'start',
  },
  {
    id: 'malham', name: 'Malham', lon: -2.16, lat: 54.07, tier: 2,
    days: '1', dayStart: 1,
    desc: 'Malham Cove and Gordale Scar: the Yorkshire Dales at their most dramatic',
    labelDx: -12, labelAnchor: 'end',
  },
  {
    id: 'ambleside', name: 'Ambleside', lon: -2.96, lat: 54.43, tier: 1,
    days: '1–2', dayStart: 1,
    desc: 'Lake District gateway: Castlerigg Stone Circle, Ullswater and Blea Tarn at golden hour',
    labelDx: -12, labelAnchor: 'end',
  },
  {
    id: 'grasmere', name: 'Grasmere', lon: -3.02, lat: 54.46, tier: 2,
    days: '2', dayStart: 2,
    desc: "Wordsworth's village: the Lake District at its quietest before the season presses in",
    labelDx: -12, labelAnchor: 'end',
  },
  {
    id: 'durham', name: 'Durham', lon: -1.57, lat: 54.78, tier: 1,
    days: '2', dayStart: 2,
    desc: 'Durham Cathedral: one of the great Romanesque buildings in Europe, above the River Wear',
    labelDx: 12, labelAnchor: 'start',
  },
  {
    id: 'whitby', name: 'Whitby', lon: -0.62, lat: 54.49, tier: 1,
    days: '3', dayStart: 3,
    desc: 'The ruined Benedictine abbey on the headland that inspired Bram Stoker',
    labelDx: 12, labelAnchor: 'start',
  },
  {
    id: 'scarborough', name: 'Scarborough', lon: -0.40, lat: 54.28, tier: 2,
    days: '3', dayStart: 3,
    desc: 'A clifftop castle, a proper beach and a town that has not been sanitised',
    labelDx: 12, labelAnchor: 'start',
  },
  {
    id: 'york', name: 'York', lon: -1.08, lat: 53.96, tier: 1,
    days: '4', dayStart: 4,
    desc: "The Shambles, the Minster and the city walls: medieval England's finest surviving city",
    labelDx: 12, labelAnchor: 'start',
  },
];

const ROUTE_LONLAT  = CITIES.map(c => [c.lon, c.lat]);
const ROUTE_PATH_D  = catmullPath(ROUTE_LONLAT, 0.22);

// Cumulative fractions: Leeds–Malham(55km)–Ambleside(80km)–Grasmere(5km)–Durham(110km)–Whitby(65km)–Scarborough(25km)–York(65km) ≈ 405km
const STOP_FRACTIONS = [0, 0.136, 0.333, 0.345, 0.617, 0.778, 0.839, 1.0];

// Gateway cities shown even in preview (first and last are always visible)
const PREVIEW_LABELED = new Set(['leeds', 'ambleside', 'durham', 'whitby', 'york']);

const TIER = {
  1: { r: 8,   rActive: 11,  sw: 2.2, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 12,  dFs: 8   },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5, dFs: 7.5 },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function NorthernEnglandRouteMap({ onDaySelect, isUnlocked = true }) {
  const [activeStop, setActiveStop] = useState(0);
  const [animating, setAnimating]   = useState(true);
  const [hovered, setHovered]       = useState(null);
  const [isMobile, setIsMobile]     = useState(false);
  const [bottomCard, setBottomCard] = useState(null);
  const [pathLen, setPathLen]       = useState(2200);

  const routeRef     = useRef(null);
  const svgRef       = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (routeRef.current) {
      const len = routeRef.current.getTotalLength();
      if (len > 0) setPathLen(len);
    }
  }, []);

  useEffect(() => {
    if (!animating) return;
    const id = setTimeout(() => {
      setActiveStop(s => {
        if (s < CITIES.length - 1) return s + 1;
        setAnimating(false);
        return s;
      });
    }, 480);
    return () => clearTimeout(id);
  }, [activeStop, animating]);

  const revealedLen = pathLen * STOP_FRACTIONS[activeStop];
  const dashOffset  = Math.max(0, pathLen - revealedLen);

  const handleStopInteract = useCallback((city, stopIdx) => {
    setActiveStop(stopIdx);
    setAnimating(false);
    if (isMobile && isUnlocked) {
      setBottomCard(prev => prev?.id === city.id ? null : city);
    } else if (!isMobile && isUnlocked && onDaySelect && city.dayStart) {
      onDaySelect(city.dayStart);
    }
  }, [isMobile, onDaySelect, isUnlocked]);

  const getTooltipPos = (svgX, svgY) => {
    if (!svgRef.current || !containerRef.current) return { left: 0, top: 0 };
    const svgR = svgRef.current.getBoundingClientRect();
    const conR = containerRef.current.getBoundingClientRect();
    return {
      left: svgR.left - conR.left + svgX * (svgR.width / VW),
      top:  svgR.top  - conR.top  + svgY * (svgR.height / VH),
    };
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── SVG Map ─────────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#BDD5E0' }}
        aria-label="Northern England roadtrip route map"
      >
        <defs>
          <clipPath id="neng-map-clip">
            <rect width={VW} height={VH} />
          </clipPath>
          <filter id="neng-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Sea background */}
        <rect width={VW} height={VH} fill="#BDD5E0" />

        {/* Land masses */}
        <g clipPath="url(#neng-map-clip)">
          <path d={LAND_D}          fill="#D8CBAA" stroke="#B5A48A" strokeWidth="0.8" />
          <path d={LAKE_DISTRICT_D} fill="#C4C8A0" fillOpacity="0.45" stroke="none" />
          <path d={PENNINES_D}      fill="#C0BCA0" fillOpacity="0.30" stroke="none" />
        </g>

        {/* Region and sea labels */}
        {[
          ['North Sea',          0.0, 54.6, 8,  true  ],
          ['Irish Sea',         -3.3, 54.1, 7,  true  ],
          ['Yorkshire Dales',   -2.2, 54.2, 6.5, false ],
          ['Lake District',     -3.1, 54.5, 6.5, false ],
          ['North York Moors',  -0.9, 54.4, 6.5, false ],
          ['Pennines',          -2.1, 54.5, 6,  false  ],
        ].map(([label, lon, lat, fs, italic]) => {
          const [x, y] = proj(lon, lat);
          return (
            <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontSize={fs} fontFamily="Helvetica, sans-serif"
              fontStyle={italic ? 'italic' : 'normal'}
              fill={italic ? '#5A7A88' : '#7A6C50'} opacity={italic ? '0.75' : '0.55'}>
              {label}
            </text>
          );
        })}

        {/* Route ghost */}
        <path d={ROUTE_PATH_D} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" clipPath="url(#neng-map-clip)" />

        {/* Route reveal */}
        <path
          ref={routeRef}
          d={ROUTE_PATH_D}
          fill="none"
          stroke="#1B3D39"
          strokeWidth="2.0"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.88"
          style={{
            strokeDasharray: pathLen,
            strokeDashoffset: dashOffset,
            transition: animating
              ? 'stroke-dashoffset 0.55s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          clipPath="url(#neng-map-clip)"
        />

        {/* City markers */}
        {CITIES.map((city, i) => {
          const [cx, cy] = proj(city.lon, city.lat);
          const isActive  = i === activeStop;
          const isFuture  = i > activeStop;
          const cfg       = TIER[city.tier];
          const r         = isActive ? cfg.rActive : cfg.r;
          const showLabel = isUnlocked || PREVIEW_LABELED.has(city.id);
          const opacity   = !showLabel ? 0.38 : (isFuture ? 0.28 : 1);

          return (
            <g key={city.id} opacity={opacity} style={{ transition: 'opacity 0.4s ease', cursor: showLabel ? 'pointer' : 'default' }}>
              {isActive && showLabel && (
                <circle cx={cx} cy={cy} r={r * 2.4} fill={cfg.halo} opacity="0.15" />
              )}
              <circle cx={cx} cy={cy} r={r + 3} fill="none"
                stroke={cfg.edge} strokeWidth="0.8"
                opacity={isActive && showLabel ? 0.45 : city.tier === 1 ? 0.20 : 0.12} />
              <circle cx={cx} cy={cy} r={r}
                fill={cfg.fill} stroke={cfg.edge} strokeWidth={cfg.sw}
                filter={city.tier === 1 ? 'url(#neng-node-shadow)' : undefined}
                style={{ transition: 'r 0.3s ease' }}
              />
              {showLabel && (
                <text
                  x={cx + city.labelDx} y={cy - 1}
                  textAnchor={city.labelAnchor} dominantBaseline="auto"
                  fontSize={cfg.lFs} fontFamily="Georgia, serif"
                  fontWeight={city.tier === 1 ? '800' : '500'}
                  fill={isFuture ? '#9A9080' : city.tier === 1 ? '#131210' : '#1C1A16'}
                  style={{ paintOrder: 'stroke', stroke: '#D8CBAA', strokeWidth: '4', strokeLinejoin: 'round' }}
                >
                  {city.name}
                </text>
              )}
              {isUnlocked && (
                <text
                  x={cx + city.labelDx} y={cy + cfg.lFs * 0.9 + 1}
                  textAnchor={city.labelAnchor}
                  fontSize={cfg.dFs} fontFamily="Helvetica, sans-serif"
                  fill={isFuture ? '#C0B8AC' : '#9C9284'}
                  style={{ paintOrder: 'stroke', stroke: '#D8CBAA', strokeWidth: '2.5' }}
                >
                  {`Day${city.days.includes('–') ? 's' : ''} ${city.days}`}
                </text>
              )}
              {showLabel && (
                <circle cx={cx} cy={cy} r={Math.max(r + 14, 20)} fill="transparent"
                  onMouseEnter={() => !isMobile && !animating && setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => handleStopInteract(city, i)}
                  onTouchStart={e => { e.preventDefault(); handleStopInteract(city, i); }}
                />
              )}
            </g>
          );
        })}

        {/* Legend */}
        {isUnlocked && (
          <g transform="translate(12, 272)">
            <rect x="-4" y="-8" width="145" height="72" rx="4"
              fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
            <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
            <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Destination city</text>
            <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
            <text x="24" y="28" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Route stop</text>
            <text x="4"  y="52" fontSize="6.5" fontFamily="Helvetica, sans-serif" fill="#9A9080" fontStyle="italic">4-day B-road circuit</text>
          </g>
        )}
      </svg>

      {/* ── Desktop tooltip ──────────────────────────────────────────────────── */}
      {hovered !== null && !isMobile && (() => {
        const city = CITIES[hovered];
        const [cx, cy] = proj(city.lon, city.lat);
        const pos = getTooltipPos(cx, cy);
        const onRight = city.labelDx > 0;
        return (
          <div style={{
            position: 'absolute',
            left: pos.left + (onRight ? 20 : -20),
            top:  pos.top - 36,
            transform: onRight ? 'none' : 'translateX(-100%)',
            background: 'white', border: '1px solid #E8E3DA',
            borderRadius: '8px', padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(28,26,22,0.12)',
            pointerEvents: 'none', zIndex: 50,
            minWidth: '180px', maxWidth: '220px',
          }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', margin: '0 0 3px', fontFamily: "'Playfair Display', Georgia, serif" }}>
              {city.name}
            </p>
            {isUnlocked && (
              <p style={{ fontSize: '11px', color: '#C9A96E', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 6px', textTransform: 'uppercase' }}>
                Day{city.days.includes('–') ? 's' : ''} {city.days}
              </p>
            )}
            <p style={{ fontSize: '12px', color: '#6B6156', lineHeight: '1.5', margin: 0 }}>
              {city.desc}
            </p>
            {isUnlocked && onDaySelect && city.dayStart && (
              <p style={{ fontSize: '10.5px', color: '#1B6B65', marginTop: '8px', fontWeight: '600', cursor: 'pointer' }}
                onClick={() => onDaySelect(city.dayStart)}>
                View day →
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Day Slider ───────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '20px', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', color: '#7C7060', textTransform: 'uppercase' }}>
            Journey Progress
          </span>
          {isUnlocked && (
            <span style={{ fontSize: '12px', color: '#1B6B65', fontWeight: '600' }}>
              {`${CITIES[activeStop].name} · Day${CITIES[activeStop].days.includes('–') ? 's' : ''} ${CITIES[activeStop].days}`}
            </span>
          )}
        </div>
        <input
          type="range" min={0} max={CITIES.length - 1} step={1} value={activeStop}
          onChange={e => { setActiveStop(+e.target.value); setAnimating(false); }}
          style={{
            width: '100%', height: '4px', appearance: 'none', WebkitAppearance: 'none',
            background: `linear-gradient(to right, #1B6B65 ${(activeStop / (CITIES.length - 1)) * 100}%, #E8E3DA ${(activeStop / (CITIES.length - 1)) * 100}%)`,
            borderRadius: '2px', outline: 'none', cursor: 'pointer', margin: '0',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 1 · Leeds' : 'Leeds'}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 4 · York' : 'York'}
          </span>
        </div>
      </div>

      {/* ── Stop preview card ────────────────────────────────────────────────── */}
      <div key={CITIES[activeStop].id} style={{
        marginTop: '16px', background: 'white', borderRadius: '8px',
        padding: '16px 20px', border: '1px solid #E8E3DA',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px',
        animation: 'neng-card 0.3s ease forwards',
      }}>
        <div>
          {isUnlocked && (
            <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '3px' }}>
              Day{CITIES[activeStop].days.includes('–') ? 's' : ''} {CITIES[activeStop].days}
            </p>
          )}
          <p style={{ fontSize: '15px', fontWeight: '600', color: '#1C1A16' }}>
            {CITIES[activeStop].name}
          </p>
          {(isUnlocked || PREVIEW_LABELED.has(CITIES[activeStop].id)) && (
            <p style={{ fontSize: '12px', color: '#6B6156', marginTop: '3px', lineHeight: '1.5' }}>
              {CITIES[activeStop].desc}
            </p>
          )}
        </div>
        {isUnlocked && CITIES[activeStop].dayStart && (
          <button
            onClick={() => onDaySelect && onDaySelect(CITIES[activeStop].dayStart)}
            style={{ background: '#1B6B65', color: 'white', border: 'none', borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Jump to Day {CITIES[activeStop].dayStart}
          </button>
        )}
      </div>

      {/* ── Mobile bottom card ───────────────────────────────────────────────── */}
      {isMobile && bottomCard && isUnlocked && (
        <div onClick={() => setBottomCard(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,26,22,0.2)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 24px 32px', boxShadow: '0 -8px 40px rgba(28,26,22,0.15)', animation: 'slideUp 0.28s ease' }}>
            <div style={{ width: '36px', height: '3px', background: '#E8E3DA', borderRadius: '2px', margin: '0 auto 18px' }} />
            <p style={{ fontSize: '18px', fontWeight: '700', color: '#1C1A16', margin: '0 0 4px', fontFamily: "'Playfair Display', Georgia, serif" }}>
              {bottomCard.name}
            </p>
            {isUnlocked && (
              <p style={{ fontSize: '12px', color: '#C9A96E', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 10px', textTransform: 'uppercase' }}>
                Day{bottomCard.days.includes('–') ? 's' : ''} {bottomCard.days}
              </p>
            )}
            <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.6', margin: 0 }}>
              {bottomCard.desc}
            </p>
            {isUnlocked && onDaySelect && bottomCard.dayStart && (
              <button onClick={() => { onDaySelect(bottomCard.dayStart); setBottomCard(null); }}
                style={{ marginTop: '16px', width: '100%', padding: '13px', background: '#1B6B65', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Jump to Day {bottomCard.dayStart}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #1B6B65; border: 2px solid white; box-shadow: 0 1px 4px rgba(28,26,22,0.20); cursor: pointer; }
        input[type='range']::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #1B6B65; border: 2px solid white; box-shadow: 0 1px 4px rgba(28,26,22,0.20); cursor: pointer; }
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes neng-card { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
