import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { PlusCircle, Edit2, X, CheckCircle, RefreshCw } from 'lucide-react';

const S = {
  page:    { padding: '28px 32px', background: '#FAFAF8', minHeight: '100vh' },
  title:   { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '700', color: '#1C1A16', margin: 0 },
  sub:     { fontSize: '13px', color: '#8C8070', marginTop: '4px' },
  card:    { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '20px 24px', marginBottom: '14px' },
  label:   { display: 'block', fontSize: '12px', fontWeight: '600', color: '#4A433A', marginBottom: '5px' },
  input:   { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  textarea:{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white', resize: 'vertical', fontFamily: 'inherit' },
  select:  { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  btnPrimary:   { padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: '#1B6B65', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '7px' },
  btnSecondary: { padding: '7px 13px', borderRadius: '6px', border: '1px solid #E8E3DA', cursor: 'pointer', fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A', display: 'inline-flex', alignItems: 'center', gap: '6px' },
};

const EMPTY_FORM = { name: '', platform: 'instagram', language: 'pt', subject: '', bodyText: '' };

async function crmCall(getToken, action, payload = {}) {
  const token = await getToken();
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'Request failed');
  return json.data;
}

export default function CreatorTemplatesPage() {
  const { getToken } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [showAdd, setShowAdd]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [filterLang, setFilterLang] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await crmCall(getToken, 'messages.listTemplates', filterLang ? { language: filterLang } : {});
      setTemplates(data.templates ?? []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken, filterLang]);

  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim() || !form.bodyText.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await crmCall(getToken, 'messages.updateTemplate', { id: editingId, ...form });
      } else {
        await crmCall(getToken, 'messages.createTemplate', form);
      }
      setForm(EMPTY_FORM); setEditingId(null); setShowAdd(false);
      load();
    } catch (e) {
      alert(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(tmpl) {
    try {
      await crmCall(getToken, 'messages.updateTemplate', { id: tmpl.id, isActive: !tmpl.isActive });
      load();
    } catch (e) { alert(e.message); }
  }

  function startEdit(tmpl) {
    setEditingId(tmpl.id);
    setForm({ name: tmpl.name, platform: tmpl.platform, language: tmpl.language, subject: tmpl.subject || '', bodyText: tmpl.body });
    setShowAdd(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const LANG_LABELS = { pt: 'Português', en: 'English', es: 'Español' };

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={S.title}>Message Templates</h1>
          <p style={S.sub}>Outreach templates for Instagram, email and other platforms</p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select value={filterLang} onChange={e => setFilterLang(e.target.value)} style={{ ...S.select, width: 'auto', padding: '7px 10px' }}>
            <option value="">All languages</option>
            <option value="pt">Português</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
          <button onClick={() => { setShowAdd(v => !v); setEditingId(null); setForm(EMPTY_FORM); }} style={S.btnPrimary}>
            <PlusCircle size={13} /> New Template
          </button>
        </div>
      </div>

      {showAdd && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>
              {editingId ? 'Edit Template' : 'New Template'}
            </h3>
            <button onClick={() => { setShowAdd(false); setEditingId(null); setForm(EMPTY_FORM); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070' }}><X size={14} /></button>
          </div>
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={S.label}>Template Name *</label>
                <input value={form.name} onChange={e => set('name', e.target.value)} style={S.input} placeholder="e.g. Instagram DM — PT" required />
              </div>
              <div>
                <label style={S.label}>Platform</label>
                <select value={form.platform} onChange={e => set('platform', e.target.value)} style={S.select}>
                  <option value="instagram">Instagram</option>
                  <option value="email">Email</option>
                  <option value="tiktok">TikTok</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Language</label>
                <select value={form.language} onChange={e => set('language', e.target.value)} style={S.select}>
                  <option value="pt">Português</option>
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Subject (email)</label>
                <input value={form.subject} onChange={e => set('subject', e.target.value)} style={S.input} placeholder="Optional" />
              </div>
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label style={S.label}>Message Body *</label>
              <p style={{ fontSize: '11.5px', color: '#8C8070', marginBottom: '6px' }}>
                Variables:{' '}
                <code style={{ background: '#F4F1EC', padding: '1px 4px', borderRadius: '3px' }}>{'{{firstName}}'}</code>{' '}
                <code style={{ background: '#F4F1EC', padding: '1px 4px', borderRadius: '3px' }}>{'{{destinationOrTheme}}'}</code>{' '}
                <code style={{ background: '#F4F1EC', padding: '1px 4px', borderRadius: '3px' }}>{'{{username}}'}</code>
              </p>
              <textarea
                value={form.bodyText}
                onChange={e => set('bodyText', e.target.value)}
                rows={7}
                style={S.textarea}
                placeholder="Hi {{firstName}}, I came across your content…"
                required
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => { setShowAdd(false); setEditingId(null); setForm(EMPTY_FORM); }} style={S.btnSecondary}>Cancel</button>
              <button type="submit" disabled={saving || !form.name.trim() || !form.bodyText.trim()} style={{ ...S.btnPrimary, opacity: (!form.name.trim() || !form.bodyText.trim()) ? 0.5 : 1 }}>
                <CheckCircle size={13} /> {saving ? 'Saving…' : editingId ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      )}

      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <p style={{ color: '#C0392B', margin: 0 }}>Error: {error}</p>
          <button onClick={load} style={{ ...S.btnSecondary, fontSize: '12px', padding: '5px 10px' }}>
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}
      {loading && <p style={{ color: '#8C8070' }}>Loading…</p>}

      {!loading && !error && templates.length === 0 && (
        <div style={{ ...S.card, textAlign: 'center', padding: '48px', color: '#B5AA99' }}>
          <p>No templates yet. Create your first one above.</p>
        </div>
      )}

      {templates.map(tmpl => (
        <div key={tmpl.id} style={{ ...S.card, opacity: tmpl.isActive ? 1 : 0.55 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <div>
              <span style={{ fontSize: '14px', fontWeight: '600', color: '#1C1A16' }}>{tmpl.name}</span>
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', color: '#1B6B65', background: '#EFF6F5', padding: '2px 7px', borderRadius: '9px' }}>{tmpl.platform}</span>
                <span style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', color: '#C9A96E', background: '#FBF8F1', padding: '2px 7px', borderRadius: '9px' }}>{LANG_LABELS[tmpl.language] || tmpl.language}</span>
                {!tmpl.isActive && <span style={{ fontSize: '10.5px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.4px', color: '#C0392B', background: '#FDECEA', padding: '2px 7px', borderRadius: '9px' }}>Inactive</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
              <button onClick={() => startEdit(tmpl)} style={S.btnSecondary}>
                <Edit2 size={12} /> Edit
              </button>
              <button onClick={() => handleToggle(tmpl)} style={{ ...S.btnSecondary, color: tmpl.isActive ? '#C0392B' : '#1B6B65', borderColor: tmpl.isActive ? '#F5C6C0' : '#D4C8BB' }}>
                {tmpl.isActive ? 'Disable' : 'Enable'}
              </button>
            </div>
          </div>
          {tmpl.subject && (
            <p style={{ fontSize: '12px', color: '#8C8070', margin: '0 0 6px' }}>
              <strong>Subject:</strong> {tmpl.subject}
            </p>
          )}
          <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '12.5px', color: '#4A433A', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: '#F8F6F2', padding: '10px 12px', borderRadius: '6px' }}>
            {tmpl.body}
          </pre>
        </div>
      ))}
    </div>
  );
}
