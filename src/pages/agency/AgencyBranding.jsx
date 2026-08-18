import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useAgencyCtx } from '../../lib/useAgencyCtx.jsx';
import { Upload, Check, Lock } from 'lucide-react';

const C = {
  teal:    '#1B6B65',
  gold:    '#C9A96E',
  stone:   '#FAFAF8',
  charcoal:'#1C1A16',
  muted:   '#8C8070',
  border:  '#E8E3DA',
  lightBg: '#F7F4F0',
  white:   '#FFFFFF',
};

function SectionCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: C.white,
      border: `1px solid ${C.border}`,
      borderRadius: '12px',
      padding: '24px',
      marginBottom: '20px',
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: C.charcoal }}>
          {title}
        </h2>
        {subtitle && (
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: C.muted, lineHeight: 1.5 }}>
            {subtitle}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

function SaveButton({ onClick, loading, saved, error }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
      <button
        onClick={onClick}
        disabled={loading || saved}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          padding: '9px 20px', borderRadius: '8px', border: 'none',
          background: saved ? '#2D7A45' : loading ? C.border : C.teal,
          color: loading ? C.muted : C.white,
          fontSize: '14px', fontWeight: '700',
          cursor: loading || saved ? 'not-allowed' : 'pointer',
          transition: 'background 0.2s',
        }}
      >
        {saved ? <><Check size={14} /> Saved</> : loading ? 'Saving...' : 'Save'}
      </button>
      {error && (
        <span style={{ fontSize: '12px', color: '#B91C1C' }}>{error}</span>
      )}
    </div>
  );
}

function FieldRow({ label, value, onChange, type = 'text', placeholder, readOnly }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '13px', fontWeight: '600', color: C.charcoal }}>
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{
          padding: '9px 13px',
          border: `1px solid ${C.border}`,
          borderRadius: '8px',
          fontSize: '14px',
          color: C.charcoal,
          background: readOnly ? C.lightBg : C.white,
          outline: 'none',
          cursor: readOnly ? 'not-allowed' : 'text',
        }}
      />
    </div>
  );
}

function ColorInput({ label, value, onChange, readOnly }) {
  const [hex, setHex] = useState(value || '#000000');

  useEffect(() => { setHex(value || '#000000'); }, [value]); // eslint-disable-line react-hooks/set-state-in-effect

  const handleHexChange = (v) => {
    setHex(v);
    if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1, minWidth: 0 }}>
      <label style={{ fontSize: '13px', fontWeight: '600', color: C.charcoal }}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          width: '28px', height: '28px', borderRadius: '6px',
          background: /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#cccccc',
          border: `1px solid ${C.border}`,
          flexShrink: 0,
        }} />
        <input
          type="text"
          value={hex}
          onChange={e => handleHexChange(e.target.value)}
          placeholder="#1B6B65"
          maxLength={7}
          readOnly={readOnly}
          style={{
            padding: '8px 12px',
            border: `1px solid ${C.border}`,
            borderRadius: '8px',
            fontSize: '14px', fontFamily: 'monospace',
            color: C.charcoal,
            background: readOnly ? C.lightBg : C.white,
            outline: 'none', flex: 1, minWidth: 0,
          }}
        />
      </div>
    </div>
  );
}

function LogoUploadArea({ label, hint, logoUrl, onUpload, loading, readOnly }) {
  const fileRef = useRef(null);
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      <p style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: '600', color: C.charcoal }}>{label}</p>
      <p style={{ margin: '0 0 10px', fontSize: '12px', color: C.muted }}>{hint}</p>
      <div style={{
        border: `2px dashed ${C.border}`,
        borderRadius: '10px',
        background: C.lightBg,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '12px',
        minHeight: '100px',
        justifyContent: 'center',
      }}>
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={label}
            style={{ maxHeight: '56px', maxWidth: '100%', objectFit: 'contain' }}
          />
        ) : (
          <div style={{ fontSize: '13px', color: C.muted, textAlign: 'center' }}>No logo uploaded</div>
        )}
        {!readOnly && (
          <>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={loading}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 16px', borderRadius: '7px',
                border: `1px solid ${C.border}`,
                background: C.white, color: C.charcoal,
                fontSize: '13px', fontWeight: '600',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              <Upload size={13} /> {loading ? 'Uploading...' : 'Upload'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.[0]) onUpload(e.target.files[0]); }}
            />
          </>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, readOnly }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !readOnly && onChange(!checked)}
      style={{
        width: '42px', height: '24px',
        borderRadius: '12px',
        border: 'none',
        background: checked ? C.teal : C.border,
        cursor: readOnly ? 'not-allowed' : 'pointer',
        position: 'relative',
        flexShrink: 0,
        transition: 'background 0.2s',
        padding: 0,
      }}
    >
      <span style={{
        display: 'block',
        width: '18px', height: '18px',
        borderRadius: '50%',
        background: C.white,
        position: 'absolute',
        top: '3px',
        left: checked ? '21px' : '3px',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

function useSaveState() {
  const [loading, setLoading] = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState(null);
  const timerRef              = useRef(null);

  const trigger = useCallback(async (fn) => {
    setLoading(true);
    setSaved(false);
    setError(null);
    try {
      await fn();
      setSaved(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || 'Save failed');
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, saved, error, trigger };
}

export default function AgencyBranding() {
  const { agencyId, role } = useAgencyCtx();
  const { getToken }       = useAuth();
  const canManage = role === 'owner' || role === 'admin';

  const [_branding, setBranding]      = useState(null);
  const [fetchError, setFetchError]   = useState(null);
  const [fetchLoading, setFetchLoading] = useState(true);

  // Section states
  const [agencyName, setAgencyName]               = useState('');
  const [primaryColor, setPrimaryColor]           = useState('#1B6B65');
  const [accentColor, setAccentColor]             = useState('#C9A96E');
  const [website, setWebsite]                     = useState('');
  const [supportEmail, setSupportEmail]           = useState('');
  const [phone, setPhone]                         = useState('');
  const [whatsapp, setWhatsapp]                   = useState('');
  const [showPowered, setShowPowered]             = useState(true);
  const [lightLogoUrl, setLightLogoUrl]           = useState('');
  const [darkLogoUrl, setDarkLogoUrl]             = useState('');
  const [logoLightLoading, setLogoLightLoading]   = useState(false);
  const [logoDarkLoading, setLogoDarkLoading]     = useState(false);

  const nameSave    = useSaveState();
  const colorSave   = useSaveState();
  const contactSave = useSaveState();
  const portalSave  = useSaveState();

  const fetchBranding = useCallback(async () => {
    if (!agencyId) return;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const token = await getToken();
      const res = await fetch(`/api/agency?action=branding&agencyId=${agencyId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load branding');
      const data = await res.json();
      const b = data.branding || {};
      setBranding(b);
      // agencyName lives on Agency, returned at data.agencyName (not inside data.branding)
      setAgencyName(data.agencyName || '');
      setPrimaryColor(b.primaryColor || '#1B6B65');
      setAccentColor(b.accentColor || '#C9A96E');
      // API returns websiteUrl (not website)
      setWebsite(b.websiteUrl || '');
      setSupportEmail(b.supportEmail || '');
      setPhone(b.phone || '');
      setWhatsapp(b.whatsapp || '');
      setShowPowered(b.showPoweredByHiddenatlas ?? true);
      setLightLogoUrl(b.logoUrl || '');
      setDarkLogoUrl(b.logoDarkUrl || '');
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setFetchLoading(false);
    }
  }, [agencyId, getToken]);

  useEffect(() => { fetchBranding(); }, [fetchBranding]);

  // Apply the branding object returned by the API to local state.
  // Only overwrites fields that are present in the response (non-undefined).
  const applyBrandingResponse = useCallback((b) => {
    if (!b) return;
    if (b.primaryColor   !== undefined) setPrimaryColor(b.primaryColor || '#1B6B65');
    if (b.accentColor    !== undefined) setAccentColor(b.accentColor   || '#C9A96E');
    if (b.websiteUrl     !== undefined) setWebsite(b.websiteUrl        || '');
    if (b.supportEmail   !== undefined) setSupportEmail(b.supportEmail || '');
    if (b.phone          !== undefined) setPhone(b.phone               || '');
    if (b.whatsapp       !== undefined) setWhatsapp(b.whatsapp         || '');
    if (b.showPoweredByHiddenatlas !== undefined) setShowPowered(b.showPoweredByHiddenatlas ?? true);
    if (b.logoUrl        !== undefined) setLightLogoUrl(b.logoUrl      || '');
    if (b.logoDarkUrl    !== undefined) setDarkLogoUrl(b.logoDarkUrl   || '');
  }, []);

  const authPost = useCallback(async (url, body) => {
    const token = await getToken();
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('[branding] save failed', url, data);
      throw new Error(data.error || 'Save failed');
    }
    return data;
  }, [getToken]);

  // agencyId MUST be in the URL query string — the API reads it from req.query, not req.body.
  const handleSaveName = useCallback(() => {
    nameSave.trigger(async () => {
      await authPost(`/api/agency?action=update-agency-name&agencyId=${agencyId}`, { name: agencyName });
    });
  }, [nameSave, authPost, agencyId, agencyName]);

  const handleSaveColors = useCallback(() => {
    colorSave.trigger(async () => {
      const data = await authPost(
        `/api/agency?action=update-branding&agencyId=${agencyId}`,
        { primaryColor, accentColor }
      );
      applyBrandingResponse(data.branding);
    });
  }, [colorSave, authPost, agencyId, primaryColor, accentColor, applyBrandingResponse]);

  const handleSaveContact = useCallback(() => {
    contactSave.trigger(async () => {
      const data = await authPost(
        `/api/agency?action=update-branding&agencyId=${agencyId}`,
        { websiteUrl: website, supportEmail, phone, whatsapp }
      );
      applyBrandingResponse(data.branding);
    });
  }, [contactSave, authPost, agencyId, website, supportEmail, phone, whatsapp, applyBrandingResponse]);

  const handleSavePortal = useCallback((newVal) => {
    setShowPowered(newVal);
    portalSave.trigger(async () => {
      const data = await authPost(
        `/api/agency?action=update-branding&agencyId=${agencyId}`,
        { showPoweredByHiddenatlas: newVal }
      );
      applyBrandingResponse(data.branding);
    });
  }, [portalSave, authPost, agencyId, applyBrandingResponse]);

  const handleLogoUpload = useCallback(async (file, variant) => {
    const setLoading = variant === 'light' ? setLogoLightLoading : setLogoDarkLoading;
    setLoading(true);
    try {
      const token = await getToken();
      // API expects JSON with base64Data + filename + field (not FormData).
      // agencyId must be in the URL query so the API can resolve auth context.
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload  = () => resolve(reader.result); // data URL incl. mime prefix
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      // variant 'light' → field 'logoUrl'; 'dark' → 'logoDarkUrl'
      const field = variant === 'light' ? 'logoUrl' : 'logoDarkUrl';
      const res = await fetch(`/api/agency?action=branding-logo-upload&agencyId=${agencyId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64Data, filename: file.name, field }),
      });
      if (!res.ok) throw new Error('Upload failed');
      // API returns { url: '<permanent blob URL>' }
      const data = await res.json();
      if (variant === 'light') setLightLogoUrl(data.url || '');
      else setDarkLogoUrl(data.url || '');
    } catch {
      // silently fail; logo state is unchanged
    } finally {
      setLoading(false);
    }
  }, [agencyId, getToken]);

  if (fetchLoading) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: C.muted, fontSize: '15px' }}>
        Loading branding settings...
      </div>
    );
  }

  if (fetchError) {
    return (
      <div style={{ padding: '32px 24px', textAlign: 'center', color: '#C0392B', fontSize: '14px' }}>
        {fetchError}
      </div>
    );
  }

  const readOnly = !canManage;

  return (
    <div style={{ padding: '32px 24px', maxWidth: '740px', margin: '0 auto' }}>
      {/* Page header */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: C.charcoal, fontFamily: "'Playfair Display', Georgia, serif" }}>
            Branding
          </h1>
          {readOnly && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px',
              padding: '3px 10px', borderRadius: '99px',
              background: C.lightBg, color: C.muted,
              fontSize: '12px', fontWeight: '600',
            }}>
              <Lock size={11} /> View only
            </span>
          )}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: '14px', color: C.muted, lineHeight: 1.55, maxWidth: '520px' }}>
          Customise how your agency appears to clients in their travel portal.
        </p>
      </div>

      {/* Section 1: Agency Name */}
      <SectionCard title="Agency Name">
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '200px' }}>
            <FieldRow
              label="Name"
              value={agencyName}
              onChange={setAgencyName}
              placeholder="Your Agency Name"
              readOnly={readOnly}
            />
          </div>
          {!readOnly && (
            <SaveButton onClick={handleSaveName} loading={nameSave.loading} saved={nameSave.saved} error={nameSave.error} />
          )}
        </div>
      </SectionCard>

      {/* Section 2: Brand Colors */}
      <SectionCard title="Brand Colors" subtitle="These colors appear in client-facing pages and PDF documents.">
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '20px' }}>
          <ColorInput
            label="Primary Color"
            value={primaryColor}
            onChange={setPrimaryColor}
            readOnly={readOnly}
          />
          <ColorInput
            label="Accent Color"
            value={accentColor}
            onChange={setAccentColor}
            readOnly={readOnly}
          />
        </div>
        {!readOnly && (
          <SaveButton onClick={handleSaveColors} loading={colorSave.loading} saved={colorSave.saved} error={colorSave.error} />
        )}
      </SectionCard>

      {/* Section 3: Logo */}
      <SectionCard title="Logo" subtitle="Upload logos for use on dark and light backgrounds.">
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
          <LogoUploadArea
            label="Light Logo"
            hint="Used on dark or teal backgrounds"
            logoUrl={lightLogoUrl}
            onUpload={file => handleLogoUpload(file, 'light')}
            loading={logoLightLoading}
            readOnly={readOnly}
          />
          <LogoUploadArea
            label="Dark Logo"
            hint="Used on white or light backgrounds"
            logoUrl={darkLogoUrl}
            onUpload={file => handleLogoUpload(file, 'dark')}
            loading={logoDarkLoading}
            readOnly={readOnly}
          />
        </div>
      </SectionCard>

      {/* Section 4: Contact & Links */}
      <SectionCard title="Contact and Links" subtitle="Shown in client-facing portals and trip documents.">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '20px' }}>
          <FieldRow label="Website" value={website} onChange={setWebsite} placeholder="https://youragency.com" type="url" readOnly={readOnly} />
          <FieldRow label="Support Email" value={supportEmail} onChange={setSupportEmail} placeholder="hello@youragency.com" type="email" readOnly={readOnly} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
            <FieldRow label="Phone" value={phone} onChange={setPhone} placeholder="+1 555 000 0000" type="tel" readOnly={readOnly} />
            <FieldRow label="WhatsApp" value={whatsapp} onChange={setWhatsapp} placeholder="+1 555 000 0000" type="tel" readOnly={readOnly} />
          </div>
        </div>
        {!readOnly && (
          <SaveButton onClick={handleSaveContact} loading={contactSave.loading} saved={contactSave.saved} error={contactSave.error} />
        )}
      </SectionCard>

      {/* Section 5: Portal Settings */}
      <SectionCard title="Portal Settings">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, fontSize: '14px', fontWeight: '600', color: C.charcoal }}>
              Show "Powered by HiddenAtlas"
            </p>
            <p style={{ margin: '3px 0 0', fontSize: '13px', color: C.muted }}>
              Display the HiddenAtlas attribution in the client portal footer.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Toggle
              checked={showPowered}
              onChange={handleSavePortal}
              readOnly={readOnly}
            />
            {portalSave.saved && <Check size={14} color="#2D7A45" />}
          </div>
        </div>
      </SectionCard>

      {/* Live Preview Strip */}
      <div style={{
        border: `1px solid ${C.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
        marginTop: '8px',
      }}>
        <div style={{
          padding: '10px 16px',
          background: C.lightBg,
          borderBottom: `1px solid ${C.border}`,
        }}>
          <p style={{ margin: 0, fontSize: '11px', fontWeight: '700', color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Branding Preview
          </p>
        </div>
        <div style={{
          padding: '20px 24px',
          background: C.white,
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          {/* Logo or name in primary color */}
          {darkLogoUrl ? (
            <img src={darkLogoUrl} alt="Agency logo" style={{ height: '36px', objectFit: 'contain', maxWidth: '160px' }} />
          ) : (
            <span style={{
              fontSize: '20px',
              fontWeight: '700',
              color: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : C.teal,
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: '-0.01em',
            }}>
              {agencyName || 'Your Agency'}
            </span>
          )}

          {/* Color swatches */}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : C.teal,
              border: `1px solid ${C.border}`,
              title: 'Primary color',
            }} />
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: /^#[0-9A-Fa-f]{6}$/.test(accentColor) ? accentColor : C.gold,
              border: `1px solid ${C.border}`,
            }} />
            <div style={{
              padding: '6px 14px', borderRadius: '6px',
              background: /^#[0-9A-Fa-f]{6}$/.test(primaryColor) ? primaryColor : C.teal,
              color: C.white, fontSize: '13px', fontWeight: '700',
            }}>
              Book now
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
