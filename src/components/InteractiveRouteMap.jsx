/**
 * InteractiveRouteMap — generalization of MoroccoRouteMap for CMS-managed itineraries.
 *
 * Accepts stops from content.routeMap.stops and renders the same full interactive
 * experience as Morocco: animated route reveal, journey progress slider, stop cards,
 * desktop tooltip, mobile bottom sheet, and Jump to Day button.
 *
 * Props:
 *   stops        — array of { id, name, latitude, longitude, dayNumber, visible, order, description? }
 *   onDaySelect  — (dayNumber: number) => void
 *   isUnlocked   — whether the user has purchased the itinerary (controls day labels / Jump button)
 */
import { useState, useRef, useEffect, useCallback } from 'react';

const VW = 800, VH = 440;

function makeProj(stops) {
  const lats = stops.map(s => s.latitude);
  const lngs = stops.map(s => s.longitude);
  const latMin = Math.min(...lats), latMax = Math.max(...lats);
  const lngMin = Math.min(...lngs), lngMax = Math.max(...lngs);
  const latSpan = latMax - latMin || 1;
  const lngSpan = lngMax - lngMin || 1;
  const PAD = 0.22;
  const X0 = lngMin - lngSpan * PAD;
  const X1 = lngMax + lngSpan * PAD;
  const Y0 = latMin - latSpan * PAD;
  const Y1 = latMax + latSpan * PAD;
  return (lon, lat) => [
    (lon - X0) / (X1 - X0) * VW,
    (1 - (lat - Y0) / (Y1 - Y0)) * VH,
  ];
}

function catmullPath(lonlats, proj, tension = 0.22) {
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

function computeStopFractions(stops, proj) {
  if (stops.length <= 1) return [0];
  const pts = stops.map(s => proj(s.longitude, s.latitude));
  const dists = [0];
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0] - pts[i - 1][0];
    const dy = pts[i][1] - pts[i - 1][1];
    dists.push(dists[i - 1] + Math.sqrt(dx * dx + dy * dy));
  }
  const total = dists[dists.length - 1] || 1;
  return dists.map(d => d / total);
}

const TIER = {
  1: { r: 7,   rActive: 10,  sw: 2.0, fill: '#F2E4CB', edge: '#C9A96E', halo: '#C9A96E', lFs: 11.5, dFs: 8   },
  2: { r: 4.5, rActive: 6.5, sw: 1.5, fill: '#C8D9D5', edge: '#2A5248', halo: '#2A5248', lFs: 9.5,  dFs: 7.5 },
};

export default function InteractiveRouteMap({ stops = [], onDaySelect, isUnlocked = true }) {
  const validStops = (stops || [])
    .filter(s => s.visible !== false && s.latitude != null && s.longitude != null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (validStops.length < 2) return null;

  const proj         = makeProj(validStops);
  const fractions    = computeStopFractions(validStops, proj);
  const routePathD   = catmullPath(validStops.map(s => [s.longitude, s.latitude]), proj);

  const [activeStop, setActiveStop] = useState(0);
  const [animating, setAnimating]   = useState(true);
  const [hovered, setHovered]       = useState(null);
  const [isMobile, setIsMobile]     = useState(false);
  const [bottomCard, setBottomCard] = useState(null);
  const [pathLen, setPathLen]       = useState(1800);

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
        if (s < validStops.length - 1) return s + 1;
        setAnimating(false);
        return s;
      });
    }, 480);
    return () => clearTimeout(id);
  }, [activeStop, animating]); // eslint-disable-line react-hooks/exhaustive-deps

  const revealedLen = pathLen * fractions[activeStop];
  const dashOffset  = Math.max(0, pathLen - revealedLen);

  const handleStopInteract = useCallback((stop, idx) => {
    setActiveStop(idx);
    setAnimating(false);
    if (isMobile && isUnlocked) {
      setBottomCard(prev => prev?.id === stop.id ? null : stop);
    } else if (!isMobile && isUnlocked && onDaySelect && stop.dayNumber) {
      onDaySelect(stop.dayNumber);
    }
  }, [isMobile, onDaySelect, isUnlocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const getTooltipPos = (svgX, svgY) => {
    if (!svgRef.current || !containerRef.current) return { left: 0, top: 0 };
    const svgR = svgRef.current.getBoundingClientRect();
    const conR = containerRef.current.getBoundingClientRect();
    return {
      left: svgR.left - conR.left + svgX * (svgR.width  / VW),
      top:  svgR.top  - conR.top  + svgY * (svgR.height / VH),
    };
  };

  const activeCity = validStops[activeStop];
  const n = validStops.length;

  // Resolve tier from stored type, falling back to position-based default for legacy data.
  const resolveTier = (stop, i) => {
    if (stop.type === 'major') return 1;
    if (stop.type === 'stop')  return 2;
    return (i === 0 || i === n - 1) ? 1 : 2;
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── SVG Map ─────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#BDD5E0' }}
        aria-label={`Route map: ${validStops.map(s => s.name).join(' → ')}`}
      >
        <defs>
          <filter id="irm-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Ocean */}
        <rect width={VW} height={VH} fill="#BDD5E0" />
        {/* Land mass — rounded rect, sea visible at edges */}
        <rect
          x={VW * 0.055} y={VH * 0.06}
          width={VW * 0.89} height={VH * 0.88}
          rx={VH * 0.10} ry={VH * 0.10}
          fill="#D8CBAA" stroke="#B5A48A" strokeWidth="0.7"
        />
        {/* Secondary terrain tint — lower region */}
        <rect
          x={VW * 0.28} y={VH * 0.50}
          width={VW * 0.62} height={VH * 0.44}
          rx={VH * 0.07} ry={VH * 0.07}
          fill="#C8A96A" fillOpacity="0.16"
        />

        {/* Route ghost */}
        <path d={routePathD} fill="none" stroke="#1F3D3A" strokeWidth="1.2" opacity="0.07" />

        {/* Route reveal */}
        <path
          ref={routeRef}
          d={routePathD}
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
        />

        {/* Stop markers + labels */}
        {validStops.map((stop, i) => {
          const [cx, cy] = proj(stop.longitude, stop.latitude);
          const isActive = i === activeStop;
          const isFuture = i > activeStop;
          const tier     = resolveTier(stop, i);
          const cfg      = TIER[tier];
          const r        = isActive ? cfg.rActive : cfg.r;
          const dx       = cx <= VW * 0.55 ? 14 : -12;
          const anchor   = dx > 0 ? 'start' : 'end';

          return (
            <g key={stop.id || i} opacity={isFuture ? 0.28 : 1} style={{ transition: 'opacity 0.4s ease', cursor: 'pointer' }}>
              {isActive && (
                <circle cx={cx} cy={cy} r={r * 2.4} fill={cfg.halo} opacity="0.15" />
              )}
              <circle cx={cx} cy={cy} r={r + 3} fill="none"
                stroke={cfg.edge} strokeWidth="0.8"
                opacity={isActive ? 0.45 : tier === 1 ? 0.20 : 0.12} />
              <circle cx={cx} cy={cy} r={r}
                fill={cfg.fill} stroke={cfg.edge} strokeWidth={cfg.sw}
                filter={tier === 1 ? 'url(#irm-node-shadow)' : undefined}
                style={{ transition: 'r 0.3s ease' }}
              />
              {/* City name label */}
              <text
                x={cx + dx} y={cy - 1}
                textAnchor={anchor} dominantBaseline="auto"
                fontSize={cfg.lFs} fontFamily="Georgia, serif"
                fontWeight={tier === 1 ? '800' : '500'}
                fill={isFuture ? '#9A9080' : tier === 1 ? '#131210' : '#1C1A16'}
                style={{ paintOrder: 'stroke', stroke: '#D8CBAA', strokeWidth: '4', strokeLinejoin: 'round', pointerEvents: 'none' }}
              >
                {stop.name}
              </text>
              {/* Day label (unlocked only) */}
              {isUnlocked && stop.dayNumber && (
                <text
                  x={cx + dx} y={cy + cfg.lFs * 0.9 + 1}
                  textAnchor={anchor}
                  fontSize={cfg.dFs} fontFamily="Helvetica, sans-serif"
                  fill={isFuture ? '#C0B8AC' : '#9C9284'}
                  style={{ paintOrder: 'stroke', stroke: '#D8CBAA', strokeWidth: '2.5', pointerEvents: 'none' }}
                >
                  {`Day ${stop.dayNumber}`}
                </text>
              )}
              {/* Invisible hit area */}
              <circle cx={cx} cy={cy} r={Math.max(r + 14, 20)} fill="transparent"
                onMouseEnter={() => !isMobile && !animating && setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => handleStopInteract(stop, i)}
                onTouchStart={e => { e.preventDefault(); handleStopInteract(stop, i); }}
              />
            </g>
          );
        })}

        {/* Legend */}
        <g transform={`translate(12, ${VH - 80})`}>
          <rect x="-4" y="-8" width="128" height="52" rx="4"
            fill="#F5F0E8" fillOpacity="0.90" stroke="#C0B8A8" strokeWidth="0.6" />
          <circle cx="12" cy="8"  r="6"   fill="#F2E4CB" stroke="#C9A96E" strokeWidth="1.8" />
          <text x="24" y="8"  dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Major stop</text>
          <circle cx="12" cy="28" r="4.5" fill="#C8D9D5" stroke="#2A5248" strokeWidth="1.5" />
          <text x="24" y="28" dominantBaseline="middle" fontSize="7.5" fontFamily="Helvetica, sans-serif" fill="#3C3830">Route stop</text>
        </g>
      </svg>

      {/* ── Desktop tooltip ──────────────────────────────────────────────── */}
      {hovered !== null && !isMobile && (() => {
        const stop = validStops[hovered];
        const [cx, cy] = proj(stop.longitude, stop.latitude);
        const pos = getTooltipPos(cx, cy);
        const onRight = cx <= VW * 0.55;
        return (
          <div style={{
            position: 'absolute',
            left: pos.left + (onRight ? 20 : -20),
            top:  pos.top  - 36,
            transform: onRight ? 'none' : 'translateX(-100%)',
            background: 'white', border: '1px solid #E8E3DA',
            borderRadius: '8px', padding: '12px 16px',
            boxShadow: '0 8px 32px rgba(28,26,22,0.12)',
            pointerEvents: 'none', zIndex: 50,
            minWidth: '180px', maxWidth: '220px',
          }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', margin: '0 0 3px', fontFamily: "'Playfair Display', Georgia, serif" }}>
              {stop.name}
            </p>
            {isUnlocked && stop.dayNumber && (
              <p style={{ fontSize: '11px', color: '#C9A96E', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 6px', textTransform: 'uppercase' }}>
                Day {stop.dayNumber}
              </p>
            )}
            {stop.description && (
              <p style={{ fontSize: '12px', color: '#6B6156', lineHeight: '1.5', margin: 0 }}>
                {stop.description}
              </p>
            )}
            {isUnlocked && onDaySelect && stop.dayNumber && (
              <p style={{ fontSize: '10.5px', color: '#1B6B65', marginTop: '8px', fontWeight: '600', cursor: 'pointer' }}
                onClick={() => onDaySelect(stop.dayNumber)}>
                View day →
              </p>
            )}
          </div>
        );
      })()}

      {/* ── Journey Progress ─────────────────────────────────────────────── */}
      <div style={{ marginTop: '20px', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1px', color: '#7C7060', textTransform: 'uppercase' }}>
            Journey Progress
          </span>
          {isUnlocked && (
            <span style={{ fontSize: '12px', color: '#1B6B65', fontWeight: '600' }}>
              {activeCity.name}{activeCity.dayNumber ? ` · Day ${activeCity.dayNumber}` : ''}
            </span>
          )}
        </div>
        <input
          type="range" min={0} max={n - 1} step={1} value={activeStop}
          onChange={e => { setActiveStop(+e.target.value); setAnimating(false); }}
          style={{
            width: '100%', height: '4px', appearance: 'none', WebkitAppearance: 'none',
            background: `linear-gradient(to right, #1B6B65 ${(activeStop / (n - 1)) * 100}%, #E8E3DA ${(activeStop / (n - 1)) * 100}%)`,
            borderRadius: '2px', outline: 'none', cursor: 'pointer', margin: '0',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {validStops[0].name}{isUnlocked && validStops[0].dayNumber ? ` · Day ${validStops[0].dayNumber}` : ''}
          </span>
          <span style={{ fontSize: '10px', color: '#9A9080' }}>
            {validStops[n - 1].name}{isUnlocked && validStops[n - 1].dayNumber ? ` · Day ${validStops[n - 1].dayNumber}` : ''}
          </span>
        </div>
      </div>

      {/* ── Stop card ────────────────────────────────────────────────────── */}
      <div key={activeCity.id || activeStop} style={{
        marginTop: '16px', background: 'white', borderRadius: '8px',
        padding: '16px 20px', border: '1px solid #E8E3DA',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: '12px',
        animation: 'irm-card 0.3s ease forwards',
      }}>
        <div>
          {isUnlocked && activeCity.dayNumber && (
            <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '3px' }}>
              Day {activeCity.dayNumber}
            </p>
          )}
          <p style={{ fontSize: '15px', fontWeight: '600', color: '#1C1A16' }}>
            {activeCity.name}
          </p>
          {activeCity.description && (
            <p style={{ fontSize: '12px', color: '#6B6156', marginTop: '3px', lineHeight: '1.5' }}>
              {activeCity.description}
            </p>
          )}
        </div>
        {isUnlocked && activeCity.dayNumber && (
          <button
            onClick={() => onDaySelect && onDaySelect(activeCity.dayNumber)}
            style={{ background: '#1B6B65', color: 'white', border: 'none', borderRadius: '4px', padding: '8px 16px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            Jump to Day {activeCity.dayNumber}
          </button>
        )}
      </div>

      {/* ── Mobile bottom sheet ──────────────────────────────────────────── */}
      {isMobile && bottomCard && isUnlocked && (
        <div onClick={() => setBottomCard(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'rgba(28,26,22,0.2)' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 50, background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 24px 32px', boxShadow: '0 -8px 40px rgba(28,26,22,0.15)', animation: 'irm-slideUp 0.28s ease' }}>
            <div style={{ width: '36px', height: '3px', background: '#E8E3DA', borderRadius: '2px', margin: '0 auto 18px' }} />
            <p style={{ fontSize: '18px', fontWeight: '700', color: '#1C1A16', margin: '0 0 4px', fontFamily: "'Playfair Display', Georgia, serif" }}>
              {bottomCard.name}
            </p>
            {isUnlocked && bottomCard.dayNumber && (
              <p style={{ fontSize: '12px', color: '#C9A96E', fontWeight: '600', letterSpacing: '0.5px', margin: '0 0 10px', textTransform: 'uppercase' }}>
                Day {bottomCard.dayNumber}
              </p>
            )}
            {bottomCard.description && (
              <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.6', margin: 0 }}>
                {bottomCard.description}
              </p>
            )}
            {isUnlocked && onDaySelect && bottomCard.dayNumber && (
              <button onClick={() => { onDaySelect(bottomCard.dayNumber); setBottomCard(null); }}
                style={{ marginTop: '16px', width: '100%', padding: '13px', background: '#1B6B65', color: 'white', border: 'none', borderRadius: '6px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
                Jump to Day {bottomCard.dayNumber}
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        input[type='range']::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #1B6B65; border: 2px solid white; box-shadow: 0 1px 4px rgba(28,26,22,0.20); cursor: pointer; }
        input[type='range']::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #1B6B65; border: 2px solid white; box-shadow: 0 1px 4px rgba(28,26,22,0.20); cursor: pointer; }
        @keyframes irm-slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes irm-card { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
