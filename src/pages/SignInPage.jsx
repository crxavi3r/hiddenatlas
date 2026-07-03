import { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useSEO } from '../hooks/useSEO';

// steps: 'password' | 'trust' | 'mfa-pick' | 'mfa'
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

  // MFA
  const [mfaOptions, setMfaOptions] = useState([]); // non-backup factors available
  const [hasBackup, setHasBackup] = useState(false);
  const [mfaFactor, setMfaFactor] = useState(null); // currently active factor object
  const [mfaCode, setMfaCode] = useState('');

  // ─── helpers ────────────────────────────────────────────────────────────────

  async function enterMfa(allFactors) {
    const main = allFactors.filter(f => f.strategy !== 'backup_code');
    const backup = allFactors.find(f => f.strategy === 'backup_code') ?? null;
    setMfaOptions(main);
    setHasBackup(!!backup);

    if (main.length === 0 && backup) {
      // Edge case: only backup code is available
      setMfaFactor(backup);
      setStep('mfa');
    } else if (main.length === 1) {
      await selectFactor(main[0], false);
    } else {
      setStep('mfa-pick');
    }
  }

  async function selectFactor(factor, fromPick = true) {
    setError('');
    setMfaCode('');
    setMfaFactor(factor);
    await prepareCodeFactor(factor);
    setStep('mfa');
  }

  async function prepareCodeFactor(factor) {
    const needsPrepare =
      (factor.strategy === 'phone_code' && factor.phoneNumberId) ||
      (factor.strategy === 'email_code' && factor.emailAddressId);
    if (!needsPrepare) return;
    setLoading(true);
    try {
      if (factor.strategy === 'phone_code') {
        await signIn.prepareSecondFactor({ strategy: 'phone_code', phoneNumberId: factor.phoneNumberId });
      } else {
        await signIn.prepareSecondFactor({ strategy: 'email_code', emailAddressId: factor.emailAddressId });
      }
    } catch (err) {
      setError('Não foi possível enviar o código. Tenta novamente.');
    } finally {
      setLoading(false);
    }
  }

  function useBackupCode() {
    setMfaFactor({ strategy: 'backup_code' });
    setMfaCode('');
    setError('');
    setStep('mfa');
  }

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
      const allFactors = result.supportedSecondFactors || signIn.supportedSecondFactors || [];
      await enterMfa(allFactors);
    } else {
      if (import.meta.env.DEV) console.warn('[SignIn] Unexpected status:', result.status);
      setError('Algo correu mal. Tenta novamente ou contacta o suporte.');
    }
  }

  // ─── submit handlers ────────────────────────────────────────────────────────

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
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Email ou palavra-passe incorretos.';
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
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Código inválido ou expirado.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleMfaVerify(e) {
    e.preventDefault();
    if (!isLoaded || !mfaFactor) return;
    setLoading(true);
    setError('');
    try {
      const result = await signIn.attemptSecondFactor({ strategy: mfaFactor.strategy, code: mfaCode });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate(redirectTo, { replace: true });
      } else {
        if (import.meta.env.DEV) console.warn('[SignIn] MFA unexpected status:', result.status);
        setError('Algo correu mal. Tenta novamente.');
      }
    } catch (err) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Código inválido ou expirado. Tenta novamente.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ─── styles ──────────────────────────────────────────────────────────────────

  const inputStyle = {
    padding: '10px 14px', borderRadius: '8px',
    border: '1.5px solid #E5E0D8', fontSize: '15px',
    outline: 'none', color: '#1C1A16',
    background: 'white', width: '100%', boxSizing: 'border-box',
  };
  const btnPrimary = (disabled) => ({
    padding: '12px', borderRadius: '8px',
    background: disabled ? '#A8C5C3' : '#1B6B65',
    color: 'white', fontWeight: '600', fontSize: '15px',
    border: 'none', cursor: disabled ? 'default' : 'pointer',
    transition: 'background 0.2s', marginTop: '4px', width: '100%',
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
  const linkBtnStyle = {
    background: 'none', border: 'none', color: '#1B6B65',
    fontSize: '13px', fontWeight: '500', cursor: 'pointer',
    padding: 0, textDecoration: 'underline',
  };

  // ─── MFA copy ─────────────────────────────────────────────────────────────────

  const strategy = mfaFactor?.strategy;
  const mfaTitle = strategy === 'backup_code' ? 'Código de recuperação' : 'Verificação em dois passos';
  const mfaHint = {
    totp: 'Introduz o código de 6 dígitos da tua app de autenticação (Google Authenticator, Authy, etc.).',
    phone_code: 'Enviámos um código de verificação para o teu número de telemóvel.',
    email_code: 'Enviámos um código de verificação para o teu email.',
    backup_code: 'Introduz um dos teus códigos de recuperação.',
  }[strategy] ?? 'Introduz o código de autenticação para continuar.';
  const mfaPlaceholder = strategy === 'backup_code' ? 'xxxxx-xxxxx' : '000000';
  const mfaInputMode = strategy === 'backup_code' ? 'text' : 'numeric';
  const canResend = strategy === 'phone_code' || strategy === 'email_code';

  const STRATEGY_LABELS = {
    totp: 'App de autenticação',
    phone_code: 'Código por SMS',
    email_code: 'Código por email',
  };

  // ─── render ──────────────────────────────────────────────────────────────────

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

        {/* ── PASSWORD ── */}
        {step === 'password' && (
          <>
            <h1 style={titleStyle}>Sign in</h1>
            <p style={subtitleStyle}>Welcome back to HiddenAtlas</p>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoComplete="email" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required autoComplete="current-password" style={inputStyle} />
              </div>
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading || !isLoaded} style={btnPrimary(loading || !isLoaded)}>
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

        {/* ── DEVICE TRUST ── */}
        {step === 'trust' && (
          <>
            <h1 style={titleStyle}>Verify your device</h1>
            <p style={subtitleStyle}>We sent a verification code to {email}</p>
            <form onSubmit={handleTrustVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Verification code</label>
                <input type="text" inputMode="numeric" value={trustCode}
                  onChange={e => setTrustCode(e.target.value)}
                  required autoComplete="one-time-code" autoFocus style={inputStyle} />
              </div>
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading} style={btnPrimary(loading)}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          </>
        )}

        {/* ── MFA METHOD PICKER (only when 2+ methods available) ── */}
        {step === 'mfa-pick' && (
          <>
            <h1 style={titleStyle}>Verificação em dois passos</h1>
            <p style={subtitleStyle}>Escolhe como queres receber o teu código.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {mfaOptions.map(factor => (
                <button
                  key={factor.strategy}
                  onClick={() => selectFactor(factor)}
                  disabled={loading}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px', borderRadius: '8px',
                    border: '1.5px solid #E5E0D8', background: 'white',
                    cursor: loading ? 'default' : 'pointer', fontSize: '14px',
                    fontWeight: '500', color: '#1C1A16',
                    transition: 'border-color 0.15s, background 0.15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#1B6B65'; e.currentTarget.style.background = '#F4FAF9'; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E0D8'; e.currentTarget.style.background = 'white'; }}
                >
                  <span>{STRATEGY_LABELS[factor.strategy] ?? factor.strategy}</span>
                  <span style={{ color: '#1B6B65', fontSize: '18px' }}>›</span>
                </button>
              ))}
              {hasBackup && (
                <button onClick={useBackupCode} style={{ ...linkBtnStyle, marginTop: '8px', textAlign: 'center' }}>
                  Usar código de recuperação
                </button>
              )}
              {error && <p style={errorStyle}>{error}</p>}
            </div>
          </>
        )}

        {/* ── MFA CODE ENTRY ── */}
        {step === 'mfa' && (
          <>
            <h1 style={titleStyle}>{mfaTitle}</h1>
            <p style={subtitleStyle}>{mfaHint}</p>
            <form onSubmit={handleMfaVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>
                  {strategy === 'backup_code' ? 'Código de recuperação' : 'Código de autenticação'}
                </label>
                <input
                  type="text"
                  inputMode={mfaInputMode}
                  value={mfaCode}
                  onChange={e => setMfaCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder={mfaPlaceholder}
                  style={inputStyle}
                />
              </div>
              {error && <p style={errorStyle}>{error}</p>}
              <button type="submit" disabled={loading} style={btnPrimary(loading)}>
                {loading ? 'A verificar…' : 'Verificar'}
              </button>
            </form>

            {/* ── fallback options ── */}
            <div style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              {/* Resend for email/SMS */}
              {canResend && (
                <button
                  onClick={async () => { setError(''); await prepareCodeFactor(mfaFactor); }}
                  disabled={loading}
                  style={linkBtnStyle}
                >
                  {loading ? 'A enviar…' : 'Reenviar código'}
                </button>
              )}
              {/* Back to picker if came from multi-option flow */}
              {mfaOptions.length > 1 && strategy !== 'backup_code' && (
                <button onClick={() => { setError(''); setStep('mfa-pick'); }} style={linkBtnStyle}>
                  ← Escolher outro método
                </button>
              )}
              {/* Offer backup code if not already using it */}
              {hasBackup && strategy !== 'backup_code' && (
                <button onClick={useBackupCode} style={linkBtnStyle}>
                  Não tens acesso? Usar código de recuperação
                </button>
              )}
              {/* No backup available — contact admin message */}
              {!hasBackup && strategy !== 'backup_code' && (
                <p style={{ fontSize: '12px', color: '#9A8E82', textAlign: 'center', margin: 0 }}>
                  Sem acesso? Contacta o administrador.
                </p>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
