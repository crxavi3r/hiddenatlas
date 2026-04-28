import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { CheckCircle, XCircle, Clock, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

// ── Styles ────────────────────────────────────────────────────────────────────
const card = {
  background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', overflow: 'hidden',
};
const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: '600', color: '#6B6156',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px',
};
const valueStyle = { fontSize: '13.5px', color: '#1C1A16', lineHeight: '1.6' };
const mutedStyle = { fontSize: '12px', color: '#8C8070' };

const btnPrimary = {
  padding: '7px 16px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'inline-flex', alignItems: 'center', gap: '6px', transition: 'background 0.2s',
};
const btnDanger = {
  ...btnPrimary, background: 'white', color: '#C0392B', border: '1px solid #EAC4BF',
};
const btnGhost = {
  ...btnPrimary, background: 'transparent', color: '#6B6156', border: '1px solid #E8E3DA',
};

const STATUS_META = {
  pending:  { label: 'Pending',  color: '#A07830', bg: '#FBF6EE', icon: Clock },
  approved: { label: 'Approved', color: '#166534', bg: '#DCFCE7', icon: CheckCircle },
  rejected: { label: 'Rejected', color: '#9B1C1C', bg: '#FEE2E2', icon: XCircle },
};

const FILTERS = ['pending', 'approved', 'rejected', 'all'];
const FILTER_LABELS = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected', all: 'All' };

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] ?? { label: status, color: '#6B6156', bg: '#F4F1EC', icon: Clock };
  const Icon = m.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '5px',
      padding: '3px 10px', borderRadius: '10px', fontSize: '11.5px', fontWeight: '600',
      color: m.color, background: m.bg,
    }}>
      <Icon size={11} /> {m.label}
    </span>
  );
}

// ── Reject modal ─────────────────────────────────────────────────────────────
function RejectModal({ application, onConfirm, onCancel, busy }) {
  const [note, setNote] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '24px',
    }}>
      <div style={{ background: 'white', borderRadius: '10px', padding: '28px', maxWidth: '460px', width: '100%' }}>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
          Reject application
        </h3>
        <p style={{ fontSize: '13.5px', color: '#6B6156', marginBottom: '20px' }}>
          Rejecting <strong>{application.fullName}</strong>. You can add an internal note (not shown to the applicant).
        </p>
        <label style={labelStyle}>Internal note (optional)</label>
        <textarea
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="Reason for rejection…"
          style={{
            width: '100%', padding: '10px 12px', border: '1px solid #E8E3DA',
            borderRadius: '6px', fontSize: '13.5px', color: '#1C1A16',
            background: 'white', outline: 'none', boxSizing: 'border-box',
            fontFamily: 'inherit', resize: 'vertical', minHeight: '88px',
          }}
        />
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={btnGhost} disabled={busy}>Cancel</button>
          <button
            onClick={() => onConfirm(note)}
            disabled={busy}
            style={{ ...btnDanger, border: 'none', background: '#C0392B', color: 'white', opacity: busy ? 0.6 : 1 }}
          >
            {busy ? 'Rejecting…' : 'Reject application'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Application card ──────────────────────────────────────────────────────────
function ApplicationCard({ app, onApprove, onReject, actionBusy }) {
  const [open, setOpen] = useState(app.status === 'pending');
  const isPending = app.status === 'pending';

  return (
    <div style={{ ...card, marginBottom: '12px' }}>
      {/* Header row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', cursor: 'pointer',
          borderBottom: open ? '1px solid #F0EBE3' : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1C1A16', marginBottom: '2px' }}>
              {app.fullName}
            </p>
            <p style={mutedStyle}>{app.email}</p>
          </div>
          <StatusBadge status={app.status} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '12px' }}>
          <span style={mutedStyle}>{fmtDate(app.createdAt)}</span>
          {open ? <ChevronUp size={14} color="#8C8070" /> : <ChevronDown size={14} color="#8C8070" />}
        </div>
      </div>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            {app.expertiseRegions && (
              <div>
                <p style={labelStyle}>Expertise Regions</p>
                <p style={valueStyle}>{app.expertiseRegions}</p>
              </div>
            )}
            {app.websiteUrl && (
              <div>
                <p style={labelStyle}>Website</p>
                <a href={app.websiteUrl} target="_blank" rel="noopener noreferrer" style={{ ...valueStyle, color: '#1B6B65' }}>
                  {app.websiteUrl}
                </a>
              </div>
            )}
            {app.instagramUrl && (
              <div>
                <p style={labelStyle}>Instagram</p>
                <a href={app.instagramUrl} target="_blank" rel="noopener noreferrer" style={{ ...valueStyle, color: '#1B6B65' }}>
                  {app.instagramUrl}
                </a>
              </div>
            )}
            <div>
              <p style={labelStyle}>Current role</p>
              <p style={valueStyle}>{app.userRole ?? '—'}</p>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <p style={labelStyle}>Bio</p>
            <p style={{ ...valueStyle, background: '#FAFAF8', padding: '12px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
              {app.bio}
            </p>
          </div>

          <div style={{ marginBottom: isPending ? '20px' : 0 }}>
            <p style={labelStyle}>Message</p>
            <p style={{ ...valueStyle, background: '#FAFAF8', padding: '12px', borderRadius: '6px', whiteSpace: 'pre-wrap' }}>
              {app.message}
            </p>
          </div>

          {app.adminNote && (
            <div style={{ marginTop: '12px', background: '#FBF6EE', border: '1px solid #E8D5B4', borderRadius: '6px', padding: '12px' }}>
              <p style={{ ...labelStyle, color: '#A07830' }}>Internal note</p>
              <p style={{ ...valueStyle, color: '#6B4C1C' }}>{app.adminNote}</p>
            </div>
          )}

          {!isPending && app.reviewedAt && (
            <p style={{ ...mutedStyle, marginTop: '12px' }}>
              {app.status === 'approved' ? 'Approved' : 'Rejected'} on {fmtDate(app.reviewedAt)}
              {app.reviewedByName ? ` by ${app.reviewedByName}` : ''}
            </p>
          )}

          {isPending && (
            <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
              <button
                onClick={() => onApprove(app)}
                disabled={actionBusy === app.id}
                style={{ ...btnPrimary, opacity: actionBusy === app.id ? 0.6 : 1 }}
              >
                <CheckCircle size={13} />
                {actionBusy === app.id ? 'Saving…' : 'Approve'}
              </button>
              <button
                onClick={() => onReject(app)}
                disabled={actionBusy === app.id}
                style={{ ...btnDanger, opacity: actionBusy === app.id ? 0.6 : 1 }}
              >
                <XCircle size={13} />
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function DesignerApplicationsPage() {
  const { getToken } = useAuth();

  const [filter, setFilter]         = useState('pending');
  const [applications, setApps]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [actionBusy, setActionBusy] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);

  const fetchApplications = useCallback(async (status = filter) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin?action=designer-applications&status=${status}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setApps(data);
    } catch (err) {
      setError('Failed to load applications.');
      console.error('[DesignerApplicationsPage]', err.message);
    } finally {
      setLoading(false);
    }
  }, [getToken, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchApplications(filter); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleApprove(app) {
    setActionBusy(app.id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin?action=approve-designer-application&id=${app.id}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || 'Failed to approve.');
        return;
      }
      await fetchApplications(filter);
    } finally {
      setActionBusy(null);
    }
  }

  function handleRejectClick(app) {
    setRejectModal(app);
  }

  async function handleRejectConfirm(adminNote) {
    if (!rejectModal) return;
    setActionBusy(rejectModal.id);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin?action=reject-designer-application&id=${rejectModal.id}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ adminNote }),
      });
      if (!res.ok) {
        const d = await res.json();
        alert(d.error || 'Failed to reject.');
        return;
      }
      setRejectModal(null);
      await fetchApplications(filter);
    } finally {
      setActionBusy(null);
    }
  }

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  return (
    <div style={{ padding: '32px 32px 64px', maxWidth: '900px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', gap: '16px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>
            Designer Applications
          </h1>
          <p style={{ fontSize: '13.5px', color: '#8C8070' }}>
            Review and approve travel designer applications.
          </p>
        </div>
        <button
          onClick={() => fetchApplications(filter)}
          style={btnGhost}
          disabled={loading}
        >
          <RefreshCw size={13} style={{ opacity: loading ? 0.5 : 1 }} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '24px', background: '#F4F1EC', borderRadius: '8px', padding: '4px', width: 'fit-content' }}>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '7px 16px', borderRadius: '5px', border: 'none', cursor: 'pointer',
              fontSize: '12.5px', fontWeight: filter === f ? '600' : '400',
              background: filter === f ? 'white' : 'transparent',
              color: filter === f ? '#1C1A16' : '#6B6156',
              boxShadow: filter === f ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 0.15s',
            }}
          >
            {FILTER_LABELS[f]}
            {f === 'pending' && pendingCount > 0 && filter !== 'pending' && (
              <span style={{
                marginLeft: '6px', background: '#C9A96E', color: 'white',
                borderRadius: '10px', padding: '1px 7px', fontSize: '11px', fontWeight: '700',
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Body */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#8C8070' }}>Loading…</div>
      )}

      {!loading && error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px', padding: '16px 20px', color: '#991B1B', fontSize: '14px' }}>
          {error}
        </div>
      )}

      {!loading && !error && applications.length === 0 && (
        <div style={{ ...card, padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '15px', color: '#8C8070' }}>
            No {filter === 'all' ? '' : filter} applications.
          </p>
        </div>
      )}

      {!loading && !error && applications.map(app => (
        <ApplicationCard
          key={app.id}
          app={app}
          onApprove={handleApprove}
          onReject={handleRejectClick}
          actionBusy={actionBusy}
        />
      ))}

      {/* Reject modal */}
      {rejectModal && (
        <RejectModal
          application={rejectModal}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectModal(null)}
          busy={actionBusy === rejectModal.id}
        />
      )}
    </div>
  );
}
