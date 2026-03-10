import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, Calendar, BookOpen, MapPin, Clock } from 'lucide-react';
import { useUser, SignInButton } from '@clerk/clerk-react';
import { useApi } from '../lib/api';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── AI Trip card ────────────────────────────────────────────────────────────
function AiTripCard({ trip }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link
      to={`/my-trips/${trip.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white', borderRadius: '10px',
        border: '1px solid #E8E3DA', textDecoration: 'none',
        boxShadow: hovered ? '0 20px 60px rgba(28,26,22,0.12)' : '0 2px 16px rgba(28,26,22,0.05)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ padding: '22px 22px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '4px 10px', borderRadius: '3px', marginBottom: '14px',
          fontSize: '9.5px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase',
          background: '#EFF6F5', color: '#1B6B65', alignSelf: 'flex-start',
        }}>
          AI Generated
        </div>
        <h3 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '19px', fontWeight: '600', color: '#1C1A16',
          lineHeight: '1.3', marginBottom: '10px',
        }}>
          {trip.destination}
        </h3>
        {trip.country && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#8C8070', marginBottom: '6px' }}>
            <MapPin size={11} strokeWidth={2} />
            {trip.country}
          </div>
        )}
        {trip.duration && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12.5px', color: '#8C8070', marginBottom: '14px' }}>
            <Clock size={11} strokeWidth={2} />
            {trip.duration} · {trip.dayCount} {trip.dayCount === 1 ? 'day' : 'days'}
          </div>
        )}
        {trip.overview && (
          <p style={{ fontSize: '13.5px', color: '#6B6156', lineHeight: '1.6', marginBottom: '16px', flex: 1 }}>
            {trip.overview.length > 120 ? trip.overview.slice(0, 120) + '…' : trip.overview}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9C9488', marginBottom: '20px' }}>
          <Calendar size={12} strokeWidth={2} />
          Saved {formatDate(trip.createdAt)}
        </div>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '11px 16px', background: '#1B6B65', color: 'white',
          borderRadius: '4px', fontSize: '12.5px', fontWeight: '600',
          letterSpacing: '0.4px', textTransform: 'uppercase', alignSelf: 'stretch',
          justifyContent: 'center',
        }}>
          <BookOpen size={13} /> View Itinerary
        </div>
      </div>
    </Link>
  );
}

// ── Purchased Itinerary card ────────────────────────────────────────────────
function PurchasedTripCard({ trip }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white', borderRadius: '10px', overflow: 'hidden',
        border: '1px solid #E8E3DA',
        boxShadow: hovered ? '0 20px 60px rgba(28,26,22,0.12)' : '0 2px 16px rgba(28,26,22,0.05)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', height: '200px', overflow: 'hidden', flexShrink: 0 }}>
        <img
          src={trip.coverImage} alt={trip.title}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 0.5s ease',
          }}
          onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&q=80'; }}
        />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(28,26,22,0.5) 0%, transparent 55%)' }} />
        <div style={{
          position: 'absolute', top: '14px', left: '14px',
          padding: '4px 10px', borderRadius: '3px',
          fontSize: '9.5px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase',
          background: '#1B6B65', color: 'white',
        }}>
          Purchased
        </div>
      </div>
      <div style={{ padding: '22px 22px 20px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '19px', fontWeight: '600', color: '#1C1A16', lineHeight: '1.3', marginBottom: '8px' }}>
          {trip.title}
        </h3>
        {trip.excerpt && (
          <p style={{ fontSize: '13.5px', color: '#6B6156', lineHeight: '1.6', marginBottom: '16px' }}>
            {trip.excerpt}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9C9488', marginBottom: '20px' }}>
          <Calendar size={12} strokeWidth={2} />
          Purchased {formatDate(trip.purchasedAt)}
        </div>
        <div style={{ display: 'flex', gap: '10px', marginTop: 'auto', flexWrap: 'wrap' }}>
          <Link
            to={`/itineraries/${trip.slug}`}
            style={{
              flex: 1, minWidth: '120px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '11px 16px', background: '#1B6B65', color: 'white',
              borderRadius: '4px', fontSize: '12.5px', fontWeight: '600',
              letterSpacing: '0.4px', textTransform: 'uppercase', textDecoration: 'none',
            }}
          >
            <BookOpen size={13} /> View Itinerary
          </Link>
          {trip.pdfUrl ? (
            <a
              href={trip.pdfUrl} target="_blank" rel="noopener noreferrer"
              style={{
                flex: 1, minWidth: '120px',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                padding: '11px 16px', background: 'transparent', color: '#1C1A16',
                border: '1px solid #D4CCBF', borderRadius: '4px',
                fontSize: '12.5px', fontWeight: '600',
                letterSpacing: '0.4px', textTransform: 'uppercase', textDecoration: 'none',
              }}
            >
              <Download size={13} /> Download PDF
            </a>
          ) : (
            <span style={{
              flex: 1, minWidth: '120px',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
              padding: '11px 16px', background: '#F4F1EC', color: '#B5AA99',
              border: '1px solid #E8E3DA', borderRadius: '4px',
              fontSize: '12.5px', fontWeight: '600',
              letterSpacing: '0.4px', textTransform: 'uppercase', cursor: 'not-allowed',
            }}>
              <Download size={13} /> PDF Soon
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MyTrips() {
  const { isLoaded, isSignedIn, user } = useUser();
  const api = useApi();

  const [aiTrips, setAiTrips] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setStatus('unauthenticated'); return; }

    setStatus('loading');

    Promise.all([
      api.get('/api/trips').then(r => r.ok ? r.json() : []).catch(() => []),
      api.get('/api/my-trips').then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([trips, bought]) => {
      setAiTrips(trips);
      setPurchases(bought);
      setStatus('ok');
    });
  }, [isLoaded, isSignedIn]);

  const totalCount = aiTrips.length + purchases.length;

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#F4F1EC', padding: 'clamp(48px, 7vw, 88px) 24px', borderBottom: '1px solid #E8E3DA' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '14px' }}>
            My Library
          </span>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: '600', color: '#1C1A16', lineHeight: '1.15', marginBottom: '12px' }}>
            Your trips.
          </h1>
          {isSignedIn && (
            <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7' }}>
              Signed in as <strong style={{ color: '#1C1A16' }}>{user.primaryEmailAddress?.emailAddress}</strong>
            </p>
          )}
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: 'clamp(40px, 6vw, 72px) 24px' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto' }}>

          {/* Not signed in */}
          {status === 'unauthenticated' && (
            <div style={{ textAlign: 'center', padding: '80px 24px', background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' }}>
              <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
                Sign in to view your trips
              </p>
              <p style={{ fontSize: '15px', color: '#6B6156', marginBottom: '28px', lineHeight: '1.7' }}>
                Your saved and purchased itineraries are stored in your account.
              </p>
              <SignInButton mode="modal">
                <button style={{
                  padding: '13px 32px', background: '#1B6B65', color: 'white',
                  border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: '600',
                  letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer',
                }}>
                  Sign in
                </button>
              </SignInButton>
            </div>
          )}

          {/* Loading */}
          {status === 'loading' && (
            <div style={{ textAlign: 'center', padding: '80px 24px', color: '#9C9488' }}>
              <p style={{ fontSize: '15px' }}>Loading your trips…</p>
            </div>
          )}

          {/* Loaded */}
          {status === 'ok' && (
            <>
              {/* Empty state */}
              {totalCount === 0 && (
                <div style={{ textAlign: 'center', padding: '80px 24px', background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' }}>
                  <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
                    No trips yet.
                  </p>
                  <p style={{ fontSize: '15px', color: '#6B6156', marginBottom: '28px', lineHeight: '1.7' }}>
                    Generate an AI itinerary or browse our curated collection.
                  </p>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <Link to="/ai-planner" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 26px', background: '#1B6B65', color: 'white', borderRadius: '4px', fontSize: '13.5px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none' }}>
                      AI Planner <ArrowRight size={14} />
                    </Link>
                    <Link to="/itineraries" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '13px 26px', background: 'transparent', color: '#1C1A16', border: '1px solid #D4CCBF', borderRadius: '4px', fontSize: '13.5px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none' }}>
                      Browse Itineraries
                    </Link>
                  </div>
                </div>
              )}

              {/* AI Trips section */}
              {aiTrips.length > 0 && (
                <div style={{ marginBottom: '60px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16' }}>
                      Saved AI Trips
                    </h2>
                    <span style={{ fontSize: '13px', color: '#9C9488' }}>{aiTrips.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '28px' }}>
                    {aiTrips.map(trip => <AiTripCard key={trip.id} trip={trip} />)}
                  </div>
                </div>
              )}

              {/* Purchased Itineraries section */}
              {purchases.length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16' }}>
                      Purchased Itineraries
                    </h2>
                    <span style={{ fontSize: '13px', color: '#9C9488' }}>{purchases.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '28px' }}>
                    {purchases.map(trip => <PurchasedTripCard key={trip.purchaseId} trip={trip} />)}
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </section>
    </div>
  );
}
