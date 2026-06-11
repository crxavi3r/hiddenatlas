import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { MapPin, Clock, Users, Lock } from 'lucide-react';
import { useApi } from '../lib/api';
import { useSEO } from '../hooks/useSEO';

const TEAL  = '#1B6B65';
const GOLD  = '#C9A96E';
const CHAR  = '#1C1A16';
const MUTED = '#6B6156';
const STONE = '#FAFAF8';
const BORDER = '#E8E3DA';
const SERIF = "'Playfair Display', Georgia, serif";

export default function ShareAcceptPage() {
  useSEO({ title: 'Trip invitation', noindex: true });
  const { token } = useParams();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  const [preview, setPreview] = useState(null);
  const [previewStatus, setPreviewStatus] = useState('loading'); // loading | ok | notfound | revoked | error
  const [acceptStatus, setAcceptStatus] = useState('idle'); // idle | accepting | done | error | mismatch | taken
  const [acceptError, setAcceptError] = useState('');

  // 1. Load preview (no auth required)
  useEffect(() => {
    if (!token) return;
    fetch(`/api/trips?action=shares-preview&token=${encodeURIComponent(token)}`)
      .then(async res => {
        if (res.status === 404) { setPreviewStatus('notfound'); return; }
        if (res.status === 410) { setPreviewStatus('revoked'); return; }
        if (!res.ok) { setPreviewStatus('error'); return; }
        const data = await res.json();
        setPreview(data);
        setPreviewStatus('ok');
      })
      .catch(() => setPreviewStatus('error'));
  }, [token]);

  const acceptInvite = useCallback(async () => {
    setAcceptStatus('accepting');
    try {
      const res = await api.post(`/api/trips?action=shares-accept&token=${encodeURIComponent(token)}`, {});
      const data = await res.json();

      if (res.status === 403 && data.emailMismatch) {
        setAcceptError(data.error);
        setAcceptStatus('mismatch');
        return;
      }
      if (res.status === 409) {
        setAcceptError(data.error);
        setAcceptStatus('taken');
        return;
      }
      if (res.status === 410) {
        setAcceptStatus('revoked');
        return;
      }
      if (!res.ok) {
        setAcceptError(data.error || 'Something went wrong.');
        setAcceptStatus('error');
        return;
      }

      // Success — redirect to the trip
      setAcceptStatus('done');
      setTimeout(() => navigate(`/my-trips/${data.tripId}`, { replace: true }), 800);
    } catch {
      setAcceptError('Something went wrong. Please try again.');
      setAcceptStatus('error');
    }
  }, [api, token, navigate]);

  // 2. Auto-accept once signed in and preview loaded
  useEffect(() => {
    if (!isLoaded || !isSignedIn || previewStatus !== 'ok' || acceptStatus !== 'idle') return;
    acceptInvite(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [isLoaded, isSignedIn, previewStatus, acceptStatus, acceptInvite]);

  function handleSignIn() {
    navigate(`/sign-in?redirect=/share/trip/${token}`);
  }

  function handleSignUp() {
    navigate(`/sign-up?redirect=/share/trip/${token}`);
  }

  // Loading preview
  if (previewStatus === 'loading') {
    return (
      <div style={{ minHeight: '100vh', background: STONE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '14px', color: MUTED }}>Loading invitation...</p>
      </div>
    );
  }

  // Invalid / revoked / error states
  if (previewStatus === 'notfound') {
    return (
      <ErrorPage title="Invitation not found" message="This invite link is invalid or has expired." />
    );
  }
  if (previewStatus === 'revoked') {
    return (
      <ErrorPage title="Invitation revoked" message="This invite has been revoked by the trip owner." />
    );
  }
  if (previewStatus === 'error') {
    return (
      <ErrorPage title="Something went wrong" message="We couldn't load this invitation. Please try again later." />
    );
  }

  const roleLabel = preview.role === 'edit' ? 'Can edit' : 'View only';
  const roleDesc  = preview.role === 'edit'
    ? 'You can add and edit bookings, notes and items.'
    : 'You can view the full itinerary, days, map, notes and bookings.';

  return (
    <div style={{ minHeight: '100vh', background: STONE, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: '480px' }}>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '600', color: TEAL, margin: 0 }}>HiddenAtlas</p>
        </div>

        {/* Trip card */}
        <div style={{ background: 'white', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 8px 40px rgba(28,26,22,0.12)', marginBottom: '20px' }}>
          {/* Hero */}
          {preview.cover ? (
            <div style={{ position: 'relative', height: '180px', overflow: 'hidden' }}>
              <img src={preview.cover} alt={preview.tripTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, transparent 40%, rgba(10,30,28,0.7) 100%)' }} />
              <div style={{ position: 'absolute', bottom: '16px', left: '20px', right: '20px' }}>
                <p style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '600', color: 'white', margin: 0 }}>{preview.tripTitle}</p>
              </div>
            </div>
          ) : (
            <div style={{ height: '120px', background: 'linear-gradient(135deg, #0D3834, #1B6B65)', display: 'flex', alignItems: 'center', padding: '0 24px' }}>
              <p style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '600', color: 'white', margin: 0 }}>{preview.tripTitle}</p>
            </div>
          )}

          <div style={{ padding: '20px 24px 24px' }}>
            {/* Invitation line */}
            <p style={{ fontSize: '14px', color: MUTED, lineHeight: '1.6', marginBottom: '16px' }}>
              <strong style={{ color: CHAR }}>{preview.inviterName}</strong> shared this trip with you on HiddenAtlas.
            </p>

            {/* Meta */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              {preview.destination && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: MUTED }}>
                  <MapPin size={12} strokeWidth={2} /> {preview.destination}
                </span>
              )}
              {preview.duration && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12.5px', color: MUTED }}>
                  <Clock size={12} strokeWidth={2} /> {preview.duration}
                </span>
              )}
            </div>

            {/* Role badge */}
            <div style={{ padding: '12px 16px', background: preview.role === 'edit' ? '#EFF6F5' : '#F4F1EC', borderRadius: '8px', border: `1px solid ${preview.role === 'edit' ? '#C6E4E0' : BORDER}` }}>
              <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.2px', textTransform: 'uppercase', color: preview.role === 'edit' ? TEAL : MUTED, marginBottom: '2px' }}>
                {roleLabel}
              </p>
              <p style={{ fontSize: '12.5px', color: MUTED, margin: 0 }}>{roleDesc}</p>
            </div>
          </div>
        </div>

        {/* Auth / Accept section */}
        <div style={{ background: 'white', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 20px rgba(28,26,22,0.07)' }}>

          {/* Not loaded yet */}
          {!isLoaded && (
            <p style={{ fontSize: '13px', color: MUTED, textAlign: 'center' }}>Loading...</p>
          )}

          {/* Not signed in */}
          {isLoaded && !isSignedIn && (
            <>
              <p style={{ fontSize: '14px', color: CHAR, textAlign: 'center', lineHeight: '1.6', marginBottom: '20px' }}>
                Sign in or create an account to open this trip.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <button
                  onClick={handleSignIn}
                  style={{ width: '100%', padding: '13px', background: TEAL, color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Sign in
                </button>
                <button
                  onClick={handleSignUp}
                  style={{ width: '100%', padding: '13px', background: 'transparent', color: TEAL, border: `1px solid ${TEAL}`, borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}
                >
                  Create account
                </button>
              </div>
            </>
          )}

          {/* Signed in — accepting */}
          {isLoaded && isSignedIn && acceptStatus === 'accepting' && (
            <p style={{ fontSize: '14px', color: MUTED, textAlign: 'center' }}>Opening trip...</p>
          )}

          {/* Success */}
          {isLoaded && isSignedIn && acceptStatus === 'done' && (
            <p style={{ fontSize: '14px', color: TEAL, textAlign: 'center', fontWeight: '600' }}>
              Trip added to your account. Redirecting...
            </p>
          )}

          {/* Email mismatch */}
          {acceptStatus === 'mismatch' && (
            <div style={{ textAlign: 'center' }}>
              <Lock size={24} color={GOLD} style={{ marginBottom: '10px' }} />
              <p style={{ fontSize: '14px', color: CHAR, lineHeight: '1.6', marginBottom: '16px' }}>
                {acceptError}
              </p>
              <Link to="/my-trips" style={{ fontSize: '13px', color: TEAL, fontWeight: '600' }}>Go to My Trips</Link>
            </div>
          )}

          {/* Already taken by another user */}
          {acceptStatus === 'taken' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: CHAR, lineHeight: '1.6', marginBottom: '16px' }}>
                {acceptError}
              </p>
              <Link to="/my-trips" style={{ fontSize: '13px', color: TEAL, fontWeight: '600' }}>Go to My Trips</Link>
            </div>
          )}

          {/* Generic error */}
          {acceptStatus === 'error' && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '14px', color: '#B04040', marginBottom: '16px' }}>{acceptError}</p>
              <button
                onClick={acceptInvite}
                style={{ padding: '10px 20px', background: TEAL, color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
              >
                Try again
              </button>
            </div>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: '12px', color: '#B5A09A', marginTop: '20px' }}>
          <Link to="/" style={{ color: '#B5A09A' }}>HiddenAtlas</Link> · Curated travel guides
        </p>
      </div>
    </div>
  );
}

function ErrorPage({ title, message }) {
  return (
    <div style={{ minHeight: '100vh', background: STONE, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center' }}>
      <p style={{ fontFamily: SERIF, fontSize: '22px', fontWeight: '600', color: TEAL, marginBottom: '32px' }}>HiddenAtlas</p>
      <p style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: '10px' }}>{title}</p>
      <p style={{ fontSize: '14px', color: MUTED, maxWidth: '320px', lineHeight: '1.6', marginBottom: '24px' }}>{message}</p>
      <Link to="/" style={{ fontSize: '14px', color: TEAL, fontWeight: '600', textDecoration: 'none' }}>Go to HiddenAtlas</Link>
    </div>
  );
}
