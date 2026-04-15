import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, Star, Check, MapPin, Lock, BookOpen, Compass, User } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { itineraries, journeyImg } from '../data/itineraries';
import { usePurchasedSlugs } from '../lib/usePurchasedSlugs';
import { useSEO } from '../hooks/useSEO';

const ADMIN_EMAILS = [
  'cristiano.xavier@outlook.com',
  'cristiano.xavier@hiddenatlas.travel',
];

/* ─── Scroll animation hook ─── */
function useInView(threshold = 0.1) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); obs.disconnect(); }
    }, { threshold });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [threshold]);
  return [ref, inView];
}

function Reveal({ children, delay = 0, style = {} }) {
  const [ref, inView] = useInView();
  return (
    <div ref={ref} style={{
      opacity: inView ? 1 : 0,
      transform: inView ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.75s ease ${delay}s, transform 0.75s ease ${delay}s`,
      ...style,
    }}>
      {children}
    </div>
  );
}

/* ─── Shared style tokens ─── */
const T = {
  label: {
    display: 'block',
    fontSize: '10.5px', fontWeight: '700', letterSpacing: '2.5px',
    textTransform: 'uppercase', color: '#1B6B65', marginBottom: '14px',
  },
  h2: {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: 'clamp(28px, 3.8vw, 48px)',
    fontWeight: '600', color: '#1C1A16',
    lineHeight: '1.18', letterSpacing: '-0.5px',
  },
  body: {
    fontSize: '16px', color: '#6B6156', lineHeight: '1.8',
  },
};

// Destinations derived from itineraries — see itineraries.js

/* ─── Derived from itineraries data ─── */
const freeJourneys = itineraries.filter(it => !it.isPremium && !it.parentId);
const premiumJourneys = itineraries.filter(it => it.isPremium && !it.parentId);

/* ─── Philippines itinerary preview ─── */
const philippinesTimeline = [
  { days: 'Day 1',     title: 'Arrival in Manila',                  detail: 'Transfer to boutique hotel in Intramuros. Dinner in the old walled city.' },
  { days: 'Day 2–4',   title: 'El Nido: private island hopping',   detail: 'Small-boat charters to hidden lagoons. No groups larger than six.' },
  { days: 'Day 5–7',   title: 'Coron: lagoons and hidden beaches',  detail: 'Kayangan Lake, Twin Lagoon, and the WWII Japanese shipwrecks.' },
  { days: 'Day 8–12',  title: 'Boracay: luxury beach escape',       detail: 'A private beachfront villa on the quiet northern end of the island.' },
  { days: 'Day 13',    title: 'Return to Manila',                    detail: 'Final night dinner at a rooftop restaurant above Makati.' },
  { days: 'Day 14',    title: 'Departure',                           detail: 'Private transfer to Ninoy Aquino International Airport.' },
];

/* ════════════════════════════════════════
   MAIN COMPONENT
════════════════════════════════════════ */
export default function HomePage() {
  const [heroLoaded,  setHeroLoaded]  = useState(false);
  const [creators,    setCreators]    = useState([]);
  const [creatorMap,  setCreatorMap]  = useState({});
  const purchasedSlugs = usePurchasedSlugs();
  const { user } = useUser();
  const isAdmin = ADMIN_EMAILS.includes(user?.primaryEmailAddress?.emailAddress);
  const isPhilippinesPurchased = isAdmin || purchasedSlugs.has('philippines-island-journey');

  useEffect(() => {
    Promise.all([
      fetch('/api/creators?action=list').then(r => r.json()).catch(() => ({ creators: [] })),
      fetch('/api/itineraries?action=creator-map').then(r => r.json()).catch(() => ({ creators: {} })),
    ]).then(([crData, mapData]) => {
      setCreators((crData.creators || []).filter(c => c.isActive && (c.itinerary_count > 0 || c.total_itinerary_count > 0)));
      setCreatorMap(mapData.creators || {});
    });
  }, []);

  useSEO({
    title: 'Curated Luxury Travel Itineraries',
    description: 'Expert-crafted travel itineraries for discerning travelers. Boutique stays, hidden routes, real local knowledge. No tourist traps, no guesswork.',
    canonical: 'https://hiddenatlas.travel/',
    ogImage: 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1200&q=80',
    schemas: [
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'HiddenAtlas',
        url: 'https://hiddenatlas.travel',
        logo: 'https://hiddenatlas.travel/assets/logo-hiddenatlas.svg',
        description: 'Expert-crafted travel itineraries for discerning travelers. Boutique stays, hidden routes, real local knowledge.',
        contactPoint: {
          '@type': 'ContactPoint',
          email: 'contact@hiddenatlas.travel',
          contactType: 'customer support',
        },
        sameAs: ['https://www.instagram.com/hiddenatlas.travel'],
      },
    ],
  });

  useEffect(() => {
    const t = setTimeout(() => setHeroLoaded(true), 120);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ background: '#FAFAF8' }}>

      {/* ══════════════════════════════
          HERO
      ══════════════════════════════ */}
      <section style={{ position: 'relative', height: '100vh', minHeight: '640px', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, #0D3834 0%, #1B6B65 45%, #2C5C57 100%)',
        }} />
        <img
          src="https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1800&q=80"
          alt="Scenic travel"
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 40%', opacity: 0.38,
          }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(13,56,52,0.25) 0%, rgba(13,56,52,0.48) 55%, rgba(13,56,52,0.85) 100%)',
        }} />

        <div style={{
          position: 'relative', zIndex: 2,
          maxWidth: '1280px', margin: '0 auto', padding: '0 24px',
          height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center',
          paddingTop: '80px',
        }}>
          <div style={{
            opacity: heroLoaded ? 1 : 0,
            transform: heroLoaded ? 'translateY(0)' : 'translateY(28px)',
            transition: 'opacity 0.9s ease 0.2s, transform 0.9s ease 0.2s',
            maxWidth: '760px',
          }}>
            <div style={{
              display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '28px',
              opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.8s ease 0.1s',
            }}>
              {['Families', 'Couples', 'Friend Groups'].map(label => (
                <span key={label} style={{
                  padding: '5px 13px', border: '1px solid rgba(201,169,110,0.45)',
                  borderRadius: '20px', fontSize: '11px', fontWeight: '600',
                  letterSpacing: '0.5px', color: '#C9A96E', background: 'rgba(201,169,110,0.08)',
                }}>
                  {label}
                </span>
              ))}
            </div>

            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 'clamp(40px, 5.5vw, 76px)',
              fontWeight: '600', color: 'white',
              lineHeight: '1.1', letterSpacing: '-1px', marginBottom: '22px',
            }}>
              Curated journeys<br />
              <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.82)' }}>designed to be followed.</em>
            </h1>

            <p style={{
              fontSize: 'clamp(16px, 1.8vw, 18px)', color: 'rgba(255,255,255,0.72)',
              lineHeight: '1.75', maxWidth: '540px', marginBottom: '36px',
            }}>
              Premium travel itineraries crafted by expert creators. Each journey is built from a real trip,
              structured day by day, so you can simply follow it.
            </p>

            <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
              <Link
                to="/itineraries"
                style={{
                  padding: '15px 30px', background: '#C9A96E', color: 'white',
                  borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                  letterSpacing: '0.8px', textTransform: 'uppercase',
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#B08D4E'}
                onMouseLeave={e => e.currentTarget.style.background = '#C9A96E'}
              >
                Browse Itineraries <ArrowRight size={15} />
              </Link>
              <a
                href="#creators"
                style={{
                  padding: '15px 30px', background: 'rgba(255,255,255,0.1)',
                  color: 'white', border: '1px solid rgba(255,255,255,0.35)',
                  borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                  letterSpacing: '0.8px', textTransform: 'uppercase',
                  textDecoration: 'none', backdropFilter: 'blur(8px)',
                  transition: 'background 0.2s, border-color 0.2s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.18)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.65)';
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.35)';
                }}
              >
                Meet the Travel Designers
              </a>
            </div>

            <div style={{
              marginTop: '44px', display: 'flex', alignItems: 'center', gap: '20px',
              opacity: heroLoaded ? 1 : 0, transition: 'opacity 0.9s ease 0.7s',
            }}>
              <div style={{ display: 'flex' }}>
                {[
                  { src: '/avatars/marta.svg',  fallback: 'https://i.pravatar.cc/100?img=47' },
                  { src: '/avatars/daniel.svg', fallback: 'https://i.pravatar.cc/100?img=12' },
                  { src: '/avatars/sofia.svg',  fallback: 'https://i.pravatar.cc/100?img=55' },
                ].map((av, i) => (
                  <img
                    key={i}
                    src={av.src}
                    alt="Traveler"
                    onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = av.fallback; }}
                    style={{
                      width: '34px', height: '34px', borderRadius: '50%',
                      border: '2px solid rgba(255,255,255,0.35)',
                      objectFit: 'cover', marginLeft: i > 0 ? '-9px' : '0',
                    }}
                  />
                ))}
              </div>
              <div>
                <div style={{ display: 'flex', gap: '2px', marginBottom: '3px' }}>
                  {[1,2,3,4,5].map(i => <Star key={i} size={11} fill="#C9A96E" color="#C9A96E" />)}
                </div>
                <p style={{ fontSize: '12px', color: 'rgba(255,255,255,0.6)' }}>
                  Trusted by <strong style={{ color: 'rgba(255,255,255,0.9)' }}>1,200+ families, couples & groups</strong>
                </p>
              </div>
            </div>
          </div>
        </div>

        <div style={{
          position: 'absolute', bottom: '32px', left: '50%',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px',
          opacity: heroLoaded ? 0.5 : 0, transition: 'opacity 1s ease 1.3s',
          animation: 'heroScroll 2.4s ease-in-out infinite',
        }}>
          <style>{`
            @keyframes heroScroll {
              0%, 100% { transform: translateX(-50%) translateY(0); }
              50% { transform: translateX(-50%) translateY(8px); }
            }
          `}</style>
          <span style={{ fontSize: '9px', letterSpacing: '2.5px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.5)' }}>Scroll</span>
          <ChevronDown size={16} color="rgba(255,255,255,0.5)" />
        </div>
      </section>

      {/* ══════════════════════════════
          §2  FREE JOURNEYS
      ══════════════════════════════ */}
      <section style={{ padding: 'clamp(48px, 6vw, 96px) 24px', background: 'white' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <span style={T.label}>Free to explore</span>
                <h2 style={T.h2}>Free Journeys</h2>
                <p style={{ ...T.body, marginTop: '12px', maxWidth: '500px' }}>
                  Curated travel routes designed to inspire your next journey. Explore the day-by-day structure and follow the route.
                </p>
              </div>
              <Link to="/itineraries" style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', fontWeight: '700', letterSpacing: '1px',
                textTransform: 'uppercase', color: '#1B6B65', textDecoration: 'none',
                borderBottom: '1px solid #1B6B65', paddingBottom: '2px', whiteSpace: 'nowrap',
              }}>
                View all <ArrowRight size={13} />
              </Link>
            </div>
          </Reveal>

          {/* Featured large + 3 smaller — first 4 free journeys */}
          <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'stretch' }}>
            {/* Large featured card */}
            <Reveal delay={0} style={{ height: '100%' }}>
              <ItineraryBigCard it={freeJourneys[0]} creator={creatorMap[freeJourneys[0]?.id]} />
            </Reveal>

            {/* Stack of 3 smaller */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {freeJourneys.slice(1, 4).map((it, i) => (
                <Reveal key={it.id} delay={i * 0.08 + 0.08} style={{ flex: 1 }}>
                  <ItinerarySmallCard it={it} creator={creatorMap[it.id]} />
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          §2.5  PREMIUM JOURNEYS
      ══════════════════════════════ */}
      <section style={{ padding: 'clamp(48px, 6vw, 96px) 24px', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <span style={{ ...T.label, color: '#C9A96E' }}>Full curated travel plans</span>
                <h2 style={T.h2}>Premium Journeys</h2>
                <p style={{ ...T.body, marginTop: '12px', maxWidth: '460px' }}>
                  Complete curated journeys with deeper travel guidance and detailed day-by-day structure.
                </p>
              </div>
              <Link to="/itineraries" style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', fontWeight: '700', letterSpacing: '1px',
                textTransform: 'uppercase', color: '#1B6B65', textDecoration: 'none',
                borderBottom: '1px solid #1B6B65', paddingBottom: '2px', whiteSpace: 'nowrap',
              }}>
                View all journeys <ArrowRight size={13} />
              </Link>
            </div>
          </Reveal>

          <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px', marginBottom: '48px' }}>
            {premiumJourneys.map((it, i) => (
              <Reveal key={it.id} delay={i * 0.08}>
                <CuratedJourneyCard it={it} isPurchased={purchasedSlugs.has(it.id)} creator={creatorMap[it.id]} />
              </Reveal>
            ))}
          </div>

          <Reveal delay={0.1}>
            <div style={{
              background: 'white', borderRadius: '12px', border: '1px solid #E8E3DA',
              padding: 'clamp(28px, 4vw, 44px)',
              display: 'grid', gridTemplateColumns: '1fr auto', gap: '40px', alignItems: 'center',
            }}
              className="resp-grid-2"
            >
              <div>
                <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '12px' }}>
                  Premium journeys include
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px 32px' }}>
                  {[
                    'Complete day-by-day travel structure',
                    'Curated route logic and pacing',
                    'Destination highlights and hidden stops',
                    'Travel rhythm designed for real trips',
                  ].map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <Check size={14} color="#C9A96E" style={{ flexShrink: 0, marginTop: '3px' }} strokeWidth={2.5} />
                      <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.5' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ textAlign: 'center', flexShrink: 0 }}>
                <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '32px', fontWeight: '700', color: '#1C1A16', marginBottom: '4px' }}>€29</p>
                <p style={{ fontSize: '12px', color: '#8C8070', marginBottom: '20px' }}>One-time · Digital access</p>
                <Link
                  to="/itineraries"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '13px 24px', background: '#C9A96E', color: 'white',
                    borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                    letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none',
                    whiteSpace: 'nowrap', transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#B08D4E'}
                  onMouseLeave={e => e.currentTarget.style.background = '#C9A96E'}
                >
                  Unlock Premium Journey <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════
          §1  EXPLORE DESTINATIONS
      ══════════════════════════════ */}
      <section style={{ padding: 'clamp(64px, 8vw, 120px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

          <Reveal>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', flexWrap: 'wrap', gap: '20px' }}>
              <div>
                <span style={T.label}>Where do you want to go?</span>
                <h2 style={T.h2}>Explore destinations</h2>
              </div>
              <Link to="/itineraries" style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                fontSize: '12px', fontWeight: '700', letterSpacing: '1px',
                textTransform: 'uppercase', color: '#1B6B65', textDecoration: 'none',
                borderBottom: '1px solid #1B6B65', paddingBottom: '2px', whiteSpace: 'nowrap',
              }}>
                All destinations <ArrowRight size={13} />
              </Link>
            </div>
          </Reveal>

          {/* 3-column destination grid */}
          <div className="dest-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
            {itineraries.filter(it => !it.parentId).map((it, i) => (
              <Reveal key={it.id} delay={i * 0.06} style={{ height: '100%' }}>
                <DestinationCard it={it} creator={creatorMap[it.id]} />
              </Reveal>
            ))}
          </div>

          <style>{`
            @media (max-width: 768px) {
              .dest-grid { grid-template-columns: repeat(2, 1fr) !important; }
            }
            @media (max-width: 480px) {
              .dest-grid { grid-template-columns: 1fr !important; }
            }
          `}</style>
        </div>
      </section>

      {/* ══════════════════════════════
          §1.5  PRODUCT CONCEPT
      ══════════════════════════════ */}
      <section style={{ background: '#F4F1EC', padding: 'clamp(48px, 5vw, 72px) 24px' }}>
        <div style={{ maxWidth: '860px', margin: '0 auto', textAlign: 'center' }}>
          <Reveal>
            <span style={T.label}>How it works</span>
            <h2 style={{ ...T.h2, marginBottom: '16px' }}>Journeys designed to be followed day by day.</h2>
            <p style={{ ...T.body, maxWidth: '560px', margin: '0 auto 44px' }}>
              HiddenAtlas journeys are curated travel routes built from real trips. Each journey is designed to be followed step by step, like a travel recipe. No planning required.
            </p>
            <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', textAlign: 'left' }}>
              <div style={{ background: 'white', borderRadius: '8px', padding: '28px 30px', border: '1px solid #E8E3DA' }}>
                <span style={{ display: 'inline-block', padding: '4px 11px', background: '#EFF6F5', color: '#1B6B65', borderRadius: '3px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>
                  Free Journey
                </span>
                <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: '#1C1A16', marginBottom: '10px', lineHeight: '1.3' }}>
                  Explore the route, free
                </p>
                <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.7' }}>
                  A curated day-by-day itinerary you can explore freely. See the full route logic, the destinations, and the travel structure.
                </p>
              </div>
              <div style={{ background: '#0E3D39', borderRadius: '8px', padding: '28px 30px' }}>
                <span style={{ display: 'inline-block', padding: '4px 11px', background: '#C9A96E', color: 'white', borderRadius: '3px', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '14px' }}>
                  Premium · €29
                </span>
                <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: 'white', marginBottom: '10px', lineHeight: '1.3' }}>
                  The complete travel plan
                </p>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.7' }}>
                  A deeper journey with full day-by-day structure, curated route logic, destination highlights, and hidden stops. Designed for real trips.
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════
          §3  HOW IT WORKS
      ══════════════════════════════ */}
      <section style={{ padding: 'clamp(64px, 8vw, 120px) 24px', background: '#1C1A16' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '72px' }}>
              <span style={{ ...T.label, color: '#C9A96E' }}>Simple, start to finish</span>
              <h2 style={{ ...T.h2, color: 'white' }}>How HiddenAtlas works</h2>
            </div>
          </Reveal>

          <div className="resp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#2E2922' }}>
            {[
              {
                num: '01',
                icon: <Compass size={22} color="#C9A96E" />,
                title: 'Explore curated itineraries',
                body: 'Discover thoughtfully designed travel routes based on real journeys. Each itinerary provides a clear structure to help you explore a destination with confidence.',
              },
              {
                num: '02',
                icon: <BookOpen size={22} color="#C9A96E" />,
                title: 'Follow a proven route',
                body: 'Access day-by-day travel routes that show how a trip can flow from start to finish. Designed to help you plan your own journey more easily.',
              },
              {
                num: '03',
                icon: <MapPin size={22} color="#C9A96E" />,
                title: 'Use it to plan your trip',
                body: 'Use the itinerary as a guide to organise your own travel plans, adapt the route, and build your trip around it.',
              },
            ].map((step, i) => (
              <Reveal key={i} delay={i * 0.12} style={{ height: '100%' }}>
                <div style={{ background: '#1C1A16', padding: '48px 40px', height: '100%', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
                  {/* Decorative step number — watermark anchored to its card */}
                  <span style={{
                    position: 'absolute', top: '16px', right: '24px',
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: '72px', fontWeight: '700', color: '#2E2922',
                    lineHeight: 1, userSelect: 'none', pointerEvents: 'none',
                  }}>
                    {step.num}
                  </span>
                  <div style={{ marginBottom: '28px' }}>
                    <div style={{
                      width: '48px', height: '48px', borderRadius: '10px',
                      background: 'rgba(201,169,110,0.1)',
                      border: '1px solid rgba(201,169,110,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {step.icon}
                    </div>
                  </div>
                  <h3 style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: '21px', fontWeight: '600', color: 'white',
                    marginBottom: '14px', lineHeight: '1.3',
                  }}>
                    {step.title}
                  </h3>
                  <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.75' }}>{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          §4  SAMPLE ITINERARY PREVIEW
      ══════════════════════════════ */}
      <section style={{ padding: 'clamp(64px, 8vw, 120px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '60px' }}>
              <span style={T.label}>See what's inside</span>
              <h2 style={T.h2}>A glimpse of a premium itinerary</h2>
              <p style={{ ...T.body, maxWidth: '480px', margin: '14px auto 0' }}>
                A real, usable plan with every detail thought through.
              </p>
            </div>
          </Reveal>

          <div className="resp-grid-2" style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr',
            borderRadius: '12px', overflow: 'hidden',
            boxShadow: '0 24px 80px rgba(28,26,22,0.12)',
            border: '1px solid #E8E3DA',
          }}>

            {/* Left: cover image + intro */}
            <Reveal delay={0}>
              <div style={{ position: 'relative', background: '#0D3834', height: '100%', minHeight: '540px' }}>
                <img
                  src={journeyImg('philippines-island-journey', 900)}
                  alt="Philippines"
                  style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35, position: 'absolute', inset: 0 }}
                />
                <div style={{
                  position: 'absolute', inset: 0,
                  background: 'linear-gradient(to top, rgba(13,56,52,0.95) 0%, rgba(13,56,52,0.4) 60%)',
                }} />
                <div style={{ position: 'relative', zIndex: 2, padding: '44px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <span style={{ ...T.label, color: '#C9A96E', marginBottom: '10px' }}>Premium Itinerary</span>
                  <h3 style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: 'clamp(22px, 2.5vw, 34px)', fontWeight: '600',
                    color: 'white', lineHeight: '1.2', marginBottom: '16px',
                  }}>
                    Philippines<br />14 Day Island Journey
                  </h3>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '24px' }}>
                    {['Couples', 'Family', '14 Days', 'Beach & Culture'].map(tag => (
                      <span key={tag} style={{
                        padding: '4px 10px', borderRadius: '20px',
                        border: '1px solid rgba(255,255,255,0.2)',
                        fontSize: '11px', fontWeight: '600', color: 'rgba(255,255,255,0.75)',
                        background: 'rgba(255,255,255,0.07)',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.7' }}>
                    From the karst limestone towers of El Nido to Coron's hidden lagoons and Boracay's northern quietude. The Philippines, planned without compromise.
                  </p>
                </div>
              </div>
            </Reveal>

            {/* Right: timeline */}
            <Reveal delay={0.1}>
              <div style={{ background: 'white', padding: '44px', display: 'flex', flexDirection: 'column' }}>
                <p style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#B5AA99', marginBottom: '32px' }}>
                  Day by Day
                </p>

                <div style={{ flex: 1 }}>
                  {philippinesTimeline.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: '18px', marginBottom: i < philippinesTimeline.length - 1 ? '0' : '0' }}>
                      {/* Line */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: '20px' }}>
                        <div style={{
                          width: '10px', height: '10px', borderRadius: '50%',
                          background: i === 0 ? '#1B6B65' : '#D4CCBF',
                          border: i === 0 ? '2px solid #1B6B65' : '2px solid #D4CCBF',
                          flexShrink: 0, marginTop: '4px',
                        }} />
                        {i < philippinesTimeline.length - 1 && (
                          <div style={{ width: '1px', flex: 1, background: '#E8E3DA', minHeight: '28px' }} />
                        )}
                      </div>
                      {/* Content */}
                      <div style={{ paddingBottom: '24px', flex: 1 }}>
                        <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '4px' }}>
                          {item.days}
                        </p>
                        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '16px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>
                          {item.title}
                        </p>
                        <p style={{ fontSize: '13px', color: '#8C8070', lineHeight: '1.6' }}>{item.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* CTA — locked or unlocked depending on purchase / admin state */}
                <div style={{
                  marginTop: '8px',
                  padding: '20px 22px',
                  background: isPhilippinesPurchased ? '#EFF6F5' : '#F4F1EC',
                  borderRadius: '8px',
                  border: isPhilippinesPurchased ? '1px solid rgba(27,107,101,0.2)' : '1px solid #E8E3DA',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                }}>
                  <div>
                    {isPhilippinesPurchased && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                        <Check size={11} color="#1B6B65" strokeWidth={3} />
                        <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#1B6B65' }}>
                          Unlocked
                        </span>
                      </div>
                    )}
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', marginBottom: '2px' }}>
                      Full 14-day itinerary
                    </p>
                    <p style={{ fontSize: '12px', color: '#8C8070' }}>
                      {isPhilippinesPurchased
                        ? 'All days · PDF included'
                        : 'Hotels · logistics · restaurant picks · booking notes'}
                    </p>
                  </div>
                  {isPhilippinesPurchased ? (
                    <Link
                      to="/itineraries/philippines-island-journey"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '11px 18px', background: '#1B6B65', color: 'white',
                        borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                        letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none',
                        whiteSpace: 'nowrap', transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#155F5A'}
                      onMouseLeave={e => e.currentTarget.style.background = '#1B6B65'}
                    >
                      View Itinerary <ArrowRight size={12} />
                    </Link>
                  ) : (
                    <Link
                      to="/itineraries/philippines-island-journey"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '11px 18px', background: '#C9A96E', color: 'white',
                        borderRadius: '4px', fontSize: '12px', fontWeight: '700',
                        letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none',
                        whiteSpace: 'nowrap', transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#B08D4E'}
                      onMouseLeave={e => e.currentTarget.style.background = '#C9A96E'}
                    >
                      <Lock size={12} />
                      Unlock for €29
                    </Link>
                  )}
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          §4.5  TRAVEL DESIGNERS
      ══════════════════════════════ */}
      {creators.length > 0 && (
        <section id="creators" style={{ padding: 'clamp(56px, 7vw, 96px) 24px', background: 'white' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <Reveal>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '44px', flexWrap: 'wrap', gap: '20px' }}>
                <div>
                  <span style={T.label}>The people behind the itineraries</span>
                  <h2 style={T.h2}>Meet our travel designers</h2>
                </div>
                <Link to="/itineraries" style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  fontSize: '12px', fontWeight: '700', letterSpacing: '1px',
                  textTransform: 'uppercase', color: '#1B6B65', textDecoration: 'none',
                  borderBottom: '1px solid #1B6B65', paddingBottom: '2px', whiteSpace: 'nowrap',
                }}>
                  Browse itineraries <ArrowRight size={13} />
                </Link>
              </div>
            </Reveal>
            <div className="creators-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px' }}>
              {creators.map((c, i) => (
                <Reveal key={c.id} delay={i * 0.07}>
                  <CreatorCard creator={c} />
                </Reveal>
              ))}
            </div>
            <style>{`
              @media (max-width: 900px) { .creators-grid { grid-template-columns: repeat(2, 1fr) !important; } }
              @media (max-width: 480px) { .creators-grid { grid-template-columns: 1fr !important; } }
            `}</style>
          </div>
        </section>
      )}

      {/* ══════════════════════════════
          §5  SOCIAL PROOF
      ══════════════════════════════ */}
      <section style={{ padding: 'clamp(56px, 7vw, 100px) 24px', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>

          <Reveal>
            <div style={{ textAlign: 'center', marginBottom: '52px' }}>
              <span style={T.label}>What travelers say</span>
              <h2 style={T.h2}>Trips people still talk about.</h2>
            </div>
          </Reveal>

          <div className="resp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {[
              {
                quote: 'The best trip we ever took as a family. The itinerary was thoughtful and every place we visited felt just right. We\'ve already started planning our next one with HiddenAtlas.',
                name: 'Marta',
                location: 'Lisbon',
                trip: 'Bali Island Journey',
                avatar: '/avatars/marta.svg',
                fallbackAvatar: 'https://i.pravatar.cc/100?img=47',
                type: 'Family',
              },
              {
                quote: 'Saved us weeks of research and planning. I kept waiting for something to go wrong. Nothing did. The itinerary was better than anything we\'d have put together ourselves.',
                name: 'Daniel',
                location: 'London',
                trip: 'Japan · 18 Day Cultural Grand Journey',
                avatar: '/avatars/daniel.svg',
                fallbackAvatar: 'https://i.pravatar.cc/100?img=12',
                type: 'Couple',
              },
              {
                quote: 'Every place and experience was exactly right: understated, elegant, local. Our group of six had completely different tastes and everyone came home happy.',
                name: 'Sofia',
                location: 'Milan',
                trip: 'Puglia Road Journey',
                avatar: '/avatars/sofia.svg',
                fallbackAvatar: 'https://i.pravatar.cc/100?img=55',
                type: 'Group',
              },
            ].map((t, i) => (
              <Reveal key={i} delay={i * 0.1}>
                <TestimonialCard t={t} />
              </Reveal>
            ))}
          </div>

          {/* Trust bar */}
          <Reveal delay={0.3}>
            <div style={{
              marginTop: '56px',
              display: 'flex', justifyContent: 'center',
              gap: 'clamp(32px, 5vw, 72px)', flexWrap: 'wrap',
              paddingTop: '40px', borderTop: '1px solid #D4CCBF',
            }}>
              {[
                { number: '1,200+', label: 'Travelers planned' },
                { number: '4.9 / 5', label: 'Average rating' },
                { number: '48 hrs', label: 'Response time' },
                { number: '86', label: 'Active itineraries' },
              ].map((stat, i) => (
                <div key={i} style={{ textAlign: 'center' }}>
                  <p style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: 'clamp(26px, 3vw, 36px)', fontWeight: '600',
                    color: '#1C1A16', letterSpacing: '-0.5px',
                  }}>
                    {stat.number}
                  </p>
                  <p style={{ fontSize: '12px', color: '#8C8070', letterSpacing: '0.5px', marginTop: '4px' }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ══════════════════════════════
          §6  CUSTOM TRAVEL PLANNING
      ══════════════════════════════ */}
      <section style={{ position: 'relative', overflow: 'hidden', background: '#0D3834' }}>
        <img
          src="https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=1600&q=80"
          alt="Luxury travel planning"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18 }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(13,56,52,0.9) 0%, rgba(27,107,101,0.7) 100%)',
        }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: '1280px', margin: '0 auto', padding: 'clamp(64px, 8vw, 120px) 24px' }}>
          <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>

            <Reveal>
              <div>
                <span style={{ ...T.label, color: '#C9A96E' }}>Custom trip planning</span>
                <h2 style={{ ...T.h2, color: 'white', marginBottom: '20px' }}>
                  Prefer a journey designed<br />entirely around you?
                </h2>
                <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.8', marginBottom: '16px' }}>
                  We design deeply personalised travel itineraries shaped around exceptional places, remarkable experiences and thoughtful pacing.
                </p>
                <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.7)', lineHeight: '1.8', marginBottom: '16px' }}>
                  You receive a fully crafted plan with carefully curated recommendations. Everything is ready for you to book directly, at your own pace.
                </p>
                <p style={{ fontSize: '14px', color: 'rgba(201,169,110,0.75)', lineHeight: '1.7', marginBottom: '36px', fontStyle: 'italic' }}>
                  Independent travel planning. No commissions. Only thoughtful recommendations.
                </p>
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                  <Link
                    to="/custom"
                    style={{
                      padding: '15px 30px', background: '#C9A96E', color: 'white',
                      borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                      letterSpacing: '0.8px', textTransform: 'uppercase',
                      textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#B08D4E'}
                    onMouseLeave={e => e.currentTarget.style.background = '#C9A96E'}
                  >
                    Plan my trip <ArrowRight size={15} />
                  </Link>
                  <Link
                    to="/pricing"
                    style={{
                      padding: '15px 30px', background: 'transparent',
                      color: 'rgba(255,255,255,0.85)',
                      border: '1px solid rgba(255,255,255,0.3)',
                      borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                      letterSpacing: '0.8px', textTransform: 'uppercase', textDecoration: 'none',
                    }}
                  >
                    See pricing
                  </Link>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.15}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {[
                  { icon: '⌂', label: 'Families', text: 'Multi-generational trips that work for everyone: children, grandparents, and the adults in between.' },
                  { icon: '♥', label: 'Couples', text: 'Honeymoons, anniversaries, and milestone escapes built around privacy, romance, and the right pace.' },
                  { icon: '◉', label: 'Friend Groups', text: 'Group logistics planned from start to finish: private villas, shared experiences, and enough flexibility for everyone.' },
                  { icon: '✦', label: 'Solo Travelers', text: 'Expertly planned solo routes that feel safe, spontaneous, and entirely your own.' },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: '18px 22px',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '8px',
                    display: 'flex', gap: '16px', alignItems: 'flex-start',
                    backdropFilter: 'blur(8px)',
                  }}>
                    <span style={{ fontSize: '16px', opacity: 0.75, flexShrink: 0, marginTop: '1px', color: '#C9A96E' }}>{item.icon}</span>
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '5px' }}>
                        {item.label}
                      </p>
                      <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.6' }}>{item.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          §7.5  AI PLANNER TEASER
      ══════════════════════════════ */}
      <section style={{ background: '#1C1A16', padding: 'clamp(64px, 8vw, 120px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>
            <Reveal>
              <div>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  fontSize: '10.5px', fontWeight: '700', letterSpacing: '2.5px',
                  textTransform: 'uppercase', color: '#C9A96E', marginBottom: '14px',
                }}>
                  New · Powered by AI
                </span>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 'clamp(28px, 3.8vw, 48px)',
                  fontWeight: '600', color: 'white',
                  lineHeight: '1.18', letterSpacing: '-0.5px', marginBottom: '20px',
                }}>
                  Plan your journey,<br />
                  <em style={{ fontStyle: 'italic', color: 'rgba(255,255,255,0.65)' }}>in seconds.</em>
                </h2>
                <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.6)', lineHeight: '1.8', marginBottom: '36px', maxWidth: '440px' }}>
                  Tell us where you want to go. Our AI generates a complete, personalised itinerary built around your travel style: day plans, hotel suggestions, and local experiences.
                </p>
                <Link
                  to="/ai-planner"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '8px',
                    padding: '15px 30px', background: '#C9A96E', color: 'white',
                    borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                    letterSpacing: '0.8px', textTransform: 'uppercase', textDecoration: 'none',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#B08D4E'}
                  onMouseLeave={e => e.currentTarget.style.background = '#C9A96E'}
                >
                  Try the AI Planner <ArrowRight size={15} />
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {[
                  { step: '01', title: 'Enter your destination', desc: 'Any place in the world: city, region, or country.' },
                  { step: '02', title: 'Set your travel style', desc: 'Trip length, group type, budget, and travel preferences.' },
                  { step: '03', title: 'Get your itinerary', desc: 'A day-by-day plan with hotels, experiences, and insider notes.' },
                ].map((item, i) => (
                  <div key={i} style={{
                    padding: '20px 24px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px',
                    display: 'flex', gap: '18px', alignItems: 'flex-start',
                  }}>
                    <span style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: '22px', fontWeight: '600',
                      color: '#2E2922', lineHeight: 1, flexShrink: 0, userSelect: 'none',
                    }}>
                      {item.step}
                    </span>
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: '600', color: 'rgba(255,255,255,0.85)', marginBottom: '4px' }}>
                        {item.title}
                      </p>
                      <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.55' }}>
                        {item.desc}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════
          §8  FINAL CTA
      ══════════════════════════════ */}
      <section style={{
        padding: 'clamp(80px, 10vw, 140px) 24px',
        background: '#F4F1EC',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <Reveal>
            <span style={T.label}>Ready when you are</span>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 'clamp(30px, 4.5vw, 56px)',
              fontWeight: '600', color: '#1C1A16',
              lineHeight: '1.15', letterSpacing: '-0.5px',
              marginBottom: '20px',
            }}>
              Start planning your<br />
              <em style={{ fontStyle: 'italic', color: '#1B6B65' }}>next journey.</em>
            </h2>
            <p style={{ ...T.body, maxWidth: '460px', margin: '0 auto 40px' }}>
              Browse our curated collection or work with a planner to build something entirely your own. Either way, your next trip should be one worth talking about.
            </p>
            <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link
                to="/itineraries"
                style={{
                  padding: '16px 34px', background: '#1B6B65', color: 'white',
                  borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                  letterSpacing: '0.8px', textTransform: 'uppercase',
                  textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#145550'}
                onMouseLeave={e => e.currentTarget.style.background = '#1B6B65'}
              >
                Browse itineraries <ArrowRight size={14} />
              </Link>
              <Link
                to="/custom"
                style={{
                  padding: '16px 34px', background: 'white', color: '#1C1A16',
                  border: '1px solid #D4CCBF', borderRadius: '4px',
                  fontSize: '13px', fontWeight: '700',
                  letterSpacing: '0.8px', textTransform: 'uppercase', textDecoration: 'none',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = '#8C8070'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#D4CCBF'}
              >
                Plan my trip
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

    </div>
  );
}

/* ════════════════════════════════════════
   SUB-COMPONENTS
════════════════════════════════════════ */

function DestinationCard({ it, creator }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={`/itineraries/${it.id}`}
      style={{ textDecoration: 'none', display: 'block', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        position: 'relative',
        paddingTop: '65%',
        borderRadius: '8px',
        overflow: 'hidden',
        cursor: 'pointer',
      }}>
        <img
          src={it.coverImage || it.image || journeyImg(it.id, 900)}
          alt={it.title}
          style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover',
            transform: hovered ? 'scale(1.06)' : 'scale(1)',
            transition: 'transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
          }}
          loading="lazy"
          onError={e => { e.currentTarget.onerror = null; }}
        />
        {/* Gradient */}
        <div style={{
          position: 'absolute', inset: 0,
          background: hovered
            ? 'linear-gradient(to top, rgba(13,56,52,0.82) 0%, rgba(13,56,52,0.15) 60%)'
            : 'linear-gradient(to top, rgba(28,26,22,0.75) 0%, rgba(28,26,22,0.1) 55%)',
          transition: 'background 0.4s ease',
        }} />
        {/* Text */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '22px 20px',
          transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
          transition: 'transform 0.35s ease',
        }}>
          <p style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(18px, 2vw, 24px)', fontWeight: '600',
            color: 'white', marginBottom: '5px', letterSpacing: '-0.2px',
          }}>
            {it.title}
          </p>
          <p style={{
            fontSize: '12px', color: 'rgba(255,255,255,0.72)',
            lineHeight: '1.4', letterSpacing: '0.2px',
            opacity: hovered ? 1 : 0.75,
            transition: 'opacity 0.3s',
            marginBottom: creator ? '6px' : '0',
          }}>
            {it.tagline}
          </p>
          {creator && (
            <p style={{
              fontSize: '10.5px', color: 'rgba(201,169,110,0.85)',
              letterSpacing: '0.2px', lineHeight: '1.3',
            }}>
              by {creator.name}
            </p>
          )}
        </div>
        {/* Arrow on hover */}
        <div style={{
          position: 'absolute', top: '16px', right: '16px',
          width: '32px', height: '32px', borderRadius: '50%',
          background: 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'scale(1)' : 'scale(0.7)',
          transition: 'opacity 0.3s, transform 0.3s',
          backdropFilter: 'blur(4px)',
        }}>
          <ArrowRight size={14} color="white" />
        </div>
        {/* View itineraries label on hover */}
        <div style={{
          position: 'absolute', bottom: '14px', right: '16px',
          display: 'flex', alignItems: 'center', gap: '4px',
          fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px',
          textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'translateY(0)' : 'translateY(4px)',
          transition: 'opacity 0.3s, transform 0.3s',
        }}>
          View itinerary <ArrowRight size={10} />
        </div>
      </div>
    </Link>
  );
}

function ItineraryBigCard({ it, creator }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={`/itineraries/${it.id}`}
      style={{ textDecoration: 'none', display: 'block', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderRadius: '10px', overflow: 'hidden', background: 'white',
        boxShadow: hovered ? '0 20px 60px rgba(28,26,22,0.14)' : '0 4px 24px rgba(28,26,22,0.07)',
        transition: 'box-shadow 0.35s, transform 0.35s',
        transform: hovered ? 'translateY(-5px)' : 'none',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ position: 'relative', paddingTop: '58%', overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={it.coverImage || it.image} alt={it.title}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.6s ease',
            }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(28,26,22,0.55) 0%, transparent 55%)',
          }} />
          <div style={{ position: 'absolute', bottom: '16px', left: '18px' }}>
            <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(16px, 2vw, 22px)', fontWeight: '600', color: 'white', lineHeight: '1.25' }}>
              {it.title}
            </p>
          </div>
          <div style={{ position: 'absolute', top: '14px', left: '14px', padding: '5px 11px', background: it.price === 0 ? '#1B6B65' : '#C9A96E', borderRadius: '3px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'white' }}>
            {it.price === 0 ? 'Free Journey' : `Premium · €${it.price}`}
          </div>
          <div style={{ position: 'absolute', top: '14px', right: '14px', padding: '5px 12px', background: 'rgba(28,26,22,0.55)', borderRadius: '3px', fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: 'white', backdropFilter: 'blur(6px)' }}>
            {it.duration}
          </div>
        </div>
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.7', marginBottom: '18px', flex: 1 }}>
            {it.shortDescription}
          </p>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '20px' }}>
            {it.bestFor.map(tag => (
              <span key={tag} style={{
                padding: '3px 10px', borderRadius: '20px',
                fontSize: '11px', fontWeight: '600',
                background: '#F4F1EC', color: '#6B6156',
              }}>
                {tag}
              </span>
            ))}
          </div>
          {creator && (
            <Link
              to={`/${creator.slug}`}
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                textDecoration: 'none', marginBottom: '14px',
              }}
            >
              {creator.avatarUrl
                ? <img src={creator.avatarUrl} alt={creator.name} style={{ width: '22px', height: '22px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={12} color="#1B6B65" /></div>
              }
              <span style={{ fontSize: '12px', color: '#8C8070' }}>by <span style={{ color: '#1B6B65', fontWeight: '600' }}>{creator.name}</span></span>
            </Link>
          )}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            paddingTop: '16px', borderTop: '1px solid #F4F1EC',
          }}>
            <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '700', color: '#1C1A16' }}>
              {it.price === 0 ? 'Free' : `€${it.price}`}
            </span>
            <span style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase',
              color: hovered ? '#1B6B65' : '#B5AA99', transition: 'color 0.2s',
            }}>
              View itinerary <ArrowRight size={13} />
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

function ItinerarySmallCard({ it, creator }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={`/itineraries/${it.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderRadius: '8px', overflow: 'hidden', background: 'white',
        display: 'grid', gridTemplateColumns: '140px 1fr',
        height: '100%',
        boxShadow: hovered ? '0 12px 40px rgba(28,26,22,0.11)' : '0 2px 12px rgba(28,26,22,0.05)',
        transition: 'box-shadow 0.3s, transform 0.3s',
        transform: hovered ? 'translateX(4px)' : 'none',
      }}>
        <div style={{ position: 'relative', overflow: 'hidden', minHeight: '110px' }}>
          <img
            src={it.coverImage || it.image} alt={it.title}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
              transform: hovered ? 'scale(1.07)' : 'scale(1)',
              transition: 'transform 0.5s',
            }}
          />
        </div>
        <div style={{ padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '5px' }}>
            <span style={{ padding: '2px 8px', background: it.price === 0 ? '#EFF6F5' : 'rgba(201,169,110,0.12)', color: it.price === 0 ? '#1B6B65' : '#A0722A', borderRadius: '2px', fontSize: '9px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {it.price === 0 ? 'Free' : `Premium · €${it.price}`}
            </span>
            <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#C9A96E' }}>
              {it.duration}
            </span>
          </div>
          <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '15px', fontWeight: '600', color: '#1C1A16', lineHeight: '1.3', marginBottom: '8px' }}>
            {it.title}: {it.subtitle}
          </p>
          <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {it.bestFor.slice(0, 2).map(tag => (
              <span key={tag} style={{
                padding: '2px 8px', borderRadius: '20px',
                fontSize: '10px', fontWeight: '600',
                background: '#F4F1EC', color: '#6B6156',
              }}>
                {tag}
              </span>
            ))}
          </div>
          {creator && (
            <p style={{ fontSize: '11px', color: '#8C8070', marginBottom: '8px' }}>
              by <span style={{ color: '#1B6B65', fontWeight: '600' }}>{creator.name}</span>
            </p>
          )}
          <span style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase',
            color: hovered ? '#1B6B65' : '#B5AA99', transition: 'color 0.2s',
          }}>
            View itinerary <ArrowRight size={11} />
          </span>
        </div>
      </div>
    </Link>
  );
}

function TestimonialCard({ t }) {
  const typeColors = { 'Family': ['#A8D5D1', '#0E3D39'], 'Couple': ['#EDD8AC', '#6A512A'], 'Group': ['#D4CCBF', '#4A433A'] };
  const [bg, text] = typeColors[t.type] || ['#F4F1EC', '#4A433A'];
  return (
    <div style={{
      background: 'white', borderRadius: '10px', padding: '32px',
      border: '1px solid #E8E3DA',
      display: 'flex', flexDirection: 'column',
    }}>
      <span style={{
        display: 'inline-block', padding: '3px 10px', borderRadius: '20px',
        fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase',
        background: bg, color: text, marginBottom: '16px', alignSelf: 'flex-start',
      }}>
        {t.type}
      </span>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '14px' }}>
        {[1,2,3,4,5].map(i => <Star key={i} size={13} fill="#C9A96E" color="#C9A96E" />)}
      </div>
      <p style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '17px', color: '#2E2922', lineHeight: '1.7',
        fontStyle: 'italic', flex: 1, marginBottom: '24px',
      }}>
        "{t.quote}"
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingTop: '20px', borderTop: '1px solid #F4F1EC' }}>
        <img
          src={t.avatar}
          alt={t.name}
          onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = t.fallbackAvatar || 'https://i.pravatar.cc/100?img=32'; }}
          style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
        />
        <div>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#1C1A16' }}>{t.name}</p>
          <p style={{ fontSize: '12px', color: '#8C8070', marginTop: '1px' }}>{t.location} · {t.trip}</p>
        </div>
      </div>
    </div>
  );
}

function CreatorCard({ creator }) {
  const [hovered, setHovered] = useState(false);
  const initials = creator.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const bio = creator.bio ? (creator.bio.length > 90 ? creator.bio.slice(0, 87) + '…' : creator.bio) : null;
  const count = creator.itinerary_count ?? 0;
  return (
    <Link
      to={`/${creator.slug}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderRadius: '10px', background: 'white', border: '1px solid #E8E3DA',
        padding: '28px 24px', textAlign: 'center',
        boxShadow: hovered ? '0 12px 40px rgba(28,26,22,0.10)' : '0 2px 12px rgba(28,26,22,0.04)',
        transform: hovered ? 'translateY(-4px)' : 'none',
        transition: 'box-shadow 0.3s, transform 0.3s',
      }}>
        {creator.avatarUrl
          ? <img src={creator.avatarUrl} alt={creator.name} style={{ width: '72px', height: '72px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 14px', display: 'block', border: '2px solid #E8E3DA' }} />
          : (
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%',
              background: '#EFF6F5', border: '2px solid rgba(27,107,101,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 14px',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '22px', fontWeight: '600', color: '#1B6B65',
            }}>
              {initials}
            </div>
          )
        }
        <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '17px', fontWeight: '600', color: '#1C1A16', marginBottom: '6px' }}>
          {creator.name}
        </p>
        {count > 0 && (
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '10px' }}>
            {count} {count === 1 ? 'journey' : 'journeys'}
          </p>
        )}
        {bio && (
          <p style={{ fontSize: '13px', color: '#6B6156', lineHeight: '1.6', marginBottom: '16px' }}>
            {bio}
          </p>
        )}
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase',
          color: hovered ? '#1B6B65' : '#B5AA99', transition: 'color 0.2s',
        }}>
          View profile <ArrowRight size={11} />
        </span>
      </div>
    </Link>
  );
}

function CuratedJourneyCard({ it, isPurchased = false, creator }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={`/itineraries/${it.id}`}
      style={{ textDecoration: 'none', display: 'block', height: '100%' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderRadius: '10px', overflow: 'hidden', background: 'white',
        height: '100%', display: 'flex', flexDirection: 'column',
        boxShadow: hovered ? '0 20px 60px rgba(28,26,22,0.13)' : '0 4px 24px rgba(28,26,22,0.06)',
        transition: 'box-shadow 0.35s, transform 0.35s, border-color 0.35s',
        transform: hovered ? 'translateY(-5px)' : 'none',
        border: it.isPremium && isPurchased ? '1px solid rgba(212,165,93,0.4)' : '1px solid transparent',
      }}>
        <div style={{ position: 'relative', paddingTop: '56%', overflow: 'hidden', flexShrink: 0 }}>
          <img
            src={it.coverImage || it.image} alt={it.title}
            style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              objectFit: 'cover',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.6s ease',
            }}
            loading="lazy"
            onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = it.coverImage; }}
          />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to top, rgba(28,26,22,0.4) 0%, transparent 50%)',
          }} />
          <span style={{
            position: 'absolute', top: '14px', left: '14px',
            padding: '4px 10px', borderRadius: '3px',
            fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px',
            textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            ...(isPurchased ? {
              background: 'rgba(201,169,110,0.2)',
              border: '1px solid rgba(201,169,110,0.5)',
              color: '#C9A96E',
            } : {
              background: it.isPremium ? '#C9A96E' : '#1B6B65',
              color: 'white',
            }),
          }}>
            {isPurchased
              ? <><Check size={9} strokeWidth={3} /> Purchased</>
              : (it.isPremium ? `Premium · €${it.price}` : 'Free Journey')
            }
          </span>
        </div>
        <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
            {it.bestFor.map(tag => (
              <span key={tag} style={{
                padding: '3px 9px', borderRadius: '20px',
                fontSize: '11px', fontWeight: '600',
                background: '#EFF6F5', color: '#1B6B65',
              }}>
                {tag}
              </span>
            ))}
            <span style={{
              padding: '3px 9px', borderRadius: '20px',
              fontSize: '11px', fontWeight: '600',
              background: '#F4F1EC', color: '#8C8070',
            }}>
              {it.duration}
            </span>
          </div>
          <h3 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(17px, 2vw, 21px)', fontWeight: '600', color: '#1C1A16',
            lineHeight: '1.3', marginBottom: '6px',
          }}>
            {it.title}: {it.subtitle}
          </h3>
          {it.isPremium && isPurchased && (
            <p style={{
              display: 'flex', alignItems: 'center', gap: '5px',
              fontSize: '11.5px', fontWeight: '500', color: '#B8924A',
              marginBottom: '10px', letterSpacing: '0.1px',
            }}>
              <Check size={11} strokeWidth={2.5} />
              In your library
            </p>
          )}
          <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.7', flex: 1, marginBottom: '14px' }}>
            {it.shortDescription}
          </p>
          {creator && (
            <Link
              to={`/${creator.slug}`}
              onClick={e => e.stopPropagation()}
              style={{
                display: 'flex', alignItems: 'center', gap: '7px',
                textDecoration: 'none', marginBottom: '14px',
              }}
            >
              {creator.avatarUrl
                ? <img src={creator.avatarUrl} alt={creator.name} style={{ width: '20px', height: '20px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                : <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><User size={11} color="#1B6B65" /></div>
              }
              <span style={{ fontSize: '12px', color: '#8C8070' }}>by <span style={{ color: '#1B6B65', fontWeight: '600' }}>{creator.name}</span></span>
            </Link>
          )}
          <span style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase',
            color: hovered ? '#1B6B65' : '#B5AA99', transition: 'color 0.2s',
          }}>
            {it.isPremium && isPurchased ? 'Open Itinerary' : 'View Itinerary'} <ArrowRight size={12} />
          </span>
        </div>
      </div>
    </Link>
  );
}
