import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import {
  SignedIn, SignedOut,
  useUser, useClerk,
} from '@clerk/clerk-react';

const navLinks = [
  { label: 'Itineraries',     href: '/itineraries' },
  { label: 'AI Planner',      href: '/ai-planner' },
  { label: 'Custom Planning', href: '/custom' },
  { label: 'Pricing',         href: '/pricing' },
  { label: 'My Trips',        href: '/my-trips' },
];

function UserAvatar() {
  const { user } = useUser();
  const { signOut, openUserProfile } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
    width: '36px', height: '36px', borderRadius: '50%',
    background: '#1F4D45', color: 'white',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '13px', fontWeight: '600', fontFamily: "'Inter', system-ui, sans-serif",
    cursor: 'pointer', border: 'none', padding: 0, flexShrink: 0, overflow: 'hidden',
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={avatarStyle} aria-label="Account menu">
        {user.imageUrl
          ? <img src={user.imageUrl} alt={user.fullName ?? ''} style={{ width: '36px', height: '36px', objectFit: 'cover', display: 'block', borderRadius: '50%' }} />
          : initials
        }
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          background: 'white', borderRadius: '8px', minWidth: '220px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.10)', border: '1px solid #E8E3DA',
          zIndex: 100, overflow: 'hidden',
        }}>
          {/* User info */}
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
            style={{
              display: 'block', width: '100%', padding: '11px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '500', color: '#1C1A16',
              textAlign: 'left', borderBottom: '1px solid #E8E3DA',
            }}
            onMouseEnter={e => e.currentTarget.style.background = '#F4F1EC'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            Manage account
          </button>

          {/* Sign out */}
          <button
            onClick={() => signOut({ redirectUrl: '/' })}
            style={{
              display: 'block', width: '100%', padding: '11px 16px',
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: '13px', fontWeight: '500', color: '#C0392B',
              textAlign: 'left',
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

export default function Navbar() {
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => { setMenuOpen(false); }, [location]);

  const isTransparent = isHome && !scrolled && !menuOpen;

  return (
    <header style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
      transition: 'background 0.4s ease, box-shadow 0.4s ease',
      background: isTransparent ? 'transparent' : 'rgba(250,250,248,0.97)',
      boxShadow: isTransparent ? 'none' : '0 1px 0 rgba(212,204,191,0.5)',
      backdropFilter: isTransparent ? 'none' : 'blur(12px)',
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>

          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img
              src="/assets/logo-hiddenatlas.svg"
              alt="HiddenAtlas"
              className="ha-logo"
              style={{
                filter: isTransparent ? 'brightness(0) invert(1)' : 'none',
                transition: 'filter 0.4s ease',
              }}
            />
          </Link>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '32px' }} className="hidden-mobile">
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                style={{
                  fontSize: '13.5px', fontWeight: '500', letterSpacing: '0.3px',
                  color: isTransparent ? 'rgba(255,255,255,0.85)' : '#4A433A',
                  textDecoration: 'none', transition: 'color 0.2s', whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => e.target.style.color = isTransparent ? 'white' : '#1B6B65'}
                onMouseLeave={e => e.target.style.color = isTransparent ? 'rgba(255,255,255,0.85)' : '#4A433A'}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right: CTA + auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

            {/* Plan My Trip CTA */}
            <Link
              to="/custom"
              className="hidden-mobile"
              style={{
                padding: '10px 20px', borderRadius: '4px',
                fontSize: '13px', fontWeight: '600', letterSpacing: '0.5px',
                textTransform: 'uppercase', transition: 'all 0.2s',
                background: isTransparent ? 'rgba(255,255,255,0.15)' : '#1B6B65',
                color: 'white',
                border: isTransparent ? '1px solid rgba(255,255,255,0.4)' : '1px solid #1B6B65',
                textDecoration: 'none',
                backdropFilter: isTransparent ? 'blur(8px)' : 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isTransparent ? 'rgba(255,255,255,0.25)' : '#145550'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isTransparent ? 'rgba(255,255,255,0.15)' : '#1B6B65'; }}
            >
              Plan My Trip
            </Link>

            {/* ── Auth — desktop ── */}
            <div className="hidden-mobile" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <SignedOut>
                <Link to="/sign-in" style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '13px', fontWeight: '500', letterSpacing: '0.3px',
                  color: isTransparent ? 'rgba(255,255,255,0.8)' : '#4A433A',
                  padding: '8px 4px', transition: 'color 0.2s', textDecoration: 'none',
                }}
                onMouseEnter={e => e.currentTarget.style.color = isTransparent ? 'white' : '#1B6B65'}
                onMouseLeave={e => e.currentTarget.style.color = isTransparent ? 'rgba(255,255,255,0.8)' : '#4A433A'}
                >
                  Sign in
                </Link>
                <Link to="/sign-up" style={{
                  padding: '8px 16px', borderRadius: '4px',
                  border: isTransparent ? '1px solid rgba(255,255,255,0.35)' : '1px solid #D4CCBF',
                  background: 'transparent',
                  fontSize: '13px', fontWeight: '600', letterSpacing: '0.3px',
                  color: isTransparent ? 'rgba(255,255,255,0.85)' : '#1C1A16',
                  cursor: 'pointer', transition: 'all 0.2s', textDecoration: 'none',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = isTransparent ? 'rgba(255,255,255,0.7)' : '#1B6B65';
                  e.currentTarget.style.color = isTransparent ? 'white' : '#1B6B65';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = isTransparent ? 'rgba(255,255,255,0.35)' : '#D4CCBF';
                  e.currentTarget.style.color = isTransparent ? 'rgba(255,255,255,0.85)' : '#1C1A16';
                }}
                >
                  Sign up
                </Link>
              </SignedOut>

              <SignedIn>
                <UserAvatar />
              </SignedIn>
            </div>

            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                display: 'none', background: 'none', border: 'none',
                cursor: 'pointer', color: isTransparent ? 'white' : '#1C1A16', padding: '4px',
              }}
              className="show-mobile"
              aria-label="Toggle menu"
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {menuOpen && (
        <div style={{ background: '#FAFAF8', borderTop: '1px solid #E8E3DA', padding: '24px' }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                style={{
                  fontSize: '18px',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  color: '#1C1A16', textDecoration: 'none',
                }}
              >
                {link.label}
              </Link>
            ))}

            <Link
              to="/custom"
              style={{
                padding: '14px 24px', borderRadius: '4px',
                background: '#1B6B65', color: 'white',
                fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px',
                textTransform: 'uppercase', textDecoration: 'none', textAlign: 'center',
              }}
            >
              Plan My Trip
            </Link>

            {/* ── Auth — mobile ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '8px', borderTop: '1px solid #E8E3DA' }}>
              <SignedOut>
                <Link to="/sign-in" style={{
                  padding: '13px 24px', borderRadius: '4px',
                  border: '1px solid #D4CCBF', background: 'transparent',
                  fontSize: '14px', fontWeight: '600', color: '#1C1A16',
                  textAlign: 'center', width: '100%', textDecoration: 'none',
                  display: 'block',
                }}>
                  Sign in
                </Link>
                <Link to="/sign-up" style={{
                  padding: '13px 24px', borderRadius: '4px',
                  background: '#1C1A16', border: 'none',
                  fontSize: '14px', fontWeight: '600', color: 'white',
                  textAlign: 'center', width: '100%', textDecoration: 'none',
                  display: 'block',
                }}>
                  Create account
                </Link>
              </SignedOut>
              <SignedIn>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <UserAvatar />
                  <span style={{ fontSize: '14px', color: '#4A433A' }}>My Account</span>
                </div>
              </SignedIn>
            </div>
          </nav>
        </div>
      )}

      <style>{`
        .ha-logo { height: 34px; width: auto; display: block; }
        @media (max-width: 768px) {
          .ha-logo { height: 28px; }
          .hidden-mobile { display: none !important; }
          .show-mobile { display: block !important; }
        }
        @media (min-width: 769px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </header>
  );
}
