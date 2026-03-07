import { useState } from 'react';
import { Check, ArrowRight, MapPin, Calendar, Users, Heart } from 'lucide-react';

export default function CustomPlanningPage() {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '',
    destination: '', dates: '', duration: '',
    groupSize: '', groupType: '', budget: '',
    style: [], notes: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleChange = e => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  const handleStyleToggle = style => {
    setFormData(prev => ({
      ...prev,
      style: prev.style.includes(style)
        ? prev.style.filter(s => s !== style)
        : [...prev.style, style],
    }));
  };
  const handleSubmit = async e => {
    e.preventDefault();
    try {
      await fetch('/api/send-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
    } catch (_) {
      // Submission notification failed silently — still show success to user
    }
    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (submitted) {
    return (
      <div style={{ background: '#FAFAF8', paddingTop: '72px', minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: '520px', padding: '24px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '50%',
            background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <Check size={28} color="#1B6B65" strokeWidth={2} />
          </div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '36px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>
            We've received your brief.
          </h1>
          <p style={{ fontSize: '17px', color: '#6B6156', lineHeight: '1.7', marginBottom: '32px' }}>
            One of our planners will reach out to {formData.email} within 48 hours to begin designing your itinerary. In the meantime, feel free to browse our existing collection for inspiration.
          </p>
          <a
            href="/itineraries"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '14px 28px',
              background: '#1B6B65', color: 'white',
              borderRadius: '4px', fontSize: '14px', fontWeight: '600',
              letterSpacing: '0.5px', textTransform: 'uppercase',
              textDecoration: 'none',
            }}
          >
            Browse Itineraries <ArrowRight size={14} />
          </a>
        </div>
      </div>
    );
  }

  const travelStyles = [
    'Cultural immersion', 'Culinary focus', 'Active & outdoors',
    'Pure relaxation', 'History & heritage', 'Coastal & islands',
    'Mountains & nature', 'City + countryside mix',
  ];

  const budgets = [
    { label: 'Comfortable', desc: '€200–350 / person / day', value: 'comfortable' },
    { label: 'Premium', desc: '€350–600 / person / day', value: 'premium' },
    { label: 'Ultra-Luxury', desc: '€600+ / person / day', value: 'ultra' },
  ];

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{
        background: 'linear-gradient(135deg, #0D3834 0%, #1B6B65 100%)',
        padding: 'clamp(56px, 9vw, 112px) 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <img
          src="https://images.unsplash.com/photo-1506197603052-3cc9c3a201bd?w=1400&q=80"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.1 }}
        />
        <div style={{ position: 'relative', zIndex: 2, maxWidth: '700px', margin: '0 auto', textAlign: 'center' }}>
          <span style={{
            fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
            color: '#C9A96E', display: 'block', marginBottom: '16px',
          }}>
            Bespoke Travel Planning
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(34px, 5vw, 58px)',
            fontWeight: '600', color: 'white',
            lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            A trip planned around<br />your family, your way.
          </h1>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.72)', lineHeight: '1.75', maxWidth: '540px', margin: '0 auto 24px' }}>
            For families, couples, and friend groups who want something genuinely tailored — not a template with your name on it. One dedicated planner. No shortcuts. Built around how you actually travel.
          </p>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {['Families', 'Couples', 'Friend Groups'].map(label => (
              <span key={label} style={{
                padding: '5px 14px',
                border: '1px solid rgba(201,169,110,0.4)',
                borderRadius: '20px',
                fontSize: '11px', fontWeight: '600', letterSpacing: '0.5px',
                color: '#C9A96E', background: 'rgba(201,169,110,0.08)',
              }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px', background: 'white', borderBottom: '1px solid #E8E3DA' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '40px' }}>
            {[
              { icon: <MapPin size={20} color="#1B6B65" />, title: 'Any Destination', desc: '70+ countries, researched on the ground. If you can dream it, we know how to get you there.' },
              { icon: <Calendar size={20} color="#1B6B65" />, title: 'Built Around You', desc: 'Your dates, your pace, your group\'s needs — the plan shapes itself around your life, not the other way around.' },
              { icon: <Users size={20} color="#1B6B65" />, title: 'Families, Couples, Groups', desc: 'Whether it\'s a first family adventure, a honeymoon, or a friends reunion trip — we\'ve planned it before.' },
              { icon: <Heart size={20} color="#1B6B65" />, title: 'Boutique All the Way', desc: 'Private villas, handpicked ryokans, boutique riads. No chain hotels, no generic itineraries.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: '8px',
                  background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {item.icon}
                </div>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>{item.title}</h3>
                  <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.5' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form + Info */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '64px', alignItems: 'start' }}>

            {/* Form */}
            <form onSubmit={handleSubmit}>
              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: '32px', fontWeight: '600', color: '#1C1A16',
                marginBottom: '8px',
              }}>
                Tell us about your trip
              </h2>
              <p style={{ fontSize: '15px', color: '#6B6156', marginBottom: '40px', lineHeight: '1.7' }}>
                The more detail you share, the better we can plan. Whether it's a family holiday, a couples escape, or a group adventure — we'll get back to you within 48 hours.
              </p>

              {/* Contact */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '20px' }}>
                  Your Details
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {[
                    { name: 'name', label: 'Full Name', type: 'text', placeholder: 'Jane Smith', required: true },
                    { name: 'email', label: 'Email Address', type: 'email', placeholder: 'jane@example.com', required: true },
                    { name: 'phone', label: 'Phone (optional)', type: 'tel', placeholder: '+1 555 000 0000', required: false },
                  ].map(field => (
                    <div key={field.name} style={{ gridColumn: field.name === 'phone' ? '1' : 'auto' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        name={field.name}
                        value={formData[field.name]}
                        onChange={handleChange}
                        placeholder={field.placeholder}
                        required={field.required}
                        style={{
                          width: '100%', padding: '12px 14px',
                          border: '1px solid #D4CCBF', borderRadius: '4px',
                          fontSize: '15px', color: '#1C1A16', background: 'white',
                          outline: 'none', transition: 'border-color 0.2s',
                        }}
                        onFocus={e => e.target.style.borderColor = '#1B6B65'}
                        onBlur={e => e.target.style.borderColor = '#D4CCBF'}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              {/* Trip Details */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '20px' }}>
                  Trip Details
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {[
                    { name: 'destination', label: 'Where do you want to go?', type: 'text', placeholder: 'e.g. Southern Italy, Japan, Morocco...', span: 2 },
                    { name: 'dates', label: 'Approximate dates', type: 'text', placeholder: 'e.g. October 2025, flexible in spring' },
                    { name: 'duration', label: 'Trip duration', type: 'text', placeholder: 'e.g. 10 days, 2 weeks' },
                    { name: 'groupSize', label: 'Group size', type: 'text', placeholder: 'e.g. 2 adults, family of 4' },
                    { name: 'groupType', label: 'Trip type', type: 'text', placeholder: 'e.g. Family holiday, honeymoon, friends reunion, anniversary' },
                  ].map(field => (
                    <div key={field.name} style={{ gridColumn: field.span === 2 ? '1 / -1' : 'auto' }}>
                      <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        name={field.name}
                        value={formData[field.name]}
                        onChange={handleChange}
                        placeholder={field.placeholder}
                        style={{
                          width: '100%', padding: '12px 14px',
                          border: '1px solid #D4CCBF', borderRadius: '4px',
                          fontSize: '15px', color: '#1C1A16', background: 'white',
                          outline: 'none',
                        }}
                        onFocus={e => e.target.style.borderColor = '#1B6B65'}
                        onBlur={e => e.target.style.borderColor = '#D4CCBF'}
                      />
                    </div>
                  ))}
                </div>
              </fieldset>

              {/* Travel Style */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '20px' }}>
                  Travel Style (select all that apply)
                </legend>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                  {travelStyles.map(style => {
                    const active = formData.style.includes(style);
                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => handleStyleToggle(style)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '4px',
                          border: '1px solid',
                          borderColor: active ? '#1B6B65' : '#D4CCBF',
                          background: active ? '#EFF6F5' : 'transparent',
                          color: active ? '#1B6B65' : '#6B6156',
                          fontSize: '14px', fontWeight: '500',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {active && '✓ '}{style}
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Budget */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '20px' }}>
                  Daily Budget Range
                </legend>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                  {budgets.map(b => {
                    const active = formData.budget === b.value;
                    return (
                      <button
                        key={b.value}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, budget: b.value }))}
                        style={{
                          padding: '16px',
                          borderRadius: '6px',
                          border: '2px solid',
                          borderColor: active ? '#1B6B65' : '#D4CCBF',
                          background: active ? '#EFF6F5' : 'white',
                          textAlign: 'left', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        <p style={{ fontWeight: '600', fontSize: '15px', color: active ? '#1B6B65' : '#1C1A16', marginBottom: '4px' }}>
                          {b.label}
                        </p>
                        <p style={{ fontSize: '12px', color: '#8C8070' }}>{b.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </fieldset>

              {/* Notes */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <legend style={{ fontSize: '12px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '20px' }}>
                  Anything else we should know?
                </legend>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={5}
                  placeholder="Special occasions, dietary needs, mobility considerations, things you absolutely want (or want to avoid)..."
                  style={{
                    width: '100%', padding: '14px',
                    border: '1px solid #D4CCBF', borderRadius: '4px',
                    fontSize: '15px', color: '#1C1A16',
                    resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit', lineHeight: '1.6',
                  }}
                  onFocus={e => e.target.style.borderColor = '#1B6B65'}
                  onBlur={e => e.target.style.borderColor = '#D4CCBF'}
                />
              </fieldset>

              <button
                type="submit"
                style={{
                  width: '100%', padding: '18px',
                  background: '#1B6B65', color: 'white',
                  border: 'none', borderRadius: '4px',
                  fontSize: '15px', fontWeight: '600',
                  letterSpacing: '0.5px', textTransform: 'uppercase',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#145550'}
                onMouseLeave={e => e.currentTarget.style.background = '#1B6B65'}
              >
                Submit My Brief <ArrowRight size={16} />
              </button>
              <p style={{ fontSize: '13px', color: '#8C8070', textAlign: 'center', marginTop: '12px' }}>
                No payment required now. We'll review your brief and get back to you within 48 hours.
              </p>
            </form>

            {/* Sidebar Info */}
            <div style={{ position: 'sticky', top: '100px' }}>
              <div style={{ background: '#1C1A16', borderRadius: '12px', padding: '36px', marginBottom: '24px' }}>
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: 'white', marginBottom: '20px' }}>
                  The custom planning fee
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '28px' }}>
                  {[
                    { label: 'Couple / Duo', price: '€349', desc: '2 people, up to 14 days' },
                    { label: 'Small Group', price: '€549', desc: '3–6 people, up to 14 days' },
                    { label: 'Large Group / Family', price: 'From €849', desc: '7+ people, custom scope' },
                  ].map((tier, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '20px', borderBottom: i < 2 ? '1px solid #2E2922' : 'none' }}>
                      <div>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: 'white' }}>{tier.label}</p>
                        <p style={{ fontSize: '12px', color: '#8C8070', marginTop: '2px' }}>{tier.desc}</p>
                      </div>
                      <span style={{ fontSize: '18px', fontWeight: '700', color: '#C9A96E', fontFamily: "'Playfair Display', Georgia, serif" }}>
                        {tier.price}
                      </span>
                    </div>
                  ))}
                </div>
                <a href="/pricing" style={{ fontSize: '13px', color: '#C9A96E', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  Full pricing details <ArrowRight size={12} />
                </a>
              </div>

              <div style={{ background: 'white', border: '1px solid #E8E3DA', borderRadius: '12px', padding: '28px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>What happens next?</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {[
                    { n: '1', text: 'We review your brief (within 24h)' },
                    { n: '2', text: 'Your planner calls or emails to discuss details' },
                    { n: '3', text: 'We build your custom itinerary (7–10 days)' },
                    { n: '4', text: 'Review & revision rounds until it\'s perfect' },
                    { n: '5', text: 'Final delivery — ready to book and go' },
                  ].map(step => (
                    <div key={step.n} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '22px', height: '22px', borderRadius: '50%',
                        background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '700', color: '#1B6B65', flexShrink: 0,
                      }}>
                        {step.n}
                      </div>
                      <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.5' }}>{step.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
