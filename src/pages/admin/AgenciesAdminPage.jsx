import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Building2, Plus, ExternalLink, X, Search, Check, Loader } from 'lucide-react';

const S = {
  page:     { padding: '32px 28px', maxWidth: '1100px', margin: '0 auto' },
  card:     { background: '#FFFFFF', border: '1px solid #EDE8E0', borderRadius: '10px' },
  th:       { fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.6px', padding: '10px 16px', textAlign: 'left' },
  td:       { fontSize: '13px', color: '#1C1A16', padding: '12px 16px', borderTop: '1px solid #F0EBE3' },
  badge:    (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', background: color === 'green' ? '#E8F5F0' : color === 'red' ? '#FEE2E2' : '#F3F0EA', color: color === 'green' ? '#1B6B65' : color === 'red' ? '#B91C1C' : '#8C8070' }),
};

function statusColor(s) {
  if (s === 'active')   return 'green';
  if (s === 'disabled') return 'red';
  return 'grey';
}

export default function AgenciesAdminPage() {
  const { getToken } = useAuth();
  const [agencies, setAgencies] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/agency?action=admin:list-agencies', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAgencies(data.agencies || []);
      }
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Building2 size={20} style={{ color: '#1B6B65' }} />
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>Agencies</h1>
            <p style={{ fontSize: '13px', color: '#8C8070', margin: '2px 0 0' }}>B2B white-label workspaces</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 16px', background: '#1B6B65', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
        >
          <Plus size={14} /> New Agency
        </button>
      </div>

      {/* Table */}
      <div style={S.card}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#8C8070', fontSize: '14px' }}>Loading...</div>
        ) : agencies.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center', color: '#8C8070', fontSize: '14px' }}>No agencies yet.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Agency', 'Status', 'Members', 'Clients', 'Trips', 'Created', ''].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agencies.map(a => (
                  <tr key={a.id}>
                    <td style={S.td}>
                      <div style={{ fontWeight: '600' }}>{a.name}</div>
                      <div style={{ fontSize: '11px', color: '#8C8070', marginTop: '2px' }}>{a.slug}</div>
                    </td>
                    <td style={S.td}><span style={S.badge(statusColor(a.status))}>{a.status}</span></td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{a.memberCount}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{a.clientCount}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{a.tripCount}</td>
                    <td style={{ ...S.td, color: '#8C8070', fontSize: '12px' }}>
                      {new Date(a.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </td>
                    <td style={S.td}>
                      <Link
                        to={`/admin/agencies/${a.id}`}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#1B6B65', textDecoration: 'none', fontWeight: '500' }}
                      >
                        View <ExternalLink size={11} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateAgencyModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
          getToken={getToken}
        />
      )}
    </div>
  );
}

function CreateAgencyModal({ onClose, onCreated, getToken }) {
  const [name,  setName]  = useState('');
  const [slug,  setSlug]  = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [ownerQuery, setOwnerQuery] = useState('');
  const [ownerResults, setOwnerResults] = useState([]);
  const [selectedOwner, setSelectedOwner] = useState(null);
  const [searching, setSearching] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  // Auto-derive slug from name
  function handleNameChange(v) {
    setName(v);
    if (!slugManual) {
      setSlug(v.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    }
  }

  // Search users by email
  useEffect(() => {
    if (ownerQuery.length < 2) { setOwnerResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const token = await getToken();
        const res = await fetch(`/api/agency?action=admin:search-users&q=${encodeURIComponent(ownerQuery)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOwnerResults(data.users || []);
        }
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [ownerQuery, getToken]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!selectedOwner) { setError('Select an owner from the search results.'); return; }
    setSaving(true); setError('');
    try {
      const token = await getToken();
      const res = await fetch('/api/agency?action=admin:create-agency', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), ownerUserId: selectedOwner.id }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Failed to create agency.'); return; }
      onCreated();
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ background: '#FFFFFF', borderRadius: '12px', width: '100%', maxWidth: '480px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #EDE8E0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', margin: 0, color: '#1C1A16' }}>New Agency</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070', padding: '4px', display: 'flex' }}><X size={16} /></button>
        </div>

        <form onSubmit={handleCreate} style={{ padding: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Field label="Agency Name">
              <input
                required value={name} onChange={e => handleNameChange(e.target.value)}
                placeholder="Acme Travel Co."
                style={inputStyle}
              />
            </Field>

            <Field label="Slug">
              <input
                required value={slug}
                onChange={e => { setSlugManual(true); setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); }}
                placeholder="acme-travel-co"
                pattern="[a-z0-9-]{3,50}"
                title="3-50 lowercase letters, numbers, or hyphens"
                style={inputStyle}
              />
              <p style={{ fontSize: '11px', color: '#8C8070', marginTop: '4px' }}>Lowercase letters, numbers, and hyphens only.</p>
            </Field>

            <Field label="Owner Email">
              <div style={{ position: 'relative' }}>
                {selectedOwner ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '9px 12px', border: '1px solid #1B6B65', borderRadius: '7px', background: '#F0F9F7' }}>
                    <Check size={14} style={{ color: '#1B6B65', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedOwner.name}</div>
                      <div style={{ fontSize: '11px', color: '#1B6B65' }}>{selectedOwner.email}</div>
                    </div>
                    <button type="button" onClick={() => setSelectedOwner(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070', padding: '2px', display: 'flex' }}>
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#8C8070', pointerEvents: 'none' }} />
                      <input
                        value={ownerQuery} onChange={e => setOwnerQuery(e.target.value)}
                        placeholder="Search by name or email..."
                        style={{ ...inputStyle, paddingLeft: '32px' }}
                      />
                      {searching && <Loader size={13} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#8C8070', animation: 'spin 1s linear infinite' }} />}
                    </div>
                    {ownerResults.length > 0 && (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#FFFFFF', border: '1px solid #EDE8E0', borderRadius: '8px', marginTop: '4px', boxShadow: '0 8px 24px rgba(0,0,0,0.1)', zIndex: 10, maxHeight: '180px', overflowY: 'auto' }}>
                        {ownerResults.map(u => (
                          <button
                            key={u.id} type="button"
                            onClick={() => { setSelectedOwner(u); setOwnerQuery(''); setOwnerResults([]); }}
                            style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #F5F1EB' }}
                          >
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16' }}>{u.name}</div>
                            <div style={{ fontSize: '11px', color: '#8C8070' }}>{u.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Field>
          </div>

          {error && (
            <p style={{ fontSize: '13px', color: '#B91C1C', background: '#FEE2E2', padding: '10px 14px', borderRadius: '6px', marginTop: '16px' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
            <button type="button" onClick={onClose} style={{ padding: '9px 18px', border: '1px solid #E8E3DA', borderRadius: '7px', background: 'white', fontSize: '13px', fontWeight: '500', cursor: 'pointer', color: '#6B6156' }}>
              Cancel
            </button>
            <button type="submit" disabled={saving} style={{ padding: '9px 20px', background: saving ? '#8C8070' : '#1B6B65', color: 'white', border: 'none', borderRadius: '7px', fontSize: '13px', fontWeight: '600', cursor: saving ? 'not-allowed' : 'pointer' }}>
              {saving ? 'Creating...' : 'Create Agency'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: '#4A4540', marginBottom: '6px' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', boxSizing: 'border-box',
  padding: '9px 12px', border: '1px solid #E8E3DA', borderRadius: '7px',
  fontSize: '13px', color: '#1C1A16', background: '#FAFAF8', outline: 'none',
};
