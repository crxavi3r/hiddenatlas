import { SignIn } from '@clerk/clerk-react';

export default function SignInPage() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 72px)', padding: '48px 24px',
      background: '#FAFAF8',
    }}>
      <SignIn routing="path" path="/sign-in" />
    </div>
  );
}
