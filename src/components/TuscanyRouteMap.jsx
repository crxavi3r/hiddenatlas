import { useState, useRef, useEffect, useCallback } from 'react';

// ── Projection ────────────────────────────────────────────────────────────────
// Wider western bounds (9.5) give breathing room for the Tyrrhenian Sea label.
const VW = 800, VH = 620;
const X0 = 9.5, X1 = 12.30, Y0 = 42.30, Y1 = 44.30;

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

// ── Tuscany region outline (simplified clockwise from NW) ─────────────────────
const TUSCANY_COORDS = [
  [9.92, 44.0], [10.0, 44.05], [10.15, 44.04],
  [10.35, 44.1], [10.6, 44.08], [10.85, 44.05],
  [11.1, 44.1], [11.4, 44.08], [11.65, 43.98],
  [11.9, 43.88], [12.1, 43.75], [12.15, 43.55],
  [12.1, 43.35], [11.95, 43.1], [11.85, 42.9],
  [11.7, 42.6], [11.55, 42.48], [11.35, 42.43], [11.1, 42.43],
  [10.9, 42.52], [10.65, 42.75], [10.48, 43.0], [10.28, 43.35],
  [10.1, 43.6], [9.95, 43.78], [9.92, 44.0],
];

// ── Wine region overlays ──────────────────────────────────────────────────────
const CHIANTI_COORDS = [
  [11.1, 43.8], [11.65, 43.8], [11.65, 43.3], [11.1, 43.3],
];
const VAL_DORCIA_COORDS = [
  [11.3, 43.25], [11.95, 43.25], [11.95, 42.75], [11.3, 42.75],
];

const TUSCANY_D   = toSvgPath(TUSCANY_COORDS);
const CHIANTI_D   = toSvgPath(CHIANTI_COORDS);
const VAL_DORCIA_D = toSvgPath(VAL_DORCIA_COORDS);

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

// ── Route stops ───────────────────────────────────────────────────────────────
// Sequence: San Gimignano → Siena → Val d'Orcia → Montepulciano → Cortona →
//           Pitigliano → Saturnia → Montalcino → San Galgano → Volterra →
//           Lucca → Pisa
const CITIES = [
  { id: 'san-gimignano', name: 'San Gimignano', lon: 11.04, lat: 43.47, tier: 1, days: '1',   dayStart: 1, labelDx: -13, labelAnchor: 'end',
    desc: 'Medieval towers rising from the Chianti hills — a perfect first taste of Tuscany' },
  { id: 'siena',         name: 'Siena',         lon: 11.33, lat: 43.32, tier: 1, days: '1–2', dayStart: 1, labelDx:  12, labelAnchor: 'start',
    desc: 'Il Palio city — Piazza del Campo, the Duomo and the city that stood against Florence' },
  { id: 'pienza',        name: "Val d'Orcia",   lon: 11.70, lat: 43.07, tier: 2, days: '3',   dayStart: 3, labelDx:  10, labelAnchor: 'start',
    desc: "Pienza's Renaissance streets and the iconic Val d'Orcia landscape of rolling cypress hills" },
  { id: 'montepulciano', name: 'Montepulciano', lon: 11.78, lat: 43.10, tier: 2, days: '3',   dayStart: 3, labelDx: -10, labelAnchor: 'end',
    desc: 'Hilltop wine town above the Chiana Valley, home to Vino Nobile and medieval piazzas' },
  { id: 'cortona',       name: 'Cortona',       lon: 11.99, lat: 43.27, tier: 1, days: '3–4', dayStart: 3, labelDx: -12, labelAnchor: 'end',
    desc: 'Etruscan city on a high ridge, overlooking Lake Trasimeno and the broad Chiana Valley' },
  { id: 'pitigliano',    name: 'Pitigliano',    lon: 11.67, lat: 42.63, tier: 2, days: '4',   dayStart: 4, labelDx:  10, labelAnchor: 'start',
    desc: 'Tufa cliff city above the Lente gorge — the Little Jerusalem of Maremma' },
  { id: 'saturnia',      name: 'Saturnia',      lon: 11.51, lat: 42.66, tier: 1, days: '4–5', dayStart: 4, labelDx: -12, labelAnchor: 'end',
    desc: 'Natural hot springs in the Maremma, flowing since Roman times into open travertine pools' },
  { id: 'montalcino',    name: 'Montalcino',    lon: 11.49, lat: 43.06, tier: 1, days: '5',   dayStart: 5, labelDx: -13, labelAnchor: 'end',
    desc: 'Fortress town and home of Brunello, one of the greatest red wines in the world' },
  { id: 'san-galgano',   name: 'San Galgano',   lon: 11.17, lat: 43.15, tier: 2, days: '6',   dayStart: 6, labelDx:  10, labelAnchor: 'start',
    desc: 'Roofless Gothic abbey with the legendary sword in the stone on the hilltop chapel' },
  { id: 'volterra',      name: 'Volterra',      lon: 10.86, lat: 43.40, tier: 1, days: '6–7', dayStart: 6, labelDx: -12, labelAnchor: 'end',
    desc: 'Etruscan acropolis on a windswept ridge with alabaster workshops and a Roman theatre' },
  { id: 'lucca',         name: 'Lucca',         lon: 10.50, lat: 43.84, tier: 2, days: '7',   dayStart: 7, labelDx:  12, labelAnchor: 'start',
    desc: 'Intact Renaissance walls and leaning towers in a compact, traffic-free walled city' },
  { id: 'pisa',          name: 'Pisa',          lon: 10.40, lat: 43.72, tier: 1, days: '7',   dayStart: 7, labelDx: -12, labelAnchor: 'end',
    desc: 'The Piazza dei Miracoli and the Leaning Tower — the final landmark of the Tuscan journey' },
];

// Context cities for orientation (not interactive)
const CONTEXT_CITIES = [
  { name: 'Florence', lon: 11.26, lat: 43.77, labelDx:  10, labelAnchor: 'start' },
  { name: 'Arezzo',   lon: 11.88, lat: 43.47, labelDx:  10, labelAnchor: 'start' },
  { name: 'Grosseto', lon: 11.11, lat: 42.77, labelDx: -10, labelAnchor: 'end'   },
];

const ROUTE_LONLAT  = CITIES.map(c => [c.lon, c.lat]);
const ROUTE_PATH_D  = catmullPath(ROUTE_LONLAT, 0.22);

// Cumulative fraction of total route length at each stop (computed from Euclidean distances)
const STOP_FRACTIONS = [0, 0.085, 0.198, 0.228, 0.296, 0.479, 0.521, 0.622, 0.710, 0.814, 0.960, 1.000];

// Stops shown with labels even in locked/preview state
const PREVIEW_LABELED = new Set(['san-gimignano', 'siena', 'montalcino', 'pisa']);

// ── Tier visual config (mirrors MoroccoRouteMap) ──────────────────────────────
const TIER = {
  1: { r: 8,   rActive: 11,  sw: 2.2, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 12,  dFs: 8   },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5, dFs: 7.5 },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function TuscanyRouteMap({ onDaySelect, isUnlocked = true }) {
  const [activeStop, setActiveStop] = useState(0);
  const [animating,  setAnimating]  = useState(true);
  const [hovered,    setHovered]    = useState(null);
  const [isMobile,   setIsMobile]   = useState(false);
  const [bottomCard, setBottomCard] = useState(null);
  const [pathLen,    setPathLen]    = useState(2400);

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

      {/* ── SVG Map ──────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#ADC9D8' }}
        aria-label="Tuscany Wine Roads in 7 Days route map"
      >
        <defs>
          <clipPath id="tuscany-map-clip">
            <rect width={VW} height={VH} />
          </clipPath>
          <filter id="tuscany-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Sea background */}
        <rect width={VW} height={VH} fill="#ADC9D8" />

        {/* Tuscany land + wine region overlays */}
        <g clipPath="url(#tuscany-map-clip)">
          <path d={TUSCANY_D} fill="#D8C9AA" stroke="#B5A48A" strokeWidth="0.8" />
          <path d={CHIANTI_D}    fill="#8C2D33" fillOpacity="0.10" stroke="none" />
          <path d={VAL_DORCIA_D} fill="#B5862A" fillOpacity="0.10" stroke="none" />
        </g>

        {/* Sea label */}
        {(() => {
          const [x, y] = proj(9.65, 43.2);
          return (
            <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontSize="7.5" fontFamily="Helvetica, sans-serif" fontStyle="italic"
              fill="#4A7A8A" opacity="0.75" transform={`rotate(-75, ${x}, ${y})`}>
              Tyrrhenian Sea
            </text>
          );
        })()}

        {/* Wine region labels */}
        {(() => { const [x, y] = proj(11.4, 43.57); return (
          <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="7" fontFamily="Helvetica, sans-serif" fontStyle="italic" fill="#8C2D33" opacity="0.65">
            Chianti
          </text>
        ); })()}
        {(() => { const [x, y] = proj(11.62, 43.02); return (
          <text x={x} y={y} textAnchor="middle" dominantBaseline="middle"
            fontSize="7" fontFamily="Helvetica, sans-serif" fontStyle="italic" fill="#7A5A1A" opacity="0.65">
            {"Val d'Orcia"}
          </text>
        ); })()}

        {/* Context cities (not on route — orientation only) */}
        {CONTEXT_CITIES.map(ctx => {
          const [cx, cy] = proj(ctx.lon, ctx.lat);
          return (
            <g key={ctx.name}>
              <circle cx={cx} cy={cy} r={3.5} fill="#C5BAA8" stroke="#9A8E7A" strokeWidth="0.8" opacity="0.7" />
              <text x={cx + ctx.labelDx} y={cy - 1} textAnchor={ctx.labelAnchor} dominantBaseline="auto"
                fontSize="8" fontFamily="Helvetica, sans-serif" fill="#9A9080" opacity="0.8"
                style={{ paintOrder: 'stroke', stroke: '#D8C9AA', strokeWidth: '3', strokeLinejoin: 'round' }}>
                {ctx.name}
              </text>
            </g>
          );
        })}

        {/* Route ghost (faint full path for reference) */}
        <path d={ROUTE_PATH_D} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" clipPath="url(#tuscany-map-clip)" />

        {/* Route reveal (animated) */}
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
          clipPath="url(#tuscany-map-clip)"
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
                filter={city.tier === 1 ? 'url(#tuscany-node-shadow)' : undefined}
                style={{ transition: 'r 0.3s ease' }}
              />
              {showLabel && (
                <text
                  x={cx + city.labelDx} y={cy - 1}
                  textAnchor={city.labelAnchor} dominantBaseline="auto"
                  fontSize={cfg.lFs} fontFamily="Georgia, serif"
                  fontWeight={city.tier === 1 ? '800' : '500'}
                  fill={isFuture ? '#9A9080' : city.tier === 1 ? '#131210' : '#1C1A16'}
                  style={{ paintOrder: 'stroke', stroke: '#D8C9AA', strokeWidth: '4', strokeLinejoin: 'round' }}
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
                  style={{ paintOrder: 'stroke', stroke: '#D8C9AA', strokeWidth: '2.5' }}
                >
                  {`Day ${city.days}`}
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
          <g transform="translate(12, 468)">
            <rect x="-4" y="-8" width="148" height="72" rx="4"
              fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
            <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
            <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Major stop</text>
            <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
            <text x="24" y="28" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Route stop</text>
            <text x="4"  y="52" fontSize="6.5" fontFamily="Helvetica, sans-serif" fill="#9A9080" fontStyle="italic">Large = primary stop</text>
          </g>
        )}
      </svg>

      {/* ── Desktop tooltip ───────────────────────────────────────────────── */}
      {hovered !== null && !isMobile && (() => {
        const city = CITIES[hovered];
        const [cx, cy] = proj(city.lon, city.lat);
        const pos = getTooltipPos(cx, cy);
        const onRight = city.labelAnchor === 'start';
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
                Day {city.days}
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

      {/* ── Journey Progress ──────────────────────────────────────────────── */}
      <div style={{ marginTop: '20px', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', color: '#7C7060', textTransform: 'uppercase' }}>
            Journey Progress
          </span>
          {isUnlocked && (
            <span style={{ fontSize: '12px', color: '#1B6B65', fontWeight: '600' }}>
              {`${CITIES[activeStop].name} · Day ${CITIES[activeStop].days}`}
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
            {isUnlocked ? 'Day 1 · San Gimignano' : 'San Gimignano'}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 7 · Pisa' : 'Pisa'}
          </span>
        </div>
      </div>

      {/* ── Stop preview card ─────────────────────────────────────────────── */}
      <div key={CITIES[activeStop].id} style={{
        marginTop: '16px', background: 'white', borderRadius: '8px',
        padding: '16px 20px', border: '1px solid #E8E3DA',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px',
        animation: 'tuscany-card 0.3s ease forwards',
      }}>
        <div>
          {isUnlocked && (
            <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '3px' }}>
              Day {CITIES[activeStop].days}
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
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 24px 32px', boxShadow: '0 -8px 40px rgba(28,26,22,0.15)', animation: 'slideUp 0.28s ease' }}>
            <div style={{ width: '36px', height: '3px', background: '#E8E3DA', borderRadius: '2px', margin: '0 auto 18px' }} />
            <p style={{ fontSize: '18px', fontWeight: '700', color: '#1C1A16', margin: '0 0 4px', fontFamily: "'Playfair Display', Georgia, serif" }}>
              {bottomCard.name}
            </p>
            {isUnlocked && (
              <p style={{ fontSize: '12px', color: '#C9A96E', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 10px', textTransform: 'uppercase' }}>
                Day {bottomCard.days}
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
        @keyframes tuscany-card { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
