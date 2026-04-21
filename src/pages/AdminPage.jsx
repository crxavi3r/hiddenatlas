import { useState } from 'react';
import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { LayoutDashboard, Users, CreditCard, Download, Inbox, Menu, X, Map, UserCheck, User, ArrowUpRight } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';
import { useUserCtx } from '../lib/useUserCtx.jsx';

// Must stay in sync with src/components/Navbar.jsx — same list, same logic.
const HARDCODED_ADMIN_EMAILS = new Set([
  'cristiano.xavier@hiddenatlas.travel',
  'cristiano.xavier@outlook.com',
]);

const NAV_GROUPS_ADMIN = [
  {
    label: 'Main',
    items: [
      { label: 'Dashboard',       path: '/admin',                icon: LayoutDashboard, end: true },
      { label: 'Itineraries CMS', path: '/admin/itineraries',    icon: Map },
      { label: 'Sales',           path: '/admin/sales',          icon: CreditCard },
      { label: 'Downloads',       path: '/admin/downloads',      icon: Download },
    ],
  },
  {
    label: 'Management',
    items: [
      { label: 'Creators',        path: '/admin/creators',       icon: UserCheck },
      { label: 'Users',           path: '/admin/users',          icon: Users },
    ],
  },
  {
    label: 'Operations',
    items: [
      { label: 'Custom Requests', path: '/admin/custom-requests', icon: Inbox },
    ],
  },
];

const S = {
  bg: '#0F1A18',
  text: '#E8E1D8',
  textMuted: '#B8AEA1',
  hover: '#162623',
  activeBg: '#1E4E48',
  activeBorder: '#C9A86A',
  divider: 'rgba(201,168,106,0.15)',
};

function NavItem({ item, onClose }) {
  const [hovered, setHovered] = useState(false);
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ textDecoration: 'none', display: 'block', margin: '1px 10px' }}
    >
      {({ isActive }) => (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 14px',
          fontSize: '13px', fontWeight: isActive ? '600' : '400',
          color: isActive ? S.text : (hovered ? '#D8D0C6' : S.textMuted),
          background: isActive ? S.activeBg : (hovered ? S.hover : 'transparent'),
          borderLeft: `2px solid ${isActive ? S.activeBorder : 'transparent'}`,
          borderRadius: '6px',
          transition: 'color 0.15s, background 0.15s',
        }}>
          <item.icon
            size={14}
            strokeWidth={isActive ? 2.5 : 1.75}
            style={{ opacity: isActive || hovered ? 1 : 0.65, flexShrink: 0 }}
          />
          {item.label}
        </div>
      )}
    </NavLink>
  );
}

function SidebarContent({ onClose, isAdmin, creatorId }) {
  const groups = isAdmin
    ? NAV_GROUPS_ADMIN
    : [{
        label: 'My Work',
        items: [
          { label: 'My Itineraries', path: '/admin/itineraries', icon: Map },
          ...(creatorId ? [{ label: 'My Profile', path: `/admin/creators/${creatorId}`, icon: User }] : []),
        ],
      }];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Brand */}
      <div style={{ padding: '24px 20px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{
            fontSize: '10px', fontWeight: '700', color: S.activeBorder,
            letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '5px',
          }}>
            {isAdmin ? 'Backoffice' : 'Designer Portal'}
          </p>
          <p style={{
            fontSize: '15px', fontWeight: '600', color: S.text,
            fontFamily: "'Playfair Display', Georgia, serif", letterSpacing: '0.3px',
          }}>
            HiddenAtlas
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textMuted, padding: '4px', display: 'flex' }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div style={{ height: '1px', background: S.divider, marginBottom: '8px' }} />

      {/* Nav groups */}
      <nav style={{ flex: 1, paddingBottom: '16px', overflowY: 'auto' }}>
        {groups.map((group, i) => (
          <div key={group.label} style={{ marginTop: i > 0 ? '16px' : '8px' }}>
            <p style={{
              fontSize: '10px', fontWeight: '600', color: S.textMuted,
              letterSpacing: '1.2px', textTransform: 'uppercase',
              padding: '0 22px', marginBottom: '4px',
            }}>
              {group.label}
            </p>
            {group.items.map(item => (
              <NavItem key={item.path} item={item} onClose={onClose} />
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}

function TopBar({ isMobile, onMenuOpen, user }) {
  const [viewSiteHovered, setViewSiteHovered] = useState(false);
  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join('').toUpperCase()
    || (user?.emailAddresses?.[0]?.emailAddress?.[0] ?? '?').toUpperCase();

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: isMobile ? 0 : '220px',
      right: 0,
      height: '52px',
      background: isMobile ? S.bg : '#FFFFFF',
      borderBottom: isMobile ? `1px solid ${S.divider}` : '1px solid #EDE8E0',
      display: 'flex', alignItems: 'center',
      padding: '0 20px',
      gap: '12px',
      zIndex: isMobile ? 300 : 200,
      boxShadow: isMobile ? 'none' : '0 1px 0 rgba(0,0,0,0.04)',
    }}>
      {isMobile && (
        <>
          <button
            onClick={onMenuOpen}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: S.textMuted, padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <Menu size={20} />
          </button>
          <span style={{ fontSize: '13px', fontWeight: '700', color: S.activeBorder, letterSpacing: '0.5px', flex: 1 }}>
            HiddenAtlas
          </span>
        </>
      )}

      {!isMobile && <div style={{ flex: 1 }} />}

      {/* View site */}
      <a
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setViewSiteHovered(true)}
        onMouseLeave={() => setViewSiteHovered(false)}
        style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '12px', fontWeight: '500',
          color: isMobile
            ? (viewSiteHovered ? S.text : S.textMuted)
            : (viewSiteHovered ? '#1C1A16' : '#6B6156'),
          textDecoration: 'none',
          padding: '5px 10px',
          borderRadius: '6px',
          border: isMobile
            ? `1px solid ${viewSiteHovered ? 'rgba(201,168,106,0.4)' : 'rgba(184,174,161,0.25)'}`
            : `1px solid ${viewSiteHovered ? '#D4C8BB' : '#E8E3DA'}`,
          background: viewSiteHovered
            ? (isMobile ? 'rgba(201,168,106,0.08)' : '#F9F6F1')
            : 'transparent',
          transition: 'all 0.15s',
          whiteSpace: 'nowrap',
        }}
      >
        View site
        <ArrowUpRight size={12} />
      </a>

      {/* Avatar */}
      <div style={{
        width: '30px', height: '30px', borderRadius: '50%',
        background: '#1B6B65',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '11px', fontWeight: '700', color: 'white',
        flexShrink: 0,
        userSelect: 'none',
      }}>
        {initials}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const isMobile  = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);
  const { isAdmin: ctxIsAdmin, isDesigner: ctxIsDesigner, creatorId, loading: ctxLoading } = useUserCtx();

  // Direct email check — same pattern as Navbar, does not depend on API/context.
  const primaryEmail = (
    user?.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)?.emailAddress
    ?? user?.emailAddresses?.[0]?.emailAddress
    ?? ''
  ).toLowerCase().trim();

  const isAdmin    = HARDCODED_ADMIN_EMAILS.has(primaryEmail) || ctxIsAdmin;
  const isDesigner = ctxIsDesigner; // requires active Creator row — context only
  const canAccessBackoffice = isAdmin || isDesigner;

  // Debug — remove once access is confirmed stable
  console.log('[AdminPage guard]', {
    primaryEmail,
    isAdmin,
    isDesigner,
    canAccessBackoffice,
    ctxIsAdmin,
    ctxIsDesigner,
    ctxLoading,
    isSignedIn,
  });

  if (!isLoaded || ctxLoading) {
    return (
      <div style={{ minHeight: '100vh', background: S.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', border: '3px solid #1B6B65', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }
  if (!isSignedIn) {
    console.log('[AdminPage guard] redirect → / (not signed in)');
    return <Navigate to="/" replace />;
  }
  if (!canAccessBackoffice) {
    console.log('[AdminPage guard] redirect → / (canAccessBackoffice=false)', { primaryEmail, isAdmin, isDesigner });
    return <Navigate to="/" replace />;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F1EC' }}>

      {/* ── Top bar ── */}
      <TopBar isMobile={isMobile} onMenuOpen={() => setMenuOpen(true)} user={user} />

      {/* ── Mobile drawer overlay ── */}
      {isMobile && menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 400 }}
          />
          <aside style={{
            position: 'fixed', top: 0, bottom: 0, left: 0,
            width: '240px', background: S.bg,
            display: 'flex', flexDirection: 'column',
            zIndex: 401,
            boxShadow: '4px 0 32px rgba(0,0,0,0.4)',
          }}>
            <SidebarContent onClose={() => setMenuOpen(false)} isAdmin={isAdmin} creatorId={creatorId} />
          </aside>
        </>
      )}

      {/* ── Desktop sidebar ── */}
      {!isMobile && (
        <aside style={{
          width: '220px', flexShrink: 0,
          background: S.bg,
          display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, bottom: 0, left: 0,
          zIndex: 200,
          borderRight: `1px solid ${S.divider}`,
        }}>
          <SidebarContent onClose={null} isAdmin={isAdmin} creatorId={creatorId} />
        </aside>
      )}

      {/* ── Main content ── */}
      <main style={{
        marginLeft: isMobile ? 0 : '220px',
        paddingTop: '52px',
        flex: 1, minHeight: '100vh', overflow: 'auto',
      }}>
        <Outlet />
      </main>

    </div>
  );
}
