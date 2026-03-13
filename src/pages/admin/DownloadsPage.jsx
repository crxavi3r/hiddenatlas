import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Download } from 'lucide-react';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };

const PERIODS = [
  { label: 'Today',   value: 'today' },
  { label: '7 days',  value: '7d' },
  { label: '30 days', value: '30d' },
];

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function sourceLabel(s) {
  if (!s) return '—';
  const map = { AI_GENERATED: 'AI Planner', FREE_JOURNEY: 'Free', PREMIUM_JOURNEY: 'Premium' };
  return map[s] ?? s;
}

export default function DownloadsPage() {
  const [period, setPeriod] = useState('30d');
  const [page, setPage]     = useState(1);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin?action=downloads&period=${period}&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(await res.json());
    } catch (err) {
      console.error('[admin/downloads]', err);
    } finally {
      setLoading(false);
    }
  }, [period, page, getToken]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil((data.total || 0) / 50) : 1;

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16' }}>
            Downloads
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {data?.total != null ? `${data.total} downloads in this period` : '—'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '3px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px', padding: '3px' }}>
          {PERIODS.map(p => (
            <button key={p.value} onClick={() => { setPeriod(p.value); setPage(1); }} style={{
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

      {/* KPI */}
      <div style={{ ...card, padding: '18px 20px', marginBottom: '20px', display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Download size={16} color="#1B6B65" />
        </div>
        <div>
          <p style={{ fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Total Downloads</p>
          <p style={{ fontSize: '24px', fontWeight: '700', color: '#1C1A16', fontFamily: "'Playfair Display', Georgia, serif", lineHeight: '1.1' }}>
            {data?.total ?? '—'}
          </p>
        </div>
      </div>

      {/* Table */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: '#FAFAF8' }}>
                {['Date', 'User', 'Itinerary / Trip', 'Source', 'Destination'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#8C8070', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading
                ? [...Array(8)].map((_, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F4F1EC' }}>
                      {[...Array(5)].map((_, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: '12px', background: '#F4F1EC', borderRadius: '4px', width: j === 2 ? '160px' : '90px' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : (data?.downloads ?? []).map((d, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                      <td style={{ padding: '10px 14px', color: '#8C8070', fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtDate(d.createdAt)}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <p style={{ fontWeight: '500', color: '#1C1A16' }}>{d.name || '—'}</p>
                        <p style={{ color: '#8C8070', fontSize: '11.5px' }}>{d.email}</p>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#4A433A', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {d.title || d.itinerarySlug || '—'}
                        {d.itinerarySlug && (
                          <span style={{ marginLeft: '6px', fontSize: '10.5px', color: '#B5AA99' }}>/{d.itinerarySlug}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{ fontSize: '11px', fontWeight: '600', color: '#6B6156', background: '#F4F1EC', padding: '2px 7px', borderRadius: '8px' }}>
                          {sourceLabel(d.trip_source)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: '#4A433A' }}>{d.destination || '—'}</td>
                    </tr>
                  ))
              }
              {!loading && !data?.downloads?.length && (
                <tr><td colSpan={5} style={{ padding: '32px', textAlign: 'center', color: '#B5AA99' }}>No downloads in this period</td></tr>
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
