import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Plus, Search, Eye, X, ChevronDown } from 'lucide-react';
import { useAgencyCtx } from '../../lib/useAgencyCtx.jsx';

/* ─── Design tokens ─────────────────────────────────────────── */
const C = {
  teal:     '#1B6B65',
  gold:     '#C9A96E',
  stone:    '#FAFAF8',
  charcoal: '#1C1A16',
  muted:    '#8C8070',
  border:   '#E8E3DA',
  lightBg:  '#F7F4F0',
  hoverBg:  '#F5F1EB',
};

/* ─── Status config ─────────────────────────────────────────── */
const STATUS_CONFIG = {
  draft:     { label: 'Draft',     bg: '#F5F1EB', color: C.charcoal },
  sent:      { label: 'Sent',      bg: C.teal,    color: '#FFFFFF'  },
  viewed:    { label: 'Viewed',    bg: C.gold,    color: C.charcoal },
  confirmed: { label: 'Confirmed', bg: '#2D6A4F', color: '#FFFFFF'  },
  archived:  { label: 'Archived',  bg: C.muted,   color: '#FFFFFF'  },
};

const STATUS_FILTERS = ['all', 'draft', 'sent', 'viewed', 'confirmed', 'archived'];

/* ─── Helpers ───────────────────────────────────────────────── */
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, bg: C.lightBg, color: C.charcoal };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '100px',
      fontSize: '11px',
      fontWeight: '600',
      letterSpacing: '0.03em',
      background: cfg.bg,
      color: cfg.color,
      textTransform: 'capitalize',
    }}>
      {cfg.label}
    </span>
  );
}

/* ─── Select helper ─────────────────────────────────────────── */
function Select({ value, onChange, children, placeholder, disabled }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          width: '100%',
          padding: '9px 36px 9px 12px',
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          fontSize: '14px',
          color: value ? C.charcoal : C.muted,
          background: '#FFFFFF',
          appearance: 'none',
          cursor: 'pointer',
          outline: 'none',
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown
        size={14}
        style={{
          position: 'absolute', right: 10, top: '50%',
          transform: 'translateY(-50%)',
          color: C.muted, pointerEvents: 'none',
        }}
      />
    </div>
  );
}

/* ─── Field wrapper ─────────────────────────────────────────── */
function Field({ label, children, required }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={{ fontSize: '12px', fontWeight: '600', color: C.charcoal, letterSpacing: '0.02em' }}>
        {label}{required && <span style={{ color: '#C0392B', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function Input({ value, onChange, type = 'text', placeholder, min }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      style={{
        width: '100%',
        padding: '9px 12px',
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
        fontSize: '14px',
        color: C.charcoal,
        background: '#FFFFFF',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

/* ─── Create Trip Modal ─────────────────────────────────────── */
const TABS = [
  { key: 'scratch',   label: 'From Scratch' },
  { key: 'template',  label: 'From Template' },
  { key: 'duplicate', label: 'Duplicate' },
];

function CreateTripModal({ onClose, onCreated, agencyId, getToken, clients, templates, trips, defaultClientId }) {
  const [activeTab, setActiveTab] = useState('scratch');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /* scratch */
  const [scratchTitle, setScratchTitle]       = useState('');
  const [scratchClient, setScratchClient]     = useState(defaultClientId || '');
  const [scratchStart, setScratchStart]       = useState('');
  const [scratchEnd, setScratchEnd]           = useState('');
  const [scratchDuration, setScratchDuration] = useState('');

  /* template */
  const [tmplId, setTmplId]       = useState('');
  const [tmplClient, setTmplClient] = useState(defaultClientId || '');
  const [tmplTitle, setTmplTitle]   = useState('');
  const [tmplStart, setTmplStart]   = useState('');
  const [tmplEnd, setTmplEnd]       = useState('');

  /* duplicate */
  const [dupSource, setDupSource]   = useState('');
  const [dupClient, setDupClient]   = useState(defaultClientId || '');
  const [dupTitle, setDupTitle]     = useState('');

  /* Pre-fill template title when template selected */
  useEffect(() => {
    if (!tmplId) { setTmplTitle(''); return; }
    const t = templates.find(t => t.id === tmplId);
    if (t) setTmplTitle(t.name);
  }, [tmplId, templates]);

  /* Pre-fill duplicate title when source selected */
  useEffect(() => {
    if (!dupSource) { setDupTitle(''); return; }
    const trip = trips.find(t => t.id === dupSource);
    if (trip) setDupTitle(`${trip.title} (Copy)`);
  }, [dupSource, trips]);

  async function handleSubmit() {
    setError('');
    let body = { agencyId };

    if (activeTab === 'scratch') {
      if (!scratchTitle.trim()) { setError('Title is required.'); return; }
      body = {
        ...body, mode: 'scratch',
        title: scratchTitle.trim(),
        clientId: scratchClient || undefined,
        startDate: scratchStart || undefined,
        endDate: scratchEnd || undefined,
        durationDays: scratchDuration ? parseInt(scratchDuration, 10) : undefined,
      };
    } else if (activeTab === 'template') {
      if (!tmplId) { setError('Please select a template.'); return; }
      if (!tmplTitle.trim()) { setError('Title is required.'); return; }
      body = {
        ...body, mode: 'template',
        templateId: tmplId,
        clientId: tmplClient || undefined,
        title: tmplTitle.trim(),
        startDate: tmplStart || undefined,
        endDate: tmplEnd || undefined,
      };
    } else {
      if (!dupSource) { setError('Please select a source trip.'); return; }
      if (!dupTitle.trim()) { setError('Title is required.'); return; }
      body = {
        ...body, mode: 'duplicate',
        sourceAgencyTripId: dupSource,
        clientId: dupClient || undefined,
        title: dupTitle.trim(),
      };
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=trips:create&agencyId=${agencyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create trip.');
      }
      const { agencyTripId } = await res.json();
      onCreated(agencyTripId);
    } catch (e) {
      setError(e.message);
      setSubmitting(false);
    }
  }

  /* Non-archived trips for duplicate source */
  const nonArchived = trips.filter(t => t.status !== 'archived');

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000,
      padding: '16px',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        width: '100%', maxWidth: '520px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.18)',
        display: 'flex', flexDirection: 'column',
        maxHeight: '92vh',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '16px', fontWeight: '700', color: C.charcoal }}>
            New Trip
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '4px', display: 'flex', alignItems: 'center',
              color: C.muted, borderRadius: '6px',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab bar */}
        <div style={{
          display: 'flex',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(''); }}
              style={{
                flex: 1,
                padding: '12px 8px',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.key ? `2px solid ${C.teal}` : '2px solid transparent',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: activeTab === tab.key ? '600' : '400',
                color: activeTab === tab.key ? C.teal : C.muted,
                transition: 'color 0.12s, border-color 0.12s',
                marginBottom: '-1px',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
          {activeTab === 'scratch' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Field label="Title" required>
                <Input
                  value={scratchTitle}
                  onChange={setScratchTitle}
                  placeholder="e.g. Morocco Discovery"
                />
              </Field>
              <Field label="Client">
                <Select value={scratchClient} onChange={setScratchClient} placeholder="No client selected">
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Start Date">
                  <Input type="date" value={scratchStart} onChange={setScratchStart} />
                </Field>
                <Field label="End Date">
                  <Input type="date" value={scratchEnd} onChange={setScratchEnd} />
                </Field>
              </div>
              <Field label="Duration (days)">
                <Input
                  type="number"
                  value={scratchDuration}
                  onChange={setScratchDuration}
                  placeholder="e.g. 7"
                  min="1"
                />
              </Field>
            </div>
          )}

          {activeTab === 'template' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Field label="Template" required>
                <Select
                  value={tmplId}
                  onChange={setTmplId}
                  placeholder={templates.length === 0 ? 'No templates available' : 'Select a template'}
                  disabled={templates.length === 0}
                >
                  {templates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Client">
                <Select value={tmplClient} onChange={setTmplClient} placeholder="No client selected">
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Title" required>
                <Input
                  value={tmplTitle}
                  onChange={setTmplTitle}
                  placeholder="Trip title"
                />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Start Date">
                  <Input type="date" value={tmplStart} onChange={setTmplStart} />
                </Field>
                <Field label="End Date">
                  <Input type="date" value={tmplEnd} onChange={setTmplEnd} />
                </Field>
              </div>
            </div>
          )}

          {activeTab === 'duplicate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <Field label="Source Trip" required>
                <Select
                  value={dupSource}
                  onChange={setDupSource}
                  placeholder={nonArchived.length === 0 ? 'No trips available' : 'Select a trip to duplicate'}
                  disabled={nonArchived.length === 0}
                >
                  {nonArchived.map(t => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Client">
                <Select value={dupClient} onChange={setDupClient} placeholder="No client selected">
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Title" required>
                <Input
                  value={dupTitle}
                  onChange={setDupTitle}
                  placeholder="Trip title"
                />
              </Field>
            </div>
          )}

          {error && (
            <p style={{
              marginTop: '12px', marginBottom: 0,
              fontSize: '13px', color: '#C0392B',
              padding: '10px 14px',
              background: '#FDF2F2',
              borderRadius: '8px',
              border: '1px solid #F5C6CB',
            }}>
              {error}
            </p>
          )}
        </div>

        {/* Modal footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px',
          padding: '16px 24px',
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              padding: '9px 18px',
              background: 'none',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              color: C.charcoal,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              padding: '9px 20px',
              background: submitting ? '#A8C5C2' : C.teal,
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#FFFFFF',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {submitting ? 'Creating...' : 'Create Trip'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export default function AgencyTripsList() {
  const { agencyId } = useAgencyCtx();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const defaultClientId = searchParams.get('clientId') || '';

  const [trips, setTrips]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [statusFilter, setFilter] = useState('all');
  const [search, setSearch]       = useState('');
  const [showModal, setShowModal] = useState(false);

  /* Data for modal */
  const [clients, setClients]     = useState([]);
  const [templates, setTemplates] = useState([]);
  const [modalReady, setModalReady] = useState(false);

  /* Debounce search */
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  /* Fetch trips */
  const fetchTrips = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    try {
      const token = await getToken();
      const params = new URLSearchParams({ action: 'trips:list', agencyId });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const res = await fetch(`/api/agency?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch trips');
      const data = await res.json();
      setTrips(data.trips || []);
    } catch {
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }, [agencyId, getToken, statusFilter, debouncedSearch]);

  useEffect(() => { fetchTrips(); }, [fetchTrips]);

  /* Fetch modal support data on demand */
  async function openModal() {
    setShowModal(true);
    if (modalReady) return;
    try {
      const token = await getToken();
      const [cRes, tRes] = await Promise.all([
        fetch(`/api/agency?action=clients:list&agencyId=${agencyId}`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/agency?action=templates:list&agencyId=${agencyId}`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [cData, tData] = await Promise.all([
        cRes.ok ? cRes.json() : { clients: [] },
        tRes.ok ? tRes.json() : { templates: [] },
      ]);
      setClients(cData.clients || []);
      setTemplates(tData.templates || []);
      setModalReady(true);
    } catch {
      setModalReady(true);
    }
  }

  function handleCreated(agencyTripId) {
    navigate(`/agency/trips/${agencyTripId}`);
  }

  const pillStyle = (active) => ({
    padding: '5px 14px',
    borderRadius: '100px',
    border: `1px solid ${active ? C.teal : C.border}`,
    background: active ? C.teal : '#FFFFFF',
    color: active ? '#FFFFFF' : C.muted,
    fontSize: '13px',
    fontWeight: active ? '600' : '400',
    cursor: 'pointer',
    transition: 'all 0.12s',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '32px 28px', maxWidth: '1100px', margin: '0 auto' }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '22px',
          fontWeight: '700',
          color: C.charcoal,
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          Trips
        </h1>
        <button
          onClick={openModal}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '9px 18px',
            background: C.teal,
            border: 'none',
            borderRadius: '9px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#FFFFFF',
            cursor: 'pointer',
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          New Trip
        </button>
      </div>

      {/* Filter row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        marginBottom: '20px', flexWrap: 'wrap',
      }}>
        {/* Status pills */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1 }}>
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              style={pillStyle(statusFilter === s)}
            >
              {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
            </button>
          ))}
        </div>

        {/* Search */}
        <div style={{ position: 'relative', minWidth: '200px' }}>
          <Search
            size={14}
            style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)',
              color: C.muted, pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search trips..."
            style={{
              padding: '8px 12px 8px 32px',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              fontSize: '13px',
              color: C.charcoal,
              background: '#FFFFFF',
              outline: 'none',
              width: '100%',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Table card */}
      <div style={{
        background: '#FFFFFF',
        border: `1px solid ${C.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
      }}>
        {loading ? (
          <div style={{
            padding: '48px', textAlign: 'center',
            fontSize: '14px', color: C.muted,
          }}>
            Loading trips...
          </div>
        ) : trips.length === 0 ? (
          <div style={{
            padding: '56px', textAlign: 'center',
            fontSize: '14px', color: C.muted,
          }}>
            No trips yet.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${C.border}` }}>
                  {['Trip name', 'Client', 'Status', 'Created', 'Actions'].map((col, i) => (
                    <th
                      key={col}
                      style={{
                        padding: '11px 16px',
                        textAlign: i === 4 ? 'right' : 'left',
                        fontSize: '11px',
                        fontWeight: '600',
                        letterSpacing: '0.05em',
                        textTransform: 'uppercase',
                        color: C.muted,
                        background: C.lightBg,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {trips.map((trip, idx) => (
                  <TripRow
                    key={trip.id}
                    trip={trip}
                    isLast={idx === trips.length - 1}
                    onNavigate={() => navigate(`/agency/trips/${trip.id}`)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <CreateTripModal
          onClose={() => setShowModal(false)}
          onCreated={handleCreated}
          agencyId={agencyId}
          getToken={getToken}
          clients={clients}
          templates={templates}
          trips={trips}
          defaultClientId={defaultClientId}
        />
      )}
    </div>
  );
}

/* ─── Trip row ──────────────────────────────────────────────── */
function TripRow({ trip, isLast, onNavigate }) {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      onClick={onNavigate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: isLast ? 'none' : `1px solid ${C.border}`,
        background: hovered ? C.hoverBg : '#FFFFFF',
        cursor: 'pointer',
        transition: 'background 0.1s',
      }}
    >
      <td style={{ padding: '13px 16px', fontSize: '14px', fontWeight: '500', color: C.charcoal }}>
        {trip.title || 'Untitled trip'}
      </td>
      <td style={{ padding: '13px 16px', fontSize: '13px', color: trip.clientName ? C.charcoal : C.muted }}>
        {trip.clientName || 'No client'}
      </td>
      <td style={{ padding: '13px 16px' }}>
        <StatusBadge status={trip.status} />
      </td>
      <td style={{ padding: '13px 16px', fontSize: '13px', color: C.muted, whiteSpace: 'nowrap' }}>
        {fmtDate(trip.createdAt)}
      </td>
      <td style={{ padding: '13px 16px', textAlign: 'right' }}>
        <Link
          to={`/agency/trips/${trip.id}`}
          onClick={e => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '5px 12px',
            border: `1px solid ${C.border}`,
            borderRadius: '7px',
            fontSize: '12px',
            fontWeight: '500',
            color: C.charcoal,
            textDecoration: 'none',
            background: '#FFFFFF',
            transition: 'background 0.1s, border-color 0.1s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = C.lightBg;
            e.currentTarget.style.borderColor = C.muted;
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#FFFFFF';
            e.currentTarget.style.borderColor = C.border;
          }}
        >
          <Eye size={12} strokeWidth={2} />
          View
        </Link>
      </td>
    </tr>
  );
}
