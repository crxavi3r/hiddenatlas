import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';

const itineraryIncludes = [
  'Day-by-day route and schedule',
  'Curated hotel suggestions',
  'Restaurant recommendations',
  'Logistics and transport notes',
  'Downloadable PDF — yours forever',
];

const customTiers = [
  {
    name: 'Couple / Duo',
    price: '€349',
    group: '2 people',
    duration: 'Up to 14 days',
    best: false,
    features: [
      'Dedicated trip planner',
      'Fully custom day-by-day itinerary',
      'Accommodation shortlist and booking guidance',
      'Restaurant reservations and experiences',
      '2 rounds of revisions',
      'Final PDF and digital delivery',
      'Email support during your trip',
    ],
  },
  {
    name: 'Small Group',
    price: '€549',
    group: '3–6 people',
    duration: 'Up to 14 days',
    best: true,
    features: [
      'Everything in Couple / Duo',
      'Group logistics planning (transfers, dinners)',
      'Multiple room configurations researched',
      '3 rounds of revisions',
      'WhatsApp support during travel',
      'Post-trip debrief and recommendations',
    ],
  },
  {
    name: 'Large Group / Family',
    price: 'From €849',
    group: '7+ people',
    duration: 'Custom scope',
    best: false,
    features: [
      'Everything in Small Group',
      'Multi-room and villa sourcing',
      'Complex logistics and transfers',
      'Activity and experience sourcing',
      'Unlimited revisions',
      '24/7 WhatsApp during travel',
      'Full concierge coordination',
    ],
  },
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

      {/* Digital Itinerary — single card */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '12px' }}>
              Digital Itineraries
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
              Premium Itinerary Download
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', maxWidth: '440px', margin: '0 auto', lineHeight: '1.7' }}>
              Expertly crafted routes you can download and use forever. No subscription needed.
            </p>
          </div>

          <div style={{ maxWidth: '420px', margin: '0 auto' }}>
            <div style={{
              background: 'white', border: '1px solid #E8E3DA',
              borderRadius: '12px', padding: '40px 36px',
              display: 'flex', flexDirection: 'column',
            }}>
              <div style={{
                fontSize: '52px', fontWeight: '700',
                fontFamily: "'Playfair Display', Georgia, serif",
                color: '#1B6B65', lineHeight: '1', marginBottom: '8px',
              }}>
                €29
              </div>
              <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '28px' }}>
                One-time purchase. No subscription.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
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
          </div>
        </div>
      </section>

      {/* Custom Planning */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '12px' }}>
              Bespoke Service
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
              Custom Trip Planning
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', maxWidth: '480px', margin: '0 auto', lineHeight: '1.7' }}>
              One-time planning fee. Your trip designed end-to-end by a human expert who cares.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px', alignItems: 'start' }}>
            {customTiers.map((tier, i) => (
              <div
                key={i}
                style={{
                  background: tier.best ? '#1C1A16' : 'white',
                  border: tier.best ? 'none' : '1px solid #E8E3DA',
                  borderRadius: '12px', padding: '36px 32px',
                  position: 'relative',
                  boxShadow: tier.best ? '0 24px 80px rgba(28,26,22,0.22)' : 'none',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {tier.best && (
                  <div style={{
                    position: 'absolute', top: '-14px', left: '50%', transform: 'translateX(-50%)',
                    background: '#C9A96E', color: 'white',
                    padding: '5px 16px', borderRadius: '3px',
                    fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>
                    Most Popular
                  </div>
                )}

                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: tier.best ? 'white' : '#1C1A16', marginBottom: '4px' }}>
                  {tier.name}
                </h3>
                <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '20px' }}>
                  {tier.group} · {tier.duration}
                </p>
                <div style={{ fontSize: '38px', fontWeight: '700', color: tier.best ? '#C9A96E' : '#1B6B65', fontFamily: "'Playfair Display', Georgia, serif", marginBottom: '28px', lineHeight: '1' }}>
                  {tier.price}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px', flex: 1 }}>
                  {tier.features.map((f, j) => (
                    <div key={j} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <Check size={14} color={tier.best ? '#C9A96E' : '#1B6B65'} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span style={{ fontSize: '14px', color: tier.best ? '#D4CCBF' : '#4A433A', lineHeight: '1.5' }}>{f}</span>
                    </div>
                  ))}
                </div>

                <Link
                  to="/custom"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '14px 20px', borderRadius: '4px',
                    fontSize: '13px', fontWeight: '600',
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    textDecoration: 'none',
                    background: tier.best ? '#C9A96E' : '#1B6B65',
                    color: 'white',
                  }}
                >
                  Request Custom Planning <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
