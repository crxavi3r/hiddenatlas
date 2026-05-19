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
import { buildRouteMapLayout, ROUTE_MAP_TIER as TIER } from '../utils/routeMapLayout';

const VW = 800, VH = 440;

export default function InteractiveRouteMap({ stops = [], onDaySelect, isUnlocked = true }) {
  const validStops = (stops || [])
    .filter(s => s.visible !== false && s.latitude != null && s.longitude != null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (validStops.length < 2) return null;

  const layout = buildRouteMapLayout(validStops, VW, VH);
  if (!layout) return null;
  const { fractions, routePathD, labeledStops } = layout;

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

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* ── SVG Map ─────────────────────────────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VW} ${VH}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '8px', border: '1px solid #E8E3DA', background: '#F4F1E8' }}
        aria-label={`Route map: ${validStops.map(s => s.name).join(' → ')}`}
      >
        <defs>
          <filter id="irm-node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5" floodColor="#1A3632" floodOpacity="0.18" />
          </filter>
        </defs>

        {/* Neutral editorial background — no fake geography */}
        <rect width={VW} height={VH} fill="#F4F1E8" />
        {/* Subtle reference grid */}
        {[0.25, 0.5, 0.75].map(t => (
          <g key={t}>
            <line x1={VW * t} y1={0} x2={VW * t} y2={VH} stroke="#E2DDD4" strokeWidth="0.4" />
            <line x1={0} y1={VH * t} x2={VW} y2={VH * t} stroke="#E2DDD4" strokeWidth="0.4" />
          </g>
        ))}

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
        {labeledStops.map(({ stop, tier, cfg, cx, cy, r: baseR, labelAnchor, labelX, labelY, fs }, i) => {
          const isActive = i === activeStop;
          const isFuture = i > activeStop;
          const r        = isActive ? cfg.rActive : baseR;

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
                x={labelX} y={labelY}
                textAnchor={labelAnchor} dominantBaseline="auto"
                fontSize={fs} fontFamily="Georgia, serif"
                fontWeight={tier === 1 ? '800' : '500'}
                fill={isFuture ? '#9A9080' : tier === 1 ? '#131210' : '#1C1A16'}
                style={{ paintOrder: 'stroke', stroke: '#F4F1E8', strokeWidth: '4', strokeLinejoin: 'round', pointerEvents: 'none' }}
              >
                {stop.name}
              </text>
              {/* Day label (unlocked only) */}
              {isUnlocked && stop.dayNumber && (
                <text
                  x={labelX} y={labelY + fs * 0.9 + 1}
                  textAnchor={labelAnchor}
                  fontSize={cfg.dFs} fontFamily="Helvetica, sans-serif"
                  fill={isFuture ? '#C0B8AC' : '#9C9284'}
                  style={{ paintOrder: 'stroke', stroke: '#F4F1E8', strokeWidth: '2.5', pointerEvents: 'none' }}
                >
                  {`Day ${stop.dayNumber}`}
                </text>
              )}
              {/* Invisible hit area */}
              <circle cx={cx} cy={cy} r={Math.max(baseR + 14, 20)} fill="transparent"
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
        const { stop, cx, cy } = labeledStops[hovered];
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
