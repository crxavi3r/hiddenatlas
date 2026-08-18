import { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useAgencyCtx } from '../../lib/useAgencyCtx.jsx';
import {
  Share2, ExternalLink, Eye, Copy, ChevronDown,
  Plus, Trash2, X, Pencil, MapPin, Calendar,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

const STATUS_OPTIONS = [
  { value: 'draft',      label: 'Draft'      },
  { value: 'ready',      label: 'Ready'      },
  { value: 'shared',     label: 'Shared'     },
  { value: 'travelling', label: 'Travelling' },
  { value: 'completed',  label: 'Completed'  },
];

const ROLE_OPTIONS = [
  { value: 'lead',   label: 'Lead traveller' },
  { value: 'adult',  label: 'Adult'          },
  { value: 'child',  label: 'Child'          },
  { value: 'infant', label: 'Infant'         },
];

const STATUS_COLORS = {
  draft:      { background: '#F0EDE8', color: C.muted    },
  ready:      { background: '#E8F0FE', color: '#3B5FC0'  },
  shared:     { background: '#D4EDEA', color: C.teal     },
  travelling: { background: '#FBF8F1', color: '#B37A20'  },
  completed:  { background: '#D4EDDA', color: '#2D7A45'  },
  archived:   { background: '#B0A898', color: C.white    },
};

const TABS = [
  { id: 'overview',   label: 'Overview'   },
  { id: 'itinerary',  label: 'Itinerary'  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch {
    return '-';
  }
}

function toInputDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toISOString().split('T')[0];
  } catch {
    return '';
  }
}

// ---------------------------------------------------------------------------
// Shared style objects
// ---------------------------------------------------------------------------

const labelStyle = {
  margin: '0 0 4px',
  fontSize: '11px',
  fontWeight: '600',
  color: C.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  display: 'block',
};

const valueStyle = {
  margin: 0,
  fontSize: '14px',
  color: C.charcoal,
};

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  border: `1px solid ${C.border}`,
  borderRadius: '6px',
  fontSize: '13px',
  color: C.charcoal,
  background: C.white,
  outline: 'none',
  fontFamily: 'Inter, system-ui, sans-serif',
  boxSizing: 'border-box',
};

function btnStyle(variant) {
  const base = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'Inter, system-ui, sans-serif',
    whiteSpace: 'nowrap',
    border: 'none',
  };
  if (variant === 'primary') return { ...base, background: C.teal,     color: C.white    };
  if (variant === 'danger')  return { ...base, background: '#C0392B',  color: C.white    };
  return { ...base, background: C.lightBg, color: C.charcoal, border: `1px solid ${C.border}` };
}

// ---------------------------------------------------------------------------
// SectionCard
// ---------------------------------------------------------------------------

function SectionCard({ title, action, children, style }) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: '12px',
      overflow: 'hidden',
      ...style,
    }}>
      {(title || action) && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          {title && (
            <h2 style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: C.charcoal }}>
              {title}
            </h2>
          )}
          {action}
        </div>
      )}
      <div style={{ padding: '20px' }}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal
// ---------------------------------------------------------------------------

function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(28,26,22,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: C.white,
          borderRadius: '16px',
          width: '100%',
          maxWidth: '480px',
          boxShadow: '0 24px 64px rgba(28,26,22,0.18)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: `1px solid ${C.border}`,
        }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: C.charcoal }}>
            {title}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.muted, padding: '2px', display: 'flex',
            }}
          >
            <X size={18} />
          </button>
        </div>
        <div style={{ padding: '20px' }}>
          {children}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EditableDate
// ---------------------------------------------------------------------------

function EditableDate({ value, onChange, onSave, disabled }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={() => !disabled && setEditing(true)}
        style={{
          background: 'none', border: 'none', padding: 0,
          fontSize: '14px',
          color: value ? C.charcoal : C.muted,
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'Inter, system-ui, sans-serif',
          textAlign: 'left',
        }}
      >
        {value ? formatDate(value + 'T12:00:00') : 'Set date'}
      </button>
    );
  }

  return (
    <input
      type="date"
      value={value}
      autoFocus
      onChange={e => onChange(e.target.value)}
      onBlur={e => { setEditing(false); onSave(e.target.value); }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === 'Escape') {
          setEditing(false);
          onSave(value);
        }
      }}
      disabled={disabled}
      style={{ ...inputStyle, width: 'auto' }}
    />
  );
}

// ---------------------------------------------------------------------------
// ShareSection
// ---------------------------------------------------------------------------

function ShareSection({ shareToken, shareEnabled, shareUrl, shareLoading, copied, onGenerate, onRegenerate, onToggle, onCopy }) {
  if (!shareToken) {
    return (
      <div>
        <p style={{ margin: '0 0 16px', fontSize: '14px', color: C.muted }}>
          Generate a share link to send to your client.
        </p>
        <button
          onClick={onGenerate}
          disabled={shareLoading}
          style={{ ...btnStyle('primary'), opacity: shareLoading ? 0.6 : 1 }}
        >
          {shareLoading ? 'Generating...' : 'Generate Link'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '12px' }}>
        <input
          readOnly
          value={shareUrl}
          style={{
            ...inputStyle,
            flex: 1,
            color: shareEnabled ? C.charcoal : C.muted,
            background: shareEnabled ? C.white : C.lightBg,
          }}
          onClick={e => shareEnabled && e.target.select()}
        />
        {shareEnabled && (
          <button onClick={onCopy} style={btnStyle('secondary')} title="Copy link">
            <Copy size={14} />
            {copied ? 'Copied' : 'Copy'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        {shareEnabled ? (
          <button
            onClick={() => onToggle(false)}
            disabled={shareLoading}
            style={{ ...btnStyle('secondary'), opacity: shareLoading ? 0.6 : 1 }}
          >
            Disable Link
          </button>
        ) : (
          <button
            onClick={() => onToggle(true)}
            disabled={shareLoading}
            style={{ ...btnStyle('primary'), opacity: shareLoading ? 0.6 : 1 }}
          >
            Enable Link
          </button>
        )}
        <button
          onClick={onRegenerate}
          disabled={shareLoading}
          style={{ ...btnStyle('secondary'), opacity: shareLoading ? 0.6 : 1 }}
        >
          Regenerate Link
        </button>
      </div>

      <p style={{ margin: '8px 0 0', fontSize: '12px', color: C.muted }}>
        Regenerating will invalidate the current link.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TravellerRow
// ---------------------------------------------------------------------------

function TravellerRow({
  trav,
  editing, draft, saving,
  confirmingRemove, removeSaving,
  onEdit, onCancelEdit, onSaveEdit, onDraftChange,
  onRequestRemove, onCancelRemove, onConfirmRemove,
}) {
  const roleLabel = ROLE_OPTIONS.find(r => r.value === trav.role)?.label || trav.role || 'Adult';

  if (confirmingRemove) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '12px', flexWrap: 'wrap',
        padding: '12px 14px',
        marginBottom: '8px',
        background: '#FEF2F2',
        border: '1px solid #FECACA',
        borderRadius: '8px',
      }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#C0392B' }}>
          Remove {trav.name}?
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onConfirmRemove}
            disabled={removeSaving}
            style={{ ...btnStyle('danger'), opacity: removeSaving ? 0.6 : 1 }}
          >
            {removeSaving ? 'Removing...' : 'Remove'}
          </button>
          <button onClick={onCancelRemove} style={btnStyle('secondary')}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div style={{
        padding: '14px',
        marginBottom: '8px',
        background: C.lightBg,
        border: `1px solid ${C.border}`,
        borderRadius: '8px',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
          <div>
            <label style={labelStyle}>Name</label>
            <input
              value={draft.name || ''}
              onChange={e => onDraftChange(d => ({ ...d, name: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              value={draft.email || ''}
              onChange={e => onDraftChange(d => ({ ...d, email: e.target.value }))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select
              value={draft.role || 'adult'}
              onChange={e => onDraftChange(d => ({ ...d, role: e.target.value }))}
              style={inputStyle}
            >
              {ROLE_OPTIONS.map(r => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Notes</label>
            <input
              value={draft.notes || ''}
              onChange={e => onDraftChange(d => ({ ...d, notes: e.target.value }))}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onSaveEdit}
            disabled={saving}
            style={{ ...btnStyle('primary'), opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button onClick={onCancelEdit} style={btnStyle('secondary')}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '12px 0',
      borderBottom: `1px solid ${C.border}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '14px', fontWeight: '500', color: C.charcoal }}>
          {trav.name}
          <span style={{
            marginLeft: '8px',
            fontSize: '11px', fontWeight: '600',
            color: C.muted, letterSpacing: '0.03em',
            textTransform: 'uppercase',
          }}>
            {roleLabel}
          </span>
        </p>
        {trav.email && (
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted }}>
            {trav.email}
          </p>
        )}
        {trav.notes && (
          <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted, fontStyle: 'italic' }}>
            {trav.notes}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        <button
          onClick={onEdit}
          title="Edit"
          style={{
            background: 'none',
            border: `1px solid ${C.border}`,
            borderRadius: '6px',
            padding: '5px 8px',
            cursor: 'pointer',
            color: C.muted,
            display: 'flex', alignItems: 'center',
          }}
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onRequestRemove}
          title="Remove"
          style={{
            background: 'none',
            border: '1px solid #FECACA',
            borderRadius: '6px',
            padding: '5px 8px',
            cursor: 'pointer',
            color: '#C0392B',
            display: 'flex', alignItems: 'center',
          }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgencyTripDetail() {
  const { agencyTripId } = useParams();
  const { agencyId } = useAgencyCtx();
  const { getToken } = useAuth();
  const navigate = useNavigate(); // eslint-disable-line no-unused-vars

  // data
  const [trip,       setTrip]       = useState(null);
  const [travellers, setTravellers] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState(null);

  // tab
  const [activeTab, setActiveTab] = useState('overview');

  // title edit
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft,   setTitleDraft]   = useState('');
  const [titleSaving,  setTitleSaving]  = useState(false);
  const titleInputRef = useRef(null);

  // date edits
  const [startDateDraft, setStartDateDraft] = useState('');
  const [endDateDraft,   setEndDateDraft]   = useState('');
  const [dateSaving,     setDateSaving]     = useState(false);

  // status
  const [statusSaving, setStatusSaving] = useState(false);

  // share
  const [shareToken,     setShareToken]     = useState(null);
  const [shareEnabled,   setShareEnabled]   = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [shareLoading,   setShareLoading]   = useState(false);
  const [copied,         setCopied]         = useState(false);

  // more dropdown
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  // save as template
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateName,      setTemplateName]      = useState('');
  const [templateDesc,      setTemplateDesc]      = useState('');
  const [templateSaving,    setTemplateSaving]    = useState(false);
  const [templateDone,      setTemplateDone]      = useState(false);

  // add traveller
  const [addingTraveller,    setAddingTraveller]    = useState(false);
  const [newTraveller,       setNewTraveller]       = useState({ name: '', email: '', role: 'adult', notes: '' });
  const [addTravellerSaving, setAddTravellerSaving] = useState(false);

  // edit traveller
  const [editingTravellerId, setEditingTravellerId] = useState(null);
  const [editTravDraft,      setEditTravDraft]      = useState({});
  const [editTravSaving,     setEditTravSaving]     = useState(false);

  // remove traveller
  const [confirmRemoveId, setConfirmRemoveId] = useState(null);
  const [removeSaving,    setRemoveSaving]    = useState(false);

  // close more dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setMoreOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // autofocus title input
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [editingTitle]);

  const shareUrl = shareToken
    ? `${window.location.origin}/travel/${shareToken}`
    : '';

  // ---------------------------------------------------------------------------
  // Fetch detail
  // ---------------------------------------------------------------------------

  const fetchDetail = useCallback(async () => {
    if (!agencyId || !agencyTripId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/agency-trips?action=detail&agencyId=${agencyId}&agencyTripId=${agencyTripId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error('Failed to load trip');
      const data = await res.json();
      const t = data.trip || {};
      setTrip(t);
      setTravellers(data.travellers || []);
      setTitleDraft(t.title || '');
      setStartDateDraft(toInputDate(t.startDate));
      setEndDateDraft(toInputDate(t.endDate));
      setShareToken(t.shareToken || null);
      setShareEnabled(!!t.shareEnabled);
    } catch (err) {
      setError(err.message || 'Failed to load trip');
    } finally {
      setLoading(false);
    }
  }, [agencyId, agencyTripId, getToken]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // ---------------------------------------------------------------------------
  // API helper
  // ---------------------------------------------------------------------------

  async function apiPost(action, body) {
    const token = await getToken();
    const res = await fetch(`/api/agency-trips?action=${action}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Request failed');
    }
    return res.json();
  }

  // ---------------------------------------------------------------------------
  // Save title
  // ---------------------------------------------------------------------------

  async function saveTitle() {
    if (!titleDraft.trim() || titleDraft === trip?.title) {
      setEditingTitle(false);
      return;
    }
    setTitleSaving(true);
    try {
      await apiPost('update-meta', {
        agencyId, agencyTripId,
        title: titleDraft.trim(),
        startDate: trip?.startDate || null,
        endDate:   trip?.endDate   || null,
      });
      setTrip(t => ({ ...t, title: titleDraft.trim() }));
    } catch {
      setTitleDraft(trip?.title || '');
    } finally {
      setTitleSaving(false);
      setEditingTitle(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save date
  // ---------------------------------------------------------------------------

  async function saveDate(field, value) {
    if (!trip) return;
    setDateSaving(true);
    try {
      await apiPost('update-meta', {
        agencyId, agencyTripId,
        title:     trip.title,
        startDate: field === 'startDate' ? (value || null) : (trip.startDate || null),
        endDate:   field === 'endDate'   ? (value || null) : (trip.endDate   || null),
      });
      setTrip(t => ({ ...t, [field]: value || null }));
    } catch {
      if (field === 'startDate') setStartDateDraft(toInputDate(trip.startDate));
      else setEndDateDraft(toInputDate(trip.endDate));
    } finally {
      setDateSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Save status
  // ---------------------------------------------------------------------------

  async function saveStatus(status) {
    setStatusSaving(true);
    try {
      await apiPost('update-status', { agencyId, agencyTripId, status });
      setTrip(t => ({ ...t, status }));
    } catch {
      // revert — trip state unchanged
    } finally {
      setStatusSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Archive
  // ---------------------------------------------------------------------------

  async function archiveTrip() {
    if (!window.confirm('Archive this trip? It will be hidden from the active list.')) return;
    setMoreOpen(false);
    await saveStatus('archived');
  }

  // ---------------------------------------------------------------------------
  // Share actions
  // ---------------------------------------------------------------------------

  async function generateShare() {
    setShareLoading(true);
    try {
      const data = await apiPost('generate-share', { agencyId, agencyTripId });
      setShareToken(data.token);
      setShareEnabled(data.shareEnabled);
    } catch {
      // silently fail
    } finally {
      setShareLoading(false);
    }
  }

  async function regenerateShare() {
    if (!window.confirm('This will invalidate the current link. Continue?')) return;
    setShareLoading(true);
    try {
      const data = await apiPost('regenerate-share', { agencyId, agencyTripId });
      setShareToken(data.token);
      setShareEnabled(data.shareEnabled);
    } catch {
      // silently fail
    } finally {
      setShareLoading(false);
    }
  }

  async function toggleShare(enabled) {
    setShareLoading(true);
    try {
      await apiPost('toggle-share', { agencyId, agencyTripId, enabled });
      setShareEnabled(enabled);
    } catch {
      // silently fail
    } finally {
      setShareLoading(false);
    }
  }

  function copyShareUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ---------------------------------------------------------------------------
  // Save as template
  // ---------------------------------------------------------------------------

  async function saveAsTemplate() {
    if (!templateName.trim()) return;
    setTemplateSaving(true);
    try {
      await apiPost('save-as-template', {
        agencyId, agencyTripId,
        name:        templateName.trim(),
        description: templateDesc.trim(),
      });
      setTemplateDone(true);
      setTimeout(() => {
        setTemplateModalOpen(false);
        setTemplateDone(false);
        setTemplateName('');
        setTemplateDesc('');
      }, 1500);
    } catch {
      // silently fail
    } finally {
      setTemplateSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Traveller actions
  // ---------------------------------------------------------------------------

  async function addTraveller() {
    if (!newTraveller.name.trim()) return;
    setAddTravellerSaving(true);
    try {
      await apiPost('add-traveller', {
        agencyId, agencyTripId,
        name:  newTraveller.name.trim(),
        email: newTraveller.email.trim(),
        role:  newTraveller.role,
        notes: newTraveller.notes.trim(),
      });
      await fetchDetail();
      setAddingTraveller(false);
      setNewTraveller({ name: '', email: '', role: 'adult', notes: '' });
    } catch {
      // silently fail
    } finally {
      setAddTravellerSaving(false);
    }
  }

  async function updateTraveller(travellerId) {
    setEditTravSaving(true);
    try {
      await apiPost('update-traveller', {
        agencyId, agencyTripId, travellerId,
        name:  editTravDraft.name  || '',
        email: editTravDraft.email || '',
        role:  editTravDraft.role  || 'adult',
        notes: editTravDraft.notes || '',
      });
      await fetchDetail();
      setEditingTravellerId(null);
    } catch {
      // silently fail
    } finally {
      setEditTravSaving(false);
    }
  }

  async function removeTraveller(travellerId) {
    setRemoveSaving(true);
    try {
      await apiPost('remove-traveller', { agencyId, agencyTripId, travellerId });
      setTravellers(ts => ts.filter(t => t.id !== travellerId));
      setConfirmRemoveId(null);
    } catch {
      // silently fail
    } finally {
      setRemoveSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Loading / error states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ padding: '40px 32px' }}>
        <p style={{ color: C.muted, fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  if (error || !trip) {
    return (
      <div style={{ padding: '40px 32px' }}>
        <Link to="/agency/trips" style={{ fontSize: '13px', color: C.teal, textDecoration: 'none' }}>
          Back to Trips
        </Link>
        <p style={{ marginTop: '16px', color: '#C0392B', fontSize: '14px' }}>
          {error || 'Trip not found.'}
        </p>
      </div>
    );
  }

  const statusColor = STATUS_COLORS[trip.status] || STATUS_COLORS.draft;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div style={{ padding: '32px 24px', maxWidth: '840px' }}>

      {/* ======== Header bar ======== */}
      <div style={{ marginBottom: '24px' }}>
        <Link
          to="/agency/trips"
          style={{
            fontSize: '12px', color: C.muted,
            textDecoration: 'none', display: 'inline-block', marginBottom: '12px',
          }}
        >
          Trips
        </Link>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>

          {/* Title with inline edit */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            {editingTitle ? (
              <>
                <input
                  ref={titleInputRef}
                  value={titleDraft}
                  onChange={e => setTitleDraft(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => {
                    if (e.key === 'Enter') saveTitle();
                    if (e.key === 'Escape') { setTitleDraft(trip.title || ''); setEditingTitle(false); }
                  }}
                  disabled={titleSaving}
                  style={{
                    flex: 1,
                    fontSize: '22px',
                    fontWeight: '700',
                    fontFamily: "'Playfair Display', Georgia, serif",
                    color: C.charcoal,
                    border: 'none',
                    borderBottom: `2px solid ${C.teal}`,
                    outline: 'none',
                    background: 'transparent',
                    padding: '2px 0',
                    minWidth: 0,
                  }}
                />
                {titleSaving && (
                  <span style={{ fontSize: '12px', color: C.muted, flexShrink: 0 }}>Saving...</span>
                )}
              </>
            ) : (
              <>
                <h1 style={{
                  margin: 0,
                  fontSize: '22px',
                  fontWeight: '700',
                  color: C.charcoal,
                  fontFamily: "'Playfair Display', Georgia, serif",
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {trip.title || 'Untitled trip'}
                </h1>
                <button
                  onClick={() => { setTitleDraft(trip.title || ''); setEditingTitle(true); }}
                  title="Edit title"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: C.muted, padding: '2px', display: 'flex', flexShrink: 0,
                  }}
                >
                  <Pencil size={15} />
                </button>
              </>
            )}
          </div>

          {/* Status dropdown */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <select
              value={trip.status || 'draft'}
              onChange={e => saveStatus(e.target.value)}
              disabled={statusSaving}
              style={{
                appearance: 'none',
                WebkitAppearance: 'none',
                padding: '6px 28px 6px 12px',
                borderRadius: '99px',
                border: 'none',
                fontSize: '12px',
                fontWeight: '600',
                letterSpacing: '0.03em',
                cursor: 'pointer',
                background: statusColor.background,
                color: statusColor.color,
                outline: 'none',
                fontFamily: 'Inter, system-ui, sans-serif',
              }}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            <ChevronDown
              size={12}
              style={{
                position: 'absolute', right: '10px', top: '50%',
                transform: 'translateY(-50%)',
                color: statusColor.color, pointerEvents: 'none',
              }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap' }}>
            <button
              onClick={() => window.open('/my-trips/' + trip.tripId, '_blank')}
              style={btnStyle('secondary')}
            >
              <ExternalLink size={14} />
              Edit Trip
            </button>

            <button
              onClick={() => window.open(`/agency/trips/${agencyTripId}/preview`, '_blank')}
              style={btnStyle('secondary')}
            >
              <Eye size={14} />
              Preview
            </button>

            <button
              onClick={() => setShareModalOpen(true)}
              style={btnStyle('primary')}
            >
              <Share2 size={14} />
              Share
            </button>

            {/* More dropdown */}
            <div ref={moreRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setMoreOpen(v => !v)}
                style={{ ...btnStyle('secondary'), padding: '7px 10px' }}
                title="More actions"
              >
                <ChevronDown size={14} />
              </button>
              {moreOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: C.white,
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px',
                  boxShadow: '0 8px 24px rgba(28,26,22,0.12)',
                  minWidth: '180px',
                  zIndex: 50,
                  overflow: 'hidden',
                }}>
                  {[
                    {
                      label: 'Save as Template',
                      onClick: () => {
                        setMoreOpen(false);
                        setTemplateName(trip.title || '');
                        setTemplateDesc('');
                        setTemplateModalOpen(true);
                      },
                    },
                    {
                      label: 'Archive Trip',
                      onClick: archiveTrip,
                      danger: true,
                    },
                  ].map(item => (
                    <button
                      key={item.label}
                      onClick={item.onClick}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left',
                        padding: '10px 14px',
                        background: 'none', border: 'none',
                        fontSize: '13px',
                        color: item.danger ? '#C0392B' : C.charcoal,
                        cursor: 'pointer',
                        fontFamily: 'Inter, system-ui, sans-serif',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = C.lightBg; }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Sub-header: client, destination, dates */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '10px' }}>
          {trip.clientName && (
            <span style={{ fontSize: '13px', color: C.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
              {trip.clientId ? (
                <Link to={`/agency/clients/${trip.clientId}`} style={{ color: C.teal, textDecoration: 'none', fontWeight: '500' }}>
                  {trip.clientName}
                </Link>
              ) : trip.clientName}
            </span>
          )}
          {trip.destination && (
            <span style={{ fontSize: '13px', color: C.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={12} />
              {trip.destination}
            </span>
          )}
          {(trip.startDate || trip.endDate) && (
            <span style={{ fontSize: '13px', color: C.muted, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={12} />
              {formatDate(trip.startDate)} {trip.endDate ? `- ${formatDate(trip.endDate)}` : ''}
            </span>
          )}
        </div>
      </div>

      {/* ======== Tabs ======== */}
      <div style={{
        display: 'flex',
        gap: '0',
        borderBottom: `1px solid ${C.border}`,
        marginBottom: '24px',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 20px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === tab.id ? `2px solid ${C.teal}` : '2px solid transparent',
              fontSize: '14px',
              fontWeight: activeTab === tab.id ? '600' : '400',
              color: activeTab === tab.id ? C.teal : C.muted,
              cursor: 'pointer',
              fontFamily: 'Inter, system-ui, sans-serif',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ======== Tab 1: Overview ======== */}
      {activeTab === 'overview' && (
        <>
          {/* Trip Info */}
          <SectionCard title="Trip Info" style={{ marginBottom: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

              <div>
                <p style={labelStyle}>Client</p>
                {trip.clientId ? (
                  <Link
                    to={`/agency/clients/${trip.clientId}`}
                    style={{ fontSize: '14px', color: C.teal, textDecoration: 'none', fontWeight: '500' }}
                  >
                    {trip.clientName || '-'}
                  </Link>
                ) : (
                  <p style={valueStyle}>{trip.clientName || '-'}</p>
                )}
              </div>

              {trip.destination && (
                <div>
                  <p style={labelStyle}>Destination</p>
                  <p style={valueStyle}>{trip.destination}</p>
                </div>
              )}

              <div>
                <p style={labelStyle}>Start Date</p>
                <EditableDate
                  value={startDateDraft}
                  onChange={setStartDateDraft}
                  onSave={v => saveDate('startDate', v)}
                  disabled={dateSaving}
                />
              </div>

              <div>
                <p style={labelStyle}>End Date</p>
                <EditableDate
                  value={endDateDraft}
                  onChange={setEndDateDraft}
                  onSave={v => saveDate('endDate', v)}
                  disabled={dateSaving}
                />
              </div>

              {trip.assignedAgent && (
                <div>
                  <p style={labelStyle}>Assigned Agent</p>
                  <p style={valueStyle}>{trip.assignedAgent}</p>
                </div>
              )}

              <div>
                <p style={labelStyle}>Status</p>
                <p style={valueStyle}>
                  <span style={{
                    display: 'inline-block',
                    padding: '2px 10px',
                    borderRadius: '99px',
                    fontSize: '12px',
                    fontWeight: '600',
                    background: statusColor.background,
                    color: statusColor.color,
                    textTransform: 'capitalize',
                  }}>
                    {trip.status || 'draft'}
                  </span>
                </p>
              </div>

              <div>
                <p style={labelStyle}>Created</p>
                <p style={valueStyle}>{formatDate(trip.createdAt)}</p>
              </div>
            </div>
          </SectionCard>

          {/* Travellers */}
          <SectionCard
            title="Travellers"
            action={
              <button
                onClick={() => setAddingTraveller(true)}
                style={btnStyle('primary')}
              >
                <Plus size={13} />
                Add Traveller
              </button>
            }
          >
            {travellers.length === 0 && !addingTraveller && (
              <p style={{ margin: 0, fontSize: '14px', color: C.muted }}>
                No travellers added yet.
              </p>
            )}

            {travellers.map(trav => (
              <TravellerRow
                key={trav.id}
                trav={trav}
                editing={editingTravellerId === trav.id}
                draft={editTravDraft}
                saving={editTravSaving}
                confirmingRemove={confirmRemoveId === trav.id}
                removeSaving={removeSaving}
                onEdit={() => {
                  setEditingTravellerId(trav.id);
                  setEditTravDraft({
                    name:  trav.name  || '',
                    email: trav.email || '',
                    role:  trav.role  || 'adult',
                    notes: trav.notes || '',
                  });
                }}
                onCancelEdit={() => setEditingTravellerId(null)}
                onSaveEdit={() => updateTraveller(trav.id)}
                onDraftChange={setEditTravDraft}
                onRequestRemove={() => setConfirmRemoveId(trav.id)}
                onCancelRemove={() => setConfirmRemoveId(null)}
                onConfirmRemove={() => removeTraveller(trav.id)}
              />
            ))}

            {/* Add traveller inline form */}
            {addingTraveller && (
              <div style={{
                marginTop: travellers.length > 0 ? '16px' : 0,
                padding: '16px',
                background: C.lightBg,
                border: `1px solid ${C.border}`,
                borderRadius: '8px',
              }}>
                <p style={{
                  margin: '0 0 12px',
                  fontSize: '12px', fontWeight: '600',
                  color: C.charcoal,
                  letterSpacing: '0.03em', textTransform: 'uppercase',
                }}>
                  New Traveller
                </p>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr',
                  gap: '10px', marginBottom: '12px',
                }}>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input
                      value={newTraveller.name}
                      onChange={e => setNewTraveller(n => ({ ...n, name: e.target.value }))}
                      placeholder="Full name"
                      style={inputStyle}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input
                      type="email"
                      value={newTraveller.email}
                      onChange={e => setNewTraveller(n => ({ ...n, email: e.target.value }))}
                      placeholder="email@example.com"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Role</label>
                    <select
                      value={newTraveller.role}
                      onChange={e => setNewTraveller(n => ({ ...n, role: e.target.value }))}
                      style={inputStyle}
                    >
                      {ROLE_OPTIONS.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Notes</label>
                    <input
                      value={newTraveller.notes}
                      onChange={e => setNewTraveller(n => ({ ...n, notes: e.target.value }))}
                      placeholder="Optional notes"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={addTraveller}
                    disabled={!newTraveller.name.trim() || addTravellerSaving}
                    style={{
                      ...btnStyle('primary'),
                      opacity: (!newTraveller.name.trim() || addTravellerSaving) ? 0.5 : 1,
                    }}
                  >
                    {addTravellerSaving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={() => {
                      setAddingTraveller(false);
                      setNewTraveller({ name: '', email: '', role: 'adult', notes: '' });
                    }}
                    style={btnStyle('secondary')}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </SectionCard>
        </>
      )}

      {/* ======== Tab 2: Itinerary ======== */}
      {activeTab === 'itinerary' && (
        <div style={{
          background: C.white,
          border: `1px solid ${C.border}`,
          borderRadius: '12px',
          padding: '32px',
        }}>
          <p style={{
            margin: '0 0 6px',
            fontSize: '11px', fontWeight: '700',
            color: C.muted, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            Trip Editor
          </p>
          <h2 style={{
            margin: '0 0 8px',
            fontSize: '20px', fontWeight: '700',
            color: C.charcoal,
            fontFamily: "'Playfair Display', Georgia, serif",
          }}>
            {trip.title || 'Untitled trip'}
          </h2>

          {/* Meta pills */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '24px' }}>
            {trip.destination && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 12px', borderRadius: '99px',
                background: C.lightBg, color: C.muted,
                fontSize: '12px', fontWeight: '500',
              }}>
                <MapPin size={11} /> {trip.destination}
              </span>
            )}
            {trip.durationDays && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 12px', borderRadius: '99px',
                background: C.lightBg, color: C.muted,
                fontSize: '12px', fontWeight: '500',
              }}>
                {trip.durationDays} day{trip.durationDays !== 1 ? 's' : ''}
              </span>
            )}
            {trip.dayCount != null && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 12px', borderRadius: '99px',
                background: C.lightBg, color: C.muted,
                fontSize: '12px', fontWeight: '500',
              }}>
                {trip.dayCount} day{trip.dayCount !== 1 ? 's' : ''} planned
              </span>
            )}
          </div>

          <div style={{
            padding: '20px',
            background: C.lightBg,
            borderRadius: '10px',
            marginBottom: '24px',
            display: 'flex', alignItems: 'flex-start', gap: '12px',
          }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              background: C.teal,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <ExternalLink size={16} color={C.white} />
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: C.charcoal }}>
                This trip uses the HiddenAtlas Trip Editor
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: C.muted, lineHeight: 1.5 }}>
                All itinerary content, days, maps, and notes are managed in the full editor.
                Open it to make changes to the trip plan.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => window.open('/my-trips/' + trip.tripId, '_blank')}
              style={{
                ...btnStyle('primary'),
                padding: '11px 24px',
                fontSize: '14px',
              }}
            >
              <ExternalLink size={15} />
              Open Trip Editor
            </button>
            <button
              onClick={() => window.open(`/agency/trips/${agencyTripId}/preview`, '_blank')}
              style={{
                ...btnStyle('secondary'),
                padding: '11px 24px',
                fontSize: '14px',
              }}
            >
              <Eye size={15} />
              Preview as Client
            </button>
          </div>
        </div>
      )}

      {/* ======== Share Modal ======== */}
      <Modal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        title="Share with Client"
      >
        <ShareSection
          shareToken={shareToken}
          shareEnabled={shareEnabled}
          shareUrl={shareUrl}
          shareLoading={shareLoading}
          copied={copied}
          onGenerate={generateShare}
          onRegenerate={regenerateShare}
          onToggle={toggleShare}
          onCopy={copyShareUrl}
        />
      </Modal>

      {/* ======== Save as Template Modal ======== */}
      <Modal
        open={templateModalOpen}
        onClose={() => !templateSaving && setTemplateModalOpen(false)}
        title="Save as Template"
      >
        {templateDone ? (
          <p style={{
            margin: 0, fontSize: '14px',
            color: '#2D7A45', textAlign: 'center', padding: '8px 0',
          }}>
            Template saved successfully.
          </p>
        ) : (
          <>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ ...labelStyle, marginBottom: '6px' }}>Template name *</label>
              <input
                value={templateName}
                onChange={e => setTemplateName(e.target.value)}
                placeholder="e.g. 7-day Portugal Cultural"
                style={{ ...inputStyle, marginTop: '4px' }}
                autoFocus
              />
            </div>
            <div style={{ marginBottom: '20px' }}>
              <label style={{ ...labelStyle, marginBottom: '6px' }}>Description</label>
              <textarea
                value={templateDesc}
                onChange={e => setTemplateDesc(e.target.value)}
                placeholder="Optional description"
                rows={3}
                style={{ ...inputStyle, marginTop: '4px', resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={saveAsTemplate}
                disabled={!templateName.trim() || templateSaving}
                style={{
                  ...btnStyle('primary'),
                  opacity: (!templateName.trim() || templateSaving) ? 0.5 : 1,
                }}
              >
                {templateSaving ? 'Saving...' : 'Save Template'}
              </button>
              <button
                onClick={() => setTemplateModalOpen(false)}
                disabled={templateSaving}
                style={{ ...btnStyle('secondary'), opacity: templateSaving ? 0.6 : 1 }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
