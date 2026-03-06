import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Users, ArrowRight, Lock } from 'lucide-react';

// Audience icon map
const audienceIcon = { 'Couples': '♥', 'Families': '⌂', 'Friend Groups': '◉', 'Small Groups': '◉' };

export default function ItineraryCard({ itinerary, variant = 'default' }) {
  const [hovered, setHovered] = useState(false);
  const { id, title, subtitle, country, duration, groupSize, price, isPremium, tag, image, bestFor } = itinerary;

  if (variant === 'featured') {
    return (
      <Link
        to={`/itineraries/${id}`}
        style={{ textDecoration: 'none', display: 'block', height: '100%' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{
          borderRadius: '10px',
          overflow: 'hidden',
          background: 'white',
          boxShadow: hovered ? '0 20px 60px rgba(28, 26, 22, 0.13)' : '0 2px 20px rgba(28, 26, 22, 0.06)',
          transition: 'box-shadow 0.35s ease, transform 0.35s ease',
          transform: hovered ? 'translateY(-5px)' : 'translateY(0)',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Image */}
          <div style={{ position: 'relative', paddingTop: '62%', overflow: 'hidden', flexShrink: 0 }}>
            <img
              src={image}
              alt={title}
              style={{
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.6s ease',
                transform: hovered ? 'scale(1.05)' : 'scale(1)',
              }}
              loading="lazy"
            />
            {/* Gradient */}
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(to top, rgba(28,26,22,0.55) 0%, transparent 55%)',
            }} />
            {/* Tag */}
            {tag && (
              <div style={{
                position: 'absolute', top: '14px', left: '14px',
                padding: '5px 11px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: '700',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                background: isPremium ? '#C9A96E' : '#1B6B65',
                color: 'white',
              }}>
                {tag}
              </div>
            )}
            {isPremium && (
              <div style={{
                position: 'absolute', top: '14px', right: '14px',
                padding: '5px 10px',
                borderRadius: '3px',
                fontSize: '10px',
                fontWeight: '600',
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
                background: 'rgba(28,26,22,0.65)',
                color: 'rgba(255,255,255,0.9)',
                display: 'flex', alignItems: 'center', gap: '4px',
                backdropFilter: 'blur(6px)',
              }}>
                <Lock size={9} />
                Premium
              </div>
            )}
            {/* Country on image */}
            <div style={{ position: 'absolute', bottom: '14px', left: '16px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.9)' }}>
                {country}
              </p>
            </div>
          </div>

          {/* Content */}
          <div style={{ padding: '22px 22px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
            <h3 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '19px',
              fontWeight: '600',
              color: '#1C1A16',
              lineHeight: '1.3',
              marginBottom: '5px',
            }}>
              {title}
            </h3>
            <p style={{ fontSize: '13.5px', color: '#8C8070', marginBottom: '14px', lineHeight: '1.4' }}>
              {subtitle}
            </p>

            {/* Best For pills */}
            {bestFor && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {bestFor.map(label => (
                  <span key={label} style={{
                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                    padding: '3px 9px',
                    borderRadius: '20px',
                    fontSize: '11px',
                    fontWeight: '500',
                    background: '#F4F1EC',
                    color: '#6B6156',
                    letterSpacing: '0.2px',
                  }}>
                    {audienceIcon[label] && (
                      <span style={{ fontSize: '9px', opacity: 0.7 }}>{audienceIcon[label]}</span>
                    )}
                    {label}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '14px', marginBottom: '18px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#6B6156' }}>
                <Clock size={12} strokeWidth={2} />
                {duration}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#6B6156' }}>
                <Users size={12} strokeWidth={2} />
                {groupSize}
              </span>
            </div>

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid #F4F1EC' }}>
              <div>
                {isPremium ? (
                  <span style={{ fontSize: '17px', fontWeight: '700', color: '#1C1A16', fontFamily: "'Playfair Display', Georgia, serif" }}>
                    ${price}
                    <span style={{ fontSize: '12px', fontWeight: '400', color: '#B5AA99', fontFamily: 'Inter, sans-serif' }}> / plan</span>
                  </span>
                ) : (
                  <span style={{ fontSize: '13px', fontWeight: '600', color: '#1B6B65', letterSpacing: '0.3px' }}>
                    Free to Download
                  </span>
                )}
              </div>
              <span style={{
                display: 'flex', alignItems: 'center', gap: '4px',
                fontSize: '12px', fontWeight: '600',
                color: hovered ? '#1B6B65' : '#B5AA99',
                transition: 'color 0.2s',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}>
                View Plan <ArrowRight size={13} />
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Default list variant
  return (
    <Link
      to={`/itineraries/${id}`}
      style={{ textDecoration: 'none' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: '200px 1fr',
        borderRadius: '8px',
        overflow: 'hidden',
        background: 'white',
        boxShadow: hovered ? '0 8px 40px rgba(28, 26, 22, 0.1)' : '0 2px 12px rgba(28, 26, 22, 0.05)',
        transition: 'all 0.3s ease',
        transform: hovered ? 'translateX(4px)' : 'none',
      }}>
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <img
            src={image}
            alt={title}
            style={{
              width: '100%', height: '100%',
              objectFit: 'cover',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.4s ease',
            }}
            loading="lazy"
          />
        </div>
        <div style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '6px' }}>
            {country}
          </p>
          <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: '#1C1A16', marginBottom: '6px' }}>
            {title}
          </h3>
          <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '12px' }}>{subtitle}</p>
          <div style={{ display: 'flex', gap: '12px' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6B6156' }}>
              <Clock size={12} />{duration}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#6B6156' }}>
              <Users size={12} />{groupSize}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
