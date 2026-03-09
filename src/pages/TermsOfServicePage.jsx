import { Link } from 'react-router-dom';

const LAST_UPDATED = 'March 2025';

export default function TermsOfServicePage() {
  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#F4F1EC', padding: 'clamp(48px, 7vw, 88px) 24px', borderBottom: '1px solid #E8E3DA' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '14px' }}>
            Legal
          </span>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: '600', color: '#1C1A16', lineHeight: '1.2', marginBottom: '12px' }}>
            Terms of Service
          </h1>
          <p style={{ fontSize: '14px', color: '#9C9488' }}>Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <PolicySection title="1. Acceptance of terms">
            <p>By accessing or using HiddenAtlas ("the Service"), you agree to be bound by these Terms of Service. If you do not agree, please do not use the Service.</p>
          </PolicySection>

          <PolicySection title="2. Products and digital goods">
            <p>HiddenAtlas sells digital travel itineraries. Upon successful payment, you receive a non-exclusive, non-transferable licence to use the itinerary for personal travel planning.</p>
            <ul>
              <li>Itineraries may not be resold, redistributed, or published without written permission.</li>
              <li>Access is granted to the purchasing account only.</li>
              <li>Content is provided "as is" — travel conditions, prices, and availability may change.</li>
            </ul>
          </PolicySection>

          <PolicySection title="3. User accounts">
            <p>You are responsible for maintaining the security of your account. HiddenAtlas is not liable for any loss resulting from unauthorised use of your account.</p>
          </PolicySection>

          <PolicySection title="4. Payments">
            <p>All purchases are processed securely by Stripe. Prices are displayed in EUR and are inclusive of applicable taxes. HiddenAtlas reserves the right to update pricing at any time; changes do not affect already-completed purchases.</p>
          </PolicySection>

          <PolicySection title="5. Intellectual property">
            <p>All content on HiddenAtlas — including itinerary text, images, routes, and recommendations — is the intellectual property of HiddenAtlas and may not be reproduced without consent.</p>
          </PolicySection>

          <PolicySection title="6. Limitation of liability">
            <p>HiddenAtlas provides travel itineraries for planning purposes only. We are not a travel agency and do not arrange bookings. We are not liable for any travel disruption, loss, injury, or dissatisfaction arising from use of our itineraries.</p>
          </PolicySection>

          <PolicySection title="7. Governing law">
            <p>These terms are governed by the laws of Portugal. Any disputes shall be subject to the exclusive jurisdiction of the courts of Portugal.</p>
          </PolicySection>

          <PolicySection title="8. Contact">
            <p>Questions about these terms? Email us at <a href="mailto:contact@hiddenatlas.travel" style={{ color: '#1B6B65', fontWeight: '600' }}>contact@hiddenatlas.travel</a>.</p>
          </PolicySection>

          <div style={{ marginTop: '48px', paddingTop: '32px', borderTop: '1px solid #E8E3DA' }}>
            <Link to="/" style={{ fontSize: '14px', color: '#1B6B65', fontWeight: '600' }}>← Back to HiddenAtlas</Link>
          </div>
        </div>
      </section>
    </div>
  );
}

function PolicySection({ title, children }) {
  return (
    <div style={{ marginBottom: '40px' }}>
      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>
        {title}
      </h2>
      <div style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.8', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  );
}
