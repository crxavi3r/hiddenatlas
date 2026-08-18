import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useAgencyCtx } from '../../lib/useAgencyCtx.jsx';
import { LayoutTemplate, Plus, X, Check, ChevronDown } from 'lucide-react';

const C = {
  teal:    '#1B6B65',
  gold:    '#C9A96E',
  stone:   '#FAFAF8',
  charcoal:'#1C1A16',
  muted:   '#8C8070',
  border:  '#E8E3DA',
  lightBg: '#F7F4F0',
  white:   '#FFFFFF',
};

function StatusBadge({ status }) {
  const styles = {
    active:   { background: '#D4EDEA', color: C.teal },
    archived: { background: '#F0EDE8', color: C.muted },
  };
  const s = styles[status] || styles.active;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 10px',
      borderRadius: '99px',
      fontSize: '11px',
      fontWeight: '600',
      letterSpacing: '0.03em',
      textTransform: 'capitalize',
      background: s.background,
      color: s.color,
    }}>
      {status || 'active'}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Create Template Modal
// ---------------------------------------------------------------------------

function CreateTemplateModal({ onClose, onCreate, loading }) {
  const [name,        setName]        = useState('');
  const [description, setDescription] = useState('');
  const [destination, setDestination] = useState('');
  const [err,         setErr]         = useState('');

  const handleSubmit = () => {
    if (!name.trim()) { setErr('Template name is required.'); return; }
    setErr('');
    onCreate({ name: name.trim(), description: description.trim(), destination: destination.trim() });
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(28,26,22,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: C.white,
        borderRadius: '16px',
        padding: '28px',
        width: '100%',
        maxWidth: '460px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: C.charcoal, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Create Template
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.charcoal, marginBottom: '5px' }}>
              Template Name <span style={{ color: '#C0392B' }}>*</span>
            </label>
            <input
              value={name}
              onChange={e => { setName(e.target.value); setErr(''); }}
              placeholder="e.g. 7-day Bali Family"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px',
                border: `1px solid ${err ? '#C0392B' : C.border}`,
                borderRadius: '8px', fontSize: '14px',
                color: C.charcoal, outline: 'none',
              }}
              autoFocus
            />
            {err && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#C0392B' }}>{err}</p>}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.charcoal, marginBottom: '5px' }}>
              Destination
            </label>
            <input
              value={destination}
              onChange={e => setDestination(e.target.value)}
              placeholder="e.g. Bali, Indonesia"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '8px', fontSize: '14px',
                color: C.charcoal, outline: 'none',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.charcoal, marginBottom: '5px' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional short description"
              rows={3}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '9px 12px',
                border: `1px solid ${C.border}`,
                borderRadius: '8px', fontSize: '14px',
                color: C.charcoal, outline: 'none',
                resize: 'vertical',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: '8px', border: `1px solid ${C.border}`,
              background: C.white, color: C.charcoal, fontSize: '14px', fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '9px 20px', borderRadius: '8px', border: 'none',
              background: loading ? C.border : C.teal,
              color: loading ? C.muted : C.white,
              fontSize: '14px', fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Creating...' : <><Plus size={14} /> Create Template</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive Confirm Modal
// ---------------------------------------------------------------------------

function ArchiveConfirmModal({ template, onClose, onConfirm, loading }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(28,26,22,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '16px',
    }}>
      <div style={{
        background: C.white,
        borderRadius: '16px',
        padding: '32px',
        width: '100%',
        maxWidth: '400px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
      }}>
        <h3 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: '700', color: C.charcoal, fontFamily: "'Playfair Display', Georgia, serif" }}>
          Archive Template
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: C.muted, lineHeight: 1.6 }}>
          Archive <strong style={{ color: C.charcoal }}>{template.name}</strong>? It will be hidden from active templates.
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '9px 18px', borderRadius: '8px', border: `1px solid ${C.border}`,
              background: C.white, color: C.charcoal, fontSize: '14px', fontWeight: '600',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              padding: '9px 18px', borderRadius: '8px', border: 'none',
              background: '#C0392B', color: C.white,
              fontSize: '14px', fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Archiving...' : 'Archive'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row Actions Dropdown
// ---------------------------------------------------------------------------

function RowActions({ template, canManage, onUse, onEditSource, onDuplicate, onArchive }) {
  const [open, setOpen] = useState(false);

  const actions = [
    { label: 'Use Template',      onClick: () => { setOpen(false); onUse(template); } },
    ...(template.sourceTripId
      ? [{ label: 'Edit Source Trip', onClick: () => { setOpen(false); onEditSource(template); } }]
      : []),
    { label: 'Duplicate',         onClick: () => { setOpen(false); onDuplicate(template); } },
    ...(canManage && template.status !== 'archived'
      ? [{ label: 'Archive', onClick: () => { setOpen(false); onArchive(template); }, danger: true }]
      : []),
  ];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '4px',
          padding: '5px 10px', borderRadius: '7px',
          border: `1px solid ${C.border}`,
          background: C.white, color: C.charcoal,
          fontSize: '12px', fontWeight: '600',
          cursor: 'pointer',
        }}
      >
        Actions <ChevronDown size={12} />
      </button>
      {open && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 50 }}
            onClick={() => setOpen(false)}
          />
          <div style={{
            position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 100,
            background: C.white, border: `1px solid ${C.border}`,
            borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            minWidth: '160px', overflow: 'hidden',
          }}>
            {actions.map(a => (
              <button
                key={a.label}
                onClick={a.onClick}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '9px 14px', border: 'none',
                  background: C.white, color: a.danger ? '#C0392B' : C.charcoal,
                  fontSize: '13px', fontWeight: '500',
                  cursor: 'pointer',
                  fontFamily: 'Inter, system-ui, sans-serif',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = C.lightBg; }}
                onMouseLeave={e => { e.currentTarget.style.background = C.white; }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgencyTemplates() {
  const { agencyId, role } = useAgencyCtx();
  const { getToken }       = useAuth();
  const navigate           = useNavigate();
  const canManage = role === 'owner' || role === 'admin';

  const [templates,     setTemplates]     = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [showArchived,  setShowArchived]  = useState(false);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [archiveLoading,setArchiveLoading]= useState(false);
  const [_dupTarget,    setDupTarget]     = useState(null);
  const [_dupLoading,   setDupLoading]    = useState(false);
  const [toast,         setToast]         = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchTemplates = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=templates:list&agencyId=${agencyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load templates');
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [agencyId, getToken]);

  useEffect(() => { fetchTemplates(); }, [fetchTemplates]);

  const handleCreate = useCallback(async ({ name, description, destination }) => {
    setCreateLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=templates:create&agencyId=${agencyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, name, description, destination }),
      });
      if (!res.ok) throw new Error('Create failed');
      setCreateOpen(false);
      showToast('Template created');
      fetchTemplates();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setCreateLoading(false);
    }
  }, [agencyId, getToken, fetchTemplates, showToast]);

  const handleUse = useCallback((template) => {
    navigate(`/agency/trips/new?template=${template.id}`);
  }, [navigate]);

  const handleEditSource = useCallback((template) => {
    if (template.sourceTripId) {
      window.open(`/my-trips/${template.sourceTripId}`, '_blank');
    }
  }, []);

  const handleDuplicate = useCallback(async (template) => {
    setDupTarget(null);
    setDupLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=templates:duplicate&agencyId=${agencyId}&id=${template.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${template.name} (copy)` }),
      });
      if (!res.ok) throw new Error('Duplicate failed');
      showToast('Template duplicated');
      fetchTemplates();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDupLoading(false);
    }
  }, [agencyId, getToken, fetchTemplates, showToast]);

  const handleArchive = useCallback(async () => {
    if (!archiveTarget) return;
    setArchiveLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=templates:archive&agencyId=${agencyId}&id=${archiveTarget.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error('Archive failed');
      setArchiveTarget(null);
      showToast('Template archived');
      fetchTemplates();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setArchiveLoading(false);
    }
  }, [archiveTarget, agencyId, getToken, fetchTemplates, showToast]);

  const visible = templates.filter(t => showArchived || t.status !== 'archived');

  const TH_STYLE = {
    padding: '10px 16px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '700',
    color: C.muted,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };

  const TD_STYLE = {
    padding: '12px 16px',
    fontSize: '13px',
    color: C.charcoal,
    verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '1100px', margin: '0 auto', position: 'relative' }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 2000,
          background: toast.type === 'error' ? '#C0392B' : C.teal,
          color: C.white, padding: '12px 20px', borderRadius: '10px',
          fontSize: '14px', fontWeight: '600',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          {toast.type !== 'error' && <Check size={15} />}
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: C.charcoal, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Templates
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: '14px', color: C.muted, lineHeight: 1.55 }}>
            Reusable trip structures. Save from an existing trip or create a blank template.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '4px', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '7px', cursor: 'pointer', fontSize: '13px', color: C.muted, fontWeight: '500', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={showArchived}
              onChange={e => setShowArchived(e.target.checked)}
              style={{ width: '15px', height: '15px', accentColor: C.teal, cursor: 'pointer' }}
            />
            Show archived
          </label>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '10px 18px', borderRadius: '9px', border: 'none',
              background: C.teal, color: C.white,
              fontSize: '14px', fontWeight: '700', cursor: 'pointer',
            }}
          >
            <Plus size={15} /> Create Template
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: C.muted, fontSize: '15px' }}>
          Loading templates...
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#C0392B', fontSize: '14px' }}>
          {error}
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '80px 24px', gap: '16px', textAlign: 'center',
          background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
        }}>
          <LayoutTemplate size={40} color={C.border} />
          <p style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: C.charcoal }}>
            No templates yet
          </p>
          <p style={{ margin: 0, fontSize: '14px', color: C.muted, maxWidth: '360px', lineHeight: 1.6 }}>
            Save a completed trip as a template to reuse it, or create a blank template to get started.
          </p>
          <button
            onClick={() => setCreateOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '10px 20px', borderRadius: '9px', border: 'none',
              background: C.teal, color: C.white,
              fontSize: '14px', fontWeight: '700', cursor: 'pointer',
              marginTop: '8px',
            }}
          >
            <Plus size={15} /> Create Template
          </button>
        </div>
      ) : (
        <div style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: '12px',
          overflow: 'hidden',
        }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: C.lightBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ ...TH_STYLE }}>Name</th>
                  <th style={{ ...TH_STYLE }}>Destination</th>
                  <th style={{ ...TH_STYLE }}>Duration</th>
                  <th style={{ ...TH_STYLE }}>Status</th>
                  <th style={{ ...TH_STYLE }}>Last Updated</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t, idx) => (
                  <tr
                    key={t.id}
                    style={{
                      borderTop: idx > 0 ? `1px solid ${C.border}` : 'none',
                      background: t.status === 'archived' ? C.lightBg : C.white,
                      opacity: t.status === 'archived' ? 0.75 : 1,
                    }}
                  >
                    <td style={{ ...TD_STYLE, maxWidth: '220px' }}>
                      <p style={{ margin: 0, fontWeight: '600', color: C.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {t.name}
                      </p>
                      {t.description && (
                        <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {t.description}
                        </p>
                      )}
                    </td>
                    <td style={{ ...TD_STYLE, color: C.muted }}>
                      {t.destination || '-'}
                    </td>
                    <td style={{ ...TD_STYLE, color: C.muted, whiteSpace: 'nowrap' }}>
                      {t.durationDays ? `${t.durationDays}d` : '-'}
                    </td>
                    <td style={{ ...TD_STYLE }}>
                      <StatusBadge status={t.status || 'active'} />
                    </td>
                    <td style={{ ...TD_STYLE, color: C.muted, whiteSpace: 'nowrap' }}>
                      {formatDate(t.updatedAt || t.createdAt)}
                    </td>
                    <td style={{ ...TD_STYLE, textAlign: 'right' }}>
                      <RowActions
                        template={t}
                        canManage={canManage}
                        onUse={handleUse}
                        onEditSource={handleEditSource}
                        onDuplicate={handleDuplicate}
                        onArchive={setArchiveTarget}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {createOpen && (
        <CreateTemplateModal
          onClose={() => setCreateOpen(false)}
          onCreate={handleCreate}
          loading={createLoading}
        />
      )}
      {archiveTarget && (
        <ArchiveConfirmModal
          template={archiveTarget}
          onClose={() => setArchiveTarget(null)}
          onConfirm={handleArchive}
          loading={archiveLoading}
        />
      )}
    </div>
  );
}
