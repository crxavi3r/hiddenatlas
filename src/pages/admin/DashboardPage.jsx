import { useState, useEffect } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import {
  Eye, Users, Download, ShoppingBag, DollarSign, TrendingUp,
  ArrowRight, Clock,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

const PERIODS = [
  { label: 'Today',   value: 'today' },
  { label: '7 days',  value: '7d' },
  { label: '30 days', value: '30d' },
];

// Compute the start-of-period timestamp in the browser's local timezone.
// For 'today': midnight of the current calendar day (respects local TZ).
// For '7d'/'30d': exact N-day lookback from now.
function getPeriodFrom(period) {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start.toISOString();
  }
  if (period === '7d')  return new Date(now - 7  * 24 * 60 * 60 * 1000).toISOString();
  if (period === '30d') return new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString();
  return new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const card = {
  background: 'white', borderRadius: '10px',
  border: '1px solid #E8E3DA', padding: '20px',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) {
  if (n == null) return '—';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return n;
}
function fmtEur(n) {
  if (n == null) return '—';
  return `€${parseFloat(n).toFixed(2)}`;
}
function fmtDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}
function fmtDay(day) {
  return new Date(day + 'T12:00:00').toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function niceMax(v) {
  if (v <= 0) return 5;
  const candidates = [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];
  return candidates.find(c => c >= v) ?? Math.ceil(v / 1000) * 1000;
}

// ── SVG area/line chart ───────────────────────────────────────────────────────
function TrendChart({ data = [] }) {
  const [hovered, setHovered] = useState(null);

  const lines = [
    { key: 'visitors',  color: '#1B6B65', label: 'Visitors' },
    { key: 'downloads', color: '#C9A96E', label: 'Downloads' },
    { key: 'sales',     color: '#4A433A', label: 'Sales' },
  ];

  if (!data.length) {
    return <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ fontSize: '13px', color: '#B5AA99' }}>No data for this period</p>
    </div>;
  }

  const W = 680; const H = 210;
  const padL = 36; const padR = 10; const padT = 12; const padB = 28;
  const cW = W - padL - padR;
  const cH = H - padT - padB;
  const n = data.length;

  const rawMax = Math.max(...data.map(d => Math.max(d.visitors || 0, d.downloads || 0, d.sales || 0)), 1);
  const yMax = niceMax(rawMax);
  const YTICKS = 5;
  const yTicks = Array.from({ length: YTICKS + 1 }, (_, i) => Math.round((yMax / YTICKS) * i));

  const xPos = (i) => padL + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yPos = (v) => padT + cH - (v / yMax) * cH;

  const buildPath = (key) =>
    data.map((d, i) => `${i === 0 ? 'M' : 'L'}${xPos(i).toFixed(1)},${yPos(d[key] || 0).toFixed(1)}`).join(' ');
  const buildArea = (key) => {
    const pts = data.map((d, i) => `${xPos(i).toFixed(1)},${yPos(d[key] || 0).toFixed(1)}`).join(' L ');
    return `M${xPos(0).toFixed(1)},${(padT + cH).toFixed(1)} L ${pts} L${xPos(n - 1).toFixed(1)},${(padT + cH).toFixed(1)} Z`;
  };

  // X labels — show at most 7
  const step = Math.ceil(n / 7);
  const xLabelIdxs = data.reduce((a, _, i) => { if (i % step === 0 || i === n - 1) a.push(i); return a; }, []);

  const hd = hovered != null ? data[hovered] : null;

  // Tooltip: show to right of point unless near right edge
  const tooltipFlip = hovered != null && xPos(hovered) / W > 0.62;

  return (
    <div style={{ position: 'relative', userSelect: 'none' }}>
      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {lines.map(l => (
          <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#6B6156' }}>
            <span style={{ display: 'inline-block', width: '14px', height: '2px', background: l.color, borderRadius: '1px' }} />
            {l.label}
          </div>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          style={{ width: '100%', height: '210px', display: 'block', overflow: 'visible' }}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Y-axis labels */}
          {yTicks.map(v => (
            <text key={v} x={padL - 6} y={yPos(v) + 3.5} textAnchor="end" fontSize="9" fill="#B5AA99">
              {v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}
            </text>
          ))}

          {/* Grid lines — one per Y tick */}
          {yTicks.map(v => (
            <line key={v} x1={padL} y1={yPos(v)} x2={W - padR} y2={yPos(v)} stroke="#F0EBE3" strokeWidth="1" />
          ))}

          {/* Hover crosshair */}
          {hovered != null && (
            <line
              x1={xPos(hovered)} y1={padT}
              x2={xPos(hovered)} y2={padT + cH}
              stroke="#D4CCBF" strokeWidth="1" strokeDasharray="3,3"
            />
          )}

          {/* Areas */}
          {lines.map(l => (
            <path key={`a-${l.key}`} d={buildArea(l.key)} fill={l.color} fillOpacity="0.07" />
          ))}

          {/* Lines */}
          {lines.map(l => (
            <path key={`l-${l.key}`} d={buildPath(l.key)}
              fill="none" stroke={l.color} strokeWidth="1.8"
              strokeLinejoin="round" strokeLinecap="round"
            />
          ))}

          {/* Dots — small always; enlarged + labeled on hover */}
          {lines.map(l =>
            data.map((d, i) => {
              const val = d[l.key] || 0;
              const cx = xPos(i); const cy = yPos(val);
              const isHov = hovered === i;
              const labelRight = cx < W - padR - 20;
              return (
                <g key={`dot-${l.key}-${i}`}>
                  <circle cx={cx} cy={cy} r={isHov ? 4 : 2} fill="white" stroke={l.color} strokeWidth={isHov ? 2 : 1.2} />
                  {isHov && (
                    <text
                      x={labelRight ? cx + 7 : cx - 7}
                      y={cy - 6}
                      textAnchor={labelRight ? 'start' : 'end'}
                      fontSize="9.5" fontWeight="600" fill={l.color}
                    >
                      {val}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* X labels */}
          {xLabelIdxs.map(i => (
            <text key={i} x={xPos(i)} y={H - 4} textAnchor="middle" fontSize="9.5"
              fill={hovered === i ? '#6B6156' : '#B5AA99'}
            >
              {fmtDay(data[i].day)}
            </text>
          ))}

          {/* Per-column hit areas — each column spans from the midpoint to the previous
              data point to the midpoint to the next, covering the full chart height.
              This gives reliable hover detection anywhere on the chart, not just on dots. */}
          {data.map((_, i) => {
            const x0 = i === 0     ? padL         : (xPos(i - 1) + xPos(i)) / 2;
            const x1 = i === n - 1 ? padL + cW    : (xPos(i) + xPos(i + 1)) / 2;
            return (
              <rect
                key={`hit-${i}`}
                x={x0} y={padT}
                width={x1 - x0} height={cH}
                fill="rgba(0,0,0,0)"
                style={{ cursor: 'crosshair' }}
                onMouseEnter={() => setHovered(i)}
              />
            );
          })}
        </svg>

        {/* Tooltip */}
        {hd && (
          <div style={{
            position: 'absolute',
            top: '4px',
            ...(tooltipFlip
              ? { right: `${((W - xPos(hovered)) / W) * 100}%`, marginRight: '10px' }
              : { left:  `${(xPos(hovered) / W) * 100}%`,        marginLeft:  '10px' }
            ),
            background: 'white',
            border: '1px solid #E8E3DA',
            borderRadius: '8px',
            padding: '10px 12px',
            boxShadow: '0 4px 16px rgba(28,26,22,0.10)',
            pointerEvents: 'none',
            zIndex: 10,
            minWidth: '130px',
          }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#1C1A16', marginBottom: '7px' }}>
              {fmtDay(hd.day)}
            </p>
            {lines.map(l => (
              <div key={l.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '14px', marginBottom: '3px' }}>
                <span style={{ fontSize: '11.5px', color: '#8C8070' }}>{l.label}</span>
                <span style={{ fontSize: '11.5px', fontWeight: '600', color: l.color }}>{hd[l.key] || 0}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Funnel bars ───────────────────────────────────────────────────────────────
function FunnelChart({ funnel }) {
  if (!funnel) return null;
  const steps = [
    { label: 'Visitors',        value: funnel.visitors,       color: '#1B6B65' },
    { label: 'Itinerary views', value: funnel.itineraryViews, color: '#2E8B7A' },
    { label: 'Downloads',       value: funnel.downloads,      color: '#C9A96E' },
    { label: 'Purchases',       value: funnel.purchases,      color: '#4A433A' },
  ];
  const max = Math.max(...steps.map(s => s.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {steps.map((s, i) => (
        <div key={s.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', color: '#6B6156', marginBottom: '4px' }}>
            <span>{s.label}</span>
            <span style={{ fontWeight: '600', color: '#1C1A16' }}>{fmt(s.value)}</span>
          </div>
          <div style={{ background: '#F4F1EC', borderRadius: '3px', height: '7px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: '3px',
              width: `${(s.value / max) * 100}%`,
              background: s.color,
              transition: 'width 0.6s ease',
            }} />
          </div>
          {i < steps.length - 1 && s.value > 0 && (
            <div style={{ fontSize: '10px', color: '#B5AA99', textAlign: 'right', marginTop: '2px' }}>
              → {steps[i + 1].value > 0 ? `${((steps[i + 1].value / s.value) * 100).toFixed(0)}%` : '0%'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Activity feed ─────────────────────────────────────────────────────────────
const ACTIVITY_STYLES = {
  signup:         { label: 'Signed up',       color: '#1B6B65', bg: '#EFF6F5' },
  purchase:       { label: 'Purchased',        color: '#C9A96E', bg: '#FBF8F1' },
  download:       { label: 'Downloaded',       color: '#4A433A', bg: '#F4F1EC' },
  itinerary_view: { label: 'Viewed itinerary', color: '#8C8070', bg: '#FAFAF8' },
};

const COUNTRY_NAMES = {
  AF:'Afghanistan',AL:'Albania',DZ:'Algeria',AR:'Argentina',AU:'Australia',
  AT:'Austria',BE:'Belgium',BR:'Brazil',CA:'Canada',CL:'Chile',CN:'China',
  CO:'Colombia',HR:'Croatia',CZ:'Czech Republic',DK:'Denmark',EG:'Egypt',
  FI:'Finland',FR:'France',DE:'Germany',GR:'Greece',HU:'Hungary',IN:'India',
  ID:'Indonesia',IE:'Ireland',IL:'Israel',IT:'Italy',JP:'Japan',KE:'Kenya',
  MX:'Mexico',MA:'Morocco',NL:'Netherlands',NZ:'New Zealand',NG:'Nigeria',
  NO:'Norway',PK:'Pakistan',PE:'Peru',PH:'Philippines',PL:'Poland',PT:'Portugal',
  RO:'Romania',RU:'Russia',SA:'Saudi Arabia',ZA:'South Africa',ES:'Spain',
  SE:'Sweden',CH:'Switzerland',TH:'Thailand',TR:'Turkey',GB:'United Kingdom',
  US:'United States',UA:'Ukraine',VN:'Vietnam',
};

function resolveCountry(code) {
  if (!code) return 'Unknown';
  return COUNTRY_NAMES[code.toUpperCase()] ?? code.toUpperCase();
}

function ActivityItem({ item }) {
  const style = ACTIVITY_STYLES[item.type] ?? { label: item.type, color: '#8C8070', bg: '#FAFAF8' };
  const displayName = item.name || (item.email ? item.email : null) || 'Unknown';
  const country = resolveCountry(item.country);

  return (
    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid #F4F1EC' }}>
      <span style={{
        flexShrink: 0, fontSize: '10px', fontWeight: '600', color: style.color,
        background: style.bg, padding: '2px 7px', borderRadius: '10px', marginTop: '2px',
        whiteSpace: 'nowrap',
      }}>
        {style.label}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '12px', color: '#1C1A16', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayName}
          <span style={{ color: '#D4CCBF', margin: '0 5px', fontSize: '10px' }}>·</span>
          <span style={{ color: '#8C8070' }}>{country}</span>
        </p>
        {item.detail && (
          <p style={{ fontSize: '11px', color: '#B5AA99', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px' }}>
            {item.detail}
          </p>
        )}
      </div>
      <span style={{ flexShrink: 0, fontSize: '10.5px', color: '#B5AA99', whiteSpace: 'nowrap' }}>
        {fmtDate(item.ts)}
      </span>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [period, setPeriod] = useState('7d');
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState(null);
  const { getToken } = useAuth();
  const isMobile = useIsMobile();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setApiError(null);
      try {
        const token = await getToken();
        const from = getPeriodFrom(period);
        const res = await fetch(`/api/admin?action=dashboard&period=${period}&from=${encodeURIComponent(from)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!cancelled) {
          if (json.error) {
            console.error('[admin/dashboard] API error:', json.error, json.detail ?? '');
            setApiError(json.detail || json.error);
          } else {
            setData(json);
          }
        }
      } catch (err) {
        console.error('[admin/dashboard]', err);
        if (!cancelled) setApiError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [period, getToken]);

  const kpis = data?.kpis;

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16' }}>
            Dashboard
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
        {/* Period selector */}
        <div style={{ display: 'flex', gap: '3px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px', padding: '3px' }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => setPeriod(p.value)} style={{
              padding: '5px 14px', fontSize: '12px', fontWeight: '500',
              background: period === p.value ? '#1C1A16' : 'transparent',
              color: period === p.value ? 'white' : '#6B6156',
              border: 'none', borderRadius: '4px', cursor: 'pointer',
            }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} style={{ ...card, height: '90px', background: 'white', opacity: 0.5 }} />
          ))}
        </div>
      ) : apiError ? (
        <div style={{ ...card, padding: '32px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#C0392B', marginBottom: '8px' }}>
            Dashboard failed to load
          </p>
          <p style={{ fontSize: '12px', color: '#8C8070', fontFamily: 'monospace' }}>{apiError}</p>
        </div>
      ) : (
        <>
          {/* ── KPI Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(160px, 1fr))', gap: isMobile ? '10px' : '14px', marginBottom: '22px' }}>
            {[
              { icon: Eye,          label: 'Visitors',        value: fmt(kpis?.visitors),       sub: 'page views' },
              { icon: Users,        label: 'New Users',       value: fmt(kpis?.newUsers),       sub: 'signups' },
              { icon: TrendingUp,   label: 'Itinerary Views', value: fmt(kpis?.itineraryViews), sub: 'detail pages' },
              { icon: Download,     label: 'Downloads',       value: fmt(kpis?.downloads),      sub: 'PDFs' },
              { icon: ShoppingBag,  label: 'Sales',           value: fmt(kpis?.sales),          sub: 'purchases' },
              { icon: DollarSign,   label: 'Revenue',         value: fmtEur(kpis?.revenue),     sub: `${kpis?.conversionRate ?? 0}% conv.` },
            ].map(k => (
              <div key={k.label} style={card}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <p style={{ fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{k.label}</p>
                  <k.icon size={14} color="#B5AA99" />
                </div>
                <p style={{ fontSize: '26px', fontWeight: '700', color: '#1C1A16', lineHeight: '1', fontFamily: "'Playfair Display', Georgia, serif" }}>{k.value}</p>
                <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '4px' }}>{k.sub}</p>
              </div>
            ))}
          </div>

          {/* ── Chart + Funnel ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: '16px', marginBottom: '20px' }}>
            <div style={card}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>Trends</p>
              <TrendChart data={data?.chart} />
            </div>
            <div style={card}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>Funnel</p>
              <FunnelChart funnel={data?.funnel} />
            </div>
          </div>

          {/* ── Top Itineraries ── */}
          <div style={{ ...card, marginBottom: '20px', padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #F4F1EC' }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16' }}>Top Itineraries</p>
            </div>
            {isMobile ? (
              /* Mobile card list */
              <div>
                {(data?.topItineraries ?? []).map((row, i) => (
                  <div key={row.slug} style={{ padding: '12px 16px', borderTop: i > 0 ? '1px solid #F4F1EC' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: '500', color: '#1C1A16', fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</p>
                      <p style={{ fontSize: '11.5px', color: '#8C8070', marginTop: '3px' }}>
                        {fmt(row.views)} views · {fmt(row.downloads)} dl · {fmt(row.sales)} sales
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontWeight: '700', color: '#1C1A16', fontSize: '13px' }}>{fmtEur(row.revenue)}</p>
                      <p style={{ fontSize: '11px', color: row.conversionRate > 5 ? '#1B6B65' : '#8C8070', marginTop: '2px' }}>{row.conversionRate}%</p>
                    </div>
                  </div>
                ))}
                {!data?.topItineraries?.length && (
                  <p style={{ padding: '20px', textAlign: 'center', color: '#B5AA99', fontSize: '12.5px' }}>No data yet</p>
                )}
              </div>
            ) : (
              /* Desktop table */
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                  <thead>
                    <tr style={{ background: '#FAFAF8' }}>
                      {['Itinerary', 'Views', 'Downloads', 'Sales', 'Conv.', 'Revenue'].map(h => (
                        <th key={h} style={{ padding: '10px 16px', textAlign: h === 'Itinerary' ? 'left' : 'right', color: '#8C8070', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.topItineraries ?? []).map((row, i) => (
                      <tr key={row.slug} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                        <td style={{ padding: '10px 16px', color: '#1C1A16', fontWeight: '500', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#4A433A' }}>{fmt(row.views)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#4A433A' }}>{fmt(row.downloads)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#4A433A' }}>{fmt(row.sales)}</td>
                        <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: row.conversionRate > 5 ? '#1B6B65' : row.conversionRate > 0 ? '#C9A96E' : '#B5AA99', background: row.conversionRate > 5 ? '#EFF6F5' : row.conversionRate > 0 ? '#FBF8F1' : 'transparent', padding: '2px 6px', borderRadius: '8px' }}>
                            {row.conversionRate}%
                          </span>
                        </td>
                        <td style={{ padding: '10px 16px', textAlign: 'right', color: '#1C1A16', fontWeight: '600' }}>{fmtEur(row.revenue)}</td>
                      </tr>
                    ))}
                    {!data?.topItineraries?.length && (
                      <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: '#B5AA99', fontSize: '12.5px' }}>No data yet</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Sources + Activity ── */}
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
            {/* Traffic Sources */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F4F1EC' }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16' }}>Traffic Sources</p>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: '#FAFAF8' }}>
                    {['Source', 'Visitors', 'Itin. Views', 'Users'].map(h => (
                      <th key={h} style={{ padding: '8px 14px', textAlign: h === 'Source' ? 'left' : 'right', color: '#8C8070', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.sources ?? []).map((s, i) => (
                    <tr key={s.source} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                      <td style={{ padding: '8px 14px', color: '#1C1A16', fontWeight: '500', textTransform: 'capitalize' }}>{s.source}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#4A433A' }}>{fmt(s.visitors)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#4A433A' }}>{fmt(s.itinerary_views)}</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', color: '#4A433A' }}>{fmt(s.users)}</td>
                    </tr>
                  ))}
                  {!data?.sources?.length && (
                    <tr><td colSpan={4} style={{ padding: '20px', textAlign: 'center', color: '#B5AA99', fontSize: '12.5px' }}>No source data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Recent Activity */}
            <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '16px 20px', borderBottom: '1px solid #F4F1EC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Clock size={13} color="#8C8070" />
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16' }}>Recent Activity</p>
              </div>
              <div style={{ padding: '0 16px', maxHeight: '360px', overflowY: 'auto' }}>
                {(data?.activity ?? []).map((item, i) => (
                  <ActivityItem key={i} item={item} />
                ))}
                {!data?.activity?.length && (
                  <p style={{ padding: '20px 0', textAlign: 'center', color: '#B5AA99', fontSize: '12.5px' }}>No activity yet</p>
                )}
              </div>
            </div>
          </div>

        </>
      )}
    </div>
  );
}
