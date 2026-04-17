import { useState, useRef, useEffect, useCallback } from 'react';

// ── Projection ────────────────────────────────────────────────────────────────
const VW = 660, VH = 800;
const X0 = 117.8, X1 = 123.0, Y0 = 9.0, Y1 = 15.5;

const proj = (lon, lat) => [
  (lon - X0) / (X1 - X0) * VW,
  (1 - (lat - Y0) / (Y1 - Y0)) * VH,
];

// ── Island outlines ───────────────────────────────────────────────────────────
function toSvgPath(coords) {
  return coords.map(([lon, lat], i) => {
    const [x, y] = proj(lon, lat);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

// Southern Luzon / Manila area (simplified)
const LUZON_SOUTH = [
  [120.0, 15.4], [120.5, 15.5], [121.2, 15.3], [122.0, 14.8],
  [122.5, 14.2], [122.0, 13.5], [121.2, 13.0], [120.5, 13.3],
  [120.0, 13.8], [119.8, 14.3], [120.0, 15.4],
];

// Palawan island (long thin NE-SW strip)
const PALAWAN = [
  [119.2, 11.4], [119.5, 11.45],[119.75, 11.1],[119.6, 10.6],
  [119.3, 10.0], [119.0, 9.4],  [118.7, 9.0],  [118.3, 9.0],
  [118.5, 9.5],  [118.8, 10.2], [119.0, 10.8], [119.2, 11.4],
];

// Busuanga island — Coron area (Calamian group)
const BUSUANGA = [
  [119.7, 12.35],[120.3, 12.3], [120.75, 12.1],[120.85, 11.8],
  [120.5, 11.6], [120.0, 11.7], [119.7, 11.9], [119.7, 12.35],
];

// Panay island (near Boracay)
const PANAY = [
  [121.2, 12.5], [122.4, 11.8], [122.7, 11.1],
  [122.2, 10.5], [121.5, 10.7], [121.0, 11.5], [121.2, 12.5],
];

// Mindoro island (geographic context between Luzon and Palawan)
const MINDORO = [
  [120.7, 13.4], [121.5, 13.0], [121.5, 12.4],
  [121.0, 12.2], [120.3, 12.6], [120.3, 13.1], [120.7, 13.4],
];

const LUZON_D   = toSvgPath(LUZON_SOUTH);
const PALAWAN_D = toSvgPath(PALAWAN);
const BUSUANGA_D= toSvgPath(BUSUANGA);
const PANAY_D   = toSvgPath(PANAY);
const MINDORO_D = toSvgPath(MINDORO);

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
// All five are key island stops (base camps of the itinerary).
// tier:1 = large gold dot; tier:2 = small teal dot (route stop — not used here).
// San Vicente: fixed to west-coast Palawan coordinates (lon 119.179, not 119.49).
// Coron: promoted to tier:1 — it is a multi-day base, not a waypoint.
const CITIES = [
  { id: 'manila',       name: 'Manila',      lon: 120.97,  lat: 14.60,   tier: 1, days: '1',    dayStart: 1,  desc: 'Capital city and gateway to the Philippine archipelago', labelDx: 14,  labelAnchor: 'start' },
  { id: 'san-vicente',  name: 'San Vicente', lon: 119.179, lat: 10.4125, tier: 1, days: '2–3',  dayStart: 2,  desc: 'Long Beach — 14 kilometres of undeveloped Pacific sand',   labelDx: 14,  labelAnchor: 'start' },
  { id: 'el-nido',      name: 'El Nido',     lon: 119.41,  lat: 11.17,   tier: 1, days: '4–8',  dayStart: 4,  desc: 'Limestone karst towers and hidden lagoons of Bacuit Bay', labelDx: -12, labelAnchor: 'end'   },
  { id: 'coron',        name: 'Coron',       lon: 120.20,  lat: 11.99,   tier: 1, days: '9–11', dayStart: 9,  desc: 'WWII shipwrecks and the cleanest lake in Asia',            labelDx: 14,  labelAnchor: 'start' },
  { id: 'boracay',      name: 'Boracay',     lon: 121.93,  lat: 11.96,   tier: 1, days: '12–15',dayStart: 12, desc: 'White Beach and the quiet northern shore',                  labelDx: -12, labelAnchor: 'end'   },
];

// Route loops back to Manila — straight polyline avoids Catmull-Rom loop at San Vicente
// (tangent dips south because both neighbours are north of San Vicente)
const ROUTE_LONLAT = [...CITIES.map(c => [c.lon, c.lat]), [120.97, 14.60]];
const ROUTE_PATH_D = ROUTE_LONLAT.map((ll, i) => {
  const [x, y] = proj(ll[0], ll[1]);
  return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
}).join(' ');

// Cumulative straight-line fractions along the full loop (recalculated after coord fix)
// Manila→SanVicente≈563, →ElNido≈97, →Coron≈143, →Boracay≈219, →Manila≈347 (total≈1369)
const STOP_FRACTIONS = [0, 0.41, 0.48, 0.59, 0.75];

// All five are key stops — all show labels in preview/teaser state
const PREVIEW_LABELED = new Set(['manila', 'san-vicente', 'el-nido', 'coron', 'boracay']);

// ── Tier visual config ────────────────────────────────────────────────────────
const TIER = {
  1: { r: 8,   rActive: 11,  sw: 2.2, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 12,  dFs: 8,   shadow: true },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5, dFs: 7.5               },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function PhilippinesRouteMap({ onDaySelect, isUnlocked = true }) {
  const [activeStop, setActiveStop] = useState(0);
  const [animating, setAnimating]   = useState(true);
  const [hovered, setHovered]       = useState(null);
  const [isMobile, setIsMobile]     = useState(false);
  const [bottomCard, setBottomCard] = useState(null);
  const [pathLen, setPathLen]       = useState(2600);

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
    }, 550);
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
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#C4DAE8' }}
        aria-label="Philippines Island Journey route map"
      >
        <defs>
          <clipPath id="ph-map-clip">
            <rect width={VW} height={VH} />
          </clipPath>
          <filter id="ph-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Ocean */}
        <rect width={VW} height={VH} fill="#C4DAE8" />

        {/* Islands */}
        <g clipPath="url(#ph-map-clip)">
          <path d={LUZON_D}    fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.8" />
          <path d={MINDORO_D}  fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.7" fillOpacity="0.95" />
          <path d={PALAWAN_D}  fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.8" />
          <path d={BUSUANGA_D} fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.7" fillOpacity="0.95" />
          <path d={PANAY_D}    fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.7" fillOpacity="0.92" />
        </g>

        {/* Water labels */}
        {[
          ['South China Sea', 118.4, 12.8,  0],
          ['Sulu Sea',        119.8, 9.6,   0],
          ['Sibuyan Sea',     122.2, 12.8,  0],
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
        <path d={ROUTE_PATH_D} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" clipPath="url(#ph-map-clip)" />

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
          clipPath="url(#ph-map-clip)"
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
                filter={city.tier === 1 ? 'url(#ph-node-shadow)' : undefined}
                style={{ transition: 'r 0.3s ease' }}
              />
              {showLabel && (
                <text
                  x={cx + city.labelDx} y={cy - 1}
                  textAnchor={city.labelAnchor} dominantBaseline="auto"
                  fontSize={cfg.lFs} fontFamily="Georgia, serif"
                  fontWeight={city.tier === 1 ? '800' : '500'}
                  fill={isFuture ? '#9A9080' : city.tier === 1 ? '#131210' : '#1C1A16'}
                  style={{ paintOrder: 'stroke', stroke: '#C4DAE8', strokeWidth: '4', strokeLinejoin: 'round' }}
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
                  style={{ paintOrder: 'stroke', stroke: '#C4DAE8', strokeWidth: '2.5' }}
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
          <g transform="translate(12, 638)">
            <rect x="-4" y="-8" width="148" height="72" rx="4"
              fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
            <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
            <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Key island stop</text>
            <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
            <text x="24" y="28" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Route stop</text>
            <text x="4"  y="52" fontSize="6.5" fontFamily="Helvetica, sans-serif" fill="#9A9080" fontStyle="italic">Lines show sea crossings</text>
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
          {isUnlocked && (
            <span style={{ fontSize: '12px', color: '#1B6B65', fontWeight: '600' }}>
              {`${CITIES[activeStop].name} · Days ${CITIES[activeStop].days}`}
            </span>
          )}
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
            {isUnlocked ? 'Day 1 · Manila' : 'Manila'}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Days 12–15 · Boracay' : 'Boracay'}
          </span>
        </div>
      </div>

      {/* ── Stop preview card ─────────────────────────────────────────────── */}
      <div key={CITIES[activeStop].id} style={{
        marginTop: '16px', background: 'white', borderRadius: '8px',
        padding: '16px 20px', border: '1px solid #E8E3DA',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px',
        animation: 'ph-card 0.3s ease forwards',
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
        @keyframes ph-card {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
