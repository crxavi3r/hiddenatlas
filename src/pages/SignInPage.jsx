import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { SignIn, ClerkLoading, ClerkLoaded } from '@clerk/clerk-react';

export default function SignInPage() {
  const { pathname } = useLocation();

  // [DEBUG]
  useEffect(() => {
    console.log('[SignInPage] mounted — pathname:', pathname);
    return () => {
      console.log('[SignInPage] unmounted — was at pathname:', pathname);
    };
  }, []);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 72px)', padding: '48px 24px',
      background: '#FAFAF8',
    }}>
      <ClerkLoading>
        {/* [DEBUG] */}
        {console.log('[SignInPage] ClerkLoading rendering — pathname:', pathname) || null}
        <p style={{ fontSize: '14px', color: '#6B6156' }}>Loading…</p>
      </ClerkLoading>

      <ClerkLoaded>
        {/* [DEBUG] */}
        {console.log('[SignInPage] ClerkLoaded rendering — pathname:', pathname) || null}
        <SignIn
          routing="path"
          path="/sign-in"
          forceRedirectUrl="/my-trips"
        />
      </ClerkLoaded>
    </div>
  );
}
