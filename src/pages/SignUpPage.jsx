import { useState } from 'react';
import { useSignUp } from '@clerk/clerk-react';
import { useNavigate, Link } from 'react-router-dom';

const inputStyle = {
  padding: '10px 14px',
  borderRadius: '8px',
  border: '1.5px solid #E5E0D8',
  fontSize: '15px',
  outline: 'none',
  color: '#1C1A16',
  background: 'white',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle = {
  fontSize: '13px',
  fontWeight: '500',
  color: '#1C1A16',
};

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const errorStyle = {
  fontSize: '13px',
  color: '#C0392B',
  background: '#FDF2F2',
  border: '1px solid #F5C6C6',
  borderRadius: '6px',
  padding: '10px 12px',
  margin: 0,
};

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isLoaded) return;
    setLoading(true);
    setError('');
    try {
      await signUp.create({ emailAddress: email, password, firstName, lastName });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setVerifying(true);
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Could not create account.');
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
        setError('Verification incomplete. Please try again.');
      }
    } catch (err) {
      setError(err.errors?.[0]?.longMessage || err.errors?.[0]?.message || 'Invalid code.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: 'calc(100vh - 72px)',
      padding: '48px 24px',
      background: '#FAFAF8',
    }}>
      <style>{`
        .signup-name-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
        }
        @media (max-width: 480px) {
          .signup-name-row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div style={{
        width: '100%',
        maxWidth: '480px',
        background: 'white',
        borderRadius: '12px',
        padding: '44px 40px',
        boxShadow: '0 4px 24px rgba(28,26,22,0.08)',
        boxSizing: 'border-box',
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
            <p style={{ fontSize: '14px', color: '#6B6156', textAlign: 'center', marginBottom: '32px' }}>
              We sent a 6-digit code to <strong style={{ color: '#1C1A16' }}>{email}</strong>
            </p>

            <form onSubmit={handleVerify} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Verification code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  required
                  autoComplete="one-time-code"
                  autoFocus
                  placeholder="000000"
                  style={{ ...inputStyle, letterSpacing: '0.15em', fontSize: '18px' }}
                />
              </div>

              {error && <p style={errorStyle}>{error}</p>}

              <button
                type="submit"
                disabled={loading}
                style={{
                  padding: '13px',
                  borderRadius: '8px',
                  background: loading ? '#A8C5C3' : '#1B6B65',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                  border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                  width: '100%',
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
              fontSize: '26px', fontWeight: '600', color: '#1C1A16',
              marginBottom: '8px', textAlign: 'center',
            }}>
              Create account
            </h1>
            <p style={{ fontSize: '14px', color: '#6B6156', textAlign: 'center', marginBottom: '32px' }}>
              Join HiddenAtlas
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

              <div className="signup-name-row">
                <div style={fieldStyle}>
                  <label style={labelStyle}>First name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    style={inputStyle}
                  />
                </div>
                <div style={fieldStyle}>
                  <label style={labelStyle}>Last name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    autoComplete="family-name"
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={fieldStyle}>
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

              <div style={fieldStyle}>
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

              {error && <p style={errorStyle}>{error}</p>}

              <button
                type="submit"
                disabled={loading || !isLoaded}
                style={{
                  padding: '13px',
                  borderRadius: '8px',
                  background: loading ? '#A8C5C3' : '#1B6B65',
                  color: 'white',
                  fontWeight: '600',
                  fontSize: '15px',
                  border: 'none',
                  cursor: loading ? 'default' : 'pointer',
                  width: '100%',
                  marginTop: '4px',
                }}
              >
                {loading ? 'Creating account…' : 'Create account'}
              </button>
            </form>

            <p style={{ fontSize: '13px', color: '#6B6156', textAlign: 'center', marginTop: '24px' }}>
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
