import { useState } from 'react';
import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { LayoutDashboard, Users, CreditCard, Download, ExternalLink, Inbox, Menu, X } from 'lucide-react';
import { useIsMobile } from '../hooks/useIsMobile';

const ADMIN_EMAILS = [
  'cristiano.xavier@outlook.com',
  'cristiano.xavier@hiddenatlas.travel',
];

const NAV = [
  { label: 'Dashboard',       path: '/admin',                   icon: LayoutDashboard, end: true },
  { label: 'Users',           path: '/admin/users',              icon: Users },
  { label: 'Sales',           path: '/admin/sales',              icon: CreditCard },
  { label: 'Downloads',       path: '/admin/downloads',          icon: Download },
  { label: 'Custom Requests', path: '/admin/custom-requests',    icon: Inbox },
];

function SidebarContent({ onClose }) {
  return (
    <>
      {/* Brand */}
      <div style={{ padding: '22px 20px 18px', borderBottom: '1px solid #1C1A16', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#1B6B65', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '3px' }}>
            Backoffice
          </p>
          <p style={{ fontSize: '12px', color: '#4A433A' }}>HiddenAtlas Admin</p>
        </div>
        {onClose && (
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A433A', padding: '4px', display: 'flex' }}>
            <X size={16} />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '12px 0' }}>
        {NAV.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            end={item.end}
            onClick={onClose}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 20px',
              fontSize: '13px', fontWeight: '500',
              color: isActive ? 'white' : '#6B6156',
              background: isActive ? 'rgba(27,107,101,0.12)' : 'transparent',
              textDecoration: 'none',
              borderLeft: `2px solid ${isActive ? '#1B6B65' : 'transparent'}`,
              transition: 'color 0.15s, background 0.15s',
            })}
          >
            <item.icon size={14} strokeWidth={2} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div style={{ padding: '16px 20px', borderTop: '1px solid #1C1A16' }}>
        <a href="/" style={{
          display: 'flex', alignItems: 'center', gap: '7px',
          fontSize: '12px', color: '#4A433A', textDecoration: 'none',
        }}>
          <ExternalLink size={11} />
          View public site
        </a>
      </div>
    </>
  );
}

export default function AdminPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const isMobile = useIsMobile();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!isLoaded) return <div style={{ minHeight: '100vh', background: '#111110' }} />;

  const isAdmin = isSignedIn && ADMIN_EMAILS.includes(user?.primaryEmailAddress?.emailAddress);
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#F4F1EC' }}>

      {/* ── Mobile top bar ── */}
      {isMobile && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, height: '52px',
          background: '#111110', zIndex: 300,
          display: 'flex', alignItems: 'center', gap: '12px', padding: '0 16px',
          borderBottom: '1px solid #1C1A16',
        }}>
          <button
            onClick={() => setMenuOpen(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B6156', padding: '4px', display: 'flex', alignItems: 'center' }}
          >
            <Menu size={20} />
          </button>
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#1B6B65', letterSpacing: '0.5px' }}>
            HiddenAtlas
          </p>
        </div>
      )}

      {/* ── Mobile drawer overlay ── */}
      {isMobile && menuOpen && (
        <>
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 400 }}
          />
          <aside style={{
            position: 'fixed', top: 0, bottom: 0, left: 0,
            width: '240px', background: '#111110',
            display: 'flex', flexDirection: 'column',
            zIndex: 401,
            boxShadow: '4px 0 24px rgba(0,0,0,0.3)',
          }}>
            <SidebarContent onClose={() => setMenuOpen(false)} />
          </aside>
        </>
      )}

      {/* ── Desktop sidebar ── */}
      {!isMobile && (
        <aside style={{
          width: '220px', flexShrink: 0,
          background: '#111110',
          display: 'flex', flexDirection: 'column',
          position: 'fixed', top: 0, bottom: 0, left: 0,
          zIndex: 200,
        }}>
          <SidebarContent onClose={null} />
        </aside>
      )}

      {/* ── Main content ── */}
      <main style={{
        marginLeft: isMobile ? 0 : '220px',
        paddingTop: isMobile ? '52px' : 0,
        flex: 1, minHeight: '100vh', overflow: 'auto',
      }}>
        <Outlet />
      </main>

    </div>
  );
}
