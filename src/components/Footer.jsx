import { Link } from 'react-router-dom';
import { Instagram, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer style={{
      background: '#1C1A16',
      color: '#B5AA99',
      padding: '72px 24px 40px',
    }}>
      <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '48px',
          marginBottom: '64px',
        }}>
          {/* Brand */}
          <div style={{ gridColumn: 'span 1' }}>
            <Link to="/" style={{ display: 'inline-block', marginBottom: '16px' }}>
              <img
                src="/assets/logo-hiddenatlas.svg"
                alt="HiddenAtlas"
                style={{
                  height: '28px',
                  width: 'auto',
                  display: 'block',
                  // Convert to white so both the star and text are readable
                  // against the dark footer background (#1C1A16).
                  filter: 'brightness(0) invert(1)',
                }}
              />
            </Link>
            <p style={{ fontSize: '14px', lineHeight: '1.7', color: '#8C8070', maxWidth: '240px' }}>
              Curated travel itineraries for people who want extraordinary experiences without the ordinary effort.
            </p>
            <p style={{ fontSize: '13px', color: '#6B6156', marginTop: '10px', fontStyle: 'italic' }}>
              Built from real travel experiences.
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
              <a
                href="https://www.instagram.com/hiddenatlas.travel/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  width: '36px', height: '36px',
                  border: '1px solid #2E2922',
                  borderRadius: '4px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#8C8070',
                  transition: 'border-color 0.2s, color 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#C9A96E';
                  e.currentTarget.style.color = '#C9A96E';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#2E2922';
                  e.currentTarget.style.color = '#8C8070';
                }}
                aria-label="HiddenAtlas on Instagram"
              >
                <Instagram size={15} />
              </a>
              <a
                href="mailto:contact@hiddenatlas.travel"
                style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  padding: '0 12px', height: '36px',
                  border: '1px solid #2E2922',
                  borderRadius: '4px',
                  color: '#8C8070', fontSize: '12.5px',
                  textDecoration: 'none',
                  transition: 'border-color 0.2s, color 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = '#C9A96E';
                  e.currentTarget.style.color = '#C9A96E';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#2E2922';
                  e.currentTarget.style.color = '#8C8070';
                }}
              >
                <Mail size={13} />
                contact@hiddenatlas.travel
              </a>
            </div>
          </div>

          {/* Explore */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6B6156', marginBottom: '20px' }}>
              Explore
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                ['Itineraries', '/itineraries'],
                ['Free Itineraries', '/itineraries?filter=free'],
                ['Premium Itineraries', '/itineraries?filter=premium'],
                ['Pricing', '/pricing'],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  to={href}
                  style={{ fontSize: '14px', color: '#8C8070', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = '#D4CCBF'}
                  onMouseLeave={e => e.target.style.color = '#8C8070'}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Services */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6B6156', marginBottom: '20px' }}>
              Services
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                ['Custom Trip Planning', '/custom'],
                ['Group Travel', '/custom#groups'],
                ['Honeymoon Planning', '/custom#honeymoon'],
                ['Family Adventures', '/custom#family'],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  to={href}
                  style={{ fontSize: '14px', color: '#8C8070', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = '#D4CCBF'}
                  onMouseLeave={e => e.target.style.color = '#8C8070'}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>

          {/* Company */}
          <div>
            <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#6B6156', marginBottom: '20px' }}>
              Company
            </p>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                ['About HiddenAtlas', '/about'],
                ['Journal', '/journal'],
                ['FAQ', '/faq'],
                ['Contact', '/contact'],
              ].map(([label, href]) => (
                <Link
                  key={href}
                  to={href}
                  style={{ fontSize: '14px', color: '#8C8070', transition: 'color 0.2s' }}
                  onMouseEnter={e => e.target.style.color = '#D4CCBF'}
                  onMouseLeave={e => e.target.style.color = '#8C8070'}
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </div>

        {/* Positioning disclaimer */}
        <p style={{ fontSize: '12px', color: '#4A433A', lineHeight: '1.6', marginBottom: '32px', maxWidth: '600px' }}>
          HiddenAtlas designs travel itineraries but does not operate travel services or handle bookings. All reservations are made directly by the traveller.
        </p>

        {/* Bottom */}
        <div style={{
          borderTop: '1px solid #2E2922',
          paddingTop: '32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}>
          <p style={{ fontSize: '13px', color: '#6B6156' }}>
            © {new Date().getFullYear()} HiddenAtlas. All rights reserved.
          </p>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {[
              ['Privacy Policy',   '/privacy'],
              ['Terms of Service', '/terms'],
              ['Refund Policy',    '/refunds'],
            ].map(([label, to]) => (
              <Link
                key={to}
                to={to}
                style={{ fontSize: '13px', color: '#6B6156', transition: 'color 0.2s' }}
                onMouseEnter={e => e.target.style.color = '#8C8070'}
                onMouseLeave={e => e.target.style.color = '#6B6156'}
              >
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
