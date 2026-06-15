import { useState } from 'react';
import { X } from 'lucide-react';

const PIPELINE_STATUSES = [
  'identified','qualified','message_prepared','contacted','replied','interested',
  'proposal_sent','demo_scheduled','accepted','onboarding','itinerary_in_creation','active',
  'rejected','follow_up_later','blocked','not_fit',
];

const PLATFORMS = ['instagram', 'tiktok', 'youtube', 'other'];

// ── Styles (module-level so they're stable across renders) ───────────────────
const S = {
  overlay:  { position: 'fixed', inset: 0, background: 'rgba(28,26,22,0.55)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1100, padding: '40px 16px', overflowY: 'auto' },
  modal:    { background: 'white', borderRadius: '12px', width: '100%', maxWidth: '640px', boxShadow: '0 8px 32px rgba(0,0,0,0.18)', margin: 'auto' },
  inp:      { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  ta:       { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white', resize: 'vertical', fontFamily: 'inherit', minHeight: '72px' },
  lbl:      { display: 'block', fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' },
  grid2:    { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' },
  tabBar:   { display: 'flex', gap: '2px', marginBottom: '20px', background: '#F4F1EC', borderRadius: '8px', padding: '3px' },
  secTitle: { fontSize: '11.5px', fontWeight: '700', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '14px', marginTop: 0 },
};

function tabBtn(active) {
  return { flex: 1, padding: '7px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '12.5px', fontWeight: active ? '600' : '400', background: active ? 'white' : 'transparent', color: active ? '#1C1A16' : '#8C8070', boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', transition: 'all 0.12s' };
}

// ── Field helper (module-level — stable reference, no focus loss) ────────────
function Field({ label, span, children }) {
  return (
    <div style={span === 2 ? { gridColumn: '1 / -1' } : {}}>
      <label style={S.lbl}>{label}</label>
      {children}
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────
function toDateInput(ts) {
  if (!ts) return '';
  try { return new Date(ts).toISOString().slice(0, 10); } catch { return ''; }
}

function initForm(lead) {
  return {
    displayName:    lead.displayName    || '',
    username:       (lead.username      || '').replace(/^@/, ''),
    platform:       lead.platform       || 'instagram',
    category:       lead.category       || '',
    country:        lead.country        || '',
    language:       lead.language       || '',
    websiteUrl:     lead.websiteUrl     || '',
    email:          lead.email          || '',
    bio:            lead.bio            || '',
    niches:         Array.isArray(lead.niches) ? lead.niches.join(', ') : '',
    status:         lead.status         || 'identified',
    priority:       lead.priority != null ? String(lead.priority) : '',
    score:          lead.score     != null ? String(lead.score) : '',
    fitSummary:     lead.fitSummary     || '',
    lastContactedAt: toDateInput(lead.lastContactedAt),
    nextFollowUpAt:  toDateInput(lead.nextFollowUpAt),
    profileUrl:     lead.profileUrl     || '',
    followersCount: lead.followersCount != null ? String(lead.followersCount) : '',
    postsCount:     lead.postsCount     != null ? String(lead.postsCount) : '',
    engagementRate: lead.engagementRate != null ? String(lead.engagementRate) : '',
    avatarUrl:      lead.avatarUrl      || '',
  };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function EditLeadModal({ lead, getToken, onClose, onSaved }) {
  const [form, setForm]       = useState(() => initForm(lead));
  const [section, setSection] = useState('profile');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  async function handleSave(e) {
    e.preventDefault();
    setError(null);

    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      setError('Invalid email format.'); return;
    }
    if (form.score !== '' && (isNaN(Number(form.score)) || Number(form.score) < 0 || Number(form.score) > 10)) {
      setError('Score must be a number between 0 and 10.'); return;
    }

    setLoading(true);
    try {
      const token = await getToken();
      const payload = {
        id: lead.id,
        displayName:    form.displayName.trim()  || null,
        username:       form.username.replace(/^@/, '').trim() || null,
        platform:       form.platform,
        category:       form.category.trim()     || null,
        country:        form.country.trim()       || null,
        language:       form.language.trim()       || null,
        websiteUrl:     form.websiteUrl.trim()    || null,
        email:          form.email.trim()          || null,
        bio:            form.bio.trim()            || null,
        niches:         form.niches ? form.niches.split(',').map(s => s.trim()).filter(Boolean) : [],
        status:         form.status,
        priority:       form.priority !== '' ? form.priority : null,
        score:          form.score    !== '' ? Number(form.score) : null,
        fitSummary:     form.fitSummary.trim()    || null,
        lastContactedAt: form.lastContactedAt     || null,
        nextFollowUpAt:  form.nextFollowUpAt      || null,
        profileUrl:     form.profileUrl.trim()    || null,
        followersCount: form.followersCount !== '' ? parseInt(form.followersCount, 10) : null,
        postsCount:     form.postsCount     !== '' ? parseInt(form.postsCount, 10)     : null,
        engagementRate: form.engagementRate !== '' ? Number(form.engagementRate)       : null,
        avatarUrl:      form.avatarUrl.trim()     || null,
      };

      const res  = await fetch('/api/admin', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'leads.update', payload }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error?.message || 'Failed to save');
      onSaved(json.data.lead);
    } catch (err) {
      setError(err.message || 'Failed to save changes.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={S.overlay} onClick={e => e.target === e.currentTarget && !loading && onClose()}>
      <div style={S.modal}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid #E8E3DA' }}>
          <div>
            <p style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#1C1A16' }}>Edit Lead</p>
            <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8C8070' }}>@{lead.username}{lead.platform ? ` · ${lead.platform}` : ''}</p>
          </div>
          <button onClick={onClose} disabled={loading} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070', display: 'flex', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave}>
          <div style={{ padding: '20px 22px' }}>
            {/* Tab nav */}
            <div style={S.tabBar}>
              {[['profile', 'Profile'], ['crm', 'CRM'], ['instagram', 'Instagram']].map(([k, label]) => (
                <button key={k} type="button" style={tabBtn(section === k)} onClick={() => setSection(k)}>{label}</button>
              ))}
            </div>

            {/* Profile */}
            {section === 'profile' && (
              <>
                <p style={S.secTitle}>Profile Information</p>
                <div style={S.grid2}>
                  <Field label="Display Name">
                    <input style={S.inp} value={form.displayName} onChange={e => set('displayName', e.target.value)} placeholder="Creator name" />
                  </Field>
                  <Field label="Username">
                    <input style={S.inp} value={form.username} onChange={e => set('username', e.target.value.replace(/^@/, ''))} placeholder="username" />
                  </Field>
                  <Field label="Platform">
                    <select style={S.inp} value={form.platform} onChange={e => set('platform', e.target.value)}>
                      {PLATFORMS.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                    </select>
                  </Field>
                  <Field label="Category">
                    <input style={S.inp} value={form.category} onChange={e => set('category', e.target.value)} placeholder="travel, lifestyle…" />
                  </Field>
                  <Field label="Country">
                    <input style={S.inp} value={form.country} onChange={e => set('country', e.target.value)} placeholder="Portugal" />
                  </Field>
                  <Field label="Language">
                    <input style={S.inp} value={form.language} onChange={e => set('language', e.target.value)} placeholder="en, pt, es…" />
                  </Field>
                  <Field label="Email">
                    <input style={S.inp} type="text" value={form.email} onChange={e => set('email', e.target.value)} placeholder="creator@email.com" />
                  </Field>
                  <Field label="Website">
                    <input style={S.inp} value={form.websiteUrl} onChange={e => set('websiteUrl', e.target.value)} placeholder="https://…" />
                  </Field>
                  <Field label="Bio" span={2}>
                    <textarea style={S.ta} value={form.bio} onChange={e => set('bio', e.target.value)} placeholder="Creator bio…" />
                  </Field>
                  <Field label="Niches (comma separated)" span={2}>
                    <input style={S.inp} value={form.niches} onChange={e => set('niches', e.target.value)} placeholder="travel, adventure, photography" />
                    {form.niches && (
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {form.niches.split(',').map(s => s.trim()).filter(Boolean).map(tag => (
                          <span key={tag} style={{ background: '#EFF6F5', color: '#1B6B65', fontSize: '11px', fontWeight: '600', padding: '2px 8px', borderRadius: '9px' }}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </Field>
                </div>
              </>
            )}

            {/* CRM */}
            {section === 'crm' && (
              <>
                <p style={S.secTitle}>CRM Data</p>
                <div style={S.grid2}>
                  <Field label="Status">
                    <select style={S.inp} value={form.status} onChange={e => set('status', e.target.value)}>
                      {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                    </select>
                  </Field>
                  <Field label="Priority">
                    <select style={S.inp} value={form.priority} onChange={e => set('priority', e.target.value)}>
                      <option value="">None</option>
                      <option value="0">Low</option>
                      <option value="1">Medium</option>
                      <option value="2">High</option>
                    </select>
                  </Field>
                  <Field label="Score (0–10)">
                    <input style={S.inp} type="number" min="0" max="10" step="0.1" value={form.score} onChange={e => set('score', e.target.value)} placeholder="0–10" />
                  </Field>
                  <div />
                  <Field label="Last Contacted">
                    <input style={S.inp} type="date" value={form.lastContactedAt} onChange={e => set('lastContactedAt', e.target.value)} />
                  </Field>
                  <Field label="Next Follow-up">
                    <input style={S.inp} type="date" value={form.nextFollowUpAt} onChange={e => set('nextFollowUpAt', e.target.value)} />
                  </Field>
                  <Field label="Fit Summary" span={2}>
                    <textarea style={{ ...S.ta, minHeight: '90px' }} value={form.fitSummary} onChange={e => set('fitSummary', e.target.value)} placeholder="Summary of this creator's fit for HiddenAtlas…" />
                  </Field>
                </div>
              </>
            )}

            {/* Instagram */}
            {section === 'instagram' && (
              <>
                <p style={S.secTitle}>Instagram / Social Data</p>
                <p style={{ fontSize: '12px', color: '#8C8070', marginBottom: '14px', marginTop: '-6px', background: '#F8F6F2', padding: '8px 10px', borderRadius: '6px', lineHeight: '1.5' }}>
                  Fields marked with * update automatically when you click "Refresh Instagram". Manual edits here are preserved for CRM-only data.
                </p>
                <div style={S.grid2}>
                  <Field label="Profile URL" span={2}>
                    <input style={S.inp} value={form.profileUrl} onChange={e => set('profileUrl', e.target.value)} placeholder="https://www.instagram.com/username/" />
                  </Field>
                  <Field label="Avatar URL *" span={2}>
                    <input style={S.inp} value={form.avatarUrl} onChange={e => set('avatarUrl', e.target.value)} placeholder="https://…" />
                  </Field>
                  <Field label="Followers *">
                    <input style={S.inp} type="number" min="0" value={form.followersCount} onChange={e => set('followersCount', e.target.value)} placeholder="45000" />
                  </Field>
                  <Field label="Posts *">
                    <input style={S.inp} type="number" min="0" value={form.postsCount} onChange={e => set('postsCount', e.target.value)} placeholder="320" />
                  </Field>
                  <Field label="Engagement Rate % *">
                    <input style={S.inp} type="number" min="0" max="100" step="0.01" value={form.engagementRate} onChange={e => set('engagementRate', e.target.value)} placeholder="3.5" />
                  </Field>
                </div>
              </>
            )}

            {/* Error */}
            {error && (
              <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', borderRadius: '6px', padding: '9px 12px', marginTop: '10px' }}>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#C0392B' }}>{error}</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid #E8E3DA' }}>
            <button type="button" onClick={onClose} disabled={loading}
              style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #E8E3DA', cursor: 'pointer', fontSize: '13px', background: 'white', color: '#4A433A' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              style={{ padding: '8px 18px', borderRadius: '6px', border: 'none', cursor: loading ? 'wait' : 'pointer', fontSize: '13px', fontWeight: '600', background: '#1B6B65', color: 'white', opacity: loading ? 0.7 : 1 }}>
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
