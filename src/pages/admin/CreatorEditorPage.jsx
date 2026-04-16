import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link, Navigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { useUserCtx } from '../../lib/useUserCtx.jsx';
import { ArrowLeft, Save, Upload, User, X, ExternalLink, CheckCircle } from 'lucide-react';
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
const btnSecondary = {
  padding: '7px 14px', borderRadius: '5px', border: '1px solid #E8E3DA', cursor: 'pointer',
  fontSize: '12px', fontWeight: '500', background: 'white', color: '#4A433A',
  display: 'flex', alignItems: 'center', gap: '6px',
};

function slugify(name) {
  return name.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

function normalizeSlugInput(value) {
  return value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-');
}

function getInitials(name) {
  if (!name?.trim()) return null;
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export default function CreatorEditorPage() {
  const { id }         = useParams();
  const navigate       = useNavigate();
  const { getToken }   = useAuth();
  const { isAdmin, creatorId, loading: ctxLoading } = useUserCtx();
  const isMobile       = useIsMobile();
  const isNew          = id === 'new';
  const avatarInputRef  = useRef(null);
  const slugEdited      = useRef(false); // tracks whether slug was manually changed on new creators
  const nameEdited      = useRef(false); // tracks whether name was manually typed by admin
  const userSelectorRef = useRef(null);
  const slugDebounceRef = useRef(null);

  const [loading,     setLoading]     = useState(!isNew);
  const [saving,      setSaving]      = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [saveMsg,     setSaveMsg]     = useState(null);
  const [linkedUser,    setLinkedUser]    = useState(null); // { name, email } or null
  const [userQuery,     setUserQuery]     = useState('');
  const [userResults,   setUserResults]   = useState([]);
  const [userSearching, setUserSearching] = useState(false);
  const [dropdownOpen,  setDropdownOpen]  = useState(false);
  const [slugStatus,    setSlugStatus]    = useState(null); // null | 'checking' | 'available' | 'taken'
  const [stats,         setStats]         = useState({ total: 0, published: 0 });
  const [form,        setForm]        = useState({
    name: '', slug: '', avatarUrl: '', bio: '', userId: '', isActive: true,
  });

  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const token = await getToken();
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
      setStats({
        total:     creator.total_itinerary_count || 0,
        published: creator.itinerary_count       || 0,
      });
      setLinkedUser(creator.linked_email ? { name: null, email: creator.linked_email } : null);
    } catch (e) { alert(e.message); navigate('/admin/creators'); }
    finally { setLoading(false); }
  }, [id, isNew, getToken, navigate]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (userSelectorRef.current && !userSelectorRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Ownership guard — designers can only edit their own profile; admins bypass
  if (!ctxLoading && !isAdmin) {
    if (isNew) return <Navigate to="/admin" replace />;
    if (id !== creatorId) return <Navigate to={creatorId ? `/admin/creators/${creatorId}` : '/admin'} replace />;
  }

  async function checkSlugRaw(slug) {
    if (!slug) return false;
    try {
      const token   = await getToken();
      const idParam = !isNew ? `&id=${encodeURIComponent(id)}` : '';
      const res     = await fetch(
        `/api/creators?action=check-slug&slug=${encodeURIComponent(slug)}${idParam}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      return json.available === true;
    } catch {
      return false;
    }
  }

  async function findAvailableSlug(base) {
    if (await checkSlugRaw(base)) return base;
    for (let i = 2; i <= 20; i++) {
      const candidate = `${base}-${i}`;
      if (await checkSlugRaw(candidate)) return candidate;
    }
    return base; // fallback — backend will catch if still taken
  }

  async function checkSlug(slug) {
    if (!slug) { setSlugStatus(null); return; }
    setSlugStatus('checking');
    try {
      const available = await checkSlugRaw(slug);
      setSlugStatus(available ? 'available' : 'taken');
    } catch {
      setSlugStatus(null); // fail open — backend is the real guard
    }
  }

  function scheduleSlugCheck(slug) {
    setSlugStatus(null);
    clearTimeout(slugDebounceRef.current);
    const trimmed = slug.replace(/^-+|-+$/g, '');
    if (trimmed) slugDebounceRef.current = setTimeout(() => checkSlug(trimmed), 400);
  }

  function handleNameChange(name) {
    nameEdited.current = true;
    const autoSlug = (isNew && !slugEdited.current) ? slugify(name) : null;
    setForm(f => ({ ...f, name, ...(autoSlug !== null ? { slug: autoSlug } : {}) }));
    if (autoSlug !== null) scheduleSlugCheck(autoSlug);
  }

  function handleSlugChange(value) {
    if (isNew) slugEdited.current = true;
    const normalized = normalizeSlugInput(value);
    setForm(f => ({ ...f, slug: normalized }));
    scheduleSlugCheck(normalized);
  }

  async function searchUsers(q) {
    if (!q.trim()) { setUserResults([]); setDropdownOpen(false); return; }
    setUserSearching(true);
    setDropdownOpen(true);
    try {
      const token = await getToken();
      const res   = await fetch(`/api/admin?action=users&q=${encodeURIComponent(q.trim())}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json  = await res.json();
      setUserResults(json.users || []);
    } catch { setUserResults([]); }
    finally { setUserSearching(false); }
  }

  function selectUser(user) {
    setLinkedUser({ name: user.name, email: user.email });
    setUserQuery('');
    setUserResults([]);
    setDropdownOpen(false);

    // Derive best display name from the selected user
    const displayName = user.name?.trim() ||
      (user.email?.includes('@') ? user.email.split('@')[0].replace(/[._-]+/g, ' ').trim() : '') ||
      '';

    const shouldPrefillName = !nameEdited.current && displayName;

    if (shouldPrefillName) {
      setForm(f => ({ ...f, userId: user.id, name: displayName }));

      if (!slugEdited.current) {
        const baseSlug = slugify(displayName);
        setSlugStatus('checking');
        findAvailableSlug(baseSlug).then(availableSlug => {
          if (!slugEdited.current) { // guard: admin may have typed during async resolution
            setForm(f => ({ ...f, slug: availableSlug }));
            setSlugStatus('available');
          }
        });
      }
    } else {
      setForm(f => ({ ...f, userId: user.id }));
    }
  }

  function clearLinkedUser() {
    setForm(f => ({ ...f, userId: '' }));
    setLinkedUser(null);
    setUserQuery('');
    setUserResults([]);
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const slug = form.slug.trim();
    if (!slug) {
      alert('Please enter a slug before uploading a profile image.');
      return;
    }

    setUploading(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = ev => resolve(ev.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const token = await getToken();
      const res   = await fetch('/api/creators?action=upload-avatar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, filename: file.name, data: base64 }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setForm(f => ({ ...f, avatarUrl: json.url }));
    } catch (err) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    const cleanSlug = form.slug.replace(/^-+|-+$/g, '').trim();
    if (!form.name.trim() || !cleanSlug) {
      alert('Name and slug are required.');
      return;
    }
    if (slugStatus === 'taken') {
      setSaveMsg({ ok: false, text: 'Slug is already in use — pick a different one' });
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
          slug:      cleanSlug,
          avatarUrl: form.avatarUrl || null,
          bio:       form.bio.trim() || null,
          userId:    form.userId.trim() || null,
          isActive:  form.isActive,
          // Only send email on creation — it's derived from the linked user account
          ...(isNew && linkedUser?.email ? { email: linkedUser.email } : {}),
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      setSaveMsg({ ok: true, text: `Saved at ${time}` });
      if (isNew) navigate(`/admin/creators/${json.creator.id}`, { replace: true });
    } catch (e) { setSaveMsg({ ok: false, text: e.message }); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 5000); }
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

  const initials   = getInitials(form.name);
  const cleanSlug  = form.slug.replace(/^-+|-+$/g, '').trim();
  const publicUrl  = cleanSlug ? `https://hiddenatlas.travel/${cleanSlug}` : null;

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px', maxWidth: '640px' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <Link to="/admin/creators" style={{ display: 'flex', alignItems: 'center', gap: '5px',
            color: '#6B6156', textDecoration: 'none', fontSize: '13px' }}>
            <ArrowLeft size={14} /> Travel Designers
          </Link>
          <span style={{ color: '#D8D0C4' }}>›</span>
          <span style={{ fontSize: '13px', color: '#1C1A16', fontWeight: '500' }}>
            {isNew ? 'New Travel Designer' : form.name || 'Edit Travel Designer'}
          </span>
        </div>

        {/* Summary bar — only for existing creators */}
        {!isNew && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Active / Inactive badge */}
            <span style={{
              fontSize: '11px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase',
              padding: '3px 10px', borderRadius: '10px',
              background: form.isActive ? '#EFF6F5' : '#F4F1EC',
              color: form.isActive ? '#1B6B65' : '#8C8070',
            }}>
              {form.isActive ? 'Active' : 'Inactive'}
            </span>

            {/* Itinerary count */}
            {stats.total > 0 && (
              <span style={{ fontSize: '12.5px', color: '#6B6156' }}>
                {stats.total} {stats.total === 1 ? 'itinerary' : 'itineraries'}
                {stats.published > 0 && stats.published < stats.total
                  && ` · ${stats.published} published`}
              </span>
            )}
            {stats.total === 0 && (
              <span style={{ fontSize: '12.5px', color: '#B5AA99' }}>No itineraries yet</span>
            )}

            {/* View public profile */}
            {publicUrl && (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: '5px',
                  fontSize: '12.5px', color: '#1B6B65', textDecoration: 'none', marginLeft: 'auto' }}
              >
                <ExternalLink size={12} />
                View public profile
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── Account link card ── */}
      <div style={{ ...card, padding: '28px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '4px' }}>
          Account Link
        </p>
        <p style={{ fontSize: '12px', color: '#8C8070', marginBottom: '20px', lineHeight: '1.6' }}>
          {isNew
            ? 'Search and select a user account to link. The name and slug will be pre-filled automatically.'
            : 'Optional. Links this creator profile to a HiddenAtlas user account. Once linked, that user can log in and manage their own itineraries in the CMS.'}
        </p>

        {isAdmin ? (
          <div style={{ ...fieldStyle }} ref={userSelectorRef}>
            {form.userId ? (
              /* ── Linked state ── */
              <div>
                <div style={{ padding: '10px 14px', background: '#F4F1EC', borderRadius: '6px',
                  display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle size={14} color="#1B6B65" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '11px', color: '#6B6156', fontWeight: '600',
                      textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '1px' }}>
                      Linked account
                    </p>
                    <p style={{ fontSize: '13px', color: '#1C1A16', overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {linkedUser?.name
                        ? `${linkedUser.name} — ${linkedUser.email}`
                        : linkedUser?.email || form.userId}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={clearLinkedUser}
                    style={{ ...btnSecondary, color: '#8C8070', padding: '5px 10px', flexShrink: 0 }}
                  >
                    <X size={12} />
                    Unlink
                  </button>
                </div>
                <p style={{ fontSize: '10.5px', color: '#C5BDB0', marginTop: '5px', fontFamily: 'monospace' }}>
                  {form.userId}
                </p>
              </div>
            ) : (
              /* ── Search state ── */
              <div>
                <label style={labelStyle}>Search user</label>
                <div style={{ position: 'relative' }}>
                  <input
                    value={userQuery}
                    style={{ ...inputStyle, paddingRight: userSearching ? '36px' : '12px' }}
                    placeholder="Name or email…"
                    onChange={e => { setUserQuery(e.target.value); searchUsers(e.target.value); }}
                    onFocus={() => userResults.length > 0 && setDropdownOpen(true)}
                  />
                  {userSearching && (
                    <div style={{ position: 'absolute', right: '10px', top: '50%',
                      transform: 'translateY(-50%)', width: '14px', height: '14px',
                      borderRadius: '50%', border: '2px solid #E8E3DA', borderTopColor: '#1B6B65',
                      animation: 'spin 0.8s linear infinite' }} />
                  )}
                  {dropdownOpen && (userResults.length > 0 || (!userSearching && userQuery.trim())) && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                      background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)', marginTop: '4px',
                      maxHeight: '220px', overflowY: 'auto',
                    }}>
                      {userResults.length > 0 ? userResults.map(u => (
                        <div
                          key={u.id}
                          onClick={() => selectUser(u)}
                          style={{ padding: '9px 14px', cursor: 'pointer',
                            borderBottom: '1px solid #F4F1EC' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F9F7F4'}
                          onMouseLeave={e => e.currentTarget.style.background = ''}
                        >
                          <p style={{ fontSize: '13px', color: '#1C1A16', fontWeight: '500' }}>
                            {u.name}
                          </p>
                          <p style={{ fontSize: '11.5px', color: '#6B6156', marginTop: '1px' }}>
                            {u.email}
                          </p>
                        </div>
                      )) : (
                        <div style={{ padding: '12px 14px' }}>
                          <p style={{ fontSize: '13px', color: '#8C8070' }}>No users found.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          linkedUser?.email && (
            <div style={{ marginBottom: '16px', padding: '10px 14px', background: '#F4F1EC', borderRadius: '6px',
              display: 'flex', alignItems: 'center', gap: '10px' }}>
              <CheckCircle size={14} color="#1B6B65" style={{ flexShrink: 0 }} />
              <div>
                <p style={{ fontSize: '11px', color: '#6B6156', fontWeight: '600', textTransform: 'uppercase',
                  letterSpacing: '0.4px', marginBottom: '1px' }}>Linked account</p>
                <p style={{ fontSize: '13px', color: '#1C1A16' }}>{linkedUser.email}</p>
              </div>
            </div>
          )
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <input type="checkbox" id="isActive" checked={form.isActive}
            onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
            style={{ width: '15px', height: '15px', accentColor: '#1B6B65' }}
          />
          <label htmlFor="isActive" style={{ fontSize: '13.5px', color: '#4A433A', cursor: 'pointer' }}>
            Active (visible on public site and in creator filters)
          </label>
        </div>
      </div>

      {/* ── Profile card ── */}
      <div style={{ ...card, padding: '28px', marginBottom: '20px' }}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>
          Profile
        </p>

        {/* Name */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Name *</label>
          <input value={form.name} style={inputStyle} placeholder="e.g. Cristiano Xavier"
            onChange={e => handleNameChange(e.target.value)} />
        </div>

        {/* Slug */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Slug *</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: '#B5AA99' }}>
              Public URL:
            </span>
            {publicUrl ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '11px', color: '#1B6B65', textDecoration: 'none',
                  display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                hiddenatlas.travel/<strong>{cleanSlug}</strong>
                <ExternalLink size={10} />
              </a>
            ) : (
              <span style={{ fontSize: '11px', color: '#B5AA99' }}>
                hiddenatlas.travel/<strong>...</strong>
              </span>
            )}
          </div>
          <input
            value={form.slug}
            style={{
              ...inputStyle, fontFamily: 'monospace',
              ...(slugStatus === 'taken'     && { borderColor: '#E74C3C', background: '#FEF9F8' }),
              ...(slugStatus === 'available' && { borderColor: '#27AE60' }),
            }}
            placeholder="cristiano-xavier"
            onChange={e => handleSlugChange(e.target.value)}
          />
          {slugStatus === 'checking' && (
            <p style={{ fontSize: '11px', color: '#8C8070', marginTop: '5px',
              display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ display: 'inline-block', width: '10px', height: '10px', borderRadius: '50%',
                border: '1.5px solid #D8D0C4', borderTopColor: '#8C8070',
                animation: 'spin 0.7s linear infinite', flexShrink: 0 }} />
              Checking…
            </p>
          )}
          {slugStatus === 'available' && (
            <p style={{ fontSize: '11px', color: '#27AE60', marginTop: '5px',
              display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={11} />
              Available
            </p>
          )}
          {slugStatus === 'taken' && (
            <div style={{ marginTop: '6px' }}>
              <p style={{ fontSize: '11px', color: '#E74C3C', marginBottom: '6px' }}>
                This slug is already in use
              </p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {[`${cleanSlug}-2`, `${cleanSlug}-3`].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSlugChange(s)}
                    style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
                      border: '1px solid #E8E3DA', background: 'white', cursor: 'pointer',
                      color: '#4A433A', fontFamily: 'monospace' }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile image */}
        <div style={fieldStyle}>
          <label style={labelStyle}>Profile image</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>

            {/* Avatar preview / initials */}
            <div style={{
              width: '72px', height: '72px', borderRadius: '50%', flexShrink: 0,
              border: '2px solid #E8E3DA', background: form.avatarUrl ? '#F4F1EC' : '#EFF6F5',
              overflow: 'hidden',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {form.avatarUrl
                ? <img src={form.avatarUrl} alt="Profile preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={e => { e.currentTarget.style.display = 'none'; }}
                  />
                : initials
                  ? <span style={{ fontSize: '22px', fontWeight: '600', color: '#1B6B65', letterSpacing: '-0.5px' }}>
                      {initials}
                    </span>
                  : <User size={28} color="#B5AA99" />
              }
            </div>

            {/* Upload controls */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                style={{ display: 'none' }}
                onChange={handleAvatarUpload}
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploading}
                style={{ ...btnSecondary, opacity: uploading ? 0.7 : 1 }}
              >
                <Upload size={12} />
                {uploading ? 'Uploading…' : form.avatarUrl ? 'Replace photo' : 'Upload photo'}
              </button>
              {form.avatarUrl && !uploading && (
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, avatarUrl: '' }))}
                  style={{ ...btnSecondary, color: '#C0392B', borderColor: '#FDECEA', fontSize: '11.5px', padding: '5px 12px' }}
                >
                  <X size={11} />
                  Remove
                </button>
              )}
            </div>
          </div>
          {!form.slug.trim() && (
            <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '8px' }}>
              Enter a slug above before uploading.
            </p>
          )}
        </div>

        {/* Bio */}
        <div style={{ ...fieldStyle, marginBottom: 0 }}>
          <label style={labelStyle}>Bio</label>
          <textarea value={form.bio} style={textareaStyle}
            placeholder="Short bio shown on the creator profile page…"
            onChange={e => setForm(f => ({ ...f, bio: e.target.value }))} />
        </div>
      </div>

      {/* ── Save row ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={handleSave} disabled={saving || slugStatus === 'taken'}
          style={{ ...btnPrimary, opacity: (saving || slugStatus === 'taken') ? 0.7 : 1 }}>
          <Save size={13} />
          {saving ? 'Saving…' : 'Save creator'}
        </button>
        {saveMsg && (
          <span style={{
            display: 'flex', alignItems: 'center', gap: '5px',
            fontSize: '13px', color: saveMsg.ok ? '#1B6B65' : '#C0392B',
          }}>
            {saveMsg.ok && <CheckCircle size={13} />}
            {saveMsg.text}
          </span>
        )}
      </div>

    </div>
  );
}
