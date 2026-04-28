import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';
import { useUserCtx } from '../lib/useUserCtx.jsx';
import { CheckCircle, Clock, ArrowRight } from 'lucide-react';

// ── Styles ────────────────────────────────────────────────────────────────────
const inputStyle = {
  width: '100%', padding: '11px 14px', border: '1px solid #D8D3CA',
  borderRadius: '6px', fontSize: '15px', color: '#1C1A16',
  background: 'white', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const disabledInputStyle = {
  ...inputStyle, background: '#F4F1EC', color: '#8C8070', cursor: 'default',
};
const textareaStyle = {
  ...inputStyle, resize: 'vertical', lineHeight: '1.6',
};
const labelStyle = {
  display: 'block', fontSize: '12px', fontWeight: '600', color: '#6B6156',
  textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px',
};
const fieldWrap = { marginBottom: '20px' };
const btnPrimary = {
  padding: '12px 28px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '14px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'inline-flex', alignItems: 'center', gap: '8px',
  transition: 'background 0.2s',
};
const btnPrimaryDisabled = { ...btnPrimary, background: '#8CAAA8', cursor: 'not-allowed' };

function Field({ label, hint, children }) {
  return (
    <div style={fieldWrap}>
      <label style={labelStyle}>{label}</label>
      {hint && <p style={{ fontSize: '12.5px', color: '#8C8070', marginBottom: '6px' }}>{hint}</p>}
      {children}
    </div>
  );
}

// ── Status states ─────────────────────────────────────────────────────────────
function StatusCard({ icon, title, body, action }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #E8E3DA', borderRadius: '10px',
      padding: '40px', maxWidth: '560px', margin: '0 auto', textAlign: 'center',
    }}>
      <div style={{ fontSize: '40px', marginBottom: '16px' }}>{icon}</div>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
        {title}
      </h2>
      <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7', marginBottom: action ? '24px' : 0 }}>
        {body}
      </p>
      {action}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BecomeDesignerPage() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { loading: ctxLoading } = useUserCtx();

  const [appStatus, setAppStatus]     = useState(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [submitted, setSubmitted]     = useState(false);
  const [submitting, setSubmitting]   = useState(false);
  const [error, setError]             = useState(null);
  const [form, setForm] = useState({
    fullName: '', email: '', bio: '',
    websiteUrl: '', instagramUrl: '', expertiseRegions: '', message: '',
  });

  // Pre-fill name + email from Clerk
  useEffect(() => {
    if (!user) return;
    const primary = user.emailAddresses?.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ?? '';
    const name    = user.fullName ?? '';
    setForm(f => ({
      ...f,
      email:    f.email    || primary,
      fullName: f.fullName || name,
    }));
  }, [user]);

  // Fetch application status when signed in
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { setStatusLoaded(true); return; }

    getToken()
      .then(token => {
        if (!token) { setStatusLoaded(true); return null; }
        return fetch('/api/designer?action=application-status', {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then(r => (r?.ok ? r.json() : null))
      .then(data => { if (data) setAppStatus(data); setStatusLoaded(true); })
      .catch(() => setStatusLoaded(true));
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch('/api/designer?action=apply', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === 'already_pending') {
          setAppStatus(s => ({ ...s, latestApplicationStatus: 'pending', hasPendingApplication: true, canApply: false }));
          return;
        }
        if (data.error === 'already_designer') {
          setAppStatus(s => ({ ...s, role: 'designer', canApply: false }));
          return;
        }
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      setSubmitted(true);
      setAppStatus(s => ({ ...s, latestApplicationStatus: 'pending', hasPendingApplication: true, canApply: false }));
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const isLoading = !isLoaded || ctxLoading || !statusLoaded;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: '#FAFAF8', minHeight: '100vh' }}>

      {/* Hero */}
      <div style={{ background: '#0F1A18', padding: '80px 24px 64px' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', textAlign: 'center' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '2.5px', textTransform: 'uppercase', color: '#C9A96E', marginBottom: '16px' }}>
            For Travel Experts
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '42px', fontWeight: '600', color: '#E8E1D8', lineHeight: '1.25', marginBottom: '20px' }}>
            Become a Travel Designer
          </h1>
          <p style={{ fontSize: '17px', color: '#B5AA99', lineHeight: '1.75', maxWidth: '520px', margin: '0 auto' }}>
            Share your expertise with travellers who want to go further. Design routes, curate experiences, and earn from your knowledge.
          </p>
        </div>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '64px 24px' }}>

        {isLoading && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#8C8070' }}>
            Loading…
          </div>
        )}

        {!isLoading && !isSignedIn && (
          <StatusCard
            icon="✈️"
            title="Sign in to apply"
            body="Sign in or create an account to apply as a HiddenAtlas travel designer."
            action={
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <Link to="/sign-in" style={{ ...btnPrimary, textDecoration: 'none' }}>
                  Sign in
                </Link>
                <Link to="/sign-up" style={{
                  padding: '12px 28px', borderRadius: '5px', border: '1px solid #D8D3CA',
                  fontSize: '14px', fontWeight: '600', color: '#1C1A16', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center',
                }}>
                  Create account
                </Link>
              </div>
            }
          />
        )}

        {!isLoading && isSignedIn && (appStatus?.role === 'designer' || appStatus?.role === 'admin') && (
          <StatusCard
            icon="🌟"
            title="Your designer profile is active"
            body="Your designer profile is active. You can now access your designer portal."
            action={
              <Link to="/admin" style={{ ...btnPrimary, textDecoration: 'none' }}>
                Open designer portal <ArrowRight size={15} />
              </Link>
            }
          />
        )}

        {!isLoading && isSignedIn && appStatus?.hasPendingApplication && !submitted && (
          <StatusCard
            icon="⏳"
            title="Application received"
            body="Your application has been received and is waiting for review. We will be in touch."
          />
        )}

        {!isLoading && isSignedIn && submitted && (
          <StatusCard
            icon="✅"
            title="Application submitted"
            body="Your application has been received and is waiting for review. We will be in touch."
          />
        )}

        {!isLoading && isSignedIn && !submitted && appStatus?.canApply === false && appStatus?.latestApplicationStatus === 'rejected' && (
          <StatusCard
            icon="📋"
            title="Previous application not approved"
            body="Your previous application was not approved. You can submit a new application if you would like us to review it again."
          />
        )}

        {!isLoading && isSignedIn && appStatus?.canApply && (
          <>
            {appStatus?.latestApplicationStatus === 'rejected' && (
              <div style={{
                background: '#FBF6EE', border: '1px solid #E8D5B4', borderRadius: '8px',
                padding: '16px 20px', marginBottom: '32px', fontSize: '14px', color: '#6B4C1C',
              }}>
                Your previous application was not approved. You are welcome to submit a new one.
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
                Your application
              </h2>
              <p style={{ fontSize: '14px', color: '#8C8070', marginBottom: '36px' }}>
                Fields marked with an asterisk are required.
              </p>

              <Field label="Full name *">
                <input
                  style={inputStyle}
                  value={form.fullName}
                  onChange={set('fullName')}
                  placeholder="Your full name"
                  required
                />
              </Field>

              <Field label="Email *">
                <input
                  style={form.email ? disabledInputStyle : inputStyle}
                  value={form.email}
                  onChange={form.email ? undefined : set('email')}
                  readOnly={!!form.email}
                  placeholder="your@email.com"
                  type="email"
                  required
                />
              </Field>

              <Field label="Bio *" hint="Tell us about yourself and your travel background.">
                <textarea
                  style={{ ...textareaStyle, minHeight: '120px' }}
                  value={form.bio}
                  onChange={set('bio')}
                  placeholder="I have been travelling independently for 12 years, specialising in…"
                  required
                />
              </Field>

              <Field label="Expertise regions" hint="Which destinations or regions do you know best?">
                <input
                  style={inputStyle}
                  value={form.expertiseRegions}
                  onChange={set('expertiseRegions')}
                  placeholder="e.g. Southeast Asia, Morocco, Patagonia"
                />
              </Field>

              <Field label="Website">
                <input
                  style={inputStyle}
                  value={form.websiteUrl}
                  onChange={set('websiteUrl')}
                  placeholder="https://yoursite.com"
                  type="url"
                />
              </Field>

              <Field label="Instagram">
                <input
                  style={inputStyle}
                  value={form.instagramUrl}
                  onChange={set('instagramUrl')}
                  placeholder="https://instagram.com/yourhandle"
                />
              </Field>

              <Field label="Message *" hint="Why do you want to design for HiddenAtlas? What would your itineraries offer?">
                <textarea
                  style={{ ...textareaStyle, minHeight: '140px' }}
                  value={form.message}
                  onChange={set('message')}
                  placeholder="I want to create itineraries that go beyond the obvious…"
                  required
                />
              </Field>

              {error && (
                <div style={{
                  background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '6px',
                  padding: '12px 16px', marginBottom: '20px', fontSize: '14px', color: '#991B1B',
                }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={submitting ? btnPrimaryDisabled : btnPrimary}
              >
                {submitting ? 'Submitting…' : 'Submit application'}
                {!submitting && <ArrowRight size={15} />}
              </button>
            </form>
          </>
        )}

      </div>
    </div>
  );
}
