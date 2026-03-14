import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { MapPin, Users, Calendar, ChevronDown, Check } from 'lucide-react';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };

const STATUS_META = {
  open:        { label: 'Open',        color: '#1B6B65', bg: '#EFF6F5' },
  in_progress: { label: 'In Progress', color: '#A07830', bg: '#FBF6EE' },
  closed:      { label: 'Closed',      color: '#8C8070', bg: '#F4F1EC' },
};

const ALL_STATUSES = Object.keys(STATUS_META);
const DEFAULT_STATUSES = ['open', 'in_progress'];

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Multi-select status dropdown ──────────────────────────────────────────────
function StatusFilter({ selected, onChange, counts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(status) {
    if (selected.includes(status)) {
      onChange(selected.filter(s => s !== status));
    } else {
      onChange([...selected, status]);
    }
  }

  function selectAll() { onChange([...ALL_STATUSES]); }
  function clearAll()  { onChange([]); }

  // Trigger label
  let triggerLabel;
  if (selected.length === 0)                 triggerLabel = 'No filter';
  else if (selected.length === ALL_STATUSES.length) triggerLabel = 'All statuses';
  else triggerLabel = selected.map(s => STATUS_META[s].label).join(', ');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '7px 14px',
          background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px',
          fontSize: '12px', fontWeight: '500', color: '#4A433A',
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        <span style={{ color: '#8C8070', fontWeight: '400' }}>Status:</span>
        {triggerLabel}
        <ChevronDown size={12} color="#8C8070" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 50,
          background: 'white', border: '1px solid #E8E3DA', borderRadius: '8px',
          boxShadow: '0 8px 24px rgba(28,26,22,0.1)',
          minWidth: '200px', padding: '6px 0',
        }}>
          {/* Checkboxes for each status */}
          {ALL_STATUSES.map(status => {
            const m = STATUS_META[status];
            const checked = selected.includes(status);
            return (
              <button
                key={status}
                onClick={() => toggle(status)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  width: '100%', padding: '8px 14px',
                  background: checked ? '#FAFAF8' : 'white',
                  border: 'none', cursor: 'pointer', gap: '10px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Custom checkbox */}
                  <div style={{
                    width: '14px', height: '14px', borderRadius: '3px', flexShrink: 0,
                    border: `2px solid ${checked ? m.color : '#D4CCBF'}`,
                    background: checked ? m.color : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {checked && <Check size={9} color="white" strokeWidth={3} />}
                  </div>
                  <span style={{ fontSize: '12.5px', fontWeight: '500', color: '#1C1A16' }}>
                    {m.label}
                  </span>
                </div>
                {counts[status] != null && (
                  <span style={{
                    fontSize: '11px', fontWeight: '600',
                    color: m.color, background: m.bg,
                    padding: '1px 7px', borderRadius: '8px',
                  }}>
                    {counts[status]}
                  </span>
                )}
              </button>
            );
          })}

          {/* Footer actions */}
          <div style={{ borderTop: '1px solid #F4F1EC', padding: '6px 14px', display: 'flex', gap: '12px', marginTop: '4px' }}>
            <button
              onClick={selectAll}
              style={{ fontSize: '11px', color: '#1B6B65', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Select all
            </button>
            <button
              onClick={clearAll}
              style={{ fontSize: '11px', color: '#8C8070', fontWeight: '500', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const NEXT_STATUS = {
  open:        { value: 'in_progress', label: '→ In Progress' },
  in_progress: { value: 'closed',      label: '→ Close'       },
  closed:      { value: 'open',        label: 'Reopen'        },
};

// ── Inline status action per row ──────────────────────────────────────────────
function StatusAction({ requestId, current, onUpdated, token }) {
  const [loading, setLoading] = useState(false);

  async function advance() {
    const next = NEXT_STATUS[current]?.value;
    if (!next) return;
    setLoading(true);
    try {
      await fetch(`/api/admin?action=custom-request-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: requestId, status: next }),
      });
      onUpdated(requestId, next);
    } catch (err) {
      console.error('[admin/custom-requests] status update failed:', err);
    } finally {
      setLoading(false);
    }
  }

  const m    = STATUS_META[current] ?? STATUS_META.open;
  const next = NEXT_STATUS[current];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
      {/* Current status badge */}
      <span style={{
        fontSize: '11px', fontWeight: '600',
        color: m.color, background: m.bg,
        padding: '3px 9px', borderRadius: '10px', whiteSpace: 'nowrap',
      }}>
        {m.label}
      </span>

      {/* Next-action button */}
      {next && (
        <button
          onClick={advance}
          disabled={loading}
          style={{
            fontSize: '11px', fontWeight: '500',
            color: '#4A433A', background: 'white',
            border: '1px solid #E8E3DA', borderRadius: '6px',
            padding: '3px 9px', cursor: loading ? 'wait' : 'pointer',
            whiteSpace: 'nowrap', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '…' : next.label}
        </button>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CustomRequestsPage() {
  const [selectedStatuses, setSelectedStatuses] = useState(DEFAULT_STATUSES);
  const [page, setPage]                         = useState(1);
  const [data, setData]                         = useState(null);
  const [loading, setLoading]                   = useState(true);
  const [authToken, setAuthToken]               = useState(null);
  const { getToken }                            = useAuth();

  // Cache token so StatusSelect can use it without re-fetching every render
  useEffect(() => {
    getToken().then(setAuthToken).catch(() => {});
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ action: 'custom-requests', page: String(page) });
      // Send comma-separated selected statuses; omit param when all selected (no filter needed)
      if (selectedStatuses.length > 0 && selectedStatuses.length < ALL_STATUSES.length) {
        params.set('status', selectedStatuses.join(','));
      }
      const res = await fetch(`/api/admin?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(await res.json());
    } catch (err) {
      console.error('[admin/custom-requests]', err);
    } finally {
      setLoading(false);
    }
  }, [selectedStatuses, page, getToken]);

  useEffect(() => { load(); }, [load]);

  function handleStatusUpdated(id, newStatus) {
    setData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        requests: prev.requests.map(r => r.id === id ? { ...r, status: newStatus } : r),
      };
    });
  }

  function handleFilterChange(statuses) {
    setSelectedStatuses(statuses);
    setPage(1);
  }

  const totalPages = data ? Math.ceil((data.total || 0) / 50) : 1;
  const counts = data?.counts ?? {};

  // Describe active filter for empty state message
  const filterDesc = selectedStatuses.length === 0
    ? ''
    : selectedStatuses.length === ALL_STATUSES.length
      ? ''
      : ` matching the selected filter`;

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16' }}>
            Custom Requests
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {counts.all != null ? `${counts.all} total · ${counts.open ?? 0} open · ${counts.in_progress ?? 0} in progress` : '—'}
          </p>
        </div>

        <StatusFilter
          selected={selectedStatuses}
          onChange={handleFilterChange}
          counts={counts}
        />
      </div>

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: '#FAFAF8' }}>
                {['Date', 'Requester', 'Trip Summary', 'Group', 'Budget', 'Status'].map(h => (
                  <th key={h} style={{
                    padding: '10px 14px', textAlign: 'left',
                    color: '#8C8070', fontWeight: '600', fontSize: '11px',
                    textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(6)].map((_, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F4F1EC' }}>
                      {[...Array(6)].map((_, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: '12px', background: '#F4F1EC', borderRadius: '4px', width: j === 2 ? '160px' : '80px' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : (data?.requests ?? []).map((r, i) => (
                    <tr key={r.id} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>

                      {/* Date */}
                      <td style={{ padding: '10px 14px', color: '#8C8070', fontSize: '12px', whiteSpace: 'nowrap' }}>
                        {fmtDate(r.createdAt)}
                      </td>

                      {/* Requester — name + email + optional phone */}
                      <td style={{ padding: '10px 14px', minWidth: '160px' }}>
                        <p style={{ fontWeight: '500', color: '#1C1A16', marginBottom: '2px' }}>
                          {r.fullName || '—'}
                        </p>
                        <p style={{ color: '#1B6B65', fontSize: '11.5px', marginBottom: r.phone ? '2px' : '0' }}>
                          {r.email}
                        </p>
                        {r.phone && (
                          <p style={{ color: '#B5AA99', fontSize: '11px' }}>{r.phone}</p>
                        )}
                      </td>

                      {/* Trip Summary */}
                      <td style={{ padding: '10px 14px', maxWidth: '200px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                          <MapPin size={11} color="#1B6B65" />
                          <span style={{ fontWeight: '500', color: '#1C1A16', fontSize: '12.5px' }}>
                            {r.destination || '—'}
                          </span>
                        </div>
                        {r.dates && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                            <Calendar size={10} color="#B5AA99" />
                            <span style={{ color: '#6B6156', fontSize: '11.5px' }}>{r.dates}</span>
                          </div>
                        )}
                        {r.duration && (
                          <p style={{ color: '#8C8070', fontSize: '11px' }}>{r.duration}</p>
                        )}
                      </td>

                      {/* Group */}
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        {r.groupSize != null && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '3px' }}>
                            <Users size={11} color="#B5AA99" />
                            <span style={{ color: '#4A433A', fontSize: '12.5px' }}>
                              {r.groupSize} {r.groupSize === 1 ? 'person' : 'people'}
                            </span>
                          </div>
                        )}
                        {r.groupType && (
                          <p style={{ color: '#8C8070', fontSize: '11px' }}>{r.groupType}</p>
                        )}
                      </td>

                      {/* Budget */}
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '12.5px', color: '#4A433A' }}>
                          {r.budget || '—'}
                        </span>
                      </td>

                      {/* Status — badge + next-action button */}
                      <td style={{ padding: '10px 14px' }}>
                        {authToken
                          ? <StatusAction
                              requestId={r.id}
                              current={r.status || 'open'}
                              onUpdated={handleStatusUpdated}
                              token={authToken}
                            />
                          : (
                            <span style={{
                              fontSize: '11px', fontWeight: '600',
                              color: STATUS_META[r.status]?.color ?? '#1B6B65',
                              background: STATUS_META[r.status]?.bg ?? '#EFF6F5',
                              padding: '3px 9px', borderRadius: '10px',
                            }}>
                              {STATUS_META[r.status]?.label ?? 'Open'}
                            </span>
                          )
                        }
                      </td>
                    </tr>
                  ))
              }
              {!loading && !data?.requests?.length && (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#B5AA99' }}>
                    No custom requests{filterDesc}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #F4F1EC', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnStyle(page === 1)}>← Prev</button>
            <span style={{ fontSize: '12px', color: '#8C8070' }}>Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnStyle(page === totalPages)}>Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}

function btnStyle(disabled) {
  return {
    padding: '5px 12px', fontSize: '12px', borderRadius: '4px',
    border: '1px solid #E8E3DA', background: disabled ? '#F4F1EC' : 'white',
    color: disabled ? '#B5AA99' : '#4A433A', cursor: disabled ? 'default' : 'pointer',
  };
}
