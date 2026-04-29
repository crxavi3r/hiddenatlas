import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useUserCtx } from '../../lib/useUserCtx.jsx';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Plus, Edit2, Eye, EyeOff, ChevronUp, ChevronDown, DollarSign, Tag } from 'lucide-react';
import PlanModal from '../../components/admin/PlanModal.jsx';

const card  = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };
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
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '5px',
  borderRadius: '4px', color: '#8C8070', display: 'flex', alignItems: 'center',
};
const inputStyle = {
  width: '100%', height: '44px', padding: '0 12px', border: '1px solid #E8E3DA', borderRadius: '6px',
  fontSize: '13px', color: '#1C1A16', background: 'white', outline: 'none', boxSizing: 'border-box',
};

// Human-readable type label for table / mobile list
function planTypeLabel(p) {
  if (p.isCustomQuote) return 'Custom Quote';
  if (p.planType === 'digital') return 'Premium Itinerary';
  return 'Custom Planning';
}

function planTypeBadgeColors(p) {
  if (p.isCustomQuote) return { background: '#FEF9F0', color: '#92400E' };
  if (p.planType === 'digital') return { background: '#EEF2FE', color: '#3B5BD5' };
  return { background: '#F4F1EC', color: '#6B6156' };
}

export default function PricingPlansPage() {
  const { isAdmin, isDesigner, loading: ctxLoading } = useUserCtx();
  const { getToken } = useAuth();
  const isMobile = useIsMobile();

  const [plans,   setPlans]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [editing, setEditing] = useState(null);   // plan object to edit, or 'new'
  const [saving,  setSaving]  = useState(false);

  // Admin: can select which designer's plans to manage
  const [designers,          setDesigners]          = useState([]);
  const [selectedDesignerId, setSelectedDesignerId] = useState(null);

  const load = useCallback(async (designerUserId = null) => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const qs = designerUserId ? `&designerUserId=${designerUserId}` : '';
      const res  = await fetch(`/api/pricing-plans?action=list${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setPlans(json.plans || []);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }, [getToken]);

  // Load designers list for admin selector
  useEffect(() => {
    if (!isAdmin) return;
    getToken().then(token => {
      fetch('/api/creators?action=list', { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          const withUser = (data.creators || []).filter(c => c.userId && c.isActive);
          setDesigners(withUser);
        })
        .catch(() => {});
    });
  }, [isAdmin, getToken]);

  useEffect(() => {
    if (!ctxLoading) {
      load(selectedDesignerId);
    }
  }, [load, ctxLoading, selectedDesignerId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSave(formData) {
    setSaving(true);
    try {
      const token  = await getToken();
      // Presets have no id — treat them as creates even though editing !== 'new'
      const isEdit = editing && editing !== 'new' && !!editing.id;
      const qs     = isEdit ? `&id=${editing.id}` : '';
      const action = isEdit ? 'update' : 'create';

      const payload = {
        ...formData,
        ...(isAdmin && selectedDesignerId ? { designerUserId: selectedDesignerId } : {}),
      };

      const res  = await fetch(`/api/pricing-plans?action=${action}${qs}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      if (isEdit) {
        setPlans(prev => prev.map(p => p.id === json.plan.id ? json.plan : p));
      } else {
        setPlans(prev => [...prev, json.plan]);
      }
      setEditing(null);
    } catch (e) { alert(e.message); }
    finally     { setSaving(false); }
  }

  async function handleToggle(plan) {
    try {
      const token = await getToken();
      const res   = await fetch(`/api/pricing-plans?action=toggle&id=${plan.id}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json  = await res.json();
      if (json.error) throw new Error(json.error);
      setPlans(prev => prev.map(p => p.id === json.plan.id ? json.plan : p));
    } catch (e) { alert(e.message); }
  }

  async function handleReorder(planId, direction) {
    const idx     = plans.findIndex(p => p.id === planId);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= plans.length) return;

    const updated = [...plans];
    [updated[idx], updated[swapIdx]] = [updated[swapIdx], updated[idx]];
    const orders  = updated.map((p, i) => ({ id: p.id, sortOrder: i }));
    setPlans(updated.map((p, i) => ({ ...p, sortOrder: i })));

    try {
      const token = await getToken();
      await fetch('/api/pricing-plans?action=reorder', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ orders }),
      });
    } catch (e) { console.error('[reorder]', e); }
  }

  if (!ctxLoading && !isAdmin && !isDesigner) {
    return <Navigate to="/admin" replace />;
  }

  const th = { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600',
    color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' };
  const td = { padding: '12px 14px', fontSize: '13px', color: '#1C1A16', borderTop: '1px solid #F4F1EC' };

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>

      {editing && (
        <PlanModal
          plan={editing !== 'new' ? editing : null}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px',
            fontWeight: '600', color: '#1C1A16' }}>
            Pricing Plans
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            Manage your custom trip pricing options
          </p>
        </div>
        <button onClick={() => setEditing('new')} style={btnPrimary}>
          <Plus size={13} /> New plan
        </button>
      </div>

      {/* Admin: designer selector */}
      {isAdmin && designers.length > 0 && (
        <div style={{ ...card, padding: '14px 16px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <Tag size={14} color="#8C8070" />
          <span style={{ fontSize: '12.5px', color: '#4A433A', fontWeight: '600' }}>Viewing plans for:</span>
          <select
            value={selectedDesignerId || ''}
            onChange={e => setSelectedDesignerId(e.target.value || null)}
            style={{ ...inputStyle, maxWidth: '260px', width: 'auto', fontSize: '12.5px' }}
          >
            <option value="">My own plans</option>
            {designers.map(d => (
              <option key={d.id} value={d.userId}>{d.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[...Array(3)].map((_, i) => <div key={i} style={{ ...card, height: '58px', opacity: 0.5 }} />)}
        </div>
      ) : error ? (
        <div style={{ ...card, padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#C0392B' }}>{error}</p>
        </div>
      ) : plans.length === 0 ? (
        <div style={{ ...card, padding: '48px 32px', textAlign: 'center' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#F4F1EC',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <DollarSign size={20} color="#B5AA99" />
          </div>
          <p style={{ fontSize: '16px', fontWeight: '700', color: '#1C1A16', marginBottom: '8px',
            fontFamily: "'Playfair Display', Georgia, serif" }}>
            Set your pricing to start receiving requests
          </p>
          <p style={{ fontSize: '13px', color: '#8C8070', maxWidth: '340px', margin: '0 auto 24px' }}>
            Define how much you charge for your trips. You can offer fixed prices or custom quotes.
          </p>
          <button onClick={() => setEditing('new')} style={{ ...btnPrimary, margin: '0 auto' }}>
            <Plus size={13} /> Create your first pricing plan
          </button>

          {/* Suggested quick actions */}
          <div style={{ marginTop: '32px', paddingTop: '24px', borderTop: '1px solid #F4F1EC' }}>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#B5AA99', textTransform: 'uppercase',
              letterSpacing: '0.5px', marginBottom: '14px' }}>
              Suggested setup
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
              <button
                onClick={() => setEditing({
                  _preset: true,
                  name: 'Couple Planning', planType: 'custom', audienceLabel: 'Couple',
                  travelerMin: 1, travelerMax: 2, priceCents: 34900, currency: 'EUR',
                  isActive: true, isCustomQuote: false, sortOrder: 0, description: '',
                })}
                style={{ ...btnSecondary, fontSize: '12px' }}
              >
                Couple Plan — €349
              </button>
              <button
                onClick={() => setEditing({
                  _preset: true,
                  name: 'Family Planning', planType: 'custom', audienceLabel: 'Family',
                  travelerMin: 3, travelerMax: 8, priceCents: 54900, currency: 'EUR',
                  isActive: true, isCustomQuote: false, sortOrder: 1, description: '',
                })}
                style={{ ...btnSecondary, fontSize: '12px' }}
              >
                Family Plan — €549
              </button>
              <button
                onClick={() => setEditing({
                  _preset: true,
                  name: 'Custom Trip', planType: 'custom', audienceLabel: '',
                  travelerMin: '', travelerMax: '', priceCents: null, currency: 'EUR',
                  isActive: true, isCustomQuote: true, sortOrder: 2, description: '',
                })}
                style={{ ...btnSecondary, fontSize: '12px' }}
              >
                Custom Quote
              </button>
            </div>
          </div>
        </div>
      ) : isMobile ? (
        <MobileList
          plans={plans}
          onEdit={p => setEditing(p)}
          onToggle={handleToggle}
          onReorder={handleReorder}
        />
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFAF8' }}>
                  <th style={th}>Plan</th>
                  <th style={th}>Type</th>
                  <th style={th}>Audience</th>
                  <th style={th}>Travellers</th>
                  <th style={th}>Price</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p, idx) => (
                  <tr key={p.id} style={{ opacity: p.isActive ? 1 : 0.55 }}>
                    <td style={td}>
                      <p style={{ fontWeight: '600', color: '#1C1A16' }}>{p.name}</p>
                      {p.description && (
                        <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '2px',
                          maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.description}
                        </p>
                      )}
                    </td>
                    <td style={td}>
                      <span style={{ fontSize: '11px', fontWeight: '600', padding: '2px 7px', borderRadius: '8px',
                        textTransform: 'uppercase', letterSpacing: '0.4px', ...planTypeBadgeColors(p) }}>
                        {planTypeLabel(p)}
                      </span>
                    </td>
                    <td style={{ ...td, color: '#4A433A' }}>{p.audienceLabel || '—'}</td>
                    <td style={{ ...td, color: '#4A433A' }}>
                      {p.travelerMin != null && p.travelerMax != null
                        ? `${p.travelerMin}–${p.travelerMax}`
                        : p.travelerMin != null
                          ? `${p.travelerMin}+`
                          : '—'}
                    </td>
                    <td style={td}>
                      <span style={{
                        fontWeight: '700', fontSize: '13px',
                        color: p.isCustomQuote ? '#8C8070' : '#C9A96E',
                        fontFamily: p.isCustomQuote ? 'inherit' : "'Playfair Display', Georgia, serif",
                        fontStyle: p.isCustomQuote ? 'italic' : 'normal',
                      }}>
                        {p.displayPrice || '—'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', fontSize: '10px', fontWeight: '700',
                        letterSpacing: '0.4px', textTransform: 'uppercase',
                        padding: '3px 8px', borderRadius: '10px',
                        color: p.isActive ? '#1B6B65' : '#8C8070',
                        background: p.isActive ? '#EFF6F5' : '#F4F1EC',
                      }}>
                        {p.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button onClick={() => handleReorder(p.id, 'up')} style={iconBtn} title="Move up"
                          disabled={idx === 0}>
                          <ChevronUp size={13} style={{ opacity: idx === 0 ? 0.3 : 1 }} />
                        </button>
                        <button onClick={() => handleReorder(p.id, 'down')} style={iconBtn} title="Move down"
                          disabled={idx === plans.length - 1}>
                          <ChevronDown size={13} style={{ opacity: idx === plans.length - 1 ? 0.3 : 1 }} />
                        </button>
                        <button onClick={() => handleToggle(p)} style={iconBtn}
                          title={p.isActive ? 'Disable plan' : 'Enable plan'}>
                          {p.isActive ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                        <button onClick={() => setEditing(p)} style={iconBtn} title="Edit">
                          <Edit2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileList({ plans, onEdit, onToggle, onReorder }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {plans.map((p, idx) => (
        <div key={p.id} style={{ background: 'white', border: '1px solid #E8E3DA', borderRadius: '10px',
          padding: '14px', opacity: p.isActive ? 1 : 0.6 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: '600', fontSize: '14px', color: '#1C1A16' }}>{p.name}</p>
              {p.description && (
                <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '2px',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.description}
                </p>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', flexShrink: 0 }}>
              <span style={{
                fontSize: '13px', fontWeight: '700',
                color: p.isCustomQuote ? '#8C8070' : '#C9A96E',
                fontFamily: p.isCustomQuote ? 'inherit' : "'Playfair Display', Georgia, serif",
                fontStyle: p.isCustomQuote ? 'italic' : 'normal',
              }}>
                {p.displayPrice || '—'}
              </span>
              <span style={{
                fontSize: '10px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase',
                padding: '2px 7px', borderRadius: '8px',
                color: p.isActive ? '#1B6B65' : '#8C8070',
                background: p.isActive ? '#EFF6F5' : '#F4F1EC',
              }}>
                {p.isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
          {(p.audienceLabel || p.travelerMin != null) && (
            <p style={{ fontSize: '12px', color: '#6B6156', marginBottom: '10px' }}>
              {[
                p.audienceLabel,
                p.travelerMin != null && p.travelerMax != null ? `${p.travelerMin}–${p.travelerMax} travellers`
                  : p.travelerMin != null ? `${p.travelerMin}+ travellers` : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          <div style={{ display: 'flex', gap: '6px', borderTop: '1px solid #F4F1EC', paddingTop: '10px' }}>
            <button onClick={() => onToggle(p)}
              style={{ flex: 1, padding: '6px', borderRadius: '5px', border: '1px solid #E8E3DA',
                background: 'white', cursor: 'pointer', fontSize: '12px', color: '#4A433A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              {p.isActive ? <EyeOff size={11} /> : <Eye size={11} />}
              {p.isActive ? 'Disable' : 'Enable'}
            </button>
            <button onClick={() => onEdit(p)}
              style={{ flex: 1, padding: '6px', borderRadius: '5px', border: '1px solid #E8E3DA',
                background: 'white', cursor: 'pointer', fontSize: '12px', color: '#4A433A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <Edit2 size={11} /> Edit
            </button>
            <button onClick={() => onReorder(p.id, 'up')} disabled={idx === 0}
              style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #E8E3DA',
                background: 'white', cursor: idx === 0 ? 'not-allowed' : 'pointer', fontSize: '12px', color: '#4A433A',
                display: 'flex', alignItems: 'center', opacity: idx === 0 ? 0.4 : 1 }}>
              <ChevronUp size={11} />
            </button>
            <button onClick={() => onReorder(p.id, 'down')} disabled={idx === plans.length - 1}
              style={{ padding: '6px 10px', borderRadius: '5px', border: '1px solid #E8E3DA',
                background: 'white', cursor: idx === plans.length - 1 ? 'not-allowed' : 'pointer',
                fontSize: '12px', color: '#4A433A', display: 'flex', alignItems: 'center',
                opacity: idx === plans.length - 1 ? 0.4 : 1 }}>
              <ChevronDown size={11} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
