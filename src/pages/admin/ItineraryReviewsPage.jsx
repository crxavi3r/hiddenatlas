import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Eye, Edit2, CheckCircle, XCircle, RefreshCw, X, ExternalLink, Clock, AlertCircle } from 'lucide-react';
import { useUserCtx } from '../../lib/useUserCtx.jsx';
import { resolveCoverImage } from '../../lib/resolveCoverImage';
import { useIsMobile } from '../../hooks/useIsMobile';

// ── Shared style tokens ───────────────────────────────────────────────────────
const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };
const btnPrimary = {
  padding: '8px 18px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'inline-flex', alignItems: 'center', gap: '6px',
};
const btnSecondary = {
  padding: '8px 14px', borderRadius: '5px', border: '1px solid #E8E3DA', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A',
  display: 'inline-flex', alignItems: 'center', gap: '6px',
};
const btnDanger = {
  ...btnSecondary, color: '#C0392B', borderColor: '#F5C6C0',
};
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '5px',
  borderRadius: '4px', color: '#8C8070', display: 'flex', alignItems: 'center',
};

const STATUS_META = {
  pending_review: { label: 'Pending Review', color: '#C9A96E', bg: '#FBF8F1', icon: Clock },
  rejected:       { label: 'Rejected',       color: '#C0392B', bg: '#FDECEA', icon: XCircle },
  published:      { label: 'Published',      color: '#1B6B65', bg: '#EFF6F5', icon: CheckCircle },
  draft:          { label: 'Draft',          color: '#8C8070', bg: '#F4F1EC', icon: null },
};

const TABS = [
  { key: 'pending_review', label: 'Pending' },
  { key: 'rejected',       label: 'Rejected' },
  { key: 'published',      label: 'Approved' },
  { key: 'all',            label: 'All reviewed' },
];

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      fontSize: '10px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase',
      color: meta.color, background: meta.bg,
      padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  );
}

// ── Reject modal ──────────────────────────────────────────────────────────────
function RejectModal({ itinerary, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{ ...card, padding: '28px 24px', maxWidth: '460px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1C1A16' }}>Reject publication</h2>
          <button onClick={onCancel} style={{ ...iconBtn, color: '#1C1A16' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: '13px', color: '#6B6156', marginBottom: '16px' }}>
          Rejecting: <strong>{itinerary.title}</strong>
        </p>
        <label style={{ display: 'block', fontSize: '12.5px', fontWeight: '600', color: '#4A433A', marginBottom: '6px' }}>
          Reason for rejection <span style={{ color: '#C0392B' }}>*</span>
        </label>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Explain what the designer needs to fix before this can be published."
          rows={4}
          style={{
            width: '100%', padding: '10px 12px', borderRadius: '6px',
            border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16',
            resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
            outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '20px' }}>
          <button onClick={onCancel} style={btnSecondary} disabled={loading}>Cancel</button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim() || loading}
            style={{ ...btnDanger, background: reason.trim() ? '#C0392B' : '#E8E3DA', color: reason.trim() ? 'white' : '#8C8070', border: 'none' }}
          >
            <XCircle size={13} />
            {loading ? 'Rejecting…' : 'Reject and send feedback'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Review row (desktop table) ────────────────────────────────────────────────
function ReviewRow({ item, onApprove, onReject, approving, rejecting }) {
  const navigate = useNavigate();
  const isActing = approving === item.id || rejecting === item.id;

  return (
    <tr style={{ borderBottom: '1px solid #F4F1EC' }}>
      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '52px', height: '38px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
            <img
              src={resolveCoverImage(item.coverImage, item.slug)}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '13px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
              {item.title}
            </p>
            <p style={{ fontSize: '11px', color: '#8C8070', fontFamily: 'monospace' }}>{item.slug}</p>
          </div>
        </div>
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: '12.5px', color: '#4A433A' }}>
        {item.destination || '—'}
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: '12.5px', color: '#4A433A' }}>
        {item.creator_name || '—'}
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'middle', fontSize: '12px', color: '#8C8070' }}>
        {item.submitted_by_name || item.submitted_by_email || '—'}<br />
        <span style={{ fontSize: '11px' }}>{fmtDate(item.submittedForReviewAt)}</span>
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
        <StatusBadge status={item.status} />
      </td>
      <td style={{ padding: '12px 16px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          {item.slug && (
            <a
              href={`/itineraries/${item.slug}?preview=true`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...iconBtn, color: '#1B6B65' }}
              title="Preview"
            >
              <Eye size={14} />
            </a>
          )}
          <button
            onClick={() => navigate(`/admin/itineraries/${item.id}`)}
            style={{ ...iconBtn }}
            title="Edit"
          >
            <Edit2 size={14} />
          </button>
          {item.status === 'pending_review' && (
            <>
              <button
                onClick={() => onApprove(item)}
                disabled={isActing}
                style={{ ...btnPrimary, padding: '5px 12px', fontSize: '11.5px', opacity: isActing ? 0.6 : 1 }}
                title="Approve & publish"
              >
                <CheckCircle size={12} />
                Approve
              </button>
              <button
                onClick={() => onReject(item)}
                disabled={isActing}
                style={{ ...btnDanger, padding: '5px 12px', fontSize: '11.5px', opacity: isActing ? 0.6 : 1 }}
                title="Reject"
              >
                <XCircle size={12} />
                Reject
              </button>
            </>
          )}
          {item.status === 'rejected' && (
            <span style={{ fontSize: '11px', color: '#C0392B', maxWidth: '180px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              title={item.rejectionReason}>
              {item.rejectionReason ? `"${item.rejectionReason.slice(0, 50)}${item.rejectionReason.length > 50 ? '…' : ''}"` : ''}
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Mobile card ───────────────────────────────────────────────────────────────
function ReviewCard({ item, onApprove, onReject, approving, rejecting }) {
  const navigate = useNavigate();
  const isActing = approving === item.id || rejecting === item.id;

  return (
    <div style={{ ...card, overflow: 'hidden', marginBottom: '10px' }}>
      <div style={{ display: 'flex', gap: '12px', padding: '14px' }}>
        <div style={{ width: '56px', height: '42px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
          <img src={resolveCoverImage(item.coverImage, item.slug)} alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '13.5px', marginBottom: '4px',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.title}
          </p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
            <StatusBadge status={item.status} />
            {item.creator_name && (
              <span style={{ fontSize: '11px', color: '#8C8070' }}>{item.creator_name}</span>
            )}
          </div>
          <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '3px' }}>
            Submitted {fmtDate(item.submittedForReviewAt)}
          </p>
        </div>
      </div>

      {item.status === 'rejected' && item.rejectionReason && (
        <div style={{ padding: '8px 14px 12px', borderTop: '1px solid #F4F1EC' }}>
          <p style={{ fontSize: '11.5px', color: '#C0392B', fontStyle: 'italic' }}>
            "{item.rejectionReason}"
          </p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 0, borderTop: '1px solid #F4F1EC' }}>
        {item.slug && (
          <a href={`/itineraries/${item.slug}?preview=true`} target="_blank" rel="noopener noreferrer"
            style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 4px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
              color: '#6B6156', fontSize: '10px', fontWeight: '500', textDecoration: 'none' }}>
            <Eye size={13} />Preview
          </a>
        )}
        <button onClick={() => navigate(`/admin/itineraries/${item.id}`)}
          style={{ flex: 1, background: 'none', border: 'none', cursor: 'pointer', padding: '10px 4px',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
            color: '#6B6156', fontSize: '10px', fontWeight: '500' }}>
          <Edit2 size={13} />Edit
        </button>
        {item.status === 'pending_review' && (
          <>
            <button onClick={() => onApprove(item)} disabled={isActing}
              style={{ flex: 1, background: 'none', border: 'none', cursor: isActing ? 'default' : 'pointer',
                padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                color: '#1B6B65', fontSize: '10px', fontWeight: '500', opacity: isActing ? 0.5 : 1 }}>
              <CheckCircle size={13} />Approve
            </button>
            <button onClick={() => onReject(item)} disabled={isActing}
              style={{ flex: 1, background: 'none', border: 'none', cursor: isActing ? 'default' : 'pointer',
                padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                color: '#C0392B', fontSize: '10px', fontWeight: '500', opacity: isActing ? 0.5 : 1 }}>
              <XCircle size={13} />Reject
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ItineraryReviewsPage() {
  const { getToken }  = useAuth();
  const { isAdmin }   = useUserCtx();
  const isMobile      = useIsMobile();

  const [activeTab,   setActiveTab]   = useState('pending_review');
  const [items,       setItems]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [approving,   setApproving]   = useState(null); // itinerary id being approved
  const [rejectTarget, setRejectTarget] = useState(null); // itinerary being rejected
  const [rejecting,   setRejecting]   = useState(null);  // itinerary id being rejected

  const load = useCallback(async (statusFilter) => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=review-queue&status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(json.itineraries || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  async function handleApprove(item) {
    if (!window.confirm(`Approve and publish "${item.title}"?`)) return;
    setApproving(item.id);
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=approve-review&id=${item.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      load(activeTab);
    } catch (e) {
      alert(e.message);
    } finally {
      setApproving(null);
    }
  }

  async function handleRejectConfirm(reason) {
    if (!rejectTarget) return;
    setRejecting(rejectTarget.id);
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=reject-review&id=${rejectTarget.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ rejectionReason: reason }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRejectTarget(null);
      load(activeTab);
    } catch (e) {
      alert(e.message);
    } finally {
      setRejecting(null);
    }
  }

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <p style={{ color: '#C0392B' }}>Admin access required.</p>
      </div>
    );
  }

  const pendingCount = activeTab === 'pending_review' ? items.length : null;

  return (
    <div style={{ padding: isMobile ? '16px' : '32px', maxWidth: '1200px' }}>

      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: isMobile ? '20px' : '26px',
          fontWeight: '700', color: '#1C1A16', marginBottom: '6px',
        }}>
          Itinerary Reviews
        </h1>
        <p style={{ fontSize: '13.5px', color: '#6B6156' }}>
          Review itineraries submitted by designers before they go live.
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '4px', marginBottom: '24px',
        borderBottom: '1px solid #E8E3DA', paddingBottom: 0,
      }}>
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: activeTab === tab.key ? '600' : '400',
              color: activeTab === tab.key ? '#1C1A16' : '#8C8070',
              borderBottom: activeTab === tab.key ? '2px solid #1B6B65' : '2px solid transparent',
              marginBottom: '-1px',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
            {tab.key === 'pending_review' && pendingCount != null && pendingCount > 0 && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: '18px', height: '18px', borderRadius: '50%',
                background: '#C9A96E', color: 'white',
                fontSize: '10px', fontWeight: '700',
                marginLeft: '6px',
              }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
          <button
            onClick={() => load(activeTab)}
            disabled={loading}
            style={{ ...iconBtn, color: '#6B6156', opacity: loading ? 0.5 : 1 }}
            title="Refresh"
          >
            <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: '12px 16px', background: '#FDECEA', border: '1px solid #F5C6C0',
          borderRadius: '6px', marginBottom: '16px', fontSize: '13px', color: '#C0392B' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px' }}>
          <div style={{ width: '28px', height: '28px', borderRadius: '50%',
            border: '3px solid #1B6B65', borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite' }} />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && items.length === 0 && (
        <div style={{ ...card, padding: '48px', textAlign: 'center' }}>
          <AlertCircle size={32} style={{ color: '#D4C8BB', marginBottom: '12px' }} />
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#4A433A', marginBottom: '4px' }}>
            {activeTab === 'pending_review' ? 'No itineraries awaiting review' :
             activeTab === 'rejected' ? 'No rejected itineraries' :
             activeTab === 'published' ? 'No approved itineraries yet' :
             'No reviewed itineraries yet'}
          </p>
          <p style={{ fontSize: '13px', color: '#8C8070' }}>
            {activeTab === 'pending_review' ? 'When designers submit itineraries for review, they will appear here.' :
             'When itineraries are reviewed, they will appear here.'}
          </p>
        </div>
      )}

      {/* Desktop table */}
      {!loading && !error && items.length > 0 && !isMobile && (
        <div style={{ ...card, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #E8E3DA', background: '#FAFAF8' }}>
                {['Itinerary', 'Destination', 'Creator', 'Submitted by', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{
                    padding: '10px 16px', textAlign: 'left',
                    fontSize: '11px', fontWeight: '600', color: '#8C8070',
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(item => (
                <ReviewRow
                  key={item.id}
                  item={item}
                  onApprove={handleApprove}
                  onReject={setRejectTarget}
                  approving={approving}
                  rejecting={rejecting}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Mobile cards */}
      {!loading && !error && items.length > 0 && isMobile && (
        <div>
          {items.map(item => (
            <ReviewCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={setRejectTarget}
              approving={approving}
              rejecting={rejecting}
            />
          ))}
        </div>
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          itinerary={rejectTarget}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectTarget(null)}
          loading={rejecting === rejectTarget.id}
        />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
