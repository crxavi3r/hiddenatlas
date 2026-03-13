import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { MapPin, Users, Calendar, ChevronDown } from 'lucide-react';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };

const STATUS_TABS = [
  { label: 'All',         value: '' },
  { label: 'Open',        value: 'open' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Closed',      value: 'closed' },
];

const STATUS_META = {
  open:        { label: 'Open',        color: '#1B6B65', bg: '#EFF6F5' },
  in_progress: { label: 'In Progress', color: '#A07830', bg: '#FBF6EE' },
  closed:      { label: 'Closed',      color: '#8C8070', bg: '#F4F1EC' },
};

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? STATUS_META.open;
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600',
      color: m.color, background: m.bg,
      padding: '3px 9px', borderRadius: '10px',
      whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  );
}

function StatusSelect({ requestId, current, onUpdated, token }) {
  const [loading, setLoading] = useState(false);

  async function handleChange(e) {
    const newStatus = e.target.value;
    if (newStatus === current) return;
    setLoading(true);
    try {
      await fetch(`/api/admin?action=custom-request-status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id: requestId, status: newStatus }),
      });
      onUpdated(requestId, newStatus);
    } catch (err) {
      console.error('[admin/custom-requests] status update failed:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <select
        value={current}
        onChange={handleChange}
        disabled={loading}
        style={{
          appearance: 'none',
          padding: '4px 24px 4px 9px',
          fontSize: '11px', fontWeight: '600',
          color: STATUS_META[current]?.color ?? '#6B6156',
          background: STATUS_META[current]?.bg ?? '#F4F1EC',
          border: 'none', borderRadius: '10px',
          cursor: loading ? 'wait' : 'pointer',
          outline: 'none',
        }}
      >
        {Object.entries(STATUS_META).map(([val, m]) => (
          <option key={val} value={val}>{m.label}</option>
        ))}
      </select>
      <ChevronDown
        size={10}
        style={{ position: 'absolute', right: '7px', pointerEvents: 'none', color: STATUS_META[current]?.color ?? '#6B6156' }}
      />
    </div>
  );
}

export default function CustomRequestsPage() {
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage]                 = useState(1);
  const [data, setData]                 = useState(null);
  const [loading, setLoading]           = useState(true);
  const [authToken, setAuthToken]       = useState(null);
  const { getToken }                    = useAuth();

  // Cache token so StatusSelect can use it without re-fetching every render
  useEffect(() => {
    getToken().then(setAuthToken).catch(() => {});
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ action: 'custom-requests', page: String(page) });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/admin?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(await res.json());
    } catch (err) {
      console.error('[admin/custom-requests]', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, getToken]);

  useEffect(() => { load(); }, [load]);

  function handleStatusUpdated(id, newStatus) {
    setData(prev => {
      if (!prev) return prev;
      const requests = prev.requests.map(r =>
        r.id === id ? { ...r, status: newStatus } : r
      );
      return { ...prev, requests };
    });
  }

  const totalPages = data ? Math.ceil((data.total || 0) / 50) : 1;
  const counts = data?.counts ?? {};

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16' }}>
            Custom Requests
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {counts.all != null ? `${counts.all} total requests` : '—'}
          </p>
        </div>

        {/* Status tabs */}
        <div style={{ display: 'flex', gap: '3px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px', padding: '3px' }}>
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              onClick={() => { setStatusFilter(tab.value); setPage(1); }}
              style={{
                padding: '5px 14px', fontSize: '12px', fontWeight: '500',
                background: statusFilter === tab.value ? '#1C1A16' : 'transparent',
                color: statusFilter === tab.value ? 'white' : '#6B6156',
                border: 'none', borderRadius: '4px', cursor: 'pointer',
              }}
            >
              {tab.label}
              {tab.value !== '' && counts[tab.value] != null && (
                <span style={{
                  marginLeft: '5px', fontSize: '10px', fontWeight: '700',
                  color: statusFilter === tab.value ? 'rgba(255,255,255,0.65)' : '#B5AA99',
                }}>
                  {counts[tab.value]}
                </span>
              )}
            </button>
          ))}
        </div>
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
                ? [...Array(8)].map((_, i) => (
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

                      {/* Requester */}
                      <td style={{ padding: '10px 14px' }}>
                        <p style={{ fontWeight: '500', color: '#1C1A16' }}>{r.fullName || '—'}</p>
                        <p style={{ color: '#8C8070', fontSize: '11.5px' }}>{r.email}</p>
                        {r.phone && (
                          <p style={{ color: '#B5AA99', fontSize: '11px' }}>{r.phone}</p>
                        )}
                      </td>

                      {/* Trip Summary */}
                      <td style={{ padding: '10px 14px', maxWidth: '220px' }}>
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

                      {/* Status */}
                      <td style={{ padding: '10px 14px' }}>
                        {authToken
                          ? <StatusSelect
                              requestId={r.id}
                              current={r.status || 'open'}
                              onUpdated={handleStatusUpdated}
                              token={authToken}
                            />
                          : <StatusBadge status={r.status || 'open'} />
                        }
                      </td>
                    </tr>
                  ))
              }
              {!loading && !data?.requests?.length && (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#B5AA99' }}>
                    No custom requests{statusFilter ? ` with status "${statusFilter.replace('_', ' ')}"` : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Notes expansion (optional detail row — show notes on hover via title) */}
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
