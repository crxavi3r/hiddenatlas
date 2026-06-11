import { useState, useEffect } from 'react';
import { X, Copy, Check, Link, Mail, Trash2 } from 'lucide-react';
import { useApi } from '../lib/api';

const TEAL   = '#1B6B65';
const GOLD   = '#C9A96E';
const CHAR   = '#1C1A16';
const MUTED  = '#6B6156';
const STONE  = '#FAFAF8';
const BORDER = '#E8E3DA';
const LIGHT  = '#F4F1EC';
const SERIF  = "'Playfair Display', Georgia, serif";
const RED    = '#B04040';

const inputStyle = {
  width: '100%', padding: '10px 13px',
  border: `1px solid ${BORDER}`, borderRadius: '6px',
  fontSize: '13.5px', color: CHAR, background: 'white',
  outline: 'none', fontFamily: 'Inter, system-ui, sans-serif',
  boxSizing: 'border-box',
};

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  padding: '10px 18px', background: TEAL, color: 'white',
  border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
  letterSpacing: '0.3px', cursor: 'pointer',
};

const sectionLabel = {
  fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.8px',
  textTransform: 'uppercase', color: MUTED, marginBottom: '12px',
  margin: '0 0 12px',
};

function RoleSelect({ value, onChange, disabled }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      style={{
        ...inputStyle,
        width: 'auto', minWidth: '120px',
        paddingRight: '28px',
        appearance: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B6156' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      <option value="view">View only</option>
      <option value="edit">Can edit</option>
    </select>
  );
}

function ShareRow({ share, onRevoke, onRoleChange, onCopied }) {
  const [copied, setCopied]         = useState(false);
  const [revoking, setRevoking]     = useState(false);
  const [changingRole, setChanging] = useState(false);

  const statusColor = share.status === 'accepted' ? TEAL : share.status === 'pending' ? '#B5600A' : MUTED;
  const statusLabel = share.status === 'accepted' ? 'Accepted' : share.status === 'pending' ? 'Pending' : share.status;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(share.shareLink);
      setCopied(true);
      onCopied?.();
      setTimeout(() => setCopied(false), 2000);
    } catch { /* silent */ }
  }

  async function handleRevoke() {
    if (!window.confirm(`Remove access for ${share.displayName}?`)) return;
    setRevoking(true);
    try { await onRevoke(share.id); } finally { setRevoking(false); }
  }

  async function handleRoleChange(newRole) {
    setChanging(true);
    try { await onRoleChange(share.id, newRole); } finally { setChanging(false); }
  }

  return (
    <div style={{
      padding: '14px 16px', background: 'white',
      border: `1px solid ${BORDER}`, borderRadius: '8px',
    }}>
      {/* Top row: name/email + role selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: '13.5px', fontWeight: '600', color: CHAR, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {share.displayName}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', color: statusColor, letterSpacing: '0.4px' }}>
              {statusLabel}
            </span>
            {share.acceptedAt && (
              <span style={{ fontSize: '11px', color: '#B5A09A' }}>
                · Accepted {new Date(share.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
            {share.status === 'pending' && share.invitedAt && (
              <span style={{ fontSize: '11px', color: '#B5A09A' }}>
                · Invited {new Date(share.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </span>
            )}
          </div>
        </div>

        <RoleSelect value={share.role} onChange={handleRoleChange} disabled={changingRole} />
      </div>

      {/* Bottom row: copy link + revoke */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
        {share.status === 'pending' && share.shareLink && (
          <button
            onClick={handleCopy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '4px',
              background: 'none', border: `1px solid ${BORDER}`, borderRadius: '6px',
              padding: '5px 10px', cursor: 'pointer',
              fontSize: '12px', color: copied ? TEAL : MUTED, fontWeight: '500',
            }}
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? 'Copied!' : 'Copy link'}
          </button>
        )}
        <button
          onClick={handleRevoke}
          disabled={revoking}
          title="Revoke access"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            background: 'none', border: `1px solid ${BORDER}`, borderRadius: '6px',
            padding: '5px 10px', cursor: revoking ? 'default' : 'pointer',
            fontSize: '12px', color: revoking ? '#C8BFB5' : '#C05050', fontWeight: '500',
            opacity: revoking ? 0.6 : 1,
          }}
        >
          <Trash2 size={11} />
          {revoking ? 'Revoking...' : 'Revoke'}
        </button>
      </div>
    </div>
  );
}

export default function ShareModal({ tripId, tripTitle, open, onClose }) {
  const api = useApi();

  // Shares list
  const [shares, setShares]             = useState([]);
  const [loadingShares, setLoading]     = useState(false);
  const [sharesError, setSharesError]   = useState('');
  const [refreshKey, setRefreshKey]     = useState(0);

  // Toast
  const [toast, setToast] = useState('');
  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  }

  // Email invite
  const [inviteEmail, setInviteEmail]   = useState('');
  const [inviteRole, setInviteRole]     = useState('view');
  const [sendEmail, setSendEmail]       = useState(true);
  const [inviting, setInviting]         = useState(false);
  const [inviteError, setInviteError]   = useState('');

  // Link share
  const [linkRole, setLinkRole]         = useState('view');
  const [generating, setGenerating]     = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied]     = useState(false);

  // Load shares whenever modal opens or an action refreshes
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSharesError('');
    api.get(`/api/trips?action=shares-list&id=${tripId}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data)) setShares(data);
        else setSharesError('Could not load sharing settings.');
      })
      .catch(() => { if (!cancelled) setSharesError('Could not load sharing settings.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, tripId, refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard / scroll lock
  useEffect(() => {
    if (!open) return;
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  function refresh() { setRefreshKey(k => k + 1); }

  // ── Invite by email ──────────────────────────────────────────────────────
  async function handleInvite() {
    setInviteError('');
    const email = inviteEmail.trim();
    if (!email) { setInviteError('Please enter an email address.'); return; }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setInviteError('Enter a valid email address.'); return; }

    setInviting(true);
    try {
      const res = await api.post(`/api/trips?action=shares-create&id=${tripId}`, {
        email, role: inviteRole, sendEmail,
      });
      const data = await res.json();
      if (res.status === 409) { setInviteError(data.error || 'An invite already exists for this email.'); return; }
      if (!res.ok) { setInviteError(data.error || 'Could not send invite.'); return; }
      setInviteEmail('');
      showToast(sendEmail ? `Invite sent to ${email}` : 'Invite created.');
      refresh();
    } catch {
      setInviteError('Something went wrong. Please try again.');
    } finally {
      setInviting(false);
    }
  }

  // ── Generate share link ──────────────────────────────────────────────────
  async function handleGenerateLink() {
    setGenerating(true);
    setGeneratedLink('');
    try {
      const res = await api.post(`/api/trips?action=shares-create&id=${tripId}`, {
        email: null, role: linkRole, sendEmail: false,
      });
      const data = await res.json();
      if (!res.ok) { showToast('Could not create share link.'); return; }
      setGeneratedLink(data.shareLink);
      refresh();
    } catch {
      showToast('Could not create share link.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleCopyGenerated() {
    try {
      await navigator.clipboard.writeText(generatedLink);
      setLinkCopied(true);
      showToast('Share link copied.');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch { /* silent */ }
  }

  // ── Revoke ───────────────────────────────────────────────────────────────
  async function handleRevoke(shareId) {
    const res = await api.post(`/api/trips?action=shares-revoke&shareId=${shareId}`, {});
    if (res.ok) { showToast('Access revoked.'); refresh(); }
    else showToast('Could not revoke access.');
  }

  // ── Change role ──────────────────────────────────────────────────────────
  async function handleRoleChange(shareId, newRole) {
    const res = await api.patch(`/api/trips?action=shares-update-role&shareId=${shareId}`, { role: newRole });
    if (res.ok) { showToast('Role updated.'); refresh(); }
    else showToast('Could not update role.');
  }

  const activeShares = shares.filter(s => s.status !== 'revoked');

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(28,26,22,0.55)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '16px',
          width: '100%', maxWidth: '560px',
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 80px rgba(28,26,22,0.2)',
          position: 'relative',
        }}
      >
        {/* Toast */}
        {toast && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 10,
            background: TEAL, color: 'white',
            padding: '10px 28px', fontSize: '13px', fontWeight: '600',
            borderRadius: '16px 16px 0 0',
            textAlign: 'center',
          }}>
            {toast}
          </div>
        )}

        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '600', color: CHAR, margin: '0 0 4px' }}>
              Share trip
            </h3>
            {tripTitle && (
              <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>{tripTitle}</p>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 28px 28px' }}>

          {/* ── Invite by email ──────────────────────────────── */}
          <section style={{ marginBottom: '28px' }}>
            <p style={{ ...sectionLabel, color: TEAL }}>Invite by email</p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleInvite(); }}
                style={{ ...inputStyle, flex: 1, minWidth: '160px' }}
              />
              <RoleSelect value={inviteRole} onChange={setInviteRole} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: MUTED, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={sendEmail}
                  onChange={e => setSendEmail(e.target.checked)}
                  style={{ accentColor: TEAL, width: '14px', height: '14px' }}
                />
                Send invitation email
              </label>
            </div>
            {inviteError && (
              <p style={{ fontSize: '12.5px', color: RED, marginBottom: '8px' }}>{inviteError}</p>
            )}
            <button
              onClick={handleInvite}
              disabled={inviting || !inviteEmail.trim()}
              style={{ ...btnPrimary, opacity: (inviting || !inviteEmail.trim()) ? 0.6 : 1 }}
            >
              <Mail size={13} />
              {inviting ? 'Sending...' : 'Send invite'}
            </button>
          </section>

          {/* ── Share via link ───────────────────────────────── */}
          <section style={{ padding: '20px', background: STONE, borderRadius: '10px', marginBottom: '28px' }}>
            <p style={{ ...sectionLabel }}>Share via link</p>
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '12px', lineHeight: '1.5' }}>
              Create a link to share via WhatsApp or copy manually. Single-use per link.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: generatedLink ? '12px' : '0' }}>
              <RoleSelect value={linkRole} onChange={setLinkRole} />
              <button
                onClick={handleGenerateLink}
                disabled={generating}
                style={{ ...btnPrimary, background: 'white', color: TEAL, border: `1px solid ${TEAL}`, opacity: generating ? 0.6 : 1 }}
              >
                <Link size={13} />
                {generating ? 'Generating...' : 'Generate link'}
              </button>
            </div>
            {generatedLink && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px 12px' }}>
                <span style={{ flex: 1, fontSize: '12px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {generatedLink}
                </span>
                <button
                  onClick={handleCopyGenerated}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: linkCopied ? TEAL : MUTED, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}
                >
                  {linkCopied ? <Check size={12} /> : <Copy size={12} />}
                  {linkCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </section>

          {/* ── People with access ───────────────────────────── */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ ...sectionLabel, margin: 0 }}>
                People with access{activeShares.length > 0 ? ` (${activeShares.length})` : ''}
              </p>
              {loadingShares && (
                <span style={{ fontSize: '11px', color: MUTED }}>Loading...</span>
              )}
            </div>

            {sharesError && (
              <p style={{ fontSize: '12.5px', color: RED, marginBottom: '8px' }}>{sharesError}</p>
            )}

            {!loadingShares && !sharesError && activeShares.length === 0 && (
              <p style={{ fontSize: '13px', color: MUTED, fontStyle: 'italic' }}>
                No one else has access yet.
              </p>
            )}

            {activeShares.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeShares.map(share => (
                  <ShareRow
                    key={share.id}
                    share={share}
                    onRevoke={handleRevoke}
                    onRoleChange={handleRoleChange}
                    onCopied={() => showToast('Share link copied.')}
                  />
                ))}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}
