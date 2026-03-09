import { Link } from 'react-router-dom';
import { ArrowRight, Instagram, Mail } from 'lucide-react';

export default function AboutPage() {
  const values = [
    { title: 'Depth over breadth', desc: 'Three places done brilliantly beats six places done adequately. Every itinerary is designed for depth of experience, not passport stamp counts.' },
    { title: 'Radical honesty', desc: 'If somewhere is over-touristed, we say so. If a famous restaurant no longer deserves its reputation, we tell you. We don\'t publish anything we can\'t stand behind.' },
    { title: 'Independence always', desc: 'No sponsored placements, no free stays in exchange for coverage, no affiliate commissions influencing our picks. The only incentive is your trip being extraordinary.' },
    { title: 'Local is the point', desc: 'Every itinerary prioritises locally-owned properties, restaurants, and experiences. We measure success by how much stays in the communities you visit.' },
  ];

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero — Founder */}
      <section style={{ padding: 'clamp(64px, 10vw, 120px) 24px', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div className="ha-about-hero">

            {/* Portrait */}
            <div className="ha-about-portrait-wrap">
              <img
                src="/assets/cristiano-xavier.png"
                alt="Cristiano Xavier — Founder of HiddenAtlas"
                className="founder-photo"
              />
            </div>

            {/* Text */}
            <div className="ha-about-hero-text">
              <span style={{
                fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
                color: '#1B6B65', display: 'block', marginBottom: '20px',
              }}>
                The Founder
              </span>
              <h1 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 'clamp(32px, 4.5vw, 52px)',
                fontWeight: '600', color: '#1C1A16',
                lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '10px',
              }}>
                About HiddenAtlas
              </h1>
              <p style={{
                fontSize: '15px', fontWeight: '500', color: '#C9A96E',
                letterSpacing: '0.3px', marginBottom: '28px',
              }}>
                Created by Cristiano Xavier
              </p>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8', marginBottom: '20px' }}>
                HiddenAtlas was created by Cristiano Xavier, a lifelong traveller with a passion for discovering places beyond the obvious.
              </p>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8', marginBottom: '20px' }}>
                After years exploring destinations across Europe, Asia, and beyond, Cristiano began documenting the routes, experiences, and hidden corners that made each journey memorable. HiddenAtlas grew from this idea: to transform real travel experience into curated itineraries that others could follow.
              </p>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8', marginBottom: '20px' }}>
                Each journey on HiddenAtlas is built from firsthand exploration, thoughtful planning, and a deep appreciation for places that reward curiosity.
              </p>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8' }}>
                Today, HiddenAtlas helps travellers discover beautiful destinations through carefully designed routes — combining iconic highlights with lesser-known locations that most visitors never find.
              </p>

              <div style={{ display: 'flex', gap: '16px', marginTop: '36px', flexWrap: 'wrap' }}>
                <a
                  href="https://www.instagram.com/hiddenatlas.travel/"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '11px 20px',
                    border: '1px solid #D4CCBF', borderRadius: '4px',
                    fontSize: '13px', fontWeight: '600', letterSpacing: '0.3px',
                    color: '#4A433A', textDecoration: 'none',
                    transition: 'border-color 0.2s, color 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1B6B65'; e.currentTarget.style.color = '#1B6B65'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4CCBF'; e.currentTarget.style.color = '#4A433A'; }}
                >
                  <Instagram size={14} /> @hiddenatlas.travel
                </a>
                <a
                  href="mailto:hiddenatlas.travel@outlook.com"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '11px 20px',
                    border: '1px solid #D4CCBF', borderRadius: '4px',
                    fontSize: '13px', fontWeight: '600', letterSpacing: '0.3px',
                    color: '#4A433A', textDecoration: 'none',
                    transition: 'border-color 0.2s, color 0.2s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1B6B65'; e.currentTarget.style.color = '#1B6B65'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4CCBF'; e.currentTarget.style.color = '#4A433A'; }}
                >
                  <Mail size={14} /> Get in touch
                </a>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '12px' }}>
              How We Work
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: '600', color: '#1C1A16' }}>
              Principles we don't compromise on.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '28px' }}>
            {values.map((v, i) => (
              <div key={i} style={{ padding: '32px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '8px' }}>
                <div style={{ width: '32px', height: '3px', background: '#C9A96E', borderRadius: '2px', marginBottom: '20px' }} />
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '19px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
                  {v.title}
                </h3>
                <p style={{ fontSize: '14.5px', color: '#6B6156', lineHeight: '1.7' }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 24px', textAlign: 'center', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(28px, 4vw, 42px)',
            fontWeight: '600', color: '#1C1A16', marginBottom: '16px',
          }}>
            Ready to plan something remarkable?
          </h2>
          <p style={{ fontSize: '16px', color: '#6B6156', lineHeight: '1.7', marginBottom: '32px' }}>
            Browse the itinerary library or get in touch to build something entirely bespoke.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/itineraries"
              style={{
                padding: '14px 28px', background: '#1B6B65', color: 'white',
                borderRadius: '4px', fontSize: '14px', fontWeight: '600',
                letterSpacing: '0.5px', textTransform: 'uppercase',
                textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px',
              }}
            >
              Browse Itineraries <ArrowRight size={14} />
            </Link>
            <Link
              to="/custom"
              style={{
                padding: '14px 28px', background: 'transparent', color: '#1C1A16',
                border: '1px solid #D4CCBF', borderRadius: '4px',
                fontSize: '14px', fontWeight: '600',
                letterSpacing: '0.5px', textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Plan My Trip
            </Link>
          </div>
        </div>
      </section>

      <style>{`
        .ha-about-hero {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 80px;
          align-items: start;
        }
        .ha-about-portrait-wrap {
          display: flex;
          justify-content: center;
          align-items: flex-start;
        }
        .founder-photo {
          width: 100%;
          max-width: 360px;
          border-radius: 8px;
          display: block;
          box-shadow: 0 24px 80px rgba(28,26,22,0.14);
          object-fit: cover;
          object-position: center top;
        }
        @media (max-width: 900px) {
          .ha-about-hero {
            grid-template-columns: 1fr;
            gap: 40px;
          }
          .founder-photo {
            max-width: 320px;
            margin: 0 auto;
          }
        }
        @media (max-width: 480px) {
          .founder-photo {
            max-width: 100%;
          }
        }
      `}</style>

    </div>
  );
}
