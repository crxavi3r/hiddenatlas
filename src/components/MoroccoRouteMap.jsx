import { useState, useRef, useEffect, useCallback } from 'react';

// ── Projection ────────────────────────────────────────────────────────────────
const VW = 800, VH = 620;
const X0 = -10.5, X1 = -2.0, Y0 = 30.0, Y1 = 36.2;

const proj = (lon, lat) => [
  (lon - X0) / (X1 - X0) * VW,
  (1 - (lat - Y0) / (Y1 - Y0)) * VH,
];

// ── Morocco land polygon ──────────────────────────────────────────────────────
function toSvgPath(coords) {
  return coords.map(([lon, lat], i) => {
    const [x, y] = proj(lon, lat);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

// Simplified Morocco outline (clockwise from Tangier/NW)
const MOROCCO = [
  [-5.8, 35.9], [-5.2, 35.9], [-4.0, 35.65], [-3.2, 35.1],
  [-2.5, 34.9], [-2.0, 34.2], [-2.0, 32.0],  [-2.0, 30.5],
  [-3.0, 30.0], [-5.5, 30.0], [-8.0, 30.0],  [-9.5, 30.0],
  [-9.8, 30.5], [-10.0, 31.3],[-9.9, 32.0],  [-9.6, 32.8],
  [-9.2, 33.0], [-8.6, 33.4], [-7.6, 33.6],  [-7.0, 33.7],
  [-6.8, 34.0], [-6.0, 35.0], [-5.8, 35.9],
];

// Saharan south — slightly more ochre tint
const SAHARA = [
  [-2.0, 32.0], [-2.0, 30.0], [-4.5, 30.0], [-6.5, 30.0],
  [-7.5, 30.5], [-6.5, 31.2], [-5.5, 31.5], [-4.5, 31.8],
  [-3.5, 31.8], [-2.8, 32.2], [-2.0, 32.0],
];

const MOROCCO_D = toSvgPath(MOROCCO);
const SAHARA_D  = toSvgPath(SAHARA);

// ── Smooth Catmull-Rom route path ─────────────────────────────────────────────
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

// ── City data ─────────────────────────────────────────────────────────────────
const CITIES = [
  { id: 'chefchaouen', name: 'Chefchaouen', lon: -5.27, lat: 35.17, tier: 1, days: '1',   dayStart: 1, desc: 'Blue-painted hillside medina of the Rif mountains',               labelDx: 14,  labelAnchor: 'start' },
  { id: 'fes',         name: 'Fes',         lon: -5.00, lat: 34.03, tier: 1, days: '2',   dayStart: 2, desc: 'UNESCO medina — the largest car-free urban area in the world',      labelDx: -12, labelAnchor: 'end'   },
  { id: 'errachidia',  name: 'Errachidia',  lon: -4.43, lat: 31.93, tier: 2, days: '2–3', dayStart: 2, desc: 'Gateway before the gorge roads of the deep south',                  labelDx: -12, labelAnchor: 'end'   },
  { id: 'merzouga',    name: 'Merzouga',    lon: -3.97, lat: 31.10, tier: 1, days: '3–4', dayStart: 3, desc: 'Erg Chebbi — the Sahara at its most dramatic',                       labelDx: -12, labelAnchor: 'end'   },
  { id: 'ouarzazate',  name: 'Ouarzazate',  lon: -6.89, lat: 30.92, tier: 2, days: '5',   dayStart: 5, desc: 'Gateway city before the High Atlas crossing',                        labelDx: 12,  labelAnchor: 'start' },
  { id: 'marrakech',   name: 'Marrakech',   lon: -7.99, lat: 31.63, tier: 1, days: '6',   dayStart: 6, desc: 'The medina, Djemaa el-Fna and the city in full',                     labelDx: 12,  labelAnchor: 'start' },
  { id: 'oualidia',    name: 'Oualidia',    lon: -9.04, lat: 32.73, tier: 2, days: '7',   dayStart: 7, desc: 'Atlantic lagoon and oysters two days from the Sahara',               labelDx: 14,  labelAnchor: 'start' },
  { id: 'casablanca',  name: 'Casablanca',  lon: -7.59, lat: 33.59, tier: 2, days: '8',   dayStart: 8, desc: 'Hassan II Mosque and the road home along the Atlantic',              labelDx: 14,  labelAnchor: 'start' },
];

const ROUTE_LONLAT  = CITIES.map(c => [c.lon, c.lat]);
const ROUTE_PATH_D  = catmullPath(ROUTE_LONLAT, 0.22);

// Approximate cumulative geographic fractions along the route
const STOP_FRACTIONS = [0, 0.104, 0.294, 0.375, 0.616, 0.724, 0.858, 1.000];

// Cities shown with full labels in preview/teaser state
const PREVIEW_LABELED = new Set(['chefchaouen', 'merzouga', 'marrakech', 'casablanca']);

// ── Tier visual config ────────────────────────────────────────────────────────
const TIER = {
  1: { r: 8,   rActive: 11,  sw: 2.2, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 12,  dFs: 8,   shadow: true },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5, dFs: 7.5               },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function MoroccoRouteMap({ onDaySelect, isUnlocked = true }) {
  const [activeStop, setActiveStop] = useState(0);
  const [animating, setAnimating]   = useState(true);
  const [hovered, setHovered]       = useState(null);
  const [isMobile, setIsMobile]     = useState(false);
  const [bottomCard, setBottomCard] = useState(null);
  const [pathLen, setPathLen]       = useState(2400);

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
    if (isMobile) {
      setBottomCard(prev => prev?.id === city.id ? null : city);
    } else if (isUnlocked && onDaySelect && city.dayStart) {
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

      {/* ── SVG Map ──────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#BDD5E0' }}
        aria-label="Morocco Motorcycle Expedition route map"
      >
        <defs>
          <clipPath id="morocco-map-clip">
            <rect width={VW} height={VH} />
          </clipPath>
          <filter id="morocco-label-bg" x="-10%" y="-20%" width="120%" height="140%">
            <feFlood floodColor="#F5F0E8" floodOpacity="0.85" result="bg" />
            <feComposite in="bg" in2="SourceGraphic" operator="over" />
          </filter>
          <filter id="morocco-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Ocean background */}
        <rect width={VW} height={VH} fill="#BDD5E0" />

        {/* Land */}
        <g clipPath="url(#morocco-map-clip)">
          <path d={MOROCCO_D} fill="#D8CBAA" stroke="#B5A48A" strokeWidth="0.8" />
          {/* Saharan desert tint */}
          <path d={SAHARA_D}  fill="#C8A96A" fillOpacity="0.22" stroke="none" />
        </g>

        {/* Water labels */}
        {[
          ['Mediterranean Sea', -4.5, 35.6, 0],
          ['Atlantic Ocean',    -10.1, 33.0, -90],
          ['Sahara Desert',     -5.5, 30.6, 0],
        ].map(([label, lon, lat, rot]) => {
          const [x, y] = proj(lon, lat);
          return (
            <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontSize="8" fontFamily="Helvetica, sans-serif" fontStyle="italic"
              fill="#5A7A88" opacity="0.7" transform={`rotate(${rot}, ${x}, ${y})`}
            >
              {label}
            </text>
          );
        })}

        {/* Route ghost */}
        <path d={ROUTE_PATH_D} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" clipPath="url(#morocco-map-clip)" />

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
          clipPath="url(#morocco-map-clip)"
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
                filter={city.tier === 1 ? 'url(#morocco-node-shadow)' : undefined}
                style={{ transition: 'r 0.3s ease' }}
              />
              {showLabel && (
                <text
                  x={cx + city.labelDx} y={cy - 1}
                  textAnchor={city.labelAnchor} dominantBaseline="auto"
                  fontSize={cfg.lFs} fontFamily="Georgia, serif"
                  fontWeight={city.tier === 1 ? '800' : '500'}
                  fill={isFuture ? '#9A9080' : city.tier === 1 ? '#131210' : '#1C1A16'}
                  style={{ paintOrder: 'stroke', stroke: '#BDD5E0', strokeWidth: '4', strokeLinejoin: 'round' }}
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
                  style={{ paintOrder: 'stroke', stroke: '#BDD5E0', strokeWidth: '2.5' }}
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
        <g transform="translate(12, 468)">
          <rect x="-4" y="-8" width="148" height="72" rx="4"
            fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
          <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
          <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Major city</text>
          <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
          <text x="24" y="28" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Route stop</text>
          <text x="4"  y="52" fontSize="6.5" fontFamily="Helvetica, sans-serif" fill="#9A9080" fontStyle="italic">Large = primary stop</text>
        </g>
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

      {/* ── Day Slider ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '20px', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', color: '#7C7060', textTransform: 'uppercase' }}>
            Journey Progress
          </span>
          <span style={{ fontSize: '12px', color: '#1B6B65', fontWeight: '600' }}>
            {isUnlocked || PREVIEW_LABELED.has(CITIES[activeStop].id)
              ? isUnlocked
                ? `${CITIES[activeStop].name} · Days ${CITIES[activeStop].days}`
                : CITIES[activeStop].name
              : '· · ·'
            }
          </span>
        </div>
        <div>
          <input
            type="range" min={0} max={CITIES.length - 1} step={1} value={activeStop}
            onChange={e => { setActiveStop(+e.target.value); setAnimating(false); }}
            style={{
              width: '100%', height: '4px', appearance: 'none', WebkitAppearance: 'none',
              background: `linear-gradient(to right, #1B6B65 ${(activeStop / (CITIES.length - 1)) * 100}%, #E8E3DA ${(activeStop / (CITIES.length - 1)) * 100}%)`,
              borderRadius: '2px', outline: 'none', cursor: 'pointer', margin: '0',
            }}
          />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 1 · Chefchaouen' : 'Chefchaouen'}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 8 · Casablanca' : `${CITIES.length} stops`}
          </span>
        </div>
        {!isUnlocked && (
          <p style={{ marginTop: '14px', marginBottom: '0', textAlign: 'center', fontSize: '12px', color: '#8C8070', fontStyle: 'italic', letterSpacing: '0.2px', lineHeight: '1.5' }}>
            Full route and day-by-day flow available inside
          </p>
        )}
      </div>

      {/* ── Mobile bottom card ────────────────────────────────────────────── */}
      {isMobile && bottomCard && (
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
                Days {bottomCard.days}
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
      `}</style>
    </div>
  );
}
