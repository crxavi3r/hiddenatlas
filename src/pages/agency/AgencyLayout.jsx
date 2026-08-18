import { useState } from 'react';
import { Outlet, NavLink, Navigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, MapPin, Copy, Users, UserCheck,
  Palette, Menu, X, ArrowLeft, Building2,
} from 'lucide-react';
import { AgencyCtxProvider, useAgencyCtx } from '../../lib/useAgencyCtx.jsx';
import ErrorBoundary from '../../components/ErrorBoundary';

const S = {
  sidebar:      '#FFFFFF',
  border:       '#E8E3DA',
  text:         '#1C1A16',
  textMuted:    '#8C8070',
  hover:        '#F5F1EB',
  activeBg:     '#1B6B65',
  activeText:   '#FFFFFF',
  activeBorder: '#C9A96E',
};

const NAV_ITEMS = [
  { label: 'Dashboard',  path: '/agency',          icon: LayoutDashboard, end: true },
  { label: 'Trips',      path: '/agency/trips',     icon: MapPin },
  { label: 'Templates',  path: '/agency/templates', icon: Copy },
  { label: 'Clients',    path: '/agency/clients',   icon: Users },
  { label: 'Team',       path: '/agency/team',      icon: UserCheck },
  { label: 'Branding',   path: '/agency/branding',  icon: Palette },
];

function NavItem({ item, onClose }) {
  const [hovered, setHovered] = useState(false);
  return (
    <NavLink
      to={item.path}
      end={item.end}
      onClick={onClose}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ textDecoration: 'none', display: 'block', margin: '1px 8px' }}
    >
      {({ isActive }) => (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '9px 14px',
          fontSize: '13px', fontWeight: isActive ? '600' : '400',
          color:      isActive ? S.activeText : (hovered ? S.text : S.textMuted),
          background: isActive ? S.activeBg   : (hovered ? S.hover : 'transparent'),
          borderRadius: '8px',
          borderLeft: `2px solid ${isActive ? S.activeBorder : 'transparent'}`,
          transition: 'color 0.12s, background 0.12s',
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

function Sidebar({ mobileOpen, onClose }) {
  const { agencyName, loading, isGlobalAdmin } = useAgencyCtx();
  return (
    <div style={{
      width: 220, flexShrink: 0,
      background: S.sidebar,
      borderRight: `1px solid ${S.border}`,
      display: 'flex', flexDirection: 'column',
      height: '100vh',
      position: 'sticky', top: 0,
      overflowY: 'auto',
      ...(mobileOpen !== undefined ? {
        position: 'fixed', top: 0, left: mobileOpen ? 0 : -280,
        zIndex: 999, width: 260,
        transition: 'left 0.25s',
        boxShadow: mobileOpen ? '4px 0 24px rgba(0,0,0,0.12)' : 'none',
      } : {}),
    }}>
      {/* Agency header */}
      <div style={{
        padding: '20px 16px 12px',
        borderBottom: `1px solid ${S.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <Building2 size={16} style={{ color: '#1B6B65', flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: '600', color: '#1B6B65', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Agency
          </span>
        </div>
        <p style={{ fontSize: '14px', fontWeight: '700', color: S.text, margin: 0, lineHeight: 1.3 }}>
          {loading ? '...' : (agencyName || 'My Agency')}
        </p>
      </div>

      {/* Nav items */}
      <nav style={{ padding: '8px 0', flex: 1 }}>
        {NAV_ITEMS.map(item => (
          <NavItem key={item.path} item={item} onClose={onClose} />
        ))}
      </nav>

      {/* Footer links */}
      <div style={{ padding: '12px', borderTop: `1px solid ${S.border}` }}>
        {isGlobalAdmin ? (
          <>
            <div style={{ padding: '8px 14px 4px', background: '#FFF8EC', borderRadius: '8px', marginBottom: '4px', border: '1px solid #F0E0B0' }}>
              <p style={{ fontSize: '10px', fontWeight: '700', color: '#C9A96E', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 2px' }}>Global Admin View</p>
              <p style={{ fontSize: '11px', color: '#8C8070', margin: 0 }}>Viewing as HiddenAtlas admin</p>
            </div>
            <Link
              to="/admin/agencies"
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', fontSize: '12px', color: S.textMuted, textDecoration: 'none', borderRadius: '8px' }}
            >
              <ArrowLeft size={13} strokeWidth={1.75} />
              Back to admin panel
            </Link>
          </>
        ) : (
          <Link
            to="/my-trips"
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 14px', fontSize: '12px', color: S.textMuted, textDecoration: 'none', borderRadius: '8px' }}
          >
            <ArrowLeft size={13} strokeWidth={1.75} />
            Personal workspace
          </Link>
        )}
      </div>
    </div>
  );
}

function AgencyLayoutInner() {
  const { agencyId, loading, isGlobalAdmin } = useAgencyCtx();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <span style={{ fontSize: '14px', color: '#8C8070' }}>Loading...</span>
      </div>
    );
  }

  if (!agencyId) {
    if (isGlobalAdmin) return <Navigate to="/admin/agencies" replace />;
    return <Navigate to="/agency/onboarding" replace />;
  }

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#F7F4F0' }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 998 }}
        />
      )}

      {/* Desktop sidebar */}
      <div style={{ display: 'none' }} className="agency-sidebar-desktop">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Mobile top bar */}
        <div
          className="agency-topbar-mobile"
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px',
            background: '#FFFFFF', borderBottom: `1px solid ${S.border}`,
          }}
        >
          <button
            onClick={() => setMobileOpen(v => !v)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <span style={{ fontSize: '14px', fontWeight: '600', color: '#1B6B65' }}>Agency</span>
        </div>

        <main style={{ flex: 1, overflowY: 'auto' }}>
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>

      {/* Desktop: hide mobile top bar, show sidebar inline */}
      <style>{`
        @media (min-width: 768px) {
          .agency-sidebar-desktop { display: block !important; }
          .agency-topbar-mobile   { display: none   !important; }
        }
      `}</style>
    </div>
  );
}

export default function AgencyLayout() {
  return (
    <AgencyCtxProvider>
      <AgencyLayoutInner />
    </AgencyCtxProvider>
  );
}
