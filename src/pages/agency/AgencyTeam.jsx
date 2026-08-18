import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useAgencyCtx } from '../../lib/useAgencyCtx.jsx';
import { UserPlus, X, Check, ChevronDown, Users } from 'lucide-react';

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

const ROLE_STYLES = {
  owner:  { background: '#F5ECD8', color: '#8B6A2F', label: 'Owner'  },
  admin:  { background: '#D4EDEA', color: C.teal,    label: 'Admin'  },
  agent:  { background: '#E8F0FE', color: '#3B5FC0', label: 'Agent'  },
  editor: { background: C.lightBg, color: C.muted,   label: 'Editor' },
};

const STATUS_STYLES = {
  active:   { background: '#D4EDDA', color: '#2D7A45', label: 'Active'   },
  invited:  { background: '#FEF9C3', color: '#92690A', label: 'Invited'  },
  disabled: { background: C.lightBg, color: C.muted,   label: 'Disabled' },
};

function RoleBadge({ role }) {
  const s = ROLE_STYLES[role] || ROLE_STYLES.agent;
  return (
    <span style={{
      display: 'inline-block',
      padding: '3px 11px',
      borderRadius: '99px',
      fontSize: '11px',
      fontWeight: '700',
      letterSpacing: '0.04em',
      textTransform: 'capitalize',
      background: s.background,
      color: s.color,
    }}>
      {s.label}
    </span>
  );
}

function StatusBadge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.invited;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '5px',
      padding: '3px 10px',
      borderRadius: '99px',
      fontSize: '11px',
      fontWeight: '600',
      background: s.background,
      color: s.color,
    }}>
      <span style={{
        width: '6px', height: '6px', borderRadius: '50%',
        background: s.color, flexShrink: 0,
      }} />
      {s.label}
    </span>
  );
}

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Invite Modal
// ---------------------------------------------------------------------------

function InviteModal({ onClose, onInvite, loading }) {
  const [email, setEmail] = useState('');
  const [role,  setRole]  = useState('agent');
  const [err,   setErr]   = useState('');

  const handleSubmit = () => {
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr('Please enter a valid email address.');
      return;
    }
    setErr('');
    onInvite(email.trim(), role);
  };

  const roleDescriptions = {
    admin:  'Admins can manage clients, trips, team members, and settings.',
    agent:  'Agents can view and manage assigned clients and trips.',
    editor: 'Editors can view and edit trip content but cannot manage team or settings.',
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
        padding: '32px',
        width: '100%',
        maxWidth: '440px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: C.charcoal, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Invite Member
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, padding: '4px', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.charcoal, marginBottom: '6px' }}>
              Email Address <span style={{ color: '#C0392B' }}>*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setErr(''); }}
              placeholder="colleague@example.com"
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 14px',
                border: `1px solid ${err ? '#C0392B' : C.border}`,
                borderRadius: '8px', fontSize: '14px',
                color: C.charcoal, outline: 'none',
              }}
              autoFocus
            />
            {err && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#C0392B' }}>{err}</p>}
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: C.charcoal, marginBottom: '6px' }}>
              Role
            </label>
            <div style={{ position: 'relative' }}>
              <select
                value={role}
                onChange={e => setRole(e.target.value)}
                style={{
                  width: '100%', appearance: 'none',
                  padding: '10px 36px 10px 14px',
                  border: `1px solid ${C.border}`,
                  borderRadius: '8px', fontSize: '14px',
                  color: C.charcoal, background: C.white,
                  cursor: 'pointer', outline: 'none',
                }}
              >
                <option value="admin">Admin</option>
                <option value="agent">Agent</option>
                <option value="editor">Editor</option>
              </select>
              <ChevronDown size={15} style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: C.muted, pointerEvents: 'none' }} />
            </div>
            <p style={{ margin: '5px 0 0', fontSize: '12px', color: C.muted }}>
              {roleDescriptions[role]}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '28px' }}>
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
            {loading ? 'Sending...' : <><UserPlus size={14} /> Send Invite</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Disable Confirm Modal
// ---------------------------------------------------------------------------

function DisableConfirmModal({ member, onClose, onConfirm, loading }) {
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
          Disable Member
        </h3>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: C.muted, lineHeight: 1.6 }}>
          Are you sure you want to disable <strong style={{ color: C.charcoal }}>{member.name || member.email}</strong>?
          They will lose access to the agency portal immediately.
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
            {loading ? 'Disabling...' : 'Disable Member'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Row Actions Dropdown (Change Role + Disable)
// ---------------------------------------------------------------------------

function MemberActions({ member, agencyId, getToken, onUpdated, onDisable }) {
  const [open,    setOpen]    = useState(false);
  const [loading, setLoading] = useState(false);

  const changeRole = useCallback(async (newRole) => {
    if (newRole === member.role) { setOpen(false); return; }
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/agency?action=update-member', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, memberId: member.id, role: newRole }),
      });
      if (!res.ok) throw new Error('Update failed');
      onUpdated();
    } catch {
      // silently fail
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }, [member.id, member.role, agencyId, getToken, onUpdated]);

  const roles = [
    { value: 'admin',  label: 'Admin'  },
    { value: 'agent',  label: 'Agent'  },
    { value: 'editor', label: 'Editor' },
  ];

  return (
    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
      {/* Change role dropdown */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setOpen(o => !o)}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '5px 10px', borderRadius: '7px',
            border: `1px solid ${C.border}`,
            background: C.white, color: C.charcoal,
            fontSize: '12px', fontWeight: '600',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving...' : 'Change role'} <ChevronDown size={12} />
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
              minWidth: '120px', overflow: 'hidden',
            }}>
              {roles.map(r => (
                <button
                  key={r.value}
                  onClick={() => changeRole(r.value)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '9px 14px', border: 'none',
                    background: member.role === r.value ? C.lightBg : C.white,
                    color: C.charcoal,
                    fontSize: '13px',
                    fontWeight: member.role === r.value ? '700' : '500',
                    cursor: 'pointer',
                    fontFamily: 'Inter, system-ui, sans-serif',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.lightBg; }}
                  onMouseLeave={e => { e.currentTarget.style.background = member.role === r.value ? C.lightBg : C.white; }}
                >
                  {r.label}
                  {member.role === r.value && (
                    <Check size={12} style={{ verticalAlign: 'middle', marginLeft: '6px', color: C.teal }} />
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Disable button */}
      {member.status !== 'disabled' && (
        <button
          onClick={() => onDisable(member)}
          style={{
            padding: '5px 10px', borderRadius: '7px',
            border: '1px solid #FECACA',
            background: C.white, color: '#C0392B',
            fontSize: '12px', fontWeight: '600',
            cursor: 'pointer',
          }}
        >
          Disable
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AgencyTeam() {
  const { agencyId, memberId: selfMemberId, role } = useAgencyCtx();
  const { getToken } = useAuth();
  const canManage = role === 'owner' || role === 'admin';

  const [members,     setMembers]     = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [showInvite,  setShowInvite]  = useState(false);
  const [inviting,    setInviting]    = useState(false);
  const [disableTarget, setDisableTarget] = useState(null);
  const [disabling,   setDisabling]   = useState(false);
  const [toast,       setToast]       = useState(null);

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  const fetchMembers = useCallback(async () => {
    if (!agencyId) return;
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=team&agencyId=${agencyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load team');
      const data = await res.json();
      setMembers(data.members || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [agencyId, getToken]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleInvite = useCallback(async (email, memberRole) => {
    setInviting(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/agency?action=invite-member', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, email, role: memberRole }),
      });
      if (!res.ok) throw new Error('Invitation failed');
      setShowInvite(false);
      showToast('Invitation sent');
      fetchMembers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setInviting(false);
    }
  }, [agencyId, getToken, fetchMembers, showToast]);

  const handleDisable = useCallback(async () => {
    if (!disableTarget) return;
    setDisabling(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/agency?action=update-member', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ agencyId, memberId: disableTarget.id, status: 'disabled' }),
      });
      if (!res.ok) throw new Error('Disable failed');
      setDisableTarget(null);
      showToast('Member disabled');
      fetchMembers();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setDisabling(false);
    }
  }, [disableTarget, agencyId, getToken, fetchMembers, showToast]);

  const TH_STYLE = {
    padding: '10px 20px',
    textAlign: 'left',
    fontSize: '11px',
    fontWeight: '700',
    color: C.muted,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    whiteSpace: 'nowrap',
  };

  const TD_STYLE = {
    padding: '14px 20px',
    fontSize: '13px',
    color: C.charcoal,
    verticalAlign: 'middle',
  };

  return (
    <div style={{ padding: '32px 24px', maxWidth: '960px', margin: '0 auto', position: 'relative' }}>

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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', marginBottom: '32px', flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: C.charcoal, fontFamily: "'Playfair Display', Georgia, serif" }}>
          Team
        </h1>
        {canManage && (
          <button
            onClick={() => setShowInvite(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 20px', borderRadius: '9px', border: 'none',
              background: C.teal, color: C.white,
              fontSize: '14px', fontWeight: '700', cursor: 'pointer',
            }}
          >
            <UserPlus size={15} /> Invite Member
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: C.muted, fontSize: '15px' }}>
          Loading team...
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#C0392B', fontSize: '14px' }}>
          {error}
        </div>
      ) : members.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
          padding: '60px 24px', textAlign: 'center',
          background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px',
        }}>
          <Users size={36} color={C.border} />
          <p style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: C.charcoal }}>
            You are the only member
          </p>
          <p style={{ margin: 0, fontSize: '13px', color: C.muted }}>
            Invite your team when ready.
          </p>
        </div>
      ) : (
        <div style={{ background: C.white, border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ background: C.lightBg, borderBottom: `1px solid ${C.border}` }}>
                  <th style={{ ...TH_STYLE }}>Name / Email</th>
                  <th style={{ ...TH_STYLE }}>Role</th>
                  <th style={{ ...TH_STYLE }}>Status</th>
                  <th style={{ ...TH_STYLE }}>Joined</th>
                  <th style={{ ...TH_STYLE, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m, idx) => (
                  <tr
                    key={m.id}
                    style={{
                      borderTop: idx > 0 ? `1px solid ${C.border}` : 'none',
                      background: m.status === 'disabled' ? C.lightBg : C.white,
                      opacity: m.status === 'disabled' ? 0.7 : 1,
                    }}
                  >
                    {/* Name / Email */}
                    <td style={{ ...TD_STYLE, maxWidth: '240px' }}>
                      <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: C.charcoal, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.name || 'Invited user'}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: '12px', color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.email}
                      </p>
                    </td>

                    {/* Role */}
                    <td style={{ ...TD_STYLE }}>
                      <RoleBadge role={m.role} />
                    </td>

                    {/* Status */}
                    <td style={{ ...TD_STYLE }}>
                      <StatusBadge status={m.status || 'invited'} />
                    </td>

                    {/* Joined */}
                    <td style={{ ...TD_STYLE, color: C.muted, whiteSpace: 'nowrap' }}>
                      {formatDate(m.joinedAt)}
                    </td>

                    {/* Actions */}
                    <td style={{ ...TD_STYLE }}>
                      {canManage && m.id !== selfMemberId && m.role !== 'owner' && (
                        <MemberActions
                          member={m}
                          agencyId={agencyId}
                          getToken={getToken}
                          onUpdated={fetchMembers}
                          onDisable={setDisableTarget}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onInvite={handleInvite}
          loading={inviting}
        />
      )}
      {disableTarget && (
        <DisableConfirmModal
          member={disableTarget}
          onClose={() => setDisableTarget(null)}
          onConfirm={handleDisable}
          loading={disabling}
        />
      )}
    </div>
  );
}
