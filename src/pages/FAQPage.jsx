import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

const faqs = [
  {
    category: 'About Our Itineraries',
    items: [
      {
        q: 'Are the itineraries based on real travel experience?',
        a: 'Yes. Many routes in our library are based on firsthand travel by our team or trusted local contributors. We prioritise destinations we know well and continuously update itineraries when conditions change or new experiences emerge.',
      },
      {
        q: 'How detailed are the premium itineraries?',
        a: 'Our premium itineraries provide a clear, day-by-day travel framework designed to help you experience a destination in the right order and pace.\n\nEach guide highlights key places to visit, cultural context, and practical travel tips so you can confidently plan your trip without spending dozens of hours researching.',
      },
      {
        q: 'Are your itineraries suitable for first-time visitors?',
        a: 'Absolutely. Our guides are designed to help travellers understand a destination quickly — where to start, how to structure each day, and what experiences are truly worth prioritising.',
      },
      {
        q: 'How do I receive my itinerary after purchase?',
        a: 'Immediately after payment you\'ll receive a download link by email. Your itinerary is delivered as a beautifully designed PDF that you can view on your phone or print for travel.',
      },
      {
        q: 'Why buy an itinerary instead of planning the trip myself?',
        a: 'Our itineraries compress dozens of hours of travel research into a clear, structured travel plan. Instead of spending weeks comparing routes, you start with a thoughtful framework designed by experienced travellers.',
      },
    ],
  },
  {
    category: 'Custom Trip Planning',
    items: [
      {
        q: 'What does the custom planning process look like?',
        a: 'You start by filling out a short travel brief on our website outlining your destination, travel dates, group size, interests, and budget range.\n\nWithin 24–48 hours your dedicated planner will reach out to refine the details. Over the following days we design a fully personalised itinerary, incorporating your feedback during revision rounds.\n\nFinal delivery is a comprehensive travel plan in PDF format.',
      },
      {
        q: 'Can you plan trips that aren\'t in your existing itinerary library?',
        a: 'Yes. Our itinerary library represents curated routes we\'ve formalised, but our planners research and design trips across a wide range of destinations worldwide.\n\nIf you have a specific place in mind, the custom planning service is the best way to design it properly.',
      },
      {
        q: 'Do you book hotels, flights or activities for us?',
        a: 'No. HiddenAtlas designs travel itineraries and provides detailed booking guidance, but we do not make reservations on behalf of travellers.\n\nAll hotels, transport, restaurants and experiences are booked directly by you. HiddenAtlas is a travel planning platform, not a travel agency.',
      },
      {
        q: 'What if we want to change the itinerary?',
        a: 'Revision rounds are included in every custom planning package. We refine the itinerary with you until it fits your travel style, pace and priorities.',
      },
    ],
  },
  {
    category: 'Pricing & Payments',
    items: [
      {
        q: 'Is the itinerary purchase refundable?',
        a: 'Digital itinerary downloads are non-refundable once accessed.',
      },
      {
        q: 'Does the custom planning fee include travel costs?',
        a: 'No. The planning fee covers the design and research of your itinerary. Flights, accommodation, meals, experiences and transport are paid separately by you when you make your bookings.',
      },
      {
        q: 'Do you offer pricing for larger groups or special trips?',
        a: 'Yes. For large group travel, corporate retreats, or complex multi-destination trips we can provide a custom quote.',
      },
    ],
  },
  {
    category: 'Travel Style & Audience',
    items: [
      {
        q: 'Who is HiddenAtlas designed for?',
        a: 'HiddenAtlas is designed for travellers who prefer well-planned journeys over rushed sightseeing. Our approach prioritises meaningful places, memorable food, and smart travel pacing.',
      },
      {
        q: 'Are your itineraries suitable for families?',
        a: 'Many of our itineraries work well for families. For trips that require careful planning around children\'s ages, interests or logistics, our custom planning service is usually the best option.',
      },
      {
        q: 'Do you include adventure or outdoor experiences?',
        a: 'Yes. While our focus is thoughtful travel rather than extreme expeditions, many itineraries include hiking, sailing, nature exploration and cultural immersion.',
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
