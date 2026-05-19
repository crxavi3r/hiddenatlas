import { useState, useRef, useEffect, useCallback } from 'react';

// ── Projection ─────────────────────────────────────────────────────────────────
// Dalmatian coast bounding box: lon 15.7–18.5°E, lat 42.2–44.1°N
const VW = 800, VH = 543;
const X0 = 15.7, X1 = 18.5, Y0 = 42.2, Y1 = 44.1;

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

// ── Land polygons ──────────────────────────────────────────────────────────────

// Mainland Dalmatian coast: coast runs NW–SE; land fills upper-right of map
const MAINLAND = [
  [16.15, 43.58], [16.30, 43.55], [16.44, 43.51],
  [16.70, 43.44], [17.02, 43.30], [17.43, 43.05],
  [17.60, 42.93], [17.85, 42.78], [18.09, 42.66],
  [18.22, 42.57],
  [18.5, 42.2], [18.5, 44.1], [15.7, 44.1], [15.7, 43.85],
  [15.85, 43.72], [16.05, 43.63], [16.15, 43.58],
];

// Brač (large island north of Hvar)
const BRAC = [
  [16.25, 43.37], [16.50, 43.42], [16.80, 43.40],
  [17.02, 43.32], [16.95, 43.27], [16.65, 43.27],
  [16.35, 43.30], [16.25, 43.37],
];

// Hvar (long narrow island, runs E–W)
const HVAR_ISLAND = [
  [16.07, 43.21], [16.25, 43.22], [16.44, 43.21],
  [16.70, 43.18], [17.00, 43.15], [17.20, 43.09],
  [17.44, 43.02], [17.44, 42.99], [17.20, 43.05],
  [16.95, 43.12], [16.65, 43.15], [16.44, 43.16],
  [16.20, 43.17], [16.07, 43.19], [16.07, 43.21],
];

// Vis
const VIS_ISLAND = [
  [15.97, 43.10], [16.06, 43.14], [16.22, 43.11],
  [16.26, 43.05], [16.19, 43.01], [16.07, 43.03],
  [15.97, 43.07], [15.97, 43.10],
];

// Korčula
const KORCUL = [
  [16.70, 42.97], [16.88, 43.02], [17.12, 43.02],
  [17.40, 42.93], [17.43, 42.88], [17.22, 42.88],
  [17.02, 42.93], [16.80, 42.93], [16.70, 42.97],
];

// Mljet
const MLJET = [
  [17.42, 42.79], [17.52, 42.83], [17.66, 42.79],
  [17.72, 42.74], [17.58, 42.72], [17.44, 42.75], [17.42, 42.79],
];

const MAINLAND_D    = toSvgPath(MAINLAND);
const BRAC_D        = toSvgPath(BRAC);
const HVAR_ISLAND_D = toSvgPath(HVAR_ISLAND);
const VIS_ISLAND_D  = toSvgPath(VIS_ISLAND);
const KORCUL_D      = toSvgPath(KORCUL);
const MLJET_D       = toSvgPath(MLJET);

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

// ── City data — route: Dubrovnik → Hvar → Pakleni → Vis → Split ───────────────
const CITIES = [
  {
    id: 'dubrovnik', name: 'Dubrovnik', lon: 18.09, lat: 42.65, tier: 1,
    days: '1–2', dayStart: 1,
    desc: 'The Pearl of the Adriatic: a perfectly preserved medieval city rising from the sea',
    labelDx: 12, labelAnchor: 'start',
  },
  {
    id: 'hvar', name: 'Hvar', lon: 16.44, lat: 43.17, tier: 1,
    days: '3–4', dayStart: 3,
    desc: 'Lavender fields, Venetian piazzas and Dalmatian light on Croatia\'s most celebrated island',
    labelDx: 12, labelAnchor: 'start',
  },
  {
    id: 'pakleni', name: 'Pakleni Islands', lon: 16.35, lat: 43.13, tier: 2,
    days: '3–4', dayStart: 3,
    desc: 'A hidden archipelago of pine-covered islands and secluded coves, minutes from Hvar',
    labelDx: -13, labelAnchor: 'end',
  },
  {
    id: 'vis', name: 'Vis / Komiža', lon: 16.09, lat: 43.06, tier: 1,
    days: '5–6', dayStart: 5,
    desc: 'The most remote island on the Dalmatian coast: closed to tourists until 1989',
    labelDx: -13, labelAnchor: 'end',
  },
  {
    id: 'split', name: 'Split', lon: 16.44, lat: 43.51, tier: 1,
    days: '7', dayStart: 7,
    desc: 'Diocletian\'s Palace: a Roman emperor\'s retirement complex turned living city',
    labelDx: -13, labelAnchor: 'end',
  },
];

const ROUTE_LONLAT  = CITIES.map(c => [c.lon, c.lat]);
const ROUTE_PATH_D  = catmullPath(ROUTE_LONLAT, 0.20);

// Cumulative route fractions (Dubrovnik → Hvar ≈ 145km, Pakleni ≈ 5km, Vis ≈ 35km, Split ≈ 45km)
const STOP_FRACTIONS = [0, 0.63, 0.65, 0.80, 1.0];

// All stops visible in preview (short route, no paywall on map labels)
const PREVIEW_LABELED = new Set(CITIES.map(c => c.id));

const TIER = {
  1: { r: 8,   rActive: 11,  sw: 2.2, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 12,  dFs: 8   },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5, dFs: 7.5 },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function CroatiaRouteMap({ onDaySelect, isUnlocked = true }) {
  const [activeStop, setActiveStop] = useState(0);
  const [animating, setAnimating]   = useState(true);
  const [hovered, setHovered]       = useState(null);
  const [isMobile, setIsMobile]     = useState(false);
  const [bottomCard, setBottomCard] = useState(null);
  const [pathLen, setPathLen]       = useState(2800);

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
    }, 520);
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
        aria-label="Croatia by Sea route map"
      >
        <defs>
          <clipPath id="croatia-map-clip">
            <rect width={VW} height={VH} />
          </clipPath>
          <filter id="croatia-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Adriatic Sea */}
        <rect width={VW} height={VH} fill="#BDD5E0" />

        {/* Land masses */}
        <g clipPath="url(#croatia-map-clip)">
          <path d={MAINLAND_D}    fill="#D8CBAA" stroke="#B5A48A" strokeWidth="0.8" />
          <path d={BRAC_D}        fill="#D4C8A0" stroke="#B0A080" strokeWidth="0.7" />
          <path d={HVAR_ISLAND_D} fill="#D4C8A0" stroke="#B0A080" strokeWidth="0.7" />
          <path d={VIS_ISLAND_D}  fill="#D4C8A0" stroke="#B0A080" strokeWidth="0.7" />
          <path d={KORCUL_D}      fill="#D4C8A0" stroke="#B0A080" strokeWidth="0.7" />
          <path d={MLJET_D}       fill="#D4C8A0" stroke="#B0A080" strokeWidth="0.7" />
        </g>

        {/* Sea and region labels */}
        {[
          ['Adriatic Sea',  16.9, 42.45, 9,   true ],
          ['DALMATIA',      17.5, 43.78, 8,   false],
          ['Brač',          16.64, 43.33, 7,  false],
          ['Hvar',          16.90, 43.10, 6.5,false],
          ['Vis',           16.11, 43.07, 6.5,false],
          ['Korčula',       17.10, 42.94, 6.5,false],
          ['Mljet',         17.57, 42.76, 6,  false],
        ].map(([label, lon, lat, fs, italic]) => {
          const [x, y] = proj(lon, lat);
          return (
            <text key={label} x={x} y={y} textAnchor="middle" dominantBaseline="middle"
              fontSize={fs} fontFamily="Helvetica, sans-serif"
              fontStyle={italic ? 'italic' : 'normal'}
              fill={italic ? '#5A7A88' : '#7A6C50'} opacity={italic ? '0.75' : '0.6'}>
              {label}
            </text>
          );
        })}

        {/* Route ghost */}
        <path d={ROUTE_PATH_D} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" clipPath="url(#croatia-map-clip)" />

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
              ? 'stroke-dashoffset 0.6s cubic-bezier(0.4, 0, 0.2, 1)'
              : 'stroke-dashoffset 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          clipPath="url(#croatia-map-clip)"
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
                filter={city.tier === 1 ? 'url(#croatia-node-shadow)' : undefined}
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
        {isUnlocked && (
          <g transform="translate(12, 374)">
            <rect x="-4" y="-8" width="148" height="72" rx="4"
              fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
            <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
            <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Major island stop</text>
            <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
            <text x="24" y="28" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Anchorage</text>
            <text x="4"  y="52" fontSize="6.5" fontFamily="Helvetica, sans-serif" fill="#9A9080" fontStyle="italic">Sailing NW along the Dalmatian coast</text>
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

      {/* ── Day Slider ───────────────────────────────────────────────────────── */}
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
            {isUnlocked ? 'Day 1 · Dubrovnik' : 'Dubrovnik'}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 7 · Split' : 'Split'}
          </span>
        </div>
      </div>

      {/* ── Stop preview card ────────────────────────────────────────────────── */}
      <div key={CITIES[activeStop].id} style={{
        marginTop: '16px', background: 'white', borderRadius: '8px',
        padding: '16px 20px', border: '1px solid #E8E3DA',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px',
        animation: 'croatia-card 0.3s ease forwards',
      }}>
        <div>
          {isUnlocked && (
            <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '3px' }}>
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
        @keyframes croatia-card { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
