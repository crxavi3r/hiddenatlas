import { Link } from 'react-router-dom';
import { Check, ArrowRight, Star } from 'lucide-react';

export default function PricingPage() {
  const premiumItineraries = [
    { name: 'Single Itinerary', price: '$69–$119', desc: 'One-time purchase. Full access to your chosen route — day plans, stays, restaurants, logistics. Download it forever.' },
    { name: 'Explorer Bundle (3)', price: '$199', desc: 'Choose any 3 premium itineraries. Perfect if you have multiple trips in mind or want to gift one.' },
    { name: 'Annual Access', price: '$349 / year', desc: 'Unlimited downloads from our full library for 12 months, including all new releases. Best value for frequent travelers.' },
  ];

  const customTiers = [
    {
      name: 'Couple / Duo',
      price: '$499',
      best: false,
      group: '2 people',
      duration: 'Up to 14 days',
      features: [
        'Dedicated trip planner',
        'Fully custom day-by-day itinerary',
        'Accommodation shortlist + booking guidance',
        'Restaurant reservations & experiences',
        '2 rounds of revisions',
        'Final PDF + digital delivery',
        'Email support during your trip',
      ],
    },
    {
      name: 'Small Group',
      price: '$749',
      best: true,
      group: '3–6 people',
      duration: 'Up to 14 days',
      features: [
        'Everything in Couple / Duo',
        'Group logistics planning (transfers, dinners)',
        'Multiple room configurations researched',
        '3 rounds of revisions',
        'WhatsApp support during travel',
        'Post-trip debrief & recommendations',
      ],
    },
    {
      name: 'Large Group / Family',
      price: 'From $999',
      best: false,
      group: '7+ people',
      duration: 'Custom scope',
      features: [
        'Everything in Small Group',
        'Multi-room & villa sourcing',
        'Complex logistics & transfers',
        'Activity & experience sourcing',
        'Unlimited revisions',
        '24/7 WhatsApp during travel',
        'Full concierge coordination',
      ],
    },
  ];

  const faqs = [
    {
      q: 'Can I buy an itinerary as a gift?',
      a: 'Yes. After purchase you\'ll receive a digital download you can forward or print for the recipient. We\'re also working on gift cards — coming soon.',
    },
    {
      q: 'What currency are prices in?',
      a: 'All prices are in USD. We accept major credit cards and PayPal.',
    },
    {
      q: 'Do you offer refunds?',
      a: 'Digital itineraries are non-refundable once downloaded. If you\'re unsatisfied with a custom planning engagement, we offer additional revision rounds at no extra charge.',
    },
    {
      q: 'Is the custom planning fee separate from travel costs?',
      a: 'Yes. The planning fee covers our service. All actual travel costs — flights, hotels, meals, activities — are paid directly by you as you book.',
    },
  ];

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{ padding: 'clamp(48px, 8vw, 100px) 24px', textAlign: 'center', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <span style={{
            fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
            color: '#1B6B65', display: 'block', marginBottom: '16px',
          }}>
            Transparent Pricing
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(36px, 5vw, 56px)',
            fontWeight: '600', color: '#1C1A16',
            lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            Plans for every kind of traveler.
          </h1>
          <p style={{ fontSize: '17px', color: '#6B6156', lineHeight: '1.7' }}>
            From a one-off itinerary download to a fully custom luxury trip — we have an option that fits. No hidden fees, no subscriptions you'll forget about.
          </p>
        </div>
      </section>

      {/* Premium Itineraries */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '12px' }}>
              Digital Itineraries
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: '600', color: '#1C1A16' }}>
              Premium Itinerary Plans
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', marginTop: '12px', maxWidth: '480px', margin: '12px auto 0' }}>
              Expertly crafted routes you can download and use forever. No subscription needed.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
            {premiumItineraries.map((plan, i) => (
              <div
                key={i}
                style={{
                  background: 'white', border: '1px solid #E8E3DA',
                  borderRadius: '10px', padding: '32px',
                }}
              >
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
                  {plan.name}
                </h3>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#1B6B65', fontFamily: "'Playfair Display', Georgia, serif", marginBottom: '16px' }}>
                  {plan.price}
                </div>
                <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.7', marginBottom: '28px' }}>
                  {plan.desc}
                </p>
                <Link
                  to="/itineraries"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '13px 20px',
                    background: '#EFF6F5', color: '#1B6B65',
                    border: '1px solid #A8D5D1', borderRadius: '4px',
                    fontSize: '13px', fontWeight: '600',
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    textDecoration: 'none',
                  }}
                >
                  Browse Itineraries <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Custom Planning */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '12px' }}>
              Bespoke Service
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 3.5vw, 42px)', fontWeight: '600', color: '#1C1A16' }}>
              Custom Trip Planning
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', marginTop: '12px', maxWidth: '480px', margin: '12px auto 0' }}>
              One-time planning fee. Your trip designed end-to-end by a human expert who cares.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
            {customTiers.map((tier, i) => (
              <div
                key={i}
                style={{
                  background: tier.best ? '#1C1A16' : 'white',
                  border: tier.best ? 'none' : '1px solid #E8E3DA',
                  borderRadius: '12px', padding: '36px',
                  position: 'relative',
                  transform: tier.best ? 'scale(1.03)' : 'none',
                  boxShadow: tier.best ? '0 24px 80px rgba(28,26,22,0.25)' : 'none',
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

                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: tier.best ? 'white' : '#1C1A16', marginBottom: '4px' }}>
                  {tier.name}
                </h3>
                <p style={{ fontSize: '13px', color: tier.best ? '#8C8070' : '#8C8070', marginBottom: '20px' }}>
                  {tier.group} · {tier.duration}
                </p>
                <div style={{ fontSize: '38px', fontWeight: '700', color: tier.best ? '#C9A96E' : '#1B6B65', fontFamily: "'Playfair Display', Georgia, serif", marginBottom: '28px' }}>
                  {tier.price}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '32px' }}>
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
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    padding: '14px 20px', borderRadius: '4px',
                    fontSize: '13px', fontWeight: '600',
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    textDecoration: 'none',
                    background: tier.best ? '#C9A96E' : '#1B6B65',
                    color: 'white',
                    border: 'none',
                  }}
                >
                  Get Started <ArrowRight size={13} />
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '32px', fontWeight: '600', color: '#1C1A16', textAlign: 'center', marginBottom: '40px' }}>
            Pricing FAQs
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px', padding: '24px', marginBottom: '4px' }}>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: '#1C1A16', marginBottom: '10px' }}>
                  {faq.q}
                </h3>
                <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7' }}>{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
