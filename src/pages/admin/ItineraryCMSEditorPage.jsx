import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowLeft, Save, Globe, EyeOff, Eye, Plus, Trash2, ChevronDown, ChevronUp,
  Wand2, Image as ImageIcon, Clock, Check, User, Upload, FileText, ExternalLink,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { resolveCoverImage } from '../../lib/resolveCoverImage';
import { resolveAssetIdentity } from '../../lib/resolveAssetIdentity';

// ── Shared style tokens ───────────────────────────────────────────────────────
const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };
const inputStyle = {
  width: '100%', padding: '9px 12px', border: '1px solid #E8E3DA',
  borderRadius: '6px', fontSize: '13.5px', color: '#1C1A16',
  background: 'white', outline: 'none', boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const textareaStyle = { ...inputStyle, resize: 'vertical', minHeight: '90px', lineHeight: '1.6' };
const labelStyle = {
  display: 'block', fontSize: '11px', fontWeight: '600', color: '#6B6156',
  textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '6px',
};
const fieldStyle = { marginBottom: '18px' };
const sectionCard = { ...card, padding: '24px', marginBottom: '20px' };
const btnPrimary = {
  padding: '9px 20px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'flex', alignItems: 'center', gap: '6px',
};
const btnSecondary = {
  padding: '8px 16px', borderRadius: '5px', border: '1px solid #E8E3DA', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A',
  display: 'flex', alignItems: 'center', gap: '6px',
};
const btnGhost = {
  background: 'none', border: '1px solid #E8E3DA', cursor: 'pointer', padding: '6px 12px',
  borderRadius: '4px', color: '#6B6156', display: 'flex', alignItems: 'center', gap: '5px',
  fontSize: '12px', fontWeight: '500',
};
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '5px',
  borderRadius: '4px', color: '#8C8070', display: 'flex', alignItems: 'center',
};

const TABS = [
  { key: 'basics',   label: 'Basics' },
  { key: 'hero',     label: 'Hero & Summary' },
  { key: 'days',     label: 'Days' },
  { key: 'sections', label: 'Sections' },
  { key: 'images',   label: 'Images' },
  { key: 'ai',       label: 'AI Assistant' },
];

const EMPTY_CONTENT = {
  hero:      { title: '', subtitle: '', tagline: '', coverImage: '' },
  summary:   { shortDescription: '', whySpecial: '', routeOverview: '', highlights: [], included: [] },
  tripFacts: { groupSize: '', difficulty: 'Moderate', bestFor: [], category: '' },
  days:      [],
  sections:  { hotels: [], practicalNotes: '', faq: [] },
  pdfConfig: { showRouteMap: true, showHotels: true },
  seo:       { metaTitle: '', metaDescription: '' },
};

const DIFFICULTIES = ['Easy', 'Easy to Moderate', 'Moderate', 'Moderate to Challenging', 'Challenging'];
const BEST_FOR_OPTIONS = ['Couples', 'Families', 'Friend Groups', 'Adventurers', 'Solo'];

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

// ── Small reusable editors ────────────────────────────────────────────────────
function Field({ label, hint, children }) {
  return (
    <div style={fieldStyle}>
      {label && <label style={labelStyle}>{label}</label>}
      {hint && <p style={{ fontSize: '11px', color: '#B5AA99', marginBottom: '6px' }}>{hint}</p>}
      {children}
    </div>
  );
}

function ArrayEditor({ label, hint, value = [], onChange, placeholder = 'Add item…', multiline = false }) {
  const [newItem, setNewItem] = useState('');
  const arr = Array.isArray(value) ? value : [];

  return (
    <Field label={label} hint={hint}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
        {arr.map((item, i) => (
          <div key={i} style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
            {multiline ? (
              <textarea
                value={item} rows={2}
                style={{ ...textareaStyle, minHeight: '52px', flex: 1 }}
                onChange={e => { const n = [...arr]; n[i] = e.target.value; onChange(n); }}
              />
            ) : (
              <input value={item} style={{ ...inputStyle, flex: 1 }}
                onChange={e => { const n = [...arr]; n[i] = e.target.value; onChange(n); }}
              />
            )}
            <button onClick={() => onChange(arr.filter((_, j) => j !== i))} style={{ ...iconBtn, color: '#C0392B', marginTop: '2px' }}>
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {multiline ? (
          <textarea
            value={newItem} placeholder={placeholder} rows={2}
            style={{ ...textareaStyle, minHeight: '52px', flex: 1 }}
            onChange={e => setNewItem(e.target.value)}
          />
        ) : (
          <input value={newItem} placeholder={placeholder} style={{ ...inputStyle, flex: 1 }}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (newItem.trim()) { onChange([...arr, newItem.trim()]); setNewItem(''); } } }}
          />
        )}
        <button
          onClick={() => { if (newItem.trim()) { onChange([...arr, newItem.trim()]); setNewItem(''); } }}
          style={{ ...btnGhost, whiteSpace: 'nowrap' }}
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </Field>
  );
}

function CheckboxGroup({ label, options, value = [], onChange }) {
  const arr = Array.isArray(value) ? value : [];
  return (
    <Field label={label}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {options.map(opt => {
          const checked = arr.includes(opt);
          return (
            <label key={opt} style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 12px', borderRadius: '20px', cursor: 'pointer',
              border: `1px solid ${checked ? '#1B6B65' : '#E8E3DA'}`,
              background: checked ? '#EFF6F5' : 'white',
              fontSize: '12.5px', color: checked ? '#1B6B65' : '#4A433A',
              userSelect: 'none',
            }}>
              <input type="checkbox" checked={checked} onChange={() => {
                onChange(checked ? arr.filter(v => v !== opt) : [...arr, opt]);
              }} style={{ display: 'none' }} />
              {checked && <Check size={11} strokeWidth={3} />}
              {opt}
            </label>
          );
        })}
      </div>
    </Field>
  );
}

// ── Day card ──────────────────────────────────────────────────────────────────
function DayCard({ day, index, total, onChange, onDelete, onMove, assets, onUpload }) {
  const [open, setOpen] = useState(index === 0);

  function upd(field, val) {
    onChange({ ...day, [field]: val });
  }
  function updBullet(i, val) {
    const b = [...(day.bullets || [])];
    b[i] = val;
    upd('bullets', b);
  }
  function addBullet() { upd('bullets', [...(day.bullets || []), '']); }
  function removeBullet(i) { upd('bullets', (day.bullets || []).filter((_, j) => j !== i)); }

  return (
    <div style={{ ...card, marginBottom: '10px', overflow: 'hidden' }}>
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '10px',
        padding: '12px 16px', cursor: 'pointer', background: open ? '#FAFAF8' : 'white',
        borderBottom: open ? '1px solid #F4F1EC' : 'none',
      }} onClick={() => setOpen(o => !o)}>
        <span style={{
          width: '24px', height: '24px', borderRadius: '50%', background: '#1B6B65',
          color: 'white', fontSize: '11px', fontWeight: '700',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          {day.day}
        </span>
        <p style={{ flex: 1, fontSize: '13.5px', fontWeight: '500', color: '#1C1A16',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {day.title || `Day ${day.day}`}
        </p>
        <div style={{ display: 'flex', gap: '2px' }} onClick={e => e.stopPropagation()}>
          <button onClick={() => onMove(index, -1)} disabled={index === 0} style={{ ...iconBtn, opacity: index === 0 ? 0.3 : 1 }}>
            <ChevronUp size={13} />
          </button>
          <button onClick={() => onMove(index, 1)} disabled={index === total - 1} style={{ ...iconBtn, opacity: index === total - 1 ? 0.3 : 1 }}>
            <ChevronDown size={13} />
          </button>
          <button onClick={() => onDelete(index)} style={{ ...iconBtn, color: '#C0392B' }}>
            <Trash2 size={13} />
          </button>
        </div>
        <button style={{ ...iconBtn, marginLeft: '4px' }}>
          {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {open && (
        <div style={{ padding: '20px 16px' }}>
          <Field label="Title">
            <input value={day.title || ''} style={inputStyle} placeholder="Day title"
              onChange={e => upd('title', e.target.value)} />
          </Field>

          <ImagePicker
            label="Day Image"
            value={day.img || ''}
            onChange={url => upd('img', url)}
            assets={assets}
            onUpload={onUpload ? (file) => onUpload(file, 'day', day.day) : null}
            assetType="day"
            dayNumber={day.day}
          />

          <Field label="Description">
            <textarea value={day.desc || ''} style={{ ...textareaStyle, minHeight: '100px' }}
              placeholder="Day narrative…" onChange={e => upd('desc', e.target.value)} />
          </Field>

          <Field label="Highlights / Bullets">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
              {(day.bullets || []).map((b, i) => (
                <div key={i} style={{ display: 'flex', gap: '6px' }}>
                  <input value={b} style={{ ...inputStyle, flex: 1 }}
                    onChange={e => updBullet(i, e.target.value)} />
                  <button onClick={() => removeBullet(i)} style={{ ...iconBtn, color: '#C0392B' }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addBullet} style={btnGhost}>
              <Plus size={12} /> Add bullet
            </button>
          </Field>

          <Field label="Insider Tip">
            <textarea value={day.tip || ''} style={{ ...textareaStyle, minHeight: '72px' }}
              placeholder="Practical insider tip for this day…" onChange={e => upd('tip', e.target.value)} />
          </Field>
        </div>
      )}
    </div>
  );
}

// ── Hotel row editor ──────────────────────────────────────────────────────────
function HotelEditor({ hotels = [], onChange }) {
  function updHotel(i, field, val) {
    const next = [...hotels];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  }
  function addHotel() { onChange([...hotels, { name: '', type: '', note: '' }]); }
  function removeHotel(i) { onChange(hotels.filter((_, j) => j !== i)); }

  return (
    <div>
      {hotels.map((h, i) => (
        <div key={i} style={{ ...card, padding: '14px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#6B6156' }}>Hotel {i + 1}</span>
            <button onClick={() => removeHotel(i)} style={{ ...iconBtn, color: '#C0392B' }}>
              <Trash2 size={13} />
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '10px' }}>
            <input value={h.name || ''} placeholder="Hotel name" style={inputStyle}
              onChange={e => updHotel(i, 'name', e.target.value)} />
            <input value={h.type || ''} placeholder="Type (e.g. Boutique luxury)" style={inputStyle}
              onChange={e => updHotel(i, 'type', e.target.value)} />
          </div>
          <textarea value={h.note || ''} placeholder="Editorial note…" rows={2}
            style={{ ...textareaStyle, minHeight: '56px' }}
            onChange={e => updHotel(i, 'note', e.target.value)} />
        </div>
      ))}
      <button onClick={addHotel} style={btnGhost}>
        <Plus size={12} /> Add hotel
      </button>
    </div>
  );
}

// ── FAQ editor ────────────────────────────────────────────────────────────────
function FAQEditor({ faq = [], onChange }) {
  function updFaq(i, field, val) {
    const next = [...faq];
    next[i] = { ...next[i], [field]: val };
    onChange(next);
  }
  return (
    <div>
      {faq.map((item, i) => (
        <div key={i} style={{ ...card, padding: '14px', marginBottom: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: '600', color: '#6B6156' }}>FAQ {i + 1}</span>
            <button onClick={() => onChange(faq.filter((_, j) => j !== i))} style={{ ...iconBtn, color: '#C0392B' }}>
              <Trash2 size={13} />
            </button>
          </div>
          <input value={item.q || ''} placeholder="Question" style={{ ...inputStyle, marginBottom: '8px' }}
            onChange={e => updFaq(i, 'q', e.target.value)} />
          <textarea value={item.a || ''} placeholder="Answer" rows={2}
            style={{ ...textareaStyle, minHeight: '60px' }}
            onChange={e => updFaq(i, 'a', e.target.value)} />
        </div>
      ))}
      <button onClick={() => onChange([...faq, { q: '', a: '' }])} style={btnGhost}>
        <Plus size={12} /> Add FAQ
      </button>
    </div>
  );
}

// ── Image asset row ───────────────────────────────────────────────────────────
const ASSET_TYPES = ['hero', 'gallery', 'day', 'research', 'manual'];
const ASSET_TYPE_LABELS = { hero: 'Hero', gallery: 'Gallery', day: 'Day Images', research: 'Research', ai_suggested: 'AI Suggested', manual: 'Manual' };

function AssetRow({ asset, onToggle, onDelete, usedAs, onSetHero }) {
  const isFilesystem = !asset.id;
  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '12px', background: asset.active ? 'white' : '#FAFAF8',
      border: '1px solid #E8E3DA', borderRadius: '8px', marginBottom: '8px',
      opacity: asset.active ? 1 : 0.55,
    }}>
      <div style={{ width: '72px', height: '48px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
        <img src={asset.url} alt={asset.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: '600', color: '#1B6B65', background: '#EFF6F5', padding: '2px 7px', borderRadius: '8px', textTransform: 'uppercase' }}>
            {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
            {asset.dayNumber != null ? ` · Day ${asset.dayNumber}` : ''}
          </span>
          <span style={{ fontSize: '10px', color: '#B5AA99', padding: '2px 7px', background: '#F4F1EC', borderRadius: '8px' }}>
            {asset.source}
          </span>
          {usedAs && (
            <span style={{ fontSize: '10px', fontWeight: '600', color: '#C9A96E', background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.3)', padding: '2px 7px', borderRadius: '8px' }}>
              ● {usedAs}
            </span>
          )}
        </div>
        <p style={{ fontSize: '12px', color: '#4A433A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.alt || asset.caption || asset.url}
        </p>
        {onSetHero && !usedAs && (
          <button onClick={() => onSetHero(asset.url)}
            style={{ ...btnGhost, fontSize: '11px', padding: '3px 8px', marginTop: '4px', color: '#1B6B65', borderColor: '#1B6B65' }}>
            Set as hero
          </button>
        )}
      </div>
      {!isFilesystem && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button onClick={() => onToggle(asset)} style={{ ...iconBtn, color: asset.active ? '#C9A96E' : '#1B6B65' }}
            title={asset.active ? 'Deactivate' : 'Activate'}>
            {asset.active ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button onClick={() => onDelete(asset)} style={{ ...iconBtn, color: '#C0392B' }} title="Delete">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Image Picker — shared library browser + inline upload ─────────────────────
function ImagePicker({ value, onChange, assets = [], onUpload, assetType = 'gallery', dayNumber, label, hint }) {
  const [open, setOpen]           = useState(false);
  const [uploading, setUploading] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const fileRef                   = useRef(null);

  // Sync when parent propagates a new value (e.g. initial load or external change)
  useEffect(() => { setLocalValue(value); }, [value]);

  const libraryAssets = assets.filter(a => a.active !== false);

  async function handleFile(e) {
    const file = e.target.files[0];
    if (!file || !onUpload) return;
    setUploading(true);
    try {
      const url = await onUpload(file, assetType, dayNumber);
      if (url) { setLocalValue(url); onChange(url); setOpen(false); }
    } catch (err) {
      alert(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div style={fieldStyle}>
      {label && <label style={labelStyle}>{label}</label>}
      {hint && <p style={{ fontSize: '11px', color: '#B5AA99', marginBottom: '6px' }}>{hint}</p>}

      {/* Thumbnail */}
      {localValue ? (
        <div style={{ height: '160px', borderRadius: '8px', overflow: 'hidden', marginBottom: '8px', background: '#F4F1EC' }}>
          <img src={localValue} alt="Selected"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.currentTarget.style.display = 'none'; }} />
        </div>
      ) : (
        <div style={{
          height: '80px', borderRadius: '8px', border: '2px dashed #E8E3DA',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#FAFAF8', color: '#B5AA99', fontSize: '13px', marginBottom: '8px',
        }}>
          No image selected
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: open ? '10px' : '0' }}>
        <button type="button" onClick={() => setOpen(o => !o)} style={btnGhost}>
          <ImageIcon size={12} />
          {open ? 'Close library' : `Library${libraryAssets.length > 0 ? ` (${libraryAssets.length})` : ''}`}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()}
          disabled={!onUpload || uploading} style={btnGhost}>
          <Upload size={12} /> {uploading ? 'Uploading…' : 'Upload'}
        </button>
        {localValue && (
          <button type="button" onClick={() => { setLocalValue(''); onChange(''); }}
            style={{ ...btnGhost, fontSize: '11px', color: '#B5AA99', borderColor: '#F0EDE8' }}>
            ✕ Clear
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFile} />

      {/* Library grid */}
      {open && (
        <div style={{
          border: '1px solid #E8E3DA', borderRadius: '8px', padding: '12px',
          background: '#FAFAF8', marginBottom: '4px',
        }}>
          {libraryAssets.length === 0 ? (
            <p style={{ fontSize: '12px', color: '#B5AA99', textAlign: 'center', padding: '20px 0' }}>
              No images in library yet. Upload one above or add images in the Images tab.
            </p>
          ) : (
            <>
              <p style={{ fontSize: '10px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                {libraryAssets.length} image{libraryAssets.length !== 1 ? 's' : ''} in library — click to select
              </p>
              <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))',
                gap: '5px', maxHeight: '200px', overflowY: 'auto',
              }}>
                {libraryAssets.map((a, i) => (
                  <div key={a.id ?? `lib-${i}`}
                    onClick={() => { setLocalValue(a.url); onChange(a.url); setOpen(false); }}
                    title={a.alt || a.caption || a.assetType}
                    style={{
                      cursor: 'pointer', borderRadius: '4px', overflow: 'hidden',
                      aspectRatio: '4/3', background: '#F4F1EC', position: 'relative',
                      border: `2px solid ${localValue === a.url ? '#1B6B65' : 'transparent'}`,
                    }}
                  >
                    <img src={a.url} alt={a.alt || ''}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                      onError={e => { e.currentTarget.style.opacity = '0.3'; }} />
                    {localValue === a.url && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(27,107,101,0.2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Check size={14} color="white" strokeWidth={3} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main editor component ─────────────────────────────────────────────────────
export default function ItineraryCMSEditorPage() {
  const { id }       = useParams();
  const navigate     = useNavigate();
  const { getToken } = useAuth();
  const isMobile     = useIsMobile();
  const isNew        = id === 'new';

  const [activeTab,  setActiveTab]  = useState('basics');
  const [loading,    setLoading]    = useState(!isNew);
  const [saving,     setSaving]     = useState(false);
  const [saveMsg,    setSaveMsg]    = useState(null); // { ok: bool, text: string }
  const [form,       setForm]       = useState({
    title: '', subtitle: '', slug: '', destination: '', country: '',
    region: '', durationDays: '', type: 'free', isPrivate: false, isCollection: false,
    stripePriceId: '', pricingKey: '',
    coverImage: '', status: 'draft', pdfUrl: '', pdf_url: '', pdf_version: 'v1.0', creatorId: '',
    variant: '', parentId: '',
    content: { ...EMPTY_CONTENT },
  });
  const [allCreators, setAllCreators] = useState([]);  // for creator selector

  // Images tab state
  const [assets,       setAssets]       = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [newAsset,     setNewAsset]     = useState({ assetType: 'gallery', source: 'url', dayNumber: 1, url: '', alt: '', caption: '', file: null, filePreview: null });
  const [lastAdded,    setLastAdded]    = useState([]);
  const [justAdded,    setJustAdded]    = useState(false);

  // AI tab state
  const [aiPrompt,      setAiPrompt]      = useState('');
  const [aiGenerating,  setAiGenerating]  = useState(false);
  const [aiOutput,      setAiOutput]      = useState(null);
  const [aiHistory,     setAiHistory]     = useState([]);
  const [linkedRequest, setLinkedRequest] = useState(null);

  const [pdfState,       setPdfState]       = useState('idle'); // idle | generating | done | error
  const [pricingOptions, setPricingOptions] = useState([]);    // loaded from ITINERARY_PRICING_OPTIONS

  const savedId       = useRef(null);  // set after first create
  const slugRef       = useRef('');   // set after load, used by loadAssets for FS scan
  const pdfInFlight   = useRef(false); // guard against concurrent PDF generations

  // ── Load existing itinerary ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res   = await fetch(`/api/itinerary-cms?action=get&id=${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const it = json.itinerary;
      // Defensive parse: JSONB may arrive as a string in some pg/Vercel configs
      const rawContent = typeof it.content === 'string'
        ? (() => { try { return JSON.parse(it.content); } catch { return {}; } })()
        : (it.content ?? {});
      const content = mergeContent(rawContent);
      // Derive canonical type from both `type` and legacy `accessType`
      const derivedType = it.type === 'custom' ? 'custom'
        : it.type === 'premium' ? 'premium'
        : it.type === 'free'    ? 'free'
        : it.accessType === 'paid' ? 'premium' : 'free';

      setForm({
        title: it.title || '', subtitle: it.subtitle || '',
        slug: it.slug || '', destination: it.destination || '',
        country: it.country || '', region: it.region || '',
        durationDays: it.durationDays ?? '', type: derivedType,
        isPrivate: it.isPrivate ?? false,
        isCollection: it.isCollection ?? false,
        stripePriceId: it.stripePriceId || '', pricingKey: it.pricingKey || '',
        coverImage: it.coverImage || '', status: it.status || 'draft',
        pdfUrl: it.pdfUrl || '',
        pdf_url: it.pdf_url || it.pdfUrl || '',
        pdf_version: it.pdf_version || 'v1.0',
        creatorId: it.creatorId || '',
        variant: it.variant || '',
        parentId: it.parentId || '',
        content,
      });
      savedId.current = it.id;
      slugRef.current = it.slug || '';
    } catch (e) { alert(e.message); navigate('/admin/itineraries'); }
    finally { setLoading(false); }
  }, [id, isNew, getToken, navigate]);

  useEffect(() => { load(); }, [load]);

  // ── Load pricing options + creators once on mount ────────────────────────────
  useEffect(() => {
    getToken().then(token => {
      fetch('/api/itinerary-cms?action=pricing-options', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(json => { if (Array.isArray(json.options)) setPricingOptions(json.options); })
        .catch(() => {});

      fetch('/api/creators?action=list', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(json => { if (Array.isArray(json.creators)) setAllCreators(json.creators); })
        .catch(() => {});
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load assets eagerly so hero/day pickers have data on all tabs ────────────
  useEffect(() => {
    if (isNew || !id) return;
    loadAssets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reload assets when Images tab opens (picks up any external changes) ──────
  useEffect(() => {
    if (activeTab !== 'images' || isNew || !id) return;
    loadAssets();
  }, [activeTab, id, isNew]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load AI history + linked request when AI tab opens ───────────────────────
  useEffect(() => {
    if (activeTab !== 'ai') return;
    loadAIHistory();
    if (form.type === 'custom' && !isNew && (savedId.current || id)) {
      loadLinkedRequest();
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAssets() {
    const targetId = savedId.current || id;
    if (!targetId) return;
    setAssetsLoading(true);
    try {
      const token = await getToken();

      // 1. DB assets
      const dbRes  = await fetch(`/api/itinerary-cms?action=assets&id=${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const dbJson = await dbRes.json();
      const dbAssets = dbJson.error ? [] : (dbJson.assets ?? []);

      // 2. Filesystem scan.
      // resolveAssetIdentity handles three cases:
      //   a) DB has parentId/variant set → use them directly
      //   b) DB fields absent but slug is in static data → look up parentId/variant
      //   c) Standalone itinerary → use slug as-is
      const slug = slugRef.current || form.slug;
      const { assetSlug, variant } = await resolveAssetIdentity(slug, {
        parentId: form.parentId,
        variant:  form.variant,
      });
      let fsAssets = [];
      if (assetSlug) {
        try {
          const fsRes  = await fetch(
            `/api/itinerary-cms?action=scan-assets&slug=${encodeURIComponent(assetSlug)}&assetSlug=${encodeURIComponent(assetSlug)}&variant=${encodeURIComponent(variant || '')}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const fsJson = await fsRes.json();
          if (!fsJson.error) fsAssets = fsJson.assets ?? [];
          console.log(`[loadAssets] fs scan → assetSlug="${assetSlug}", variant="${variant || 'none'}", found ${fsAssets.length} assets`);
        } catch { /* no content folder — skip */ }
      }

      // 3. Merge: FS assets whose URL already exists in DB are excluded (no dupes)
      const dbUrls = new Set(dbAssets.map(a => a.url));
      const newFsAssets = fsAssets.filter(a => !dbUrls.has(a.url));

      setAssets([...dbAssets, ...newFsAssets]);
    } catch { /* silent */ }
    finally { setAssetsLoading(false); }
  }

  async function loadLinkedRequest() {
    const targetId = savedId.current || id;
    if (!targetId) return;
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=linked-request&id=${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!json.error) setLinkedRequest(json.request);
    } catch { /* silent */ }
  }

  async function loadAIHistory() {
    const targetId = savedId.current || (isNew ? null : id);
    try {
      const token = await getToken();
      const url   = targetId
        ? `/api/itinerary-cms?action=ai-history&id=${targetId}`
        : '/api/itinerary-cms?action=ai-history';
      const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const json  = await res.json();
      if (!json.error) setAiHistory(json.generations);
    } catch { /* silent */ }
  }

  // ── Slug auto-generation ──────────────────────────────────────────────────────
  function handleTitleChange(value) {
    setForm(f => ({
      ...f, title: value,
      slug: f.slug === '' || f.slug === slugify(f.title) ? slugify(value) : f.slug,
    }));
  }

  // ── Content helpers ───────────────────────────────────────────────────────────
  function setContent(path, value) {
    setForm(f => {
      const parts   = path.split('.');
      const content = JSON.parse(JSON.stringify(f.content));
      let node = content;
      for (let i = 0; i < parts.length - 1; i++) {
        node = node[parts[i]] = node[parts[i]] ?? {};
      }
      node[parts[parts.length - 1]] = value;
      return { ...f, content };
    });
  }

  function c(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], form.content);
  }

  // ── Days helpers ──────────────────────────────────────────────────────────────
  function addDay() {
    const days = c('days') || [];
    setContent('days', [...days, { day: days.length + 1, title: '', desc: '', bullets: [], img: '', tip: '' }]);
  }
  function updateDay(index, updated) {
    const days = [...(c('days') || [])];
    days[index] = updated;
    setContent('days', days);
  }
  function deleteDay(index) {
    const days = (c('days') || []).filter((_, i) => i !== index)
      .map((d, i) => ({ ...d, day: i + 1 }));
    setContent('days', days);
  }
  function moveDay(index, dir) {
    const days  = [...(c('days') || [])];
    const swap  = index + dir;
    if (swap < 0 || swap >= days.length) return;
    [days[index], days[swap]] = [days[swap], days[index]];
    setContent('days', days.map((d, i) => ({ ...d, day: i + 1 })));
  }

  // ── Save ──────────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!form.title.trim() || !form.slug.trim()) {
      alert('Title and slug are required.');
      return;
    }
    if (form.type === 'premium' && !form.stripePriceId) {
      alert('A pricing plan is required for premium itineraries. Select one in the Basics tab.');
      return;
    }
    setSaving(true); setSaveMsg(null);
    try {
      const token = await getToken();
      const targetId = savedId.current || (isNew ? null : id);
      const action   = targetId ? `update&id=${targetId}` : 'create';

      // Build content explicitly so days structure is always correct
      const contentToSave = {
        ...form.content,
        days: Array.isArray(form.content?.days) ? form.content.days : [],
      };

      const payload = {
        ...form,
        content: contentToSave,
        accessType: form.type === 'free' ? 'free' : 'paid',
        durationDays: form.durationDays !== '' && form.durationDays != null
          ? parseInt(form.durationDays, 10) : null,
        stripePriceId: form.type === 'premium' ? (form.stripePriceId || null) : null,
        pricingKey:    form.type === 'premium' ? (form.pricingKey    || null) : null,
        // creatorId is immutable after creation — strip it from update payloads.
        // JSON.stringify omits undefined values, so this effectively removes the field.
        // On create (!targetId) the form value is preserved so the backend can assign it.
        ...(targetId ? { creatorId: undefined } : {}),
      };

      const res  = await fetch(`/api/itinerary-cms?action=${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      savedId.current = json.itinerary.id;

      // Sync scalar fields from what DB actually persisted (derived fields like coverImage).
      // Do NOT replace content — f.content is what we just saved and is authoritative.
      const it = json.itinerary;
      const derivedType = it.type === 'custom' ? 'custom'
        : it.type === 'premium' ? 'premium'
        : it.type === 'free'    ? 'free'
        : it.accessType === 'paid' ? 'premium' : 'free';
      setForm(f => ({
        ...f,
        title:         it.title         ?? f.title,
        subtitle:      it.subtitle      ?? f.subtitle,
        slug:          it.slug          ?? f.slug,
        destination:   it.destination   ?? f.destination,
        country:       it.country       ?? f.country,
        region:        it.region        ?? f.region,
        durationDays:  it.durationDays  ?? f.durationDays,
        coverImage:    it.coverImage    || f.coverImage,
        status:        it.status        ?? f.status,
        type:          derivedType,
        isPrivate:     it.isPrivate     ?? f.isPrivate,
        isCollection:  it.isCollection  ?? f.isCollection,
        stripePriceId: it.stripePriceId ?? f.stripePriceId,
        pricingKey:    it.pricingKey    ?? f.pricingKey,
        creatorId:     it.creatorId     ?? f.creatorId,
        // content intentionally preserved from f — never replace with DB response
        // (JSONB may arrive as string in some pg/Vercel configurations)
      }));

      setSaveMsg({ ok: true, text: 'Saved.' });
      if (isNew) {
        navigate(`/admin/itineraries/${json.itinerary.id}`, { replace: true });
      } else {
        // Auto-regenerate PDF after every save (fire-and-forget, does not block save)
        setTimeout(() => handleGeneratePDF({ silent: true }), 0);
      }
    } catch (e) { setSaveMsg({ ok: false, text: e.message }); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 4000); }
  }

  // ── Toggle publish ────────────────────────────────────────────────────────────
  async function handleTogglePublish() {
    const targetId = savedId.current || (isNew ? null : id);
    if (!targetId) { alert('Save the itinerary first.'); return; }
    const action = form.status === 'published' ? 'unpublish' : 'publish';
    if (action === 'publish' && form.type === 'premium' && !form.stripePriceId) {
      alert('Cannot publish: select a pricing plan before publishing a premium itinerary.');
      return;
    }
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=${action}&id=${targetId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setForm(f => ({ ...f, status: json.itinerary.status }));
    } catch (e) { alert(e.message); }
  }

  // ── Sync days from static source data ────────────────────────────────────────
  // For public (non-custom) itineraries. Replaces form.content.days with the days
  // array from src/data/itineraries.js for the matching slug. Preserves any inline
  // img fields that were manually set in the DB, so day images are never lost.
  async function handleSyncDaysFromStatic() {
    const slug = form.slug;
    if (!slug) { alert('Slug is required.'); return; }
    if (!window.confirm(
      `Replace all day content for "${slug}" with the current source data?\n\nInline day img fields will be preserved. All other day fields (title, desc, bullets, tip, route) will be reset to the source data version.\n\nSave afterwards to persist the change.`
    )) return;

    try {
      const { itineraries } = await import('../../data/itineraries.js');
      const allItems = Array.isArray(itineraries) ? itineraries : Object.values(itineraries || {});
      const staticIt = allItems.find(it => (it.id || it.slug) === slug);
      if (!staticIt) {
        alert(`No static entry found for slug "${slug}". Check src/data/itineraries.js.`);
        return;
      }
      if (!Array.isArray(staticIt.days) || !staticIt.days.length) {
        alert(`Static entry for "${slug}" has no days array.`);
        return;
      }

      // Build a map of existing inline imgs keyed by day number so we can preserve them
      const existingImgs = {};
      for (const d of (form.content?.days || [])) {
        if (d.day && d.img) existingImgs[d.day] = d.img;
      }

      const newDays = staticIt.days.map(d => ({
        ...d,
        // Preserve any manually-set inline img
        img: existingImgs[d.day] || d.img || null,
      }));

      setContent('days', newDays);
      alert(`Days synced from static data (${newDays.length} days). Review the Days tab, then click Save to persist.`);
    } catch (e) {
      alert(`Failed to sync: ${e.message}`);
    }
  }

  // ── View PDF (open blob URL directly in a new tab) ───────────────────────────
  function handleViewPDF() {
    const url = form.pdf_url || form.pdfUrl;
    if (!url) { alert('No PDF URL — generate a PDF first.'); return; }
    window.open(url, '_blank');
  }

  // ── Generate + upload PDF ─────────────────────────────────────────────────────
  // silent=true: suppress the alert on failure (used when auto-triggered from Save).
  async function handleGeneratePDF({ silent = false } = {}) {
    const targetId = savedId.current || (isNew ? null : id);
    if (!targetId) {
      if (!silent) alert('Save the itinerary first.');
      return;
    }

    // Guard: only one generation at a time
    if (pdfInFlight.current) return;
    pdfInFlight.current = true;
    setPdfState('generating');

    try {
      const token = await getToken();

      // ── 1. Use current form state as itinerary source ─────────────────────
      // form.content is authoritative — it is what the user sees in the editor.
      // Also resolve the asset identity (parentId + variant) so that filesystem
      // image lookups in buildCustomPDF.js use the correct parent folder, even
      // for DB records created before those columns were added.
      const { assetSlug: resolvedAssetSlug, variant: resolvedVariant } =
        await resolveAssetIdentity(form.slug, { parentId: form.parentId, variant: form.variant });

      const freshItinerary = {
        ...form,
        id:       targetId,
        parentId: form.parentId || (resolvedAssetSlug !== form.slug ? resolvedAssetSlug : ''),
        variant:  form.variant  || resolvedVariant || '',
      };
      const freshDays = form.content?.days || [];
      console.log('[CMS] PDF generation — slug:', form.slug, '| assetSlug:', resolvedAssetSlug, '| variant:', resolvedVariant || 'none', '| days:', freshDays.length);

      // Debug Day 11 specifically so divergence is visible in logs
      const day11 = freshDays.find(d => Number(d.day) === 11);
      if (day11) {
        console.log('[CMS] PDF Day 11 from form:', JSON.stringify({ day: day11.day, title: day11.title, img: day11.img }, null, 2));
      } else {
        console.warn('[CMS] PDF generation — Day 11 not found in form content (total days:', freshDays.length, ')');
      }

      // ── 2. Fetch fresh assets from DB ─────────────────────────────────────
      console.log('[CMS] PDF generation — fetching fresh assets for id:', targetId);
      const assetsRes   = await fetch(`/api/itinerary-cms?action=assets&id=${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const assetsJson  = await assetsRes.json();
      const freshAssets = assetsJson.assets ?? [];
      console.log('[CMS] PDF generation — assets fetched:', freshAssets.length, '| day assets:', freshAssets.filter(a => a.assetType === 'day').length);

      // ── 3. Resolve blob images server-side before rendering ───────────────
      // @react-pdf/renderer cannot reliably fetch remote URLs in a browser context.
      // We pre-fetch all blob-source images via the server (Node.js, no CORS) and
      // pass base64 data URIs to the renderer so it never makes a network request.
      const freshContent = freshItinerary.content
        ? (typeof freshItinerary.content === 'string'
            ? (() => { try { return JSON.parse(freshItinerary.content); } catch { return {}; } })()
            : freshItinerary.content)
        : {};

      const coverUrl  = freshItinerary.coverImage || freshContent.hero?.coverImage || '';
      const urlsToResolve = [
        coverUrl,
        // All asset URLs that are remote — regardless of source tag
        // (a 'manual' asset with a blob URL still needs server-side resolution)
        ...freshAssets.filter(a => a.url?.startsWith('http')).map(a => a.url),
        // Inline day.img fields that are remote URLs
        ...freshDays.filter(d => d.img?.startsWith('http')).map(d => d.img),
      ].filter((u, i, arr) => u && arr.indexOf(u) === i); // deduplicate + remove empty

      console.log('[CMS] resolving', urlsToResolve.length, 'remote image(s) server-side…');
      const resolveRes  = await fetch('/api/itinerary-cms?action=resolve-images', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ urls: urlsToResolve }),
      });
      if (!resolveRes.ok) {
        const errText = await resolveRes.text();
        console.error('[CMS] resolve-images failed:', resolveRes.status, errText.slice(0, 200));
      }
      const resolveJson = resolveRes.ok ? await resolveRes.json() : {};
      const resolvedImages = resolveJson.resolved ?? {};

      // Diagnostic: blob resolution status
      console.log('PDF hero image URL',     coverUrl || '(none)');
      console.log('PDF hero base64 exists', !!resolvedImages[coverUrl]);
      // Day 11: check active asset URL + resolution result
      const day11Asset = freshAssets.find(a => a.assetType === 'day' && Number(a.dayNumber) === 11 && a.active !== false);
      const day11Url   = day11Asset?.url || day11?.img || '';
      const day11Resolved = resolvedImages[day11Url];
      console.log('PDF day 11 image URL',      day11Url || '(none)');
      console.log('PDF day 11 resolved type',  day11Resolved
        ? (day11Resolved.startsWith('data:') ? `base64(${day11Resolved.length}b)` : `path:${day11Resolved}`)
        : '(none — will use filesystem fallback)');

      // ── 3b. Filesystem fallbacks for failed blob resolutions ─────────────
      // If a blob URL failed to pre-resolve (network error, expired, CORS),
      // substitute the corresponding filesystem path so the image still
      // appears in the PDF. @react-pdf/renderer fetches these paths from
      // window.location.origin (served from public/ in both dev and prod).
      const { getDayImages: getFsDayImgs, getCoverImage: getFsCoverImg } =
        await import('../../lib/itineraryImages');
      const enrichedResolved = { ...resolvedImages };

      // resolvedAssetSlug/resolvedVariant were computed in step 1 using
      // resolveAssetIdentity — reuse them here for consistency.
      const fsAssetSlug = resolvedAssetSlug;
      const fsVariant   = resolvedVariant;
      console.log(`[CMS] filesystem asset slug: "${fsAssetSlug}", variant: "${fsVariant || 'none'}"`);

      if (coverUrl?.startsWith('http') && !enrichedResolved[coverUrl]) {
        const fsCover = getFsCoverImg(fsAssetSlug);
        if (fsCover) {
          console.log('[CMS] hero blob failed — filesystem fallback:', fsCover);
          enrichedResolved[coverUrl] = fsCover;
        }
      }
      freshDays.forEach(day => {
        const dayAsset = freshAssets.find(
          a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day) && a.active !== false
        );
        const dayBlobUrl = dayAsset?.url || day.img;
        if (dayBlobUrl?.startsWith('http') && !enrichedResolved[dayBlobUrl]) {
          const fsImgs = getFsDayImgs(fsAssetSlug, day.day, fsVariant);
          if (fsImgs.length) {
            console.log(`[CMS] Day ${day.day} blob failed — filesystem fallback:`, fsImgs[0]);
            enrichedResolved[dayBlobUrl] = fsImgs[0];
          }
        }
      });

      // ── 3c. Pre-resolve filesystem day images (no blob URL at all) ────────
      // For days with no DB asset and no inline day.img, buildCustomPDF.js will
      // call getDayImages to get a filesystem path. Pre-resolve those paths to
      // base64 here (server-side fetch) so the renderer gets an embedded data URI
      // rather than making a same-origin browser fetch during PDF rendering.
      //
      // Key: relative path (/itineraries/...) — matches what getDayImages returns,
      //      which is what buildCustomPDF.js uses as the resolvedImages lookup key.
      const fsUrlsToResolve = [];
      const fsKeyMap = {};  // absUrl → relPath, so we can re-key the result
      freshDays.forEach(day => {
        const dayAsset = freshAssets.find(
          a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day) && a.active !== false
        );
        const dayBlobUrl = dayAsset?.url || day.img;

        // Collect filesystem paths to pre-resolve for two cases:
        // 1. No blob URL at all — filesystem is the primary source.
        // 2. A blob URL exists but step 3b set a filesystem fallback because the blob
        //    failed to resolve (enrichedResolved[dayBlobUrl] is a relative path, not base64).
        //    Without this branch, the fallback path would reach @react-pdf/renderer as a raw
        //    relative URL, which can fail silently in some environments. Pre-resolving it to
        //    base64 here ensures the renderer always receives an embedded data URI.
        let fsPaths = [];
        if (!dayBlobUrl) {
          fsPaths = getFsDayImgs(fsAssetSlug, day.day, fsVariant);
        } else {
          const fallback = enrichedResolved[dayBlobUrl];
          // A filesystem path starts with '/' and is not a data URI
          if (fallback && !fallback.startsWith('data:') && fallback.startsWith('/')) {
            fsPaths = [fallback];
          }
        }

        fsPaths.forEach(relPath => {
          if (!enrichedResolved[relPath]) {
            const absUrl = window.location.origin + relPath;
            if (!fsUrlsToResolve.includes(absUrl)) {
              fsUrlsToResolve.push(absUrl);
              fsKeyMap[absUrl] = relPath;
            }
          }
        });
      });
      if (fsUrlsToResolve.length) {
        console.log('[CMS] pre-resolving', fsUrlsToResolve.length, 'filesystem day image(s) to base64…');
        try {
          const fsResolveRes = await fetch('/api/itinerary-cms?action=resolve-images', {
            method:  'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body:    JSON.stringify({ urls: fsUrlsToResolve }),
          });
          if (fsResolveRes.ok) {
            const fsResolveJson = await fsResolveRes.json();
            for (const [absUrl, relPath] of Object.entries(fsKeyMap)) {
              const b64 = fsResolveJson.resolved?.[absUrl];
              if (b64) {
                enrichedResolved[relPath] = b64;
                console.log(`[CMS] Day image pre-resolved — ${relPath.slice(0, 60)}`);
              } else {
                console.warn(`[CMS] Day image pre-resolve failed — ${relPath.slice(0, 60)} (will use path directly)`);
              }
            }
          } else {
            console.warn('[CMS] filesystem resolve-images call failed:', fsResolveRes.status);
          }
        } catch (fsErr) {
          console.warn('[CMS] filesystem resolve-images exception:', fsErr.message);
        }
      }

      // ── 3d. Convert unsupported image formats to JPEG ─────────────────────
      // @react-pdf/renderer silently fails on WebP, AVIF, HEIC, and other
      // formats — it reserves the layout space but renders blank pixels.
      // Use the browser's Canvas API to convert any such format to JPEG.
      //
      // The server's detectMimeFromBytes() now uses magic bytes rather than
      // the HTTP Content-Type, so the MIME in the data URI is correct even
      // for files uploaded with the wrong extension (e.g. WebP bytes as .jpg).
      //
      // This runs after ALL resolution steps (3, 3b, 3c).
      const PDF_SAFE_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
      const formatConversions = Object.entries(enrichedResolved).filter(([, v]) => {
        if (!v?.startsWith('data:')) return false;
        const mime = v.match(/^data:([^;,]+)/)?.[1]?.toLowerCase();
        return mime && !PDF_SAFE_MIMES.has(mime);
      });

      if (formatConversions.length) {
        console.warn(`[CMS] ⚠ ${formatConversions.length} image(s) need Canvas conversion to JPEG`);
        await Promise.all(formatConversions.map(([url, dataUri]) => {
          const mime = dataUri.match(/^data:([^;,]+)/)?.[1] || 'unknown';
          console.log(`[CMS] Converting ${mime} → JPEG via Canvas — ${url.slice(0, 70)}`);
          return new Promise(resolve => {
            const img = new window.Image();
            img.onload = () => {
              const nw = img.naturalWidth, nh = img.naturalHeight;
              if (!nw || !nh) {
                console.error(`[CMS] Canvas: image decoded with 0 dimensions (${nw}×${nh}) for ${mime} — conversion skipped`);
                resolve(); return;
              }
              try {
                const MAX = 1600;
                const scale = (nw > MAX || nh > MAX) ? Math.min(MAX / nw, MAX / nh) : 1;
                const w = Math.round(nw * scale), h = Math.round(nh * scale);
                const canvas = document.createElement('canvas');
                canvas.width = w; canvas.height = h;
                canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                const jpeg = canvas.toDataURL('image/jpeg', 0.92);
                if (!jpeg || jpeg === 'data:,' || jpeg.length < 200) {
                  console.error(`[CMS] Canvas toDataURL returned empty result for ${mime} — url: ${url.slice(0, 70)}`);
                  resolve(); return;
                }
                enrichedResolved[url] = jpeg;
                console.log(`[CMS] ✓ ${mime} → JPEG ${w}×${h} (${Math.round(jpeg.length / 1024)}kb) — ${url.slice(0, 70)}`);
              } catch (convErr) {
                console.error(`[CMS] Canvas threw for ${mime}:`, convErr.message, '— url:', url.slice(0, 70));
              }
              resolve();
            };
            img.onerror = () => {
              console.error(`[CMS] img.onerror — browser cannot decode ${mime} — url: ${url.slice(0, 70)}`);
              resolve();
            };
            img.src = dataUri;
          });
        }));
      } else {
        console.log('[CMS] All resolved images are JPEG/PNG — no Canvas conversion needed');
      }

      // ── 4. Generate PDF from form state + pre-resolved images ────────────
      // Final diagnostic: show what image source each day resolved to.
      //   base64/jpeg     = ready for rendering  ✓
      //   base64/webp     = format conversion ran but failed (will show blank)  ✗
      //   fs-fallback     = raw relative path (browser fetch — less reliable)  ⚠
      //   MISSING         = no image found at all  ✗
      freshDays.forEach(day => {
        const asset   = freshAssets.find(a => a.assetType === 'day' && Number(a.dayNumber) === Number(day.day) && a.active !== false);
        const blobUrl = asset?.url || day.img;
        let srcType;
        if (!blobUrl) {
          const fsPaths = getFsDayImgs(fsAssetSlug, day.day, fsVariant);
          const fsB64   = fsPaths[0] ? enrichedResolved[fsPaths[0]] : null;
          const fsMime  = fsB64?.match(/^data:([^;,]+)/)?.[1] || '';
          srcType = fsB64 ? `base64(fs,${fsMime})` : fsPaths[0] ? `fs-fallback:${fsPaths[0].slice(-30)}` : 'MISSING';
        } else {
          const resolved = enrichedResolved[blobUrl];
          if (resolved?.startsWith('data:')) {
            const mime = resolved.match(/^data:([^;,]+)/)?.[1] || '?';
            srcType = `base64(blob,${mime},${Math.round(resolved.length/1024)}kb)`;
          } else if (resolved) {
            const pathB64  = enrichedResolved[resolved];
            const pathMime = pathB64?.match(/^data:([^;,]+)/)?.[1] || '';
            srcType = pathB64 ? `base64(blob→fs,${pathMime})` : `fs-fallback:${resolved.slice(-30)}`;
          } else {
            srcType = 'MISSING';
          }
        }
        const marker = srcType.includes('webp') || srcType.includes('heic') || srcType.includes('avif') || srcType.includes('MISSING') ? ' ⚠' : ' ✓';
        console.log(`[CMS] Day ${String(day.day).padStart(2)} image →`, srcType + marker);
      });

      // Final proof log for Day 11 specifically — exact MIME + size entering the renderer
      const d11asset = freshAssets.find(a => a.assetType === 'day' && Number(a.dayNumber) === 11 && a.active !== false);
      const d11url   = d11asset?.url || day11?.img || '';
      const d11val   = d11url ? enrichedResolved[d11url] : null;
      if (d11val?.startsWith('data:')) {
        const d11mime = d11val.match(/^data:([^;,]+)/)?.[1] || '?';
        console.log(`[CMS] ▶ Day 11 FINAL — MIME: ${d11mime}, size: ${Math.round(d11val.length / 1024)}kb, url: ${d11url.slice(0, 70)}`);
        if (!PDF_SAFE_MIMES.has(d11mime)) {
          console.error(`[CMS] ▶ Day 11 ⚠ UNSUPPORTED MIME "${d11mime}" entering renderer — PDF will be blank! Canvas conversion must have failed.`);
        }
      } else {
        console.warn(`[CMS] ▶ Day 11 FINAL — no data URI found (url="${d11url.slice(0, 70)}", resolved="${String(d11val).slice(0, 60)}")`);
      }

      const { buildCustomPDFBlob } = await import('../../utils/buildCustomPDF');
      const pdfBlob = await buildCustomPDFBlob(freshItinerary, freshAssets, enrichedResolved);
      console.log('[CMS] PDF blob ready — size:', pdfBlob.size, 'bytes');

      // ── 5. Get a scoped client token for direct browser → Vercel Blob upload ─
      // The token is valid for 5 minutes and scoped to a single pathname.
      // No PDF binary ever passes through a Vercel Function body.
      const tokenRes = await fetch(`/api/itinerary-cms?action=upload-pdf-token&id=${targetId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        throw new Error(`Failed to get upload token: ${tokenRes.status} — ${errText.slice(0, 120)}`);
      }
      const { token: clientToken, pathname } = await tokenRes.json();
      console.log('[CMS] upload token received — path:', pathname);

      // ── 6. Upload PDF directly from browser to Vercel Blob ────────────────
      // @vercel/blob/client `put` sends the binary straight to Vercel Blob
      // using the client token — no API function body involved.
      const { put: blobPutClient } = await import('@vercel/blob/client');
      const { url: blobUrl } = await blobPutClient(pathname, pdfBlob, {
        access: 'public',
        contentType: 'application/pdf',
        token: clientToken,
      });
      console.log('[CMS] blob upload success —', blobUrl);

      // ── 7. Persist URL + increment version in DB (tiny ~100-byte payload) ─
      const res  = await fetch(`/api/itinerary-cms?action=save-pdf-url&id=${targetId}`, {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ url: blobUrl }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      console.log('[CMS] PDF saved — pdfUrl:', json.pdfUrl, '| version:', json.pdfVersion);
      setForm(f => ({ ...f, pdfUrl: json.pdfUrl, pdf_url: json.pdfUrl, pdf_version: json.pdfVersion || f.pdf_version }));
      setPdfState('done');
      setTimeout(() => setPdfState('idle'), 4000);
    } catch (e) {
      console.error('[CMS] PDF generation failed:', e.message);
      if (!silent) alert(`PDF generation failed: ${e.message}`);
      setPdfState('error');
      setTimeout(() => setPdfState('idle'), 4000);

      // Record failure in DB so pdfStatus reflects reality
      const targetId2 = savedId.current || (isNew ? null : id);
      if (targetId2) {
        try {
          const token = await getToken();
          await fetch(`/api/itinerary-cms?action=update-pdf-status&id=${targetId2}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'failed', error: e.message }),
          });
        } catch { /* best-effort — don't surface secondary errors */ }
      }
    } finally {
      pdfInFlight.current = false;
    }
  }

  // ── Asset actions ─────────────────────────────────────────────────────────────
  const EMPTY_ASSET = { assetType: 'gallery', source: 'url', dayNumber: 1, url: '', alt: '', caption: '', file: null, filePreview: null };

  function afterAdd(asset) {
    setLastAdded(prev => [asset, ...prev].slice(0, 4));
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
    setNewAsset(prev => {
      const dayCount = (c('days') || []).length || parseInt(form.durationDays, 10) || 0;
      const nextDay = prev.assetType === 'day'
        ? Math.min((prev.dayNumber || 1) + 1, Math.max(dayCount, prev.dayNumber || 1))
        : 1;
      return { ...EMPTY_ASSET, assetType: prev.assetType, source: prev.source, dayNumber: nextDay };
    });
  }

  async function handleAddAsset() {
    const targetId = savedId.current || (isNew ? null : id);
    if (!targetId) { alert('Save the itinerary first.'); return; }
    const currentDayCount = (c('days') || []).length || parseInt(form.durationDays, 10) || 0;
    if (newAsset.assetType === 'day' && currentDayCount === 0) { alert('Add days in the Days tab before attaching Day Images.'); return; }
    if (newAsset.assetType === 'day' && (!newAsset.dayNumber || newAsset.dayNumber > currentDayCount)) { alert('Select a valid day number.'); return; }

    if (newAsset.source === 'upload') {
      if (!newAsset.file) { alert('Choose a file to upload.'); return; }
      await handleUploadAsset(targetId);
      return;
    }

    if (!newAsset.url.trim()) {
      alert(newAsset.source === 'filesystem' ? 'Select an image from the filesystem browser.' : 'URL is required.');
      return;
    }

    try {
      const token = await getToken();
      const safeDay = newAsset.assetType === 'day' ? newAsset.dayNumber : null;
      const res   = await fetch('/api/itinerary-cms?action=save-asset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assetType: newAsset.assetType,
          url: newAsset.url,
          alt: newAsset.alt,
          caption: newAsset.caption,
          dayNumber: safeDay,
          source: newAsset.source === 'filesystem' ? 'filesystem' : 'manual',
          itineraryId: targetId,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      // Replace filesystem entry (same URL, no id) with the new DB record
      setAssets(prev => [
        ...prev.filter(a => !(a.url === json.asset.url && !a.id)),
        json.asset,
      ]);
      afterAdd(json.asset);
    } catch (e) { alert(e.message); }
  }

  async function handleUploadAsset(targetId) {
    const slug = slugRef.current || form.slug;
    if (!slug) { alert('Slug is required to upload images.'); return; }
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(newAsset.file);
      });
      const token = await getToken();
      const res   = await fetch('/api/itinerary-cms?action=upload-asset', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: targetId,
          slug,
          assetType: newAsset.assetType,
          dayNumber: newAsset.assetType === 'day' ? newAsset.dayNumber : null,
          filename: newAsset.file.name,
          data: base64,
          alt: newAsset.alt,
          caption: newAsset.caption,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAssets(prev => [...prev, json.asset]);
      if (newAsset.filePreview) URL.revokeObjectURL(newAsset.filePreview);
      afterAdd(json.asset);
    } catch (e) { alert(e.message); }
  }

  async function handleToggleAsset(asset) {
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=toggle-asset&id=${asset.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAssets(prev => prev.map(a => a.id === asset.id ? json.asset : a));
    } catch (e) { alert(e.message); }
  }

  async function handleDeleteAsset(asset) {
    if (!window.confirm('Delete this image?')) return;
    try {
      const token = await getToken();
      await fetch(`/api/itinerary-cms?action=delete-asset&id=${asset.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      setAssets(prev => prev.filter(a => a.id !== asset.id));
    } catch (e) { alert(e.message); }
  }

  // ── Upload from any picker (hero/day) — adds to shared assets[] ──────────────
  async function uploadAssetFromPicker(file, assetType, dayNumber) {
    const targetId = savedId.current || (isNew ? null : id);
    if (!targetId) { alert('Save the itinerary first before uploading images.'); return null; }
    const slug = slugRef.current || form.slug;
    if (!slug) { alert('Slug is required to upload images.'); return null; }

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload  = e => resolve(e.target.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    const token = await getToken();
    const res = await fetch('/api/itinerary-cms?action=upload-asset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itineraryId: targetId,
        slug,
        assetType,
        dayNumber: assetType === 'day' ? (dayNumber ?? null) : null,
        filename: file.name,
        data: base64,
        alt: '',
        caption: '',
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    setAssets(prev => [...prev, json.asset]);
    return json.asset.url;
  }

  // ── Set hero image (shared by HeroTab picker and Images tab "Set as hero") ───
  function handleHeroCoverImage(url) {
    setContent('hero.coverImage', url);
    setForm(f => ({ ...f, coverImage: url }));
  }

  // ── AI generate ───────────────────────────────────────────────────────────────
  async function handleAIGenerate() {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true); setAiOutput(null);
    try {
      const token    = await getToken();
      const targetId = savedId.current || (isNew ? null : id);
      const res      = await fetch('/api/itinerary-cms?action=ai-generate', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itineraryId: targetId || null,
          prompt: aiPrompt,
          requestContext: linkedRequest || null,
        }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAiOutput(json.generation);
      setAiHistory(prev => [json.generation, ...prev]);
    } catch (e) { alert(e.message); }
    finally { setAiGenerating(false); }
  }

  function handleApplyAIDraft(generation) {
    const parsed = generation.parsedOutput;
    if (!parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0) {
      alert('No structured output to apply. The generation may have failed.');
      return;
    }
    if (!window.confirm('Apply AI draft to form? Your current unsaved changes will be overwritten.')) return;

    const content      = mergeContent(parsed);
    const aiDayCount   = Array.isArray(parsed.days) ? parsed.days.length : 0;
    const aiCoverImage = parsed.hero?.coverImage || '';

    setForm(f => ({
      ...f,
      // Title / subtitle from AI hero block
      title:       parsed.hero?.title    || f.title,
      subtitle:    parsed.hero?.subtitle || f.subtitle,
      // Cover image: prefer AI output, fall back to existing
      coverImage:  aiCoverImage || f.coverImage,
      // Duration: prefer what's already in form, fill from AI days count if blank
      durationDays: f.durationDays || (aiDayCount > 0 ? String(aiDayCount) : f.durationDays),
      // Destination / metadata: keep existing form value; fill from linked request if empty
      destination: f.destination || linkedRequest?.destination || f.destination,
      country:     f.country     || linkedRequest?.country     || f.country,
      region:      f.region      || linkedRequest?.region      || f.region,
      content,
    }));
  }

  if (loading) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <div style={{ ...card, height: '400px', opacity: 0.5 }} />
      </div>
    );
  }

  const isPublished  = form.status === 'published';
  const sidebarWidth = isMobile ? '100%' : '260px';

  return (
    <div style={{ padding: isMobile ? '16px' : '0' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
        padding: isMobile ? '0 0 16px' : '20px 32px', background: isMobile ? 'transparent' : 'white',
        borderBottom: isMobile ? 'none' : '1px solid #E8E3DA',
        position: isMobile ? 'static' : 'sticky', top: 0, zIndex: 100,
      }}>
        <Link to="/admin/itineraries" style={{ ...iconBtn, color: '#6B6156', textDecoration: 'none' }}>
          <ArrowLeft size={16} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '18px', fontWeight: '600', color: '#1C1A16',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {form.title || (isNew ? 'New Itinerary' : 'Edit Itinerary')}
          </p>
          <p style={{ fontSize: '11px', color: '#B5AA99', fontFamily: 'monospace' }}>{form.slug || '—'}</p>
        </div>

        {/* Status + actions */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {saveMsg && (
            <span style={{ fontSize: '12px', color: saveMsg.ok ? '#1B6B65' : '#C0392B', fontWeight: '500' }}>
              {saveMsg.text}
            </span>
          )}
          <span style={{
            fontSize: '11px', fontWeight: '700', letterSpacing: '0.5px', textTransform: 'uppercase',
            padding: '4px 10px', borderRadius: '10px',
            background: isPublished ? '#EFF6F5' : '#F4F1EC',
            color: isPublished ? '#1B6B65' : '#8C8070',
          }}>
            {isPublished ? 'Published' : 'Draft'}
          </span>

          {/* Preview — opens custom itinerary page in new tab */}
          {form.slug && (
            <a
              href={`/itinerary/custom/${form.slug}?preview=true`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...btnSecondary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
            >
              <ExternalLink size={12} /> Preview
            </a>
          )}

          {/* Generate PDF — custom itineraries only */}
          {form.type === 'custom' && !isNew && (savedId.current || id) && (
            <button
              onClick={handleGeneratePDF}
              disabled={pdfState === 'generating'}
              style={{
                ...btnSecondary,
                color: pdfState === 'done' ? '#1B6B65' : pdfState === 'error' ? '#C0392B' : btnSecondary.color,
              }}
            >
              <FileText size={12} />
              {pdfState === 'generating' ? 'Generating…' : pdfState === 'done' ? 'PDF ready!' : pdfState === 'error' ? 'PDF failed' : form.pdf_url || form.pdfUrl ? 'Regenerate PDF' : 'Generate PDF'}
            </button>
          )}

          {/* View PDF — shown when a generated PDF URL exists */}
          {(form.pdf_url || form.pdfUrl) && !isNew && (
            <button
              type="button"
              onClick={handleViewPDF}
              title={`pdf_url: ${form.pdf_url || form.pdfUrl}`}
              style={{ ...btnSecondary, display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#1B6B65', cursor: 'pointer' }}
            >
              <ExternalLink size={12} /> View PDF {form.pdf_version ? `(${form.pdf_version})` : ''}
            </button>
          )}

          {/* Sync days from static source — only for non-custom itineraries */}
          {form.type !== 'custom' && !isNew && (
            <button onClick={handleSyncDaysFromStatic} style={btnSecondary} title="Reset all day content from src/data/itineraries.js">
              <Check size={12} /> Sync days
            </button>
          )}

          <button onClick={handleTogglePublish} style={btnSecondary}>
            {isPublished ? <><EyeOff size={12} /> Unpublish</> : <><Globe size={12} /> Publish</>}
          </button>

          <button onClick={handleSave} disabled={saving} style={btnPrimary}>
            <Save size={12} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div style={{ padding: isMobile ? '0' : '24px 32px' }}>

        {/* ── Tab nav ── */}
        <div style={{
          display: 'flex', gap: '0', background: 'white', border: '1px solid #E8E3DA',
          borderRadius: '8px', padding: '3px', marginBottom: '20px',
          overflowX: 'auto',
        }}>
          {TABS.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              padding: '7px 16px', fontSize: '12.5px', fontWeight: '500', border: 'none',
              borderRadius: '5px', cursor: 'pointer', whiteSpace: 'nowrap',
              background: activeTab === tab.key ? '#1C1A16' : 'transparent',
              color: activeTab === tab.key ? 'white' : '#6B6156',
            }}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Tab panels ── */}
        {activeTab === 'basics'   && <BasicsTab   form={form} setForm={setForm} onTitleChange={handleTitleChange} pricingOptions={pricingOptions} creators={allCreators} />}
        {activeTab === 'hero'     && <HeroTab     form={form} c={c} setContent={setContent} assets={assets} onUpload={uploadAssetFromPicker} onCoverImageChange={handleHeroCoverImage} />}
        {activeTab === 'days'     && <DaysTab     c={c} addDay={addDay} updateDay={updateDay} deleteDay={deleteDay} moveDay={moveDay} assets={assets} onUpload={uploadAssetFromPicker} />}
        {activeTab === 'sections' && <SectionsTab c={c} setContent={setContent} />}
        {activeTab === 'images'   && (
          <ImagesTab
            assets={assets} loading={assetsLoading}
            newAsset={newAsset} setNewAsset={setNewAsset}
            onAdd={handleAddAsset} onToggle={handleToggleAsset} onDelete={handleDeleteAsset}
            isNew={isNew} hasSavedId={!!savedId.current}
            dayCount={(c('days') || []).length || parseInt(form.durationDays, 10) || 0}
            heroImageUrl={c('hero.coverImage') || form.coverImage || ''}
            dayImages={(c('days') || []).reduce((acc, d) => { if (d.img) acc[d.day] = d.img; return acc; }, {})}
            onSetHero={handleHeroCoverImage}
            lastAdded={lastAdded}
            justAdded={justAdded}
          />
        )}
        {activeTab === 'ai'       && (
          <AITab
            prompt={aiPrompt} setPrompt={setAiPrompt}
            generating={aiGenerating} output={aiOutput} history={aiHistory}
            onGenerate={handleAIGenerate} onApply={handleApplyAIDraft}
            linkedRequest={linkedRequest} itineraryType={form.type}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAB COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Basics ────────────────────────────────────────────────────────────────────
function BasicsTab({ form, setForm, onTitleChange, pricingOptions = [], creators = [] }) {
  function set(field, value) { setForm(f => ({ ...f, [field]: value })); }

  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Identity</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Title *">
            <input value={form.title} style={inputStyle} placeholder="e.g. Bali Island Journey"
              onChange={e => onTitleChange(e.target.value)} />
          </Field>
          <Field label="Subtitle">
            <input value={form.subtitle} style={inputStyle} placeholder="e.g. 10 Day Island Journey"
              onChange={e => set('subtitle', e.target.value)} />
          </Field>
        </div>

        <Field label="Slug *" hint="URL-safe identifier. Auto-generated from title. Changing this after publishing breaks existing links.">
          <input value={form.slug} style={{ ...inputStyle, fontFamily: 'monospace' }}
            placeholder="bali-island-journey" onChange={e => set('slug', e.target.value)} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
          <Field label="Destination">
            <input value={form.destination} style={inputStyle} placeholder="e.g. Bali"
              onChange={e => set('destination', e.target.value)} />
          </Field>
          <Field label="Country">
            <input value={form.country} style={inputStyle} placeholder="e.g. Indonesia"
              onChange={e => set('country', e.target.value)} />
          </Field>
          <Field label="Region">
            <input value={form.region} style={inputStyle} placeholder="e.g. Southeast Asia"
              onChange={e => set('region', e.target.value)} />
          </Field>
        </div>

        <Field label="Duration (days)">
          <input type="number" value={form.durationDays} style={{ ...inputStyle, maxWidth: '140px' }}
            placeholder="10" min="1" max="60"
            onChange={e => set('durationDays', e.target.value)} />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Parent slug" hint="Asset folder slug for variant itineraries. E.g. california-american-west for all USA variants. Leave empty for standalone itineraries.">
            <input value={form.parentId} style={{ ...inputStyle, fontFamily: 'monospace' }}
              placeholder="california-american-west"
              onChange={e => set('parentId', e.target.value)} />
          </Field>
          <Field label="Variant" hint="Image variant to resolve for this itinerary. Determines which day-images/dayN/<variant>/ subfolder is used.">
            <select value={form.variant} style={{ ...inputStyle, maxWidth: '200px' }}
              onChange={e => set('variant', e.target.value)}>
              <option value="">None (standalone)</option>
              <option value="complete">Complete</option>
              <option value="premium">Premium / Complete</option>
              <option value="essential">Essential</option>
              <option value="short">Short</option>
            </select>
          </Field>
        </div>

        {creators.length > 0 && (
          <Field label="Travel Designer" hint="Assign this itinerary to a travel designer. Leave empty to show no attribution.">
            <select
              value={form.creatorId || ''}
              onChange={e => set('creatorId', e.target.value || null)}
              style={{ ...inputStyle, maxWidth: '320px' }}
            >
              <option value="">None (no attribution)</option>
              {creators.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Type & Access</p>

        <Field label="Itinerary type">
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {[
              { value: 'free',    label: 'Free',    hint: 'No purchase required' },
              { value: 'premium', label: 'Premium', hint: 'Paid download' },
              { value: 'custom',  label: 'Custom',  hint: 'Private, linked to a client request' },
            ].map(({ value, label, hint }) => (
              <label key={value} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 18px', borderRadius: '6px', cursor: 'pointer',
                border: `1px solid ${form.type === value ? '#1B6B65' : '#E8E3DA'}`,
                background: form.type === value ? '#EFF6F5' : 'white',
                fontSize: '13px', fontWeight: '500',
                color: form.type === value ? '#1B6B65' : '#4A433A',
              }}>
                <input type="radio" name="type" value={value}
                  checked={form.type === value}
                  onChange={() => setForm(f => {
                    const isPremium = value === 'premium';
                    // When switching TO premium, auto-select the correct default plan:
                    //   USA variants → their tier; all others → premium_complete (€29)
                    let autoOption = null;
                    if (isPremium && !f.stripePriceId) {
                      const usaSlugMap = {
                        'california-american-west-8-days':  'premium_short',
                        'california-american-west-12-days': 'premium_essential',
                        'california-american-west-16-days': 'premium_complete',
                      };
                      const targetKey = usaSlugMap[f.slug] ?? 'premium_complete';
                      autoOption = pricingOptions.find(o => o.key === targetKey)
                        ?? pricingOptions.find(o => o.key === 'premium_complete')
                        ?? pricingOptions[pricingOptions.length - 1]
                        ?? null;
                    }
                    return {
                      ...f,
                      type: value,
                      isPrivate: value === 'custom' ? true : (value === 'free' ? false : f.isPrivate),
                      // clear pricing when leaving premium; auto-default when entering
                      ...(!isPremium
                        ? { stripePriceId: '', pricingKey: '' }
                        : autoOption
                          ? { stripePriceId: autoOption.stripePriceId, pricingKey: autoOption.key }
                          : {}),
                    };
                  })}
                  style={{ display: 'none' }}
                />
                {form.type === value && <Check size={13} strokeWidth={3} />}
                <span>
                  {label}
                  <span style={{ fontSize: '11px', color: '#B5AA99', display: 'block', fontWeight: '400' }}>{hint}</span>
                </span>
              </label>
            ))}
          </div>
        </Field>

        <Field label="Visibility" hint="Private itineraries are only accessible to users who purchased them.">
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: form.type === 'custom' ? 'default' : 'pointer' }}>
            <input type="checkbox"
              checked={form.isPrivate}
              onChange={e => form.type !== 'custom' && set('isPrivate', e.target.checked)}
              disabled={form.type === 'custom'}
              style={{ width: '15px', height: '15px', accentColor: '#1B6B65' }}
            />
            <span style={{ fontSize: '13.5px', color: form.type === 'custom' ? '#B5AA99' : '#4A433A' }}>
              Private {form.type === 'custom' ? '(always private for custom itineraries)' : ''}
            </span>
          </label>
        </Field>

        <Field label="Collection" hint="Mark as a collection/parent itinerary. Collections are hidden from the main CMS list and shown under a separate Collections tab.">
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <input type="checkbox"
              checked={form.isCollection ?? false}
              onChange={e => set('isCollection', e.target.checked)}
              style={{ width: '15px', height: '15px', accentColor: '#7C5CBA' }}
            />
            <span style={{ fontSize: '13.5px', color: '#4A433A' }}>
              This is a collection (parent/aggregator — has no standalone day plan)
            </span>
          </label>
        </Field>

        {form.type === 'premium' && (() => {
          const selectedOption = pricingOptions.find(o => o.key === form.pricingKey)
            ?? pricingOptions.find(o => o.stripePriceId === form.stripePriceId);
          return (
            <Field label="Pricing plan" hint="Required before saving or publishing.">
              {pricingOptions.length === 0 ? (
                <p style={{ fontSize: '13px', color: '#E05353', margin: 0 }}>
                  No pricing plans available. Set STRIPE_PRICE_PREMIUM_COMPLETE (or STRIPE_PRICE_ID) in Vercel env vars.
                </p>
              ) : (
                <>
                  <select
                    value={form.pricingKey || ''}
                    onChange={e => {
                      const opt = pricingOptions.find(o => o.key === e.target.value);
                      setForm(f => ({
                        ...f,
                        pricingKey:    opt ? opt.key            : '',
                        stripePriceId: opt ? opt.stripePriceId  : '',
                      }));
                    }}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="">— select a plan —</option>
                    {pricingOptions.map(opt => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label} · {opt.displayPrice}
                      </option>
                    ))}
                  </select>
                  {selectedOption && (
                    <p style={{ fontSize: '12px', color: '#7A7265', margin: '6px 0 0', fontFamily: 'monospace' }}>
                      {selectedOption.stripePriceId}
                    </p>
                  )}
                  {!selectedOption && form.stripePriceId && (
                    <p style={{ fontSize: '12px', color: '#C97B2E', margin: '6px 0 0' }}>
                      Stored price ID does not match any configured plan — select a plan to update.
                    </p>
                  )}
                </>
              )}
            </Field>
          );
        })()}
      </div>

      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>SEO</p>
        <Field label="Meta Title">
          <input value={form.content?.seo?.metaTitle || ''} style={inputStyle}
            placeholder="Auto-generated from title if blank"
            onChange={e => {
              setForm(f => ({ ...f, content: { ...f.content, seo: { ...f.content.seo, metaTitle: e.target.value } } }));
            }} />
        </Field>
        <Field label="Meta Description">
          <textarea value={form.content?.seo?.metaDescription || ''} rows={3}
            style={{ ...textareaStyle, minHeight: '72px' }}
            placeholder="155-character summary for search results"
            onChange={e => {
              setForm(f => ({ ...f, content: { ...f.content, seo: { ...f.content.seo, metaDescription: e.target.value } } }));
            }} />
        </Field>
      </div>
    </div>
  );
}

// ── Hero & Summary ────────────────────────────────────────────────────────────
function HeroTab({ form, c, setContent, assets, onUpload, onCoverImageChange }) {
  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Hero</p>

        <ImagePicker
          label="Cover Image"
          hint="Select from the shared library, upload a new file, or use a URL from the library."
          value={resolveCoverImage(c('hero.coverImage'), form.slug) || ''}
          onChange={url => onCoverImageChange(url)}
          assets={assets}
          onUpload={onUpload ? (file) => onUpload(file, 'hero') : null}
          assetType="hero"
        />

        <Field label="Tagline">
          <input value={c('hero.tagline') || ''} style={inputStyle}
            placeholder="e.g. Temples, rice terraces and volcanic island life"
            onChange={e => setContent('hero.tagline', e.target.value)} />
        </Field>
      </div>

      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Summary</p>

        <Field label="Short Description" hint="50–100 words. Used in cards and page intro.">
          <textarea value={c('summary.shortDescription') || ''} style={{ ...textareaStyle, minHeight: '100px' }}
            placeholder="Lead paragraph for the itinerary…"
            onChange={e => setContent('summary.shortDescription', e.target.value)} />
        </Field>

        <Field label="Why This Journey Is Special" hint="150–250 words. The editorial voice section.">
          <textarea value={c('summary.whySpecial') || ''} style={{ ...textareaStyle, minHeight: '130px' }}
            placeholder="What makes this route distinct…"
            onChange={e => setContent('summary.whySpecial', e.target.value)} />
        </Field>

        <Field label="Route Overview" hint="Format: City A → City B → City C">
          <input value={c('summary.routeOverview') || ''} style={inputStyle}
            placeholder="Seminyak → Ubud → Batur → Amed → Nusa Penida"
            onChange={e => setContent('summary.routeOverview', e.target.value)} />
        </Field>

        <ArrayEditor
          label="Highlights"
          hint="6 key bullet points shown on the itinerary page."
          value={c('summary.highlights') || []}
          onChange={v => setContent('summary.highlights', v)}
          placeholder="Add highlight…"
        />

        <ArrayEditor
          label="What's Included (paid only)"
          hint="Shown on the purchase CTA. Leave empty for free itineraries."
          value={c('summary.included') || []}
          onChange={v => setContent('summary.included', v)}
          placeholder="Add included item…"
        />
      </div>

      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Trip Facts</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <Field label="Group Size">
            <input value={c('tripFacts.groupSize') || ''} style={inputStyle}
              placeholder="e.g. 2–6 people"
              onChange={e => setContent('tripFacts.groupSize', e.target.value)} />
          </Field>
          <Field label="Category">
            <input value={c('tripFacts.category') || ''} style={inputStyle}
              placeholder="e.g. Island Journey"
              onChange={e => setContent('tripFacts.category', e.target.value)} />
          </Field>
        </div>

        <Field label="Difficulty">
          <select value={c('tripFacts.difficulty') || 'Moderate'} style={inputStyle}
            onChange={e => setContent('tripFacts.difficulty', e.target.value)}>
            {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </Field>

        <CheckboxGroup
          label="Best For"
          options={BEST_FOR_OPTIONS}
          value={c('tripFacts.bestFor') || []}
          onChange={v => setContent('tripFacts.bestFor', v)}
        />
      </div>
    </div>
  );
}

// ── Days ──────────────────────────────────────────────────────────────────────
function DaysTab({ c, addDay, updateDay, deleteDay, moveDay, assets, onUpload }) {
  const days = c('days') || [];
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <p style={{ fontSize: '13px', color: '#6B6156' }}>
          {days.length} day{days.length !== 1 ? 's' : ''}
        </p>
        <button onClick={addDay} style={btnPrimary}>
          <Plus size={13} /> Add day
        </button>
      </div>
      {days.length === 0 ? (
        <div style={{ ...sectionCard, textAlign: 'center', padding: '48px', color: '#B5AA99' }}>
          No days yet. Click "Add day" to start building the itinerary.
        </div>
      ) : (
        days.map((day, i) => (
          <DayCard
            key={i} day={day} index={i} total={days.length}
            onChange={updated => updateDay(i, updated)}
            onDelete={() => deleteDay(i)}
            onMove={(idx, dir) => moveDay(idx, dir)}
            assets={assets}
            onUpload={onUpload}
          />
        ))
      )}
    </div>
  );
}

// ── Sections ──────────────────────────────────────────────────────────────────
function SectionsTab({ c, setContent }) {
  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Accommodation</p>
        <HotelEditor
          hotels={c('sections.hotels') || []}
          onChange={v => setContent('sections.hotels', v)}
        />
      </div>

      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Practical Notes</p>
        <textarea
          value={c('sections.practicalNotes') || ''}
          style={{ ...textareaStyle, minHeight: '140px' }}
          placeholder="Visa requirements, best time to visit, transport notes, currency, health…"
          onChange={e => setContent('sections.practicalNotes', e.target.value)}
        />
      </div>

      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>FAQ</p>
        <FAQEditor
          faq={c('sections.faq') || []}
          onChange={v => setContent('sections.faq', v)}
        />
      </div>

      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>PDF Config</p>
        {[
          { key: 'showRouteMap', label: 'Include route map page' },
          { key: 'showHotels',  label: 'Include accommodation section' },
        ].map(({ key, label }) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', cursor: 'pointer' }}>
            <input type="checkbox"
              checked={c(`pdfConfig.${key}`) !== false}
              onChange={e => setContent(`pdfConfig.${key}`, e.target.checked)}
              style={{ width: '15px', height: '15px', accentColor: '#1B6B65' }}
            />
            <span style={{ fontSize: '13.5px', color: '#4A433A' }}>{label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ── Images ────────────────────────────────────────────────────────────────────
function ImagesTab({ assets, loading, newAsset, setNewAsset, onAdd, onToggle, onDelete, isNew, hasSavedId, dayCount, heroImageUrl, dayImages, onSetHero, lastAdded = [], justAdded = false }) {
  const fileInputRef = useRef(null);

  if (isNew && !hasSavedId) {
    return (
      <div style={{ ...sectionCard, textAlign: 'center', padding: '48px', color: '#B5AA99' }}>
        Save the itinerary first to manage images.
      </div>
    );
  }

  const days = Array.from({ length: dayCount }, (_, i) => i + 1);

  // Filesystem assets not yet promoted to DB, filtered for the current type + day
  const fsBrowserAssets = assets.filter(a => {
    if (a.id) return false;
    if (a.assetType !== newAsset.assetType) return false;
    if (newAsset.assetType === 'day' && String(a.dayNumber) !== String(newAsset.dayNumber)) return false;
    return true;
  });

  const previewUrl = newAsset.source === 'upload' ? newAsset.filePreview : newAsset.url;

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (newAsset.filePreview) URL.revokeObjectURL(newAsset.filePreview);
    const preview = URL.createObjectURL(file);
    setNewAsset(a => ({ ...a, file, filePreview: preview }));
  };

  const srcBtn = (src) => ({
    padding: '5px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
    fontWeight: newAsset.source === src ? '600' : '400',
    border: `1px solid ${newAsset.source === src ? '#1B6B65' : '#E8E3DA'}`,
    background: newAsset.source === src ? '#EFF6F5' : 'white',
    color: newAsset.source === src ? '#1B6B65' : '#6B6355',
  });

  const grouped = ASSET_TYPES.reduce((acc, type) => {
    acc[type] = assets.filter(a => a.assetType === type);
    return acc;
  }, {});

  return (
    <div>
      {/* ── Add Image ──────────────────────────────────────────────────────── */}
      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Add Image</p>

        {/* Type + Day row */}
        <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Type</label>
            <select value={newAsset.assetType} style={inputStyle}
              onChange={e => setNewAsset(a => ({ ...a, assetType: e.target.value, url: '', file: null, filePreview: null }))}>
              {ASSET_TYPES.map(t => (
                <option key={t} value={t}>{ASSET_TYPE_LABELS[t] ?? t}</option>
              ))}
            </select>
          </div>
          {newAsset.assetType === 'day' && (
            <div style={{ flex: '0 0 130px' }}>
              <label style={labelStyle}>Day *</label>
              {dayCount === 0 ? (
                <p style={{ fontSize: '12px', color: '#B5AA99', padding: '9px 0' }}>
                  Add days in the Days tab first.
                </p>
              ) : (
                <select value={Math.min(newAsset.dayNumber, dayCount)} style={inputStyle}
                  onChange={e => setNewAsset(a => ({ ...a, dayNumber: parseInt(e.target.value, 10), url: '', file: null, filePreview: null }))}>
                  {days.map(n => <option key={n} value={n}>Day {n}</option>)}
                </select>
              )}
            </div>
          )}
        </div>

        {/* Source selector */}
        <div style={{ marginBottom: '16px' }}>
          <label style={labelStyle}>Source</label>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[['url', 'URL'], ['upload', 'Upload'], ['filesystem', 'Filesystem']].map(([src, lbl]) => (
              <button key={src} style={srcBtn(src)}
                onClick={() => setNewAsset(a => ({ ...a, source: src, url: '', file: null, filePreview: null }))}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* URL input */}
        {newAsset.source === 'url' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Image URL *</label>
            <input value={newAsset.url} style={inputStyle}
              placeholder="https://images.unsplash.com/…"
              onChange={e => setNewAsset(a => ({ ...a, url: e.target.value }))} />
          </div>
        )}

        {/* Upload input */}
        {newAsset.source === 'upload' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>File</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button onClick={() => fileInputRef.current?.click()} style={btnGhost}>
                <Upload size={12} /> Choose file
              </button>
              {newAsset.file && (
                <span style={{ fontSize: '12px', color: '#4A433A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '220px' }}>
                  {newAsset.file.name}
                </span>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
          </div>
        )}

        {/* Filesystem browser */}
        {newAsset.source === 'filesystem' && (
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>
              Select from filesystem {fsBrowserAssets.length > 0 ? `(${fsBrowserAssets.length})` : ''}
            </label>
            {fsBrowserAssets.length === 0 ? (
              <p style={{ fontSize: '12px', color: '#B5AA99', padding: '16px', background: '#F4F1EC', borderRadius: '6px', textAlign: 'center' }}>
                No untracked filesystem images for {ASSET_TYPE_LABELS[newAsset.assetType] ?? newAsset.assetType}
                {newAsset.assetType === 'day' ? ` · Day ${newAsset.dayNumber}` : ''}.
              </p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: '6px', maxHeight: '230px', overflowY: 'auto', padding: '2px' }}>
                {fsBrowserAssets.map((a, i) => (
                  <div key={i} title={a.url.split('/').pop()}
                    onClick={() => setNewAsset(n => ({ ...n, url: a.url, alt: n.alt || a.alt || '' }))}
                    style={{
                      cursor: 'pointer', borderRadius: '5px', overflow: 'hidden', aspectRatio: '4/3',
                      background: '#F4F1EC',
                      border: `2px solid ${newAsset.url === a.url ? '#1B6B65' : 'transparent'}`,
                      boxShadow: newAsset.url === a.url ? '0 0 0 1px #1B6B65' : 'none',
                    }}>
                    <img src={a.url} alt={a.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Preview */}
        {previewUrl && (
          <div style={{
            position: 'relative', width: '100%', aspectRatio: '16/9',
            borderRadius: '8px', overflow: 'hidden', marginBottom: '16px',
            background: '#F4F1EC', border: '1px solid #E8E3DA',
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
          }}>
            <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{
              position: 'absolute', top: '8px', left: '8px',
              fontSize: '10px', fontWeight: '600', color: 'white',
              background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
              padding: '3px 8px', borderRadius: '4px',
            }}>
              Preview
            </div>
          </div>
        )}

        {/* Alt + Caption */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
          <div>
            <label style={labelStyle}>Alt text</label>
            <input value={newAsset.alt} style={inputStyle}
              placeholder="Brief description for accessibility"
              onChange={e => setNewAsset(a => ({ ...a, alt: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>Caption</label>
            <input value={newAsset.caption} style={inputStyle}
              placeholder="Optional visible caption"
              onChange={e => setNewAsset(a => ({ ...a, caption: e.target.value }))} />
          </div>
        </div>

        <button onClick={onAdd} style={{
          ...btnPrimary,
          background: justAdded ? '#157a5a' : undefined,
          transition: 'background 0.3s',
        }}>
          {justAdded ? <Check size={13} /> : <ImageIcon size={13} />}
          {justAdded ? 'Added!' : 'Add image'}
        </button>

        {/* Recently added */}
        {lastAdded.length > 0 && (
          <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #EDE8E0' }}>
            <p style={{ fontSize: '11px', fontWeight: '600', color: '#B5AA99', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '10px' }}>
              Recently added
            </p>
            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }}>
              {lastAdded.map((asset, i) => (
                <div key={asset.id || i} style={{ flexShrink: 0, width: '84px' }}>
                  <div style={{ aspectRatio: '4/3', borderRadius: '5px', overflow: 'hidden', background: '#F4F1EC', border: '1px solid #E8E3DA' }}>
                    <img src={asset.url} alt={asset.alt || ''} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <p style={{ fontSize: '10px', color: '#B5AA99', marginTop: '4px', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {asset.assetType === 'day' ? `Day ${asset.dayNumber}` : (ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Asset list by type ─────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ ...sectionCard, textAlign: 'center', color: '#B5AA99', fontSize: '13px' }}>Loading…</div>
      ) : assets.length === 0 ? (
        <div style={{ ...sectionCard, textAlign: 'center', color: '#B5AA99', padding: '32px' }}>
          No images yet. Add the first one above.
        </div>
      ) : (
        ASSET_TYPES.filter(type => grouped[type].length > 0).map(type => (
          <div key={type} style={sectionCard}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '16px' }}>
              {ASSET_TYPE_LABELS[type]} ({grouped[type].length})
            </p>
            {[...grouped[type]]
              .sort((a, b) => type === 'day' ? (a.dayNumber ?? 0) - (b.dayNumber ?? 0) : 0)
              .map((asset, i) => {
                // Compute usage badge for this asset
                let usedAs = null;
                if (heroImageUrl && asset.url === heroImageUrl) usedAs = 'Hero';
                else if (dayImages) {
                  const dayMatch = Object.entries(dayImages).find(([, url]) => url === asset.url);
                  if (dayMatch) usedAs = `Day ${dayMatch[0]}`;
                }
                return (
                  <AssetRow
                    key={asset.id ?? `fs-${i}`}
                    asset={asset}
                    onToggle={onToggle}
                    onDelete={onDelete}
                    usedAs={usedAs}
                    onSetHero={onSetHero && !usedAs ? onSetHero : null}
                  />
                );
              })}
          </div>
        ))
      )}
    </div>
  );
}

// ── AI Assistant ──────────────────────────────────────────────────────────────
function parseStyle(val) {
  if (!val) return '';
  if (Array.isArray(val)) return val.join(', ');
  try { return JSON.parse(val).join(', '); } catch { return String(val); }
}

function buildPromptFromRequest(req) {
  if (!req) return '';
  const lines = [];
  lines.push(`Build a complete custom itinerary for the following client request:`);
  lines.push('');
  if (req.fullName)   lines.push(`Client: ${req.fullName}`);
  if (req.destination) lines.push(`Destination: ${req.destination}`);
  if (req.duration)   lines.push(`Duration: ${req.duration} days`);
  if (req.dates)      lines.push(`Travel dates: ${req.dates}`);
  if (req.groupSize)  lines.push(`Group size: ${req.groupSize} people`);
  if (req.groupType)  lines.push(`Group type: ${req.groupType}`);
  if (req.budget)     lines.push(`Budget: ${req.budget}`);
  const styleStr = parseStyle(req.style);
  if (styleStr)       lines.push(`Travel style: ${styleStr}`);
  if (req.notes)      lines.push(`Special requests / notes: ${req.notes}`);
  lines.push('');
  lines.push('Generate a full day-by-day itinerary with hero title, short description, highlights, hotel recommendations, and practical notes. Tailor everything to the client\'s preferences above.');
  return lines.join('\n');
}

function AITab({ prompt, setPrompt, generating, output, history, onGenerate, onApply, linkedRequest, itineraryType }) {
  const [showHistory, setShowHistory] = useState(false);

  const showRequestContext = itineraryType === 'custom' && linkedRequest;

  return (
    <div style={{ maxWidth: '720px' }}>

      {/* Linked request context card */}
      {showRequestContext && (
        <div style={{ ...sectionCard, borderLeft: '3px solid #7C5CBA', background: '#FAF8FF', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={15} color="#7C5CBA" />
              <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16' }}>Client request context</p>
            </div>
            <button
              onClick={() => setPrompt(buildPromptFromRequest(linkedRequest))}
              style={{ ...btnGhost, fontSize: '12px', color: '#7C5CBA', borderColor: '#D4C8F4' }}
            >
              <Wand2 size={12} /> Pre-fill prompt from request
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px' }}>
            {[
              ['Client',       linkedRequest.fullName],
              ['Destination',  linkedRequest.destination],
              ['Duration',     linkedRequest.duration ? `${linkedRequest.duration} days` : null],
              ['Travel dates', linkedRequest.dates],
              ['Group size',   linkedRequest.groupSize != null ? `${linkedRequest.groupSize} people` : null],
              ['Group type',   linkedRequest.groupType],
              ['Budget',       linkedRequest.budget],
              ['Style',        parseStyle(linkedRequest.style) || null],
            ].filter(([, v]) => v).map(([label, value]) => (
              <div key={label}>
                <p style={{ fontSize: '11px', color: '#9B91C0', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</p>
                <p style={{ fontSize: '12.5px', color: '#3D3157' }}>{value}</p>
              </div>
            ))}
          </div>

          {linkedRequest.notes && (
            <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #E8E2F8' }}>
              <p style={{ fontSize: '11px', color: '#9B91C0', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</p>
              <p style={{ fontSize: '12.5px', color: '#3D3157', lineHeight: '1.6' }}>{linkedRequest.notes}</p>
            </div>
          )}
        </div>
      )}

      <div style={sectionCard}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Wand2 size={16} color="#1B6B65" />
          <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16' }}>Generate draft from prompt</p>
        </div>
        <p style={{ fontSize: '12.5px', color: '#8C8070', marginBottom: '16px', lineHeight: '1.6' }}>
          AI output is saved as a draft — it is never published automatically.
          Review the output and click "Apply to draft" to populate the editor.
        </p>

        <textarea
          value={prompt}
          style={{ ...textareaStyle, minHeight: '120px', marginBottom: '12px' }}
          placeholder="e.g. Write a 7-day itinerary for a couple visiting Kyoto and Osaka in spring. Focus on temples, traditional ryokans, and off-the-beaten-path neighbourhoods."
          onChange={e => setPrompt(e.target.value)}
        />

        <button onClick={onGenerate} disabled={generating || !prompt.trim()} style={{
          ...btnPrimary, opacity: generating || !prompt.trim() ? 0.6 : 1,
        }}>
          <Wand2 size={13} /> {generating ? 'Generating…' : 'Generate draft'}
        </button>
      </div>

      {/* Output */}
      {output && (
        <div style={sectionCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16' }}>Generated output</p>
            <button onClick={() => onApply(output)} style={btnPrimary}>
              <Check size={13} /> Apply to draft
            </button>
          </div>

          {Object.keys(output.parsedOutput || {}).length > 0 ? (
            <div>
              {output.parsedOutput.hero?.title && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={labelStyle}>Title</p>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#1C1A16' }}>{output.parsedOutput.hero.title}</p>
                </div>
              )}
              {output.parsedOutput.summary?.shortDescription && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={labelStyle}>Short description</p>
                  <p style={{ fontSize: '13px', color: '#4A433A', lineHeight: '1.6' }}>{output.parsedOutput.summary.shortDescription}</p>
                </div>
              )}
              {Array.isArray(output.parsedOutput.days) && (
                <div style={{ marginBottom: '12px' }}>
                  <p style={labelStyle}>{output.parsedOutput.days.length} days generated</p>
                  {output.parsedOutput.days.slice(0, 3).map((d, i) => (
                    <p key={i} style={{ fontSize: '12.5px', color: '#6B6156', marginBottom: '4px' }}>
                      Day {d.day}: {d.title}
                    </p>
                  ))}
                  {output.parsedOutput.days.length > 3 && (
                    <p style={{ fontSize: '12px', color: '#B5AA99' }}>…and {output.parsedOutput.days.length - 3} more</p>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              <p style={{ fontSize: '12px', color: '#8C8070', marginBottom: '8px' }}>
                Raw output (could not parse as structured JSON):
              </p>
              <pre style={{
                background: '#F4F1EC', borderRadius: '6px', padding: '12px',
                fontSize: '11.5px', color: '#4A433A', whiteSpace: 'pre-wrap', lineHeight: '1.5',
                maxHeight: '300px', overflowY: 'auto',
              }}>
                {output.rawOutput}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={sectionCard}>
          <button
            onClick={() => setShowHistory(h => !h)}
            style={{ ...btnGhost, width: '100%', justifyContent: 'space-between' }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <Clock size={13} /> Previous generations ({history.length})
            </span>
            {showHistory ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>

          {showHistory && (
            <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map(gen => (
                <div key={gen.id} style={{ ...card, padding: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                    <p style={{ fontSize: '12.5px', color: '#4A433A', flex: 1, lineHeight: '1.5' }}>
                      {gen.prompt.length > 120 ? gen.prompt.slice(0, 120) + '…' : gen.prompt}
                    </p>
                    <button onClick={() => onApply(gen)} style={btnGhost} title="Apply this draft">
                      <Check size={12} /> Apply
                    </button>
                  </div>
                  <p style={{ fontSize: '11px', color: '#B5AA99' }}>
                    {new Date(gen.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {gen.createdBy && ` · ${gen.createdBy}`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function mergeContent(content) {
  return {
    ...EMPTY_CONTENT,
    ...content,
    hero:      { ...EMPTY_CONTENT.hero,      ...(content.hero      ?? {}) },
    summary:   { ...EMPTY_CONTENT.summary,   ...(content.summary   ?? {}) },
    tripFacts: { ...EMPTY_CONTENT.tripFacts, ...(content.tripFacts ?? {}) },
    sections:  { ...EMPTY_CONTENT.sections,  ...(content.sections  ?? {}) },
    pdfConfig: { ...EMPTY_CONTENT.pdfConfig, ...(content.pdfConfig ?? {}) },
    seo:       { ...EMPTY_CONTENT.seo,       ...(content.seo       ?? {}) },
    days:      Array.isArray(content.days) ? content.days : [],
  };
}
