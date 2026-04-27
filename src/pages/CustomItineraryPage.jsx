import { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Download, MapPin, Clock, Lock, ChevronRight,
  Star, FileText, Users, Check, ArrowRight, Route,
} from 'lucide-react';
import { resolveCoverImage } from '../lib/resolveCoverImage';
import { useSEO } from '../hooks/useSEO';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function parseContent(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw;
}

// Normalise DB asset rows to the {src, filename} shape used by the gallery
function assetsToImages(dbAssets, type) {
  return dbAssets
    .filter(a => a.assetType === type)
    .map(a => ({ src: a.url, filename: a.alt || a.url.split('/').pop() }));
}

// ─────────────────────────────────────────────────────────────
// DayEntry — identical to ItineraryDetailPage, always unlocked
// ─────────────────────────────────────────────────────────────
function DayEntry({ day, isLast }) {
  return (
    <div id={`day-${day.day}`} style={{ display: 'flex', gap: '24px', position: 'relative' }}>
      {/* Timeline dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: '#1B6B65', color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: '600', flexShrink: 0, zIndex: 1,
        }}>
          {day.day}
        </div>
        {!isLast && (
          <div style={{ width: '1px', flex: 1, background: '#E8E3DA', minHeight: '24px' }} />
        )}
      </div>

      {/* Content */}
      <div style={{ paddingBottom: '40px', flex: 1 }}>
        <p style={{
          fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px',
          textTransform: 'uppercase', color: '#1B6B65', marginBottom: '6px',
        }}>
          Day {day.day}
        </p>
        <h3 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '10px',
        }}>
          {day.title}
        </h3>
        <p style={{
          fontSize: '15px', color: '#6B6156', lineHeight: '1.7',
          marginBottom: day.bullets?.length ? '16px' : '0',
        }}>
          {day.desc || day.description}
        </p>

        {day.bullets?.length > 0 && (
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {day.bullets.map((bullet, bi) => (
              <li key={bi} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <span style={{
                  width: '5px', height: '5px', borderRadius: '50%',
                  background: '#C9A96E', flexShrink: 0, marginTop: '8px',
                }} />
                <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.6' }}>{bullet}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Insider tip */}
        {day.tip && (
          <div style={{
            marginTop: '14px', padding: '14px 18px',
            background: '#F4F1EC', borderRadius: '6px',
            borderLeft: '3px solid #C9A96E',
          }}>
            <p style={{
              fontSize: '11px', fontWeight: '700', letterSpacing: '1.2px',
              textTransform: 'uppercase', color: '#C9A96E', marginBottom: '4px',
            }}>
              Insider Tip
            </p>
            <p style={{ fontSize: '13.5px', color: '#4A433A', lineHeight: '1.6', margin: 0 }}>
              {day.tip}
            </p>
          </div>
        )}

        {day.img && (
          <img
            src={day.img} alt={day.title}
            style={{
              marginTop: '16px', width: '100%',
              maxWidth: '480px', height: '220px',
              objectFit: 'cover', borderRadius: '6px', display: 'block',
            }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Custom sidebar — "Your Journey" + PDF download
// ─────────────────────────────────────────────────────────────
function CustomSidebar({ itinerary, days, durationStr, pdfState, pdfError, onDownload }) {
  const pdfLabel = pdfState === 'generating' ? 'Generating PDF…'
    : pdfState === 'done'  ? 'Downloaded!'
    : pdfState === 'error' ? 'PDF failed — retry'
    : 'Download PDF';

  return (
    <div style={{
      background: 'white', border: '1px solid #E8E3DA',
      borderRadius: '12px', overflow: 'hidden',
      boxShadow: '0 8px 40px rgba(28,26,22,0.08)',
    }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #0E3D39, #1B6B65)', padding: '28px' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          padding: '5px 12px', borderRadius: '3px',
          background: 'rgba(201,169,110,0.2)', border: '1px solid rgba(201,169,110,0.4)',
          marginBottom: '12px',
        }}>
          <span style={{
            fontSize: '10px', fontWeight: '700', letterSpacing: '1px',
            color: '#C9A96E', textTransform: 'uppercase',
          }}>
            Your Journey
          </span>
        </div>
        <div style={{
          fontSize: '22px', fontWeight: '600', color: 'white',
          fontFamily: "'Playfair Display', Georgia, serif", lineHeight: '1.3',
        }}>
          Custom itinerary<br />built for you
        </div>
        {durationStr && (
          <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.55)', marginTop: '6px' }}>
            {durationStr} · Private access
          </p>
        )}
      </div>

      <div style={{ padding: '24px' }}>
        {/* Metadata */}
        {(itinerary.country || durationStr || days.length > 0) && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '8px',
            marginBottom: '20px', padding: '14px',
            background: '#F4F1EC', borderRadius: '8px',
          }}>
            {itinerary.country && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4A433A' }}>
                <MapPin size={13} color="#1B6B65" /> {itinerary.country}
              </div>
            )}
            {durationStr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4A433A' }}>
                <Clock size={13} color="#1B6B65" /> {durationStr}
              </div>
            )}
            {days.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#4A433A' }}>
                <FileText size={13} color="#1B6B65" /> {days.length} days planned
              </div>
            )}
          </div>
        )}

        {/* PDF download */}
        <button
          onClick={onDownload}
          disabled={pdfState === 'generating'}
          style={{
            width: '100%', padding: '16px',
            background: pdfState === 'error' ? '#C0392B'
              : pdfState === 'done' ? '#1B6B65'
              : '#C9A96E',
            color: 'white', border: 'none', borderRadius: '4px',
            fontSize: '14px', fontWeight: '700', letterSpacing: '0.3px',
            cursor: pdfState === 'generating' ? 'wait' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            transition: 'background 0.2s', marginBottom: '12px',
          }}
          onMouseEnter={e => { if (pdfState === 'idle') e.currentTarget.style.background = '#B8943A'; }}
          onMouseLeave={e => { if (pdfState === 'idle') e.currentTarget.style.background = '#C9A96E'; }}
        >
          <Download size={15} />
          {pdfLabel}
        </button>

        {pdfState === 'error' && pdfError && (
          <p style={{
            fontSize: '11.5px', color: '#B04040', lineHeight: '1.5',
            marginBottom: '12px', padding: '8px 10px',
            background: '#FDF3F3', borderRadius: '4px', border: '1px solid #F5C6C6',
          }}>
            {pdfError}
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

        <p style={{
          fontSize: '11.5px', color: '#B5AA99',
          textAlign: 'center', lineHeight: '1.6', marginTop: '12px',
        }}>
          This itinerary is private and only accessible to you.
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function CustomItineraryPage() {
  useSEO({ title: 'Your Custom Itinerary', noindex: true });
  const { slug }       = useParams();
  const [searchParams] = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const isPreview = searchParams.get('preview') === 'true';

  const [itinerary,  setItinerary]  = useState(null);
  const [dbAssets,   setDbAssets]   = useState([]);
  const [pageStatus, setPageStatus] = useState('loading');
  const [errorMsg,   setErrorMsg]   = useState('');
  const [pdfState,   setPdfState]   = useState('idle'); // idle | generating | done | error
  const [pdfError,   setPdfError]   = useState('');    // human-readable error from last failure

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setPageStatus('unauthorized'); return; }

    getToken()
      .then(token =>
        fetch(
          `/api/itineraries?action=custom&slug=${encodeURIComponent(slug)}${isPreview ? '&preview=true' : ''}`,
          { headers: { Authorization: `Bearer ${token}` } },
        )
      )
      .then(async r => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load itinerary');
        return data;
      })
      .then(data => {
        setItinerary(data.itinerary);
        setDbAssets(data.assets || []);
        setPageStatus('ok');
      })
      .catch(err => {
        setErrorMsg(err.message);
        setPageStatus('error');
      });
  }, [isLoaded, isSignedIn, slug, isPreview]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDownloadPDF() {
    if (!itinerary) return;
    if (itinerary.pdfUrl) {
      window.open(itinerary.pdfUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    setPdfState('generating');
    setPdfError('');
    try {
      const { downloadCustomPDF } = await import('../utils/buildCustomPDF');
      await downloadCustomPDF(itinerary, dbAssets);
      setPdfState('done');
      setTimeout(() => setPdfState('idle'), 3000);
    } catch (err) {
      console.error('[CustomItineraryPage] PDF generation failed:', err);
      const msg = err?.message || String(err) || 'Unknown error';
      setPdfError(msg);
      setPdfState('error');
      setTimeout(() => setPdfState('idle'), 6000);
    }
  }

  // ── Loading / auth states ───────────────────────────────────
  if (pageStatus === 'loading' || !isLoaded) {
    return (
      <div style={{
        background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <p style={{ fontSize: '15px', color: '#9C9488' }}>Loading your itinerary…</p>
      </div>
    );
  }

  if (pageStatus === 'unauthorized') {
    return (
      <div style={{
        background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <Lock size={32} color="#8C8070" style={{ marginBottom: '20px' }} />
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '24px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px',
          }}>
            Sign in to view your itinerary
          </h2>
          <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7', marginBottom: '28px' }}>
            Your custom itinerary is private and requires authentication.
          </p>
          <Link to="/sign-in" style={{
            padding: '13px 32px', background: '#1B6B65', color: 'white',
            borderRadius: '4px', fontSize: '14px', fontWeight: '600',
            letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none',
          }}>
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (pageStatus === 'error') {
    return (
      <div style={{
        background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <Lock size={32} color="#8C8070" style={{ marginBottom: '20px' }} />
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '24px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px',
          }}>
            {errorMsg.includes('Access') || errorMsg.includes('not have') ? 'Access denied' : 'Itinerary not found'}
          </h2>
          <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7', marginBottom: '28px' }}>
            {errorMsg}
          </p>
          <Link to="/my-trips" style={{
            padding: '13px 32px', background: '#1B6B65', color: 'white',
            borderRadius: '4px', fontSize: '14px', fontWeight: '600',
            letterSpacing: '0.5px', textTransform: 'uppercase', textDecoration: 'none',
          }}>
            My Trips
          </Link>
        </div>
      </div>
    );
  }

  // ── Derive content ───────────────────────────────────────────
  const content    = parseContent(itinerary.content);
  const summary    = content.summary || {};
  const tripFacts  = content.tripFacts || {};

  const description  = summary.shortDescription || itinerary.description || '';
  const highlights   = summary.highlights  || content.highlights  || [];
  const whySpecial   = summary.whySpecial  || content.whySpecial  || '';
  const routeOverview = summary.routeOverview || content.routeOverview || '';
  const bestFor      = tripFacts.bestFor   || [];
  const groupSize    = tripFacts.groupSize  || '';

  const durationStr = itinerary.durationDays
    ? `${itinerary.durationDays} Day${itinerary.durationDays !== 1 ? 's' : ''}`
    : '';

  // Scalar coverImage may not be set on older records — fall back to content.hero.coverImage
  const rawCoverImage = itinerary.coverImage || content.hero?.coverImage || '';
  const coverSrc = resolveCoverImage(rawCoverImage, itinerary.slug);

  // Inject DB day images into each day (DB asset takes priority over inline img)
  const days = (content.days || []).map(day => {
    const dbAsset = dbAssets.find(
      a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day),
    );
    return { ...day, img: dbAsset?.url || day.img || null };
  });

  // Normalise DB assets to {src, filename} for gallery/research sections
  const galleryImages  = assetsToImages(dbAssets, 'gallery');
  const researchImages = assetsToImages(dbAssets, 'research');

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Preview banner */}
      {isPreview && (
        <div style={{
          background: '#7C5CBA', color: 'white',
          textAlign: 'center', padding: '10px 24px',
          fontSize: '13px', fontWeight: '600', letterSpacing: '0.3px',
          position: 'sticky', top: '72px', zIndex: 50,
        }}>
          Preview mode — this itinerary is not published yet
        </div>
      )}

      {/* ── Hero ── */}
      <section style={{ position: 'relative', height: 'clamp(400px, 55vw, 600px)', overflow: 'hidden', background: '#0E3D39' }}>
        {coverSrc && (
          <img
            src={coverSrc}
            alt={itinerary.title}
            style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
            onError={e => { e.currentTarget.onerror = null; e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(14,61,57,0.85) 0%, rgba(14,61,57,0.2) 60%, transparent 100%)',
        }} />

        {/* Custom Journey badge */}
        <div style={{
          position: 'absolute', top: '28px', right: '28px',
          padding: '5px 12px', borderRadius: '3px',
          background: 'rgba(201,169,110,0.85)',
          fontSize: '10px', fontWeight: '700', letterSpacing: '1.2px',
          textTransform: 'uppercase', color: '#3A2A0A',
        }}>
          Custom Journey
        </div>

        <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, padding: '0 24px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Link to="/my-trips" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
                My Trips
              </Link>
              <ChevronRight size={12} color="rgba(255,255,255,0.5)" />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>Custom Journey</span>
            </div>
            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 'clamp(28px, 4vw, 52px)',
              fontWeight: '600', color: 'white',
              lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '8px',
            }}>
              {itinerary.title}
            </h1>
            {itinerary.subtitle && (
              <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.75)' }}>{itinerary.subtitle}</p>
            )}
            <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
              {itinerary.country && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                  <MapPin size={14} />{itinerary.country}
                </span>
              )}
              {durationStr && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                  <Clock size={14} />{durationStr}
                </span>
              )}
              {groupSize && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                  <Users size={14} />{groupSize}
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Body ── */}
      <div className="ha-detail-body" style={{ maxWidth: '1280px', margin: '0 auto', padding: '60px 24px' }}>
        <div className="resp-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '64px', alignItems: 'start' }}>

          {/* ── Left: main content ── */}
          <div>

            {/* Overview */}
            {description && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px',
                }}>
                  Overview
                </h2>
                <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8' }}>{description}</p>
                {bestFor.length > 0 && (
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '24px' }}>
                    {bestFor.map(tag => (
                      <span key={tag} style={{
                        padding: '6px 14px', borderRadius: '3px',
                        background: '#EFF6F5', color: '#1B6B65',
                        fontSize: '12px', fontWeight: '600', letterSpacing: '0.5px',
                      }}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Trip Highlights */}
            {highlights.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '24px',
                }}>
                  Trip Highlights
                </h2>
                <div className="resp-highlights-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  {highlights.map((h, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: '#EFF6F5', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Star size={11} color="#1B6B65" fill="#1B6B65" />
                      </div>
                      <span style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.5' }}>{h}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Destination Gallery */}
            {galleryImages.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '24px',
                }}>
                  The Destination
                </h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                  {galleryImages.map((img, i) => (
                    <div key={i} style={{
                      aspectRatio: i === 0 ? '16/10' : '1/1',
                      gridColumn: i === 0 ? '1 / -1' : 'auto',
                      overflow: 'hidden', borderRadius: '6px',
                    }}>
                      <img
                        src={img.src}
                        alt={img.filename.replace(/[-_]/g, ' ').replace(/\.\w+$/, '')}
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                        onError={e => { e.currentTarget.style.display = 'none'; }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Day by Day */}
            {days.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '32px',
                }}>
                  Day by Day
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {days.map((day, i) => (
                    <DayEntry
                      key={i}
                      day={day}
                      isLast={i === days.length - 1}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Why This Journey Is Special */}
            {whySpecial && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px',
                }}>
                  Why This Journey Is Special
                </h2>
                <div style={{ borderLeft: '3px solid #C9A96E', paddingLeft: '24px' }}>
                  <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.85', fontStyle: 'italic' }}>
                    {whySpecial}
                  </p>
                </div>
              </section>
            )}

            {/* Journey Snapshot */}
            {routeOverview && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px',
                }}>
                  Journey Snapshot
                </h2>
                <div style={{
                  background: '#EFF6F5', borderRadius: '8px', padding: '24px 28px',
                  display: 'flex', gap: '16px', alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: '#1B6B65', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Route size={16} color="white" />
                  </div>
                  <p style={{ fontSize: '15px', color: '#2C5F5A', lineHeight: '1.7', fontWeight: '500' }}>
                    {routeOverview}
                  </p>
                </div>
              </section>
            )}

            {/* Researched on location */}
            {researchImages.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <div style={{ background: '#F4F1EC', borderRadius: '10px', padding: '36px' }}>
                  <span style={{
                    fontSize: '10px', fontWeight: '700', letterSpacing: '2px',
                    textTransform: 'uppercase', color: '#1B6B65',
                    display: 'block', marginBottom: '12px',
                  }}>
                    Researched on location
                  </span>
                  <p style={{
                    fontSize: '15px', color: '#4A433A', lineHeight: '1.7',
                    maxWidth: '520px', marginBottom: '28px',
                  }}>
                    This itinerary was built from real experience in the destination, shaped by careful research and time spent exploring it in person.
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
                          alt={img.filename.replace(/[-_]/g, ' ').replace(/\.\w+$/, '')}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          onError={e => { e.currentTarget.style.display = 'none'; }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            )}

          </div>

          {/* ── Right: sidebar ── */}
          <div className="resp-sidebar" style={{ position: 'sticky', top: '100px' }}>
            <CustomSidebar
              itinerary={itinerary}
              days={days}
              durationStr={durationStr}
              pdfState={pdfState}
              pdfError={pdfError}
              onDownload={handleDownloadPDF}
            />
          </div>

        </div>
      </div>

    </div>
  );
}
