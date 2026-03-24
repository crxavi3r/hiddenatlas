import { Link } from 'react-router-dom';
import { Check, ArrowRight } from 'lucide-react';
import { CUSTOM_TIERS } from '../data/customPricingTiers';
import { useSEO } from '../hooks/useSEO';

const itineraryIncludes = [
  'Day-by-day travel route and schedule',
  'Key places and experiences to visit',
  'Route planning and trip structure',
  'Transport and logistics notes',
  'Downloadable travel guide (PDF)',
];

export default function PricingPage() {
  useSEO({
    title: 'Pricing — Digital Itineraries & Custom Trip Planning',
    description: 'Premium travel itineraries from €29. Custom trip planning from €600 for couples to €1,400+ for large groups. One-time purchase, no subscriptions.',
    canonical: 'https://hiddenatlas.travel/pricing',
  });

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
              Curated travel itineraries
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', maxWidth: '440px', margin: '0 auto', lineHeight: '1.7' }}>
              Travel routes designed from real journeys, ready for your own trip.
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
              Custom Planning
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
              Custom Trip Planning
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', maxWidth: '480px', margin: '0 auto', lineHeight: '1.7' }}>
              One-time planning fee. Your itinerary designed by a dedicated trip planner who cares.
            </p>
          </div>

          {/* Cards grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px', alignItems: 'stretch', marginTop: '14px' }}>
            {CUSTOM_TIERS.map((tier, i) => (
              <div
                key={i}
                style={{
                  background: tier.best ? '#1C1A16' : 'white',
                  border: tier.best ? 'none' : '1px solid #E8E3DA',
                  borderRadius: '12px',
                  padding: '36px 32px',
                  paddingTop: '42px',
                  position: 'relative',
                  boxShadow: tier.best ? '0 24px 80px rgba(28,26,22,0.22)' : 'none',
                  display: 'flex', flexDirection: 'column',
                }}
              >
                {tier.best && (
                  <div style={{
                    position: 'absolute', top: '-12px', left: '50%', transform: 'translateX(-50%)',
                    background: '#C9A96E', color: 'white',
                    padding: '5px 16px', borderRadius: '3px',
                    fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase',
                    whiteSpace: 'nowrap',
                  }}>
                    Most Popular
                  </div>
                )}

                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: tier.best ? 'white' : '#1C1A16', marginBottom: '4px' }}>
                  {tier.label}
                </h3>
                <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '20px' }}>
                  {tier.range}
                </p>

                {/* Price block */}
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  lineHeight: '1', whiteSpace: 'nowrap',
                  minHeight: '48px', marginBottom: '28px',
                  display: 'flex', alignItems: 'flex-end',
                }}>
                  {tier.customQuote ? (
                    <span style={{ fontSize: '22px', fontWeight: '600', color: '#8C8070', fontStyle: 'italic' }}>
                      Custom quote
                    </span>
                  ) : (
                    <span style={{ fontSize: '38px', fontWeight: '700', color: tier.best ? '#C9A96E' : '#1B6B65' }}>
                      {tier.displayPrice}
                    </span>
                  )}
                </div>

                {/* Features */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, marginBottom: '32px' }}>
                  {tier.features.map((f, j) => (
                    <div key={j} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <Check size={14} color={tier.best ? '#C9A96E' : '#1B6B65'} strokeWidth={2.5} style={{ flexShrink: 0, marginTop: '2px' }} />
                      <span style={{ fontSize: '14px', color: tier.best ? '#D4CCBF' : '#4A433A', lineHeight: '1.5' }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
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
                    marginTop: 'auto',
                  }}
                >
                  {tier.customQuote ? 'Request a Quote' : 'Start Planning'} <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>

          <p style={{
            marginTop: '32px',
            textAlign: 'center',
            fontSize: '13px',
            color: '#8C8070',
            maxWidth: '540px',
            margin: '32px auto 0',
            lineHeight: '1.7',
          }}>
            One-time itinerary fee — not per person.<br />
            HiddenAtlas designs your itinerary but does not operate or book travel services. All reservations are made directly by you.
          </p>
        </div>
      </section>

    </div>
  );
}
