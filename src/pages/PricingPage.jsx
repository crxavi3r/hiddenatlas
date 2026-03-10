import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';

const itineraryIncludes = [
  'Day-by-day route and schedule',
  'Curated hotel suggestions',
  'Restaurant recommendations',
  'Logistics and transport notes',
  'Downloadable PDF — yours forever',
];

const customIncludes = [
  'Dedicated human trip planner',
  'Fully custom day-by-day itinerary',
  'Accommodation shortlist and booking guidance',
  'Restaurant reservations and experiences',
  'Revisions until you are satisfied',
  'Final PDF and digital delivery',
  'Support during your trip',
];

export default function PricingPage() {
  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{ padding: 'clamp(48px, 8vw, 100px) 24px', textAlign: 'center', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <span style={{
            fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
            color: '#1B6B65', display: 'block', marginBottom: '16px',
          }}>
            Simple Pricing
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(36px, 5vw, 54px)',
            fontWeight: '600', color: '#1C1A16',
            lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            Two ways to travel better.
          </h1>
          <p style={{ fontSize: '17px', color: '#6B6156', lineHeight: '1.7' }}>
            Download a curated itinerary for your next trip, or let us plan everything from scratch.
          </p>
        </div>
      </section>

      {/* Two options */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{
          maxWidth: '900px', margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}>

          {/* Option 1 — Itinerary Download */}
          <div style={{
            background: 'white',
            border: '1px solid #E8E3DA',
            borderRadius: '12px',
            padding: '40px 36px',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <span style={{
              fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
              color: '#1B6B65', display: 'block', marginBottom: '16px',
            }}>
              Digital Itinerary
            </span>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px',
            }}>
              Premium Itinerary Download
            </h2>
            <div style={{
              fontSize: '48px', fontWeight: '700',
              fontFamily: "'Playfair Display', Georgia, serif",
              color: '#1B6B65', lineHeight: '1', marginBottom: '8px',
            }}>
              €29
            </div>
            <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '28px' }}>
              One-time purchase. No subscription.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px', flex: 1 }}>
              {itineraryIncludes.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Check size={14} color="#1B6B65" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '3px' }} />
                  <span style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.5' }}>{item}</span>
                </div>
              ))}
            </div>

            <Link
              to="/itineraries"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '14px 24px', borderRadius: '4px',
                background: '#1B6B65', color: 'white',
                fontSize: '13px', fontWeight: '600',
                letterSpacing: '0.6px', textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Browse Itineraries <ArrowRight size={13} />
            </Link>
          </div>

          {/* Option 2 — Custom Planning */}
          <div style={{
            background: '#1C1A16',
            borderRadius: '12px',
            padding: '40px 36px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 80px rgba(28,26,22,0.18)',
          }}>
            <span style={{
              fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
              color: '#C9A96E', display: 'block', marginBottom: '16px',
            }}>
              Bespoke Service
            </span>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '26px', fontWeight: '600', color: 'white', marginBottom: '8px',
            }}>
              Custom Trip Planning
            </h2>
            <div style={{
              fontSize: '48px', fontWeight: '700',
              fontFamily: "'Playfair Display', Georgia, serif",
              color: '#C9A96E', lineHeight: '1', marginBottom: '8px',
            }}>
              From €349
            </div>
            <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '28px' }}>
              One-time planning fee. Trip designed end-to-end.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '36px', flex: 1 }}>
              {customIncludes.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                  <Check size={14} color="#C9A96E" strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '3px' }} />
                  <span style={{ fontSize: '15px', color: '#D4CCBF', lineHeight: '1.5' }}>{item}</span>
                </div>
              ))}
            </div>

            <Link
              to="/custom"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '14px 24px', borderRadius: '4px',
                background: '#C9A96E', color: 'white',
                fontSize: '13px', fontWeight: '600',
                letterSpacing: '0.6px', textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Request Custom Planning <ArrowRight size={13} />
            </Link>
          </div>

        </div>
      </section>

    </div>
  );
}
