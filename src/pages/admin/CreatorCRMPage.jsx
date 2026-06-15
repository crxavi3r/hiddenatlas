import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Eye, Instagram, ChevronLeft, ChevronRight, Filter, X, Users, RefreshCw, Plus, UserPlus, Pencil } from 'lucide-react';
import EditLeadModal from './EditLeadModal.jsx';

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
  const INT_MAP = { 0: 'low', 1: 'medium', 2: 'high' };
  const p = typeof priority === 'number' ? (INT_MAP[priority] ?? null) : priority;
  const colors = { high: '#C0392B', medium: '#C9A96E', low: '#8C8070' };
  return <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: colors[p] || '#C8C0B8', display: 'inline-block' }} title={p ?? String(priority ?? '')} />;
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

const PLATFORMS = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok',    label: 'TikTok' },
  { value: 'youtube',   label: 'YouTube' },
];


function AddLeadModal({ getToken, onClose, onCreated, navigate }) {
  const [tab, setTab]         = useState('manual');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const [success, setSuccess] = useState(null); // { leadId, username, warning }
  const [dupId, setDupId]     = useState(null);

  const emptyForm = {
    platform: 'instagram', username: '', displayName: '', profileUrl: '',
    country: '', email: '', followerCount: '', engagementRate: '',
    bio: '', status: 'identified', score: '', notes: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [igUrl, setIgUrl] = useState('');

  const setField = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const resetState = () => {
    setError(null);
    setSuccess(null);
    setDupId(null);
  };

  const handleManualSubmit = async (e) => {
    e.preventDefault();
    resetState();
    setLoading(true);
    try {
      const data = await crmCall(getToken, 'leads.create', {
        platform:       form.platform,
        username:       form.username,
        displayName:    form.displayName,
        profileUrl:     form.profileUrl,
        email:          form.email,
        country:        form.country,
        bio:            form.bio,
        followerCount:  form.followerCount,
        engagementRate: form.engagementRate,
        score:          form.score,
        status:         form.status,
        notes:          form.notes,
      });
      if (data.duplicate) {
        setDupId(data.existingId);
      } else {
        setSuccess({ leadId: data.lead.id, username: data.lead.username });
        onCreated();
      }
    } catch (err) {
      setError(err.message || 'Could not create lead. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInstagramSubmit = async (e) => {
    e.preventDefault();
    resetState();
    setLoading(true);
    try {
      const data = await crmCall(getToken, 'leads.importInstagram', { instagramUrl: igUrl });
      if (data.duplicate) {
        setDupId(data.existingId);
      } else {
        setSuccess({ leadId: data.lead.id, username: data.lead.username, warning: data.warning, warningCode: data.warningCode, reconnectSlug: data.reconnectSlug ?? null });
        onCreated();
      }
    } catch (err) {
      setError(err.message || 'Could not create lead. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(28,26,22,0.55)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: '16px',
  };
  const modal = {
    background: 'white', borderRadius: '12px', padding: '28px 28px 24px',
    width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
  };
  const tabBar = {
    display: 'flex', gap: '4px', marginBottom: '20px',
    background: '#F8F6F2', borderRadius: '8px', padding: '3px',
  };
  const tabBtn = (active) => ({
    flex: 1, padding: '7px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer',
    fontSize: '12.5px', fontWeight: '600',
    background: active ? 'white' : 'transparent',
    color: active ? '#1C1A16' : '#8C8070',
    boxShadow: active ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
    transition: 'all 0.15s',
  });
  const row = { marginBottom: '14px' };
  const label = { fontSize: '11.5px', fontWeight: '600', color: '#4A433A', marginBottom: '5px', display: 'block' };
  const inp = { ...S.input, width: '100%', boxSizing: 'border-box' };
  const sel = { ...S.select, width: '100%', boxSizing: 'border-box' };
  const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' };

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <UserPlus size={18} color="#1B6B65" />
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '17px', fontWeight: '700', color: '#1C1A16' }}>
              Add lead
            </span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070', padding: '2px' }}>
            <X size={18} />
          </button>
        </div>

        <div style={tabBar}>
          <button style={tabBtn(tab === 'manual')}   onClick={() => { setTab('manual');    resetState(); }}>Manual</button>
          <button style={tabBtn(tab === 'instagram')} onClick={() => { setTab('instagram'); resetState(); }}>Instagram URL</button>
        </div>

        {/* Duplicate warning */}
        {dupId && (
          <div style={{ background: '#FBF8F1', border: '1px solid #E8D9B8', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#7A5C1E', fontWeight: '600' }}>This creator already exists in CRM</p>
            <button
              onClick={() => { navigate(`/admin/creator-acquisition/leads/${dupId}`); onClose(); }}
              style={{ marginTop: '6px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#1B6B65', fontWeight: '600', padding: 0, textDecoration: 'underline' }}>
              View existing lead
            </button>
          </div>
        )}

        {/* Success banner */}
        {success && !dupId && (
          <div style={{ background: '#EFF6F5', border: '1px solid #A8D5D0', borderRadius: '8px', padding: '12px 14px', marginBottom: '16px' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#1B6B65', fontWeight: '600' }}>
              Lead @{success.username} created successfully.
            </p>
            {success.warningCode === 'META_TOKEN_EXPIRED' && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#7A5C1E', lineHeight: '1.5' }}>
                Instagram enrichment was skipped because the Meta connection has expired.{' '}
                {success.reconnectSlug
                  ? <button onClick={() => { navigate(`/admin/creators/${success.reconnectSlug}`); onClose(); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#1B6B65', fontWeight: '600', padding: 0, textDecoration: 'underline' }}>
                      Reconnect Instagram
                    </button>
                  : 'Reconnect Instagram via Creator settings to enable automatic enrichment.'
                }
              </p>
            )}
            {success.warningCode === 'META_NOT_CONFIGURED' && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#4A433A', lineHeight: '1.5' }}>
                Instagram enrichment is not configured. The lead was created with username and profile URL only.
              </p>
            )}
            {success.warningCode === 'META_RATE_LIMITED' && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#4A433A', lineHeight: '1.5' }}>
                Instagram enrichment was skipped due to Meta API rate limiting. You can refresh Instagram data from the lead detail page later.
              </p>
            )}
            {success.warningCode === 'META_ENRICHMENT_FAILED' && (
              <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#4A433A', lineHeight: '1.5' }}>
                Instagram data could not be fetched automatically. You can try refreshing from the lead detail page.
              </p>
            )}
            <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
              <button onClick={() => { navigate(`/admin/creator-acquisition/leads/${success.leadId}`); onClose(); }}
                style={{ ...S.btnPrimary, fontSize: '12px', padding: '5px 12px' }}>View lead</button>
              <button onClick={() => { setSuccess(null); setForm(emptyForm); setIgUrl(''); }}
                style={{ ...S.btnSecondary, fontSize: '12px', padding: '5px 12px' }}>Add another</button>
            </div>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', borderRadius: '8px', padding: '10px 14px', marginBottom: '14px' }}>
            <p style={{ margin: 0, fontSize: '12.5px', color: '#C0392B' }}>{error}</p>
          </div>
        )}

        {tab === 'manual' && !success && (
          <form onSubmit={handleManualSubmit}>
            <div style={row}>
              <label style={label}>Platform</label>
              <select value={form.platform} onChange={e => setField('platform', e.target.value)} style={sel}>
                {PLATFORMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>

            <div style={grid2}>
              <div>
                <label style={label}>Display name</label>
                <input value={form.displayName} onChange={e => setField('displayName', e.target.value)} placeholder="Rotas da Bruna" style={inp} />
              </div>
              <div>
                <label style={label}>Username</label>
                <input value={form.username} onChange={e => setField('username', e.target.value)} placeholder="rotasdabruna" style={inp} />
              </div>
            </div>

            <div style={row}>
              <label style={label}>Profile URL</label>
              <input value={form.profileUrl} onChange={e => setField('profileUrl', e.target.value)} placeholder="https://www.instagram.com/rotasdabruna/" style={inp} />
            </div>

            <div style={grid2}>
              <div>
                <label style={label}>Country</label>
                <input value={form.country} onChange={e => setField('country', e.target.value)} placeholder="Portugal" style={inp} />
              </div>
              <div>
                <label style={label}>Email <span style={{ color: '#B5AA99', fontWeight: '400' }}>(optional)</span></label>
                <input type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="contact@..." style={inp} />
              </div>
            </div>

            <div style={grid2}>
              <div>
                <label style={label}>Followers <span style={{ color: '#B5AA99', fontWeight: '400' }}>(optional)</span></label>
                <input type="number" value={form.followerCount} onChange={e => setField('followerCount', e.target.value)} placeholder="45000" style={inp} min="0" />
              </div>
              <div>
                <label style={label}>Engagement % <span style={{ color: '#B5AA99', fontWeight: '400' }}>(optional)</span></label>
                <input type="number" value={form.engagementRate} onChange={e => setField('engagementRate', e.target.value)} placeholder="3.5" step="0.1" style={inp} min="0" max="100" />
              </div>
            </div>

            <div style={row}>
              <label style={label}>Bio / notes <span style={{ color: '#B5AA99', fontWeight: '400' }}>(optional)</span></label>
              <textarea value={form.bio} onChange={e => setField('bio', e.target.value)} rows={2} placeholder="Travel creator based in Portugal..." style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <div style={row}>
              <label style={label}>Score <span style={{ color: '#B5AA99', fontWeight: '400' }}>(0–10, optional)</span></label>
              <input type="number" value={form.score} onChange={e => setField('score', e.target.value)} placeholder="—" step="0.1" min="0" max="10" style={{ ...inp, maxWidth: '200px' }} />
            </div>

            <div style={{ ...row, marginBottom: '20px' }}>
              <label style={label}>Internal notes <span style={{ color: '#B5AA99', fontWeight: '400' }}>(optional)</span></label>
              <textarea value={form.notes} onChange={e => setField('notes', e.target.value)} rows={2} placeholder="How we found this creator, context..." style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={onClose} style={S.btnSecondary}>Cancel</button>
              <button type="submit" disabled={loading} style={{ ...S.btnPrimary, opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Saving…' : 'Add lead'}
              </button>
            </div>
          </form>
        )}

        {tab === 'instagram' && !success && (
          <form onSubmit={handleInstagramSubmit}>
            <p style={{ fontSize: '12.5px', color: '#4A433A', marginTop: 0, marginBottom: '16px', lineHeight: '1.6' }}>
              Paste an Instagram profile URL. We will try to enrich the lead automatically with public data via the Instagram API.
            </p>
            <div style={{ ...row, marginBottom: '20px' }}>
              <label style={label}>Instagram profile URL</label>
              <input
                value={igUrl}
                onChange={e => { setIgUrl(e.target.value); resetState(); }}
                placeholder="https://www.instagram.com/rotasdabruna/"
                style={inp}
                autoFocus
              />
              <p style={{ fontSize: '11px', color: '#8C8070', margin: '5px 0 0' }}>
                Accepted: profile URL, @username, or plain username.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button type="button" onClick={onClose} style={S.btnSecondary}>Cancel</button>
              <button type="submit" disabled={loading || !igUrl.trim()} style={{ ...S.btnPrimary, opacity: (loading || !igUrl.trim()) ? 0.7 : 1 }}>
                {loading
                  ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Importing…</>
                  : <><Instagram size={12} /> Import</>
                }
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function CreatorCRMPage() {
  const { getToken }     = useAuth();
  const navigate         = useNavigate();
  const [searchParams]   = useSearchParams();

  const [leads, setLeads]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]           = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingLead, setEditingLead]   = useState(null);

  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [toast, setToast]               = useState(null);
  const [bulkStatus, setBulkStatus]     = useState('');
  const [bulkConfirm, setBulkConfirm]   = useState(false);
  const [bulkLoading, setBulkLoading]   = useState(false);

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
      setSelectedLeads(new Set());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken, filters, page]);

  useEffect(() => { load(); }, [load]);

  const activeFilters = Object.entries(filters).filter(([k, v]) => v && v !== 'false' && k !== 'q').length;

  const allPageSelected = leads.length > 0 && leads.every(l => selectedLeads.has(l.id));
  const somePageSelected = leads.some(l => selectedLeads.has(l.id));

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  function toggleSelect(id) {
    setSelectedLeads(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedLeads(s => {
      const next = new Set(s);
      if (allPageSelected) leads.forEach(l => next.delete(l.id));
      else leads.forEach(l => next.add(l.id));
      return next;
    });
  }

  async function handleBulkApply() {
    if (!bulkStatus || selectedLeads.size === 0) return;
    setBulkLoading(true);
    try {
      await crmCall(getToken, 'leads.bulkChangeStatus', {
        leadIds: [...selectedLeads],
        updates: { status: bulkStatus },
      });
      showToast(`Status updated for ${selectedLeads.size} lead${selectedLeads.size > 1 ? 's' : ''}`);
      setSelectedLeads(new Set());
      setBulkStatus('');
      setBulkConfirm(false);
      load();
    } catch (e) {
      showToast(e.message || 'Bulk update failed', 'error');
      setBulkConfirm(false);
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div style={S.page}>
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9000, padding: '12px 18px', borderRadius: '8px', background: toast.type === 'error' ? '#C0392B' : '#1B6B65', color: 'white', fontSize: '13px', fontWeight: '500', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: '320px' }}>
          {toast.msg}
        </div>
      )}
      {editingLead && (
        <EditLeadModal
          lead={editingLead}
          getToken={getToken}
          onClose={() => setEditingLead(null)}
          onSaved={updated => {
            setLeads(ls => ls.map(l => l.id === updated.id ? { ...l, ...updated } : l));
            setEditingLead(null);
            showToast('Lead updated');
          }}
        />
      )}
      {showAddModal && (
        <AddLeadModal
          getToken={getToken}
          navigate={navigate}
          onClose={() => setShowAddModal(false)}
          onCreated={() => { load(); }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={S.title}>Travel Designer CRM</h1>
          <p style={S.sub}>{total} lead{total !== 1 ? 's' : ''} total</p>
        </div>
        <button onClick={() => setShowAddModal(true)} style={S.btnPrimary}>
          <Plus size={14} /> Add lead
        </button>
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

      {selectedLeads.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', background: '#1C1A16', color: 'white', borderRadius: '8px', padding: '10px 16px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12.5px', fontWeight: '600', flexShrink: 0 }}>
            {selectedLeads.size} selected
          </span>
          <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
          {!bulkConfirm ? (
            <>
              <select value={bulkStatus} onChange={e => setBulkStatus(e.target.value)}
                style={{ padding: '5px 8px', borderRadius: '5px', border: 'none', fontSize: '12px', color: '#1C1A16', background: 'white', cursor: 'pointer' }}>
                <option value="">Change status to…</option>
                {PIPELINE_STATUSES.map(s => (
                  <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                ))}
              </select>
              <button onClick={() => { if (bulkStatus) setBulkConfirm(true); }} disabled={!bulkStatus}
                style={{ padding: '5px 12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', background: '#C9A96E', color: '#1C1A16', opacity: bulkStatus ? 1 : 0.5 }}>
                Apply
              </button>
              <button onClick={() => { setSelectedLeads(new Set()); setBulkStatus(''); }}
                style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '12px', background: 'transparent', color: 'white', marginLeft: 'auto' }}>
                Clear
              </button>
            </>
          ) : (
            <>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.85)' }}>
                Change {selectedLeads.size} lead{selectedLeads.size > 1 ? 's' : ''} to <strong style={{ color: 'white' }}>{bulkStatus.replace(/_/g, ' ')}</strong>?
              </span>
              <button onClick={handleBulkApply} disabled={bulkLoading}
                style={{ padding: '5px 12px', borderRadius: '5px', border: 'none', cursor: 'pointer', fontSize: '12px', fontWeight: '600', background: '#1B6B65', color: 'white' }}>
                {bulkLoading ? 'Updating…' : 'Confirm'}
              </button>
              <button onClick={() => setBulkConfirm(false)} disabled={bulkLoading}
                style={{ padding: '5px 10px', borderRadius: '5px', border: '1px solid rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: '12px', background: 'transparent', color: 'white' }}>
                Cancel
              </button>
            </>
          )}
        </div>
      )}

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
                  <th style={{ ...S.th, width: '36px', padding: '9px 8px 9px 14px' }}>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                      onChange={toggleAll}
                      style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#1B6B65' }}
                    />
                  </th>
                  {['Creator','Platform','Followers','Engagement','Country','Score','Priority','Status','Last Contact','Follow-up','Actions'].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leads.map(lead => (
                  <tr key={lead.id} style={{ borderBottom: '1px solid #F4F1EC', background: selectedLeads.has(lead.id) ? '#F8F6F2' : 'transparent' }}>
                    <td style={{ padding: '10px 8px 10px 14px', verticalAlign: 'middle', width: '36px' }}>
                      <input
                        type="checkbox"
                        checked={selectedLeads.has(lead.id)}
                        onChange={() => toggleSelect(lead.id)}
                        style={{ cursor: 'pointer', width: '14px', height: '14px', accentColor: '#1B6B65' }}
                      />
                    </td>
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
                      {fmtFollowers(lead.followersCount)}
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
                        <button onClick={() => setEditingLead(lead)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px', color: '#8C8070', display: 'flex', alignItems: 'center' }} title="Edit lead">
                          <Pencil size={13} />
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
