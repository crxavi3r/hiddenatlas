import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { X, Plus, Check, ChevronDown, Copy, Layout, FileText } from 'lucide-react';
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
  error:    '#C0392B',
};

/* ─── Shared field primitives ─────────────────────────────────── */
const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  fontSize: '14px',
  color: C.charcoal,
  background: '#FFFFFF',
  outline: 'none',
  boxSizing: 'border-box',
};

function Field({ label, required, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{
        fontSize: '12px', fontWeight: '600', color: C.charcoal, letterSpacing: '0.02em',
      }}>
        {label}
        {required && <span style={{ color: C.error, marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = 'text', min }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      min={min}
      style={inputStyle}
    />
  );
}

/* ─── Native select wrapper ───────────────────────────────────── */
function SelectInput({ value, onChange, placeholder, children, disabled }) {
  return (
    <div style={{ position: 'relative' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        style={{
          ...inputStyle,
          paddingRight: '36px',
          appearance: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: value ? C.charcoal : C.muted,
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

/* ─── Searchable client picker ──────────────────────────────── */
function ClientPicker({ value, onChange, clients, onClientsUpdate, agencyId, getToken }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const selected = clients.find(c => c.id === value);

  const filtered = query
    ? clients.filter(c =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        (c.email || '').toLowerCase().includes(query.toLowerCase()),
      )
    : clients;

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setShowNewForm(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function handleOpen() {
    setOpen(true);
    setQuery('');
    setShowNewForm(false);
    setTimeout(() => inputRef.current?.focus(), 40);
  }

  function handleSelect(clientId) {
    onChange(clientId);
    setOpen(false);
    setQuery('');
  }

  async function handleCreate() {
    if (!newName.trim()) { setCreateError('Name is required.'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=clients:create&agencyId=${agencyId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: newName.trim(), email: newEmail.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'Failed to create client.');
      }
      const data = await res.json();
      const created = data.client ?? data;
      onClientsUpdate(prev => [...prev, created]);
      onChange(created.id);
      setOpen(false);
      setShowNewForm(false);
      setNewName('');
      setNewEmail('');
    } catch (err) {
      setCreateError(err.message || 'Something went wrong.');
    } finally {
      setCreating(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        type="button"
        onClick={handleOpen}
        style={{
          ...inputStyle,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          textAlign: 'left',
          background: open ? '#FFFFFF' : C.stone,
          border: `1px solid ${open ? C.teal : C.border}`,
        }}
      >
        <span style={{ color: selected ? C.charcoal : C.muted }}>
          {selected ? selected.name : 'Search or select client...'}
        </span>
        <ChevronDown size={14} style={{ color: C.muted, flexShrink: 0 }} />
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          background: '#FFFFFF',
          border: `1px solid ${C.border}`,
          borderRadius: '10px',
          boxShadow: '0 8px 24px rgba(28,26,22,0.13)',
          zIndex: 200,
          overflow: 'hidden',
        }}>
          {/* Search input */}
          <div style={{ padding: '8px', borderBottom: `1px solid ${C.border}` }}>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search by name or email..."
              style={{
                ...inputStyle,
                padding: '7px 10px',
                background: C.stone,
                fontSize: '13px',
              }}
            />
          </div>

          {/* Client list */}
          <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {value && (
              <button
                type="button"
                onClick={() => handleSelect('')}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 14px',
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '13px', color: C.muted, borderBottom: `1px solid ${C.border}`,
                }}
              >
                Clear selection
              </button>
            )}
            {filtered.length === 0 ? (
              <p style={{ padding: '12px 14px', fontSize: '13px', color: C.muted, margin: 0 }}>
                No clients found.
              </p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 14px',
                    background: c.id === value ? C.lightBg : 'none',
                    border: 'none',
                    borderBottom: `1px solid ${C.border}`,
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1px',
                  }}
                >
                  <span style={{ fontSize: '13px', fontWeight: '600', color: C.charcoal }}>
                    {c.name}
                    {c.id === value && (
                      <Check size={12} style={{ color: C.teal, marginLeft: '6px', verticalAlign: 'middle' }} />
                    )}
                  </span>
                  {c.email && (
                    <span style={{ fontSize: '11px', color: C.muted }}>{c.email}</span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Add new client */}
          {!showNewForm ? (
            <button
              type="button"
              onClick={() => setShowNewForm(true)}
              style={{
                width: '100%',
                textAlign: 'left',
                padding: '10px 14px',
                background: 'none',
                border: 'none',
                borderTop: `1px solid ${C.border}`,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '7px',
                fontSize: '13px',
                fontWeight: '600',
                color: C.teal,
              }}
            >
              <Plus size={13} strokeWidth={2.5} />
              Create new client
            </button>
          ) : (
            <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}`, background: C.stone }}>
              <p style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '8px' }}>
                New client
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Name *"
                  style={{ ...inputStyle, padding: '7px 10px', fontSize: '13px' }}
                />
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder="Email"
                  style={{ ...inputStyle, padding: '7px 10px', fontSize: '13px' }}
                />
                {createError && (
                  <p style={{ margin: 0, fontSize: '12px', color: C.error }}>{createError}</p>
                )}
                <div style={{ display: 'flex', gap: '7px' }}>
                  <button
                    type="button"
                    onClick={() => { setShowNewForm(false); setCreateError(''); }}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      background: 'transparent',
                      border: `1px solid ${C.border}`,
                      borderRadius: '7px',
                      fontSize: '12px',
                      fontWeight: '500',
                      color: C.charcoal,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={creating}
                    style={{
                      flex: 1,
                      padding: '7px 10px',
                      background: creating ? '#9EC4C1' : C.teal,
                      border: 'none',
                      borderRadius: '7px',
                      fontSize: '12px',
                      fontWeight: '600',
                      color: '#FFFFFF',
                      cursor: creating ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {creating ? 'Adding...' : 'Add'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Mode card ─────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
function ModeCard({ icon: Icon, title, description, selected, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '14px',
        padding: '16px',
        border: `2px solid ${selected ? C.teal : C.border}`,
        borderRadius: '10px',
        background: selected ? '#EFF6F5' : '#FFFFFF',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.12s, background 0.12s',
        width: '100%',
      }}
    >
      <div style={{
        flexShrink: 0,
        width: '36px',
        height: '36px',
        borderRadius: '8px',
        background: selected ? C.teal : C.lightBg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon size={17} color={selected ? '#FFFFFF' : C.muted} />
      </div>
      <div>
        <p style={{ margin: '0 0 3px', fontSize: '14px', fontWeight: '600', color: C.charcoal }}>
          {title}
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: C.muted, lineHeight: '1.45' }}>
          {description}
        </p>
      </div>
      {selected && (
        <div style={{ marginLeft: 'auto', flexShrink: 0, paddingTop: '2px' }}>
          <Check size={16} color={C.teal} />
        </div>
      )}
    </button>
  );
}

/* ─── Main component ─────────────────────────────────────────── */
export default function AgencyTripCreate({ open, onClose, onCreated, defaultClientId }) {
  const { agencyId } = useAgencyCtx();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  /* Step 1: mode selection. Step 2: form */
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState('scratch'); // scratch | template | duplicate

  /* Form fields */
  const [title, setTitle]           = useState('');
  const [clientId, setClientId]     = useState(defaultClientId || '');
  const [destination, setDestination] = useState('');
  const [startDate, setStartDate]   = useState('');
  const [endDate, setEndDate]       = useState('');
  const [agentId, setAgentId]       = useState('');
  const [templateId, setTemplateId] = useState('');
  const [sourceTrip, setSourceTrip] = useState('');

  /* Data */
  const [clients, setClients]       = useState([]);
  const [templates, setTemplates]   = useState([]);
  const [trips, setTrips]           = useState([]);
  const [members, setMembers]       = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  /* UI */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState('');

  /* Lock body scroll when open */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  /* Reset + fetch data when opening */
  useEffect(() => {
    if (!open || !agencyId) return;

    setStep(1);
    setMode('scratch');
    setTitle('');
    setClientId(defaultClientId || '');
    setDestination('');
    setStartDate('');
    setEndDate('');
    setAgentId('');
    setTemplateId('');
    setSourceTrip('');
    setError('');

    setDataLoading(true);
    async function load() {
      try {
        const token = await getToken();
        const h = { Authorization: `Bearer ${token}` };
        const [cRes, tRes, trRes, mRes] = await Promise.all([
          fetch(`/api/agency?action=clients:list&agencyId=${agencyId}`, { headers: h }),
          fetch(`/api/agency?action=templates:list&agencyId=${agencyId}`, { headers: h }),
          fetch(`/api/agency?action=trips:list&agencyId=${agencyId}`, { headers: h }),
          fetch(`/api/agency?action=members&agencyId=${agencyId}`, { headers: h }),
        ]);
        const [cData, tData, trData, mData] = await Promise.all([
          cRes.ok  ? cRes.json()  : { clients: [] },
          tRes.ok  ? tRes.json()  : { templates: [] },
          trRes.ok ? trRes.json() : { trips: [] },
          mRes.ok  ? mRes.json()  : { members: [] },
        ]);
        setClients(cData.clients   || []);
        setTemplates(tData.templates || []);
        setTrips(trData.trips        || []);
        setMembers(mData.members     || []);
      } catch {
        /* silently fall through — lists will be empty */
      } finally {
        setDataLoading(false);
      }
    }
    load();
  }, [open, agencyId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Pre-fill title from template */
  useEffect(() => {
    if (!templateId) return;
    const t = templates.find(t => t.id === templateId);
    if (t && !title) setTitle(t.name);
  }, [templateId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Pre-fill title from duplicate source */
  useEffect(() => {
    if (!sourceTrip) return;
    const t = trips.find(t => t.id === sourceTrip);
    if (t && !title) setTitle(`${t.title || 'Untitled'} (Copy)`);
  }, [sourceTrip]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!title.trim()) { setError('Trip name is required.'); return; }
    if (mode === 'template' && !templateId) { setError('Please select a template.'); return; }
    if (mode === 'duplicate' && !sourceTrip) { setError('Please select a source trip.'); return; }

    const body = {
      agencyId,
      mode,
      title: title.trim(),
      clientId:     clientId   || undefined,
      destination:  destination.trim() || undefined,
      startDate:    startDate  || undefined,
      endDate:      endDate    || undefined,
      agentId:      agentId    || undefined,
      ...(mode === 'template'  ? { templateId } : {}),
      ...(mode === 'duplicate' ? { sourceAgencyTripId: sourceTrip } : {}),
    };

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
      const { agencyTripId, tripId } = await res.json();
      onCreated?.(agencyTripId, tripId);
      onClose();
      navigate(`/agency/trips/${agencyTripId}`);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const nonArchivedTrips = trips.filter(t => t.status !== 'archived');

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(28,26,22,0.50)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{
        background: '#FFFFFF',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '92vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(28,26,22,0.20)',
        overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{
              margin: 0,
              fontSize: '17px',
              fontWeight: '700',
              color: C.charcoal,
              fontFamily: "'Playfair Display', Georgia, serif",
            }}>
              {step === 1 ? 'New Trip' : 'Trip Details'}
            </h2>
            {step === 2 && (
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted }}>
                {mode === 'scratch'    ? 'Starting from scratch'      :
                 mode === 'template'  ? 'Using a template'           :
                                        'Duplicating an existing trip'}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px',
              color: C.muted,
              display: 'flex',
              alignItems: 'center',
              borderRadius: '6px',
            }}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Progress indicator */}
        <div style={{
          display: 'flex',
          gap: 0,
          flexShrink: 0,
          borderBottom: `1px solid ${C.border}`,
        }}>
          {['Choose type', 'Fill details'].map((label, i) => {
            const active = step === i + 1;
            const done   = step > i + 1;
            return (
              <div
                key={label}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderBottom: active ? `2px solid ${C.teal}` : '2px solid transparent',
                  marginBottom: '-1px',
                }}
              >
                <span style={{
                  width: '20px',
                  height: '20px',
                  borderRadius: '50%',
                  background: done ? C.teal : active ? C.teal : C.border,
                  color: '#FFFFFF',
                  fontSize: '11px',
                  fontWeight: '700',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {done ? <Check size={11} /> : i + 1}
                </span>
                <span style={{
                  fontSize: '12px',
                  fontWeight: active ? '600' : '400',
                  color: active ? C.charcoal : C.muted,
                }}>
                  {label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Body */}
        <form
          onSubmit={handleSubmit}
          style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          {/* Step 1: mode selection */}
          {step === 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <ModeCard
                icon={FileText}
                title="Start from Scratch"
                description="Build the itinerary day-by-day yourself."
                selected={mode === 'scratch'}
                onClick={() => setMode('scratch')}
              />
              <ModeCard
                icon={Layout}
                title="Use a Template"
                description={templates.length === 0
                  ? 'No templates available yet. Create one in Templates.'
                  : `Choose from ${templates.length} saved template${templates.length !== 1 ? 's' : ''}.`}
                selected={mode === 'template'}
                onClick={() => setMode('template')}
              />
              <ModeCard
                icon={Copy}
                title="Duplicate Existing Trip"
                description={nonArchivedTrips.length === 0
                  ? 'No active trips to duplicate yet.'
                  : `Copy structure from one of ${nonArchivedTrips.length} existing trip${nonArchivedTrips.length !== 1 ? 's' : ''}.`}
                selected={mode === 'duplicate'}
                onClick={() => setMode('duplicate')}
              />
            </div>
          )}

          {/* Step 2: form */}
          {step === 2 && (
            <>
              {/* Template selector */}
              {mode === 'template' && (
                <Field label="Template" required>
                  <SelectInput
                    value={templateId}
                    onChange={setTemplateId}
                    placeholder={templates.length === 0 ? 'No templates available' : 'Select a template...'}
                    disabled={templates.length === 0}
                  >
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </SelectInput>
                </Field>
              )}

              {/* Source trip selector */}
              {mode === 'duplicate' && (
                <Field label="Source trip" required>
                  <SelectInput
                    value={sourceTrip}
                    onChange={setSourceTrip}
                    placeholder={nonArchivedTrips.length === 0 ? 'No trips available' : 'Select a trip to copy...'}
                    disabled={nonArchivedTrips.length === 0}
                  >
                    {nonArchivedTrips.map(t => (
                      <option key={t.id} value={t.id}>{t.title || 'Untitled trip'}</option>
                    ))}
                  </SelectInput>
                </Field>
              )}

              {/* Trip name */}
              <Field label="Trip name" required>
                <TextInput
                  value={title}
                  onChange={setTitle}
                  placeholder="e.g. Morocco in Spring"
                />
              </Field>

              {/* Client */}
              <Field label="Client">
                <ClientPicker
                  value={clientId}
                  onChange={setClientId}
                  clients={clients}
                  onClientsUpdate={setClients}
                  agencyId={agencyId}
                  getToken={getToken}
                />
              </Field>

              {/* Destination */}
              <Field label="Destination">
                <TextInput
                  value={destination}
                  onChange={setDestination}
                  placeholder="e.g. Morocco"
                />
              </Field>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Start date">
                  <TextInput type="date" value={startDate} onChange={setStartDate} />
                </Field>
                <Field label="End date">
                  <TextInput type="date" value={endDate} onChange={setEndDate} min={startDate || undefined} />
                </Field>
              </div>

              {/* Assigned agent */}
              <Field label="Assigned agent">
                <SelectInput
                  value={agentId}
                  onChange={setAgentId}
                  placeholder="No agent assigned"
                >
                  {members.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.name || m.email || m.id}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </>
          )}

          {/* Error */}
          {error && (
            <p style={{
              margin: 0,
              fontSize: '13px',
              color: C.error,
              padding: '10px 14px',
              background: '#FDF2F2',
              borderRadius: '8px',
              border: '1px solid #F5C6CB',
            }}>
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: step === 1 ? 'flex-end' : 'space-between',
          gap: '10px',
          padding: '16px 24px',
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          {step === 2 && (
            <button
              type="button"
              onClick={() => { setStep(1); setError(''); }}
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
              Back
            </button>
          )}

          <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
            <button
              type="button"
              onClick={onClose}
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

            {step === 1 ? (
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={dataLoading}
                style={{
                  padding: '9px 22px',
                  background: dataLoading ? '#9EC4C1' : C.teal,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#FFFFFF',
                  cursor: dataLoading ? 'not-allowed' : 'pointer',
                  transition: 'background 0.15s',
                }}
              >
                {dataLoading ? 'Loading...' : 'Continue'}
              </button>
            ) : (
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={submitting}
                style={{
                  padding: '9px 22px',
                  background: submitting ? '#9EC4C1' : C.teal,
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
