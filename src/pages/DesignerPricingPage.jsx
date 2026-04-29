import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowRight, Check, MessageCircle } from 'lucide-react';

export default function DesignerPricingPage() {
  const { slug } = useParams();
  const [designer, setDesigner] = useState(null);
  const [plans,    setPlans]    = useState(null); // null = loading
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/creators?action=get&slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.creator) setDesigner(data.creator);
        else setNotFound(true);
      })
      .catch(() => setNotFound(true));
  }, [slug]);

  useEffect(() => {
    if (!slug) return;
    fetch(`/api/pricing-plans?action=list-public&designerSlug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : { plans: [] })
      .then(data => {
        // Only show custom trip plans (not Premium Itinerary / digital)
        const custom = (data.plans || []).filter(p => p.planType !== 'digital');
        setPlans(custom);
      })
      .catch(() => setPlans([]));
  }, [slug]);

  if (notFound) {
    return (
      <div style={{ padding: '80px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '16px', color: '#8C8070' }}>Designer not found.</p>
        <Link to="/custom" style={{ color: '#1B6B65', fontSize: '14px' }}>Browse all designers</Link>
      </div>
    );
  }

  const loading = !designer || plans === null;

  return (
    <div style={{ background: '#FAFAF8', minHeight: '60vh' }}>

      {/* Hero */}
      <section style={{ background: '#1C1A16', padding: 'clamp(48px, 6vw, 72px) 24px' }}>
        <div style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
          {designer?.avatarUrl && (
            <img
              src={designer.avatarUrl}
              alt={designer.name}
              style={{ width: '72px', height: '72px', borderRadius: '50%',
                objectFit: 'cover', border: '2px solid rgba(201,169,110,0.4)',
                marginBottom: '20px' }}
            />
          )}
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '2px',
            textTransform: 'uppercase', color: '#C9A96E',
            marginBottom: loading ? '12px' : '8px' }}>
            Custom Trip Pricing
          </p>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: '600',
            color: 'white', marginBottom: '12px', lineHeight: '1.25' }}>
            {loading ? ' ' : `Plan a trip with ${designer.name}`}
          </h1>
          {designer?.bio && (
            <p style={{ fontSize: '15px', color: 'rgba(255,255,255,0.5)',
              maxWidth: '480px', margin: '0 auto', lineHeight: '1.7' }}>
              {designer.bio}
            </p>
          )}
        </div>
      </section>

      {/* Plans */}
      <section style={{ padding: 'clamp(48px, 6vw, 72px) 24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>

          {loading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '24px' }}>
              {[1, 2].map(i => (
                <div key={i} style={{ background: 'white', borderRadius: '12px',
                  border: '1px solid #E8E3DA', height: '260px', opacity: 0.4 }} />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: '16px', color: '#8C8070', marginBottom: '20px' }}>
                Pricing is available on request for this designer.
              </p>
              <Link
                to={`/custom?designer=${slug}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px',
                  padding: '12px 24px', borderRadius: '4px', background: '#1B6B65',
                  color: 'white', fontSize: '13px', fontWeight: '600',
                  textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.5px' }}
              >
                Get in touch <ArrowRight size={13} />
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid',
              gridTemplateColumns: plans.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: '24px', alignItems: 'stretch', maxWidth: plans.length === 1 ? '420px' : 'none',
              margin: plans.length === 1 ? '0 auto' : undefined }}>
              {plans.map(plan => (
                <PlanCard key={plan.id} plan={plan} designerSlug={slug} />
              ))}
            </div>
          )}

          {plans && plans.length > 0 && (
            <p style={{ textAlign: 'center', fontSize: '12.5px', color: '#B5AA99',
              marginTop: '32px', lineHeight: '1.6' }}>
              One-time planning fee · Not per person · No booking commissions
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function PlanCard({ plan, designerSlug }) {
  const priceEuros = plan.priceCents != null ? plan.priceCents / 100 : null;

  function travelerRange() {
    const hasMin = plan.travelerMin != null;
    const hasMax = plan.travelerMax != null;
    if (hasMin && hasMax) return `${plan.travelerMin}–${plan.travelerMax} travellers`;
    if (hasMin)           return `${plan.travelerMin}+ travellers`;
    if (hasMax)           return `Up to ${plan.travelerMax} travellers`;
    return null;
  }

  const range = travelerRange();

  return (
    <div style={{ background: 'white', border: '1px solid #E8E3DA', borderRadius: '12px',
      padding: '32px 28px', display: 'flex', flexDirection: 'column' }}>

      {plan.audienceLabel && (
        <p style={{ fontSize: '10.5px', fontWeight: '700', color: '#B5AA99',
          textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '6px' }}>
          {plan.audienceLabel}
        </p>
      )}

      <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>
        {plan.name}
      </h2>

      {range && (
        <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '16px' }}>
          {range}
        </p>
      )}

      {/* Price */}
      <div style={{ marginBottom: '20px', minHeight: '44px', display: 'flex', alignItems: 'flex-end' }}>
        {plan.isCustomQuote ? (
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '20px', color: '#8C8070', fontStyle: 'italic' }}>
            Custom quote
          </span>
        ) : priceEuros != null ? (
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '36px', fontWeight: '700', color: '#1B6B65', lineHeight: 1 }}>
            {plan.displayPrice}
          </span>
        ) : null}
      </div>

      {plan.description && (
        <p style={{ fontSize: '13.5px', color: '#6B6156', lineHeight: '1.6',
          marginBottom: '24px', flex: 1 }}>
          {plan.description}
        </p>
      )}

      <Link
        to={`/custom?designer=${encodeURIComponent(designerSlug)}`}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          padding: '12px 20px', borderRadius: '4px',
          background: plan.isCustomQuote ? '#F4F1EC' : '#1B6B65',
          color: plan.isCustomQuote ? '#1C1A16' : 'white',
          fontSize: '13px', fontWeight: '600', textDecoration: 'none',
          textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: 'auto' }}
      >
        {plan.isCustomQuote ? (
          <><MessageCircle size={13} /> Request a quote</>
        ) : (
          <>Start planning <ArrowRight size={13} /></>
        )}
      </Link>
    </div>
  );
}
