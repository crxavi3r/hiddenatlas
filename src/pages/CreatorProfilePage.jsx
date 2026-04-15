import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, Clock, Users } from 'lucide-react';
import { useSEO } from '../hooks/useSEO';
import { usePurchasedSlugs } from '../lib/usePurchasedSlugs';
import ItineraryCard from '../components/ItineraryCard';

export default function CreatorProfilePage() {
  const { creatorSlug } = useParams();
  const [creator, setCreator]         = useState(null);
  const [itineraries, setItineraries] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [notFound, setNotFound]       = useState(false);
  const purchasedSlugs                = usePurchasedSlugs();

  useEffect(() => {
    if (!creatorSlug) return;
    setLoading(true); setNotFound(false);
    fetch(`/api/creators?action=get&slug=${encodeURIComponent(creatorSlug)}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setNotFound(true); return; }
        setCreator(data.creator);
        setItineraries(data.itineraries || []);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [creatorSlug]);

  useSEO({
    title: creator ? `${creator.name} — HiddenAtlas Travel Designer` : null,
    description: creator?.bio || null,
  });

  if (loading) {
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '60vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%',
          border: '3px solid #E8E3DA', borderTopColor: '#1B6B65',
          animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  if (notFound || !creator) {
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '60vh',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px',
          color: '#1C1A16', marginBottom: '16px' }}>Page not found</p>
        <Link to="/itineraries" style={{ color: '#1B6B65', fontWeight: '600', textDecoration: 'none' }}>
          Browse all itineraries
        </Link>
      </div>
    );
  }

  const freeItineraries    = itineraries.filter(it => it.type === 'free' || it.accessType === 'free');
  const premiumItineraries = itineraries.filter(it => it.type === 'premium' || (it.type !== 'free' && it.accessType === 'paid'));

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* ── Hero ── */}
      <section style={{
        background: 'linear-gradient(180deg, #091E1B 0%, #0F3D36 45%, #1B6B65 100%)',
        padding: 'clamp(48px, 8vw, 80px) 24px clamp(40px, 6vw, 60px)',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          {creator.avatarUrl ? (
            <img
              src={creator.avatarUrl}
              alt={creator.name}
              style={{
                width: '88px', height: '88px', borderRadius: '50%',
                objectFit: 'cover', border: '3px solid rgba(201,169,110,0.5)',
                marginBottom: '20px',
              }}
            />
          ) : (
            <div style={{
              width: '88px', height: '88px', borderRadius: '50%',
              background: 'rgba(27,107,101,0.4)', border: '3px solid rgba(201,169,110,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 20px', fontSize: '32px', color: 'rgba(255,255,255,0.7)',
              fontFamily: "'Playfair Display', Georgia, serif", fontWeight: '600',
            }}>
              {creator.name[0]}
            </div>
          )}

          <span style={{
            display: 'inline-block', fontSize: '11px', fontWeight: '600',
            letterSpacing: '2px', textTransform: 'uppercase',
            color: '#C9A96E', marginBottom: '12px',
          }}>
            Travel Designer
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: '600', color: 'white',
            lineHeight: '1.15', letterSpacing: '-0.5px',
            marginBottom: '16px',
          }}>
            {creator.name}
          </h1>
          {creator.bio && (
            <p style={{
              fontSize: '17px', color: 'rgba(255,255,255,0.72)',
              lineHeight: '1.7', maxWidth: '560px', margin: '0 auto',
            }}>
              {creator.bio}
            </p>
          )}
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', marginTop: '16px' }}>
            {itineraries.length} {itineraries.length === 1 ? 'itinerary' : 'itineraries'}
          </p>
        </div>
      </section>

      {/* ── Itineraries ── */}
      <section style={{ maxWidth: '1280px', margin: '0 auto', padding: 'clamp(48px, 7vw, 80px) 24px' }}>

        {itineraries.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px' }}>
            <p style={{ fontSize: '16px', color: '#B5AA99' }}>No published itineraries yet.</p>
            <Link to="/itineraries" style={{ color: '#1B6B65', fontWeight: '600', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '12px', fontSize: '14px' }}>
              Browse all itineraries <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <>
            {premiumItineraries.length > 0 && (
              <div style={{ marginBottom: freeItineraries.length > 0 ? '56px' : 0 }}>
                <SectionHeader label="Premium" count={premiumItineraries.length} />
                <ItineraryGrid itineraries={premiumItineraries} purchasedSlugs={purchasedSlugs} creator={creator} />
              </div>
            )}
            {freeItineraries.length > 0 && (
              <div>
                <SectionHeader label="Free" count={freeItineraries.length} />
                <ItineraryGrid itineraries={freeItineraries} purchasedSlugs={purchasedSlugs} creator={creator} />
              </div>
            )}
          </>
        )}
      </section>

    </div>
  );
}

function SectionHeader({ label, count }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '28px' }}>
      <h2 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '26px', fontWeight: '600', color: '#1C1A16',
      }}>{label} Itineraries</h2>
      <span style={{ fontSize: '13px', color: '#B5AA99' }}>{count}</span>
    </div>
  );
}

function ItineraryGrid({ itineraries, purchasedSlugs, creator }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '24px',
    }}>
      {itineraries.map(it => {
        const cardIt = {
          id:          it.slug,
          title:       it.title,
          subtitle:    it.subtitle || '',
          country:     it.country || it.destination || '',
          duration:    it.durationDays ? `${it.durationDays} days` : '',
          price:       it.price || 0,
          isPremium:   it.type === 'premium' || (it.type !== 'free' && it.accessType === 'paid'),
          coverImage:  it.coverImage,
          creator,
        };
        return (
          <ItineraryCard
            key={it.id}
            itinerary={cardIt}
            variant="featured"
            isPurchased={purchasedSlugs.has(it.slug)}
          />
        );
      })}
    </div>
  );
}
