import { SignUp } from '@clerk/clerk-react';

export default function SignUpPage() {
  return (
    <div style={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 72px)', padding: '48px 24px',
      background: '#FAFAF8',
    }}>
      <SignUp routing="path" path="/sign-up" />
    </div>
  );
}
