import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, Calendar, BookOpen, MapPin, Clock, Trash2, Sparkles, Download } from 'lucide-react';
import { useUser } from '@clerk/clerk-react';
import { useApi } from '../lib/api';
import { getTripSource } from '../lib/tripSource';
import { itineraries } from '../data/itineraries';
import { getAiCoverImage } from '../lib/coverImage';
import { resolveCoverImage } from '../lib/resolveCoverImage';

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

  // Resolve all presentation fields: DB value (if proper) → local data file fallback.
  // Itinerary rows created as checkout stubs have title=slug and empty description/coverImage.
  const localIt = itineraries.find(it => it.id === trip.slug);
  const isStubTitle  = !trip.title || trip.title === trip.slug;
  const resolvedTitle   = isStubTitle ? (localIt?.title || trip.slug) : trip.title;
  const resolvedExcerpt = trip.excerpt?.trim()
    ? trip.excerpt
    : (localIt?.shortDescription || localIt?.description || '');
  const resolvedImage = trip.coverImage || localIt?.coverImage || localIt?.image || '';

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
          src={resolvedImage} alt={resolvedTitle}
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            transform: hovered ? 'scale(1.05)' : 'scale(1)',
            transition: 'transform 0.5s ease',
          }}
          onError={e => {
            e.currentTarget.onerror = null;
            const fallback = localIt?.image || localIt?.coverImage || '';
            if (fallback && e.currentTarget.src !== fallback) e.currentTarget.src = fallback;
          }}
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
          {resolvedTitle}
        </h3>
        {resolvedExcerpt && (
          <p style={{ fontSize: '13.5px', color: '#6B6156', lineHeight: '1.6', marginBottom: '16px' }}>
            {resolvedExcerpt}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#9C9488', marginBottom: '20px' }}>
          <Calendar size={12} strokeWidth={2} />
          Purchased {formatDate(trip.purchasedAt)}
        </div>
        <Link
          to={`/itineraries/${trip.slug}`}
          style={{
            marginTop: 'auto',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            padding: '11px 16px', background: '#1B6B65', color: 'white',
            borderRadius: '4px', fontSize: '12.5px', fontWeight: '600',
            letterSpacing: '0.4px', textTransform: 'uppercase', textDecoration: 'none',
          }}
        >
          <BookOpen size={13} /> View Itinerary
        </Link>
      </div>
    </div>
  );
}

// ── Custom Request card ──────────────────────────────────────────────────────
const REQUEST_STATUS = {
  open:        { label: 'Request received',        color: '#1B6B65', bg: '#EFF6F5' },
  in_progress: { label: 'Building your itinerary', color: '#A07830', bg: '#FBF6EE' },
  done:        { label: 'Ready',                   color: '#166534', bg: '#DCFCE7' },
};

function CustomRequestCard({ request }) {
  const [hovered, setHovered] = useState(false);
  const meta        = REQUEST_STATUS[request.status] ?? REQUEST_STATUS.open;
  const linkedSlug  = request.linkedItinerarySlug;
  const linkedReady = request.linkedItineraryStatus === 'published';

  // Resolve presentation fields from linked itinerary (if ready) or request fallback
  const title       = request.linkedItineraryTitle || request.destination || 'Custom trip';
  const coverSrc    = linkedSlug
    ? resolveCoverImage(request.linkedItineraryCoverImage, linkedSlug)
    : null;
  const durationStr = request.linkedItineraryDurationDays
    ? `${request.linkedItineraryDurationDays} days`
    : null;
  const country     = request.linkedItineraryCountry || null;
  const pdfUrl      = request.linkedItineraryPdfUrl  || null;

  // CTA mode
  let ctaMode = 'status';
  if (linkedSlug && linkedReady)                    ctaMode = 'itinerary';
  else if (linkedSlug)                              ctaMode = 'processing';
  else if (request.tripId)                          ctaMode = 'trip';

  const itineraryUrl = `/itinerary/custom/${linkedSlug}`;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'white', borderRadius: '10px',
        border: '1px solid #E8E3DA', overflow: 'hidden',
        boxShadow: hovered ? '0 20px 60px rgba(28,26,22,0.12)' : '0 2px 16px rgba(28,26,22,0.05)',
        transform: hovered ? 'translateY(-4px)' : 'translateY(0)',
        transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {/* Banner — hero image or gradient fallback */}
      <div style={{
        position: 'relative', height: '180px', flexShrink: 0, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0E3D39 0%, #1B6B65 60%, #2A8A7E 100%)',
      }}>
        {coverSrc ? (
          <img
            src={coverSrc}
            alt={title}
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: hovered ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.5s ease',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={32} color="rgba(255,255,255,0.25)" />
          </div>
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(14,61,57,0.7) 0%, transparent 55%)' }} />

        {/* Custom Journey badge */}
        <div style={{
          position: 'absolute', top: '12px', left: '14px',
          padding: '4px 10px', borderRadius: '3px',
          fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.8px',
          textTransform: 'uppercase', background: 'rgba(201,169,110,0.9)', color: '#3A2A0A',
        }}>
          Custom Journey
        </div>

        {/* Status pill */}
        <div style={{
          position: 'absolute', bottom: '12px', left: '14px',
          fontSize: '10.5px', fontWeight: '600', color: 'white',
          background: 'rgba(0,0,0,0.4)', padding: '3px 9px',
          borderRadius: '10px', backdropFilter: 'blur(4px)',
        }}>
          {meta.label}
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: '18px 20px 16px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <h3 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '18px', fontWeight: '600', color: '#1C1A16',
          lineHeight: '1.3', marginBottom: '6px',
        }}>
          {title}
        </h3>

        {/* Metadata row */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
          {country && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#8C8070' }}>
              <MapPin size={10} strokeWidth={2} />{country}
            </span>
          )}
          {durationStr && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#8C8070' }}>
              <Clock size={10} strokeWidth={2} />{durationStr}
            </span>
          )}
          {!country && request.dates && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#8C8070' }}>
              <Calendar size={10} strokeWidth={2} />{request.dates}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', color: '#B5AA99', marginBottom: '16px' }}>
          <Calendar size={11} strokeWidth={2} />
          Submitted {formatDate(request.createdAt)}
        </div>

        {/* CTAs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
          {ctaMode === 'itinerary' && (
            <>
              <Link
                to={itineraryUrl}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '11px 16px', background: '#1B6B65', color: 'white',
                  borderRadius: '4px', fontSize: '12.5px', fontWeight: '600',
                  letterSpacing: '0.4px', textTransform: 'uppercase',
                  textDecoration: 'none', justifyContent: 'center',
                }}
              >
                <BookOpen size={13} /> View Itinerary
              </Link>
              {pdfUrl && (
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    padding: '10px 16px', background: 'white', color: '#C9A96E',
                    border: '1px solid #C9A96E', borderRadius: '4px',
                    fontSize: '12.5px', fontWeight: '600',
                    letterSpacing: '0.4px', textTransform: 'uppercase',
                    textDecoration: 'none', justifyContent: 'center',
                  }}
                >
                  <Download size={13} /> Download PDF
                </a>
              )}
            </>
          )}

          {ctaMode === 'processing' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '11px 16px', background: '#FBF6EE', color: '#A07830',
              border: '1px solid #A0783022', borderRadius: '4px',
              fontSize: '12px', fontWeight: '600', letterSpacing: '0.4px',
              justifyContent: 'center',
            }}>
              Building your itinerary…
            </div>
          )}

          {ctaMode === 'trip' && (
            <Link
              to={`/my-trips/${request.tripId}`}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '11px 16px', background: '#1B6B65', color: 'white',
                borderRadius: '4px', fontSize: '12.5px', fontWeight: '600',
                letterSpacing: '0.4px', textTransform: 'uppercase',
                textDecoration: 'none', justifyContent: 'center',
              }}
            >
              <BookOpen size={13} /> View trip
            </Link>
          )}

          {ctaMode === 'status' && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '11px 16px', background: meta.bg, color: meta.color,
              border: `1px solid ${meta.color}22`, borderRadius: '4px',
              fontSize: '12px', fontWeight: '600', letterSpacing: '0.4px',
              justifyContent: 'center',
            }}>
              {meta.label}
            </div>
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
  const [searchParams, setSearchParams] = useSearchParams();

  const [aiTrips, setAiTrips] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [customRequests, setCustomRequests] = useState([]);
  const [status, setStatus] = useState('loading');

  // Success banner — shown after returning from custom planning checkout
  const [showSuccess, setShowSuccess] = useState(searchParams.get('success') === 'true');

  // Incremented after custom-verify completes so the data fetch re-runs
  const [refreshKey, setRefreshKey] = useState(0);

  // On mount: strip ?success and ?session_id from URL (idempotent on refresh),
  // then call custom-verify if session_id is present so Itinerary + Purchase are created.
  useEffect(() => {
    const sessionId  = searchParams.get('session_id');
    const hasSuccess = searchParams.get('success') === 'true';

    if (hasSuccess || sessionId) {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('success');
        next.delete('session_id');
        return next;
      }, { replace: true });
    }

    if (sessionId) {
      fetch('/api/checkout?action=custom-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      })
        .catch(() => null)
        .finally(() => setRefreshKey(k => k + 1));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
      api.get('/api/itineraries?action=my-trips')
        .then(async r => {
          const json = await r.json().catch(() => []);
          return Array.isArray(json) ? json : [];
        })
        .catch(err => { console.error('[MyTrips] /api/itineraries?action=my-trips fetch error:', err); return []; }),
      api.get('/api/custom-requests')
        .then(r => r.ok ? r.json() : [])
        .catch(() => []),
    ]).then(([trips, bought, requests]) => {
      setAiTrips(trips);
      setPurchases(bought);
      setCustomRequests(requests);
      setStatus('ok');
    });
  }, [isLoaded, isSignedIn, refreshKey]);

  const purchasedSlugs = new Set(purchases.map(p => p.slug).filter(Boolean));
  const savedTrips = aiTrips.filter(t => !t.itinerarySlug || !purchasedSlugs.has(t.itinerarySlug));
  const totalCount = savedTrips.length + purchases.length + customRequests.length;

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

      {/* Success banner — shown after returning from custom planning checkout */}
      {showSuccess && (
        <div style={{ background: '#EFF6F5', borderBottom: '1px solid #C0DDD9' }}>
          <div style={{
            maxWidth: '1100px', margin: '0 auto',
            padding: '16px 24px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '18px', lineHeight: 1 }}>✅</span>
              <p style={{ fontSize: '14px', color: '#1B6B65', fontWeight: '500', lineHeight: '1.5' }}>
                Your itinerary request has been received. We're preparing your journey.
              </p>
            </div>
            <button
              onClick={() => setShowSuccess(false)}
              aria-label="Dismiss"
              style={{
                background: 'transparent', border: 'none',
                color: '#1B6B65', cursor: 'pointer',
                fontSize: '18px', lineHeight: 1, flexShrink: 0,
                opacity: 0.65, padding: '4px',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '1'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '0.65'; }}
            >
              ×
            </button>
          </div>
        </div>
      )}

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
              {savedTrips.length > 0 && (
                <div style={{ marginBottom: '60px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16' }}>
                      Saved Trips
                    </h2>
                    <span style={{ fontSize: '13px', color: '#9C9488' }}>{savedTrips.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '28px' }}>
                    {savedTrips.map(trip => <AiTripCard key={trip.id} trip={trip} onDelete={handleDeleteTrip} />)}
                  </div>
                </div>
              )}

              {/* Custom Journeys section */}
              {customRequests.length > 0 && (
                <div style={{ marginBottom: '60px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '24px' }}>
                    <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16' }}>
                      Custom Journeys
                    </h2>
                    <span style={{ fontSize: '13px', color: '#9C9488' }}>{customRequests.length}</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '28px' }}>
                    {customRequests.map(r => <CustomRequestCard key={r.id} request={r} />)}
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
