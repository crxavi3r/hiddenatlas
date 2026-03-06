import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const faqs = [
  {
    category: 'About Our Itineraries',
    items: [
      {
        q: 'Are the itineraries really researched in person?',
        a: 'Yes — every route in our library has been traveled by a member of our team or a trusted local correspondent. We do not publish destinations we haven\'t personally vetted. We also update our itineraries when conditions change (new openings, closures, seasonal shifts).',
      },
      {
        q: 'How detailed are the premium itineraries?',
        a: 'Premium itineraries are built to be genuinely usable. You\'ll get a day-by-day plan with suggested timings, 12–15 specific accommodation recommendations across budget tiers, 20+ restaurant picks with booking notes, transport logistics (how to get between places, how long it takes), estimated daily budgets, and insider advice about what to book months in advance versus what you can leave flexible.',
      },
      {
        q: 'Are your itineraries suitable for first-time visitors?',
        a: 'Absolutely. We design for travelers who haven\'t been to a destination before, while also including options that experienced travelers will appreciate. Each itinerary includes orientation context, cultural notes, and practical advice for navigating the region.',
      },
      {
        q: 'How do I receive my itinerary after purchase?',
        a: 'Immediately after payment, you\'ll receive a download link via email. The itinerary comes as a beautifully designed PDF, optimized for both desktop and mobile. You keep it forever — no expiry.',
      },
    ],
  },
  {
    category: 'Custom Trip Planning',
    items: [
      {
        q: 'What does the custom planning process look like?',
        a: 'You start by filling out a brief on our website — destinations, dates, group size, interests, and budget range. Within 24–48 hours, your dedicated planner will reach out to discuss the details. We then build a full itinerary over 7–10 days, incorporating your feedback in revision rounds. Final delivery is a comprehensive PDF and optional booking support.',
      },
      {
        q: 'Can you plan trips that aren\'t in your existing library?',
        a: 'Yes. Our library represents routes we\'ve codified, but our planners have expertise across 70+ countries. If you\'ve dreamed of a particular destination, our custom service is the best way to get there.',
      },
      {
        q: 'Do you book hotels and activities on our behalf?',
        a: 'We provide detailed recommendations and booking instructions. For premium custom clients, we can make recommendations and guide the booking process directly. Full end-to-end booking (acting as your travel agent) is available as an add-on service — ask your planner for details.',
      },
      {
        q: 'What if we change our minds after receiving the itinerary?',
        a: 'Revision rounds are included in every custom plan. We don\'t stop until it\'s right. If circumstances change significantly after delivery (e.g., you need to change your travel dates entirely), we can discuss a revised scope.',
      },
    ],
  },
  {
    category: 'Pricing & Payments',
    items: [
      {
        q: 'Is the planning fee refundable?',
        a: 'Digital itinerary downloads are non-refundable once accessed. For custom planning, the fee is non-refundable after the planning process has begun — but we offer revision rounds to ensure your satisfaction.',
      },
      {
        q: 'Does the custom planning fee include my travel costs?',
        a: 'No. The planning fee is our service charge for designing your trip. All actual costs — flights, accommodation, meals, experiences, transfers — are paid directly by you as you book.',
      },
      {
        q: 'Do you offer group discounts?',
        a: 'Our pricing is already tiered by group size. For large corporate retreats or group trips above 15 people, contact us directly for a custom quote.',
      },
    ],
  },
  {
    category: 'Travel Style & Audience',
    items: [
      {
        q: 'Who is HiddenAtlas designed for?',
        a: 'We design for travelers who want quality over quantity — people who\'d rather spend three extraordinary days in one place than rush through five. Our audience tends to value comfort, authenticity, local culture, good food, and smart logistics. They\'re not necessarily looking for the most extreme luxury, but they do care about staying somewhere with character and eating somewhere memorable.',
      },
      {
        q: 'Are your itineraries suitable for families with children?',
        a: 'Many are, and we flag this in each itinerary\'s \'Best For\' section. Several routes are specifically designed to work for families. If you need something tailored to your children\'s ages and interests, the custom planning service is ideal.',
      },
      {
        q: 'Do you cover adventure or off-grid travel?',
        a: 'We cover a range of styles — from relaxed cultural immersion to more active routes. We tend to avoid purely extreme or survival-style travel, but we definitely include hiking, trekking, sailing, and wilderness experiences within the context of well-planned journeys.',
      },
    ],
  },
];

function FAQAccordion({ question, answer }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: '1px solid #E8E3DA',
      padding: '0',
    }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '22px 0',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', gap: '20px',
        }}
      >
        <span style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '18px', fontWeight: '500', color: '#1C1A16', lineHeight: '1.4',
        }}>
          {question}
        </span>
        <span style={{
          flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
          border: '1px solid',
          borderColor: open ? '#1B6B65' : '#D4CCBF',
          background: open ? '#1B6B65' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.25s',
        }}>
          <svg width="10" height="10" viewBox="0 0 10 10">
            {!open && <line x1="5" y1="1" x2="5" y2="9" stroke="white" strokeWidth="1.5" />}
            <line x1="1" y1="5" x2="9" y2="5" stroke={open ? 'white' : '#8C8070'} strokeWidth="1.5" />
          </svg>
        </span>
      </button>
      {open && (
        <div style={{ paddingBottom: '22px' }}>
          <p style={{ fontSize: '16px', color: '#4A433A', lineHeight: '1.75' }}>{answer}</p>
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  const [activeCategory, setActiveCategory] = useState(null);

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{ padding: 'clamp(48px, 8vw, 100px) 24px', background: '#F4F1EC', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '16px' }}>
            FAQ
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: '600', color: '#1C1A16',
            lineHeight: '1.2', letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            Questions, answered.
          </h1>
          <p style={{ fontSize: '17px', color: '#6B6156', lineHeight: '1.7' }}>
            Everything you need to know before you book, download, or plan. Can't find what you're looking for? Drop us a line.
          </p>
        </div>
      </section>

      {/* FAQ Content */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto' }}>
          {faqs.map((section, i) => (
            <div key={i} style={{ marginBottom: '56px' }}>
              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '24px', fontWeight: '600', color: '#1C1A16',
                marginBottom: '4px', paddingBottom: '16px',
                borderBottom: '2px solid #E8E3DA',
              }}>
                {section.category}
              </h2>
              <div>
                {section.items.map((item, j) => (
                  <FAQAccordion key={j} question={item.q} answer={item.a} />
                ))}
              </div>
            </div>
          ))}

          {/* Still have questions */}
          <div style={{
            background: '#1B6B65', borderRadius: '10px', padding: '40px',
            textAlign: 'center', color: 'white',
          }}>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '26px', fontWeight: '600', marginBottom: '12px',
            }}>
              Still have questions?
            </h2>
            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.75)', marginBottom: '28px', maxWidth: '400px', margin: '12px auto 28px' }}>
              We're a small team and we actually reply. Send us a message and we'll get back to you within one business day.
            </p>
            <a
              href="mailto:hello@hiddenatlas.com"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '13px 28px', background: '#C9A96E', color: 'white',
                borderRadius: '4px', fontSize: '14px', fontWeight: '600',
                letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none',
              }}
            >
              Email Us <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </section>

    </div>
  );
}
