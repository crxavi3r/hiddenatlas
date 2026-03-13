import { Link } from 'react-router-dom';

const LAST_UPDATED = 'March 2026';

export default function PrivacyPolicyPage() {
  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#F4F1EC', padding: 'clamp(48px, 7vw, 88px) 24px', borderBottom: '1px solid #E8E3DA' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '14px' }}>
            Legal
          </span>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: '600', color: '#1C1A16', lineHeight: '1.2', marginBottom: '12px' }}>
            Privacy Policy
          </h1>
          <p style={{ fontSize: '14px', color: '#9C9488' }}>Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <PolicySection title="1. Data controller">
            <p>HiddenAtlas is operated by HiddenAtlas Travel, based in Portugal. We are the data controller responsible for your personal data collected through this website.</p>
            <p>For any data protection enquiries, contact us at: <a href="mailto:contact@hiddenatlas.travel" style={{ color: '#1B6B65', fontWeight: '600' }}>contact@hiddenatlas.travel</a></p>
          </PolicySection>

          <PolicySection title="2. Information we collect">
            <p>When you visit HiddenAtlas or purchase an itinerary, we may collect:</p>
            <ul>
              <li>Account information (name, email address) provided during sign-up via Clerk.</li>
              <li>Purchase details (itinerary purchased, transaction amount, date) processed via Stripe.</li>
              <li>Usage data such as pages visited and browser type, collected anonymously.</li>
            </ul>
            <p>We do not store payment card details. All payment data is handled securely by Stripe.</p>
          </PolicySection>

          <PolicySection title="3. How we use your information">
            <ul>
              <li>To deliver your purchased itineraries and manage your account.</li>
              <li>To send transactional emails (order confirmation, itinerary access).</li>
              <li>To respond to custom planning enquiries submitted via the contact form.</li>
              <li>To improve the website and our content over time.</li>
            </ul>
            <p>We do not sell, rent, or trade your personal information to third parties.</p>
          </PolicySection>

          <PolicySection title="4. Legal basis for processing">
            <p>We process your personal data on the following legal bases under the GDPR:</p>
            <ul>
              <li><strong>Contractual necessity</strong>: processing your account information and purchase details is required to fulfil your order and provide access to purchased itineraries.</li>
              <li><strong>Legitimate interests</strong>: we use anonymised usage data to improve our website and content, in a way that does not override your rights and freedoms.</li>
              <li><strong>Legal obligations</strong>: we retain purchase records to comply with applicable accounting and tax regulations.</li>
            </ul>
          </PolicySection>

          <PolicySection title="5. Third-party services">
            <p>HiddenAtlas uses the following third-party services which have their own privacy policies:</p>
            <ul>
              <li><strong>Clerk</strong>: authentication and account management.</li>
              <li><strong>Stripe</strong>: payment processing.</li>
              <li><strong>Resend</strong>: transactional email delivery.</li>
              <li><strong>Vercel</strong>: website hosting and analytics.</li>
            </ul>
          </PolicySection>

          <PolicySection title="6. Cookies">
            <p>We use essential cookies required for authentication (Clerk) and secure checkout (Stripe). We do not use advertising or tracking cookies.</p>
          </PolicySection>

          <PolicySection title="7. Data retention">
            <p>Your account data is retained for as long as your account is active. You may request deletion of your personal data at any time by emailing us.</p>
            <p>Purchase records (transaction amounts, dates, and associated email addresses) are retained for a minimum of seven years to comply with Portuguese and EU accounting and tax obligations, even if your account is deleted.</p>
          </PolicySection>

          <PolicySection title="8. International data transfers">
            <p>Some of our third-party service providers (Clerk, Stripe, Resend, Vercel) may process your data outside the European Economic Area (EEA). Where this occurs, we rely on Standard Contractual Clauses approved by the European Commission, or equivalent safeguards, to ensure your data receives an adequate level of protection.</p>
          </PolicySection>

          <PolicySection title="9. Your rights">
            <p>If you are located in the European Economic Area, you have the following rights regarding your personal data:</p>
            <ul>
              <li><strong>Right of access</strong>: request a copy of the personal data we hold about you.</li>
              <li><strong>Right to rectification</strong>: request correction of inaccurate or incomplete data.</li>
              <li><strong>Right to erasure</strong>: request deletion of your personal data, subject to legal retention obligations.</li>
              <li><strong>Right to restriction of processing</strong>: request that we limit how we use your data in certain circumstances.</li>
              <li><strong>Right to data portability</strong>: receive your personal data in a structured, machine-readable format.</li>
              <li><strong>Right to object</strong>: object to processing based on legitimate interests.</li>
            </ul>
            <p>To exercise any of these rights, contact us at: <a href="mailto:contact@hiddenatlas.travel" style={{ color: '#1B6B65', fontWeight: '600' }}>contact@hiddenatlas.travel</a></p>
            <p>You also have the right to lodge a complaint with the Portuguese data protection authority, the <strong>Comissão Nacional de Proteção de Dados (CNPD)</strong>, at <a href="https://www.cnpd.pt" target="_blank" rel="noopener noreferrer" style={{ color: '#1B6B65', fontWeight: '600' }}>www.cnpd.pt</a>.</p>
          </PolicySection>

          <PolicySection title="10. Changes to this policy">
            <p>We may update this policy from time to time. Continued use of the site after changes constitutes acceptance of the updated policy.</p>
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
