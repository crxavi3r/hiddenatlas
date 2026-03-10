import { useState } from 'react';
import { useSignIn } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Device trust verification (needs_client_trust)
  const [trustCode, setTrustCode] = useState('');
  const [needsTrust, setNeedsTrust] = useState(false);

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

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/my-trips', { replace: true });
      } else if (result.status === 'needs_client_trust') {
        // Device verification: send email code
        await signIn.prepareFirstFactor({ strategy: 'email_code' });
        setNeedsTrust(true);
      } else {
        setError(`Unexpected status: ${result.status}`);
      }
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

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/my-trips', { replace: true });
      } else {
        setError(`Unexpected status: ${result.status}`);
      }
    } catch (err) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Invalid code.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 72px)', padding: '48px 24px',
      background: '#FAFAF8',
    }}>
      <div style={{
        width: '100%', maxWidth: '400px',
        background: 'white', borderRadius: '12px',
        padding: '40px 36px',
        boxShadow: '0 4px 24px rgba(28,26,22,0.08)',
      }}>
        {needsTrust ? (
          <>
            <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px', textAlign: 'center' }}>
              Verify your device
            </h1>
            <p style={{ fontSize: '14px', color: '#6B6156', textAlign: 'center', marginBottom: '28px' }}>
              We sent a verification code to {email}
            </p>
            <form onSubmit={handleTrustVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '500', color: '#1C1A16' }}>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={trustCode}
                  onChange={e => setTrustCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  style={{ padding: '10px 14px', borderRadius: '8px', border: '1.5px solid #E5E0D8', fontSize: '15px', outline: 'none', color: '#1C1A16', background: 'white' }}
                />
              </div>
              {error && (
                <p style={{ fontSize: '13px', color: '#C0392B', background: '#FDF2F2', border: '1px solid #F5C6C6', borderRadius: '6px', padding: '10px 12px', margin: 0 }}>
                  {error}
                </p>
              )}
              <button type="submit" disabled={loading} style={{ padding: '12px', borderRadius: '8px', background: loading ? '#A8C5C3' : '#1B6B65', color: 'white', fontWeight: '600', fontSize: '15px', border: 'none', cursor: loading ? 'default' : 'pointer', marginTop: '4px' }}>
                {loading ? 'Verifying…' : 'Verify'}
              </button>
            </form>
          </>
        ) : (
        <>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: '24px', fontWeight: '600', color: '#1C1A16',
          marginBottom: '8px', textAlign: 'center',
        }}>
          Sign in
        </h1>
        <p style={{ fontSize: '14px', color: '#6B6156', textAlign: 'center', marginBottom: '28px' }}>
          Welcome back to HiddenAtlas
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#1C1A16' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              style={{
                padding: '10px 14px', borderRadius: '8px',
                border: '1.5px solid #E5E0D8', fontSize: '15px',
                outline: 'none', color: '#1C1A16',
                background: 'white',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '13px', fontWeight: '500', color: '#1C1A16' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              style={{
                padding: '10px 14px', borderRadius: '8px',
                border: '1.5px solid #E5E0D8', fontSize: '15px',
                outline: 'none', color: '#1C1A16',
                background: 'white',
              }}
            />
          </div>

          {error && (
            <p style={{
              fontSize: '13px', color: '#C0392B',
              background: '#FDF2F2', border: '1px solid #F5C6C6',
              borderRadius: '6px', padding: '10px 12px',
              margin: 0,
            }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !isLoaded}
            style={{
              padding: '12px', borderRadius: '8px',
              background: loading ? '#A8C5C3' : '#1B6B65',
              color: 'white', fontWeight: '600', fontSize: '15px',
              border: 'none', cursor: loading ? 'default' : 'pointer',
              transition: 'background 0.2s',
              marginTop: '4px',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p style={{ fontSize: '13px', color: '#6B6156', textAlign: 'center', marginTop: '20px' }}>
          Don't have an account?{' '}
          <Link to="/sign-up" style={{ color: '#1B6B65', fontWeight: '500', textDecoration: 'none' }}>
            Sign up
          </Link>
        </p>
        </>
        )}
      </div>
    </div>
  );
}
