import { SignIn, ClerkLoading, ClerkLoaded } from '@clerk/clerk-react';

export default function SignInPage() {
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
