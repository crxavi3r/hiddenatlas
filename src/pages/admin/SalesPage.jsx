import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';
import { DollarSign, ShoppingBag, TrendingUp } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };

const PERIODS = [
  { label: 'Today',   value: 'today' },
  { label: '7 days',  value: '7d' },
  { label: '30 days', value: '30d' },
];

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

function fmtEur(n)  { return `€${parseFloat(n || 0).toFixed(2)}`; }
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function SalesPage() {
  const [period, setPeriod] = useState('30d');
  const [page, setPage]     = useState(1);
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const from = encodeURIComponent(getPeriodFrom(period));
      const res = await fetch(`/api/admin?action=sales&period=${period}&page=${page}&from=${from}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(await res.json());
    } catch (err) {
      console.error('[admin/sales]', err);
    } finally {
      setLoading(false);
    }
  }, [period, page, getToken]);

  useEffect(() => { load(); }, [load]);

  const totalPages = data ? Math.ceil((data.total || 0) / 50) : 1;
  const isMobile = useIsMobile();

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16' }}>
            Sales
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            All-time revenue: <strong style={{ color: '#1C1A16' }}>{fmtEur(data?.allTimeRevenue)}</strong>
          </p>
        </div>
        {/* Period selector */}
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

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        {[
          { icon: DollarSign,  label: 'Net Revenue',    value: fmtEur(data?.revenue) },
          { icon: ShoppingBag, label: 'Sales',          value: data?.total ?? '—' },
          { icon: TrendingUp,  label: 'Avg order value',value: fmtEur(data?.avgOrderValue) },
          { icon: DollarSign,  label: 'Discounts given',value: data?.totalDiscount ? `-${fmtEur(data.totalDiscount)}` : '€0.00' },
        ].map(k => (
          <div key={k.label} style={{ ...card, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <p style={{ fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{k.label}</p>
              <k.icon size={14} color="#B5AA99" />
            </div>
            <p style={{ fontSize: '24px', fontWeight: '700', color: '#1C1A16', fontFamily: "'Playfair Display', Georgia, serif" }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Table / Card list */}
      <div style={{ ...card, overflow: 'hidden' }}>
        {isMobile ? (
          <div>
            {loading && [...Array(5)].map((_, i) => (
              <div key={i} style={{ padding: '14px 16px', borderTop: i > 0 ? '1px solid #F4F1EC' : 'none' }}>
                <div style={{ height: '12px', background: '#F4F1EC', borderRadius: '3px', width: '50%', marginBottom: '7px' }} />
                <div style={{ height: '11px', background: '#F4F1EC', borderRadius: '3px', width: '70%' }} />
              </div>
            ))}
            {!loading && (data?.sales ?? []).map((s, i) => (
              <div key={i} style={{ padding: '14px 16px', borderTop: i > 0 ? '1px solid #F4F1EC' : 'none', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '13px' }}>{s.name || '—'}</p>
                    <p style={{ color: '#8C8070', fontSize: '12px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.email}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '10px' }}>
                    <p style={{ fontWeight: '700', color: '#1B6B65', fontSize: '15px' }}>{fmtEur(s.amount)}</p>
                    {s.discountAmount > 0 && (
                      <p style={{ fontSize: '11px', color: '#C0504D' }}>-{fmtEur(s.discountAmount)}</p>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: '12px', color: '#4A433A', marginBottom: '4px' }}>{s.itinerary}</p>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <p style={{ fontSize: '11px', color: '#B5AA99' }}>{fmtDate(s.purchasedAt)}</p>
                  {s.couponCode && (
                    <span style={{ background: '#FFF8EC', color: '#9B6A1A', padding: '1px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600' }}>
                      {s.couponCode}
                    </span>
                  )}
                </div>
              </div>
            ))}
            {!loading && !data?.sales?.length && (
              <p style={{ padding: '32px', textAlign: 'center', color: '#B5AA99' }}>No sales in this period</p>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ background: '#FAFAF8' }}>
                  {['Date', 'Customer', 'Itinerary', 'Gross', 'Discount', 'Net', 'Coupon', 'Status'].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: 'left', color: '#8C8070', fontWeight: '600', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading
                  ? [...Array(8)].map((_, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F4F1EC' }}>
                        {[...Array(8)].map((_, j) => (
                          <td key={j} style={{ padding: '12px 14px' }}>
                            <div style={{ height: '12px', background: '#F4F1EC', borderRadius: '4px', width: j === 2 ? '140px' : '80px' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  : (data?.sales ?? []).map((s, i) => (
                      <tr key={i} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                        <td style={{ padding: '10px 14px', color: '#8C8070', fontSize: '12px', whiteSpace: 'nowrap' }}>{fmtDate(s.purchasedAt)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          <p style={{ fontWeight: '500', color: '#1C1A16' }}>{s.name || '—'}</p>
                          <p style={{ color: '#8C8070', fontSize: '11.5px' }}>{s.email}</p>
                        </td>
                        <td style={{ padding: '10px 14px', color: '#4A433A', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.itinerary}</td>
                        <td style={{ padding: '10px 14px', color: '#8C8070', whiteSpace: 'nowrap' }}>{s.grossAmount != null ? fmtEur(s.grossAmount) : fmtEur(s.amount)}</td>
                        <td style={{ padding: '10px 14px', color: s.discountAmount > 0 ? '#C0504D' : '#B5AA99', whiteSpace: 'nowrap' }}>
                          {s.discountAmount > 0 ? `-${fmtEur(s.discountAmount)}` : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', fontWeight: '700', color: '#1B6B65', whiteSpace: 'nowrap' }}>{fmtEur(s.amount)}</td>
                        <td style={{ padding: '10px 14px', color: '#4A433A', fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {s.couponCode ? (
                            <span style={{ background: '#FFF8EC', color: '#9B6A1A', padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' }}>
                              {s.couponCode}
                            </span>
                          ) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px' }}>
                          <span style={{ fontSize: '11px', fontWeight: '600', color: s.status === 'paid' ? '#1B6B65' : '#8C8070', background: s.status === 'paid' ? '#EFF6F5' : '#F4F1EC', padding: '2px 8px', borderRadius: '10px' }}>
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))
                }
                {!loading && !data?.sales?.length && (
                  <tr><td colSpan={8} style={{ padding: '32px', textAlign: 'center', color: '#B5AA99' }}>No sales in this period</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

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
