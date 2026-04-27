import { useState, useEffect, useRef } from 'react';
import { Search, X, ChevronDown } from 'lucide-react';
import { itineraries as staticItineraries } from '../data/itineraries';
import ItineraryCard from '../components/ItineraryCard';
import { usePurchasedSlugs } from '../lib/usePurchasedSlugs';
import { useSEO } from '../hooks/useSEO';

// ── Designer select dropdown ──────────────────────────────────────────────────
function DesignerSelect({ creators, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef(null);
  const selected        = creators.find(c => c.slug === value) ?? null;

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  function Avatar({ creator, size = 20 }) {
    const initials = creator.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    if (creator.avatarUrl) {
      return (
        <img
          src={creator.avatarUrl}
          alt=""
          style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '1px solid #E8E3DA' }}
          onError={e => { e.currentTarget.style.display = 'none'; }}
        />
      );
    }
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: '#EFF6F5', border: '1px solid rgba(27,107,101,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size <= 20 ? '8px' : '10px', fontWeight: '700', color: '#1B6B65',
      }}>
        {initials}
      </div>
    );
  }

  return (
    <div ref={ref} className="ha-designer-select" style={{ position: 'relative' }}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '0 10px 0 10px', height: '36px', width: '100%',
          background: value ? '#EFF6F5' : 'white',
          border: `1px solid ${value ? '#A8D5D0' : '#E8E3DA'}`,
          borderRadius: '6px', cursor: 'pointer',
          fontSize: '13px', fontWeight: '500',
          color: value ? '#1B6B65' : '#4A433A',
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        {selected
          ? <Avatar creator={selected} size={20} />
          : <span style={{ width: 20, height: 20, flexShrink: 0 }} />
        }
        <span style={{ flex: 1, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.name : 'All designers'}
        </span>
        <ChevronDown
          size={13}
          style={{ flexShrink: 0, color: '#8C8070',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        />
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
          background: 'white', border: '1px solid #E8E3DA', borderRadius: '8px',
          boxShadow: '0 8px 28px rgba(28,26,22,0.10)', zIndex: 200,
          overflow: 'hidden', minWidth: '200px',
        }}>
          {/* All designers */}
          <button
            onClick={() => { onChange(''); setOpen(false); }}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
              padding: '10px 14px',
              background: !value ? '#EFF6F5' : 'white',
              border: 'none', borderBottom: '1px solid #F4F1EC',
              cursor: 'pointer', textAlign: 'left',
              fontSize: '13px', fontWeight: !value ? '600' : '400',
              color: !value ? '#1B6B65' : '#4A433A',
            }}
            onMouseEnter={e => { if (value) e.currentTarget.style.background = '#F9F7F4'; }}
            onMouseLeave={e => { if (value) e.currentTarget.style.background = 'white'; }}
          >
            <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#F4F1EC',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: '11px', color: '#8C8070' }}>✦</span>
            </div>
            All designers
          </button>

          {/* Individual creators */}
          {creators.map((c, i) => (
            <button
              key={c.slug}
              onClick={() => { onChange(c.slug); setOpen(false); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 14px',
                background: value === c.slug ? '#EFF6F5' : 'white',
                border: 'none',
                borderBottom: i < creators.length - 1 ? '1px solid #F4F1EC' : 'none',
                cursor: 'pointer', textAlign: 'left',
                fontSize: '13px', fontWeight: value === c.slug ? '600' : '400',
                color: value === c.slug ? '#1B6B65' : '#1C1A16',
              }}
              onMouseEnter={e => { if (value !== c.slug) e.currentTarget.style.background = '#F9F7F4'; }}
              onMouseLeave={e => { if (value !== c.slug) e.currentTarget.style.background = value === c.slug ? '#EFF6F5' : 'white'; }}
            >
              <Avatar creator={c} size={24} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ItinerariesPage() {
  const [searchQuery,    setSearchQuery]    = useState('');
  const [creatorFilter,  setCreatorFilter]  = useState('');   // creator slug or ''
  const [creators,       setCreators]       = useState([]);   // for filter dropdown
  const [creatorMap,     setCreatorMap]     = useState({});   // { slug: { name, slug, avatarUrl } }
  const purchasedSlugs = usePurchasedSlugs();

  // DB hero images override the static coverImage so CMS changes are reflected immediately.
  const [heroOverrides, setHeroOverrides] = useState({});
  useEffect(() => {
    fetch('/api/itineraries?action=hero-images')
      .then(r => r.ok ? r.json() : { heroes: {} })
      .then(data => setHeroOverrides(data.heroes || {}))
      .catch(() => {});
  }, []);

  // Fetch creator-to-itinerary map for card bylines
  useEffect(() => {
    fetch('/api/itineraries?action=creator-map')
      .then(r => r.ok ? r.json() : { creators: {} })
      .then(data => setCreatorMap(data.creators || {}))
      .catch(() => {});
  }, []);

  // Fetch creator list for filter dropdown
  useEffect(() => {
    fetch('/api/creators?action=list')
      .then(r => r.ok ? r.json() : { creators: [] })
      .then(data => setCreators((data.creators || []).filter(c => c.isActive && c.itinerary_count > 0)))
      .catch(() => {});
  }, []);

  const itineraries = staticItineraries
    .filter(it => it.status !== 'draft')
    .map(it => {
      const heroUrl = heroOverrides[it.id];
      const creator = creatorMap[it.id] || null;
      return { ...it, ...(heroUrl ? { coverImage: heroUrl } : {}), ...(creator ? { creator } : {}) };
    });

  useSEO({
    title: 'Travel Itineraries — Free & Premium Journeys',
    description: 'Browse travel itineraries for Bali, Japan, Morocco, Italy, Albania and more. Designed by people who\'ve actually been there — free and premium guides.',
    canonical: 'https://hiddenatlas.travel/itineraries',
  });

  const matchesSearch = (it) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return it.title.toLowerCase().includes(q) || it.country.toLowerCase().includes(q);
  };

  const matchesCreator = (it) => {
    if (!creatorFilter) return true;
    return it.creator?.slug === creatorFilter;
  };

  const freeJourneys    = itineraries.filter(it => !it.isPremium && !it.parentId && matchesSearch(it) && matchesCreator(it));
  const premiumJourneys = itineraries.filter(it => it.isPremium  && !it.parentId && matchesSearch(it) && matchesCreator(it));

  const activeCreator = creators.find(c => c.slug === creatorFilter);

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero + search — combined so the input feels anchored to the heading */}
      <section style={{
        background: 'linear-gradient(180deg, #091E1B 0%, #0F3D36 45%, #1B6B65 100%)',
        padding: 'clamp(48px, 8vw, 100px) 24px clamp(48px, 7vw, 88px)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
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
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.7', maxWidth: '520px', margin: '0 auto 40px' }}>
            Every route is researched on the ground by someone who has actually been there. Browse free and premium plans for your next extraordinary trip.
          </p>

          {/* Search input — sits directly below the heading copy */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={18}
                style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', color: '#9C9488', pointerEvents: 'none' }}
              />
              <input
                type="text"
                className="ha-search-input"
                placeholder="Where would you like to go?"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  height: '54px',
                  padding: '0 20px 0 52px',
                  border: '1px solid #E8E5DF',
                  borderRadius: '14px',
                  fontSize: '16px',
                  color: '#1C1A16',
                  background: 'white',
                  outline: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                  display: 'block',
                }}
              />
            </div>
          </div>

          {/* Popular searches */}
          <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.42)', letterSpacing: '0.3px' }}>
              Popular:
            </span>
            {['Japan', 'Bali', 'Italy', 'Morocco'].map((term, i, arr) => (
              <span key={term} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => setSearchQuery(term)}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: '0',
                    cursor: 'pointer',
                    fontSize: '12px',
                    color: 'rgba(255,255,255,0.62)',
                    letterSpacing: '0.3px',
                    transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.95)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.62)'}
                >
                  {term}
                </button>
                {i < arr.length - 1 && (
                  <span style={{ color: 'rgba(255,255,255,0.22)', fontSize: '11px' }}>•</span>
                )}
              </span>
            ))}
          </div>

          <p style={{ marginTop: '12px', fontSize: '12px', color: 'rgba(255,255,255,0.28)', letterSpacing: '0.2px' }}>
            {freeJourneys.length + premiumJourneys.length} curated journeys
          </p>
        </div>

        <style>{`
          .ha-search-input { width: 520px; }
          @media (max-width: 600px) { .ha-search-input { width: calc(100vw - 64px); } }
          .ha-designer-select { width: 220px; }
          @media (max-width: 600px) { .ha-designer-select { flex: 1; } }
        `}</style>
      </section>

      {/* Designer filter bar — scalable dropdown, works at any creator count */}
      {creators.length > 0 && (
        <div style={{ background: 'white', borderBottom: '1px solid #E8E3DA' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px',
            display: 'flex', alignItems: 'center', gap: '10px', minHeight: '52px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', color: '#8C8070',
              textTransform: 'uppercase', letterSpacing: '0.8px', flexShrink: 0 }}>
              Travel designer
            </span>
            <DesignerSelect
              creators={creators}
              value={creatorFilter}
              onChange={setCreatorFilter}
            />
          </div>
        </div>
      )}

      {activeCreator && (
        <div style={{ background: '#EFF6F5', borderBottom: '1px solid #A8D5D0' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '12px 24px',
            display: 'flex', alignItems: 'center', gap: '10px' }}>
            {activeCreator.avatarUrl && (
              <img src={activeCreator.avatarUrl} alt={activeCreator.name}
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            )}
            <span style={{ fontSize: '13px', color: '#1B6B65' }}>
              Showing itineraries by <strong>{activeCreator.name}</strong>
            </span>
            <a href={`/${activeCreator.slug}`} style={{ marginLeft: 'auto', fontSize: '12px',
              color: '#1B6B65', textDecoration: 'none', fontWeight: '500' }}>
              View profile →
            </a>
          </div>
        </div>
      )}

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
                Complete day-by-day itineraries, researched and written by our team. Free to download, no account required.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '28px' }}>
              {freeJourneys.map(it => (
                <ItineraryCard key={it.id} itinerary={it} variant="featured" isPurchased={false} />
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
                Deep-dive itineraries for complex, multi-week journeys. Full logistics, hotel lists, booking notes, and insider access. One purchase, yours forever.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '28px' }}>
              {premiumJourneys.map(it => (
                <ItineraryCard key={it.id} itinerary={it} variant="featured" isPurchased={purchasedSlugs.has(it.id)} />
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
          <p style={{ fontSize: '16px', color: '#6B6156', lineHeight: '1.7', marginBottom: '8px' }}>
            Want something tailored? Work directly with the designer behind each journey.
          </p>
          <p style={{ fontSize: '14px', color: '#8C8070', lineHeight: '1.7', marginBottom: '32px' }}>
            Tell us where you want to go and we'll build it from scratch.
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
