import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from '../../lib/api.js';

/* ─── Design tokens ───────────────────────────────────────────── */
const C = {
  teal:    '#1B6B65',
  charcoal:'#1C1A16',
  muted:   '#8C8070',
  border:  '#E8E3DA',
  lightBg: '#F7F4F0',
  white:   '#FFFFFF',
  error:   '#C0392B',
};

/* ─── Slug utilities ──────────────────────────────────────────── */
function deriveSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$|^[a-z0-9]{2,50}$/;

/* ─── Reusable input style ────────────────────────────────────── */
function inputStyle(focused, hasError) {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 14px',
    fontSize: '14px',
    fontFamily: 'Inter, system-ui, sans-serif',
    color: C.charcoal,
    background: C.white,
    border: `1px solid ${hasError ? C.error : focused ? C.teal : C.border}`,
    borderRadius: '8px',
    outline: 'none',
    transition: 'border-color 0.15s',
  };
}

const labelStyle = {
  display: 'block',
  fontSize: '12px',
  fontWeight: '600',
  color: C.charcoal,
  marginBottom: '6px',
  letterSpacing: '0.02em',
};

/* ─── Component ───────────────────────────────────────────────── */
export default function AgencyOnboarding() {
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  const [name,        setName]        = useState('');
  const [slug,        setSlug]        = useState('');
  const [slugEdited,  setSlugEdited]  = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [slugFocused, setSlugFocused] = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  /* Auto-derive slug from name unless the user has manually edited it */
  useEffect(() => {
    if (!slugEdited) setSlug(deriveSlug(name)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [name, slugEdited]);

  /* Redirect to sign-in if not authenticated once Clerk is ready */
  useEffect(() => {
    if (isLoaded && !isSignedIn) navigate('/sign-in', { replace: true });
  }, [isLoaded, isSignedIn, navigate]);

  const nameValid = name.trim().length >= 2;
  const slugValid = SLUG_RE.test(slug);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (!nameValid) { setError('Agency name must be at least 2 characters.'); return; }
    if (!slugValid) { setError('Slug must be 3-50 characters: lowercase letters, numbers, and hyphens only.'); return; }

    setSubmitting(true);
    try {
      const res  = await api.post('/api/agency?action=onboard', { name: name.trim(), slug });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.error || data.message || 'Something went wrong. Please try again.');
        setSubmitting(false);
        return;
      }

      /* Hard redirect so AgencyCtxProvider re-fetches memberships from scratch */
      window.location.href = '/agency';
    } catch {
      setError('Network error. Please check your connection and try again.');
      setSubmitting(false);
    }
  }

  /* While Clerk is initialising, show nothing to avoid a flash */
  if (!isLoaded) return null;

  return (
    <div style={{
      minHeight: '100vh',
      background: C.lightBg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px',
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '480px',
        background: C.white,
        border: `1px solid ${C.border}`,
        borderRadius: '16px',
        padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(28,26,22,0.07)',
      }}>

        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <p style={{
            margin: 0,
            fontSize: '20px',
            fontWeight: '700',
            fontFamily: "'Playfair Display', Georgia, serif",
            color: C.teal,
            letterSpacing: '-0.01em',
          }}>
            HiddenAtlas for Agencies
          </p>
        </div>

        {/* Headline */}
        <h1 style={{
          margin: '0 0 8px',
          fontSize: '22px',
          fontWeight: '700',
          color: C.charcoal,
          fontFamily: "'Playfair Display', Georgia, serif",
          textAlign: 'center',
          lineHeight: 1.25,
        }}>
          Set up your agency workspace
        </h1>
        <p style={{
          margin: '0 0 32px',
          fontSize: '13px',
          color: C.muted,
          textAlign: 'center',
          lineHeight: 1.55,
        }}>
          Create a workspace to manage client trips and share branded itineraries.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} noValidate>

          {/* Agency name */}
          <div style={{ marginBottom: '20px' }}>
            <label htmlFor="agency-name" style={labelStyle}>
              Agency name <span style={{ color: C.error }}>*</span>
            </label>
            <input
              id="agency-name"
              type="text"
              required
              placeholder="Acme Travel Co."
              value={name}
              onChange={e => setName(e.target.value)}
              onFocus={() => setNameFocused(true)}
              onBlur={() => setNameFocused(false)}
              style={inputStyle(nameFocused, false)}
              autoComplete="organization"
            />
          </div>

          {/* Workspace slug */}
          <div style={{ marginBottom: '28px' }}>
            <label htmlFor="agency-slug" style={labelStyle}>
              Workspace slug <span style={{ color: C.error }}>*</span>
            </label>
            <input
              id="agency-slug"
              type="text"
              required
              placeholder="acme-travel"
              value={slug}
              onChange={e => { setSlug(e.target.value); setSlugEdited(true); }}
              onFocus={() => setSlugFocused(true)}
              onBlur={() => setSlugFocused(false)}
              pattern="^[a-z0-9-]{3,50}$"
              style={inputStyle(slugFocused, slug.length > 0 && !slugValid)}
              autoComplete="off"
              spellCheck={false}
            />
            <p style={{ margin: '6px 0 0', fontSize: '11px', color: C.muted, lineHeight: 1.45 }}>
              Used in your agency URL. Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          {/* Inline error */}
          {error && (
            <p style={{
              margin: '0 0 16px',
              fontSize: '13px',
              color: C.error,
              background: '#FDF1F0',
              border: '1px solid #F5C6C2',
              borderRadius: '8px',
              padding: '10px 14px',
              lineHeight: 1.45,
            }}>
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: '100%',
              padding: '12px',
              background: submitting ? '#5A9C97' : C.teal,
              color: C.white,
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              fontFamily: 'Inter, system-ui, sans-serif',
              cursor: submitting ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s',
              letterSpacing: '0.01em',
            }}
          >
            {submitting ? 'Creating workspace...' : 'Create workspace'}
          </button>
        </form>

        {/* Already have a workspace */}
        <p style={{ margin: '20px 0 0', fontSize: '12px', color: C.muted, textAlign: 'center' }}>
          Already have a workspace?{' '}
          <Link
            to="/agency"
            style={{ color: C.teal, fontWeight: '600', textDecoration: 'none' }}
          >
            Go to Agency
          </Link>
        </p>
      </div>
    </div>
  );
}
