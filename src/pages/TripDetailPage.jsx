import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Clock, Star, Check, MapPin, Calendar, Download, Trash2 } from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from '../lib/api';

const T = {
  label: {
    display: 'block',
    fontSize: '10.5px', fontWeight: '700', letterSpacing: '2.5px',
    textTransform: 'uppercase', color: '#1B6B65', marginBottom: '14px',
  },
};

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

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

export default function TripDetailPage() {
  const { id } = useParams();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [status, setStatus] = useState('loading');
  // 'idle' | 'downloading' | 'done' | 'error'
  const [downloadState, setDownloadState] = useState('idle');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { navigate('/sign-in'); return; }

    api.get(`/api/trips/${id}`)
      .then(res => {
        if (res.status === 404) { setStatus('notfound'); return; }
        if (!res.ok) throw new Error('Failed');
        return res.json();
      })
      .then(data => {
        if (!data) return;
        setTrip(data);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [isLoaded, isSignedIn, id]);

  async function handleDownload() {
    if (!trip || downloadState === 'downloading') return;
    setDownloadState('downloading');
    try {
      const [{ pdf }, { TripPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/TripPDF'),
      ]);
      const { createElement } = await import('react');
      const blob = await pdf(createElement(TripPDF, { trip })).toBlob();
      const filename = `${trip.destination.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-itinerary.pdf`;
      triggerDownload(blob, filename);
      setDownloadState('done');

      // Audit: fire-and-forget DOWNLOADED event
      api.post(`/api/trips/${id}`, {
        eventType: 'DOWNLOADED',
        metadata: { source: 'trip_detail', destination: trip.destination },
      }).catch(err => console.warn('[TripDetailPage] download audit failed:', err.message));
    } catch (err) {
      console.error('[TripDetailPage] download error:', err.message);
      setDownloadState('error');
    }
  }

  async function handleDelete() {
    if (!window.confirm(`Delete "${trip?.destination}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const res = await api.del(`/api/trips/${id}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Delete failed');
      }
      navigate('/my-trips');
    } catch (err) {
      console.error('[TripDetailPage] delete error:', err.message);
      setDeleting(false);
      window.alert('Could not delete trip. Please try again.');
    }
  }

  if (status === 'loading') {
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '15px', color: '#9C9488' }}>Loading…</p>
      </div>
    );
  }

  if (status === 'error' || status === 'notfound') {
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <p style={{ fontSize: '15px', color: '#6B6156' }}>
          {status === 'notfound' ? 'Trip not found.' : 'Could not load this trip.'}
        </p>
        <Link to="/my-trips" style={{ fontSize: '14px', color: '#1B6B65', fontWeight: '600', textDecoration: 'none' }}>
          ← Back to My Trips
        </Link>
      </div>
    );
  }

  const highlights  = Array.isArray(trip.highlights)  ? trip.highlights  : [];
  const hotels      = Array.isArray(trip.hotels)      ? trip.hotels      : [];
  const experiences = Array.isArray(trip.experiences) ? trip.experiences : [];

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Back nav */}
      <div style={{ padding: '20px 24px 0', maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link
          to="/my-trips"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#6B6156', textDecoration: 'none', fontWeight: '500' }}
        >
          <ArrowLeft size={13} /> My Trips
        </Link>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            padding: '7px 14px', background: 'transparent', color: '#B5A09A',
            border: '1px solid #E8E3DA', borderRadius: '4px',
            fontSize: '12px', fontWeight: '600', letterSpacing: '0.3px',
            cursor: deleting ? 'default' : 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { if (!deleting) { e.currentTarget.style.color = '#C0392B'; e.currentTarget.style.borderColor = '#C0392B'; }}}
          onMouseLeave={e => { e.currentTarget.style.color = '#B5A09A'; e.currentTarget.style.borderColor = '#E8E3DA'; }}
        >
          <Trash2 size={12} />
          {deleting ? 'Deleting…' : 'Delete trip'}
        </button>
      </div>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #0D3834 0%, #1B6B65 100%)',
        padding: 'clamp(48px, 7vw, 88px) 24px',
        textAlign: 'center', marginTop: '16px',
      }}>
        <div style={{ maxWidth: '640px', margin: '0 auto' }}>
          {trip.country && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '16px' }}>
              <MapPin size={12} color="rgba(255,255,255,0.55)" />
              <span style={{ ...T.label, color: 'rgba(255,255,255,0.55)', marginBottom: 0 }}>{trip.country}</span>
            </div>
          )}
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(32px, 5vw, 58px)', fontWeight: '600', color: 'white',
            lineHeight: '1.12', letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            {trip.destination}
          </h1>
          {trip.overview && (
            <p style={{ fontSize: '16px', color: 'rgba(255,255,255,0.68)', lineHeight: '1.75', marginBottom: '24px' }}>
              {trip.overview}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {trip.duration && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 16px', background: 'rgba(255,255,255,0.12)', borderRadius: '20px', fontSize: '12.5px', color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>
                <Clock size={12} />
                {trip.duration}
              </div>
            )}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '7px 16px', background: 'rgba(255,255,255,0.12)', borderRadius: '20px', fontSize: '12.5px', color: 'rgba(255,255,255,0.8)', fontWeight: '600' }}>
              <Calendar size={12} />
              Saved {formatDate(trip.createdAt)}
            </div>
            {/* Download button */}
            <button
              onClick={handleDownload}
              disabled={downloadState === 'downloading'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '7px',
                padding: '7px 18px',
                background: downloadState === 'downloading' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)',
                color: 'white', border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: '20px', fontSize: '12.5px', fontWeight: '600',
                cursor: downloadState === 'downloading' ? 'default' : 'pointer',
                transition: 'background 0.2s',
              }}
              onMouseEnter={e => { if (downloadState !== 'downloading') e.currentTarget.style.background = 'rgba(255,255,255,0.22)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = downloadState === 'downloading' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.15)'; }}
            >
              <Download size={12} />
              {downloadState === 'downloading' ? 'Preparing…' : 'Download PDF'}
            </button>
          </div>
          {downloadState === 'error' && (
            <p style={{ fontSize: '12px', color: 'rgba(255,180,100,0.9)', marginTop: '10px' }}>
              Download failed — please try again.
            </p>
          )}
        </div>
      </section>

      {/* Body */}
      <section style={{ padding: 'clamp(48px, 6vw, 88px) 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {/* Highlights */}
          {highlights.length > 0 && (
            <section style={{ marginBottom: '60px' }}>
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                Trip highlights
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '12px' }}>
                {highlights.map((h, i) => (
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
          {trip.days?.length > 0 && (
            <section style={{ marginBottom: '60px' }}>
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '28px' }}>
                Day by day
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {trip.days.map((day, i) => (
                  <div key={day.id} style={{ display: 'flex', gap: '20px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                      <div style={{
                        width: '36px', height: '36px', borderRadius: '50%',
                        background: '#1B6B65', color: 'white',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', fontWeight: '600', flexShrink: 0,
                      }}>
                        {day.dayNumber}
                      </div>
                      {i < trip.days.length - 1 && (
                        <div style={{ width: '1px', flex: 1, background: '#E8E3DA', minHeight: '24px' }} />
                      )}
                    </div>
                    <div style={{ paddingBottom: '32px', flex: 1 }}>
                      <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '5px' }}>
                        Day {day.dayNumber}
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
          {(hotels.length > 0 || experiences.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '28px', marginBottom: '60px' }}>
              {hotels.length > 0 && (
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '28px' }}>
                  <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '19px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                    Where to stay
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {hotels.map((hotel, i) => (
                      <div key={i} style={{ paddingBottom: i < hotels.length - 1 ? '16px' : '0', borderBottom: i < hotels.length - 1 ? '1px solid #F4F1EC' : 'none' }}>
                        <p style={{ fontSize: '14px', fontWeight: '600', color: '#1C1A16', marginBottom: '3px' }}>{hotel.name}</p>
                        <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '5px' }}>{hotel.type}</p>
                        <p style={{ fontSize: '13px', color: '#6B6156', lineHeight: '1.55' }}>{hotel.note}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {experiences.length > 0 && (
                <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '28px' }}>
                  <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '19px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                    Key experiences
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {experiences.map((exp, i) => (
                      <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <Check size={14} color="#1B6B65" style={{ flexShrink: 0, marginTop: '2px' }} strokeWidth={2.5} />
                        <span style={{ fontSize: '13px', color: '#4A433A', lineHeight: '1.55' }}>{exp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CTA */}
          <div style={{
            background: 'linear-gradient(135deg, #0D3834, #1B6B65)',
            borderRadius: '12px', padding: '44px 48px', textAlign: 'center',
          }}>
            <span style={{ ...T.label, color: '#C9A96E', textAlign: 'center', display: 'block' }}>
              Take it further
            </span>
            <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(20px, 2.8vw, 30px)', fontWeight: '600', color: 'white', marginBottom: '14px', lineHeight: '1.25' }}>
              Turn this into a fully booked journey
            </h3>
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.65)', lineHeight: '1.75', marginBottom: '32px', maxWidth: '480px', margin: '0 auto 32px' }}>
              Our planners take AI-generated itineraries and build them into fully confirmed, bookable trips.
            </p>
            <Link
              to="/custom"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px',
                padding: '14px 28px', background: '#C9A96E', color: 'white',
                borderRadius: '4px', fontSize: '13px', fontWeight: '700',
                letterSpacing: '0.8px', textTransform: 'uppercase', textDecoration: 'none',
              }}
            >
              Work with a planner <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} />
            </Link>
          </div>

        </div>
      </section>
    </div>
  );
}
