import { SignIn, ClerkLoading, ClerkLoaded } from '@clerk/clerk-react';

export default function SignInPage() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 72px)', padding: '48px 24px',
      background: '#FAFAF8',
    }}>
      {/* DEBUG — remove once Clerk renders correctly */}
      <p style={{ fontSize: '12px', color: '#9C9488', marginBottom: '24px', fontFamily: 'monospace' }}>
        DEBUG: SignInPage mounted · key prefix: {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY?.slice(0, 8) ?? 'MISSING'}
      </p>

      <ClerkLoading>
        <p style={{ fontSize: '14px', color: '#6B6156' }}>Loading Clerk…</p>
      </ClerkLoading>

      <ClerkLoaded>
        <SignIn routing="path" path="/sign-in" />
      </ClerkLoaded>
    </div>
  );
}
