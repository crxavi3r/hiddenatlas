import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useUser, useClerk, useAuth } from '@clerk/clerk-react';
import { useAccess } from '../lib/useUserCtx.jsx';

const HARDCODED_ADMIN_EMAILS = new Set([
  'cristiano.xavier@hiddenatlas.travel',
  'cristiano.xavier@outlook.com',
]);

export default function UserAccountMenu({
  context = 'public',
  avatarSize = 36,
  avatarBg = '#1F4D45',
  dropdownZIndex = 1000,
}) {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const { getToken } = useAuth();
  const ctxAccess = useAccess();
  const [isDesigner, setIsDesigner] = useState(false);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const primaryEmail = (
    user?.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses?.[0]?.emailAddress
    ?? ''
  ).toLowerCase().trim();

  const isAdmin = HARDCODED_ADMIN_EMAILS.has(primaryEmail) || ctxAccess.isAdmin;
  const canAccessBackoffice = isAdmin || isDesigner || ctxAccess.canAccessBackoffice;

  // Only check designer status on public context (non-admin creators)
  useEffect(() => {
    if (context !== 'public' || !user || isAdmin) return;
    getToken()
      .then(token =>
        fetch('/api/auth?action=me', { headers: { Authorization: `Bearer ${token}` } })
          .then(r => r.ok ? r.json() : null)
      )
      .then(data => setIsDesigner(data?.isDesigner ?? false))
      .catch(() => {});
  }, [user?.id, isAdmin, context]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  if (!user) return null;

  const initials = [user.firstName, user.lastName]
    .filter(Boolean)
    .map(n => n[0].toUpperCase())
    .join('') || (user.emailAddresses[0]?.emailAddress[0]?.toUpperCase() ?? '?');

  const avatarStyle = {
    width: `${avatarSize}px`, height: `${avatarSize}px`, borderRadius: '50%',
    background: avatarBg, color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: avatarSize <= 30 ? '11px' : '13px',
    fontWeight: avatarSize <= 30 ? '700' : '600',
    fontFamily: "'Inter', system-ui, sans-serif",
    cursor: 'pointer', border: 'none', padding: 0, flexShrink: 0, overflow: 'hidden',
    userSelect: 'none',
  };

  const menuItemStyle = {
    display: 'block', width: '100%', padding: '11px 16px',
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '13px', fontWeight: '500', color: '#1C1A16',
    textAlign: 'left', borderBottom: '1px solid #E8E3DA',
    textDecoration: 'none', boxSizing: 'border-box',
  };

  function renderContextLink() {
    if (context === 'backoffice') {
      return (
        <Link
          to="/"
          onClick={() => setOpen(false)}
          style={menuItemStyle}
          onMouseEnter={e => e.currentTarget.style.background = '#F4F1EC'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          View site
        </Link>
      );
    }
    if (canAccessBackoffice) {
      return (
        <Link
          to="/admin"
          onClick={() => setOpen(false)}
          style={menuItemStyle}
          onMouseEnter={e => e.currentTarget.style.background = '#F4F1EC'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          {isAdmin ? 'Backoffice' : 'Designer Portal'}
        </Link>
      );
    }
    return null;
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={avatarStyle} aria-label="Account menu">
        {user.imageUrl
          ? (
            <img
              src={user.imageUrl}
              alt={user.fullName ?? ''}
              style={{ width: `${avatarSize}px`, height: `${avatarSize}px`, objectFit: 'cover', display: 'block', borderRadius: '50%' }}
            />
          )
          : initials
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          background: 'white', borderRadius: '8px', minWidth: '220px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: '1px solid #E8E3DA',
          zIndex: dropdownZIndex, overflow: 'hidden',
        }}>
          {/* User info header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid #E8E3DA' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', marginBottom: '2px' }}>
              {user.fullName || user.firstName || 'Account'}
            </div>
            <div style={{ fontSize: '12px', color: '#8C8070', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {user.emailAddresses[0]?.emailAddress}
            </div>
          </div>

          {/* Manage account */}
          <button
            onClick={() => { openUserProfile(); setOpen(false); }}
            style={menuItemStyle}
            onMouseEnter={e => e.currentTarget.style.background = '#F4F1EC'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Manage account
          </button>

          {/* Backoffice / View site */}
          {renderContextLink()}

          {/* Sign out */}
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            style={{
              display: 'block', width: '100%', padding: '11px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '500', color: '#C0392B',
              textAlign: 'left', boxSizing: 'border-box',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#FDF2F0'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
