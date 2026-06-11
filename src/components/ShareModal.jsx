import { useState, useEffect } from 'react';
import { X, Plus, Copy, Check, Link, Mail, Trash2, ChevronDown } from 'lucide-react';
import { useApi } from '../lib/api';

const TEAL  = '#1B6B65';
const GOLD  = '#C9A96E';
const CHAR  = '#1C1A16';
const MUTED = '#6B6156';
const STONE = '#FAFAF8';
const BORDER = '#E8E3DA';
const LIGHT = '#F4F1EC';
const SERIF = "'Playfair Display', Georgia, serif";

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
  letterSpacing: '0.3px', cursor: 'pointer', transition: 'background 0.15s',
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

function ShareRow({ share, onRevoke, onRoleChange }) {
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [changingRole, setChangingRole] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(share.shareLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRevoke() {
    if (!window.confirm(`Revoke access for ${share.displayName}?`)) return;
    setRevoking(true);
    try { await onRevoke(share.id); } finally { setRevoking(false); }
  }

  async function handleRoleChange(newRole) {
    setChangingRole(true);
    try { await onRoleChange(share.id, newRole); } finally { setChangingRole(false); }
  }

  const statusColor = {
    pending: '#B5600A',
    accepted: '#1B6B65',
    revoked: '#B5A09A',
  }[share.status] || MUTED;

  const statusLabel = {
    pending: 'Pending',
    accepted: 'Accepted',
    revoked: 'Revoked',
  }[share.status] || share.status;

  if (share.status === 'revoked') return null;

  return (
    <div style={{
      padding: '14px 16px', background: 'white',
      border: `1px solid ${BORDER}`, borderRadius: '8px',
      display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
    }}>
      {/* Name/email */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13.5px', fontWeight: '600', color: CHAR, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {share.displayName}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '3px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: statusColor, letterSpacing: '0.5px' }}>
            {statusLabel}
          </span>
          {share.acceptedAt && (
            <span style={{ fontSize: '11px', color: '#B5A09A' }}>
              · Accepted {new Date(share.acceptedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
          {share.status === 'pending' && (
            <span style={{ fontSize: '11px', color: '#B5A09A' }}>
              · {new Date(share.invitedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {/* Role selector */}
      <RoleSelect value={share.role} onChange={handleRoleChange} disabled={changingRole} />

      {/* Copy link (pending only) */}
      {share.status === 'pending' && (
        <button
          onClick={handleCopy}
          title="Copy invite link"
          style={{ background: 'none', border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '7px 10px', cursor: 'pointer', color: copied ? TEAL : MUTED, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      )}

      {/* Revoke */}
      <button
        onClick={handleRevoke}
        disabled={revoking}
        title="Revoke access"
        style={{ background: 'none', border: 'none', cursor: revoking ? 'default' : 'pointer', color: '#C8BFB5', padding: '4px', display: 'flex', alignItems: 'center' }}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

export default function ShareModal({ tripId, tripTitle, open, onClose }) {
  const api = useApi();

  const [shares, setShares] = useState([]);
  const [loadingShares, setLoadingShares] = useState(false);

  // Email invite state
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('view');
  const [sendEmail, setSendEmail] = useState(true);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');

  // Link share state
  const [linkRole, setLinkRole] = useState('view');
  const [generatingLink, setGeneratingLink] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoadingShares(true);
    api.get(`/api/trip-shares?tripId=${tripId}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setShares(data); })
      .catch(() => {})
      .finally(() => setLoadingShares(false));
  }, [open, tripId]);

  useEffect(() => {
    if (!open) return;
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = ''; };
  }, [open, onClose]);

  if (!open) return null;

  async function handleInvite() {
    setInviteError('');
    setInviteSuccess('');
    const email = inviteEmail.trim();
    if (!email) { setInviteError('Please enter an email address.'); return; }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(email)) { setInviteError('Enter a valid email address.'); return; }

    setInviting(true);
    try {
      const res = await api.post(`/api/trip-shares?tripId=${tripId}`, {
        email, role: inviteRole, sendEmail,
      });
      const data = await res.json();
      if (!res.ok) { setInviteError(data.error || 'Failed to send invite.'); return; }

      const newShare = {
        id: data.id,
        email,
        displayName: email,
        role: inviteRole,
        status: 'pending',
        inviteToken: data.inviteToken,
        shareLink: data.shareLink,
        invitedAt: new Date().toISOString(),
      };
      setShares(s => [...s, newShare]);
      setInviteEmail('');
      setInviteSuccess(sendEmail ? `Invite sent to ${email}` : `Invite created for ${email}`);
      setTimeout(() => setInviteSuccess(''), 4000);
    } catch {
      setInviteError('Something went wrong. Please try again.');
    } finally {
      setInviting(false);
    }
  }

  async function handleGenerateLink() {
    setGeneratingLink(true);
    setGeneratedLink('');
    try {
      const res = await api.post(`/api/trip-shares?tripId=${tripId}`, {
        email: null, role: linkRole, sendEmail: false,
      });
      const data = await res.json();
      if (!res.ok) return;
      const newShare = {
        id: data.id,
        email: null,
        displayName: 'Link invite',
        role: linkRole,
        status: 'pending',
        inviteToken: data.inviteToken,
        shareLink: data.shareLink,
        invitedAt: new Date().toISOString(),
      };
      setShares(s => [...s, newShare]);
      setGeneratedLink(data.shareLink);
    } catch { /* graceful */ } finally {
      setGeneratingLink(false);
    }
  }

  async function handleCopyGeneratedLink() {
    await navigator.clipboard.writeText(generatedLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }

  async function handleRevoke(shareId) {
    const res = await api.post(`/api/trip-shares?shareId=${shareId}&action=revoke`, {});
    if (res.ok) setShares(s => s.filter(sh => sh.id !== shareId));
  }

  async function handleRoleChange(shareId, newRole) {
    const res = await api.patch(`/api/trip-shares?shareId=${shareId}`, { role: newRole });
    if (res.ok) setShares(s => s.map(sh => sh.id === shareId ? { ...sh, role: newRole } : sh));
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
        }}
      >
        {/* Header */}
        <div style={{ padding: '24px 28px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h3 style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '600', color: CHAR, margin: '0 0 4px' }}>
              Share trip
            </h3>
            <p style={{ fontSize: '13px', color: MUTED, margin: 0 }}>{tripTitle}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: MUTED }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '0 28px 28px' }}>

          {/* ── Invite by email ─────────────────────────────── */}
          <section style={{ marginBottom: '28px' }}>
            <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: TEAL, marginBottom: '12px' }}>
              Invite by email
            </p>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
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
            {inviteError && <p style={{ fontSize: '12.5px', color: '#B04040', marginBottom: '8px' }}>{inviteError}</p>}
            {inviteSuccess && <p style={{ fontSize: '12.5px', color: TEAL, marginBottom: '8px' }}>{inviteSuccess}</p>}
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
            <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
              Share via link
            </p>
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '12px', lineHeight: '1.5' }}>
              Create a link and share via WhatsApp or copy it manually. Single-use.
            </p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
              <RoleSelect value={linkRole} onChange={setLinkRole} />
              <button
                onClick={handleGenerateLink}
                disabled={generatingLink}
                style={{ ...btnPrimary, background: 'white', color: TEAL, border: `1px solid ${TEAL}`, opacity: generatingLink ? 0.6 : 1 }}
              >
                <Link size={13} />
                {generatingLink ? 'Generating...' : 'Generate link'}
              </button>
            </div>
            {generatedLink && (
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '6px', padding: '10px 12px' }}>
                <span style={{ flex: 1, fontSize: '12px', color: MUTED, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {generatedLink}
                </span>
                <button
                  onClick={handleCopyGeneratedLink}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: linkCopied ? TEAL : MUTED, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', flexShrink: 0 }}
                >
                  {linkCopied ? <Check size={12} /> : <Copy size={12} />}
                  {linkCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            )}
          </section>

          {/* ── Existing shares ──────────────────────────────── */}
          {activeShares.length > 0 && (
            <section>
              <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: MUTED, marginBottom: '12px' }}>
                People with access ({activeShares.length})
              </p>
              {loadingShares ? (
                <p style={{ fontSize: '13px', color: MUTED }}>Loading...</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {activeShares.map(share => (
                    <ShareRow
                      key={share.id}
                      share={share}
                      onRevoke={handleRevoke}
                      onRoleChange={handleRoleChange}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

        </div>
      </div>
    </div>
  );
}
