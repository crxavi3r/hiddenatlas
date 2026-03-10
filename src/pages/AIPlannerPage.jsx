import { useState } from 'react';
import { ArrowRight, MapPin, Clock, Star, Check, BookmarkPlus, BookmarkCheck, Download } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from '../lib/api';

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
};

const TRIP_LENGTHS = ['3–5 days', '7–10 days', '11–14 days', '15+ days'];
const STYLES = ['Cultural', 'Adventure', 'Food & Wine', 'Beach', 'Nature', 'City Break'];
const BUDGETS = ['Comfortable', 'Luxury', 'Ultra-Luxury'];
const GROUPS = ['Solo', 'Couple', 'Family', 'Friend Group'];

function OptionChip({ label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '9px 18px', borderRadius: '4px',
        fontSize: '13px', fontWeight: '500', border: '1px solid',
        borderColor: active ? '#1B6B65' : '#E8E3DA',
        background: active ? '#EFF6F5' : 'white',
        color: active ? '#1B6B65' : '#6B6156',
        cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

function FormLabel({ children }) {
  return (
    <p style={{ fontSize: '13px', fontWeight: '600', letterSpacing: '0.3px', color: '#1C1A16', marginBottom: '12px' }}>
      {children}
    </p>
  );
}

// Trigger a browser file download from a Blob
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function AIPlannerPage() {
  const [searchParams] = useSearchParams();
  const { isSignedIn } = useAuth();
  const api = useApi();

  const [form, setForm] = useState({
    destination: searchParams.get('destination') || '',
    tripLength: '7–10 days',
    style: 'Cultural',
    budget: 'Luxury',
    groupType: 'Couple',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  // 'idle' | 'saving' | 'saved' | 'error'
  const [saveState, setSaveState] = useState('idle');
  const [savedTripId, setSavedTripId] = useState(null);

  // 'idle' | 'downloading' | 'done' | 'error'
  const [downloadState, setDownloadState] = useState('idle');

  function set(key, val) {
    setForm(f => ({ ...f, [key]: val }));
  }

  // Ensures the trip is saved exactly once per session.
  // Returns the trip id (existing or newly created), or null on failure.
  async function ensureSaved() {
    if (savedTripId) return savedTripId;
    if (saveState === 'saving') return null;
    setSaveState('saving');
    try {
      const res = await api.post('/api/trips/save', { trip: result });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setSavedTripId(data.id);
      setSaveState('saved');
      return data.id;
    } catch (err) {
      console.error('[AIPlannerPage] save error:', err.message);
      setSaveState('error');
      return null;
    }
  }

  async function handleSave() {
    if (saveState === 'saved' || saveState === 'saving') return;
    await ensureSaved();
  }

  async function handleDownload() {
    if (!result || downloadState === 'downloading') return;
    setDownloadState('downloading');
    try {
      // Auto-save first if signed in and not yet saved
      if (isSignedIn && !savedTripId) {
        await ensureSaved();
        // Download continues even if save failed
      }

      // Lazy-load the PDF library to keep initial bundle small
      const [{ pdf }, { TripPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/TripPDF'),
      ]);

      const { createElement } = await import('react');
      const blob = await pdf(createElement(TripPDF, { trip: result })).toBlob();
      const filename = `${result.destination.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-itinerary.pdf`;
      triggerDownload(blob, filename);
      setDownloadState('done');
    } catch (err) {
      console.error('[AIPlannerPage] download error:', err.message);
      setDownloadState('error');
    }
  }

  async function handleGenerate() {
    if (!form.destination.trim()) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setSaveState('idle');
    setSavedTripId(null);
    setDownloadState('idle');
    try {
      const res = await fetch('/api/generate-itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      setResult(data);
      setTimeout(() => {
        document.getElementById('ai-result')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #0D3834 0%, #1B6B65 100%)',
        padding: 'clamp(56px, 8vw, 100px) 24px', textAlign: 'center',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          <span style={{ ...T.label, color: '#C9A96E', display: 'block', textAlign: 'center' }}>
            Powered by AI
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(36px, 5vw, 62px)', fontWeight: '600', color: 'white',
            lineHeight: '1.12', letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            Plan your journey
          </h1>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.68)', lineHeight: '1.75' }}>
            Tell us where you want to go. We generate a complete, bespoke itinerary based on your travel style — day plans, hotel suggestions, and local experiences included.
          </p>
        </div>
      </section>

      {/* Form */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px', background: 'white', borderBottom: '1px solid #E8E3DA' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto' }}>

          {/* Destination */}
          <div style={{ marginBottom: '36px' }}>
            <FormLabel>Where do you want to go?</FormLabel>
            <div style={{ position: 'relative' }}>
              <MapPin size={16} color="#8C8070" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
              <input
                type="text"
                value={form.destination}
                onChange={e => set('destination', e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleGenerate()}
                placeholder="e.g. Kyoto, Japan · the Amalfi Coast · Patagonia"
                style={{
                  width: '100%', padding: '14px 16px 14px 42px',
                  border: '1px solid #D4CCBF', borderRadius: '4px',
                  fontSize: '15px', color: '#1C1A16', background: '#FAFAF8',
                  outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.2s',
                }}
                onFocus={e => e.target.style.borderColor = '#1B6B65'}
                onBlur={e => e.target.style.borderColor = '#D4CCBF'}
              />
            </div>
          </div>

          {/* Trip length */}
          <div style={{ marginBottom: '28px' }}>
            <FormLabel>Trip length</FormLabel>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {TRIP_LENGTHS.map(l => <OptionChip key={l} label={l} active={form.tripLength === l} onClick={() => set('tripLength', l)} />)}
            </div>
          </div>

          {/* Travel style */}
          <div style={{ marginBottom: '28px' }}>
            <FormLabel>Travel style</FormLabel>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {STYLES.map(s => <OptionChip key={s} label={s} active={form.style === s} onClick={() => set('style', s)} />)}
            </div>
          </div>

          {/* Budget */}
          <div style={{ marginBottom: '28px' }}>
            <FormLabel>Budget</FormLabel>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {BUDGETS.map(b => <OptionChip key={b} label={b} active={form.budget === b} onClick={() => set('budget', b)} />)}
            </div>
          </div>

          {/* Group type */}
          <div style={{ marginBottom: '44px' }}>
            <FormLabel>Travelling as</FormLabel>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {GROUPS.map(g => <OptionChip key={g} label={g} active={form.groupType === g} onClick={() => set('groupType', g)} />)}
            </div>
          </div>

          {/* Generate button */}
          <button
            onClick={handleGenerate}
            disabled={loading || !form.destination.trim()}
            style={{
              width: '100%', padding: '17px',
              background: loading || !form.destination.trim() ? '#B5AA99' : '#1B6B65',
              color: 'white', border: 'none', borderRadius: '4px',
              fontSize: '14px', fontWeight: '600', letterSpacing: '0.8px',
              textTransform: 'uppercase', cursor: loading || !form.destination.trim() ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
              transition: 'background 0.2s',
            }}
          >
            {loading ? (
              <>
                <span style={{ display: 'inline-block', animation: 'spin 0.9s linear infinite' }}>◌</span>
                Generating your itinerary…
              </>
            ) : (
              <>Generate itinerary <ArrowRight size={15} /></>
            )}
          </button>

          {error && (
            <div style={{
              marginTop: '16px', padding: '14px 18px',
              background: '#FFF8F0', border: '1px solid #E8D5B7',
              borderRadius: '4px', fontSize: '14px', color: '#6B4A1A',
            }}>
              {error}
            </div>
          )}
        </div>
      </section>

      {/* Result */}
      {result && (
        <section id="ai-result" style={{ padding: 'clamp(56px, 7vw, 100px) 24px', background: '#FAFAF8' }}>
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>

            {/* Destination header */}
            <div style={{ textAlign: 'center', marginBottom: '48px' }}>
              <span style={T.label}>{result.country}</span>
              <h2 style={T.h2}>{result.destination}</h2>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8', maxWidth: '600px', margin: '18px auto 24px' }}>
                {result.overview}
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 18px', background: '#EFF6F5', borderRadius: '20px', fontSize: '13px', color: '#1B6B65', fontWeight: '600' }}>
                <Clock size={13} />
                {result.duration}
              </div>
            </div>

            {/* ── Actions bar ─────────────────────────────────────────── */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: '12px', marginBottom: '56px', padding: '18px 24px',
              background: 'white', borderRadius: '8px', border: '1px solid #E8E3DA',
              flexWrap: 'wrap',
            }}>
              {isSignedIn ? (
                <>
                  {/* Save state */}
                  {saveState === 'saved' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1B6B65', fontSize: '14px', fontWeight: '600' }}>
                      <BookmarkCheck size={16} />
                      Saved
                      <Link
                        to={`/my-trips/${savedTripId}`}
                        style={{
                          marginLeft: '4px', padding: '6px 14px',
                          background: '#EFF6F5', color: '#1B6B65', borderRadius: '4px',
                          fontSize: '12px', fontWeight: '700', letterSpacing: '0.4px',
                          textTransform: 'uppercase', textDecoration: 'none',
                        }}
                      >
                        View in My Trips →
                      </Link>
                    </div>
                  ) : (
                    <button
                      onClick={handleSave}
                      disabled={saveState === 'saving'}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '7px',
                        padding: '11px 20px',
                        background: saveState === 'saving' ? '#B5AA99' : '#1B6B65',
                        color: 'white', border: 'none', borderRadius: '4px',
                        fontSize: '13px', fontWeight: '700', letterSpacing: '0.5px',
                        textTransform: 'uppercase', cursor: saveState === 'saving' ? 'default' : 'pointer',
                        transition: 'background 0.2s',
                      }}
                    >
                      <BookmarkPlus size={14} />
                      {saveState === 'saving' ? 'Saving…' : 'Save this trip'}
                    </button>
                  )}
                  {saveState === 'error' && (
                    <span style={{ fontSize: '12px', color: '#A0522D' }}>Save failed — try again</span>
                  )}

                  {/* Divider */}
                  <div style={{ width: '1px', height: '22px', background: '#E8E3DA', flexShrink: 0 }} />
                </>
              ) : (
                <p style={{ fontSize: '13.5px', color: '#6B6156', margin: 0 }}>
                  <Link to="/sign-in" style={{ color: '#1B6B65', fontWeight: '600', textDecoration: 'none' }}>Sign in</Link>
                  {' '}to save this trip to your account.
                </p>
              )}

              {/* Download button — available to all */}
              <button
                onClick={handleDownload}
                disabled={downloadState === 'downloading'}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '7px',
                  padding: '11px 20px',
                  background: downloadState === 'downloading' ? '#B5AA99' : 'white',
                  color: downloadState === 'downloading' ? 'white' : '#1C1A16',
                  border: '1px solid',
                  borderColor: downloadState === 'downloading' ? '#B5AA99' : '#D4CCBF',
                  borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                  letterSpacing: '0.5px', textTransform: 'uppercase',
                  cursor: downloadState === 'downloading' ? 'default' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                <Download size={14} />
                {downloadState === 'downloading' ? 'Preparing PDF…' : 'Download PDF'}
              </button>
              {downloadState === 'error' && (
                <span style={{ fontSize: '12px', color: '#A0522D' }}>Download failed — try again</span>
              )}
            </div>

            {/* Highlights */}
            {result.highlights?.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                  Trip highlights
                </h3>
                <div className="resp-highlights-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  {result.highlights.map((h, i) => (
                    <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '14px 16px', background: 'white', borderRadius: '6px', border: '1px solid #E8E3DA' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#EFF6F5', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Star size={11} color="#1B6B65" fill="#1B6B65" />
                      </div>
                      <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.5' }}>{h}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Day by day */}
            {result.days?.length > 0 && (
              <section style={{ marginBottom: '60px' }}>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '28px' }}>
                  Day by day
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                  {result.days.map((day, i) => (
                    <div key={i} style={{ display: 'flex', gap: '20px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: '#1B6B65', color: 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: '600', flexShrink: 0,
                        }}>
                          {day.day}
                        </div>
                        {i < result.days.length - 1 && (
                          <div style={{ width: '1px', flex: 1, background: '#E8E3DA', minHeight: '24px' }} />
                        )}
                      </div>
                      <div style={{ paddingBottom: '32px', flex: 1 }}>
                        <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '5px' }}>
                          Day {day.day}
                        </p>
                        <h4 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
                          {day.title}
                        </h4>
                        <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.75' }}>
                          {day.description}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Hotels + Experiences */}
            <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px', marginBottom: '60px' }}>
              {result.hotels?.length > 0 && (
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '28px' }}>
                  <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '19px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                    Where to stay
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {result.hotels.map((hotel, i) => (
                      <div key={i} style={{ paddingBottom: i < result.hotels.length - 1 ? '16px' : '0', borderBottom: i < result.hotels.length - 1 ? '1px solid #F4F1EC' : 'none' }}>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#1C1A16', marginBottom: '3px' }}>{hotel.name}</p>
                        <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '5px' }}>{hotel.type}</p>
                        <p style={{ fontSize: '13px', color: '#6B6156', lineHeight: '1.55' }}>{hotel.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {result.experiences?.length > 0 && (
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '28px' }}>
                  <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '19px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                    Key experiences
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {result.experiences.map((exp, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <Check size={14} color="#1B6B65" style={{ flexShrink: 0, marginTop: '2px' }} strokeWidth={2.5} />
                        <span style={{ fontSize: '13px', color: '#4A433A', lineHeight: '1.55' }}>{exp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* CTA */}
            <div style={{
              background: 'linear-gradient(135deg, #0D3834, #1B6B65)',
              borderRadius: '12px', padding: '44px 48px', textAlign: 'center',
            }}>
              <span style={{ ...T.label, color: '#C9A96E', textAlign: 'center', display: 'block' }}>
                Take it further
              </span>
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(22px, 2.8vw, 32px)', fontWeight: '600', color: 'white', marginBottom: '14px', lineHeight: '1.25' }}>
                Turn this into a fully booked journey
              </h3>
              <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.75', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
                Our planners take AI-generated itineraries and turn them into fully detailed, bookable trips — with confirmed hotels, private guides, and all logistics sorted.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link
                  to="/custom"
                  style={{
                    padding: '14px 28px', background: '#C9A96E', color: 'white',
                    borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                    letterSpacing: '0.8px', textTransform: 'uppercase', textDecoration: 'none',
                    display: 'flex', alignItems: 'center', gap: '8px',
                  }}
                >
                  Work with a planner <ArrowRight size={14} />
                </Link>
                <Link
                  to="/itineraries"
                  style={{
                    padding: '14px 28px', background: 'transparent', color: 'rgba(255,255,255,0.8)',
                    border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px',
                    fontSize: '13px', fontWeight: '700', letterSpacing: '0.8px',
                    textTransform: 'uppercase', textDecoration: 'none',
                  }}
                >
                  Browse curated itineraries
                </Link>
              </div>
            </div>

          </div>
        </section>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
