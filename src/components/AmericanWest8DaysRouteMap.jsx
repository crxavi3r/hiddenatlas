import { useState, useRef, useEffect, useCallback } from 'react';

// ── Viewport & projection ─────────────────────────────────────────────────────
const VW = 900, VH = 620;
const X0 = -125.5, X1 = -115.5, Y0 = 32.3, Y1 = 39.2;

const proj = (lon, lat) => [
  (lon - X0) / (X1 - X0) * VW,
  (1 - (lat - Y0) / (Y1 - Y0)) * VH,
];

// ── Catmull-Rom route path ────────────────────────────────────────────────────
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

// ── California outline ────────────────────────────────────────────────────────
function toSvgPath(coords) {
  return coords.map(([lon, lat], i) => {
    const [x, y] = proj(lon, lat);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

const CA_COAST = [
  [-124.2,39.1],[-123.8,39.0],[-122.8,37.9],[-122.5,37.6],
  [-122.4,36.9],[-121.9,36.3],[-121.0,35.6],[-120.6,35.1],[-120.1,34.5],
  [-119.7,34.4],[-119.1,34.1],[-118.5,34.0],[-117.7,33.5],[-117.3,33.1],
  [-117.1,32.6],[-116.1,32.5],
];
const CA_EAST = [[-116.1,32.5],[-115.5,32.7],[-115.5,39.1],[-124.2,39.1]];
const CA_POLY = [...CA_COAST, ...CA_EAST];

// ── Cities ────────────────────────────────────────────────────────────────────
const CITIES = [
  { id: 'san-francisco', name: 'San Francisco', days: '1–2', dayStart: 1, lon: -122.42, lat: 37.77, tier: 1, labelDx: -16, labelAnchor: 'end',   desc: 'The bay, Coit Tower, Chinatown and City Hall on foot.' },
  { id: 'big-sur',       name: 'Big Sur',       days: '3',   dayStart: 3, lon: -121.79, lat: 36.27, tier: 2, labelDx:  13, labelAnchor: 'start', desc: 'Bixby Bridge and the 90-mile coastal cliff highway.' },
  { id: 'santa-barbara', name: 'Santa Barbara', days: '4–5', dayStart: 4, lon: -119.70, lat: 34.42, tier: 1, labelDx:  13, labelAnchor: 'start', desc: 'The American Riviera: the Mission and the Funk Zone.' },
  { id: 'los-angeles',   name: 'Los Angeles',   days: '6–7', dayStart: 6, lon: -118.24, lat: 34.05, tier: 1, labelDx: -14, labelAnchor: 'end',   desc: 'Venice Beach, Santa Monica and the Pacific Coast Highway.' },
  { id: 'san-diego',     name: 'San Diego',     days: '8',   dayStart: 8, lon: -117.16, lat: 32.72, tier: 1, labelDx:  14, labelAnchor: 'start', desc: 'La Jolla cove, sea lions and the final Pacific coast.' },
];

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

const STOP_FRACTIONS  = [0, 0.24, 0.55, 0.74, 1.0];
const PREVIEW_LABELED = new Set(['san-francisco', 'santa-barbara', 'los-angeles', 'san-diego']);
const ROUTE_PATH_D    = catmullPath(ROUTE_LONLAT, 0.22);

// ── Tier visual config ────────────────────────────────────────────────────────
const TIER = {
  1: { r: 8,   rActive: 11,  sw: 2.2, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 12,  dFs: 8,   shadow: true },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5, dFs: 7.5               },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function AmericanWest8DaysRouteMap({ isUnlocked, onDaySelect }) {
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
    }, 420);
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
      left: svgR.left - conR.left + svgX * (svgR.width  / VW),
      top:  svgR.top  - conR.top  + svgY * (svgR.height / VH),
    };
  };

  const [pacX, pacY] = proj(-124.0, 36.5);
  const [hw1X, hw1Y] = proj(-122.2, 36.8);

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── SVG Map ──────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#C8DCE8' }}
        aria-label="California Coastal 8-Day Road Journey route map"
      >
        <defs>
          <clipPath id="aw8-clip">
            <rect width={VW} height={VH} />
          </clipPath>
          <filter id="aw8-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Ocean */}
        <rect width={VW} height={VH} fill="#C8DCE8" />

        {/* California */}
        <g clipPath="url(#aw8-clip)">
          <path d={toSvgPath(CA_POLY)} fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.8" />
        </g>

        {/* State label */}
        {(() => { const [x, y] = proj(-120.5, 37.0); return (
          <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="8" fontFamily="Helvetica, sans-serif"
            fill="#8C7B6B" opacity="0.65">
            CALIFORNIA
          </text>
        ); })()}

        {/* Ocean label */}
        <text x={pacX} y={pacY} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fontFamily="Georgia, serif" fontStyle="italic"
          fill="#5A7A88" opacity="0.72">
          Pacific Ocean
        </text>

        {/* Highway 1 label */}
        <text x={hw1X} y={hw1Y} textAnchor="middle"
          fill="#A09483" fontSize="8.5"
          fontFamily="Georgia, serif" fontStyle="italic"
          transform={`rotate(-72, ${hw1X}, ${hw1Y})`}>
          Highway 1
        </text>

        {/* Route ghost */}
        <path d={ROUTE_PATH_D} fill="none" stroke="#1F3D3A" strokeWidth="1.2"
          opacity="0.07" clipPath="url(#aw8-clip)" />

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
              ? 'stroke-dashoffset 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          clipPath="url(#aw8-clip)"
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
            <g key={city.id} opacity={opacity}
              style={{ transition: 'opacity 0.4s ease', cursor: showLabel ? 'pointer' : 'default' }}>
              {isActive && showLabel && (
                <circle cx={cx} cy={cy} r={r * 2.4} fill={cfg.halo} opacity="0.15"
                  style={{ transition: 'r 0.3s ease' }} />
              )}
              <circle cx={cx} cy={cy} r={r + 3} fill="none"
                stroke={cfg.edge} strokeWidth="0.8"
                opacity={isActive && showLabel ? 0.45 : 0.20} />
              <circle cx={cx} cy={cy} r={r}
                fill={cfg.fill} stroke={cfg.edge} strokeWidth={cfg.sw}
                filter={city.tier === 1 ? 'url(#aw8-shadow)' : undefined}
                style={{ transition: 'r 0.3s ease' }}
              />
              {showLabel && (
                <text x={cx + city.labelDx} y={cy - 1}
                  textAnchor={city.labelAnchor}
                  dominantBaseline="auto"
                  fontSize={cfg.lFs}
                  fontFamily="Georgia, serif"
                  fontWeight={city.tier === 1 ? '800' : '600'}
                  fill={isFuture ? '#9A9080' : city.tier === 1 ? '#131210' : '#1C1A16'}
                  style={{ paintOrder: 'stroke', stroke: '#C8DCE8', strokeWidth: '4', strokeLinejoin: 'round' }}
                >
                  {city.name}
                </text>
              )}
              {isUnlocked && (
                <text x={cx + city.labelDx} y={cy + cfg.lFs * 0.9 + 1}
                  textAnchor={city.labelAnchor}
                  fontSize={cfg.dFs}
                  fontFamily="Helvetica, sans-serif"
                  fill={isFuture ? '#C0B8AC' : '#9C9284'}
                  style={{ paintOrder: 'stroke', stroke: '#C8DCE8', strokeWidth: '2.5' }}
                >
                  {`Days ${city.days}`}
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
          <g transform="translate(12, 492)">
            <rect x="-4" y="-8" width="148" height="68" rx="4"
              fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
            <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
            <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5"
              fontFamily="Helvetica, sans-serif" fill="#3C3830">Start / End</text>
            <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
            <text x="24" y="28" dominantBaseline="middle" fontSize="7.5"
              fontFamily="Helvetica, sans-serif" fill="#3C3830">Route stop</text>
            <text x="4" y="52" fontSize="6.5" fontFamily="Helvetica, sans-serif"
              fill="#9A9080" fontStyle="italic">Drag to explore route</text>
          </g>
        )}
      </svg>

      {/* ── Desktop tooltip ───────────────────────────────────────────────── */}
      {hovered !== null && !isMobile && (() => {
        const city = CITIES[hovered];
        const [cx, cy] = proj(city.lon, city.lat);
        const pos = getTooltipPos(cx, cy);
        const onRight = city.labelDx > 0;
        return (
          <div style={{
            position: 'absolute',
            left: pos.left + (onRight ? 20 : -20),
            top:  pos.top  - 36,
            transform: onRight ? 'none' : 'translateX(-100%)',
            background: 'white',
            border: '1px solid #E8E3DA',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(28,26,22,0.12)',
            pointerEvents: 'none',
            zIndex: 50,
            minWidth: '180px',
            maxWidth: '224px',
          }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', margin: '0 0 3px',
              fontFamily: "'Playfair Display', Georgia, serif" }}>
              {city.name}
            </p>
            {isUnlocked && (
              <p style={{ fontSize: '11px', color: '#C9A96E', fontWeight: '600',
                letterSpacing: '0.5px', margin: '0 0 6px', textTransform: 'uppercase' }}>
                Days {city.days}
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

      {/* ── Journey Progress slider ───────────────────────────────────────── */}
      <div style={{ marginTop: '20px', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', color: '#7C7060', textTransform: 'uppercase' }}>
            Journey Progress
          </span>
          {isUnlocked && (
            <span style={{ fontSize: '12px', color: '#1B6B65', fontWeight: '600' }}>
              {`${CITIES[activeStop].name} · Days ${CITIES[activeStop].days}`}
            </span>
          )}
        </div>

        <input
          type="range"
          min={0}
          max={CITIES.length - 1}
          step={1}
          value={activeStop}
          onChange={e => { setActiveStop(+e.target.value); setAnimating(false); }}
          style={{
            width: '100%',
            height: '4px',
            appearance: 'none',
            WebkitAppearance: 'none',
            background: `linear-gradient(to right, #1B6B65 ${(activeStop / (CITIES.length - 1)) * 100}%, #E8E3DA ${(activeStop / (CITIES.length - 1)) * 100}%)`,
            borderRadius: '2px',
            outline: 'none',
            cursor: 'pointer',
            margin: '0',
          }}
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 1 · San Francisco' : 'San Francisco'}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 8 · San Diego' : 'San Diego'}
          </span>
        </div>
      </div>

      {/* ── Stop preview card ─────────────────────────────────────────────── */}
      <div key={CITIES[activeStop].id} style={{
        marginTop: '16px', background: 'white', borderRadius: '8px',
        padding: '16px 20px', border: '1px solid #E8E3DA',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px',
        animation: 'aw8-card 0.3s ease forwards',
      }}>
        <div>
          {isUnlocked && (
            <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px',
              textTransform: 'uppercase', color: '#C9A96E', marginBottom: '3px' }}>
              Days {CITIES[activeStop].days}
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
            style={{
              background: '#1B6B65', color: 'white', border: 'none',
              borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: '600',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Jump to Day {CITIES[activeStop].dayStart}
          </button>
        )}
      </div>

      {/* ── Mobile bottom card ────────────────────────────────────────────── */}
      {isMobile && bottomCard && isUnlocked && (
        <div onClick={() => setBottomCard(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,26,22,0.2)' }}>
          <div onClick={e => e.stopPropagation()} style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
            background: 'white', borderRadius: '16px 16px 0 0',
            padding: '20px 24px 32px',
            boxShadow: '0 -8px 40px rgba(28,26,22,0.15)',
            animation: 'aw8-slideUp 0.28s ease',
          }}>
            <div style={{ width: '36px', height: '3px', background: '#E8E3DA', borderRadius: '2px', margin: '0 auto 18px' }} />
            <p style={{ fontSize: '18px', fontWeight: '700', color: '#1C1A16', margin: '0 0 4px',
              fontFamily: "'Playfair Display', Georgia, serif" }}>
              {bottomCard.name}
            </p>
            <p style={{ fontSize: '12px', color: '#C9A96E', fontWeight: '600', letterSpacing: '0.5px',
              margin: '0 0 10px', textTransform: 'uppercase' }}>
              Days {bottomCard.days}
            </p>
            <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.6', margin: 0 }}>
              {bottomCard.desc}
            </p>
            {onDaySelect && bottomCard.dayStart && (
              <button onClick={() => { onDaySelect(bottomCard.dayStart); setBottomCard(null); }}
                style={{
                  marginTop: '16px', width: '100%', padding: '13px',
                  background: '#1B6B65', color: 'white',
                  border: 'none', borderRadius: '6px',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}>
                Jump to Day {bottomCard.dayStart}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px; border-radius: 50%;
          background: #1B6B65; border: 2px solid white;
          box-shadow: 0 1px 4px rgba(28,26,22,0.20); cursor: pointer;
        }
        input[type='range']::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%;
          background: #1B6B65; border: 2px solid white;
          box-shadow: 0 1px 4px rgba(28,26,22,0.20); cursor: pointer;
        }
        @keyframes aw8-slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
        @keyframes aw8-card {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
