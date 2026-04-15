import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useSearchParams, useNavigate } from 'react-router-dom';
import { Clock, Users, MapPin, Check, Star, ArrowRight, Lock, Download, ChevronRight, Route, Train, Bus, Shuffle } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useUserCtx } from '../lib/useUserCtx.jsx';
import { itineraries } from '../data/itineraries';
import { downloadItineraryPDF } from '../utils/downloadPDF';
import { useSEO } from '../hooks/useSEO';
import { useApi } from '../lib/api';
import { getGalleryImages, getResearchImages, getDayImage, getCoverImage, getMapImage } from '../lib/itineraryImages';
import { useTrack } from '../hooks/useTrack';
import JapanRouteMap from '../components/JapanRouteMap';
import MoroccoRouteMap from '../components/MoroccoRouteMap';
import PhilippinesRouteMap from '../components/PhilippinesRouteMap';
import AmericanWestRouteMap from '../components/AmericanWestRouteMap';
import AmericanWest12DaysRouteMap from '../components/AmericanWest12DaysRouteMap';
import AmericanWest8DaysRouteMap from '../components/AmericanWest8DaysRouteMap';

// ─────────────────────────────────────────────────────────────
// DB + filesystem asset merge
// DB-sourced assets take priority; filesystem fills the rest.
// ─────────────────────────────────────────────────────────────
function mergeAssets(fsImages, dbAssets, type) {
  const dbOfType = dbAssets
    .filter(a => a.assetType === type)
    .map(a => ({ src: a.url, filename: a.alt || a.url.split('/').pop() }));
  const dbUrls = new Set(dbOfType.map(a => a.src));
  const fsFiltered = fsImages.filter(img => !dbUrls.has(img.src));
  return [...dbOfType, ...fsFiltered];
}

const ROUTE_MAP_COMPONENTS = {
  'japan-grand-cultural-journey': JapanRouteMap,
  'morocco-motorcycle-expedition': MoroccoRouteMap,
  'philippines-island-journey': PhilippinesRouteMap,
  'california-american-west': AmericanWestRouteMap,
  'california-american-west-16-days': AmericanWestRouteMap,
  'california-american-west-12-days': AmericanWest12DaysRouteMap,
  'california-american-west-8-days': AmericanWest8DaysRouteMap,
};

// ─────────────────────────────────────────────────────────────
// Sidebar — locked state
// ─────────────────────────────────────────────────────────────
function LockedSidebar({ itinerary, onBuy, purchasing, purchaseError }) {
  const { price } = itinerary;
  const allFeatures = [
    'Save 20+ hours of travel planning',
    'Complete day-by-day travel itinerary',
    'Carefully structured route across the destination',
    'Cultural highlights and key places to visit',
    'Practical travel framework for your trip',
    'Digital guide + downloadable PDF',
  ];
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
          {purchasing ? 'Processing…' : `Buy itinerary · €${price}`}
        </button>

        {purchaseError && (
          <p style={{ fontSize: '12px', color: '#B04040', textAlign: 'center', marginBottom: '8px' }}>
            {purchaseError}
          </p>
        )}
        <p style={{ fontSize: '12px', color: '#9C9488', textAlign: 'center', marginBottom: '4px' }}>
          Instant access after purchase
        </p>
        <p style={{ fontSize: '11px', color: '#B5AA99', textAlign: 'center', lineHeight: '1.6', marginBottom: '16px' }}>
          By completing this purchase you agree to the{' '}
          <Link to="/terms" style={{ color: '#9C9488', textDecoration: 'underline' }}>Terms of Service</Link>
          {' '}and acknowledge that digital content is delivered immediately and is non-refundable once accessed.
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
    <div id={`day-${day.day}`} style={{ display: 'flex', gap: '24px', position: 'relative' }}>
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
  const { isAdmin } = useUserCtx();
  const { track } = useTrack();
const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [accessState, setAccessState] = useState('checking'); // 'checking' | 'locked' | 'unlocked' | 'unauthenticated' | 'verifying'
  const [pdfUrl, setPdfUrl]           = useState(null);
  const [purchasing, setPurchasing]   = useState(false);
  const [purchaseError, setPurchaseError] = useState(null);
  const [creator, setCreator]         = useState(null); // creator profile for this itinerary

  // Session-scoped dedup: save this itinerary at most once per page load
  const [savedItineraryId, setSavedItineraryId]       = useState(null);
  const [itinerarySaveState, setItinerarySaveState]   = useState('idle'); // 'idle'|'saving'|'saved'|'error'
  const [dbAssets, setDbAssets]                       = useState([]);
  const [dbDays, setDbDays]                           = useState(null);

  const isPremium = itinerary?.isPremium;

  // ── SEO ───────────────────────────────────────────────────────────────────
  const HA_DOMAIN = 'https://hiddenatlas.travel';
  const seoTitle = itinerary
    ? `${itinerary.title}${itinerary.subtitle ? ': ' + itinerary.subtitle : ''}`
    : null;
  const seoDescription = itinerary?.shortDescription || null;
  const seoImage = itinerary?.image || null;
  const seoCanonical = itinerary ? `${HA_DOMAIN}/itineraries/${itinerary.id}` : null;
  const seoSchemas = itinerary ? [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: `${HA_DOMAIN}/` },
        { '@type': 'ListItem', position: 2, name: 'Itineraries', item: `${HA_DOMAIN}/itineraries` },
        { '@type': 'ListItem', position: 3, name: seoTitle, item: seoCanonical },
      ],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: seoTitle,
      description: seoDescription,
      image: seoImage,
      brand: { '@type': 'Brand', name: 'HiddenAtlas' },
      offers: {
        '@type': 'Offer',
        price: String(itinerary.price),
        priceCurrency: 'EUR',
        availability: 'https://schema.org/InStock',
        url: seoCanonical,
      },
    },
  ] : [];
  useSEO({
    title: seoTitle,
    description: seoDescription,
    canonical: seoCanonical,
    ogImage: seoImage,
    schemas: seoSchemas,
  });
  // ─────────────────────────────────────────────────────────────────────────

  // Load creator attribution for this itinerary
  useEffect(() => {
    const slug = itinerary?.parentId || itinerary?.id;
    if (!slug) return;
    fetch('/api/itineraries?action=creator-map')
      .then(r => r.ok ? r.json() : { creators: {} })
      .then(data => { const c = data.creators?.[slug]; if (c) setCreator(c); })
      .catch(() => {});
  }, [itinerary?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load published day content from DB — overrides static itineraries.js data.
  // Falls back silently to static data if the itinerary is not yet in the DB
  // or is still in draft status.
  useEffect(() => {
    const slug = itinerary?.parentId || itinerary?.id;
    if (!slug) return;
    fetch(`/api/itineraries?action=content&slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.days?.length) setDbDays(data.days); })
      .catch(() => {}); // silent — static data remains active
  }, [itinerary?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load DB-backed assets for this itinerary (blob uploads, manually added URLs)
  useEffect(() => {
    const slug = itinerary?.parentId || itinerary?.id;
    if (!slug) return;
    fetch(`/api/itineraries?action=assets&slug=${encodeURIComponent(slug)}`)
      .then(r => r.json())
      .then(data => {
        if (data.assets) {
          console.log('[ItineraryDetailPage] DB assets loaded:', data.assets.length, data.assets.map(a => a.assetType));
          setDbAssets(data.assets);
        }
      })
      .catch(err => console.warn('[ItineraryDetailPage] Failed to load DB assets:', err));
  }, [itinerary?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fire ITINERARY_VIEW once when a valid itinerary page loads
  useEffect(() => {
    if (itinerary?.id) {
      track('ITINERARY_VIEW', { itinerarySlug: itinerary.id, pagePath: `/itineraries/${id}` });
    }
  }, [itinerary?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile sticky buy bar — watch both the sidebar and the inline lock gate.
  // Bar is visible when neither purchase element is in the viewport.
  const sidebarRef  = useRef(null);
  const lockGateRef = useRef(null);
  const [purchaseInView, setPurchaseInView] = useState(false);

  useEffect(() => {
    if (accessState !== 'locked' || !isPremium) { setPurchaseInView(false); return; }
    const targets = [sidebarRef.current, lockGateRef.current].filter(Boolean);
    if (!targets.length) return;
    const visibilityMap = new Map(targets.map(t => [t, false]));
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => visibilityMap.set(e.target, e.isIntersecting));
      setPurchaseInView([...visibilityMap.values()].some(Boolean));
    }, { threshold: 0.1 });
    targets.forEach(t => observer.observe(t));
    return () => observer.disconnect();
  }, [accessState, isPremium]);

  const showStickyBar = isPremium && accessState === 'locked' && !purchaseInView;
  const PENDING_KEY = 'ha_pending_purchase';

  useEffect(() => {
    if (!itinerary || !isLoaded) return;
    if (!isPremium) { setAccessState('unlocked'); return; }

    // Admins always have full access — no purchase required
    if (isAdmin) { setAccessState('unlocked'); return; }

    if (!isSignedIn) { setAccessState('locked'); return; }

    api.get(`/api/itineraries?action=access&slug=${itinerary.id}`)
      .then(res => res.ok ? res.json() : { hasAccess: false, pdfUrl: null })
      .then(({ hasAccess, pdfUrl }) => {
        setAccessState(hasAccess ? 'unlocked' : 'locked');
        setPdfUrl(pdfUrl);
      })
      .catch(() => setAccessState('locked'));
  }, [itinerary?.id, isLoaded, isSignedIn, isAdmin]);

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
    api.post('/api/checkout?action=verify', { sessionId })
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
    console.log('[Buy] calling POST /api/checkout/session for slug:', itinerary.id);
    setPurchasing(true);
    setPurchaseError(null);
    try {
      const res = await api.post('/api/checkout?action=session', {
        slug:       itinerary.id,
        variant:    itinerary.variant || 'premium',
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
      itinerarySlug: itinerary.id,
      destination:   itinerary.title,
      country:       itinerary.country     || '',
      duration:      itinerary.duration    || '',
      overview:      itinerary.description || '',
      highlights:    itinerary.highlights  || [],
      hotels:        itinerary.hotels      || [],
      experiences:   itinerary.bestFor     || [],
      days: (itinerary.days || []).map(d => ({
        day:         d.day,
        title:       d.title || '',
        description: d.desc || d.description || '',
      })),
    };

    console.log('[ItineraryDetail] calling POST /api/trips/save — source:', source, '| title:', itinerary.title);
    setItinerarySaveState('saving');
    try {
      const res = await api.post('/api/trips', { trip: tripPayload, source });
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
      api.post(`/api/trips?id=${tripId}`, {
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
      api.post(`/api/trips?id=${tripId}`, {
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
    console.log('[Buy] clicked — itinerary:', itinerary?.id, '| isSignedIn:', isSignedIn, '| purchasing:', purchasing);
    if (!itinerary || purchasing) return;
    if (!isSignedIn) {
      sessionStorage.setItem(PENDING_KEY, itinerary.id);
      navigate('/sign-in');
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
    image, coverImage, highlights, description, shortDescription, bestFor, difficulty,
    days: staticDays = [], nights, whySpecial, routeOverview, transport,
  } = itinerary;

  // DB days take precedence over static bundle — updated by CMS without redeploy.
  // staticDays remains the fallback for itineraries not yet published to the DB.
  const days = dbDays ?? staticDays;

  const hasAccess = accessState === 'unlocked';

  // For variant itineraries (e.g. california-american-west-12-days), assets live
  // in the parent's content folder. Non-variant itineraries use their own id.
  const assetSlug    = itinerary.parentId || itinerary.id;
  const assetVariant = itinerary.variant; // 'premium'|'essential'|'short'|undefined

  const fsGallery      = getGalleryImages(assetSlug, assetVariant);
  const fsResearch     = getResearchImages(assetSlug, assetVariant);
  const galleryImages  = mergeAssets(fsGallery, dbAssets, 'gallery');
  const researchImages = mergeAssets(fsResearch, dbAssets, 'research');
  // DB hero > filesystem hero > Unsplash fallback
  const dbHero     = dbAssets.find(a => a.assetType === 'hero');
  const localCover = dbHero ? dbHero.url : getCoverImage(assetSlug);
  const mapImage   = getMapImage(assetSlug, assetVariant);

  // ── Parent chooser page ───────────────────────────────────────────────────
  if (itinerary.isParent && itinerary.childItineraries) {
    const children = itinerary.childItineraries
      .map(cid => itineraries.find(it => it.id === cid))
      .filter(Boolean);
    const durationDescriptions = {
      'The Complete American West': 'The full American West experience, across city, wilderness, desert and coast.',
      'The Essential American West': 'The defining landscapes of the American West, in their most efficient sequence.',
      'The California Coast': 'A coastal journey shaped by light, ocean and open road.',
    };
    // Extract the distinguishing word from a durationOption title.
    // "The Complete American West" → "Complete", "The California Coast" → "Coast".
    const getVersionLabel = opt => {
      const m = opt.match(/\b(Complete|Essential|Coast|Short|Classic|Full)\b/i);
      return m ? m[1] : opt.split(' ').pop();
    };
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>
        {/* Hero */}
        <section style={{ position: 'relative', height: 'clamp(340px, 45vw, 500px)', overflow: 'hidden' }}>
          <img src={localCover || coverImage || image} alt={title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
            onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = coverImage || image || ''; }}
          />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(14,61,57,0.88) 0%, rgba(14,61,57,0.25) 60%, transparent 100%)' }} />
          <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, padding: '0 24px' }}>
            <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Link to="/itineraries" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>Itineraries</Link>
                <ChevronRight size={12} color="rgba(255,255,255,0.5)" />
                <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{country}</span>
              </div>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: '600', color: 'white', lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '8px' }}>
                {title}
              </h1>
              <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.75)' }}>Choose your journey</p>
            </div>
          </div>
        </section>

        {/* Duration chooser */}
        <div style={{ maxWidth: '1100px', margin: '0 auto', padding: 'clamp(40px,6vw,80px) 24px' }}>
          <div style={{ textAlign: 'center', marginBottom: '48px' }}>
            <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#C9A96E' }}>
              Three versions
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(26px,3.5vw,40px)', fontWeight: '600', color: '#1C1A16', marginTop: '12px', marginBottom: '16px' }}>
              Select the journey that fits your time
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', maxWidth: '520px', margin: '0 auto', lineHeight: '1.7' }}>
              {shortDescription || description}
            </p>
            <p style={{ fontSize: '13px', color: '#9B8E7E', marginTop: '16px', letterSpacing: '0.2px' }}>
              Choose your version — upgrade anytime
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px', alignItems: 'stretch' }}>
            {children.map((child, i) => {
              const isComplete = i === 0;
              // All versions included with this purchase (this tier + all lower tiers).
              const included = children.slice(i).map(c => getVersionLabel(c.durationOption));
              // Sub-label always shown — single-version cards show just their own name.
              const bundleText = included.join(' · ');
              // Value line: communicates the unlock hierarchy.
              let valueText = null;
              if (included.length === children.length && children.length > 1) {
                valueText = 'Unlocks all journey versions';
              } else if (included.length > 1) {
                valueText = 'Shorter version of the full journey';
              }
              return (
                <Link key={child.id} to={`/itineraries/${child.id}`}
                  style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column' }}>
                  <div style={{
                    flex: 1, display: 'flex', flexDirection: 'column',
                    background: 'white', borderRadius: '10px', padding: '32px 28px',
                    border: isComplete ? '2px solid #C9A96E' : '1px solid #E8E3DA',
                    boxShadow: isComplete ? '0 4px 24px rgba(201,169,110,0.15)' : '0 2px 16px rgba(28,26,22,0.06)',
                    position: 'relative',
                  }}>
                    {isComplete && (
                      <>
                        <span style={{
                          position: 'absolute', top: '-12px', left: '24px',
                          background: '#C9A96E', color: 'white', fontSize: '10px', fontWeight: '700',
                          letterSpacing: '1.2px', textTransform: 'uppercase', padding: '3px 10px', borderRadius: '3px',
                        }}>
                          Original Route
                        </span>
                        <span style={{
                          position: 'absolute', top: '-12px', right: '24px',
                          background: '#1B6B65', color: 'white', fontSize: '10px', fontWeight: '700',
                          letterSpacing: '1.2px', textTransform: 'uppercase', padding: '3px 10px', borderRadius: '3px',
                        }}>
                          Most popular
                        </span>
                      </>
                    )}
                    <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '10px' }}>
                      {child.duration}
                    </p>
                    <h3 style={{
                      fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600',
                      color: '#1C1A16', marginBottom: '10px', lineHeight: '1.3',
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      minHeight: '58px',
                    }}>
                      {child.durationOption}
                    </h3>
                    {/* Bundle microcopy — fixed height on all cards to preserve alignment */}
                    <div style={{ minHeight: '22px', marginBottom: '16px' }}>
                      {bundleText && (
                        <span style={{
                          fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px',
                          textTransform: 'uppercase', color: '#9B8E7E',
                        }}>
                          {bundleText}
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontSize: '14px', color: '#6B6156', lineHeight: '1.65', marginBottom: '12px', flex: 1,
                      display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>
                      {durationDescriptions[child.durationOption] || child.shortDescription}
                    </p>
                    {/* Value line — hierarchy reinforcement, reserved height for alignment */}
                    <div style={{ minHeight: '20px', marginBottom: '4px' }}>
                      {valueText && (
                        <span style={{
                          fontSize: '12px', lineHeight: '1.5',
                          color: isComplete ? '#1B6B65' : '#9B8E7E',
                          fontWeight: isComplete ? '600' : '400',
                        }}>
                          {isComplete ? '✓ ' : ''}{valueText}
                        </span>
                      )}
                    </div>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: 'auto', paddingTop: '20px', borderTop: '1px solid #F4F1EC',
                    }}>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: '#1C1A16' }}>
                        €{child.price}
                        {isComplete && (
                          <span style={{ fontSize: '12px', fontWeight: '500', color: '#9B8E7E', marginLeft: '8px' }}>
                            · Best value
                          </span>
                        )}
                      </span>
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        color: isComplete ? '#C9A96E' : '#1B6B65', fontSize: '13px', fontWeight: '600',
                      }}>
                        View itinerary <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{ position: 'relative', height: 'clamp(400px, 55vw, 600px)', overflow: 'hidden' }}>
        <img
          src={localCover}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          onError={e => { e.currentTarget.onerror = null; e.currentTarget.src = coverImage || image || ''; }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(14,61,57,0.85) 0%, rgba(14,61,57,0.2) 60%, transparent 100%)',
        }} />
        <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, padding: '0 24px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <Link to="/itineraries" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>Itineraries</Link>
              <ChevronRight size={12} color="rgba(255,255,255,0.5)" />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{country}</span>
              {creator && (
                <>
                  <ChevronRight size={12} color="rgba(255,255,255,0.5)" />
                  <Link
                    to={`/${creator.slug}`}
                    style={{ display: 'flex', alignItems: 'center', gap: '5px',
                      fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none',
                      transition: 'color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,1)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}
                  >
                    {creator.avatarUrl && (
                      <img src={creator.avatarUrl} alt={creator.name}
                        style={{ width: '18px', height: '18px', borderRadius: '50%', objectFit: 'cover' }}
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                    )}
                    by {creator.name}
                  </Link>
                </>
              )}
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
      <div className="ha-detail-body" style={{ maxWidth: '1280px', margin: '0 auto', padding: '60px 24px' }}>
        <div className="resp-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '64px', alignItems: 'start' }}>

          {/* ── Left: Content ── */}
          <div>

            {/* Duration selector — child itineraries only */}
            {itinerary.parentId && (() => {
              const parent = itineraries.find(it => it.id === itinerary.parentId);
              const siblings = parent?.childItineraries
                ?.map(cid => itineraries.find(it => it.id === cid))
                .filter(Boolean);
              if (!siblings?.length) return null;
              return (
                <section style={{ marginBottom: '48px', paddingBottom: '36px', borderBottom: '1px solid #E8E3DA' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: '#9C9488' }}>
                      Also available in
                    </span>
                    {parent && (
                      <Link to={`/itineraries/${parent.id}`} style={{ fontSize: '12px', color: '#C9A96E', textDecoration: 'none', fontWeight: '500' }}>
                        Compare all versions ›
                      </Link>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    {siblings.map(sib => {
                      const isCurrent = sib.id === itinerary.id;
                      return (
                        <Link key={sib.id} to={`/itineraries/${sib.id}`} style={{ textDecoration: 'none' }}>
                          <div style={{
                            padding: '9px 18px', borderRadius: '5px', cursor: 'pointer',
                            border: isCurrent ? '2px solid #1B6B65' : '1px solid #E8E3DA',
                            background: isCurrent ? '#EFF6F5' : 'white',
                            color: isCurrent ? '#1B6B65' : '#6B6156',
                            fontSize: '13px', fontWeight: isCurrent ? '700' : '500',
                            transition: 'all 0.2s',
                            whiteSpace: 'nowrap',
                          }}>
                            {sib.durationOption}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })()}

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

            {/* Route Map */}
            {(mapImage || ROUTE_MAP_COMPONENTS[itinerary.id]) && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '6px' }}>
                  Route Map
                </h2>
                <p style={{ fontSize: '13px', color: '#8C8070', letterSpacing: '0.3px', marginBottom: '24px' }}>
                  {subtitle}
                </p>
                {ROUTE_MAP_COMPONENTS[itinerary.id] ? (() => {
                  const RouteMapComponent = ROUTE_MAP_COMPONENTS[itinerary.id];
                  return (
                    <RouteMapComponent
                      isUnlocked={hasAccess}
                      onDaySelect={dayNum => {
                        const el = document.getElementById(`day-${dayNum}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                    />
                  );
                })() : (
                  <img
                    src={mapImage}
                    alt={`${title} route map`}
                    style={{ width: '100%', display: 'block', borderRadius: '6px', border: '1px solid #E8E3DA' }}
                  />
                )}
              </section>
            )}

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

            {/* Destination Gallery */}
            {galleryImages.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '24px' }}>
                  The Destination
                </h2>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '8px',
                }}>
                  {galleryImages.map((img, i) => (
                    <div key={i} style={{
                      aspectRatio: i === 0 ? '16/10' : '1/1',
                      gridColumn: i === 0 ? '1 / -1' : 'auto',
                      overflow: 'hidden',
                      borderRadius: '6px',
                    }}>
                      <img
                        src={img.src}
                        alt={`${title} — ${img.filename.replace(/[-_]/g, ' ').replace(/\.\w+$/, '')}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

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
                  // Load day image from day-images/dayN/ subfolder only.
                  // No external URLs. Returns null if folder is empty.
                  const dbDayAsset = dbAssets.find(a => a.assetType === 'day' && a.dayNumber === day.day);
                  // Priority: ItineraryAsset table (blob) → content.days[n].img (CMS) → filesystem
                  const resolvedImg = dbDayAsset?.url || day.img || getDayImage(assetSlug, day.day, assetVariant);
                  return (
                    <DayEntry
                      key={i}
                      day={{ ...day, img: resolvedImg }}
                      index={i}
                      isLocked={isLocked}
                      isLast={i === days.length - 1}
                    />
                  );
                })}
              </div>

              {/* Lock gate — shown below the preview days */}
              {isPremium && !hasAccess && (
                <div ref={lockGateRef} style={{ background: 'linear-gradient(to bottom, rgba(250,250,248,0) 0%, #FAFAF8 30%)', marginTop: '-60px', paddingTop: '60px', position: 'relative' }}>
                  <div style={{ background: 'white', borderRadius: '10px', padding: '36px', textAlign: 'center', border: '1px solid #E8E3DA', boxShadow: '0 4px 24px rgba(28,26,22,0.06)' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                      <Lock size={20} color="#8C8070" />
                    </div>
                    <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
                      Unlock the full {duration} itinerary
                    </h3>
                    <p style={{ fontSize: '15px', color: '#6B6156', maxWidth: '400px', margin: '0 auto 24px', lineHeight: '1.7' }}>
                      Get every day, every recommendation, logistics, insider tips and the PDF, all for a one-time fee.
                    </p>

                    <button
                      onClick={handleBuyClick}
                      disabled={purchasing}
                      style={{ padding: '15px 40px', background: purchasing ? '#8C8070' : '#C9A96E', color: 'white', border: 'none', borderRadius: '4px', fontSize: '14px', fontWeight: '600', letterSpacing: '0.5px', textTransform: 'uppercase', cursor: purchasing ? 'wait' : 'pointer', transition: 'background 0.2s' }}
                    >
                      {purchasing ? 'Processing…' : `Unlock for €${price}`}
                    </button>
                    {purchaseError && <p style={{ fontSize: '13px', color: '#B04040', marginTop: '12px' }}>{purchaseError}</p>}
                    <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '14px', lineHeight: '1.6', maxWidth: '380px', margin: '14px auto 0' }}>
                      By completing this purchase you agree to the{' '}
                      <Link to="/terms" style={{ color: '#9C9488', textDecoration: 'underline' }}>Terms of Service</Link>
                      {' '}and acknowledge that digital content is delivered immediately and is non-refundable once accessed.
                    </p>
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

            {/* Journey Snapshot / Route Overview — hidden for locked premium itineraries */}
            {routeOverview && (hasAccess || !isPremium) && (
              <section style={{ marginBottom: '60px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '20px', marginBottom: '20px', flexWrap: 'wrap' }}>
                  <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', margin: 0 }}>
                    Journey Snapshot
                  </h2>
                  {nights && (
                    <span style={{
                      fontSize: '15px', fontWeight: '600',
                      color: '#1B6B65',
                      letterSpacing: '0.3px',
                    }}>
                      {duration.replace(/\bdays?\b/i, 'Days')} &bull; {nights} Nights
                    </span>
                  )}
                </div>
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

            {/* Transport Between Cities */}
            {transport && (hasAccess || !isPremium) && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '24px' }}>
                  Transport Between Cities
                </h2>

                {/* Luggage tip */}
                <div style={{ background: '#EFF6F5', borderRadius: '8px', padding: '20px 24px', marginBottom: '32px', borderLeft: '4px solid #1B6B65' }}>
                  <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '10px' }}>Insider Tip: Luggage Forwarding</p>
                  <p style={{ fontSize: '15px', color: '#2C5F5A', lineHeight: '1.75' }}>{transport.luggageTip}</p>
                </div>

                {/* Route list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {transport.routes.map((route, i) => {
                    const ModeIcon = route.mode === 'train' ? Train : route.mode === 'bus' ? Bus : Shuffle;
                    const modeColor = route.mode === 'train' ? '#1B6B65' : route.mode === 'bus' ? '#7B5F3A' : '#4A3A7A';
                    const modeBg   = route.mode === 'train' ? '#EFF6F5' : route.mode === 'bus' ? '#F7F2EB' : '#F0EDF8';
                    return (
                      <div key={i} style={{
                        display: 'flex', gap: '16px', alignItems: 'flex-start',
                        paddingTop: '20px', paddingBottom: '20px',
                        borderBottom: i < transport.routes.length - 1 ? '1px solid #E8E3DA' : 'none',
                      }}>
                        {/* Mode icon */}
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: modeBg, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '2px' }}>
                          <ModeIcon size={15} color={modeColor} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', marginBottom: '3px', letterSpacing: '0.2px' }}>{route.segment}</p>
                          <p style={{ fontSize: '14px', color: '#4A433A', marginBottom: '4px' }}>{route.service}</p>
                          <p style={{ fontSize: '13px', color: '#1B6B65', fontWeight: '600', marginBottom: route.notes.length ? '8px' : '0' }}>{route.duration}</p>
                          {route.notes.map((note, ni) => (
                            <p key={ni} style={{ fontSize: '13px', color: '#6B6156', lineHeight: '1.55', marginBottom: ni < route.notes.length - 1 ? '4px' : '0' }}>{note}</p>
                          ))}
                          {route.website && (
                            <a href={route.website} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: '#1B6B65', textDecoration: 'underline', display: 'inline-block', marginTop: '6px' }}>{route.website}</a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Researched on Location */}
            {researchImages.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <div style={{
                  background: '#F4F1EC',
                  borderRadius: '10px',
                  padding: '36px',
                }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '700', letterSpacing: '2px',
                    textTransform: 'uppercase', color: '#1B6B65',
                    display: 'block', marginBottom: '12px',
                  }}>
                    Researched on location
                  </span>
                  <p style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.7', maxWidth: '520px', marginBottom: '28px' }}>
                    This itinerary was developed during our own visit to {title}, based on first-hand exploration of its neighbourhoods, landmarks and local experiences.
                  </p>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${Math.min(researchImages.length, 3)}, 1fr)`,
                    gap: '8px',
                  }}>
                    {researchImages.map((img, i) => (
                      <div key={i} style={{ aspectRatio: '4/3', overflow: 'hidden', borderRadius: '6px' }}>
                        <img
                          src={img.src}
                          alt={`On location — ${title}`}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

          </div>

          {/* ── Right: Sidebar ── */}
          <div ref={sidebarRef} className="resp-sidebar" style={{ position: 'sticky', top: '100px' }}>
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
                purchaseError={purchaseError}
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

      {/* Mobile sticky buy bar — hidden on desktop via media query */}
      <MobileStickyBuyBar
        price={price}
        onBuy={handleBuyClick}
        purchasing={purchasing}
        visible={showStickyBar}
      />

      <style>{`
        @media (min-width: 768px) {
          .ha-mobile-buy-bar { display: none !important; }
        }
        @media (max-width: 767px) {
          .ha-detail-body { padding-bottom: calc(90px + env(safe-area-inset-bottom, 0px)) !important; }
        }
      `}</style>

    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Mobile sticky buy bar
// ─────────────────────────────────────────────────────────────
function MobileStickyBuyBar({ price, onBuy, purchasing, visible }) {
  return (
    <div
      className="ha-mobile-buy-bar"
      style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'white',
        borderTop: '1px solid rgba(0,0,0,0.08)',
        paddingTop: '14px',
        paddingLeft: '20px',
        paddingRight: '20px',
        paddingBottom: 'calc(14px + env(safe-area-inset-bottom, 0px))',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        boxShadow: '0 -4px 24px rgba(28,26,22,0.08)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(100%)',
        transition: 'opacity 0.3s ease, transform 0.3s ease',
        pointerEvents: visible ? 'auto' : 'none',
        willChange: 'transform',
      }}
    >
      <div>
        <div style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '20px', fontWeight: '700',
          color: '#1C1A16', lineHeight: '1.2',
        }}>
          €{price}
        </div>
        <p style={{ fontSize: '11px', color: '#9C9488', letterSpacing: '0.2px', marginTop: '2px' }}>
          Instant access · PDF included
        </p>
      </div>
      <button
        onClick={onBuy}
        disabled={purchasing}
        style={{
          padding: '13px 24px',
          background: purchasing ? '#8C8070' : '#C9A96E',
          color: 'white', border: 'none', borderRadius: '4px',
          fontSize: '13px', fontWeight: '700', letterSpacing: '0.3px',
          cursor: purchasing ? 'wait' : 'pointer',
          whiteSpace: 'nowrap', flexShrink: 0,
          transition: 'background 0.2s',
        }}
        onMouseEnter={e => { if (!purchasing) e.currentTarget.style.background = '#B8943A'; }}
        onMouseLeave={e => { if (!purchasing) e.currentTarget.style.background = '#C9A96E'; }}
      >
        {purchasing ? 'Processing…' : 'Buy itinerary'}
      </button>
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
