import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Clock, Users, MapPin, Check, Star, ArrowRight, Lock, Download, ChevronRight, Route } from 'lucide-react';
import { useAuth, useUser, useClerk } from '@clerk/clerk-react';
import { itineraries } from '../data/itineraries';
import { downloadItineraryPDF } from '../utils/downloadPDF';
import { useApi } from '../lib/api';

// ─────────────────────────────────────────────────────────────
// Sidebar — locked state
// ─────────────────────────────────────────────────────────────
function LockedSidebar({ itinerary, onBuy, purchasing }) {
  const { price, included = [] } = itinerary;
  const allFeatures = ['Save 20+ hours of travel planning', ...included];
  return (
    <div style={{
      background: 'white', border: '1px solid #E8E3DA',
      borderRadius: '12px', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(28,26,22,0.08)',
    }}>
      <div style={{ background: 'linear-gradient(135deg, #0E3D39, #1B6B65)', padding: '28px' }}>
        <div style={{ display: 'flex', gap: '2px', marginBottom: '12px' }}>
          {[1,2,3,4,5].map(i => <Star key={i} size={12} fill="#C9A96E" color="#C9A96E" />)}
        </div>
        <div style={{ fontSize: '36px', fontWeight: '700', color: 'white', fontFamily: "'Playfair Display', Georgia, serif" }}>
          €{price}
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', marginTop: '4px' }}>
          One-time purchase · Digital + PDF
        </p>
        <p style={{ fontSize: '11.5px', color: 'rgba(201,169,110,0.85)', marginTop: '8px', fontWeight: '500' }}>
          Used by 1,200+ travellers
        </p>
      </div>

      <div style={{ padding: '28px' }}>
        {allFeatures.length > 0 && (
          <>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#4A433A', marginBottom: '16px' }}>
              What's included:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
              {allFeatures.map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <Check size={14} color="#1B6B65" style={{ flexShrink: 0, marginTop: '2px' }} strokeWidth={2.5} />
                  <span style={{ fontSize: '13px', color: '#4A433A', lineHeight: '1.5' }}>{item}</span>
                </div>
              ))}
            </div>
          </>
        )}

        <button
          onClick={onBuy}
          disabled={purchasing}
          style={{
            width: '100%', padding: '16px',
            background: purchasing ? '#8C8070' : '#C9A96E',
            color: 'white', border: 'none', borderRadius: '4px',
            fontSize: '15px', fontWeight: '700',
            letterSpacing: '0.2px',
            cursor: purchasing ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginBottom: '8px', transition: 'background 0.2s',
          }}
          onMouseEnter={e => { if (!purchasing) e.currentTarget.style.background = '#B8943A'; }}
          onMouseLeave={e => { if (!purchasing) e.currentTarget.style.background = '#C9A96E'; }}
        >
          {purchasing ? 'Processing…' : `Buy itinerary — €${price}`}
        </button>

        <p style={{ fontSize: '12px', color: '#9C9488', textAlign: 'center', marginBottom: '16px' }}>
          Instant access after purchase
        </p>

        <Link
          to="/custom"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            width: '100%', padding: '12px',
            border: '1px solid #E8E3DA', borderRadius: '4px',
            fontSize: '13px', fontWeight: '600', color: '#4A433A',
            textDecoration: 'none',
          }}
        >
          Customize This Route <ArrowRight size={13} />
        </Link>
        <p style={{ fontSize: '12px', color: '#B5AA99', textAlign: 'center', marginTop: '16px' }}>
          Or <Link to="/custom" style={{ color: '#1B6B65', fontWeight: '600' }}>build a custom trip</Link> from scratch
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sidebar — unlocked state
// ─────────────────────────────────────────────────────────────
function UnlockedSidebar({ itinerary, onDownload }) {
  const { price, included = [], title } = itinerary;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // onDownload handles save + audit + actual file delivery
      await onDownload();
    } catch (err) {
      console.error('[UnlockedSidebar] download error:', err.message);
      setDownloadError(err.message || 'PDF generation failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{
      background: 'white', border: '1px solid #E8E3DA',
      borderRadius: '12px', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(28,26,22,0.08)',
    }}>
      {/* Purchased header */}
      <div style={{ background: 'linear-gradient(135deg, #0E3D39, #1B6B65)', padding: '28px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '5px 12px', borderRadius: '3px',
          background: 'rgba(201,169,110,0.2)', border: '1px solid rgba(201,169,110,0.4)',
          marginBottom: '12px',
        }}>
          <Check size={11} color="#C9A96E" strokeWidth={3} />
          <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', color: '#C9A96E', textTransform: 'uppercase' }}>
            Purchased
          </span>
        </div>
        <div style={{ fontSize: '22px', fontWeight: '600', color: 'white', fontFamily: "'Playfair Display', Georgia, serif", lineHeight: '1.3' }}>
          Full itinerary<br />unlocked
        </div>
        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginTop: '6px' }}>
          All {itinerary.days?.length || ''} days · PDF included
        </p>
      </div>

      <div style={{ padding: '28px' }}>
        {included.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            {included.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Check size={14} color="#1B6B65" style={{ flexShrink: 0, marginTop: '2px' }} strokeWidth={2.5} />
                <span style={{ fontSize: '13px', color: '#4A433A', lineHeight: '1.5' }}>{item}</span>
              </div>
            ))}
          </div>
        )}

        {/* PDF download */}
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            width: '100%', padding: '16px',
            background: downloading ? '#4A9E98' : '#1B6B65',
            color: 'white', border: 'none', borderRadius: '4px',
            fontSize: '14px', fontWeight: '600',
            letterSpacing: '0.5px', textTransform: 'uppercase',
            cursor: downloading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginBottom: '12px', transition: 'background 0.2s',
          }}
        >
          <Download size={15} />
          {downloading ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        {downloadError && (
          <p style={{ fontSize: '12px', color: '#B04040', textAlign: 'center', margin: '-4px 0 12px' }}>
            {downloadError}
          </p>
        )}

        <Link
          to="/my-trips"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            width: '100%', padding: '12px',
            border: '1px solid #E8E3DA', borderRadius: '4px',
            fontSize: '13px', fontWeight: '600', color: '#4A433A',
            textDecoration: 'none',
          }}
        >
          View My Library <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Day entry — renders locked or unlocked
// ─────────────────────────────────────────────────────────────
function DayEntry({ day, index, isLocked, isLast }) {
  return (
    <div style={{ display: 'flex', gap: '24px', position: 'relative' }}>
      {/* Timeline dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: isLocked ? '#E8E3DA' : '#1B6B65',
          color: isLocked ? '#8C8070' : 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: '600', flexShrink: 0, zIndex: 1,
        }}>
          {isLocked ? <Lock size={13} /> : day.day}
        </div>
        {!isLast && (
          <div style={{ width: '1px', flex: 1, background: '#E8E3DA', minHeight: '24px' }} />
        )}
      </div>

      {/* Content */}
      <div style={{
        paddingBottom: '40px', flex: 1,
        filter: isLocked ? 'blur(4px)' : 'none',
        userSelect: isLocked ? 'none' : 'auto',
        transition: 'filter 0.4s ease',
        pointerEvents: isLocked ? 'none' : 'auto',
      }}>
        <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '6px' }}>
          Day {day.day}
        </p>
        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '10px' }}>
          {day.title}
        </h3>
        <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7', marginBottom: day.bullets?.length ? '16px' : '0' }}>
          {day.desc}
        </p>

        {day.bullets?.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {day.bullets.map((bullet, bi) => (
              <li key={bi} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#C9A96E', flexShrink: 0, marginTop: '8px' }} />
                <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.6' }}>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Insider tip — only shown when unlocked */}
        {!isLocked && day.tip && (
          <div style={{
            marginTop: '14px',
            padding: '14px 18px',
            background: '#F4F1EC', borderRadius: '6px',
            borderLeft: '3px solid #C9A96E',
          }}>
            <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.2px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '4px' }}>
              Insider Tip
            </p>
            <p style={{ fontSize: '13.5px', color: '#4A433A', lineHeight: '1.6', margin: 0 }}>
              {day.tip}
            </p>
          </div>
        )}

        {day.img && !isLocked && (
          <img
            src={day.img} alt={day.title}
            style={{ marginTop: '16px', width: '100%', maxWidth: '480px', height: '220px', objectFit: 'cover', borderRadius: '6px' }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function ItineraryDetailPage() {
  const { id } = useParams();
  const itinerary = itineraries.find(it => it.id === id);

  const { isLoaded, isSignedIn } = useAuth();
  const { openSignIn } = useClerk();
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [accessState, setAccessState] = useState('checking'); // 'checking' | 'locked' | 'unlocked' | 'unauthenticated' | 'verifying'
  const [pdfUrl, setPdfUrl]           = useState(null);
  const [purchasing, setPurchasing]   = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);

  // Session-scoped dedup: save this itinerary at most once per page load
  const [savedItineraryId, setSavedItineraryId]       = useState(null);
  const [itinerarySaveState, setItinerarySaveState]   = useState('idle'); // 'idle'|'saving'|'saved'|'error'

  const isPremium = itinerary?.isPremium;
  const PENDING_KEY = 'ha_pending_purchase';

  useEffect(() => {
    if (!itinerary || !isLoaded) return;
    if (!isPremium) { setAccessState('unlocked'); return; }

    if (!isSignedIn) { setAccessState('locked'); return; }

    api.get(`/api/itineraries/${itinerary.id}/access`)
      .then(res => res.ok ? res.json() : { hasAccess: false, pdfUrl: null })
      .then(({ hasAccess, pdfUrl }) => {
        setAccessState(hasAccess ? 'unlocked' : 'locked');
        setPdfUrl(pdfUrl);
      })
      .catch(() => setAccessState('locked'));
  }, [itinerary?.id, isLoaded, isSignedIn]);

  // After sign-in: auto-resume checkout if visitor clicked Buy before authenticating
  useEffect(() => {
    if (!isLoaded || !isSignedIn || !itinerary) return;
    const pending = sessionStorage.getItem(PENDING_KEY);
    if (pending === itinerary.id) {
      sessionStorage.removeItem(PENDING_KEY);
      handlePurchase();
    }
  }, [isLoaded, isSignedIn, itinerary?.id]);

  // Detect Stripe return: ?session_id=cs_xxx → verify payment
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    if (!sessionId || !isLoaded || !isSignedIn || !itinerary) return;

    setAccessState('verifying');
    api.post('/api/checkout/verify', { sessionId })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(({ hasAccess, pdfUrl }) => {
        if (hasAccess) {
          setPdfUrl(pdfUrl);
          setAccessState('unlocked');
          setSearchParams({}, { replace: true });
        } else {
          setAccessState('locked');
        }
      })
      .catch(() => setAccessState('locked'));
  }, [searchParams, isLoaded, isSignedIn, itinerary?.id]);

  async function handlePurchase() {
    if (!itinerary || purchasing) return;
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const res = await api.post('/api/checkout/session', {
        slug:       itinerary.id,
        amount:     itinerary.price,
        title:      itinerary.title,
        coverImage: itinerary.coverImage || itinerary.image,
      });
      if (!res.ok) throw new Error('Could not create checkout session');
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setPurchaseError('Something went wrong. Please try again.');
      setPurchasing(false);
    }
  }

  // Persist a curated itinerary to the Trip table (same model as AI trips).
  // source: 'FREE_JOURNEY' | 'PREMIUM_JOURNEY'
  // Returns the trip id on success, null on failure. Deduplicates within session.
  async function ensureItinerarySaved(source) {
    if (savedItineraryId) {
      console.log('[ItineraryDetail] already saved this session, reusing tripId:', savedItineraryId);
      return savedItineraryId;
    }
    if (itinerarySaveState === 'saving') {
      console.warn('[ItineraryDetail] save already in progress');
      return null;
    }

    const tripPayload = {
      destination: itinerary.title,
      country:     itinerary.country     || '',
      duration:    itinerary.duration    || '',
      overview:    itinerary.description || '',
      highlights:  itinerary.highlights  || [],
      hotels:      itinerary.hotels      || [],
      experiences: itinerary.bestFor     || [],
      days: (itinerary.days || []).map(d => ({
        day:         d.day,
        title:       d.title || '',
        description: d.desc || d.description || '',
      })),
    };

    console.log('[ItineraryDetail] calling POST /api/trips/save — source:', source, '| title:', itinerary.title);
    setItinerarySaveState('saving');
    try {
      const res = await api.post('/api/trips/save', { trip: tripPayload, source });
      const data = await res.json();
      console.log('[ItineraryDetail] save response status:', res.status, 'data:', data);
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedItineraryId(data.id);
      setItinerarySaveState('saved');
      console.log('[ItineraryDetail] trip saved, tripId:', data.id, data.deduplicated ? '(deduplicated)' : '(new)');
      return data.id;
    } catch (err) {
      console.error('[ItineraryDetail] save failed:', err.message);
      setItinerarySaveState('error');
      return null;
    }
  }

  // Passed to FreeSidebar: save as FREE_JOURNEY then download PDF.
  async function handleFreeDownload() {
    console.log('[ItineraryDetail] Download Free clicked — isLoaded:', isLoaded, 'isSignedIn:', isSignedIn);
    if (isLoaded && isSignedIn) {
      const tripId = await ensureItinerarySaved('FREE_JOURNEY');
      if (!tripId) {
        console.error('[ItineraryDetail] auto-save failed — aborting download');
        throw new Error('Could not save trip — please try again.');
      }
      api.post(`/api/trips/${tripId}`, {
        eventType: 'DOWNLOADED',
        metadata:  { source: 'free_itinerary', destination: itinerary.title },
      }).catch(err => console.warn('[ItineraryDetail] audit failed:', err.message));
    } else if (!isLoaded) {
      console.warn('[ItineraryDetail] Clerk not loaded — proceeding without save');
    } else {
      console.log('[ItineraryDetail] not signed in — proceeding without save');
    }
    console.log('[ItineraryDetail] proceeding with PDF generation (free)');
    await downloadItineraryPDF(itinerary);
  }

  // Passed to UnlockedSidebar: save as PREMIUM_JOURNEY then download.
  async function handlePremiumDownload() {
    console.log('[ItineraryDetail] Download PDF (premium) clicked — isLoaded:', isLoaded, 'isSignedIn:', isSignedIn);
    if (isLoaded && isSignedIn) {
      const tripId = await ensureItinerarySaved('PREMIUM_JOURNEY');
      if (!tripId) {
        console.error('[ItineraryDetail] premium auto-save failed — aborting download');
        throw new Error('Could not save trip — please try again.');
      }
      api.post(`/api/trips/${tripId}`, {
        eventType: 'DOWNLOADED',
        metadata:  { source: 'premium_itinerary', destination: itinerary.title },
      }).catch(err => console.warn('[ItineraryDetail] premium audit failed:', err.message));
    }
    // Actual file delivery: open hosted PDF or generate client-side
    if (pdfUrl) {
      console.log('[ItineraryDetail] opening pdfUrl:', pdfUrl);
      window.open(pdfUrl, '_blank', 'noopener,noreferrer');
    } else {
      console.log('[ItineraryDetail] generating PDF client-side (premium)');
      await downloadItineraryPDF(itinerary);
    }
  }

  // Unified buy handler: sign in first if needed, then go to Stripe
  function handleBuyClick() {
    if (!itinerary || purchasing) return;
    if (!isSignedIn) {
      sessionStorage.setItem(PENDING_KEY, itinerary.id);
      openSignIn({ afterSignInUrl: window.location.href, afterSignUpUrl: window.location.href });
      return;
    }
    handlePurchase();
  }

  if (!itinerary) {
    return (
      <div style={{ padding: '120px 24px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '32px', marginBottom: '16px' }}>
          Itinerary not found
        </h1>
        <Link to="/itineraries" style={{ color: '#1B6B65', fontWeight: '600' }}>← Back to Itineraries</Link>
      </div>
    );
  }

  const {
    title, subtitle, country, region, duration, groupSize, price,
    image, coverImage, highlights, description, bestFor, difficulty,
    days = [], whySpecial, routeOverview,
  } = itinerary;

  const hasAccess = accessState === 'unlocked';

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{ position: 'relative', height: 'clamp(400px, 55vw, 600px)', overflow: 'hidden' }}>
        <img
          src={coverImage || image}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=1600&q=80'; }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(14,61,57,0.85) 0%, rgba(14,61,57,0.2) 60%, transparent 100%)',
        }} />
        <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, padding: '0 24px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Link to="/itineraries" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>Itineraries</Link>
              <ChevronRight size={12} color="rgba(255,255,255,0.5)" />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{country}</span>
            </div>
            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 'clamp(28px, 4vw, 52px)',
              fontWeight: '600', color: 'white',
              lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '8px',
            }}>
              {title}
            </h1>
            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.75)' }}>{subtitle}</p>
            <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
              {[[MapPin, region], [Clock, duration], [Users, groupSize]].map(([Icon, text], i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                  <Icon size={14} />{text}
                </span>
              ))}
              {/* Unlocked badge on hero */}
              {hasAccess && isPremium && (
                <span style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '4px 12px', borderRadius: '3px',
                  background: 'rgba(201,169,110,0.25)', border: '1px solid rgba(201,169,110,0.5)',
                  fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px',
                  color: '#C9A96E', textTransform: 'uppercase',
                }}>
                  <Check size={11} strokeWidth={3} /> Unlocked
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '60px 24px' }}>
        <div className="resp-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '64px', alignItems: 'start' }}>

          {/* ── Left: Content ── */}
          <div>

            {/* Overview */}
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>
                Overview
              </h2>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8' }}>{description}</p>
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '24px' }}>
                {bestFor.map(tag => (
                  <span key={tag} style={{ padding: '6px 14px', borderRadius: '3px', background: '#EFF6F5', color: '#1B6B65', fontSize: '12px', fontWeight: '600', letterSpacing: '0.5px' }}>
                    {tag}
                  </span>
                ))}
                <span style={{ padding: '6px 14px', borderRadius: '3px', background: '#F4F1EC', color: '#6B6156', fontSize: '12px', fontWeight: '600' }}>
                  {difficulty} Pace
                </span>
              </div>
            </section>

            {/* Highlights */}
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '24px' }}>
                Trip Highlights
              </h2>
              <div className="resp-highlights-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {highlights.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#EFF6F5', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Star size={11} color="#1B6B65" fill="#1B6B65" />
                    </div>
                    <span style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.5' }}>{h}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Day by Day */}
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '32px' }}>
                Day by Day
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {days.map((day, i) => {
                  // Free itineraries: all unlocked
                  // Premium + no access: blur from day 3 onwards (show 2 as preview)
                  // Premium + access: all unlocked
                  const isLocked = isPremium && !hasAccess && i >= 2;
                  return (
                    <DayEntry
                      key={i}
                      day={day}
                      index={i}
                      isLocked={isLocked}
                      isLast={i === days.length - 1}
                    />
                  );
                })}
              </div>

              {/* Lock gate — shown below the preview days */}
              {isPremium && !hasAccess && (
                <div style={{ background: 'linear-gradient(to bottom, rgba(250,250,248,0) 0%, #FAFAF8 30%)', marginTop: '-60px', paddingTop: '60px', position: 'relative' }}>
                  <div style={{ background: 'white', borderRadius: '10px', padding: '36px', textAlign: 'center', border: '1px solid #E8E3DA', boxShadow: '0 4px 24px rgba(28,26,22,0.06)' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <Lock size={20} color="#8C8070" />
                    </div>
                    <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
                      Unlock the full {duration} itinerary
                    </h3>
                    <p style={{ fontSize: '15px', color: '#6B6156', maxWidth: '400px', margin: '0 auto 24px', lineHeight: '1.7' }}>
                      Get every day, every recommendation, logistics, insider tips and the PDF — all for a one-time fee.
                    </p>

                    {accessState === 'unauthenticated' ? (
                      <SignInButton mode="modal">
                        <button style={{ padding: '15px 40px', background: '#1B6B65', color: 'white', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', cursor: 'pointer' }}>
                          Sign in to Unlock
                        </button>
                      </SignInButton>
                    ) : (
                      <button
                        onClick={handlePurchase}
                        disabled={purchasing}
                        style={{ padding: '15px 40px', background: purchasing ? '#8C8070' : '#C9A96E', color: 'white', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', cursor: purchasing ? 'wait' : 'pointer', transition: 'background 0.2s' }}
                      >
                        {purchasing ? 'Processing…' : `Unlock for €${price}`}
                      </button>
                    )}
                    {purchaseError && <p style={{ fontSize: '13px', color: '#B04040', marginTop: '12px' }}>{purchaseError}</p>}
                  </div>
                </div>
              )}
            </section>

            {/* Why This Journey Is Special */}
            {whySpecial && (hasAccess || !isPremium) && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>
                  Why This Journey Is Special
                </h2>
                <div style={{ borderLeft: '3px solid #C9A96E', paddingLeft: '24px' }}>
                  <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.85', fontStyle: 'italic' }}>
                    {whySpecial}
                  </p>
                </div>
              </section>
            )}

            {/* Route Overview */}
            {routeOverview && (hasAccess || !isPremium) && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                  Route Overview
                </h2>
                <div style={{ background: '#EFF6F5', borderRadius: '8px', padding: '24px 28px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#1B6B65', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Route size={16} color="white" />
                  </div>
                  <p style={{ fontSize: '15px', color: '#2C5F5A', lineHeight: '1.7', fontWeight: '500' }}>
                    {routeOverview}
                  </p>
                </div>
              </section>
            )}

          </div>

          {/* ── Right: Sidebar ── */}
          <div className="resp-sidebar" style={{ position: 'sticky', top: '100px' }}>
            {(accessState === 'checking' || accessState === 'verifying') && (
              <div style={{ height: '200px', background: 'white', borderRadius: '12px', border: '1px solid #E8E3DA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <p style={{ fontSize: '13px', color: '#9C9488' }}>
                  {accessState === 'verifying' ? 'Confirming payment…' : ''}
                </p>
              </div>
            )}
            {accessState === 'locked' && (
              <LockedSidebar
                itinerary={itinerary}
                onBuy={handleBuyClick}
                purchasing={purchasing}
              />
            )}
            {accessState === 'unlocked' && (
              isPremium
                ? <UnlockedSidebar itinerary={itinerary} onDownload={handlePremiumDownload} />
                : (
                  // Free itinerary — download sidebar with auth-aware save
                  <FreeSidebar itinerary={itinerary} onDownload={handleFreeDownload} />
                )
            )}
          </div>

        </div>
      </div>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Free itinerary sidebar (unchanged flow)
// ─────────────────────────────────────────────────────────────
function FreeSidebar({ itinerary, onDownload }) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const { included = [] } = itinerary;

  async function handleDownload() {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      // onDownload handles auth check + save + PDF generation
      await onDownload();
    } catch (err) {
      console.error('[FreeSidebar] download error:', err.message);
      setDownloadError(err.message || 'PDF generation failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div style={{
      background: 'white', border: '1px solid #E8E3DA',
      borderRadius: '12px', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(28,26,22,0.08)',
    }}>
      <div style={{ background: '#EFF6F5', padding: '28px' }}>
        <div style={{ fontSize: '28px', fontWeight: '700', color: '#1B6B65', fontFamily: "'Playfair Display', Georgia, serif" }}>Free</div>
        <p style={{ fontSize: '13px', color: '#4A433A', marginTop: '4px' }}>No account required</p>
      </div>
      <div style={{ padding: '28px' }}>
        {included.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
            {included.map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <Check size={14} color="#1B6B65" style={{ flexShrink: 0, marginTop: '2px' }} strokeWidth={2.5} />
                <span style={{ fontSize: '13px', color: '#4A433A', lineHeight: '1.5' }}>{item}</span>
              </div>
            ))}
          </div>
        )}
        <button
          onClick={handleDownload}
          disabled={downloading}
          style={{
            width: '100%', padding: '16px',
            background: downloading ? '#4A9E98' : '#1B6B65',
            color: 'white', border: 'none', borderRadius: '4px',
            fontSize: '14px', fontWeight: '600',
            letterSpacing: '0.5px', textTransform: 'uppercase',
            cursor: downloading ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginBottom: '12px', transition: 'background 0.2s',
          }}
        >
          <Download size={15} />
          {downloading ? 'Preparing PDF…' : 'Download Free'}
        </button>
        {downloadError && (
          <p style={{ fontSize: '12px', color: '#B04040', textAlign: 'center', margin: '-4px 0 12px' }}>{downloadError}</p>
        )}
        <Link
          to="/custom"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            width: '100%', padding: '12px',
            border: '1px solid #E8E3DA', borderRadius: '4px',
            fontSize: '13px', fontWeight: '600', color: '#4A433A',
            textDecoration: 'none',
          }}
        >
          Customize This Route <ArrowRight size={13} />
        </Link>
        <p style={{ fontSize: '12px', color: '#B5AA99', textAlign: 'center', marginTop: '16px' }}>
          Or <Link to="/custom" style={{ color: '#1B6B65', fontWeight: '600' }}>build a custom trip</Link> from scratch
        </p>
      </div>
    </div>
  );
}
