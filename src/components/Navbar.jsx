import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';

const navLinks = [
  { label: 'Itineraries', href: '/itineraries' },
  { label: 'AI Planner', href: '/ai-planner' },
  { label: 'Custom Planning', href: '/custom' },
  { label: 'Pricing', href: '/pricing' },
  { label: 'Journal', href: '/journal' },
  { label: 'About', href: '/about' },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const isHome = location.pathname === '/';

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location]);

  const isTransparent = isHome && !scrolled && !menuOpen;

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        transition: 'background 0.4s ease, box-shadow 0.4s ease, border-color 0.4s ease',
        background: isTransparent ? 'transparent' : 'rgba(250, 250, 248, 0.97)',
        boxShadow: isTransparent ? 'none' : '0 1px 0 rgba(212, 204, 191, 0.5)',
        backdropFilter: isTransparent ? 'none' : 'blur(12px)',
      }}
    >
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: '72px' }}>
          {/* Logo */}
          <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
            <img
              src="/assets/logo-hiddenatlas.svg"
              alt="HiddenAtlas"
              className="ha-logo"
              style={{
                // height/width controlled by .ha-logo in <style> below
                // so the mobile media query can override without !important
                filter: isTransparent ? 'brightness(0) invert(1)' : 'none',
                transition: 'filter 0.4s ease',
              }}
            />
          </Link>

          {/* Desktop Nav */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '36px' }} className="hidden-mobile">
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                style={{
                  fontSize: '13.5px',
                  fontWeight: '500',
                  letterSpacing: '0.3px',
                  color: isTransparent ? 'rgba(255,255,255,0.85)' : '#4A433A',
                  textDecoration: 'none',
                  transition: 'color 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => e.target.style.color = isTransparent ? 'white' : '#1B6B65'}
                onMouseLeave={e => e.target.style.color = isTransparent ? 'rgba(255,255,255,0.85)' : '#4A433A'}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* CTA */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <Link
              to="/custom"
              className="hidden-mobile"
              style={{
                padding: '10px 22px',
                borderRadius: '4px',
                fontSize: '13px',
                fontWeight: '600',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                transition: 'all 0.2s',
                background: isTransparent ? 'rgba(255,255,255,0.15)' : '#1B6B65',
                color: 'white',
                border: isTransparent ? '1px solid rgba(255,255,255,0.4)' : '1px solid #1B6B65',
                textDecoration: 'none',
                backdropFilter: isTransparent ? 'blur(8px)' : 'none',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = isTransparent ? 'rgba(255,255,255,0.25)' : '#145550';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isTransparent ? 'rgba(255,255,255,0.15)' : '#1B6B65';
              }}
            >
              Plan My Trip
            </Link>

            {/* Mobile toggle */}
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              style={{
                display: 'none',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: isTransparent ? 'white' : '#1C1A16',
                padding: '4px',
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
        <div style={{
          background: '#FAFAF8',
          borderTop: '1px solid #E8E3DA',
          padding: '24px',
        }}>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {navLinks.map(link => (
              <Link
                key={link.href}
                to={link.href}
                style={{
                  fontSize: '18px',
                  fontFamily: "'Playfair Display', Georgia, serif",
                  color: '#1C1A16',
                  textDecoration: 'none',
                }}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/custom"
              style={{
                padding: '14px 24px',
                borderRadius: '4px',
                background: '#1B6B65',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                textDecoration: 'none',
                textAlign: 'center',
              }}
            >
              Plan My Trip
            </Link>
          </nav>
        </div>
      )}

      <style>{`
        /* Logo sizing — height set here so mobile media query can override */
        .ha-logo {
          height: 34px;
          width: auto;
          display: block;
        }
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
