import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle } from 'lucide-react';

export function CustomRequestPaymentSuccessPage() {
  const { id }                 = useParams();
  const [searchParams]         = useSearchParams();
  const sessionId              = searchParams.get('session_id');

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(28,26,22,0.08)', border: '1px solid #EDE8E0' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={28} color="#1B6B65" strokeWidth={1.75} />
        </div>

        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
          Payment confirmed
        </h1>
        <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7', marginBottom: '8px' }}>
          Your custom trip planning fee has been received. Your travel designer will now start building your personalised itinerary.
        </p>
        <p style={{ fontSize: '14px', color: '#8C8070', lineHeight: '1.6', marginBottom: '32px' }}>
          You'll receive a confirmation email shortly. If you have any questions, simply reply to that email.
        </p>

        <Link
          to="/"
          style={{
            display: 'inline-block',
            background: '#1B6B65', color: 'white',
            textDecoration: 'none',
            padding: '12px 28px', borderRadius: '8px',
            fontSize: '14px', fontWeight: '600',
          }}
        >
          Back to HiddenAtlas
        </Link>

        {sessionId && (
          <p style={{ fontSize: '11px', color: '#C4BDB4', marginTop: '20px' }}>
            Reference: {sessionId}
          </p>
        )}
      </div>
    </div>
  );
}

export function CustomRequestPaymentCancelledPage() {
  const { id } = useParams();

  return (
    <div style={{ minHeight: '100vh', background: '#FAFAF8', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px' }}>
      <div style={{ background: 'white', borderRadius: '16px', padding: '48px 40px', maxWidth: '480px', width: '100%', textAlign: 'center', boxShadow: '0 4px 24px rgba(28,26,22,0.08)', border: '1px solid #EDE8E0' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#FFF1F1', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <XCircle size={28} color="#B91C1C" strokeWidth={1.75} />
        </div>

        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
          Payment cancelled
        </h1>
        <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7', marginBottom: '32px' }}>
          Your payment was not completed. No charge has been made. The payment link in your quote email remains valid — you can use it at any time.
        </p>

        <Link
          to="/"
          style={{
            display: 'inline-block',
            background: '#1C1A16', color: 'white',
            textDecoration: 'none',
            padding: '12px 28px', borderRadius: '8px',
            fontSize: '14px', fontWeight: '600',
          }}
        >
          Back to HiddenAtlas
        </Link>
      </div>
    </div>
  );
}
