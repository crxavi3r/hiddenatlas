import { useState } from 'react';
import { Search } from 'lucide-react';
import { itineraries } from '../data/itineraries';
import ItineraryCard from '../components/ItineraryCard';

export default function ItinerariesPage() {
  const [searchQuery, setSearchQuery] = useState('');

  const matchesSearch = (it) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return it.title.toLowerCase().includes(q) || it.country.toLowerCase().includes(q);
  };

  const freeJourneys = itineraries.filter(it => !it.isPremium && matchesSearch(it));
  const premiumJourneys = itineraries.filter(it => it.isPremium && matchesSearch(it));

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(to bottom, #0E3D39, #1B6B65)',
        padding: 'clamp(48px, 8vw, 100px) 24px 0',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', paddingBottom: '64px' }}>
          <span style={{
            fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
            color: '#C9A96E', display: 'block', marginBottom: '16px',
          }}>
            Our Collection
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(36px, 5vw, 60px)',
            fontWeight: '600', color: 'white',
            lineHeight: '1.15', letterSpacing: '-0.5px',
            marginBottom: '20px',
          }}>
            Itineraries worth the journey.
          </h1>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.7', maxWidth: '520px', margin: '0 auto' }}>
            Every route is researched on the ground by someone who has actually been there. Browse free and premium plans for your next extraordinary trip.
          </p>
        </div>
      </section>

      {/* Search bar */}
      <section style={{ background: 'white', borderBottom: '1px solid #E8E3DA', position: 'sticky', top: '72px', zIndex: 10 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8C8070' }} />
              <input
                type="text"
                className="resp-search-input"
                placeholder="Search destinations..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  padding: '9px 12px 9px 36px',
                  border: '1px solid #E8E3DA',
                  borderRadius: '4px',
                  fontSize: '14px',
                  color: '#1C1A16',
                  background: '#FAFAF8',
                  outline: 'none',
                  width: '220px',
                }}
              />
            </div>
            <span style={{ fontSize: '13px', color: '#8C8070' }}>
              {freeJourneys.length + premiumJourneys.length} journeys
            </span>
          </div>
        </div>
      </section>

      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: 'clamp(40px, 5vw, 80px) 24px' }}>

        {/* Free Journeys */}
        {freeJourneys.length > 0 && (
          <section style={{ marginBottom: '80px' }}>
            <div style={{ marginBottom: '36px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 'clamp(26px, 3vw, 36px)',
                  fontWeight: '600',
                  color: '#1C1A16',
                }}>
                  Free Journeys
                </h2>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  background: '#EFF6F5',
                  color: '#1B6B65',
                  fontSize: '12px',
                  fontWeight: '600',
                  letterSpacing: '0.3px',
                }}>
                  {freeJourneys.length} routes
                </span>
              </div>
              <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.6', maxWidth: '560px' }}>
                Complete day-by-day itineraries — researched, written, and free to download. No account required.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '28px' }}>
              {freeJourneys.map(it => (
                <ItineraryCard key={it.id} itinerary={it} variant="featured" />
              ))}
            </div>
          </section>
        )}

        {/* Divider */}
        {freeJourneys.length > 0 && premiumJourneys.length > 0 && (
          <div style={{ borderTop: '1px solid #E8E3DA', marginBottom: '80px' }} />
        )}

        {/* Premium Journeys */}
        {premiumJourneys.length > 0 && (
          <section style={{ marginBottom: '80px' }}>
            <div style={{ marginBottom: '36px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 'clamp(26px, 3vw, 36px)',
                  fontWeight: '600',
                  color: '#1C1A16',
                }}>
                  Premium Journeys
                </h2>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  background: 'rgba(201,169,110,0.12)',
                  color: '#A0722A',
                  fontSize: '12px',
                  fontWeight: '600',
                  letterSpacing: '0.3px',
                }}>
                  €29 each
                </span>
              </div>
              <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.6', maxWidth: '560px' }}>
                Deep-dive itineraries for complex, multi-week journeys. Full logistics, hotel lists, booking notes, and insider access — one purchase, yours forever.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '28px' }}>
              {premiumJourneys.map(it => (
                <ItineraryCard key={it.id} itinerary={it} variant="featured" />
              ))}
            </div>
          </section>
        )}

        {/* No results */}
        {freeJourneys.length === 0 && premiumJourneys.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 24px' }}>
            <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', color: '#4A433A', marginBottom: '12px' }}>
              No journeys found
            </p>
            <p style={{ fontSize: '15px', color: '#8C8070' }}>Try a different search.</p>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      <section style={{ background: '#F4F1EC', padding: 'clamp(48px, 6vw, 80px) 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(24px, 3vw, 36px)',
            fontWeight: '600', color: '#1C1A16', marginBottom: '16px',
          }}>
            Don't see your dream destination?
          </h2>
          <p style={{ fontSize: '16px', color: '#6B6156', lineHeight: '1.7', marginBottom: '32px' }}>
            Our custom planning service can take you anywhere. Tell us where you want to go and we'll build it from scratch.
          </p>
          <a
            href="/custom"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '14px 32px',
              background: '#1B6B65', color: 'white',
              borderRadius: '4px', fontSize: '14px', fontWeight: '600',
              letterSpacing: '0.5px', textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Request Custom Itinerary
          </a>
        </div>
      </section>
    </div>
  );
}
