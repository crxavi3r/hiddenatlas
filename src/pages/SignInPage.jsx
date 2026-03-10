import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { SignIn, ClerkLoading, ClerkLoaded } from '@clerk/clerk-react';

export default function SignInPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const navigate = useNavigate();

  // Fallback redirect: if Clerk completes auth but routerPush fails, navigate imperatively.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      navigate('/my-trips', { replace: true });
    }
  }, [isLoaded, isSignedIn]);

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 72px)', padding: '48px 24px',
      background: '#FAFAF8',
    }}>
      <ClerkLoading>
        <p style={{ fontSize: '14px', color: '#6B6156' }}>Loading…</p>
      </ClerkLoading>

      <ClerkLoaded>
        <SignIn
          routing="path"
          path="/sign-in"
          forceRedirectUrl="/my-trips"
        />
      </ClerkLoaded>
    </div>
  );
}
