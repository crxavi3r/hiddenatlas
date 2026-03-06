import { useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { itineraries } from '../data/itineraries';
import ItineraryCard from '../components/ItineraryCard';

const categories = ['All', 'Culture & Coast', 'Culture & Tradition', 'Food & Wine', 'Adventure & Culture', 'History & Nature', 'Culture & Nature'];
const durations = ['All', '7–9 days', '10–12 days'];

export default function ItinerariesPage() {
  const [activeCategory, setActiveCategory] = useState('All');
  const [activeDuration, setActiveDuration] = useState('All');
  const [showPremium, setShowPremium] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = itineraries.filter(it => {
    if (activeCategory !== 'All' && it.category !== activeCategory) return false;
    if (showPremium === 'free' && it.isPremium) return false;
    if (showPremium === 'premium' && !it.isPremium) return false;
    if (searchQuery && !it.title.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !it.country.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

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

      {/* Filters */}
      <section style={{ background: 'white', borderBottom: '1px solid #E8E3DA', position: 'sticky', top: '72px', zIndex: 10 }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '20px 24px' }}>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* Search */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <Search size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#8C8070' }} />
              <input
                type="text"
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

            <div style={{ width: '1px', height: '28px', background: '#E8E3DA', flexShrink: 0 }} />

            {/* Premium filter */}
            {['all', 'free', 'premium'].map(f => (
              <button
                key={f}
                onClick={() => setShowPremium(f)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontSize: '13px',
                  fontWeight: '500',
                  border: '1px solid',
                  borderColor: showPremium === f ? '#1B6B65' : '#E8E3DA',
                  background: showPremium === f ? '#EFF6F5' : 'transparent',
                  color: showPremium === f ? '#1B6B65' : '#6B6156',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  textTransform: 'capitalize',
                }}
              >
                {f === 'all' ? 'All Plans' : f === 'free' ? 'Free' : 'Premium'}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section style={{ padding: 'clamp(40px, 5vw, 80px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ fontSize: '14px', color: '#8C8070' }}>
              {filtered.length} {filtered.length === 1 ? 'itinerary' : 'itineraries'} found
            </p>
          </div>

          {filtered.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '28px' }}>
              {filtered.map(it => (
                <ItineraryCard key={it.id} itinerary={it} variant="featured" />
              ))}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '80px 24px' }}>
              <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', color: '#4A433A', marginBottom: '12px' }}>
                No itineraries found
              </p>
              <p style={{ fontSize: '15px', color: '#8C8070' }}>Try adjusting your filters or search query.</p>
            </div>
          )}
        </div>
      </section>

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
