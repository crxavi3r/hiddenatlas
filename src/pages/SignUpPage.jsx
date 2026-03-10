import { useState } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Email verification step
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError('');

    try {
      await signUp.create({ emailAddress: email, password, firstName });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setVerifying(true);
    } catch (err) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Erro ao criar conta.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify(e) {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError('');

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        navigate('/my-trips', { replace: true });
      } else {
        setError('Verificação incompleta. Tenta novamente.');
      }
    } catch (err) {
      const msg = err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Código inválido.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  const inputStyle = {
    padding: '10px 14px', borderRadius: '8px',
    border: '1.5px solid #E5E0D8', fontSize: '15px',
    outline: 'none', color: '#1C1A16', background: 'white',
  };

  const labelStyle = { fontSize: '13px', fontWeight: '500', color: '#1C1A16' };

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
        {verifying ? (
          <>
            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '24px', fontWeight: '600', color: '#1C1A16',
              marginBottom: '8px', textAlign: 'center',
            }}>
              Check your email
            </h1>
            <p style={{ fontSize: '14px', color: '#6B6156', textAlign: 'center', marginBottom: '28px' }}>
              We sent a verification code to {email}
            </p>

            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  style={inputStyle}
                />
              </div>

              {error && (
                <p style={{
                  fontSize: '13px', color: '#C0392B',
                  background: '#FDF2F2', border: '1px solid #F5C6C6',
                  borderRadius: '6px', padding: '10px 12px', margin: 0,
                }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '12px', borderRadius: '8px',
                  background: loading ? '#A8C5C3' : '#1B6B65',
                  color: 'white', fontWeight: '600', fontSize: '15px',
                  border: 'none', cursor: loading ? 'default' : 'pointer',
                  marginTop: '4px',
                }}
              >
                {loading ? 'Verifying…' : 'Verify email'}
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
              Create account
            </h1>
            <p style={{ fontSize: '14px', color: '#6B6156', textAlign: 'center', marginBottom: '28px' }}>
              Join HiddenAtlas
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={labelStyle}>First name</label>
                <input
                  type="text"
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  style={inputStyle}
                />
              </div>

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
                  autoComplete="new-password"
                  style={inputStyle}
                />
              </div>

              {error && (
                <p style={{
                  fontSize: '13px', color: '#C0392B',
                  background: '#FDF2F2', border: '1px solid #F5C6C6',
                  borderRadius: '6px', padding: '10px 12px', margin: 0,
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
                  marginTop: '4px',
                }}
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p style={{ fontSize: '13px', color: '#6B6156', textAlign: 'center', marginTop: '20px' }}>
              Already have an account?{' '}
              <Link to="/sign-in" style={{ color: '#1B6B65', fontWeight: '500', textDecoration: 'none' }}>
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
