import { Link } from 'react-router-dom';

const LAST_UPDATED = 'March 2026';

export default function RefundPolicyPage() {
  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '100vh' }}>

      {/* Hero */}
      <section style={{ background: '#F4F1EC', padding: 'clamp(48px, 7vw, 88px) 24px', borderBottom: '1px solid #E8E3DA' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '14px' }}>
            Legal
          </span>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 42px)', fontWeight: '600', color: '#1C1A16', lineHeight: '1.2', marginBottom: '12px' }}>
            Refund Policy
          </h1>
          <p style={{ fontSize: '14px', color: '#9C9488' }}>Last updated: {LAST_UPDATED}</p>
        </div>
      </section>

      {/* Content */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>

          {/* Summary callout */}
          <div style={{
            background: '#F4F1EC', borderRadius: '8px',
            padding: '24px 28px', marginBottom: '48px',
            borderLeft: '3px solid #1B6B65',
          }}>
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
              Our commitment
            </p>
            <p style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.7' }}>
              We stand behind the quality of every itinerary. If you believe you have a valid reason for a refund, contact us within 7 days of purchase and we will evaluate your request fairly and promptly.
            </p>
          </div>

          <PolicySection title="1. Digital goods and right of withdrawal">
            <p>HiddenAtlas sells digital travel itineraries delivered immediately upon purchase. In accordance with Article 16(m) of EU Directive 2011/83/EU, by completing your purchase and accessing or downloading your itinerary, you expressly consent to the immediate supply of digital content and acknowledge that you thereby waive your statutory right of withdrawal.</p>
            <p>As a result, refunds are generally not available once an itinerary has been downloaded or substantially accessed. We evaluate all refund requests individually, and refunds outside the eligible cases listed below are issued at our sole discretion.</p>
          </PolicySection>

          <PolicySection title="2. Eligible refund situations">
            <p>We will issue a full refund in the following cases:</p>
            <ul>
              <li>You were charged but never received access to your itinerary due to a technical failure on our side.</li>
              <li>You were charged more than once for the same purchase (duplicate charge).</li>
              <li>The itinerary content is materially different from what was described on the product page.</li>
            </ul>
            <p>In all cases, we may request supporting information (such as confirmation of non-access or evidence of a duplicate charge) before processing a refund.</p>
          </PolicySection>

          <PolicySection title="3. Non-refundable situations">
            <p>Refunds will not be issued in the following circumstances:</p>
            <ul>
              <li>The itinerary has been downloaded or substantially accessed.</li>
              <li>More than 7 days have passed since the purchase date.</li>
              <li>Dissatisfaction based on personal travel preferences that were not misrepresented in the product description.</li>
              <li>The request appears to involve purchasing an itinerary, accessing the content, and then seeking a refund without a qualifying technical or content issue.</li>
            </ul>
            <p>HiddenAtlas reserves the right to decline refund requests that show evidence of content access followed by a refund claim without a legitimate basis. Repeated patterns of this behaviour may result in account suspension.</p>
          </PolicySection>

          <PolicySection title="4. Custom planning requests">
            <p>Custom trip planning fees are non-refundable once planning work has commenced. If you cancel before work begins, a full refund will be issued.</p>
          </PolicySection>

          <PolicySection title="5. How to request a refund">
            <p>Email us at <a href="mailto:contact@hiddenatlas.travel" style={{ color: '#1B6B65', fontWeight: '600' }}>contact@hiddenatlas.travel</a> with:</p>
            <ul>
              <li>Your name and the email used at purchase.</li>
              <li>The itinerary name and purchase date.</li>
              <li>A brief description of the issue.</li>
            </ul>
            <p>We aim to respond within 2 business days. Approved refunds are processed via Stripe and typically appear within 5–10 business days.</p>
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
