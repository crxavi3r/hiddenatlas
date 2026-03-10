import { SignUp, ClerkLoading, ClerkLoaded } from '@clerk/clerk-react';

export default function SignUpPage() {
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
        <SignUp
          routing="path"
          path="/sign-up"
          forceRedirectUrl="/my-trips"
        />
      </ClerkLoaded>
    </div>
  );
}
