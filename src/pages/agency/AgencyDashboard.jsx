import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, Clock, Navigation, Users, Plus } from 'lucide-react';
import { useApi } from '../../lib/api.js';
import { useAgencyCtx } from '../../lib/useAgencyCtx.jsx';
import AgencyTripCreate from './AgencyTripCreate.jsx';

/* ─── Design tokens ───────────────────────────────────────────── */
const C = {
  teal:    '#1B6B65',
  charcoal:'#1C1A16',
  muted:   '#8C8070',
  border:  '#E8E3DA',
  lightBg: '#FAFAF8',
  white:   '#FFFFFF',
};

const card = {
  background: 'white',
  borderRadius: '10px',
  border: '1px solid #E8E3DA',
  padding: '20px',
};

/* ─── Status badge ────────────────────────────────────────────── */
const STATUS_BADGE = {
  draft:      { bg: '#F0EDE8', color: '#6B6156',  label: 'Draft'      },
  ready:      { bg: '#EFF6FF', color: '#2563EB',  label: 'Ready'      },
  shared:     { bg: '#EFF6F5', color: '#1B6B65',  label: 'Shared'     },
  travelling: { bg: '#DCFCE7', color: '#166534',  label: 'Travelling' },
  completed:  { bg: '#F0EDE8', color: '#6B6156',  label: 'Completed'  },
  archived:   { bg: '#F4F1EC', color: '#B5AA99',  label: 'Archived'   },
};

function StatusBadge({ status }) {
  const s = STATUS_BADGE[status] ?? { bg: '#F0EDE8', color: '#6B6156', label: status ?? 'draft' };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '99px',
      fontSize: '11px',
      fontWeight: '600',
      letterSpacing: '0.03em',
      textTransform: 'capitalize',
      background: s.bg,
      color: s.color,
    }}>
      {s.label}
    </span>
  );
}

/* ─── Stat card ───────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
function StatCard({ icon: Icon, label, value }) {
  return (
    <div style={{ ...card, flex: '1 1 160px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px' }}>
        <p style={{ margin: 0, fontSize: '11px', fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {label}
        </p>
        <Icon size={14} color="#B5AA99" />
      </div>
      <p style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: C.charcoal, lineHeight: 1, fontFamily: "'Playfair Display', Georgia, serif" }}>
        {value ?? 0}
      </p>
    </div>
  );
}

/* ─── Helpers ─────────────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return '-';
  }
}

/* ─── Dashboard ───────────────────────────────────────────────── */
export default function AgencyDashboard() {
  const { agencyId, agencyName, loading: ctxLoading } = useAgencyCtx();
  const api = useApi();
  const navigate = useNavigate();

  const [data,       setData]       = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  const fetchDashboard = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await api.get(`/api/agency?agencyId=${agencyId}&action=dashboard`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Failed to load dashboard.');
        return;
      }
      setData(json);
    } catch {
      setError('Failed to load dashboard. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [agencyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ctxLoading && agencyId)       fetchDashboard();
    else if (!ctxLoading && !agencyId) setLoading(false);
  }, [ctxLoading, agencyId, fetchDashboard]);

  const stats       = data?.stats       ?? {};
  const recentTrips = data?.recentTrips ?? [];
  const isEmpty     = recentTrips.length === 0;

  /* ── Skeleton while loading ── */
  if (ctxLoading || loading) {
    return (
      <div style={{ padding: '28px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '14px', marginBottom: '24px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ ...card, height: '88px', opacity: 0.5 }} />
          ))}
        </div>
        <div style={{ ...card, height: '240px', opacity: 0.5 }} />
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: '28px 24px', maxWidth: '960px' }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
        }}>
          <div>
            <h1 style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: '700',
              color: C.charcoal,
              fontFamily: "'Playfair Display', Georgia, serif",
            }}>
              Dashboard
            </h1>
            {agencyName && (
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: C.muted }}>{agencyName}</p>
            )}
          </div>

          <button
            onClick={() => setShowCreate(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: C.teal,
              color: C.white,
              border: 'none',
              borderRadius: '8px',
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'Inter, system-ui, sans-serif',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={14} />
            Create Trip
          </button>
        </div>

        {/* ── Error banner ── */}
        {error && (
          <div style={{ ...card, marginBottom: '20px', padding: '14px 18px', color: '#C0392B', fontSize: '13px' }}>
            {error}
          </div>
        )}

        {/* ── Stat cards ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: '14px',
          marginBottom: '24px',
        }}>
          <StatCard icon={Briefcase}  label="Active Trips"        value={stats.activeTrips}        />
          <StatCard icon={Clock}      label="Upcoming Trips"       value={stats.upcomingTrips}       />
          <StatCard icon={Navigation} label="Currently Travelling" value={stats.currentlyTravelling} />
          <StatCard icon={Users}      label="Total Clients"        value={stats.totalClients}        />
        </div>

        {/* ── Upcoming trips table ── */}
        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${C.border}`,
          }}>
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: C.charcoal }}>
              Upcoming Trips
            </h2>
          </div>

          {isEmpty ? (
            /* ── Empty state ── */
            <div style={{ padding: '48px 24px', textAlign: 'center' }}>
              <p style={{
                margin: '0 0 20px',
                fontSize: '14px',
                color: C.muted,
                maxWidth: '320px',
                marginLeft: 'auto',
                marginRight: 'auto',
                lineHeight: 1.55,
              }}>
                No trips yet. Create your first client trip.
              </p>
              <button
                onClick={() => setShowCreate(true)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: C.teal,
                  color: C.white,
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  fontSize: '13px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
              >
                <Plus size={14} />
                Create Trip
              </button>
            </div>
          ) : (
            /* ── Trips table ── */
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr style={{ background: C.lightBg }}>
                    {['Client', 'Destination', 'Departure', 'Agent', 'Status'].map(h => (
                      <th key={h} style={{
                        padding: '10px 16px',
                        textAlign: 'left',
                        color: C.muted,
                        fontWeight: '600',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px',
                        whiteSpace: 'nowrap',
                      }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentTrips.map((trip, i) => (
                    <tr
                      key={trip.id ?? i}
                      onClick={() => navigate(`/agency/trips/${trip.id}`)}
                      style={{
                        borderTop: '1px solid #F4F1EC',
                        background: i % 2 === 0 ? 'white' : C.lightBg,
                        cursor: 'pointer',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F5F1EB'; }}
                      onMouseLeave={e => { e.currentTarget.style.background = i % 2 === 0 ? 'white' : C.lightBg; }}
                    >
                      <td style={{
                        padding: '11px 16px',
                        color: C.charcoal,
                        fontWeight: '500',
                        maxWidth: '160px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {trip.clientName || '-'}
                      </td>
                      <td style={{
                        padding: '11px 16px',
                        color: '#4A433A',
                        maxWidth: '140px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {trip.destination || '-'}
                      </td>
                      <td style={{ padding: '11px 16px', color: C.muted, whiteSpace: 'nowrap' }}>
                        {fmtDate(trip.startDate)}
                      </td>
                      <td style={{
                        padding: '11px 16px',
                        color: C.muted,
                        maxWidth: '120px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>
                        {trip.agentName || '-'}
                      </td>
                      <td style={{ padding: '11px 16px' }}>
                        <StatusBadge status={trip.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>

      {/* ── Create trip modal ── */}
      {showCreate && (
        <AgencyTripCreate
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); fetchDashboard(); }}
        />
      )}
    </>
  );
}
