import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link, Navigate } from 'react-router-dom';
import { useUserCtx } from '../../lib/useUserCtx.jsx';
import { Search, ArrowRight } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };

function fmt(n)    { return n == null ? '—' : n; }
function fmtEur(n) { return `€${parseFloat(n || 0).toFixed(2)}`; }
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function UsersPage() {
  const { isAdmin, loading: ctxLoading } = useUserCtx();

  const [q, setQ]           = useState('');
  const [debouncedQ, setDQ] = useState('');
  const [page, setPage]     = useState(1);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => { setDQ(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin?action=users&q=${encodeURIComponent(debouncedQ)}&page=${page}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(await res.json());
    } catch (err) {
      console.error('[admin/users]', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedQ, page, getToken]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil(data.total / 50) : 1;
  const isMobile = useIsMobile();

  // Guard — after all hooks so Rules of Hooks are respected
  if (!ctxLoading && !isAdmin) return <Navigate to="/admin" replace />;

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>
      <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16', marginBottom: '6px' }}>
        Users
      </h1>
      <p style={{ fontSize: '12.5px', color: '#8C8070', marginBottom: '24px' }}>
        {data?.total != null ? `${data.total.toLocaleString()} total users` : '—'}
      </p>

      {/* Search */}
      <div style={{ position: 'relative', maxWidth: '360px', marginBottom: '20px' }}>
        <Search size={13} color="#B5AA99" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search by name or email…"
          style={{
            width: '100%', padding: '9px 12px 9px 32px', fontSize: '13px',
            border: '1px solid #E8E3DA', borderRadius: '6px',
            background: 'white', color: '#1C1A16', outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Table / Card list */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {isMobile ? (
          /* Mobile card list */
          <div>
            {loading && [...Array(6)].map((_, i) => (
              <div key={i} style={{ padding: '14px 16px', borderTop: i > 0 ? '1px solid #F4F1EC' : 'none' }}>
                <div style={{ height: '13px', background: '#F4F1EC', borderRadius: '3px', width: '55%', marginBottom: '7px' }} />
                <div style={{ height: '11px', background: '#F4F1EC', borderRadius: '3px', width: '75%' }} />
              </div>
            ))}
            {!loading && (data?.users ?? []).map((u, i) => (
              <Link key={u.id} to={`/admin/users/${u.id}`} style={{ display: 'block', textDecoration: 'none', padding: '14px 16px', borderTop: i > 0 ? '1px solid #F4F1EC' : 'none', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '13px' }}>{u.name || '—'}</p>
                    <p style={{ color: '#8C8070', fontSize: '12px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</p>
                  </div>
                  <ArrowRight size={14} color="#B5AA99" style={{ flexShrink: 0, marginTop: '2px', marginLeft: '8px' }} />
                </div>
                <div style={{ display: 'flex', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', color: '#4A433A' }}>{fmt(u.downloads)} downloads</span>
                  <span style={{ fontSize: '11.5px', color: '#4A433A' }}>{fmt(u.purchases)} purchases</span>
                  <span style={{ fontSize: '11.5px', fontWeight: '600', color: '#1B6B65' }}>{fmtEur(u.revenue)}</span>
                </div>
              </Link>
            ))}
            {!loading && !data?.users?.length && (
              <p style={{ padding: '32px', textAlign: 'center', color: '#B5AA99' }}>No users found</p>
            )}
          </div>
        ) : (
          /* Desktop table */
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#FAFAF8' }}>
                  {['User', 'Joined', 'Downloads', 'Purchases', 'Revenue', 'Last Active', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'User' || h === '' ? 'left' : 'right', color: '#8C8070', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [...Array(8)].map((_, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F4F1EC' }}>
                        {[...Array(7)].map((_, j) => (
                          <td key={j} style={{ padding: '12px 14px' }}>
                            <div style={{ height: '12px', background: '#F4F1EC', borderRadius: '4px', width: j === 0 ? '160px' : '50px' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : (data?.users ?? []).map((u, i) => (
                      <tr key={u.id} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <p style={{ fontWeight: '500', color: '#1C1A16', fontSize: '12.5px' }}>{u.name || '—'}</p>
                          <p style={{ color: '#8C8070', fontSize: '11.5px' }}>{u.email}</p>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#4A433A', whiteSpace: 'nowrap' }}>{fmtDate(u.createdAt)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#4A433A' }}>{fmt(u.downloads)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#4A433A' }}>{fmt(u.purchases)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#1C1A16', fontWeight: '600' }}>{fmtEur(u.revenue)}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: '#8C8070', fontSize: '11.5px', whiteSpace: 'nowrap' }}>{fmtDate(u.last_activity)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <Link to={`/admin/users/${u.id}`} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#1B6B65', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            View <ArrowRight size={10} />
                          </Link>
                        </td>
                      </tr>
                    ))
                }
                {!loading && !data?.users?.length && (
                  <tr><td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#B5AA99' }}>No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
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
