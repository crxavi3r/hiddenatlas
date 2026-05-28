import { useState, useRef } from 'react';
import { useNavigate }       from 'react-router-dom';
import { X, Upload, Link, FileText, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Loader } from 'lucide-react';

// ── Style tokens (matches ItinerariesCMSPage) ─────────────────────────────────
const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(28,26,22,0.6)',
  display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
  zIndex: 800, overflowY: 'auto', padding: '24px 16px',
};
const modalBox = {
  background: '#FAFAF8', borderRadius: '12px', width: '100%', maxWidth: '740px',
  boxShadow: '0 8px 40px rgba(0,0,0,0.22)', position: 'relative',
  margin: 'auto',
};
const btnPrimary = {
  padding: '9px 20px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '13px', fontWeight: '600', background: '#1B6B65', color: 'white',
};
const btnSecondary = {
  padding: '9px 20px', borderRadius: '5px', border: '1px solid #D5CEC4', cursor: 'pointer',
  fontSize: '13px', fontWeight: '500', background: 'white', color: '#4A433A',
};
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #D5CEC4', borderRadius: '6px',
  fontSize: '13px', background: 'white', color: '#1C1A16', boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const labelStyle = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#6B6156', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.4px' };
const sectionCard = { background: 'white', border: '1px solid #E8E3DA', borderRadius: '8px', padding: '16px', marginBottom: '12px' };
const badge = (color, bg) => ({
  display: 'inline-block', fontSize: '10px', fontWeight: '700',
  color, background: bg, padding: '2px 7px', borderRadius: '10px',
  letterSpacing: '0.3px', textTransform: 'uppercase',
});

function InferredBadge() {
  return <span style={badge('#8C8070', '#F4F1EC')}>Inferred</span>;
}

function CollapsibleSection({ title, count, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={sectionCard}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}
      >
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16' }}>
          {title}
          {count != null && (
            <span style={{ fontSize: '11px', color: '#8C8070', marginLeft: '6px', fontWeight: '400' }}>({count})</span>
          )}
        </span>
        {open ? <ChevronUp size={14} color="#8C8070" /> : <ChevronDown size={14} color="#8C8070" />}
      </button>
      {open && <div style={{ marginTop: '12px' }}>{children}</div>}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function ImportItineraryModal({ getToken, onClose }) {
  const navigate = useNavigate();

  const [source,   setSource]   = useState('url');           // 'url' | 'csv'
  const [step,     setStep]     = useState('input');         // 'input' | 'loading' | 'preview' | 'saving' | 'done'
  const [url,      setUrl]      = useState('');
  const [csvText,  setCsvText]  = useState('');
  const [preview,  setPreview]  = useState(null);
  const [edited,   setEdited]   = useState({});              // user overrides on basics
  const [error,    setError]    = useState('');
  const [savedId,  setSavedId]  = useState(null);
  const fileRef = useRef(null);

  // Merge preview basics with user edits
  const basics = preview ? { ...preview.basics, ...edited } : {};

  async function doExtract() {
    setError('');
    setStep('loading');
    try {
      const token = await getToken();
      const body  = source === 'url' ? { url } : { csv: csvText };
      const action = source === 'url' ? 'import-url-preview' : 'import-csv-preview';
      const res = await fetch(`/api/itinerary-cms?action=${action}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Extraction failed');
      setPreview(json.preview);
      setEdited({});
      setStep('preview');
    } catch (e) {
      setError(e.message);
      setStep('input');
    }
  }

  async function doSave() {
    setError('');
    setStep('saving');
    try {
      const token = await getToken();
      const finalPreview = { ...preview, basics };
      const res = await fetch('/api/itinerary-cms?action=import-confirm', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ preview: finalPreview }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Save failed');
      setSavedId(json.itinerary.id);
      setStep('done');
    } catch (e) {
      setError(e.message);
      setStep('preview');
    }
  }

  async function downloadTemplate() {
    try {
      const token = await getToken();
      const res = await fetch('/api/itinerary-cms?action=import-csv-template', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.csv) {
        const blob = new Blob([json.csv], { type: 'text/csv' });
        const a    = document.createElement('a');
        a.href     = URL.createObjectURL(blob);
        a.download = 'hiddenatlas-import-template.csv';
        a.click();
      }
    } catch { /* non-fatal */ }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target.result || '');
    reader.readAsText(file, 'utf-8');
  }

  function setBasic(key, val) {
    setEdited(prev => ({ ...prev, [key]: val }));
  }

  const isInferred = (field) => preview?.inferredFields?.includes(field);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalBox}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid #E8E3DA' }}>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: '#1C1A16', margin: 0 }}>
              Import Itinerary
            </h2>
            <p style={{ fontSize: '12px', color: '#8C8070', margin: '3px 0 0' }}>
              {step === 'input'   && 'Extract itinerary content from a URL or CSV file'}
              {step === 'loading' && 'Extracting content...'}
              {step === 'preview' && 'Review the extracted content before saving as draft'}
              {step === 'saving'  && 'Saving draft...'}
              {step === 'done'    && 'Itinerary saved as draft'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#8C8070', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Step: input */}
        {(step === 'input') && (
          <div style={{ padding: '20px 24px 24px' }}>

            {/* Source tabs */}
            <div style={{ display: 'flex', gap: '2px', background: '#F0EDE8', borderRadius: '7px', padding: '3px', marginBottom: '20px', width: 'fit-content' }}>
              {[
                { key: 'url', icon: <Link size={12} />, label: 'Import from URL' },
                { key: 'csv', icon: <FileText size={12} />, label: 'Import from CSV' },
              ].map(({ key, icon, label }) => (
                <button
                  key={key}
                  onClick={() => { setSource(key); setError(''); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '7px 16px', border: 'none', borderRadius: '5px', cursor: 'pointer',
                    fontSize: '12.5px', fontWeight: source === key ? '600' : '400',
                    background: source === key ? 'white' : 'transparent',
                    color: source === key ? '#1C1A16' : '#6B6156',
                    boxShadow: source === key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.12s',
                  }}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            {/* URL input */}
            {source === 'url' && (
              <div>
                <label style={labelStyle}>Page URL</label>
                <input
                  type="url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="https://example.com/travel-guide-article"
                  style={inputStyle}
                  onKeyDown={e => { if (e.key === 'Enter' && url) doExtract(); }}
                  autoFocus
                />
                <p style={{ fontSize: '11.5px', color: '#8C8070', marginTop: '7px' }}>
                  Paste a public travel article or blog post. The content will be extracted and transformed into the HiddenAtlas itinerary structure.
                  Some fields will be inferred from the article and should be reviewed before saving.
                </p>
              </div>
            )}

            {/* CSV input */}
            {source === 'csv' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ ...labelStyle, margin: 0 }}>CSV File</label>
                  <button type="button" onClick={downloadTemplate} style={{ ...btnSecondary, padding: '5px 12px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <FileText size={11} /> Download Template
                  </button>
                </div>
                <div
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: '2px dashed #D5CEC4', borderRadius: '8px', padding: '28px 20px',
                    textAlign: 'center', cursor: 'pointer', background: csvText ? '#F6F9F8' : 'white',
                    transition: 'border-color 0.15s',
                  }}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => {
                    e.preventDefault();
                    const file = e.dataTransfer.files?.[0];
                    if (file) { const r = new FileReader(); r.onload = ev => setCsvText(ev.target.result || ''); r.readAsText(file); }
                  }}
                >
                  <Upload size={22} color={csvText ? '#1B6B65' : '#B5AA99'} style={{ marginBottom: '8px' }} />
                  {csvText
                    ? <p style={{ fontSize: '13px', color: '#1B6B65', margin: 0, fontWeight: '500' }}>CSV loaded — {csvText.split('\n').length - 1} data rows</p>
                    : <p style={{ fontSize: '13px', color: '#8C8070', margin: 0 }}>Click to upload or drag & drop a .csv file</p>
                  }
                </div>
                <input ref={fileRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleFileChange} />
                <p style={{ fontSize: '11.5px', color: '#8C8070', marginTop: '7px' }}>
                  Download the template above to see the supported column structure. Required: <code>title</code>, <code>slug</code> or <code>destination</code>. Days go in separate rows with <code>dayNumber</code> populated.
                </p>
              </div>
            )}

            {error && (
              <div style={{ marginTop: '14px', background: '#FDF3F3', border: '1px solid #F5C6C6', borderRadius: '6px', padding: '10px 14px', fontSize: '12.5px', color: '#C0392B', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                {error}
              </div>
            )}

            <div style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
              <button
                type="button"
                onClick={doExtract}
                disabled={source === 'url' ? !url.trim() : !csvText.trim()}
                style={{ ...btnPrimary, opacity: (source === 'url' ? !url.trim() : !csvText.trim()) ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '7px' }}
              >
                {source === 'url' ? <Link size={13} /> : <Upload size={13} />}
                {source === 'url' ? 'Extract Itinerary' : 'Parse CSV'}
              </button>
            </div>
          </div>
        )}

        {/* Step: loading */}
        {step === 'loading' && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <Loader size={28} color="#1B6B65" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
            <p style={{ fontSize: '14px', color: '#1C1A16', fontWeight: '500', margin: '0 0 6px' }}>
              {source === 'url' ? 'Fetching and extracting content…' : 'Parsing CSV…'}
            </p>
            <p style={{ fontSize: '12px', color: '#8C8070', margin: 0 }}>
              {source === 'url' ? 'This may take 10-20 seconds for AI extraction.' : 'Validating fields and building preview.'}
            </p>
            <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Step: saving */}
        {step === 'saving' && (
          <div style={{ padding: '60px 24px', textAlign: 'center' }}>
            <Loader size={28} color="#1B6B65" style={{ animation: 'spin 1s linear infinite', marginBottom: '16px' }} />
            <p style={{ fontSize: '14px', color: '#1C1A16', fontWeight: '500', margin: 0 }}>Saving draft itinerary…</p>
            <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Step: done */}
        {step === 'done' && (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <CheckCircle size={36} color="#1B6B65" style={{ marginBottom: '16px' }} />
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#1C1A16', margin: '0 0 6px' }}>Draft saved successfully</p>
            <p style={{ fontSize: '13px', color: '#6B6156', margin: '0 0 24px' }}>
              The itinerary has been created as a draft. All fields are editable in the CMS editor.
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
              <button type="button" onClick={onClose} style={btnSecondary}>Back to list</button>
              <button
                type="button"
                onClick={() => { onClose(); navigate(`/admin/itineraries/${savedId}/edit`); }}
                style={btnPrimary}
              >
                Open in Editor
              </button>
            </div>
          </div>
        )}

        {/* Step: preview */}
        {step === 'preview' && preview && (
          <div style={{ padding: '20px 24px 24px', overflowY: 'auto', maxHeight: 'calc(100vh - 120px)' }}>

            {/* Inferred fields notice */}
            {preview.inferredFields?.length > 0 && (
              <div style={{ background: '#FBF8F1', border: '1px solid #E8D9B8', borderRadius: '7px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#7A6130', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: '1px' }} />
                <span>
                  Some fields were inferred by AI and should be reviewed:{' '}
                  <strong>{preview.inferredFields.join(', ')}</strong>.
                  Fields marked <InferredBadge /> were not explicitly stated in the source.
                </span>
              </div>
            )}

            {/* Warnings */}
            {preview.warnings?.length > 0 && (
              <div style={{ background: '#FDF3F3', border: '1px solid #F5C6C6', borderRadius: '7px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: '#8B2020' }}>
                <strong>Warnings:</strong>{' '}
                {preview.warnings.join(' · ')}
              </div>
            )}

            {/* Basics — always open, key fields editable */}
            <div style={sectionCard}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', margin: '0 0 14px' }}>Basics</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ gridColumn: '1 / -1' }}>
                  <label style={labelStyle}>Title</label>
                  <input value={basics.title || ''} onChange={e => setBasic('title', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Subtitle</label>
                  <input value={basics.subtitle || ''} onChange={e => setBasic('subtitle', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Destination</label>
                  <input value={basics.destination || ''} onChange={e => setBasic('destination', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Country</label>
                  <input value={basics.country || ''} onChange={e => setBasic('country', e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Duration (days)</label>
                  <input type="number" min="1" max="365" value={basics.durationDays || ''} onChange={e => setBasic('durationDays', e.target.value ? parseInt(e.target.value, 10) : null)} style={inputStyle} />
                </div>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Slug
                    <span style={{ fontSize: '10px', color: '#8C8070', textTransform: 'none', fontWeight: '400' }}>(editable — must be unique)</span>
                  </label>
                  <input value={basics.slug || ''} onChange={e => setBasic('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} style={{ ...inputStyle, fontFamily: 'monospace' }} />
                </div>
              </div>
            </div>

            {/* Overview */}
            <CollapsibleSection title="Overview" defaultOpen>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Tagline {isInferred('tagline') && <InferredBadge />}
                  </label>
                  <p style={{ fontSize: '13px', color: '#1C1A16', background: '#F8F6F2', padding: '8px 10px', borderRadius: '5px', margin: 0 }}>{preview.overview?.tagline || '—'}</p>
                </div>
                <div>
                  <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    Description {isInferred('description') && <InferredBadge />}
                  </label>
                  <p style={{ fontSize: '13px', color: '#1C1A16', background: '#F8F6F2', padding: '8px 10px', borderRadius: '5px', margin: 0, lineHeight: '1.6' }}>{preview.overview?.description || '—'}</p>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Category {isInferred('category') && <InferredBadge />}
                    </label>
                    <p style={{ fontSize: '13px', color: '#1C1A16', margin: 0 }}>{preview.overview?.category || '—'}</p>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Pace {isInferred('pace') && <InferredBadge />}
                    </label>
                    <p style={{ fontSize: '13px', color: '#1C1A16', margin: 0 }}>{preview.overview?.pace || '—'}</p>
                  </div>
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Best For {isInferred('bestFor') && <InferredBadge />}
                    </label>
                    <p style={{ fontSize: '13px', color: '#1C1A16', margin: 0 }}>{(preview.overview?.bestFor || []).join(', ') || '—'}</p>
                  </div>
                </div>
                {preview.overview?.highlights?.length > 0 && (
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      Highlights {isInferred('highlights') && <InferredBadge />}
                    </label>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#1C1A16', lineHeight: '1.7' }}>
                      {preview.overview.highlights.map((h, i) => <li key={i}>{h}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {/* Days */}
            {preview.days?.length > 0 && (
              <CollapsibleSection title="Days" count={preview.days.length} defaultOpen={preview.days.length <= 5}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {preview.days.map((d, i) => (
                    <div key={i} style={{ background: '#F8F6F2', borderRadius: '6px', padding: '10px 12px' }}>
                      <p style={{ fontSize: '12px', fontWeight: '600', color: '#1B6B65', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                        Day {d.dayNumber}
                      </p>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', margin: '0 0 4px' }}>{d.title}</p>
                      {d.description && <p style={{ fontSize: '12.5px', color: '#4A433A', margin: '0 0 4px', lineHeight: '1.5' }}>{d.description}</p>}
                      {d.highlights?.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {d.highlights.map((h, j) => (
                            <span key={j} style={{ fontSize: '11px', background: 'white', border: '1px solid #E0D9D0', borderRadius: '12px', padding: '2px 8px', color: '#4A433A' }}>{h}</span>
                          ))}
                        </div>
                      )}
                      {d.insiderTip && (
                        <p style={{ fontSize: '11.5px', color: '#1B6B65', margin: '6px 0 0', fontStyle: 'italic' }}>
                          Tip: {d.insiderTip}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CollapsibleSection>
            )}

            {/* Sections */}
            {(preview.sections?.practicalNotes || preview.sections?.hotels?.length > 0 || preview.sections?.faq?.length > 0) && (
              <CollapsibleSection title="Sections" defaultOpen={false}>
                {preview.sections?.routeOverview && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>Route Overview</label>
                    <p style={{ fontSize: '13px', color: '#1C1A16', margin: 0, lineHeight: '1.6' }}>{preview.sections.routeOverview}</p>
                  </div>
                )}
                {preview.sections?.hotels?.length > 0 && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>Accommodation ({preview.sections.hotels.length})</label>
                    {preview.sections.hotels.map((h, i) => (
                      <div key={i} style={{ fontSize: '12.5px', color: '#1C1A16', padding: '5px 0', borderBottom: i < preview.sections.hotels.length - 1 ? '1px solid #EDE9E2' : 'none' }}>
                        <strong>{h.name}</strong> {h.type && <span style={{ color: '#8C8070' }}>· {h.type}</span>}
                        {h.note && <span style={{ color: '#4A433A' }}> — {h.note}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {preview.sections?.practicalNotes && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>Practical Notes</label>
                    <p style={{ fontSize: '12.5px', color: '#4A433A', margin: 0, lineHeight: '1.6' }}>{preview.sections.practicalNotes}</p>
                  </div>
                )}
                {preview.sections?.faq?.length > 0 && (
                  <div>
                    <label style={labelStyle}>FAQ ({preview.sections.faq.length} entries)</label>
                    {preview.sections.faq.map((f, i) => (
                      <div key={i} style={{ marginBottom: '8px' }}>
                        <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#1C1A16', margin: '0 0 2px' }}>Q: {f.q}</p>
                        <p style={{ fontSize: '12.5px', color: '#4A433A', margin: 0 }}>A: {f.a}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Images */}
            {(preview.images?.cover || preview.images?.gallery?.length > 0) && (
              <CollapsibleSection title="Images" count={(preview.images?.gallery?.length || 0) + (preview.images?.cover ? 1 : 0)} defaultOpen={false}>
                {preview.images?.cover && (
                  <div style={{ marginBottom: '10px' }}>
                    <label style={labelStyle}>Cover Image</label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                      <img
                        src={preview.images.cover}
                        alt="Cover"
                        style={{ width: '80px', height: '56px', objectFit: 'cover', borderRadius: '5px', border: '1px solid #E8E3DA', flexShrink: 0 }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                      <p style={{ fontSize: '11px', color: '#8C8070', wordBreak: 'break-all', margin: 0, fontFamily: 'monospace' }}>{preview.images.cover}</p>
                    </div>
                  </div>
                )}
                {preview.images?.gallery?.length > 0 && (
                  <div>
                    <label style={labelStyle}>Gallery ({preview.images.gallery.length} images)</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: '6px' }}>
                      {preview.images.gallery.map((imgUrl, i) => (
                        <img
                          key={i}
                          src={imgUrl}
                          alt={`Gallery ${i + 1}`}
                          style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: '5px', border: '1px solid #E8E3DA' }}
                          onError={e => { e.target.style.display = 'none'; }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* SEO */}
            {(preview.seo?.seoTitle || preview.seo?.seoDescription) && (
              <CollapsibleSection title="SEO" defaultOpen={false}>
                {preview.seo.seoTitle && (
                  <div style={{ marginBottom: '8px' }}>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>SEO Title {isInferred('seoTitle') && <InferredBadge />}</label>
                    <p style={{ fontSize: '13px', color: '#1C1A16', margin: 0 }}>{preview.seo.seoTitle}</p>
                  </div>
                )}
                {preview.seo.seoDescription && (
                  <div>
                    <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '6px' }}>Meta Description {isInferred('seoDescription') && <InferredBadge />}</label>
                    <p style={{ fontSize: '13px', color: '#1C1A16', margin: 0 }}>{preview.seo.seoDescription}</p>
                  </div>
                )}
                {preview.seo.canonicalSourceUrl && (
                  <div style={{ marginTop: '8px' }}>
                    <label style={labelStyle}>Source URL</label>
                    <p style={{ fontSize: '11px', color: '#8C8070', margin: 0, wordBreak: 'break-all', fontFamily: 'monospace' }}>{preview.seo.canonicalSourceUrl}</p>
                  </div>
                )}
              </CollapsibleSection>
            )}

            {/* Route stops */}
            {preview.routeMap?.stops?.length > 0 && (
              <CollapsibleSection title="Route Stops" count={preview.routeMap.stops.length} defaultOpen={false}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                  {preview.routeMap.stops.map((s, i) => (
                    <div key={i} style={{ fontSize: '12.5px', color: '#1C1A16', display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '10px', fontWeight: '700', color: '#1B6B65', minWidth: '20px' }}>#{s.order || i + 1}</span>
                      <span>{s.name}</span>
                      {s.dayNumber && <span style={{ fontSize: '11px', color: '#8C8070' }}>Day {s.dayNumber}</span>}
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '11.5px', color: '#8C8070', margin: '8px 0 0' }}>
                  Coordinates will be generated by the AI route map tool after saving.
                </p>
              </CollapsibleSection>
            )}

            {error && (
              <div style={{ background: '#FDF3F3', border: '1px solid #F5C6C6', borderRadius: '6px', padding: '10px 14px', fontSize: '12.5px', color: '#C0392B', display: 'flex', gap: '8px', alignItems: 'flex-start', marginTop: '4px' }}>
                <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: '1px' }} />
                {error}
              </div>
            )}

            {/* Footer */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '20px', paddingTop: '16px', borderTop: '1px solid #E8E3DA', gap: '10px', flexWrap: 'wrap' }}>
              <p style={{ fontSize: '11.5px', color: '#8C8070', margin: 0 }}>
                The itinerary will be saved as a draft. Nothing will be published automatically.
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button type="button" onClick={() => setStep('input')} style={btnSecondary}>Back</button>
                <button type="button" onClick={doSave} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: '7px' }}>
                  Save as Draft
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
