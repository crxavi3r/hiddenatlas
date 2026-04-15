import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, useNavigate } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import './index.css';
import App from './App.jsx';
import { UserCtxProvider } from './lib/useUserCtx.jsx';

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

function ClerkWithRouter({ children }) {
  const navigate = useNavigate();

  return (
    <ClerkProvider
      publishableKey={PUBLISHABLE_KEY}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/my-trips"
      signUpFallbackRedirectUrl="/my-trips"
      afterSignOutUrl="/"
    >
      {children}
    </ClerkProvider>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {PUBLISHABLE_KEY ? (
      <BrowserRouter>
        <ClerkWithRouter>
          <UserCtxProvider>
            <App />
          </UserCtxProvider>
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
