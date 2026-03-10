import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { useEffect } from 'react';
import './index.css';
import App from './App.jsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

// [DEBUG] Watches auth state + pathname on every change.
// Remove after diagnosis.
function AuthWatcher() {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    console.log('[AuthWatcher]', { pathname, isLoaded, isSignedIn, userId: userId ?? null });
  }, [pathname, isLoaded, isSignedIn, userId]);

  return null;
}

function ClerkWithRouter({ children }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  // [DEBUG]
  useEffect(() => {
    console.log('[ClerkWithRouter] mounted — pathname:', pathname);
  }, []);

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => {
        console.log('[ClerkProvider] routerPush called — to:', to);
        navigate(to);
      }}
      routerReplace={(to) => {
        console.log('[ClerkProvider] routerReplace called — to:', to);
        navigate(to, { replace: true });
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/my-trips"
      signUpFallbackRedirectUrl="/my-trips"
      afterSignOutUrl="/"
    >
      <AuthWatcher />
      {children}
    </ClerkProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <BrowserRouter>
        <ClerkWithRouter>
          <App />
        </ClerkWithRouter>
      </BrowserRouter>
    ) : (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#FAFAF8', fontFamily: "'Inter', system-ui, sans-serif", padding: '24px',
      }}>
        <div style={{ maxWidth: '440px', textAlign: 'center' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
            Configuration required
          </h1>
          <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.7' }}>
            Add <code style={{ background: '#F4F1EC', padding: '2px 8px', borderRadius: '4px', fontSize: '13px' }}>
              VITE_CLERK_PUBLISHABLE_KEY
            </code> to your Vercel environment variables, then redeploy.
          </p>
        </div>
      </div>
    )}
  </StrictMode>,
);
