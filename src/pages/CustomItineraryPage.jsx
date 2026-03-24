import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Download, MapPin, Clock, Lock, ChevronRight, Star, FileText } from 'lucide-react';
import { resolveCoverImage } from '../lib/resolveCoverImage';

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

function mergeByType(dbAssets, type) {
  return dbAssets.filter(a => a.assetType === type);
}

// ─────────────────────────────────────────────────────────────
// Day card
// ─────────────────────────────────────────────────────────────
function DayCard({ day, dayImg, isLast }) {
  // Support both field name variants (desc vs description, bullets vs places)
  const description = day.desc || day.description || null;
  const bullets     = Array.isArray(day.bullets) && day.bullets.length > 0
    ? day.bullets
    : Array.isArray(day.places) && day.places.length > 0
      ? day.places
      : [];
  // DB asset takes priority; fall back to inline img URL saved in content
  const imgSrc = dayImg || day.img || null;

  return (
    <div style={{
      display: 'flex', gap: '0',
      borderLeft: isLast ? 'none' : '2px solid #E8E3DA',
      marginLeft: '16px', paddingLeft: '28px', paddingBottom: isLast ? 0 : '48px',
      position: 'relative',
    }}>
      {/* Dot */}
      <div style={{
        position: 'absolute', left: '-9px', top: '4px',
        width: '16px', height: '16px', borderRadius: '50%',
        background: 'white', border: '2px solid #1B6B65',
        flexShrink: 0,
      }} />

      <div style={{ flex: 1 }}>
        <p style={{
          fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px',
          textTransform: 'uppercase', color: '#1B6B65', marginBottom: '6px',
        }}>
          Day {day.day}
        </p>
        <h3 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '20px', fontWeight: '600', color: '#1C1A16',
          lineHeight: '1.3', marginBottom: '16px',
        }}>
          {day.title}
        </h3>

        {imgSrc && (
          <div style={{
            height: '220px', borderRadius: '8px', overflow: 'hidden',
            marginBottom: '20px',
          }}>
            <img
              src={imgSrc}
              alt={`Day ${day.day}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
        )}

        {description && (
          <p style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.8', marginBottom: '20px' }}>
            {description}
          </p>
        )}

        {bullets.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
            {bullets.map((b, i) => (
              <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '6px', height: '6px', borderRadius: '50%',
                  background: '#1B6B65', flexShrink: 0, marginTop: '7px',
                }} />
                <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.6' }}>{b}</span>
              </div>
            ))}
          </div>
        )}

        {day.tip && (
          <div style={{
            background: '#EFF6F5', borderLeft: '3px solid #1B6B65',
            borderRadius: '0 6px 6px 0', padding: '14px 16px',
            marginBottom: '8px',
          }}>
            <p style={{
              fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px',
              textTransform: 'uppercase', color: '#1B6B65', marginBottom: '6px',
            }}>
              Insider Tip
            </p>
            <p style={{ fontSize: '13.5px', color: '#3D3830', lineHeight: '1.7', margin: 0 }}>
              {day.tip}
            </p>
          </div>
        )}

        {Array.isArray(day.hotels) && day.hotels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '12px' }}>
            {day.hotels.map((h, i) => (
              <span key={i} style={{
                fontSize: '11.5px', color: '#8C8070',
                background: 'white', borderRadius: '3px',
                padding: '3px 10px', border: '1px solid #E8E3DA',
              }}>
                🏨 {h}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────
export default function CustomItineraryPage() {
  const { slug }          = useParams();
  const [searchParams]    = useSearchParams();
  const { getToken, isLoaded, isSignedIn } = useAuth();

  const isPreview = searchParams.get('preview') === 'true';

  const [itinerary,     setItinerary]     = useState(null);
  const [dbAssets,      setDbAssets]      = useState([]);
  const [pageStatus,    setPageStatus]    = useState('loading');
  const [errorMsg,      setErrorMsg]      = useState('');
  const [pdfState,      setPdfState]      = useState('idle'); // idle | generating | done | error

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setPageStatus('unauthorized'); return; }

    getToken()
      .then(token =>
        fetch(`/api/itineraries?action=custom&slug=${encodeURIComponent(slug)}${isPreview ? '&preview=true' : ''}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
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
    try {
      const { downloadCustomPDF } = await import('../utils/buildCustomPDF');
      await downloadCustomPDF(itinerary, dbAssets);
      setPdfState('done');
      setTimeout(() => setPdfState('idle'), 3000);
    } catch (err) {
      console.error('[CustomItineraryPage] PDF error:', err);
      setPdfState('error');
      setTimeout(() => setPdfState('idle'), 4000);
    }
  }

  // ── States ───────────────────────────────────────────────────
  if (pageStatus === 'loading' || !isLoaded) {
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '15px', color: '#9C9488' }}>Loading your itinerary…</p>
      </div>
    );
  }

  if (pageStatus === 'unauthorized') {
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <Lock size={32} color="#8C8070" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px',
            fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
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
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ textAlign: 'center', maxWidth: '420px' }}>
          <Lock size={32} color="#8C8070" style={{ marginBottom: '20px' }} />
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px',
            fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
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

  // ── Render itinerary ─────────────────────────────────────────
  const content      = parseContent(itinerary.content);
  const galleryAssets = mergeByType(dbAssets, 'gallery');
  const researchAssets = mergeByType(dbAssets, 'research');
  const days         = content.days || [];
  const highlights   = content.highlights || [];
  const whySpecial   = content.whySpecial || [];
  const coverSrc     = resolveCoverImage(itinerary.coverImage, itinerary.slug);
  const durationStr  = itinerary.durationDays
    ? `${itinerary.durationDays} Day${itinerary.durationDays !== 1 ? 's' : ''}`
    : '';

  const pdfLabel = pdfState === 'generating' ? 'Generating PDF…'
    : pdfState === 'done'       ? 'Downloaded!'
    : pdfState === 'error'      ? 'PDF failed — retry'
    : itinerary.pdfUrl          ? 'Download PDF'
    : 'Generate PDF';

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

      {/* Hero */}
      <section style={{ position: 'relative', height: 'clamp(360px, 50vw, 560px)', overflow: 'hidden' }}>
        <img
          src={coverSrc}
          alt={itinerary.title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
          onError={e => { e.currentTarget.onerror = null; e.currentTarget.style.background = '#1B6B65'; }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(14,61,57,0.88) 0%, rgba(14,61,57,0.25) 60%, transparent 100%)',
        }} />

        {/* Private badge */}
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
            </div>
          </div>
        </div>
      </section>

      {/* Content + sidebar */}
      <div style={{
        maxWidth: '1280px', margin: '0 auto', padding: '48px 24px',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 320px',
        gap: '48px',
        alignItems: 'start',
      }}
        className="resp-layout"
      >
        {/* ── Left: main content ── */}
        <div>

          {/* Overview */}
          {(content.overview || itinerary.description) && (
            <section style={{ marginBottom: '48px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>
                Overview
              </h2>
              <p style={{ fontSize: '16px', color: '#4A433A', lineHeight: '1.8' }}>
                {content.overview || itinerary.description}
              </p>
            </section>
          )}

          {/* Highlights */}
          {highlights.length > 0 && (
            <section style={{ marginBottom: '48px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                Highlights
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
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
          )}

          {/* Gallery */}
          {galleryAssets.length > 0 && (
            <section style={{ marginBottom: '48px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                The Destination
              </h2>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
              }}>
                {galleryAssets.map((img, i) => (
                  <div key={i} style={{
                    aspectRatio: i === 0 ? '16/10' : '1/1',
                    gridColumn: i === 0 ? '1 / -1' : 'auto',
                    overflow: 'hidden', borderRadius: '6px',
                  }}>
                    <img
                      src={img.url}
                      alt={img.alt || `Gallery ${i + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Days */}
          {days.length > 0 && (
            <section style={{ marginBottom: '48px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '32px' }}>
                Day by Day
              </h2>
              <div>
                {days.map((day, i) => {
                  const dayAsset = dbAssets.find(a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day));
                  return (
                    <DayCard
                      key={i}
                      day={day}
                      dayImg={dayAsset?.url ?? null}
                      isLast={i === days.length - 1}
                    />
                  );
                })}
              </div>
            </section>
          )}

          {/* Why special */}
          {whySpecial.length > 0 && (
            <section style={{ marginBottom: '48px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                Why This Route
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {whySpecial.map((item, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '14px', alignItems: 'flex-start',
                    padding: '16px', background: 'white',
                    border: '1px solid #E8E3DA', borderRadius: '8px',
                  }}>
                    <div style={{
                      width: '28px', height: '28px', borderRadius: '50%',
                      background: '#EFF6F5', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#1B6B65' }}>{i + 1}</span>
                    </div>
                    <p style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.65', margin: 0 }}>{item}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Research photos */}
          {researchAssets.length > 0 && (
            <section style={{ marginBottom: '48px' }}>
              <div style={{ background: '#F4F1EC', borderRadius: '10px', padding: '32px' }}>
                <span style={{
                  fontSize: '10px', fontWeight: '700', letterSpacing: '2px',
                  textTransform: 'uppercase', color: '#1B6B65',
                  display: 'block', marginBottom: '12px',
                }}>
                  Researched on location
                </span>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${Math.min(researchAssets.length, 3)}, 1fr)`,
                  gap: '8px', marginTop: '20px',
                }}>
                  {researchAssets.map((img, i) => (
                    <div key={i} style={{ aspectRatio: '4/3', overflow: 'hidden', borderRadius: '6px' }}>
                      <img
                        src={img.url}
                        alt={img.alt || `Research ${i + 1}`}
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
        <div style={{ position: 'sticky', top: '100px' }}>
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
                <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', color: '#C9A96E', textTransform: 'uppercase' }}>
                  Your Journey
                </span>
              </div>
              <div style={{ fontSize: '20px', fontWeight: '600', color: 'white', fontFamily: "'Playfair Display', Georgia, serif", lineHeight: '1.3' }}>
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
              {(itinerary.country || durationStr) && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px', padding: '14px', background: '#F4F1EC', borderRadius: '8px' }}>
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
                onClick={handleDownloadPDF}
                disabled={pdfState === 'generating'}
                style={{
                  width: '100%', padding: '14px',
                  background: pdfState === 'error' ? '#C0392B' : pdfState === 'done' ? '#1B6B65' : '#C9A96E',
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

              <p style={{ fontSize: '11.5px', color: '#B5AA99', textAlign: 'center', lineHeight: '1.6' }}>
                Your itinerary is private and only accessible to you.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
