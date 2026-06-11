import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Eye, Instagram, ChevronLeft, ChevronRight, Filter, X, Users, RefreshCw } from 'lucide-react';

const S = {
  page:    { padding: '28px 32px', background: '#FAFAF8', minHeight: '100vh' },
  title:   { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '700', color: '#1C1A16', margin: 0 },
  sub:     { fontSize: '13px', color: '#8C8070', marginTop: '4px' },
  card:    { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '20px 24px' },
  input:   { padding: '7px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '12.5px', color: '#1C1A16', outline: 'none', background: 'white' },
  select:  { padding: '7px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '12.5px', color: '#1C1A16', outline: 'none', background: 'white' },
  btnPrimary: { padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' },
  btnSecondary: { padding: '7px 12px', borderRadius: '6px', border: '1px solid #E8E3DA', cursor: 'pointer', fontSize: '12px', fontWeight: '500', background: 'white', color: '#4A433A', display: 'inline-flex', alignItems: 'center', gap: '5px' },
  th: { padding: '9px 14px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px', background: '#F8F6F2', whiteSpace: 'nowrap' },
};

const PIPELINE_STATUSES = [
  'identified','qualified','message_prepared','contacted','replied','interested',
  'proposal_sent','demo_scheduled','accepted','onboarding','itinerary_in_creation','active',
  'rejected','follow_up_later','blocked','not_fit',
];

const STATUS_COLORS = {
  identified: ['#8C8070','#F4F1EC'], qualified: ['#C9A96E','#FBF8F1'],
  message_prepared: ['#1B6B65','#EFF6F5'], contacted: ['#1B6B65','#EFF6F5'],
  replied: ['#2E8B57','#F0F8F1'], interested: ['#2E8B57','#F0F8F1'],
  proposal_sent: ['#1B6B65','#EFF6F5'], demo_scheduled: ['#1B6B65','#EFF6F5'],
  accepted: ['#1B6B65','#EFF6F5'], onboarding: ['#1B6B65','#EFF6F5'],
  itinerary_in_creation: ['#1B6B65','#EFF6F5'], active: ['#1B6B65','#EFF6F5'],
  rejected: ['#C0392B','#FDECEA'], follow_up_later: ['#C9A96E','#FBF8F1'],
  blocked: ['#C0392B','#FDECEA'], not_fit: ['#C0392B','#FDECEA'],
};

function StatusChip({ status }) {
  const [color, bg] = STATUS_COLORS[status] || ['#8C8070','#F4F1EC'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color, background: bg, padding: '2px 7px', borderRadius: '9px', whiteSpace: 'nowrap' }}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' });
}

function fmtFollowers(n) {
  if (n == null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
  return String(n);
}

function PriorityDot({ priority }) {
  const colors = { high: '#C0392B', medium: '#C9A96E', low: '#8C8070' };
  return <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors[priority] || '#C8C0B8', display: 'inline-block' }} title={priority} />;
}

async function crmCall(getToken, action, payload = {}) {
  const token = await getToken();
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'Request failed');
  return json.data;
}

export default function CreatorCRMPage() {
  const { getToken }     = useAuth();
  const navigate         = useNavigate();
  const [searchParams]   = useSearchParams();

  const [leads, setLeads]       = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]         = useState(1);

  const [filters, setFilters] = useState({
    status:           searchParams.get('status') || '',
    country:          searchParams.get('country') || '',
    language:         searchParams.get('language') || '',
    platform:         searchParams.get('platform') || '',
    minScore:         searchParams.get('minScore') || '',
    minFollowers:     searchParams.get('minFollowers') || '',
    assignedTo:       searchParams.get('assignedTo') || '',
    overdueOnly:      searchParams.get('overdueOnly') || 'false',
    hasBeenContacted: searchParams.get('hasBeenContacted') || '',
    destination:      searchParams.get('destination') || '',
    niche:            searchParams.get('niche') || '',
    q:                searchParams.get('q') || '',
  });

  const setFilter = (k, v) => setFilters(f => ({ ...f, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = { page: String(page) };
      Object.entries(filters).forEach(([k, v]) => { if (v) payload[k] = v; });
      const data = await crmCall(getToken, 'leads.list', payload);
      setLeads(data.leads ?? []);
      setTotal(data.total ?? 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken, filters, page]);

  useEffect(() => { load(); }, [load]);

  const activeFilters = Object.entries(filters).filter(([k, v]) => v && v !== 'false' && k !== 'q').length;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={S.title}>Travel Designer CRM</h1>
          <p style={S.sub}>{total} lead{total !== 1 ? 's' : ''} total</p>
        </div>
      </div>

      <div style={{ ...S.card, marginBottom: '16px', padding: '12px 16px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            value={filters.q}
            onChange={e => { setFilter('q', e.target.value); setPage(1); }}
            placeholder="Search name, username, email…"
            style={{ ...S.input, flex: '1 1 200px', minWidth: '180px' }}
          />
          <select value={filters.status} onChange={e => { setFilter('status', e.target.value); setPage(1); }} style={{ ...S.select }}>
            <option value="">All statuses</option>
            {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <button onClick={() => setShowFilters(v => !v)} style={{ ...S.btnSecondary, position: 'relative' }}>
            <Filter size={13} /> Filters {activeFilters > 0 && `(${activeFilters})`}
          </button>
          {(filters.status || filters.q || activeFilters > 0) && (
            <button onClick={() => { setFilters({ status:'',country:'',language:'',platform:'',minScore:'',minFollowers:'',assignedTo:'',overdueOnly:'false',hasBeenContacted:'',destination:'',niche:'',q:'' }); setPage(1); }}
              style={{ ...S.btnSecondary, color: '#C0392B', borderColor: '#F5C6C0' }}>
              <X size={12} /> Clear
            </button>
          )}
        </div>

        {showFilters && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px', marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #F4F1EC' }}>
            {[
              { k: 'country', lbl: 'Country', type: 'text' },
              { k: 'language', lbl: 'Language', type: 'text' },
              { k: 'destination', lbl: 'Destination', type: 'text' },
              { k: 'niche', lbl: 'Niche', type: 'text' },
              { k: 'minScore', lbl: 'Min Score', type: 'number' },
              { k: 'minFollowers', lbl: 'Min Followers', type: 'number' },
            ].map(({ k, lbl, type }) => (
              <div key={k}>
                <div style={{ fontSize: '11px', color: '#8C8070', fontWeight: '600', marginBottom: '4px' }}>{lbl}</div>
                <input type={type} value={filters[k]} onChange={e => { setFilter(k, e.target.value); setPage(1); }} style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <div style={{ fontSize: '11px', color: '#8C8070', fontWeight: '600', marginBottom: '4px' }}>Platform</div>
              <select value={filters.platform} onChange={e => { setFilter('platform', e.target.value); setPage(1); }} style={{ ...S.select, width: '100%' }}>
                <option value="">Any</option>
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="youtube">YouTube</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#8C8070', fontWeight: '600', marginBottom: '4px' }}>Contacted</div>
              <select value={filters.hasBeenContacted} onChange={e => { setFilter('hasBeenContacted', e.target.value); setPage(1); }} style={{ ...S.select, width: '100%' }}>
                <option value="">Any</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: '#8C8070', fontWeight: '600', marginBottom: '4px' }}>Overdue Follow-ups</div>
              <select value={filters.overdueOnly} onChange={e => { setFilter('overdueOnly', e.target.value); setPage(1); }} style={{ ...S.select, width: '100%' }}>
                <option value="false">All</option>
                <option value="true">Overdue only</option>
              </select>
            </div>
          </div>
        )}
      </div>

      <div style={S.card}>
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <p style={{ color: '#C0392B', margin: 0 }}>Error: {error}</p>
            <button onClick={load} style={{ ...S.btnSecondary, fontSize: '12px', padding: '5px 10px' }}>
              <RefreshCw size={12} /> Retry
            </button>
          </div>
        )}
        {loading && <p style={{ textAlign: 'center', color: '#8C8070', padding: '30px' }}>Loading…</p>}
        {!loading && leads.length === 0 && !error && (
          <p style={{ textAlign: 'center', color: '#B5AA99', padding: '40px' }}>No leads found</p>
        )}
        {!loading && leads.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Creator','Platform','Followers','Engagement','Country','Score','Priority','Status','Last Contact','Follow-up','Actions'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid #F4F1EC' }}>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
                          {lead.avatarUrl
                            ? <img src={lead.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                            : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={12} color="#C8C0B8" /></div>
                          }
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontWeight: '600', fontSize: '12.5px', color: '#1C1A16', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
                            {lead.displayName || lead.username}
                          </p>
                          <p style={{ fontSize: '11px', color: '#8C8070', margin: '1px 0 0', fontFamily: 'monospace' }}>@{lead.username}</p>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                      <span style={{ fontSize: '11px', color: '#4A433A', textTransform: 'capitalize' }}>{lead.platform}</span>
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '12px', color: '#1C1A16', fontWeight: '500' }}>
                      {fmtFollowers(lead.followerCount)}
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '12px', color: '#4A433A' }}>
                      {lead.engagementRate != null ? `${Number(lead.engagementRate).toFixed(1)}%` : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '12px', color: '#8C8070' }}>
                      {lead.country || '—'}
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                      {lead.score != null
                        ? <span style={{ fontWeight: '700', fontSize: '13px', color: lead.score >= 8 ? '#1B6B65' : lead.score >= 5 ? '#C9A96E' : '#C0392B' }}>{Number(lead.score).toFixed(1)}</span>
                        : <span style={{ color: '#C8C0B8', fontSize: '12px' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                      <PriorityDot priority={lead.priority} />
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                      <StatusChip status={lead.status} />
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '11.5px', color: '#8C8070' }}>
                      {fmtDate(lead.lastContactedAt)}
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '11.5px' }}>
                      {lead.nextFollowUpAt
                        ? <span style={{ color: new Date(lead.nextFollowUpAt) < new Date() ? '#C0392B' : '#4A433A', fontWeight: new Date(lead.nextFollowUpAt) < new Date() ? '600' : '400' }}>
                            {fmtDate(lead.nextFollowUpAt)}
                          </span>
                        : <span style={{ color: '#C8C0B8' }}>—</span>
                      }
                    </td>
                    <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                        <button onClick={() => navigate(`/admin/creator-acquisition/leads/${lead.id}`)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#1B6B65', display: 'flex', alignItems: 'center' }} title="View detail">
                          <Eye size={13} />
                        </button>
                        {lead.profileUrl && (
                          <a href={lead.profileUrl} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'flex', alignItems: 'center', padding: '4px', borderRadius: '4px', color: '#E1306C' }} title="Open Instagram">
                            <Instagram size={13} />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > 50 && (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '12px', paddingTop: '16px', borderTop: '1px solid #F4F1EC', marginTop: '12px' }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ ...S.btnSecondary, opacity: page === 1 ? 0.5 : 1 }}>
              <ChevronLeft size={13} /> Prev
            </button>
            <span style={{ fontSize: '12.5px', color: '#6B6156' }}>
              Page {page} of {Math.ceil(total / 50)}
            </span>
            <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 50)}
              style={{ ...S.btnSecondary, opacity: page >= Math.ceil(total / 50) ? 0.5 : 1 }}>
              Next <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
