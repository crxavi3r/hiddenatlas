import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Users, Search, Plus, X, Eye, Edit2 } from 'lucide-react';
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

/* ─── Modal wrapper ─────────────────────────────────────────── */
function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(28,26,22,0.45)',
        zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 8px 32px rgba(28,26,22,0.18)',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

/* ─── Add / Edit client modal ────────────────────────────────── */
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
  fontSize: '12px',
  fontWeight: '600',
  color: C.muted,
  marginBottom: '5px',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
};

function ClientFormModal({ agencyId, getToken, onClose, onSaved, client }) {
  const isEdit = Boolean(client);
  const [form, setForm] = useState({
    name:  client?.name  ?? '',
    email: client?.email ?? '',
    phone: client?.phone ?? '',
    notes: client?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 80);
  }, []);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      const url = isEdit
        ? `/api/agency?action=clients:update&agencyId=${agencyId}&id=${client.id}`
        : `/api/agency?action=clients:create&agencyId=${agencyId}`;
      const body = isEdit
        ? { ...form }
        : { ...form };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || (isEdit ? 'Failed to update client.' : 'Failed to create client.'));
      }
      const data = await res.json();
      onSaved(data.client ?? data);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 20px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        <h2 style={{
          margin: 0, fontSize: '16px', fontWeight: '700', color: C.charcoal,
          fontFamily: "'Playfair Display', Georgia, serif",
        }}>
          {isEdit ? 'Edit Client' : 'Add Client'}
        </h2>
        <button
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px', display: 'flex', alignItems: 'center' }}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={labelStyle}>Name *</label>
            <input
              ref={nameRef}
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="Client name"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={form.email}
              onChange={set('email')}
              placeholder="email@example.com"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Phone</label>
            <input
              type="tel"
              value={form.phone}
              onChange={set('phone')}
              placeholder="+1 555 000 0000"
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <textarea
              value={form.notes}
              onChange={set('notes')}
              placeholder="Any notes about this client..."
              rows={3}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: '1.5' }}
            />
          </div>
        </div>

        {error && (
          <p style={{ margin: '12px 0 0', fontSize: '13px', color: '#C0392B' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '9px 18px',
              border: `1px solid ${C.border}`,
              borderRadius: '8px',
              background: 'transparent',
              fontSize: '13px',
              fontWeight: '500',
              color: C.charcoal,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '9px 20px',
              border: 'none',
              borderRadius: '8px',
              background: saving ? '#9EC4C1' : C.teal,
              fontSize: '13px',
              fontWeight: '600',
              color: '#FFFFFF',
              cursor: saving ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {saving ? (isEdit ? 'Saving...' : 'Adding...') : (isEdit ? 'Save Changes' : 'Add Client')}
          </button>
        </div>
      </form>
    </>
  );
}

/* ─── Main page ─────────────────────────────────────────────── */
export default function AgencyClients() {
  const { agencyId } = useAgencyCtx();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [clients, setClients]       = useState([]);
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [hoveredRow, setHoveredRow] = useState(null);

  /* Modal state — null = closed, 'add' = create, client obj = edit */
  const [modal, setModal]           = useState(null);

  const debounceRef = useRef(null);

  const fetchClients = useCallback(async (q = '') => {
    if (!agencyId) return;
    setLoading(true);
    setError('');
    try {
      const token = await getToken();
      const params = new URLSearchParams({ action: 'clients:list', agencyId });
      if (q) params.set('search', q);
      const res = await fetch(`/api/agency?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load clients.');
      const data = await res.json();
      setClients(data.clients ?? []);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }, [agencyId, getToken]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const handleSearchChange = (e) => {
    const q = e.target.value;
    setSearch(q);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchClients(q), 300);
  };

  const handleSaved = (savedClient) => {
    setModal(null);
    if (modal === 'add') {
      /* Prepend new client */
      setClients(prev => [savedClient, ...prev]);
    } else {
      /* Update in place */
      setClients(prev => prev.map(c => c.id === savedClient.id ? { ...c, ...savedClient } : c));
    }
  };

  return (
    <div style={{ padding: '28px 24px', maxWidth: '1000px' }}>
      {/* Page header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px',
      }}>
        <div>
          <h1 style={{
            margin: 0, fontSize: '22px', fontWeight: '700', color: C.charcoal,
            fontFamily: "'Playfair Display', Georgia, serif",
          }}>
            Clients
          </h1>
          <p style={{ margin: '3px 0 0', fontSize: '13px', color: C.muted }}>
            Manage your agency contacts and their trips.
          </p>
        </div>
        <button
          onClick={() => setModal('add')}
          style={{
            display: 'flex', alignItems: 'center', gap: '7px',
            padding: '10px 18px',
            background: C.teal,
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '9px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(27,107,101,0.18)',
            transition: 'opacity 0.15s',
          }}
        >
          <Plus size={15} strokeWidth={2.5} />
          Add Client
        </button>
      </div>

      {/* Search bar */}
      <div style={{ position: 'relative', marginBottom: '18px', maxWidth: '360px' }}>
        <Search
          size={15}
          style={{
            position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
            color: C.muted, pointerEvents: 'none',
          }}
        />
        <input
          type="text"
          value={search}
          onChange={handleSearchChange}
          placeholder="Search by name or email..."
          style={{
            width: '100%',
            padding: '9px 12px 9px 36px',
            border: `1px solid ${C.border}`,
            borderRadius: '9px',
            fontSize: '13px',
            color: C.charcoal,
            background: '#FFFFFF',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Table card */}
      <div style={{
        background: '#FFFFFF',
        borderRadius: '12px',
        border: `1px solid ${C.border}`,
        overflow: 'hidden',
        boxShadow: '0 1px 4px rgba(28,26,22,0.06)',
      }}>
        {loading ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>Loading clients...</p>
          </div>
        ) : error ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <p style={{ margin: 0, fontSize: '13px', color: '#C0392B' }}>{error}</p>
          </div>
        ) : clients.length === 0 ? (
          <div style={{ padding: '64px 24px', textAlign: 'center' }}>
            <Users size={32} style={{ color: C.border, marginBottom: '12px' }} />
            <p style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: '600', color: C.charcoal }}>
              {search ? 'No clients match your search.' : 'No clients yet.'}
            </p>
            <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>
              {search
                ? 'Try a different name or email.'
                : 'Add a client to start building trips.'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: C.lightBg, borderBottom: `1px solid ${C.border}` }}>
                  {['Name', 'Email', 'Phone', 'Trips', 'Actions'].map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 16px',
                        fontSize: '11px',
                        fontWeight: '700',
                        color: C.muted,
                        textAlign: i === 3 ? 'center' : (i === 4 ? 'right' : 'left'),
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {clients.map((client, idx) => (
                  <tr
                    key={client.id}
                    style={{
                      background: hoveredRow === client.id ? C.lightBg : 'transparent',
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      borderTop: idx === 0 ? 'none' : `1px solid ${C.border}`,
                    }}
                    onMouseEnter={() => setHoveredRow(client.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => navigate(`/agency/clients/${client.id}`)}
                  >
                    <td style={{ padding: '13px 16px', fontSize: '14px', fontWeight: '600', color: C.charcoal }}>
                      {client.name}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: '13px', color: C.muted }}>
                      {client.email || <span style={{ color: C.border, fontSize: '12px' }}>No email</span>}
                    </td>
                    <td style={{ padding: '13px 16px', fontSize: '13px', color: C.muted }}>
                      {client.phone || <span style={{ color: C.border, fontSize: '12px' }}>No phone</span>}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block',
                        minWidth: '28px',
                        padding: '2px 8px',
                        background: C.lightBg,
                        borderRadius: '20px',
                        fontWeight: '600',
                        color: (client.tripCount ?? 0) > 0 ? C.teal : C.muted,
                        fontSize: '12px',
                      }}>
                        {client.tripCount ?? 0}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                        {/* Edit button */}
                        <button
                          onClick={e => { e.stopPropagation(); setModal(client); }}
                          title="Edit client"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            fontSize: '12px', fontWeight: '600',
                            color: C.muted,
                            padding: '5px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${C.border}`,
                            background: 'transparent',
                            cursor: 'pointer',
                            transition: 'background 0.1s',
                          }}
                        >
                          <Edit2 size={12} />
                          Edit
                        </button>

                        {/* View link */}
                        <Link
                          to={`/agency/clients/${client.id}`}
                          onClick={e => e.stopPropagation()}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            fontSize: '12px', fontWeight: '600',
                            color: C.teal,
                            textDecoration: 'none',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            border: `1px solid ${C.teal}22`,
                            background: `${C.teal}09`,
                            transition: 'background 0.1s',
                          }}
                        >
                          <Eye size={12} />
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)}>
        {modal !== null && (
          <ClientFormModal
            agencyId={agencyId}
            getToken={getToken}
            onClose={() => setModal(null)}
            onSaved={handleSaved}
            client={modal === 'add' ? null : modal}
          />
        )}
      </Modal>
    </div>
  );
}
