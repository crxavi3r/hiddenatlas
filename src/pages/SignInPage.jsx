import { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';

// step: 'password' | 'trust' | 'mfa'
export default function SignInPage() {
  useSEO({ title: 'Sign In', noindex: true });
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/my-trips';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [step, setStep] = useState('password');
  const [trustCode, setTrustCode] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [mfaStrategy, setMfaStrategy] = useState(null);

  async function handleResult(result) {
    if (result.status === 'complete') {
      await setActive({ session: result.createdSessionId });
      navigate(redirectTo, { replace: true });
    } else if (result.status === 'needs_client_trust') {
      const factors = result.supportedFirstFactors || signIn.supportedFirstFactors || [];
      const emailFactor = factors.find(f => f.strategy === 'email_code');
      await signIn.prepareFirstFactor({ strategy: 'email_code', emailAddressId: emailFactor?.emailAddressId });
      setStep('trust');
    } else if (result.status === 'needs_second_factor') {
      const factors = result.supportedSecondFactors || signIn.supportedSecondFactors || [];
      const chosen =
        factors.find(f => f.strategy === 'totp') ||
        factors.find(f => f.strategy === 'phone_code') ||
        factors.find(f => f.strategy === 'backup_code');
      const strategy = chosen?.strategy || 'totp';
      setMfaStrategy(strategy);
      if (strategy === 'phone_code' && chosen?.phoneNumberId) {
        await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: chosen.phoneNumberId });
      }
      setStep('mfa');
    } else {
      if (import.meta.env.DEV) console.warn('[SignIn] Unexpected status:', result.status);
      setError('Something went wrong. Please try again or contact support.');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const attempt = await signIn.create({ identifier: email });
      let result;
      if (attempt.status === 'needs_first_factor') {
        result = await signIn.attemptFirstFactor({ strategy: 'password', password });
      } else {
        result = attempt;
      }
      await handleResult(result);
    } catch (err) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Incorrect email or password.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleTrustVerify(e) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code: trustCode });
      await handleResult(result);
    } catch (err) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Invalid or expired code.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptSecondFactor({ strategy: mfaStrategy || 'totp', code: mfaCode });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate(redirectTo, { replace: true });
      } else {
        if (import.meta.env.DEV) console.warn('[SignIn] MFA unexpected status:', result.status);
        setError('Something went wrong. Please try again.');
      }
    } catch (err) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Invalid or expired code. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    padding: '10px 14px', borderRadius: '8px',
    border: '1.5px solid #E5E0D8', fontSize: '15px',
    outline: 'none', color: '#1C1A16',
    background: 'white', width: '100%', boxSizing: 'border-box',
  };
  const btnStyle = (disabled) => ({
    padding: '12px', borderRadius: '8px',
    background: disabled ? '#A8C5C3' : '#1B6B65',
    color: 'white', fontWeight: '600', fontSize: '15px',
    border: 'none', cursor: disabled ? 'default' : 'pointer',
    transition: 'background 0.2s', marginTop: '4px',
  });
  const errorStyle = {
    fontSize: '13px', color: '#C0392B',
    background: '#FDF2F2', border: '1px solid #F5C6C6',
    borderRadius: '6px', padding: '10px 12px', margin: 0,
  };
  const labelStyle = { fontSize: '13px', fontWeight: '500', color: '#1C1A16' };
  const titleStyle = {
    fontFamily: "'Playfair Display', Georgia, serif",
    fontSize: '24px', fontWeight: '600', color: '#1C1A16',
    marginBottom: '8px', textAlign: 'center',
  };
  const subtitleStyle = { fontSize: '14px', color: '#6B6156', textAlign: 'center', marginBottom: '28px' };

  const mfaHint = {
    totp: 'Enter the 6-digit code from your authenticator app.',
    phone_code: 'We sent a verification code to your phone number.',
    backup_code: 'Enter one of your saved backup codes.',
  }[mfaStrategy] ?? 'Enter your authentication code to continue.';

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 72px)', padding: '48px 24px', background: '#FAFAF8',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'white', borderRadius: '12px',
        padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(28,26,22,0.08)',
      }}>

        {step === 'trust' && (
          <>
            <h1 style={titleStyle}>Verify your device</h1>
            <p style={subtitleStyle}>We sent a verification code to {email}</p>
            <form onSubmit={handleTrustVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={trustCode}
                  onChange={e => setTrustCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  style={inputStyle}
                />
              </div>
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          </>
        )}

        {step === 'mfa' && (
          <>
            <h1 style={titleStyle}>Two-factor verification</h1>
            <p style={subtitleStyle}>{mfaHint}</p>
            <form onSubmit={handleMfaVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Authentication code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={mfaCode}
                  onChange={e => setMfaCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder={mfaStrategy === 'backup_code' ? 'xxxxx-xxxxx' : '000000'}
                  style={inputStyle}
                />
              </div>
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading} style={btnStyle(loading)}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          </>
        )}

        {step === 'password' && (
          <>
            <h1 style={titleStyle}>Sign in</h1>
            <p style={subtitleStyle}>Welcome back to HiddenAtlas</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={inputStyle}
                />
              </div>
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading || !isLoaded} style={btnStyle(loading || !isLoaded)}>
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
            <p style={{ fontSize: '13px', color: '#6B6156', textAlign: 'center', marginTop: '20px' }}>
              Don't have an account?{' '}
              <Link
                to={redirectTo !== '/my-trips' ? `/sign-up?redirect=${encodeURIComponent(redirectTo)}` : '/sign-up'}
                style={{ color: '#1B6B65', fontWeight: '500', textDecoration: 'none' }}
              >
                Sign up
              </Link>
            </p>
          </>
        )}

      </div>
    </div>
  );
}
