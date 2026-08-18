import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, Building2, Users, MapPin, UserCheck, ExternalLink, Edit2, Check, X } from 'lucide-react';

const S = {
  page:    { padding: '32px 28px', maxWidth: '960px', margin: '0 auto' },
  card:    { background: '#FFFFFF', border: '1px solid #EDE8E0', borderRadius: '10px', overflow: 'hidden' },
  cardHd:  { padding: '16px 20px', borderBottom: '1px solid #EDE8E0', display: 'flex', alignItems: 'center', gap: '8px' },
  metric:  { background: '#FAFAF8', border: '1px solid #EDE8E0', borderRadius: '10px', padding: '20px 24px', flex: 1, minWidth: '120px' },
  th:      { fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '10px 16px', textAlign: 'left' },
  td:      { fontSize: '13px', color: '#1C1A16', padding: '11px 16px', borderTop: '1px solid #F0EBE3' },
  badge:   (c) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: c === 'green' ? '#E8F5F0' : c === 'red' ? '#FEE2E2' : '#F3F0EA', color: c === 'green' ? '#1B6B65' : c === 'red' ? '#B91C1C' : '#8C8070' }),
};

function statusColor(s) {
  if (s === 'active')   return 'green';
  if (s === 'disabled') return 'red';
  return 'grey';
}

export default function AgencyAdminDetailPage() {
  const { agencyId } = useParams();
  const { getToken } = useAuth();
  const navigate = useNavigate();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [saving,  setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=admin:get-agency&agencyId=${agencyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setError('Failed to load agency.'); return; }
      const json = await res.json();
      setData(json);
      setEditForm({ name: json.agency.name, slug: json.agency.slug, status: json.agency.status });
    } catch {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  }, [agencyId, getToken]);

  useEffect(() => { load(); }, [load]);

  async function handleSave() {
    setSaving(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/agency?action=admin:update-agency', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, ...editForm }),
      });
      if (res.ok) { setEditing(false); load(); }
      else {
        const d = await res.json();
        setError(d.error || 'Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  }

  function openWorkspace() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem('ha_agency_id', agencyId);
    }
    navigate('/agency');
  }

  if (loading) {
    return <div style={{ padding: '48px', textAlign: 'center', color: '#8C8070', fontSize: '14px' }}>Loading...</div>;
  }
  if (error && !data) {
    return <div style={{ padding: '48px', textAlign: 'center', color: '#B91C1C', fontSize: '14px' }}>{error}</div>;
  }
  if (!data) return null;

  const { agency, metrics, members, recentTrips } = data;

  return (
    <div style={S.page}>
      {/* Back */}
      <Link to="/admin/agencies" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#8C8070', textDecoration: 'none', marginBottom: '20px' }}>
        <ArrowLeft size={13} /> All Agencies
      </Link>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#E8F5F0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Building2 size={20} style={{ color: '#1B6B65' }} />
          </div>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>{agency.name}</h1>
            <p style={{ fontSize: '13px', color: '#8C8070', margin: '2px 0 0' }}>
              /{agency.slug} &nbsp;·&nbsp; <span style={S.badge(statusColor(agency.status))}>{agency.status}</span>
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
          <button
            onClick={() => setEditing(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', border: '1px solid #E8E3DA', borderRadius: '7px', background: 'white', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: '#6B6156' }}
          >
            <Edit2 size={13} /> Edit
          </button>
          <button
            onClick={openWorkspace}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 18px', background: '#1B6B65', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
          >
            <ExternalLink size={13} /> Open Agency Workspace
          </button>
        </div>
      </div>

      {/* Edit form */}
      {editing && (
        <div style={{ ...S.card, marginBottom: '24px' }}>
          <div style={{ ...S.cardHd }}>
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16' }}>Edit Agency</span>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <Field label="Name">
              <input value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Slug">
              <input value={editForm.slug} onChange={e => setEditForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} style={inputStyle} />
            </Field>
            <Field label="Status">
              <select value={editForm.status} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                <option value="active">active</option>
                <option value="disabled">disabled</option>
                <option value="archived">archived</option>
              </select>
            </Field>
            {error && <p style={{ fontSize: '13px', color: '#B91C1C' }}>{error}</p>}
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={handleSave} disabled={saving} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 16px', background: '#1B6B65', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
                <Check size={13} /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '8px 14px', border: '1px solid #E8E3DA', borderRadius: '6px', background: 'white', fontSize: '13px', cursor: 'pointer', color: '#6B6156' }}>
                <X size={13} /> Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Metrics */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <MetricCard label="Members"       value={metrics.memberCount}      icon={Users} />
        <MetricCard label="Clients"       value={metrics.clientCount}      icon={UserCheck} />
        <MetricCard label="Total Trips"   value={metrics.tripCount}        icon={MapPin} />
        <MetricCard label="Active Trips"  value={metrics.activeTripCount}  icon={MapPin} color="#C9A96E" />
        <MetricCard label="Upcoming"      value={metrics.upcomingTripCount} icon={MapPin} color="#1B6B65" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Members */}
        <div style={S.card}>
          <div style={S.cardHd}>
            <Users size={15} style={{ color: '#1B6B65' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16' }}>Members ({members.length})</span>
          </div>
          {members.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '13px', color: '#8C8070' }}>No members yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Name', 'Role', 'Status'].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}>
                    <td style={S.td}>
                      <div style={{ fontWeight: '500' }}>{m.name || '(no name)'}</div>
                      <div style={{ fontSize: '11px', color: '#8C8070' }}>{m.email}</div>
                    </td>
                    <td style={S.td}><span style={S.badge('grey')}>{m.role}</span></td>
                    <td style={S.td}><span style={S.badge(m.status === 'active' ? 'green' : 'grey')}>{m.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Recent Trips */}
        <div style={S.card}>
          <div style={S.cardHd}>
            <MapPin size={15} style={{ color: '#1B6B65' }} />
            <span style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16' }}>Recent Trips</span>
          </div>
          {recentTrips.length === 0 ? (
            <p style={{ padding: '20px', fontSize: '13px', color: '#8C8070' }}>No trips yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Trip', 'Client', 'Status'].map(h => <th key={h} style={S.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {recentTrips.map(t => (
                  <tr key={t.id}>
                    <td style={S.td}>
                      <div style={{ fontWeight: '500', fontSize: '12px' }}>{t.name || t.destination}</div>
                      {t.startDate && (
                        <div style={{ fontSize: '11px', color: '#8C8070' }}>
                          {new Date(t.startDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      )}
                    </td>
                    <td style={{ ...S.td, fontSize: '12px', color: '#8C8070' }}>{t.clientName || '-'}</td>
                    <td style={S.td}><span style={S.badge(t.status === 'shared' ? 'green' : 'grey')}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Info footer */}
      <div style={{ marginTop: '20px', padding: '14px 18px', background: '#F5F1EB', borderRadius: '8px', fontSize: '12px', color: '#8C8070' }}>
        Agency ID: <code style={{ fontFamily: 'monospace', fontSize: '11px', background: '#EDE8E0', padding: '1px 5px', borderRadius: '4px' }}>{agency.id}</code>
        &nbsp; Created: {new Date(agency.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color = '#8C8070' }) {
  const IconComp = icon;
  return (
    <div style={{ background: '#FAFAF8', border: '1px solid #EDE8E0', borderRadius: '10px', padding: '16px 20px', flex: '1 1 120px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
        <IconComp size={13} style={{ color }} />
        <span style={{ fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</span>
      </div>
      <span style={{ fontSize: '28px', fontWeight: '700', color: '#1C1A16', fontFamily: "'Playfair Display', Georgia, serif" }}>{value ?? 0}</span>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#4A4540', marginBottom: '5px' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 12px', border: '1px solid #E8E3DA', borderRadius: '6px',
  fontSize: '13px', color: '#1C1A16', background: '#FAFAF8', outline: 'none',
};
