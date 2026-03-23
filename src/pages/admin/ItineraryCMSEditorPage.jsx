import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowLeft, Save, Globe, EyeOff, Eye, Plus, Trash2, ChevronDown, ChevronUp,
  Wand2, Image as ImageIcon, Clock, Check, User, Upload,
} from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { resolveCoverImage } from '../../lib/resolveCoverImage';

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
function DayCard({ day, index, total, onChange, onDelete, onMove }) {
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
            <Field label="Title">
              <input value={day.title || ''} style={inputStyle} placeholder="Day title"
                onChange={e => upd('title', e.target.value)} />
            </Field>
            <Field label="Image URL">
              <input value={day.img || ''} style={inputStyle} placeholder="https://images.unsplash.com/…"
                onChange={e => upd('img', e.target.value)} />
            </Field>
          </div>

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

function AssetRow({ asset, onToggle, onDelete }) {
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
        <div style={{ display: 'flex', gap: '6px', marginBottom: '4px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', fontWeight: '600', color: '#1B6B65', background: '#EFF6F5', padding: '2px 7px', borderRadius: '8px', textTransform: 'uppercase' }}>
            {ASSET_TYPE_LABELS[asset.assetType] ?? asset.assetType}
            {asset.dayNumber != null ? ` · Day ${asset.dayNumber}` : ''}
          </span>
          <span style={{ fontSize: '10px', color: '#B5AA99', padding: '2px 7px', background: '#F4F1EC', borderRadius: '8px' }}>
            {asset.source}
          </span>
        </div>
        <p style={{ fontSize: '12px', color: '#4A433A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {asset.alt || asset.caption || asset.url}
        </p>
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
    price: '', stripePriceId: '',
    coverImage: '', status: 'draft', content: { ...EMPTY_CONTENT },
  });

  // Images tab state
  const [assets,       setAssets]       = useState([]);
  const [assetsLoading, setAssetsLoading] = useState(false);
  const [newAsset,     setNewAsset]     = useState({ assetType: 'gallery', source: 'url', dayNumber: 1, url: '', alt: '', caption: '', file: null, filePreview: null });

  // AI tab state
  const [aiPrompt,      setAiPrompt]      = useState('');
  const [aiGenerating,  setAiGenerating]  = useState(false);
  const [aiOutput,      setAiOutput]      = useState(null);
  const [aiHistory,     setAiHistory]     = useState([]);
  const [linkedRequest, setLinkedRequest] = useState(null);

  const savedId  = useRef(null); // set after first create
  const slugRef  = useRef('');  // set after load, used by loadAssets for FS scan

  // ── Load existing itinerary ──────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (isNew) return;
    setLoading(true);
    try {
      const token = await getToken();
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
        price: it.price || '', stripePriceId: it.stripePriceId || '',
        coverImage: it.coverImage || '', status: it.status || 'draft',
        content,
      });
      savedId.current = it.id;
      slugRef.current = it.slug || '';
    } catch (e) { alert(e.message); navigate('/admin/itineraries'); }
    finally { setLoading(false); }
  }, [id, isNew, getToken, navigate]);

  useEffect(() => { load(); }, [load]);

  // ── Load assets when Images tab opens ────────────────────────────────────────
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

      // 2. Filesystem scan (by slug)
      const slug = slugRef.current || form.slug;
      let fsAssets = [];
      if (slug) {
        try {
          const fsRes  = await fetch(`/api/itinerary-cms?action=scan-assets&slug=${encodeURIComponent(slug)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const fsJson = await fsRes.json();
          if (!fsJson.error) fsAssets = fsJson.assets ?? [];
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
        price: form.price ? parseFloat(form.price) : 0,
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
        price:         it.price         ?? f.price,
        stripePriceId: it.stripePriceId ?? f.stripePriceId,
        // content intentionally preserved from f — never replace with DB response
        // (JSONB may arrive as string in some pg/Vercel configurations)
      }));

      setSaveMsg({ ok: true, text: 'Saved.' });
      if (isNew) {
        navigate(`/admin/itineraries/${json.itinerary.id}`, { replace: true });
      }
    } catch (e) { setSaveMsg({ ok: false, text: e.message }); }
    finally { setSaving(false); setTimeout(() => setSaveMsg(null), 4000); }
  }

  // ── Toggle publish ────────────────────────────────────────────────────────────
  async function handleTogglePublish() {
    const targetId = savedId.current || (isNew ? null : id);
    if (!targetId) { alert('Save the itinerary first.'); return; }
    const action = form.status === 'published' ? 'unpublish' : 'publish';
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

  // ── Asset actions ─────────────────────────────────────────────────────────────
  const EMPTY_ASSET = { assetType: 'gallery', source: 'url', dayNumber: 1, url: '', alt: '', caption: '', file: null, filePreview: null };

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
      setNewAsset(EMPTY_ASSET);
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
      setNewAsset(EMPTY_ASSET);
      if (newAsset.filePreview) URL.revokeObjectURL(newAsset.filePreview);
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
        {activeTab === 'basics'   && <BasicsTab   form={form} setForm={setForm} onTitleChange={handleTitleChange} />}
        {activeTab === 'hero'     && <HeroTab     form={form} c={c} setContent={setContent} />}
        {activeTab === 'days'     && <DaysTab     c={c} addDay={addDay} updateDay={updateDay} deleteDay={deleteDay} moveDay={moveDay} />}
        {activeTab === 'sections' && <SectionsTab c={c} setContent={setContent} />}
        {activeTab === 'images'   && (
          <ImagesTab
            assets={assets} loading={assetsLoading}
            newAsset={newAsset} setNewAsset={setNewAsset}
            onAdd={handleAddAsset} onToggle={handleToggleAsset} onDelete={handleDeleteAsset}
            isNew={isNew} hasSavedId={!!savedId.current}
            dayCount={(c('days') || []).length || parseInt(form.durationDays, 10) || 0}
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
function BasicsTab({ form, setForm, onTitleChange }) {
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
                  onChange={() => setForm(f => ({
                    ...f,
                    type: value,
                    isPrivate: value === 'custom' ? true : (value === 'free' ? false : f.isPrivate),
                    price: value === 'free' ? '' : f.price,
                  }))}
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

        {form.type !== 'free' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <Field label="Price (€)">
              <input type="number" value={form.price} style={inputStyle}
                placeholder="29" min="0" step="0.01"
                onChange={e => set('price', e.target.value)} />
            </Field>
            <Field label="Stripe Price ID" hint="From your Stripe Dashboard → Products">
              <input value={form.stripePriceId} style={{ ...inputStyle, fontFamily: 'monospace' }}
                placeholder="price_xxxxxxxxx"
                onChange={e => set('stripePriceId', e.target.value)} />
            </Field>
          </div>
        )}
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
function HeroTab({ form, c, setContent }) {
  return (
    <div style={{ maxWidth: '720px' }}>
      <div style={sectionCard}>
        <p style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '20px' }}>Hero</p>

        <Field label="Cover Image URL" hint="Paste an Unsplash or hosted image URL (1600px width recommended).">
          <input value={c('hero.coverImage') || ''} style={inputStyle}
            placeholder="https://images.unsplash.com/…"
            onChange={e => setContent('hero.coverImage', e.target.value)} />
        </Field>
        {c('hero.coverImage') && (
          <div style={{ height: '180px', borderRadius: '8px', overflow: 'hidden', marginBottom: '16px', background: '#F4F1EC' }}>
            <img
              src={resolveCoverImage(c('hero.coverImage'), form.slug)}
              alt="Cover preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          </div>
        )}

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
function DaysTab({ c, addDay, updateDay, deleteDay, moveDay }) {
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
function ImagesTab({ assets, loading, newAsset, setNewAsset, onAdd, onToggle, onDelete, isNew, hasSavedId, dayCount }) {
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
          <div style={{ height: '120px', borderRadius: '6px', overflow: 'hidden', marginBottom: '16px', background: '#F4F1EC' }}>
            <img src={previewUrl} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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

        <button onClick={onAdd} style={btnPrimary}>
          <ImageIcon size={13} /> Add image
        </button>
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
              .map((asset, i) => (
                <AssetRow key={asset.id ?? `fs-${i}`} asset={asset} onToggle={onToggle} onDelete={onDelete} />
              ))}
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
