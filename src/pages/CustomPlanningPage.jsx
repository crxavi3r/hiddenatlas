import { useState } from 'react';
import { Check, ArrowRight, MapPin, Calendar, Users, Heart } from 'lucide-react';

const ERR_COLOR = '#C97070';
const ERR_TEXT  = '#B04040';

function fieldBorder(hasError) {
  return `1px solid ${hasError ? ERR_COLOR : '#D4CCBF'}`;
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <p style={{ fontSize: '12px', color: ERR_TEXT, marginTop: '5px' }}>{msg}</p>;
}

function FieldHelper({ text }) {
  return <p style={{ fontSize: '12px', color: '#9C9488', marginTop: '5px', lineHeight: '1.4' }}>{text}</p>;
}

function validate(data) {
  const e = {};
  if (!data.name.trim() || data.name.trim().length < 2)
    e.name = 'Please enter your full name';
  if (!data.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
    e.email = 'Please enter a valid email address';
  if (data.phone.trim() && !/^[+\d\s\-().]{7,}$/.test(data.phone.trim()))
    e.phone = 'Please enter a valid phone number';
  if (!data.destination.trim())
    e.destination = 'Please enter your destination';
  if (!data.dates.trim())
    e.dates = 'Please enter your approximate dates';
  if (!data.duration.trim() || !/^\d+$/.test(data.duration.trim()))
    e.duration = 'Please enter trip duration in days';
  if (!data.groupSize.trim() || !/^\d+$/.test(data.groupSize.trim()))
    e.groupSize = 'Please enter group size as a number';
  if (!data.groupType.trim())
    e.groupType = 'Please tell us how to describe the trip';
  if (data.style.length === 0)
    e.style = 'Please select at least one travel style';
  if (!data.budget)
    e.budget = 'Please select a budget range';
  return e;
}

const SCROLL_ORDER = ['name', 'email', 'phone', 'destination', 'dates', 'duration', 'groupSize', 'groupType', 'style', 'budget'];

const pricingTiers = [
  { label: 'Couple / Duo', price: '€349', desc: '2 people · up to 14 days' },
  { label: 'Small Group', price: '€549', desc: '3–6 people · up to 14 days' },
  { label: 'Large Group / Family', price: 'From €849', desc: '7+ people · custom scope' },
];

const nextSteps = [
  'We review your brief and confirm scope (within 24h)',
  'Your planner reaches out to discuss the details',
  'We design your itinerary (7–10 working days)',
  'You review. Revisions included.',
  'Final delivery, ready to book',
];

/* ─── Mobile-only pricing block ─── */
function MobilePricingBlock() {
  return (
    <div className="ha-mobile-only" style={{
      background: '#1C1A16',
      borderRadius: '12px',
      padding: '28px 24px',
      marginBottom: '36px',
    }}>
      <h3 style={{
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: '20px', fontWeight: '600',
        color: 'white', marginBottom: '8px',
      }}>
        Custom trip planning
      </h3>
      <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.55)', lineHeight: '1.6', marginBottom: '24px' }}>
        A personalised itinerary designed around your travel style, pace and priorities.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {pricingTiers.map((tier, i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            paddingTop: i === 0 ? '0' : '16px',
            paddingBottom: i < pricingTiers.length - 1 ? '16px' : '0',
            borderBottom: i < pricingTiers.length - 1 ? '1px solid #2E2922' : 'none',
          }}>
            <div>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'white', marginBottom: '2px' }}>{tier.label}</p>
              <p style={{ fontSize: '11.5px', color: '#8C8070' }}>{tier.desc}</p>
            </div>
            <span style={{
              fontSize: '19px', fontWeight: '700',
              color: '#C9A96E',
              fontFamily: "'Playfair Display', Georgia, serif",
              flexShrink: 0, marginLeft: '16px',
            }}>
              {tier.price}
            </span>
          </div>
        ))}
      </div>

      <p style={{
        fontSize: '11.5px', color: 'rgba(255,255,255,0.3)',
        marginTop: '20px', lineHeight: '1.5',
        borderTop: '1px solid #2E2922', paddingTop: '16px',
      }}>
        One-time itinerary fee · Not per person · No booking commissions
      </p>

      <a href="/pricing" style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        marginTop: '12px', fontSize: '12px', fontWeight: '600',
        color: '#C9A96E', textDecoration: 'none', letterSpacing: '0.3px',
      }}>
        View full pricing details <ArrowRight size={11} />
      </a>
    </div>
  );
}

/* ─── Section legend ─── */
function SectionLegend({ label, helper }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <legend style={{
        fontSize: '11px', fontWeight: '700', letterSpacing: '1.8px',
        textTransform: 'uppercase', color: '#1B6B65',
        display: 'block',
      }}>
        {label}
      </legend>
      {helper && (
        <p style={{ fontSize: '12.5px', color: '#9C9488', marginTop: '5px' }}>{helper}</p>
      )}
    </div>
  );
}

export default function CustomPlanningPage() {
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '',
    destination: '', dates: '', duration: '',
    groupSize: '', groupType: '', budget: '',
    style: [], notes: '',
  });
  const [errors, setErrors] = useState({});
  const [submitted, setSubmitted] = useState(false);

  const clearError = key =>
    setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });

  const handleChange = e => {
    const { name, value } = e.target;
    const numericFields = ['duration', 'groupSize'];
    const newValue = numericFields.includes(name) ? value.replace(/\D/g, '') : value;
    setFormData(prev => ({ ...prev, [name]: newValue }));
    if (errors[name]) clearError(name);
  };

  const handleStyleToggle = style => {
    setFormData(prev => ({
      ...prev,
      style: prev.style.includes(style)
        ? prev.style.filter(s => s !== style)
        : [...prev.style, style],
    }));
    if (errors.style) clearError('style');
  };

  const handleBudgetSelect = value => {
    setFormData(prev => ({ ...prev, budget: value }));
    if (errors.budget) clearError('budget');
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const errs = validate(formData);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      const firstKey = SCROLL_ORDER.find(k => errs[k]);
      if (firstKey) {
        const el = document.getElementById(`field-${firstKey}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
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

  const inputStyle = hasError => ({
    width: '100%', padding: '13px 14px',
    border: fieldBorder(hasError), borderRadius: '6px',
    fontSize: '15px', color: '#1C1A16', background: 'white',
    outline: 'none', transition: 'border-color 0.2s',
    boxSizing: 'border-box',
  });

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
            Custom Trip Planning
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(34px, 5vw, 58px)',
            fontWeight: '600', color: 'white',
            lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            A trip built entirely<br />around you.
          </h1>
          <p style={{ fontSize: '17px', color: 'rgba(255,255,255,0.72)', lineHeight: '1.75', maxWidth: '540px', margin: '0 auto 24px' }}>
            For families, couples, and friend groups who want something genuinely tailored, not a template with your name on it. One dedicated planner. No shortcuts.
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
      <section style={{ padding: 'clamp(40px, 5vw, 72px) 24px', background: 'white', borderBottom: '1px solid #E8E3DA' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div className="ha-value-props">
            {[
              { icon: <MapPin size={20} color="#1B6B65" />, title: 'Any Destination', desc: '70+ countries, researched on the ground. If you can dream it, we know how to get you there.' },
              { icon: <Calendar size={20} color="#1B6B65" />, title: 'Built Around You', desc: 'Your dates, your pace, your group\'s needs. The plan shapes itself around your life.' },
              { icon: <Users size={20} color="#1B6B65" />, title: 'Families, Couples, Groups', desc: 'Whether it\'s a honeymoon, a family adventure, or a friends reunion, we\'ve planned it before.' },
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
                  <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>{item.title}</h3>
                  <p style={{ fontSize: '13.5px', color: '#6B6156', lineHeight: '1.55' }}>{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form + Sidebar */}
      <section style={{ padding: 'clamp(40px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div className="ha-custom-grid">

            {/* ── FORM ── */}
            <form onSubmit={handleSubmit} noValidate>
              <h2 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 'clamp(26px, 3vw, 34px)', fontWeight: '600', color: '#1C1A16',
                marginBottom: '8px',
              }}>
                Tell us about your trip
              </h2>
              <p style={{ fontSize: '15px', color: '#6B6156', marginBottom: '36px', lineHeight: '1.7', maxWidth: '560px' }}>
                The more you share, the better we can plan. We'll reply within 48 hours with a call or message to discuss your itinerary.
              </p>

              {/* Mobile pricing block — shown above form on small screens */}
              <MobilePricingBlock />

              {/* ── Your Details ── */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <SectionLegend label="Your Details" />
                <div className="ha-form-2col">

                  <div id="field-name">
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      Full Name
                    </label>
                    <input
                      type="text" name="name" value={formData.name}
                      onChange={handleChange} placeholder="Jane Smith"
                      style={inputStyle(!!errors.name)}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.name ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <ErrorMsg msg={errors.name} />
                  </div>

                  <div id="field-email">
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      Email Address
                    </label>
                    <input
                      type="email" name="email" value={formData.email}
                      onChange={handleChange} placeholder="jane@example.com"
                      style={inputStyle(!!errors.email)}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.email ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <ErrorMsg msg={errors.email} />
                  </div>

                  <div id="field-phone" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      Phone <span style={{ color: '#9C9488', fontWeight: '400' }}>(optional)</span>
                    </label>
                    <input
                      type="tel" name="phone" value={formData.phone}
                      onChange={handleChange} placeholder="+1 555 000 0000"
                      style={{ ...inputStyle(!!errors.phone), maxWidth: '320px' }}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.phone ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <FieldHelper text="Useful if you'd prefer a quick call to get started." />
                    <ErrorMsg msg={errors.phone} />
                  </div>

                </div>
              </fieldset>

              {/* ── Trip Details ── */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <SectionLegend label="Trip Details" helper="Be as specific or open-ended as you like. We work from wherever you are." />
                <div className="ha-form-2col">

                  <div id="field-destination" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      Where would you like to go?
                    </label>
                    <input
                      type="text" name="destination" value={formData.destination}
                      onChange={handleChange}
                      placeholder="e.g. Southern Italy, Japan, Morocco, open to suggestions..."
                      style={inputStyle(!!errors.destination)}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.destination ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <ErrorMsg msg={errors.destination} />
                  </div>

                  <div id="field-dates">
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      Approximate dates
                    </label>
                    <input
                      type="text" name="dates" value={formData.dates}
                      onChange={handleChange}
                      placeholder="e.g. October 2025, flexible in spring"
                      style={inputStyle(!!errors.dates)}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.dates ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <FieldHelper text="Flexible is fine. Even a rough season helps." />
                    <ErrorMsg msg={errors.dates} />
                  </div>

                  <div id="field-duration">
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      Trip duration (days)
                    </label>
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      name="duration" value={formData.duration}
                      onChange={handleChange} placeholder="e.g. 10"
                      style={inputStyle(!!errors.duration)}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.duration ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <ErrorMsg msg={errors.duration} />
                  </div>

                  <div id="field-groupSize">
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      Group size
                    </label>
                    <input
                      type="text" inputMode="numeric" pattern="[0-9]*"
                      name="groupSize" value={formData.groupSize}
                      onChange={handleChange} placeholder="e.g. 2"
                      style={inputStyle(!!errors.groupSize)}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.groupSize ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <ErrorMsg msg={errors.groupSize} />
                  </div>

                  <div id="field-groupType" style={{ gridColumn: '1 / -1' }}>
                    <label style={{ fontSize: '13px', fontWeight: '500', color: '#4A433A', display: 'block', marginBottom: '6px' }}>
                      How would you describe the trip?
                    </label>
                    <input
                      type="text" name="groupType" value={formData.groupType}
                      onChange={handleChange}
                      placeholder="e.g. Family holiday, honeymoon, friends reunion, anniversary trip..."
                      style={inputStyle(!!errors.groupType)}
                      onFocus={e => e.target.style.borderColor = '#1B6B65'}
                      onBlur={e => { e.target.style.borderColor = errors.groupType ? ERR_COLOR : '#D4CCBF'; }}
                    />
                    <ErrorMsg msg={errors.groupType} />
                  </div>

                </div>
              </fieldset>

              {/* ── Travel Style ── */}
              <fieldset id="field-style" style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <SectionLegend
                  label="How do you like to travel?"
                  helper="Select everything that resonates. Your planner will use this to shape the tone of the itinerary."
                />
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {travelStyles.map(style => {
                    const active = formData.style.includes(style);
                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => handleStyleToggle(style)}
                        style={{
                          padding: '9px 16px',
                          borderRadius: '6px',
                          border: '1px solid',
                          borderColor: active ? '#1B6B65' : (errors.style ? ERR_COLOR : '#D4CCBF'),
                          background: active ? '#EFF6F5' : 'white',
                          color: active ? '#1B6B65' : '#4A433A',
                          fontSize: '13.5px', fontWeight: active ? '600' : '400',
                          cursor: 'pointer', transition: 'all 0.15s',
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        {active && (
                          <span style={{ fontSize: '10px', color: '#1B6B65' }}>✓</span>
                        )}
                        {style}
                      </button>
                    );
                  })}
                </div>
                <ErrorMsg msg={errors.style} />
              </fieldset>

              {/* ── Daily Budget ── */}
              <fieldset id="field-budget" style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <SectionLegend
                  label="Daily Budget Range"
                  helper="Per person, per day, excluding flights and planning fee."
                />
                <div className="ha-budget-grid">
                  {budgets.map(b => {
                    const active = formData.budget === b.value;
                    return (
                      <button
                        key={b.value}
                        type="button"
                        onClick={() => handleBudgetSelect(b.value)}
                        style={{
                          padding: '18px 16px',
                          borderRadius: '8px',
                          border: '2px solid',
                          borderColor: active ? '#1B6B65' : (errors.budget ? ERR_COLOR : '#D4CCBF'),
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
                <ErrorMsg msg={errors.budget} />
              </fieldset>

              {/* ── Notes ── */}
              <fieldset style={{ border: 'none', padding: 0, marginBottom: '40px' }}>
                <SectionLegend
                  label="Anything else we should know?"
                />
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={5}
                  placeholder="Special occasions, dietary needs, mobility considerations, specific experiences you have in mind, or things you'd rather avoid..."
                  style={{
                    width: '100%', padding: '14px',
                    border: '1px solid #D4CCBF', borderRadius: '6px',
                    fontSize: '15px', color: '#1C1A16',
                    resize: 'vertical', outline: 'none',
                    fontFamily: 'inherit', lineHeight: '1.6',
                    boxSizing: 'border-box',
                  }}
                  onFocus={e => e.target.style.borderColor = '#1B6B65'}
                  onBlur={e => e.target.style.borderColor = '#D4CCBF'}
                />
                <FieldHelper text="Optional but genuinely useful. The more context you give, the better the first draft." />
              </fieldset>

              {/* ── Submit ── */}
              <div style={{
                background: '#F4F1EC',
                borderRadius: '10px',
                padding: '28px',
              }}>
                <button
                  type="submit"
                  style={{
                    width: '100%', padding: '18px',
                    background: '#1B6B65', color: 'white',
                    border: 'none', borderRadius: '6px',
                    fontSize: '15px', fontWeight: '600',
                    letterSpacing: '0.5px', textTransform: 'uppercase',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    transition: 'background 0.2s',
                    marginBottom: '16px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#145550'}
                  onMouseLeave={e => e.currentTarget.style.background = '#1B6B65'}
                >
                  Send My Brief <ArrowRight size={16} />
                </button>
                <p style={{ fontSize: '13px', color: '#6B6156', textAlign: 'center', lineHeight: '1.6' }}>
                  No payment required now. We'll review your brief and reply within 48 hours.
                </p>
              </div>
            </form>

            {/* ── SIDEBAR ── */}
            <div style={{ position: 'sticky', top: '100px' }}>

              {/* Pricing card — hidden on mobile since it's shown above the form */}
              <div className="ha-desktop-sidebar-pricing" style={{
                background: '#1C1A16',
                borderRadius: '12px',
                padding: '36px',
                marginBottom: '24px',
              }}>
                <h3 style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: '22px', fontWeight: '600',
                  color: 'white', marginBottom: '8px',
                }}>
                  Custom trip planning
                </h3>
                <p style={{ fontSize: '13.5px', color: 'rgba(255,255,255,0.45)', lineHeight: '1.6', marginBottom: '28px' }}>
                  A personalised itinerary designed around your travel style, pace and priorities.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginBottom: '28px' }}>
                  {pricingTiers.map((tier, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      paddingTop: i === 0 ? '0' : '20px',
                      paddingBottom: i < pricingTiers.length - 1 ? '20px' : '0',
                      borderBottom: i < pricingTiers.length - 1 ? '1px solid #2E2922' : 'none',
                    }}>
                      <div>
                        <p style={{ fontSize: '15px', fontWeight: '600', color: 'white' }}>{tier.label}</p>
                        <p style={{ fontSize: '12px', color: '#8C8070', marginTop: '2px' }}>{tier.desc}</p>
                      </div>
                      <span style={{
                        fontSize: '18px', fontWeight: '700',
                        color: '#C9A96E',
                        fontFamily: "'Playfair Display', Georgia, serif",
                        flexShrink: 0, marginLeft: '16px',
                      }}>
                        {tier.price}
                      </span>
                    </div>
                  ))}
                </div>

                <p style={{ fontSize: '11.5px', color: 'rgba(255,255,255,0.28)', lineHeight: '1.6', marginBottom: '12px' }}>
                  One-time itinerary fee · Not per person · No booking commissions
                </p>
                <a href="/pricing" style={{
                  fontSize: '13px', color: '#C9A96E',
                  display: 'flex', alignItems: 'center', gap: '4px',
                  textDecoration: 'none', fontWeight: '500',
                }}>
                  Full pricing details <ArrowRight size={12} />
                </a>
              </div>

              {/* What happens next */}
              <div style={{
                background: 'white',
                border: '1px solid #E8E3DA',
                borderRadius: '12px',
                padding: '28px',
              }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                  What happens next?
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {nextSteps.map((text, i) => (
                    <div key={i} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                      <div style={{
                        width: '24px', height: '24px', borderRadius: '50%',
                        background: '#EFF6F5',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '11px', fontWeight: '700', color: '#1B6B65',
                        flexShrink: 0,
                      }}>
                        {i + 1}
                      </div>
                      <span style={{ fontSize: '13.5px', color: '#4A433A', lineHeight: '1.55', paddingTop: '3px' }}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        </div>
      </section>

      <style>{`
        /* Main form + sidebar grid */
        .ha-custom-grid {
          display: grid;
          grid-template-columns: 1fr 380px;
          gap: 64px;
          align-items: start;
        }

        /* 2-column form field grid */
        .ha-form-2col {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        /* 3-column budget grid */
        .ha-budget-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }

        /* Value props grid */
        .ha-value-props {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
          gap: 36px;
        }

        /* Mobile-only pricing block — hidden on desktop */
        .ha-mobile-only {
          display: none;
        }

        /* Desktop sidebar pricing — always visible on desktop */
        .ha-desktop-sidebar-pricing {
          display: block;
        }

        @media (max-width: 900px) {
          /* Stack form and sidebar vertically */
          .ha-custom-grid {
            grid-template-columns: 1fr;
            gap: 0;
          }

          /* Show mobile pricing block above form */
          .ha-mobile-only {
            display: block;
          }

          /* Hide sidebar pricing on mobile (shown by mobile block above) */
          .ha-desktop-sidebar-pricing {
            display: none;
          }
        }

        @media (max-width: 640px) {
          /* Collapse 2-col form fields to single column */
          .ha-form-2col {
            grid-template-columns: 1fr;
          }

          /* On single-column form, full-width fields don't need the span */
          .ha-form-2col > [style*="gridColumn"] {
            grid-column: 1 / -1;
          }

          /* Stack budget cards vertically */
          .ha-budget-grid {
            grid-template-columns: 1fr;
          }

          /* Phone field max-width full on mobile */
          #field-phone input {
            max-width: 100% !important;
          }
        }

        @media (max-width: 480px) {
          .ha-value-props {
            grid-template-columns: 1fr;
            gap: 28px;
          }
        }
      `}</style>
    </div>
  );
}
