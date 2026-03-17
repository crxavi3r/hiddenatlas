import { useState, useRef, useEffect, useCallback } from 'react';

// ── Projection ────────────────────────────────────────────────────────────────
const VW = 900, VH = 607;
const X0 = 132.0, X1 = 141.8, Y0 = 32.6, Y1 = 38.0;

const proj = (lon, lat) => [
  (lon - X0) / (X1 - X0) * VW,
  (1 - (lat - Y0) / (Y1 - Y0)) * VH,
];

// ── Japan island outlines ─────────────────────────────────────────────────────
function toSvgPath(coords) {
  return coords.map(([lon, lat], i) => {
    const [x, y] = proj(lon, lat);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ') + ' Z';
}

const HONSHU = [[140.8,41.5],[141.3,41.0],[141.5,40.5],[141.5,39.5],[141.8,38.3],[141.3,37.5],[141.0,36.9],[141.0,36.0],[141.0,35.7],[140.8,35.1],[140.3,34.9],[139.8,34.9],[139.7,35.1],[139.4,35.2],[139.1,35.2],[138.9,35.0],[138.7,34.8],[138.6,34.6],[138.4,34.7],[138.2,34.8],[137.8,34.7],[137.4,34.7],[137.1,34.7],[136.9,34.5],[136.7,34.3],[137.0,33.8],[136.8,33.5],[136.4,33.4],[136.0,33.4],[135.7,33.5],[135.4,33.5],[135.1,33.8],[134.8,34.0],[135.0,34.4],[135.2,34.6],[135.0,34.8],[134.7,34.8],[134.5,34.9],[134.2,34.8],[133.9,34.7],[133.5,34.5],[133.1,34.4],[132.7,34.5],[132.3,34.4],[131.8,34.1],[130.9,33.9],[130.8,34.1],[131.1,34.5],[131.5,34.9],[131.9,35.1],[132.3,35.3],[132.6,35.5],[132.9,35.5],[133.2,35.5],[133.6,35.5],[133.9,35.5],[134.3,35.5],[134.6,35.5],[134.9,35.6],[135.2,35.6],[135.4,35.8],[135.6,35.9],[136.0,35.8],[136.2,35.8],[136.5,36.2],[136.7,36.5],[136.9,36.8],[137.1,37.3],[137.3,37.5],[137.6,37.4],[138.0,37.5],[138.5,37.5],[138.8,37.7],[139.0,38.0],[139.4,38.3],[139.8,38.6],[140.0,39.3],[140.3,40.0],[140.5,40.7],[140.8,41.5]];
const SHIKOKU = [[132.0,34.1],[132.5,34.3],[133.0,34.3],[133.5,34.2],[134.0,34.2],[134.7,34.1],[135.2,33.8],[134.2,33.2],[133.5,33.0],[132.7,32.8],[132.4,33.1],[132.1,33.5],[132.0,34.1]];
const KYUSHU  = [[130.9,33.9],[131.2,33.5],[131.5,33.2],[131.7,32.9],[131.3,32.8],[130.8,32.9],[130.4,33.1],[130.2,33.4],[130.4,33.7],[130.7,33.9],[130.9,33.9]];
const AWAJI   = [[134.9,34.7],[135.1,34.8],[135.2,34.6],[135.3,34.3],[135.1,34.2],[134.9,34.3],[134.8,34.5],[134.9,34.7]];

const HONSHU_D  = toSvgPath(HONSHU);
const SHIKOKU_D = toSvgPath(SHIKOKU);
const KYUSHU_D  = toSvgPath(KYUSHU);
const AWAJI_D   = toSvgPath(AWAJI);

// ── Smooth Catmull-Rom route path ─────────────────────────────────────────────
function catmullPath(lonlats, tension = 0.38) {
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
// labelDx: positive = label right of marker, negative = label left
const CITIES = [
  { id: 'tokyo',       name: 'Tokyo',        lon: 139.69, lat: 35.68, tier: 1, days: '1–3',   dayStart: 1,  desc: 'Historic capital and gateway to Japan',                  labelDx: 14,  labelAnchor: 'start' },
  { id: 'kanazawa',    name: 'Kanazawa',     lon: 136.63, lat: 36.56, tier: 1, days: '4–5',   dayStart: 4,  desc: 'Edo-era streets and samurai culture',                    labelDx: -15, labelAnchor: 'end'   },
  { id: 'shirakawago', name: 'Shirakawa-go', lon: 136.91, lat: 36.26, tier: 2, days: '6',     dayStart: 6,  desc: 'UNESCO village of straw-roofed farmhouses',              labelDx: 12,  labelAnchor: 'start' },
  { id: 'takayama',    name: 'Takayama',     lon: 137.25, lat: 36.14, tier: 2, days: '7–8',   dayStart: 7,  desc: 'Preserved merchant town in the Japanese Alps',           labelDx: 12,  labelAnchor: 'start' },
  { id: 'kyoto',       name: 'Kyoto',        lon: 135.77, lat: 35.01, tier: 1, days: '9–12',  dayStart: 9,  desc: 'Temple city and cultural heart of Japan',                labelDx: -15, labelAnchor: 'end'   },
  { id: 'osaka',       name: 'Osaka',        lon: 135.50, lat: 34.69, tier: 1, days: '13',    dayStart: 13, desc: 'Street food capital and vibrant urban soul',             labelDx: -15, labelAnchor: 'end'   },
  { id: 'koyasan',     name: 'Kōyasan',      lon: 135.59, lat: 34.21, tier: 2, days: '14',    dayStart: 14, desc: 'Sacred mountain monastery complex',                      labelDx: 12,  labelAnchor: 'start' },
  { id: 'himeji',      name: 'Himeji',       lon: 134.69, lat: 34.82, tier: 3, days: '15',    dayStart: 15, desc: "Japan's finest surviving feudal castle",                 labelDx: 12,  labelAnchor: 'start' },
  { id: 'okayama',     name: 'Okayama',      lon: 133.93, lat: 34.66, tier: 3, days: '16',    dayStart: 16, desc: 'Garden city and gateway to the art island',              labelDx: 14,  labelAnchor: 'start' },
  { id: 'kurashiki',   name: 'Kurashiki',    lon: 133.77, lat: 34.58, tier: 3, days: '16',    dayStart: 16, desc: 'White-walled canal district of art and craft',           labelDx: -12, labelAnchor: 'end'   },
  { id: 'hakone',      name: 'Hakone',       lon: 139.02, lat: 35.23, tier: 2, days: '17',    dayStart: 17, desc: 'Mountain retreat with views of Mount Fuji',              labelDx: 14,  labelAnchor: 'start' },
];

const NARA = { id: 'nara', name: 'Nara', lon: 135.84, lat: 34.68, tier: 0, days: 'Day trip', dayStart: null, desc: 'Ancient capital with sacred deer and great temples', labelDx: 9, labelAnchor: 'start' };

const ROUTE_LONLAT = [...CITIES.map(c => [c.lon, c.lat]), [139.69, 35.68]];
// tension 0.20: deliberately minimal curves — route reads as designed, not generated
const ROUTE_PATH_D = catmullPath(ROUTE_LONLAT, 0.20);

// Approximate stop fractions (geographic distances along route)
const STOP_FRACTIONS = [0, 0.209, 0.239, 0.263, 0.394, 0.425, 0.463, 0.539, 0.590, 0.602, 0.944];

// ── Preview mode: cities shown with full label in the locked/teaser state ─────
// Tokyo (start) + Kyoto + Osaka (two anchors) + Hakone (near-end) = 4 cities.
// All others are rendered as subtle dots only — no name, no day range, no hit area.
const PREVIEW_LABELED = new Set(['tokyo', 'kyoto', 'osaka', 'hakone']);

// ── Tier visual config ────────────────────────────────────────────────────────
// Tier 1 (Tokyo, Kanazawa, Kyoto, Osaka): larger, bolder — clear primary anchors
// Tier 2 (Shirakawa-go, Takayama, Kōyasan, Hakone): mid-weight — notable stops
// Tier 3 (Himeji, Okayama, Kurashiki): compact — secondary waypoints
const TIER = {
  1: { r: 8,   rActive: 11,   sw: 2.2, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 12,   dFs: 8,   shadow: true  },
  2: { r: 4.5, rActive: 6.5,  sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5,  dFs: 7.5              },
  3: { r: 3,   rActive: 4.5,  sw: 1.2, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 7.8,  dFs: 6.5              },
  0: { r: 2.5, rActive: 3.5,  sw: 1.0, fill: '#EAE4DA', edge: '#8A9E9B', halo: '#8A9E9B', lFs: 7.5,  dFs: 6.0              },
};

// ── Nara projected positions ───────────────────────────────────────────────────
const [NX, NY] = proj(NARA.lon, NARA.lat);
const [KX, KY] = proj(CITIES[4].lon, CITIES[4].lat); // Kyoto

// ── Component ─────────────────────────────────────────────────────────────────
export default function JapanRouteMap({ onDaySelect, isUnlocked = true }) {
  const [activeStop, setActiveStop] = useState(0);
  const [animating, setAnimating]   = useState(true);
  const [hovered, setHovered]       = useState(null);
  const [isMobile, setIsMobile]     = useState(false);
  const [bottomCard, setBottomCard] = useState(null);
  const [pathLen, setPathLen]       = useState(3200); // reasonable fallback

  const routeRef    = useRef(null);
  const svgRef      = useRef(null);
  const containerRef = useRef(null);

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Get real path length after mount
  useEffect(() => {
    if (routeRef.current) {
      const len = routeRef.current.getTotalLength();
      if (len > 0) setPathLen(len);
    }
  }, []);

  // Auto-animate route on load (once)
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
    if (isMobile) {
      setBottomCard(prev => prev?.id === city.id ? null : city);
    } else if (isUnlocked && onDaySelect && city.dayStart) {
      onDaySelect(city.dayStart);
    }
  }, [isMobile, onDaySelect, isUnlocked]);

  // Get tooltip screen position relative to container
  const getTooltipPos = (svgX, svgY) => {
    if (!svgRef.current || !containerRef.current) return { left: 0, top: 0 };
    const svgR = svgRef.current.getBoundingClientRect();
    const conR = containerRef.current.getBoundingClientRect();
    const sx = svgR.width / VW;
    const sy = svgR.height / VH;
    return {
      left: svgR.left - conR.left + svgX * sx,
      top:  svgR.top  - conR.top  + svgY * sy,
    };
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── SVG Map ──────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#C8DCE8' }}
        aria-label="Japan Grand Cultural Journey route map"
      >
        <defs>
          <clipPath id="japan-map-clip">
            <rect width={VW} height={VH} />
          </clipPath>
          <filter id="label-bg" x="-10%" y="-20%" width="120%" height="140%">
            <feFlood floodColor="#F5F0E8" floodOpacity="0.85" result="bg" />
            <feComposite in="bg" in2="SourceGraphic" operator="over" />
          </filter>
          {/* Subtle depth for primary city nodes only */}
          <filter id="node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Ocean */}
        <rect width={VW} height={VH} fill="#C8DCE8" />

        {/* Land */}
        <g clipPath="url(#japan-map-clip)">
          <path d={HONSHU_D}  fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.8" />
          <path d={SHIKOKU_D} fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.7" fillOpacity="0.95" />
          <path d={KYUSHU_D}  fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.7" fillOpacity="0.92" />
          <path d={AWAJI_D}   fill="#DDD4BE" stroke="#B0A48A" strokeWidth="0.6" fillOpacity="0.88" />
        </g>

        {/* Water labels */}
        {[
          ['Sea of Japan',     133.5, 36.6, -18],
          ['Pacific Ocean',    138.8, 33.2,   0],
          ['Seto Inland Sea',  133.3, 33.8,  -3],
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

        {/* Route ghost (full path, very faint — structural reference) */}
        <path d={ROUTE_PATH_D} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" clipPath="url(#japan-map-clip)" />

        {/* Route reveal (animated stroke-dashoffset) */}
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
          clipPath="url(#japan-map-clip)"
        />

        {/* Nara day trip — appears when Kyoto (stop 4) is active */}
        <g opacity={activeStop >= 4 ? 0.80 : 0} style={{ transition: 'opacity 0.6s ease' }}>
          <line x1={KX} y1={KY} x2={NX} y2={NY}
            stroke="#7A9490" strokeWidth="1.2" strokeDasharray="4,5" />
          {/* Nara dot */}
          <circle cx={NX} cy={NY} r={TIER[0].r} fill={TIER[0].fill} stroke={TIER[0].edge} strokeWidth={TIER[0].sw} />
          <text x={NX + NARA.labelDx} y={NY} textAnchor={NARA.labelAnchor} dominantBaseline="middle"
            fontSize="7.5" fontFamily="Georgia, serif" fill="#7C7060"
            style={{ paintOrder: 'stroke', stroke: '#F5F0E8', strokeWidth: '2.5' }}>
            Nara
          </text>
          <text x={NX + NARA.labelDx} y={NY + 10} textAnchor={NARA.labelAnchor}
            fontSize="6.5" fontFamily="Helvetica, sans-serif" fill="#9A9080" fontStyle="italic"
            style={{ paintOrder: 'stroke', stroke: '#F5F0E8', strokeWidth: '2' }}>
            day trip
          </text>
        </g>

        {/* City markers */}
        {CITIES.map((city, i) => {
          const [cx, cy] = proj(city.lon, city.lat);
          const isActive  = i === activeStop;
          const isFuture  = i > activeStop;
          const cfg       = TIER[city.tier];
          const r         = isActive ? cfg.rActive : cfg.r;

          // In preview, only PREVIEW_LABELED cities get full treatment
          const showLabel = isUnlocked || PREVIEW_LABELED.has(city.id);

          // Opacity: preview-hidden cities are faint static dots;
          // labeled cities follow the normal active/past/future logic
          const opacity = !showLabel ? 0.38 : (isFuture ? 0.28 : 1);

          return (
            <g key={city.id} opacity={opacity} style={{ transition: 'opacity 0.4s ease', cursor: showLabel ? 'pointer' : 'default' }}>
              {/* Active halo — only for labeled cities */}
              {isActive && showLabel && (
                <circle cx={cx} cy={cy} r={r * 2.4} fill={cfg.halo} opacity="0.15"
                  style={{ transition: 'r 0.3s ease' }} />
              )}
              {/* Outer ring — reduced for tier 3 to keep Kansai area clean */}
              <circle cx={cx} cy={cy} r={r + 3} fill="none"
                stroke={cfg.edge} strokeWidth="0.8"
                opacity={isActive && showLabel ? 0.45 : city.tier <= 2 ? 0.20 : 0.12} />
              {/* Main dot — tier 1 gets subtle depth shadow */}
              <circle cx={cx} cy={cy} r={r}
                fill={cfg.fill} stroke={cfg.edge} strokeWidth={cfg.sw}
                filter={city.tier === 1 ? 'url(#node-shadow)' : undefined}
                style={{ transition: 'r 0.3s ease' }}
              />

              {/* City name — labeled cities only */}
              {showLabel && (
                <text
                  x={cx + city.labelDx} y={cy - 1}
                  textAnchor={city.labelAnchor}
                  dominantBaseline="auto"
                  fontSize={cfg.lFs}
                  fontFamily="Georgia, serif"
                  fontWeight={city.tier === 1 ? '800' : city.tier === 2 ? '600' : '400'}
                  fill={isFuture ? '#9A9080' : city.tier === 1 ? '#131210' : '#1C1A16'}
                  style={{ paintOrder: 'stroke', stroke: '#C8DCE8', strokeWidth: '4', strokeLinejoin: 'round' }}
                >
                  {city.name}
                </text>
              )}
              {/* Day range — unlocked only, intentionally secondary */}
              {isUnlocked && (
                <text
                  x={cx + city.labelDx} y={cy + cfg.lFs * 0.9 + 1}
                  textAnchor={city.labelAnchor}
                  fontSize={cfg.dFs}
                  fontFamily="Helvetica, sans-serif"
                  fill={isFuture ? '#C0B8AC' : '#9C9284'}
                  style={{ paintOrder: 'stroke', stroke: '#C8DCE8', strokeWidth: '2.5' }}
                >
                  {`Days ${city.days}`}
                </text>
              )}

              {/* Hit area — labeled cities only */}
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
        <g transform="translate(12, 490)">
          <rect x="-4" y="-8" width="148" height="88" rx="4"
            fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
          {/* Gold: start/end */}
          <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
          <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Start / End</text>
          {/* Green: stop */}
          <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
          <text x="24" y="28" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Route stop</text>
          {/* Dotted: day trip */}
          <line x1="5" y1="48" x2="20" y2="48" stroke="#8A9E9B" strokeWidth="1.3" strokeDasharray="4,3" />
          <text x="24" y="48" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Day trip</text>
          {/* Tier note */}
          <text x="4" y="68" fontSize="6.5" fontFamily="Helvetica, sans-serif" fill="#9A9080" fontStyle="italic">Large = primary city</text>
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
            background: 'white',
            border: '1px solid #E8E3DA',
            borderRadius: '8px',
            padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(28,26,22,0.12)',
            pointerEvents: 'none',
            zIndex: 50,
            minWidth: '180px',
            maxWidth: '220px',
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
            <p style={{ fontSize: '12px', color: '#6B6156', lineHeight: '1.5', margin: isUnlocked ? 0 : '0 0 0' }}>
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

        <div style={{ position: 'relative' }}>
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
        </div>

        {/* Stop labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 1 · Tokyo' : 'Tokyo'}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {isUnlocked ? 'Day 17 · Hakone' : `${CITIES.length} stops`}
          </span>
        </div>

        {/* Preview teaser caption */}
        {!isUnlocked && (
          <p style={{
            marginTop: '14px', marginBottom: '0',
            textAlign: 'center',
            fontSize: '12px',
            color: '#8C8070',
            fontStyle: 'italic',
            letterSpacing: '0.2px',
            lineHeight: '1.5',
          }}>
            Full route and day-by-day flow available inside
          </p>
        )}
      </div>

      {/* ── Mobile bottom card ────────────────────────────────────────────── */}
      {isMobile && bottomCard && (
        <div
          onClick={() => setBottomCard(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(28,26,22,0.2)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50,
              background: 'white',
              borderRadius: '16px 16px 0 0',
              padding: '20px 24px 32px',
              boxShadow: '0 -8px 40px rgba(28,26,22,0.15)',
              animation: 'slideUp 0.28s ease',
            }}
          >
            <div style={{ width: '36px', height: '3px', background: '#E8E3DA', borderRadius: '2px', margin: '0 auto 18px' }} />
            <p style={{ fontSize: '18px', fontWeight: '700', color: '#1C1A16', margin: '0 0 4px',
              fontFamily: "'Playfair Display', Georgia, serif" }}>
              {bottomCard.name}
            </p>
            {isUnlocked && (
              <p style={{ fontSize: '12px', color: '#C9A96E', fontWeight: '600', letterSpacing: '0.5px',
                margin: '0 0 10px', textTransform: 'uppercase' }}>
                Days {bottomCard.days}
              </p>
            )}
            <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.6', margin: 0 }}>
              {bottomCard.desc}
            </p>
            {isUnlocked && onDaySelect && bottomCard.dayStart && (
              <button
                onClick={() => { onDaySelect(bottomCard.dayStart); setBottomCard(null); }}
                style={{
                  marginTop: '16px', width: '100%',
                  padding: '13px', background: '#1B6B65', color: 'white',
                  border: 'none', borderRadius: '6px',
                  fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                }}
              >
                Jump to Day {bottomCard.dayStart}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        input[type='range']::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #1B6B65;
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(28,26,22,0.20);
          cursor: pointer;
        }
        input[type='range']::-moz-range-thumb {
          width: 16px; height: 16px;
          border-radius: 50%;
          background: #1B6B65;
          border: 2px solid white;
          box-shadow: 0 1px 4px rgba(28,26,22,0.20);
          cursor: pointer;
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
