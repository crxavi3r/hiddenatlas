import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, Save } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #E8E3DA',
  borderRadius: '6px', fontSize: '13.5px', color: '#1C1A16',
  background: 'white', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
};
const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: '90px', lineHeight: '1.6' };
const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: '600', color: '#6B6156',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px',
};
const fieldStyle = { marginBottom: '18px' };
const btnPrimary = {
  padding: '9px 20px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'flex', alignItems: 'center', gap: '6px',
};

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export default function CreatorEditorPage() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { getToken } = useAuth();
  const isMobile     = useIsMobile();
  const isNew        = id === 'new';

  const [loading, setLoading] = useState(!isNew);
  const [saving,  setSaving]  = useState(false);
  const [saveMsg, setSaveMsg] = useState(null);
  const [form,    setForm]    = useState({
    name: '', slug: '', avatarUrl: '', bio: '', userId: '', isActive: true,
  });

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const token = await getToken();
      // Use the admin list to find by id (creators API get is by slug)
      const res   = await fetch('/api/creators?action=list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json  = await res.json();
      if (json.error) throw new Error(json.error);
      const creator = json.creators.find(c => c.id === id);
      if (!creator) throw new Error('Creator not found');
      setForm({
        name:      creator.name      || '',
        slug:      creator.slug      || '',
        avatarUrl: creator.avatarUrl || '',
        bio:       creator.bio       || '',
        userId:    creator.userId    || '',
        isActive:  creator.isActive  ?? true,
      });
    } catch (e) { alert(e.message); navigate('/admin/creators'); }
    finally { setLoading(false); }
  }, [id, isNew, getToken, navigate]);

  useEffect(() => { load(); }, [load]);

  function handleNameChange(name) {
    setForm(f => ({
      ...f,
      name,
      slug: isNew ? slugify(name) : f.slug,
    }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.slug.trim()) {
      alert('Name and slug are required.');
      return;
    }
    setSaving(true); setSaveMsg(null);
    try {
      const token  = await getToken();
      const action = isNew ? 'create' : `update&id=${id}`;
      const res    = await fetch(`/api/creators?action=${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:      form.name.trim(),
          slug:      form.slug.trim(),
          avatarUrl: form.avatarUrl.trim() || null,
          bio:       form.bio.trim()       || null,
          userId:    form.userId.trim()    || null,
          isActive:  form.isActive,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSaveMsg({ ok: true, text: 'Saved.' });
      if (isNew) navigate(`/admin/creators/${json.creator.id}`, { replace: true });
    } catch (e) { setSaveMsg({ ok: false, text: e.message }); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 4000); }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%',
          border: '3px solid #E8E3DA', borderTopColor: '#1B6B65',
          animation: 'spin 0.8s linear infinite' }} />
      </div>
    );
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px', maxWidth: '640px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <Link to="/admin/creators" style={{ display: 'flex', alignItems: 'center', gap: '5px',
          color: '#6B6156', textDecoration: 'none', fontSize: '13px' }}>
          <ArrowLeft size={14} /> Creators
        </Link>
        <span style={{ color: '#D8D0C4' }}>›</span>
        <span style={{ fontSize: '13px', color: '#1C1A16', fontWeight: '500' }}>
          {isNew ? 'New Creator' : form.name || 'Edit Creator'}
        </span>
      </div>

      {/* Form */}
      <div style={{ ...card, padding: '28px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>
          Profile
        </p>

        <div style={fieldStyle}>
          <label style={labelStyle}>Name *</label>
          <input value={form.name} style={inputStyle} placeholder="e.g. Cristiano Xavier"
            onChange={e => handleNameChange(e.target.value)} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Slug *</label>
          <p style={{ fontSize: '11px', color: '#B5AA99', marginBottom: '6px' }}>
            Public URL: hiddenatlas.travel/<strong>{form.slug || '...'}</strong>
          </p>
          <input value={form.slug} style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="cristiano-xavier" onChange={e => setForm(f => ({ ...f, slug: e.target.value }))} />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Avatar URL</label>
          <input value={form.avatarUrl} style={inputStyle} placeholder="https://..."
            onChange={e => setForm(f => ({ ...f, avatarUrl: e.target.value }))} />
          {form.avatarUrl && (
            <img src={form.avatarUrl} alt="Preview"
              style={{ width: '48px', height: '48px', borderRadius: '50%', objectFit: 'cover',
                marginTop: '8px', border: '2px solid #E8E3DA' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Bio</label>
          <textarea value={form.bio} style={textareaStyle}
            placeholder="Short bio shown on the creator profile page…"
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
        </div>
      </div>

      <div style={{ ...card, padding: '28px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '4px' }}>
          Account Link
        </p>
        <p style={{ fontSize: '12px', color: '#8C8070', marginBottom: '20px' }}>
          Optional. Links this creator profile to an authenticated HiddenAtlas user account,
          allowing that user to log in and manage their own itineraries in the CMS.
        </p>

        <div style={fieldStyle}>
          <label style={labelStyle}>User ID</label>
          <p style={{ fontSize: '11px', color: '#B5AA99', marginBottom: '6px' }}>
            The internal User.id from the Users table (UUID).
          </p>
          <input value={form.userId} style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            onChange={e => setForm(f => ({ ...f, userId: e.target.value }))} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input type="checkbox" id="isActive" checked={form.isActive}
            onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            style={{ width: '15px', height: '15px', accentColor: '#1B6B65' }}
          />
          <label htmlFor="isActive" style={{ fontSize: '13.5px', color: '#4A433A', cursor: 'pointer' }}>
            Active (visible on public site and creator filter)
          </label>
        </div>
      </div>

      {/* Save row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={handleSave} disabled={saving} style={{ ...btnPrimary, opacity: saving ? 0.7 : 1 }}>
          <Save size={13} />
          {saving ? 'Saving…' : 'Save creator'}
        </button>
        {saveMsg && (
          <span style={{ fontSize: '13px', color: saveMsg.ok ? '#1B6B65' : '#C0392B' }}>
            {saveMsg.text}
          </span>
        )}
      </div>

    </div>
  );
}
