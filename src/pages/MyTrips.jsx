import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, Calendar, BookOpen, MapPin, Clock, Trash2 } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useApi } from '../lib/api';
import { getTripSource } from '../lib/tripSource';
import { itineraries } from '../data/itineraries';
import { getAiCoverImage } from '../lib/coverImage';

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

// ── Delete confirmation modal ────────────────────────────────────────────────
function DeleteConfirmModal({ destination, onConfirm, onCancel, deleting }) {
  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // Prevent page scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(28,26,22,0.55)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: '12px',
          width: '100%', maxWidth: '420px',
          boxShadow: '0 24px 80px rgba(28,26,22,0.18)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ padding: '28px 28px 0' }}>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '20px', fontWeight: '600', color: '#1C1A16',
            marginBottom: '10px',
          }}>
            Delete trip?
          </h2>
          <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.65' }}>
            Are you sure you want to delete{' '}
            <strong style={{ color: '#1C1A16', fontWeight: '600' }}>{destination}</strong>?
            {' '}This action cannot be undone.
          </p>
        </div>

        {/* Actions */}
        <div style={{
          display: 'flex', gap: '10px',
          padding: '24px 28px 28px',
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: '10px 20px', borderRadius: '4px',
              background: 'transparent', border: '1px solid #D4CCBF',
              fontSize: '13px', fontWeight: '600', color: '#4A433A',
              cursor: deleting ? 'default' : 'pointer',
              transition: 'all 0.15s', letterSpacing: '0.3px',
            }}
            onMouseEnter={e => { if (!deleting) e.currentTarget.style.borderColor = '#9C9488'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#D4CCBF'; }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: '10px 20px', borderRadius: '4px',
              background: deleting ? '#E8A89F' : '#C0392B',
              border: 'none',
              fontSize: '13px', fontWeight: '600', color: 'white',
              cursor: deleting ? 'default' : 'pointer',
              transition: 'background 0.15s', letterSpacing: '0.3px',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              minWidth: '110px', justifyContent: 'center',
            }}
            onMouseEnter={e => { if (!deleting) e.currentTarget.style.background = '#A93226'; }}
            onMouseLeave={e => { if (!deleting) e.currentTarget.style.background = '#C0392B'; }}
          >
            {deleting ? 'Deleting…' : 'Delete trip'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Per-source gradient used when no catalog cover image is found (e.g. AI trips).
const SOURCE_GRADIENTS = {
  FREE_JOURNEY:    'linear-gradient(135deg, #0E3D39 0%, #1B6B65 100%)',
  AI_GENERATED:    'linear-gradient(135deg, #2C2925 0%, #1C1A16 100%)',
  PREMIUM_JOURNEY: 'linear-gradient(135deg, #8A6332 0%, #C9A96E 100%)',
};

// ── AI Trip card ────────────────────────────────────────────────────────────
function AiTripCard({ trip, onDelete }) {
  const [hovered, setHovered] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const tag = getTripSource(trip.source);

  // FREE_JOURNEY / PREMIUM_JOURNEY: resolve catalog image by matching destination to title.
  // AI_GENERATED: prefer the persisted coverImage from DB, fall back to keyword map.
  const matched = itineraries.find(it => it.title === trip.destination);
  const coverUrl = matched?.image
    ?? (trip.source === 'AI_GENERATED'
      ? (trip.coverImage || getAiCoverImage(trip.destination))
      : null);
  const groupSize = matched?.groupSize ?? null;
  const fallbackGradient = SOURCE_GRADIENTS[trip.source] ?? SOURCE_GRADIENTS.AI_GENERATED;

  function openConfirm(e) {
    e.preventDefault();
    e.stopPropagation();
    setConfirmOpen(true);
  }

  const handleCancel = useCallback(() => setConfirmOpen(false), []);

  async function handleConfirmDelete() {
    setDeleting(true);
    try {
      await onDelete(trip.id);
      setConfirmOpen(false);
    } catch {
      setDeleting(false);
      setConfirmOpen(false);
    }
  }

  return (
    <>
    {confirmOpen && (
      <DeleteConfirmModal
        destination={trip.destination}
        onConfirm={handleConfirmDelete}
        onCancel={handleCancel}
        deleting={deleting}
      />
    )}
    <Link
      to={`/my-trips/${trip.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white', borderRadius: '10px',
        border: '1px solid #E8E3DA', textDecoration: 'none',
        overflow: 'hidden',
        boxShadow: hovered ? '0 20px 60px rgba(28,26,22,0.12)' : '0 2px 16px rgba(28,26,22,0.05)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        display: 'flex', flexDirection: 'column',
        opacity: deleting ? 0.5 : 1,
      }}
    >
      {/* Image / gradient banner */}
      <div style={{ position: 'relative', height: '160px', overflow: 'hidden', flexShrink: 0 }}>
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={trip.destination}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.5s ease',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{
            width: '100%', height: '100%',
            background: fallbackGradient,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 'clamp(20px, 4vw, 28px)',
              fontWeight: '600',
              color: 'rgba(255,255,255,0.45)',
              letterSpacing: '0.5px',
              textAlign: 'center',
              padding: '0 20px',
            }}>
              {trip.destination}
            </span>
          </div>
        )}
        {/* Scrim */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(28,26,22,0.45) 0%, transparent 55%)',
        }} />
        {/* Source badge — top-left overlay */}
        <div style={{
          position: 'absolute', top: '12px', left: '14px',
          padding: '4px 10px', borderRadius: '3px',
          fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.8px',
          textTransform: 'uppercase', background: tag.bg, color: tag.color,
        }}>
          {tag.label}
        </div>
        {/* Delete — top-right overlay */}
        <button
          onClick={openConfirm}
          disabled={deleting}
          title="Remove from library"
          style={{
            position: 'absolute', top: '10px', right: '10px',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '30px', height: '30px',
            background: 'rgba(28,26,22,0.4)',
            border: 'none', borderRadius: '50%',
            color: 'rgba(255,255,255,0.65)', cursor: deleting ? 'default' : 'pointer',
            transition: 'all 0.15s',
            backdropFilter: 'blur(4px)',
          }}
          onMouseEnter={e => { if (!deleting) { e.currentTarget.style.background = 'rgba(192,57,43,0.8)'; e.currentTarget.style.color = 'white'; }}}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(28,26,22,0.4)'; e.currentTarget.style.color = 'rgba(255,255,255,0.65)'; }}
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '18px', fontWeight: '600', color: '#1C1A16',
          lineHeight: '1.3', marginBottom: '6px',
        }}>
          {trip.destination}
        </h3>
        <div style={{ display: 'flex', gap: '14px', marginBottom: '10px', flexWrap: 'wrap' }}>
          {trip.country && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#8C8070' }}>
              <MapPin size={10} strokeWidth={2} />
              {trip.country}
            </span>
          )}
          {trip.duration && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#8C8070' }}>
              <Clock size={10} strokeWidth={2} />
              {trip.duration}{groupSize ? ` · ${groupSize}` : ''}
            </span>
          )}
        </div>
        {trip.overview && (
          <p style={{ fontSize: '13px', color: '#6B6156', lineHeight: '1.6', marginBottom: '12px', flex: 1 }}>
            {trip.overview.length > 100 ? trip.overview.slice(0, 100) + '…' : trip.overview}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#B5AA99', marginBottom: '14px' }}>
          <Calendar size={11} strokeWidth={2} />
          Saved {formatDate(trip.createdAt)}
        </div>
        {/* CTA — full width, no separate delete button */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '11px 16px', background: '#1B6B65', color: 'white',
          borderRadius: '4px', fontSize: '12.5px', fontWeight: '600',
          letterSpacing: '0.4px', textTransform: 'uppercase',
          justifyContent: 'center',
        }}>
          <BookOpen size={13} /> View Itinerary
        </div>
      </div>
    </Link>
    </>
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

// Returns first name → first word of full name → null (triggers "Your trips" fallback)
function resolveFirstName(user) {
  if (user.firstName?.trim()) return user.firstName.trim();
  if (user.fullName?.trim()) return user.fullName.trim().split(' ')[0];
  return null;
}

// ── Page ────────────────────────────────────────────────────────────────────
export default function MyTrips() {
  const { isLoaded, isSignedIn, user } = useUser();
  const api = useApi();

  // [DEBUG]
  const mountCount = useRef(0);
  useEffect(() => {
    mountCount.current += 1;
    console.log(`[MyTrips] mounted (mount #${mountCount.current}) — isLoaded:${isLoaded} isSignedIn:${isSignedIn}`);
    return () => console.log('[MyTrips] unmounted');
  }, []);
  useEffect(() => {
    console.log('[MyTrips] auth state —', { isLoaded, isSignedIn, userId: user?.id ?? null });
  }, [isLoaded, isSignedIn, user]);

  const [aiTrips, setAiTrips] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [status, setStatus] = useState('loading');

  async function handleDeleteTrip(tripId) {
    const res = await api.del(`/api/trips?id=${tripId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Delete failed');
    }
    setAiTrips(prev => prev.filter(t => t.id !== tripId));
  }

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setStatus('unauthenticated'); return; }

    setStatus('loading');

    Promise.all([
      api.get('/api/trips')
        .then(r => {
          if (!r.ok) return r.json().then(d => { throw new Error(d.detail || d.error || r.status); });
          return r.json();
        })
        .catch(err => { console.error('[MyTrips] /api/trips error:', err.message); return []; }),
      api.get('/api/my-trips')
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
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
          {(() => {
            const name = isSignedIn ? resolveFirstName(user) : null;
            return (
              <>
                <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(30px, 4vw, 46px)', fontWeight: '600', color: '#1C1A16', lineHeight: '1.15', marginBottom: '10px' }}>
                  {name ? `${name}'s trips` : 'Your trips'}
                </h1>
                <p style={{ fontSize: '15px', color: '#8C8070', lineHeight: '1.7' }}>
                  Your personal travel library
                </p>
              </>
            );
          })()}
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
              <Link to="/sign-in" style={{
                padding: '13px 32px', background: '#1B6B65', color: 'white',
                borderRadius: '4px', fontSize: '14px', fontWeight: '600',
                letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none',
                display: 'inline-block',
              }}>
                Sign in
              </Link>
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
                      Saved Trips
                    </h2>
                    <span style={{ fontSize: '13px', color: '#9C9488' }}>{aiTrips.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '28px' }}>
                    {aiTrips.map(trip => <AiTripCard key={trip.id} trip={trip} onDelete={handleDeleteTrip} />)}
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
