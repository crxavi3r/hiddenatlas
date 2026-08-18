import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, Edit2, Check, X, Mail, Phone, FileText, Plus, ExternalLink } from 'lucide-react';
import { useAgencyCtx } from '../../lib/useAgencyCtx.jsx';

const C = {
  teal:     '#1B6B65',
  gold:     '#C9A96E',
  stone:    '#FAFAF8',
  charcoal: '#1C1A16',
  muted:    '#8C8070',
  border:   '#E8E3DA',
  lightBg:  '#F7F4F0',
};

/* ─── Status config ─────────────────────────────────────────── */
const STATUS_CONFIG = {
  draft:      { bg: '#F5F1EB', color: '#6B5E50',  label: 'Draft' },
  ready:      { bg: '#EFF6F5', color: '#1B6B65',  label: 'Ready' },
  shared:     { bg: '#FBF8F1', color: '#B8851A',  label: 'Shared' },
  travelling: { bg: '#EAF4FB', color: '#1565C0',  label: 'Travelling' },
  completed:  { bg: '#E8F5E9', color: '#2E7D32',  label: 'Completed' },
  archived:   { bg: '#F5F5F5', color: '#9E9E9E',  label: 'Archived' },
};

const UPCOMING_STATUSES = new Set(['draft', 'ready', 'shared', 'travelling']);
const PAST_STATUSES     = new Set(['completed', 'archived']);

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] ?? { bg: C.lightBg, color: C.muted, label: status };
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '20px',
      fontSize: '11px',
      fontWeight: '700',
      textTransform: 'capitalize',
      letterSpacing: '0.04em',
      background: cfg.bg,
      color: cfg.color,
    }}>
      {cfg.label}
    </span>
  );
}

/* ─── Info row ──────────────────────────────────────────────── */
// eslint-disable-next-line no-unused-vars
function InfoRow({ icon: Icon, children, href }) {
  if (!children) return null;
  const content = (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
      <Icon size={15} style={{ color: C.muted, marginTop: '2px', flexShrink: 0 }} />
      <span style={{ fontSize: '14px', color: C.charcoal, lineHeight: '1.5', wordBreak: 'break-all' }}>
        {children}
      </span>
    </div>
  );
  if (href) {
    return (
      <a href={href} style={{ textDecoration: 'none', color: 'inherit' }}>
        {content}
      </a>
    );
  }
  return content;
}

/* ─── Form styles ───────────────────────────────────────────── */
const inputStyle = {
  width: '100%',
  padding: '9px 12px',
  border: `1px solid ${C.border}`,
  borderRadius: '8px',
  fontSize: '14px',
  color: C.charcoal,
  background: C.stone,
  outline: 'none',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '700',
  color: C.muted,
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

/* ─── Helpers ───────────────────────────────────────────────── */
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ─── Trip section ──────────────────────────────────────────── */
function TripSection({ title, trips, emptyMessage }) {
  const [hovered, setHovered] = useState(null);

  return (
    <div style={{ marginBottom: '24px' }}>
      <h2 style={{
        margin: '0 0 10px',
        fontSize: '15px',
        fontWeight: '700',
        color: C.charcoal,
        fontFamily: "'Playfair Display', Georgia, serif",
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        {title}
        {trips.length > 0 && (
          <span style={{
            fontSize: '11px',
            fontWeight: '600',
            color: C.muted,
            background: C.lightBg,
            padding: '2px 8px',
            borderRadius: '10px',
          }}>
            {trips.length}
          </span>
        )}
      </h2>

      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(28,26,22,0.06)',
      }}>
        {trips.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>{emptyMessage}</p>
          </div>
        ) : (
          trips.map((trip, idx) => (
            <Link
              key={trip.id}
              to={`/agency/trips/${trip.id}`}
              onMouseEnter={() => setHovered(trip.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '13px 18px',
                borderTop: idx === 0 ? 'none' : `1px solid ${C.border}`,
                background: hovered === trip.id ? C.lightBg : 'transparent',
                transition: 'background 0.1s',
                gap: '12px',
                textDecoration: 'none',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  margin: '0 0 3px',
                  fontSize: '14px',
                  fontWeight: '600',
                  color: C.charcoal,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {trip.title || 'Untitled Trip'}
                </p>
                <p style={{ margin: 0, fontSize: '12px', color: C.muted }}>
                  {trip.destination
                    ? `${trip.destination}${trip.startDate ? ` · ${formatDate(trip.startDate)}` : ''}`
                    : trip.startDate
                      ? formatDate(trip.startDate)
                      : `Created ${formatDate(trip.createdAt)}`}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                <StatusBadge status={trip.status} />
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '12px', fontWeight: '600',
                  color: C.teal,
                  padding: '5px 10px',
                  borderRadius: '6px',
                  border: `1px solid ${C.teal}22`,
                  background: `${C.teal}09`,
                }}>
                  <ExternalLink size={12} />
                  View
                </span>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export default function AgencyClientDetail() {
  const { clientId } = useParams();
  const { agencyId } = useAgencyCtx();
  const { getToken } = useAuth();

  const [client, setClient]       = useState(null);
  const [trips, setTrips]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  const [editing, setEditing]     = useState(false);
  const [form, setForm]           = useState({ name: '', email: '', phone: '', notes: '' });
  const [saving, setSaving]       = useState(false);
  const [saveError, setSaveError] = useState('');

  const fetchDetail = useCallback(async () => {
    if (!agencyId || !clientId) return;
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const params = new URLSearchParams({ action: 'detail', agencyId, clientId });
      const res = await fetch(`/api/agency-clients?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) throw new Error('Client not found.');
        throw new Error('Failed to load client.');
      }
      const data = await res.json();
      setClient(data.client);
      setTrips(data.trips ?? []);
      setForm({
        name:  data.client.name  ?? '',
        email: data.client.email ?? '',
        phone: data.client.phone ?? '',
        notes: data.client.notes ?? '',
      });
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [agencyId, clientId, getToken]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const handleEdit = () => {
    setForm({
      name:  client.name  ?? '',
      email: client.email ?? '',
      phone: client.phone ?? '',
      notes: client.notes ?? '',
    });
    setSaveError('');
    setEditing(true);
  };

  const handleCancel = () => {
    setEditing(false);
    setSaveError('');
  };

  const handleSave = async () => {
    if (!form.name.trim()) { setSaveError('Name is required.'); return; }
    setSaving(true);
    setSaveError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/agency-clients?action=update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ agencyId, clientId, ...form }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to save changes.');
      }
      const data = await res.json();
      setClient(prev => ({ ...prev, ...(data.client ?? form) }));
      setEditing(false);
    } catch (err) {
      setSaveError(err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  const setField = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  if (loading) {
    return (
      <div style={{ padding: '28px 24px' }}>
        <p style={{ fontSize: '13px', color: C.muted }}>Loading client...</p>
      </div>
    );
  }

  if (error || !client) {
    return (
      <div style={{ padding: '28px 24px' }}>
        <Link to="/agency/clients" style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: C.muted, textDecoration: 'none', marginBottom: '20px',
        }}>
          <ArrowLeft size={14} /> Clients
        </Link>
        <p style={{ fontSize: '14px', color: '#C0392B' }}>{error || 'Client not found.'}</p>
      </div>
    );
  }

  const upcomingTrips = trips.filter(t => UPCOMING_STATUSES.has(t.status));
  const pastTrips     = trips.filter(t => PAST_STATUSES.has(t.status));

  return (
    <div style={{ padding: '28px 24px', maxWidth: '760px' }}>
      {/* Back */}
      <Link
        to="/agency/clients"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          fontSize: '13px', color: C.muted, textDecoration: 'none',
          marginBottom: '20px',
        }}
      >
        <ArrowLeft size={14} />
        Clients
      </Link>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: '20px', gap: '12px', flexWrap: 'wrap',
      }}>
        <h1 style={{
          margin: 0,
          fontSize: '22px',
          fontWeight: '700',
          color: C.charcoal,
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          {client.name}
        </h1>

        {!editing && (
          <button
            onClick={handleEdit}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px',
              background: 'transparent',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              color: C.charcoal,
              cursor: 'pointer',
            }}
          >
            <Edit2 size={13} />
            Edit
          </button>
        )}
      </div>

      {/* Client info card */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(28,26,22,0.06)',
        marginBottom: '28px',
      }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: `1px solid ${C.border}`,
          background: C.lightBg,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Client Info
          </span>
          {editing && (
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleCancel}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 12px',
                  background: 'transparent',
                  border: `1px solid ${C.border}`,
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: C.charcoal,
                  cursor: 'pointer',
                }}
              >
                <X size={12} /> Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 12px',
                  background: saving ? '#9EC4C1' : C.teal,
                  border: 'none',
                  borderRadius: '7px',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: '#FFFFFF',
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                <Check size={12} /> {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div style={{ padding: '18px' }}>
          {editing ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={form.name} onChange={setField('name')} placeholder="Client name" style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input type="email" value={form.email} onChange={setField('email')} placeholder="email@example.com" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input type="tel" value={form.phone} onChange={setField('phone')} placeholder="+1 555 000 0000" style={inputStyle} />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={form.notes}
                  onChange={setField('notes')}
                  placeholder="Any notes about this client..."
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5' }}
                />
              </div>
              {saveError && (
                <p style={{ margin: 0, fontSize: '13px', color: '#C0392B' }}>{saveError}</p>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {client.email ? (
                <InfoRow icon={Mail} href={`mailto:${client.email}`}>{client.email}</InfoRow>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Mail size={15} style={{ color: C.border }} />
                  <span style={{ fontSize: '13px', color: C.border }}>No email on file</span>
                </div>
              )}

              {client.phone ? (
                <InfoRow icon={Phone} href={`tel:${client.phone}`}>{client.phone}</InfoRow>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Phone size={15} style={{ color: C.border }} />
                  <span style={{ fontSize: '13px', color: C.border }}>No phone on file</span>
                </div>
              )}

              {client.notes && <InfoRow icon={FileText}>{client.notes}</InfoRow>}
            </div>
          )}
        </div>
      </div>

      {/* Trip section header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '18px',
        flexWrap: 'wrap',
        gap: '10px',
      }}>
        <h2 style={{
          margin: 0,
          fontSize: '17px',
          fontWeight: '700',
          color: C.charcoal,
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          Trips
        </h2>
        <Link
          to={`/agency/trips?clientId=${clientId}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '8px 14px',
            background: C.teal,
            color: '#FFFFFF',
            textDecoration: 'none',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: '600',
            boxShadow: '0 2px 8px rgba(27,107,101,0.18)',
          }}
        >
          <Plus size={14} strokeWidth={2.5} />
          Create Trip for Client
        </Link>
      </div>

      {/* Upcoming trips */}
      <TripSection
        title="Upcoming Trips"
        trips={upcomingTrips}
        emptyMessage="No upcoming trips. Create one above."
      />

      {/* Past / completed trips */}
      <TripSection
        title="Past Trips"
        trips={pastTrips}
        emptyMessage="No completed or archived trips yet."
      />
    </div>
  );
}
