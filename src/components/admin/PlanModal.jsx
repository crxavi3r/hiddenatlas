import { useState } from 'react';

const inputStyle = {
  width: '100%', height: '44px', padding: '0 12px', border: '1px solid #E8E3DA', borderRadius: '6px',
  fontSize: '13px', color: '#1C1A16', background: 'white', outline: 'none', boxSizing: 'border-box',
};
const labelStyle = { fontSize: '11.5px', fontWeight: '600', color: '#4A433A', display: 'block' };
const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };
const btnPrimary = {
  padding: '8px 18px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'flex', alignItems: 'center', gap: '6px',
};
const btnSecondary = {
  padding: '8px 16px', borderRadius: '5px', border: '1px solid #E8E3DA', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A',
  display: 'flex', alignItems: 'center', gap: '6px',
};

export const EMPTY_PLAN_FORM = {
  name: '', description: '', planType: 'custom', audienceLabel: '',
  travelerMin: '', travelerMax: '', priceEuros: '', currency: 'EUR',
  isActive: true, isCustomQuote: false, sortOrder: 0,
};

function toUiPlanType(planType, isCustomQuote) {
  if (isCustomQuote) return 'custom_quote';
  if (planType === 'digital') return 'digital';
  return 'custom';
}

function formatCurrency(amount, currency = 'EUR') {
  if (amount === '' || amount == null || isNaN(Number(amount))) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(Number(amount));
}

function travelerRange(min, max) {
  const hasMin = min !== '' && min != null;
  const hasMax = max !== '' && max != null;
  if (hasMin && hasMax) return `${min}–${max} travellers`;
  if (hasMin)           return `${min}+ travellers`;
  if (hasMax)           return `Up to ${max} travellers`;
  return null;
}

function Field({ label, hint, error, children }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && !error && (
        <p style={{ fontSize: '11px', color: '#9A8E80', margin: 0, lineHeight: '1.4' }}>{hint}</p>
      )}
      {error && (
        <p style={{ fontSize: '11px', color: '#C0392B', margin: 0 }}>{error}</p>
      )}
    </div>
  );
}

export default function PlanModal({ plan, onSave, onClose, saving }) {
  const [form, setForm] = useState(plan
    ? {
        name:          plan.name,
        description:   plan.description || '',
        planType:      plan.planType,
        audienceLabel: plan.audienceLabel || '',
        travelerMin:   plan.travelerMin ?? '',
        travelerMax:   plan.travelerMax ?? '',
        priceEuros:    plan.priceCents != null ? plan.priceCents / 100 : '',
        currency:      plan.currency || 'EUR',
        isActive:      plan.isActive ?? true,
        isCustomQuote: plan.isCustomQuote ?? false,
        sortOrder:     plan.sortOrder ?? 0,
      }
    : { ...EMPTY_PLAN_FORM }
  );
  const [errors, setErrors] = useState({});

  const set = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => { const n = { ...e }; delete n[k]; return n; });
  };

  const uiPlanType = toUiPlanType(form.planType, form.isCustomQuote);
  const isDigital  = uiPlanType === 'digital';
  const isCustom   = uiPlanType === 'custom';
  const isQuote    = uiPlanType === 'custom_quote';

  function handleUiPlanTypeChange(val) {
    if (val === 'custom_quote') {
      setForm(f => ({ ...f, planType: 'custom', isCustomQuote: true }));
      setErrors(e => { const n = { ...e }; delete n.priceEuros; return n; });
    } else if (val === 'digital') {
      setForm(f => ({ ...f, planType: 'digital', isCustomQuote: false }));
      setErrors(e => { const n = { ...e }; delete n.audienceLabel; delete n.travelerMin; delete n.travelerMax; return n; });
    } else {
      setForm(f => ({ ...f, planType: 'custom', isCustomQuote: false }));
    }
  }

  function validate() {
    const errs = {};
    if (!form.name.trim()) errs.name = 'Plan name is required';
    if (!isQuote) {
      if (form.priceEuros === '' || form.priceEuros == null) errs.priceEuros = 'Price is required';
      else if (Number(form.priceEuros) <= 0) errs.priceEuros = 'Price must be greater than 0';
    }
    if (!isDigital && form.travelerMin !== '' && form.travelerMax !== '') {
      if (Number(form.travelerMin) > Number(form.travelerMax)) errs.travelerMax = 'Max must be ≥ min';
    }
    return errs;
  }

  function handleSaveClick() {
    const errs = validate();
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    const { priceEuros, ...rest } = form;
    const priceCents = !isQuote && priceEuros !== '' && priceEuros != null
      ? Math.round(Number(priceEuros) * 100) : null;

    const payload = { ...rest, priceCents };
    payload.travelerMin = payload.travelerMin === '' || payload.travelerMin == null ? null : Number(payload.travelerMin);
    payload.travelerMax = payload.travelerMax === '' || payload.travelerMax == null ? null : Number(payload.travelerMax);
    if (isDigital) {
      payload.audienceLabel = null;
      payload.travelerMin   = null;
      payload.travelerMax   = null;
    }

    onSave(payload);
  }

  const previewRange          = !isDigital ? travelerRange(form.travelerMin, form.travelerMax) : null;
  const previewFormattedPrice = !isQuote && form.priceEuros !== ''
    ? formatCurrency(form.priceEuros, form.currency) : null;
  const hasPreview = !!form.name;

  const grid2     = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' };
  const errBorder = key => ({ borderColor: errors[key] ? '#C0392B' : '#E8E3DA' });

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ ...card, width: '100%', maxWidth: '520px', maxHeight: '90vh', overflow: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid #F4F1EC' }}>
          <p style={{ fontSize: '16px', fontWeight: '700', color: '#1C1A16', margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif" }}>
            {plan && plan.id ? 'Edit Pricing Plan' : 'New Pricing Plan'}
          </p>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '4px', marginBottom: 0 }}>
            {plan && plan.id ? 'Update this pricing option.' : 'Add a new pricing option for your trips.'}
          </p>
        </div>

        {/* Body */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          <Field label="Plan name *" error={errors.name}>
            <input
              style={{ ...inputStyle, ...errBorder('name') }}
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Essential Itinerary"
            />
          </Field>

          <Field label="Description" hint="Shown to clients when selecting a plan.">
            <textarea
              style={{ ...inputStyle, height: 'auto', minHeight: '80px',
                padding: '10px 12px', resize: 'vertical', lineHeight: '1.5' }}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="e.g. Perfect for 2 travellers looking for a boutique experience"
            />
          </Field>

          {/* Plan type — full width for Premium Itinerary (no audience label partner) */}
          {isDigital ? (
            <Field label="Plan type">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={uiPlanType}
                onChange={e => handleUiPlanTypeChange(e.target.value)}
              >
                <option value="digital">Premium Itinerary</option>
                <option value="custom">Custom Trip Planning</option>
                <option value="custom_quote">Custom Quote</option>
              </select>
            </Field>
          ) : (
            <div style={grid2}>
              <Field label="Plan type">
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={uiPlanType}
                  onChange={e => handleUiPlanTypeChange(e.target.value)}
                >
                  <option value="digital">Premium Itinerary</option>
                  <option value="custom">Custom Trip Planning</option>
                  <option value="custom_quote">Custom Quote</option>
                </select>
              </Field>
              <Field label="Audience label" hint="e.g. Couple, Family, Group">
                <input
                  style={inputStyle}
                  value={form.audienceLabel}
                  onChange={e => set('audienceLabel', e.target.value)}
                  placeholder="e.g. Couple"
                />
              </Field>
            </div>
          )}

          {isQuote && (
            <div style={{ padding: '10px 14px', background: '#FEF9F0', border: '1px solid #F5E4C3',
              borderRadius: '6px', fontSize: '12px', color: '#92400E', lineHeight: '1.5' }}>
              The client will contact you directly for a custom price. No Stripe checkout is created.
            </div>
          )}

          {/* Min / Max travellers — only for Custom Trip Planning and Custom Quote */}
          {!isDigital && (
            <div style={grid2}>
              <Field label="Min travellers">
                <input
                  style={inputStyle}
                  type="number" min="1"
                  value={form.travelerMin}
                  onChange={e => set('travelerMin', e.target.value ? Number(e.target.value) : '')}
                  placeholder="1"
                />
              </Field>
              <Field label="Max travellers" hint="Leave empty for no limit" error={errors.travelerMax}>
                <input
                  style={{ ...inputStyle, ...errBorder('travelerMax') }}
                  type="number" min="1"
                  value={form.travelerMax}
                  onChange={e => set('travelerMax', e.target.value ? Number(e.target.value) : '')}
                  placeholder="e.g. 12"
                />
              </Field>
            </div>
          )}

          {/* Price / Currency — hidden for Custom Quote */}
          {!isQuote && (
            <div style={grid2}>
              <Field label="Price *" hint="Enter the price in euros. Example: 349 for €349." error={errors.priceEuros}>
                <input
                  style={{ ...inputStyle, ...errBorder('priceEuros') }}
                  type="number" min="0" step="any"
                  value={form.priceEuros}
                  onChange={e => set('priceEuros', e.target.value)}
                  placeholder="349"
                />
              </Field>
              <Field label="Currency">
                <select
                  style={{ ...inputStyle, cursor: 'pointer' }}
                  value={form.currency}
                  onChange={e => set('currency', e.target.value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </Field>
            </div>
          )}

          {/* Sort order / Status */}
          <div style={grid2}>
            <Field label="Sort order" hint="Lower numbers appear first">
              <input
                style={inputStyle}
                type="number"
                value={form.sortOrder}
                onChange={e => set('sortOrder', Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Status">
              <select
                style={{ ...inputStyle, cursor: 'pointer' }}
                value={form.isActive ? 'active' : 'inactive'}
                onChange={e => set('isActive', e.target.value === 'active')}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </Field>
          </div>

          {/* Client preview */}
          {hasPreview && (
            <div style={{ borderTop: '1px solid #F4F1EC', paddingTop: '20px' }}>
              <p style={{ fontSize: '10.5px', fontWeight: '700', color: '#B5AA99',
                textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '12px' }}>
                Client preview
              </p>
              <div style={{ padding: '18px 20px', background: '#FAFAF8',
                border: '1px solid #E8E3DA', borderRadius: '8px' }}>

                {isDigital && (
                  <p style={{ fontSize: '10.5px', fontWeight: '700', color: '#B5AA99',
                    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '5px' }}>
                    Premium Itinerary
                  </p>
                )}
                {isQuote && (
                  <p style={{ fontSize: '10.5px', fontWeight: '700', color: '#B5AA99',
                    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '5px' }}>
                    Custom Quote
                  </p>
                )}
                {isCustom && form.audienceLabel && (
                  <p style={{ fontSize: '10.5px', fontWeight: '700', color: '#B5AA99',
                    textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: '5px' }}>
                    {form.audienceLabel}
                  </p>
                )}

                <p style={{ fontSize: '15px', fontWeight: '700', color: '#1C1A16', margin: 0,
                  fontFamily: "'Playfair Display', Georgia, serif" }}>
                  {form.name}
                </p>

                {previewRange && (
                  <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '4px', marginBottom: 0 }}>
                    {previewRange}
                  </p>
                )}

                <div style={{ marginTop: '10px' }}>
                  {isQuote ? (
                    <p style={{ fontSize: '12.5px', color: '#8C8070', margin: 0 }}>
                      Client contacts you
                    </p>
                  ) : (
                    previewFormattedPrice && (
                      <p style={{ fontSize: '20px', fontWeight: '700', color: '#C9A96E', margin: 0,
                        fontFamily: "'Playfair Display', Georgia, serif" }}>
                        {previewFormattedPrice}
                      </p>
                    )
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px', borderTop: '1px solid #F4F1EC',
          display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnSecondary} disabled={saving}>Cancel</button>
          <button
            onClick={handleSaveClick}
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}
            disabled={saving}
          >
            {saving ? 'Saving…' : (plan && plan.id ? 'Save changes' : 'Create plan')}
          </button>
        </div>
      </div>
    </div>
  );
}
