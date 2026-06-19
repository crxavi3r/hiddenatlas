// My Trips detail — traveller workspace
import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Clock, Users, MapPin, Download, Pencil, Trash2,
  Plus, X, Map, FileText, Bookmark, BookOpen, Check, Star, ChevronRight,
  ChevronDown, RotateCcw, CalendarPlus, ExternalLink, Copy, Share2,
} from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from '../lib/api';
import { itineraries as staticItineraries } from '../data/itineraries';
import {
  calendarReadiness, buildGoogleCalendarUrl, buildIcsApiUrl,
  downloadIcsFallback, buildCopyText,
} from '../lib/calendarExport';
import { useSEO } from '../hooks/useSEO';
import { useIsMobile } from '../hooks/useIsMobile';
import JapanRouteMap from '../components/JapanRouteMap';
import MoroccoRouteMap from '../components/MoroccoRouteMap';
import PhilippinesRouteMap from '../components/PhilippinesRouteMap';
import AmericanWestRouteMap from '../components/AmericanWestRouteMap';
import AmericanWest12DaysRouteMap from '../components/AmericanWest12DaysRouteMap';
import AmericanWest8DaysRouteMap from '../components/AmericanWest8DaysRouteMap';
import TuscanyRouteMap from '../components/TuscanyRouteMap';
import CroatiaRouteMap from '../components/CroatiaRouteMap';
import NorthernEnglandRouteMap from '../components/NorthernEnglandRouteMap';
import TripRouteMap from '../components/TripRouteMap';
import ShareModal from '../components/ShareModal';

const ROUTE_MAP_COMPONENTS = {
  'japan-grand-cultural-journey':             JapanRouteMap,
  'morocco-motorcycle-expedition':            MoroccoRouteMap,
  'philippines-island-journey':               PhilippinesRouteMap,
  'california-american-west':                 AmericanWestRouteMap,
  'california-american-west-16-days':         AmericanWestRouteMap,
  'california-american-west-12-days':         AmericanWest12DaysRouteMap,
  'california-american-west-8-days':          AmericanWest8DaysRouteMap,
  'northern-england-roadtrip':                NorthernEnglandRouteMap,
  'tuscany-wine-roads-in-7-days':             TuscanyRouteMap,
  'croatia-by-sea-dubrovnik-hvar-and-split':  CroatiaRouteMap,
};

// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────
const SERIF = "'Playfair Display', Georgia, serif";
const TEAL  = '#1B6B65';
const GOLD  = '#C9A96E';
const STONE = '#FAFAF8';
const CHAR  = '#1C1A16';
const MUTED = '#6B6156';
const BORDER = '#E8E3DA';
const LIGHT = '#F4F1EC';

const TABS = [
  { id: 'overview', label: 'Overview',    Icon: BookOpen },
  { id: 'days',     label: 'Day by Day',  Icon: Calendar },
  { id: 'map',      label: 'Map',         Icon: Map      },
  { id: 'notes',    label: 'Notes',       Icon: FileText },
  { id: 'bookings', label: 'Bookings',    Icon: Bookmark },
  { id: 'pdf',      label: 'PDF',         Icon: Download },
];

const ITEM_TYPES = [
  { value: 'attraction', label: 'Place to Visit' },
  { value: 'restaurant', label: 'Restaurant'     },
  { value: 'hotel',      label: 'Hotel / Stay'   },
  { value: 'transfer',   label: 'Transfer'       },
  { value: 'flight',     label: 'Flight'         },
  { value: 'event',      label: 'Event'          },
  { value: 'break',      label: 'Free Time'      },
  { value: 'note',       label: 'Note / Reminder'},
  { value: 'booking',    label: 'Booking'        },
  { value: 'other',      label: 'Other'          },
];

const BOOKING_CATEGORIES = [
  { value: 'hotel',      label: 'Hotel'      },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'experience', label: 'Experience' },
  { value: 'flight',     label: 'Flight'     },
  { value: 'transfer',   label: 'Transfer'   },
  { value: 'event',      label: 'Event'      },
  { value: 'other',      label: 'Other'      },
];

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────
function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatShortDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function normalizeDay(d) {
  if (!d) return null;
  return {
    dayNumber:   d.dayNumber   || d.day          || 0,
    title:       d.title       || '',
    description: d.desc        || d.description  || '',
    bullets:     d.bullets     || d.highlights   || [],
    tip:         d.tip         || d.insiderTip   || '',
    img:         d.img         || d.image        || null,
  };
}

function parseContent(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') { try { return JSON.parse(raw); } catch { return {}; } }
  return typeof raw === 'object' ? raw : {};
}

function getHeroImage(trip, itinerary, assets) {
  if (trip?.heroImage) return trip.heroImage;
  const heroAsset = assets?.find(a => a.assetType === 'hero');
  if (heroAsset) return heroAsset.url;
  if (itinerary?.coverImage) return itinerary.coverImage;
  if (trip?.coverImage) return trip.coverImage;
  return null;
}

function getDayImage(dayNumber, assets) {
  if (!assets) return null;
  const match = assets.find(a =>
    a.assetType === 'day' && Number(a.dayNumber) === dayNumber
  );
  return match?.url || null;
}

// Returns dayNumber (1-based) given a booking date string and trip startDate string.
// Returns null if either is missing or if booking is before start.
function calcDayNumber(bookingDateStr, startDateStr) {
  if (!bookingDateStr || !startDateStr) return null;
  const booking = new Date(bookingDateStr.slice(0, 10) + 'T00:00:00Z');
  const start   = new Date(startDateStr.slice(0, 10)   + 'T00:00:00Z');
  const diff = Math.round((booking.getTime() - start.getTime()) / 86400000);
  return diff < 0 ? null : diff + 1;
}

// ─────────────────────────────────────────────
// Primitive UI
// ─────────────────────────────────────────────
// onRequestClose: called when user clicks X or presses Escape — caller decides whether to confirm
function Modal({ open, onRequestClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const esc = e => { if (e.key === 'Escape') onRequestClose?.(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [open, onRequestClose]);

  if (!open) return null;
  return (
    // backdrop does NOT close the modal — prevents accidental data loss
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(28,26,22,0.5)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div style={{
        background: 'white',
        borderRadius: '16px 16px 0 0',
        padding: '28px 24px 40px',
        width: '100%',
        maxWidth: wide ? '680px' : '520px',
        maxHeight: '85vh',
        overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, lineHeight: '1.3' }}>
            {title}
          </h3>
          <button
            onClick={onRequestClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: MUTED }}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ marginBottom: '18px' }}>
      <label style={{
        display: 'block', fontSize: '10.5px', fontWeight: '700',
        letterSpacing: '1.8px', textTransform: 'uppercase',
        color: TEAL, marginBottom: '8px',
      }}>
        {label}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '11px 14px',
  border: `1px solid ${BORDER}`, borderRadius: '6px',
  fontSize: '14px', color: CHAR, background: 'white',
  outline: 'none', fontFamily: 'Inter, system-ui, sans-serif',
  boxSizing: 'border-box',
};

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  padding: '12px 24px', background: TEAL, color: 'white',
  border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
  letterSpacing: '0.3px', cursor: 'pointer', transition: 'background 0.15s',
};

const btnSecondary = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  padding: '12px 20px', background: 'transparent', color: MUTED,
  border: `1px solid ${BORDER}`, borderRadius: '6px', fontSize: '13px', fontWeight: '600',
  cursor: 'pointer', transition: 'all 0.15s',
};

// ─────────────────────────────────────────────
// WorkspaceNav — sticky horizontal scrollable tab bar (all screen sizes)
// ─────────────────────────────────────────────
function WorkspaceNav({ activeTab, onChange }) {
  return (
    <nav style={{
      position: 'sticky', top: '64px', zIndex: 100,
      background: 'rgba(250,250,248,0.95)',
      backdropFilter: 'blur(8px)',
      borderBottom: `1px solid ${BORDER}`,
    }}>
      <div style={{
        maxWidth: '960px', margin: '0 auto',
        display: 'flex',
        // overflowY: hidden is the critical fix:
        // without it, a touch with any vertical component makes the
        // overflow-x:auto container try to respond vertically, causing the
        // visible horizontal jump. Clamping Y to hidden passes vertical scroll
        // straight through to the page.
        overflowX: 'auto',
        overflowY: 'hidden',
        // Tell the browser this container owns horizontal panning only
        touchAction: 'pan-x',
        overscrollBehaviorX: 'contain',
        WebkitOverflowScrolling: 'touch',
        padding: '0 20px',
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        {TABS.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => onChange(id)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '14px 16px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '13px', fontWeight: active ? '700' : '500',
                color: active ? TEAL : MUTED,
                borderBottom: active ? `2px solid ${TEAL}` : '2px solid transparent',
                whiteSpace: 'nowrap', transition: 'color 0.15s',
                marginBottom: '-1px',
                flexShrink: 0,
              }}
            >
              <Icon size={14} />
              {label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// MobileNav removed — horizontal tab bar now covers all screen sizes.

// ─────────────────────────────────────────────
// TripDetailsModal — edit personal trip fields
// ─────────────────────────────────────────────
function TripDetailsModal({ workspace, open, onClose, onSave, saving }) {
  const { trip } = workspace;
  const [form, setForm] = useState({
    startDate: trip.startDate ? trip.startDate.slice(0, 10) : '',
    endDate:   trip.endDate   ? trip.endDate.slice(0, 10)   : '',
    travellers:          trip.travellers           || '',
    accommodationSummary: trip.accommodationSummary || '',
    arrivalInfo:          trip.arrivalInfo          || '',
    departureInfo:        trip.departureInfo        || '',
    generalNotes:         trip.generalNotes         || '',
  });
  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }
  function isDirty() {
    return form.startDate || form.endDate || form.travellers || form.accommodationSummary ||
           form.arrivalInfo || form.departureInfo || form.generalNotes;
  }
  function requestClose() {
    if (isDirty() && !window.confirm('Discard changes?')) return;
    onClose();
  }

  return (
    <Modal open={open} onRequestClose={requestClose} title="Your trip details" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <FormField label="Departure date">
          <input type="date" value={form.startDate} onChange={e => set('startDate', e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="Return date">
          <input type="date" value={form.endDate} onChange={e => set('endDate', e.target.value)} style={inputStyle} />
        </FormField>
      </div>
      <FormField label="Number of travellers">
        <input type="number" min="1" max="50" value={form.travellers} onChange={e => set('travellers', e.target.value)} placeholder="e.g. 2" style={inputStyle} />
      </FormField>
      <FormField label="Accommodation summary">
        <input type="text" value={form.accommodationSummary} onChange={e => set('accommodationSummary', e.target.value)} placeholder="e.g. Mix of boutique hotels and riads" style={inputStyle} />
      </FormField>
      <FormField label="Arrival flight">
        <input type="text" value={form.arrivalInfo} onChange={e => set('arrivalInfo', e.target.value)} placeholder="e.g. LIS–MAR, Air France AF1234, 09:40" style={inputStyle} />
      </FormField>
      <FormField label="Departure flight">
        <input type="text" value={form.departureInfo} onChange={e => set('departureInfo', e.target.value)} placeholder="e.g. MAR–LIS, Air France AF1235, 17:20" style={inputStyle} />
      </FormField>
      <FormField label="General notes">
        <textarea value={form.generalNotes} onChange={e => set('generalNotes', e.target.value)} placeholder="Anything useful to remember..." rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button style={btnSecondary} onClick={requestClose}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving}>
          {saving ? 'Saving...' : 'Save details'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// PersonalOverviewModal — edit all personal trip fields
// ─────────────────────────────────────────────
function PersonalOverviewModal({ workspace, tripId, open, onClose, onSave, saving }) {
  const { trip } = workspace;
  const api = useApi();
  const coverInputRef = useRef(null);
  const [form, setForm] = useState({});
  const [highlightInput, setHighlightInput] = useState('');
  const [coverUploading, setCoverUploading] = useState(false);
  const [coverError, setCoverError] = useState('');

  useEffect(() => {
    if (open) {
      setForm({
        title:               trip.title               || '',
        destination:         trip.destination         || '',
        country:             trip.country             || '',
        subtitle:            trip.subtitle            || '',
        overview:            trip.overview            || '',
        startDate:           trip.startDate ? trip.startDate.slice(0, 10) : '',
        endDate:             trip.endDate   ? trip.endDate.slice(0, 10)   : '',
        travellers:          trip.travellers           || '',
        accommodationSummary: trip.accommodationSummary || '',
        arrivalInfo:          trip.arrivalInfo          || '',
        departureInfo:        trip.departureInfo        || '',
        generalNotes:         trip.generalNotes         || '',
        heroImage:            trip.heroImage            || null,
        highlights:           Array.isArray(trip.highlights) ? [...trip.highlights] : [],
      });
      setHighlightInput('');
      setCoverError('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(key, val) { setForm(f => ({ ...f, [key]: val })); }

  function addHighlight() {
    const h = highlightInput.trim();
    if (!h) return;
    setForm(f => ({ ...f, highlights: [...(f.highlights || []), h] }));
    setHighlightInput('');
  }

  function removeHighlight(i) {
    setForm(f => ({ ...f, highlights: f.highlights.filter((_, idx) => idx !== i) }));
  }

  function requestClose() {
    if (!window.confirm('Discard changes?')) return;
    onClose();
  }

  async function handleCoverFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { setCoverError('Image must be smaller than 8 MB.'); return; }
    setCoverError('');
    setCoverUploading(true);
    e.target.value = '';
    try {
      const base64Data = await new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = ev => res(ev.target.result.split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });
      const resp = await api.post(`/api/trips?id=${tripId}&action=cover-image-upload`, { base64Data, filename: file.name });
      if (!resp.ok) { const d = await resp.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
      const { url } = await resp.json();
      setForm(f => ({ ...f, heroImage: url }));
    } catch (err) {
      setCoverError(err.message || 'Upload failed. Please try again.');
    } finally {
      setCoverUploading(false);
    }
  }

  return (
    <Modal open={open} onRequestClose={requestClose} title="Edit trip details" wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <FormField label="Trip Name *">
          <input value={form.title || ''} onChange={e => set('title', e.target.value)} placeholder="My Summer Trip" style={inputStyle} autoFocus />
        </FormField>
        <FormField label="Destination *">
          <input value={form.destination || ''} onChange={e => set('destination', e.target.value)} placeholder="Lisbon, Portugal" style={inputStyle} />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <FormField label="Country">
          <input value={form.country || ''} onChange={e => set('country', e.target.value)} placeholder="Portugal" style={inputStyle} />
        </FormField>
        <FormField label="Number of travellers">
          <input type="number" min="1" max="50" value={form.travellers || ''} onChange={e => set('travellers', e.target.value)} placeholder="e.g. 2" style={inputStyle} />
        </FormField>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <FormField label="Start Date">
          <input type="date" value={form.startDate || ''} onChange={e => set('startDate', e.target.value)} style={inputStyle} />
        </FormField>
        <FormField label="End Date">
          <input type="date" value={form.endDate || ''} min={form.startDate || undefined} onChange={e => set('endDate', e.target.value)} style={inputStyle} />
        </FormField>
      </div>
      <FormField label="Subtitle">
        <input value={form.subtitle || ''} onChange={e => set('subtitle', e.target.value)} placeholder="A short tagline" style={inputStyle} />
      </FormField>
      <FormField label="Overview">
        <textarea value={form.overview || ''} onChange={e => set('overview', e.target.value)} placeholder="Describe your trip…" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      <FormField label="Cover image">
        <input ref={coverInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleCoverFileSelect} disabled={coverUploading} />
        {form.heroImage ? (
          <div>
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <img
                src={form.heroImage}
                alt="Cover preview"
                style={{ width: '100%', maxHeight: '160px', objectFit: 'cover', borderRadius: '8px', border: `1px solid ${BORDER}`, display: 'block' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverUploading} style={{ ...btnSecondary, padding: '7px 14px', fontSize: '13px' }}>
                {coverUploading ? 'Uploading…' : 'Change image'}
              </button>
              <button type="button" onClick={() => { setForm(f => ({ ...f, heroImage: null })); setCoverError(''); }} disabled={coverUploading}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', color: MUTED, padding: 0 }}>
                Remove
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button type="button" onClick={() => coverInputRef.current?.click()} disabled={coverUploading} style={{ ...btnSecondary, padding: '7px 14px', fontSize: '13px' }}>
              {coverUploading ? 'Uploading…' : 'Upload image'}
            </button>
            {coverUploading && <span style={{ fontSize: '13px', color: MUTED }}>Please wait…</span>}
          </div>
        )}
        {coverError && <p style={{ fontSize: '12px', color: '#B04040', marginTop: '6px' }}>{coverError}</p>}
      </FormField>
      <FormField label="Highlights">
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            value={highlightInput}
            onChange={e => setHighlightInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHighlight(); } }}
            placeholder="Add a highlight and press Enter"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={addHighlight} style={{ ...btnSecondary, padding: '10px 14px', flexShrink: 0 }}>
            Add
          </button>
        </div>
        {(form.highlights || []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {(form.highlights || []).map((h, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: LIGHT, borderRadius: '4px' }}>
                <span style={{ flex: 1, fontSize: '13px', color: CHAR }}>{h}</span>
                <button type="button" onClick={() => removeHighlight(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '2px' }}>
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </FormField>
      <FormField label="Accommodation summary">
        <input value={form.accommodationSummary || ''} onChange={e => set('accommodationSummary', e.target.value)} placeholder="e.g. Mix of boutique hotels" style={inputStyle} />
      </FormField>
      <FormField label="Arrival info">
        <input value={form.arrivalInfo || ''} onChange={e => set('arrivalInfo', e.target.value)} placeholder="e.g. LIS–MAR, AF1234, 09:40" style={inputStyle} />
      </FormField>
      <FormField label="Departure info">
        <input value={form.departureInfo || ''} onChange={e => set('departureInfo', e.target.value)} placeholder="e.g. MAR–LIS, AF1235, 17:20" style={inputStyle} />
      </FormField>
      <FormField label="General notes">
        <textarea value={form.generalNotes || ''} onChange={e => set('generalNotes', e.target.value)} placeholder="Anything useful to remember…" rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button style={btnSecondary} onClick={requestClose}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving}>
          {saving ? 'Saving...' : 'Save changes'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// ItemModal — add or edit a custom TripItem
// ─────────────────────────────────────────────
function ItemModal({ open, dayNumber, editItem, onClose, onSave, saving }) {
  const isEdit = !!editItem;
  const EMPTY = { type: 'attraction', title: '', time: '', locationName: '', durationMinutes: '', notes: '', imageUrl: null, imageAlt: '', imageFile: null, imagePreview: null };
  const [form, setForm] = useState(EMPTY);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setForm(isEdit ? {
        type:            editItem.type            || 'attraction',
        title:           editItem.title           || '',
        time:            editItem.time || editItem.startTime || '',
        locationName:    editItem.locationName    || '',
        durationMinutes: editItem.durationMinutes != null ? String(editItem.durationMinutes) : '',
        notes:           editItem.notes           || '',
        imageUrl:        editItem.imageUrl        || null,
        imageAlt:        editItem.imageAlt        || '',
        imageFile:       null,
        imagePreview:    null,
      } : EMPTY);
    }
  }, [open, editItem]);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function isDirty() { return form.title || form.locationName || form.notes || form.time; }
  function requestClose() {
    if (!isEdit && isDirty() && !window.confirm('Discard changes?')) return;
    onClose();
  }

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert('Image must be smaller than 5 MB.'); return; }
    const preview = URL.createObjectURL(file);
    setForm(f => ({ ...f, imageFile: file, imagePreview: preview, imageUrl: null }));
    e.target.value = '';
  }

  function handleRemoveImage() {
    setForm(f => ({ ...f, imageFile: null, imagePreview: null, imageUrl: null, imageAlt: '' }));
  }

  const previewSrc = form.imagePreview || form.imageUrl;

  return (
    <Modal open={open} onRequestClose={requestClose} title={isEdit ? 'Edit item' : `Add to Day ${dayNumber || ''}`}>
      <FormField label="Type">
        <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
          {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </FormField>
      <FormField label="Name / Title">
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Djemaa el-Fna" style={inputStyle} autoFocus />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <FormField label="Time (optional)">
          <input type="text" value={form.time} onChange={e => set('time', e.target.value)} placeholder="10:00" style={inputStyle} />
        </FormField>
        <FormField label="Duration (min)">
          <input type="number" min="0" value={form.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} placeholder="90" style={inputStyle} />
        </FormField>
      </div>
      <FormField label="Location (optional)">
        <input type="text" value={form.locationName} onChange={e => set('locationName', e.target.value)} placeholder="e.g. Marrakech medina" style={inputStyle} />
      </FormField>
      <FormField label="Notes (optional)">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any details..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      <FormField label="Photo (optional)">
        <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileSelect} />
        {previewSrc ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            <img src={previewSrc} alt={form.imageAlt || form.title || 'Preview'} style={{ width: '96px', height: '72px', objectFit: 'cover', borderRadius: '6px', border: `1px solid ${BORDER}`, flexShrink: 0 }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...btnSecondary, padding: '5px 12px', fontSize: '12px' }}>Change</button>
              <button type="button" onClick={handleRemoveImage} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: MUTED, textAlign: 'left', padding: 0 }}>Remove</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => fileInputRef.current?.click()} style={{ ...btnSecondary, padding: '7px 14px', fontSize: '13px' }}>
            Upload photo
          </button>
        )}
        {previewSrc && (
          <input
            type="text"
            value={form.imageAlt}
            onChange={e => set('imageAlt', e.target.value)}
            placeholder={form.title || 'Describe the photo'}
            style={{ ...inputStyle, marginTop: '8px' }}
          />
        )}
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button style={btnSecondary} onClick={requestClose}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving || !form.title.trim()}>
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Add item'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// AddNoteModal
// ─────────────────────────────────────────────
function AddNoteModal({ open, dayNumber, onClose, onSave, saving, editNote }) {
  const [form, setForm] = useState({ title: '', content: '' });
  useEffect(() => {
    if (open) setForm({ title: editNote?.title || '', content: editNote?.content || '' });
  }, [open, editNote]);
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function requestClose() {
    if (form.content && !window.confirm('Discard changes?')) return;
    onClose();
  }

  return (
    <Modal open={open} onRequestClose={requestClose} title={editNote ? 'Edit note' : dayNumber ? `Note for Day ${dayNumber}` : 'Add note'}>
      <FormField label="Title (optional)">
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Things to pack" style={inputStyle} />
      </FormField>
      <FormField label="Note">
        <textarea value={form.content} onChange={e => set('content', e.target.value)} placeholder="Write your note..." rows={5} style={{ ...inputStyle, resize: 'vertical' }} autoFocus />
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button style={btnSecondary} onClick={requestClose}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving || !form.content.trim()}>
          {saving ? 'Saving...' : editNote ? 'Update note' : 'Save note'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// BookingModal — type-adaptive, supports create + edit
// ─────────────────────────────────────────────
const BOOKING_DEFAULTS = { type: 'hotel', title: '', date: '', time: '', locationName: '', provider: '', confirmationReference: '', notes: '', url: '', meta: {} };

// Map ItineraryDayStop.type → TripBooking.type
const STOP_BOOKING_TYPE_MAP = {
  restaurant: 'restaurant', hotel: 'hotel', transfer: 'transfer',
  winery: 'experience', experience: 'experience', museum: 'experience',
  attraction: 'experience', viewpoint: 'experience', beach: 'experience',
  walk: 'experience', free_time: 'other',
};
function stopTypeToBookingType(t) { return STOP_BOOKING_TYPE_MAP[t] || 'other'; }

// Calculate a YYYY-MM-DD date from tripStartDate + (dayNumber-1) days
function dayNumberToDate(tripStartDate, dayNumber) {
  if (!tripStartDate || !dayNumber) return '';
  try {
    const d = new Date(tripStartDate + 'T00:00:00');
    d.setUTCDate(d.getUTCDate() + (dayNumber - 1));
    return d.toISOString().slice(0, 10);
  } catch { return ''; }
}

function initBookingForm(booking, stopCtx, dayNumber, tripStartDate) {
  if (booking) {
    const meta = (booking.metadata && typeof booking.metadata === 'object') ? booking.metadata : {};
    return {
      type: booking.type || 'hotel',
      title: booking.title || '',
      date: booking.date ? String(booking.date).slice(0, 10) : '',
      time: booking.time || '',
      locationName: booking.locationName || '',
      provider: booking.provider || '',
      confirmationReference: booking.confirmationReference || '',
      notes: booking.notes || '',
      url: booking.url || '',
      meta,
    };
  }
  // New booking — prefill from stop context if available
  return {
    ...BOOKING_DEFAULTS,
    type:         stopCtx ? stopTypeToBookingType(stopCtx.type) : 'hotel',
    title:        stopCtx?.title || '',
    locationName: stopCtx?.locationName || stopCtx?.title || '',
    date:         dayNumberToDate(tripStartDate, dayNumber),
    meta:         {},
  };
}

// ─────────────────────────────────────────────
// Booking validation — runs client-side before submit
// ─────────────────────────────────────────────
function validateBookingForm(form) {
  const errs = {};
  const m = form.meta || {};

  if (form.type === 'hotel') {
    if (!m.checkInDate)  errs.checkInDate  = 'Check-in date is required.';
    if (!m.checkOutDate) errs.checkOutDate = 'Check-out date is required.';
    if (m.checkInDate && m.checkOutDate) {
      if (m.checkOutDate < m.checkInDate)
        errs.checkOutDate = 'Check-out must be after check-in.';
      else if (m.checkOutDate === m.checkInDate && m.checkInTime && m.checkOutTime) {
        if (m.checkOutTime <= m.checkInTime)
          errs.checkOutTime = 'Same-day check-out must be later than check-in time.';
      }
    }
  }

  if (form.type === 'event') {
    const st = form.time, et = m.endTime;
    if (st && et && et <= st)
      errs.endTime = 'End time must be after start time.';
  }

  if (form.type === 'flight') {
    const { departureDate: dd, arrivalDate: ad, departureTime: dt, arrivalTime: at } = m;
    if (dd && ad && dt && at && dd === ad && at <= dt)
      errs.arrivalTime = 'Same-day arrival time must be after departure time.';
  }

  return errs;
}

// Inline field error
function FieldError({ msg }) {
  if (!msg) return null;
  return <p style={{ fontSize: '11.5px', color: '#B04040', marginTop: '4px', lineHeight: 1.4 }}>{msg}</p>;
}

// ─────────────────────────────────────────────
// BookingModal — type-adaptive, supports create + edit
// ─────────────────────────────────────────────
function BookingModal({ open, dayNumber, editBooking, stopCtx, availableDays, itineraryDayStops, tripItems, onClose, onSave, saving, tripStartDate, tripEndDate }) {
  const [form,              setForm]              = useState(BOOKING_DEFAULTS);
  const [linkedStopId,      setLinkedStopId]      = useState(null);   // itineraryDayStop.id
  const [linkedTripItemId,  setLinkedTripItemId]  = useState(null);   // TripItem.id
  const [linkedDayNum,      setLinkedDayNum]      = useState(null);

  useEffect(() => {
    if (!open) return;
    setForm(initBookingForm(editBooking, stopCtx, dayNumber, tripStartDate));
    if (stopCtx?.stopId) {
      setLinkedStopId(stopCtx.stopId);
      setLinkedTripItemId(null);
      setLinkedDayNum(dayNumber ?? stopCtx.dayNumber ?? null);
    } else if (editBooking?.tripItemId) {
      setLinkedStopId(null);
      setLinkedTripItemId(editBooking.tripItemId);
      setLinkedDayNum(editBooking.dayNumber ?? null);
    } else if (editBooking?.metadata?.itineraryDayStopId) {
      setLinkedStopId(editBooking.metadata.itineraryDayStopId);
      setLinkedTripItemId(null);
      setLinkedDayNum(editBooking.dayNumber ?? null);
    } else {
      setLinkedStopId(null);
      setLinkedTripItemId(null);
      setLinkedDayNum(dayNumber ?? null);
    }
  }, [open, editBooking, stopCtx, dayNumber, tripStartDate]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function setMeta(k, v) { setForm(f => ({ ...f, meta: { ...f.meta, [k]: v } })); }
  function isDirty() { return form.title || form.locationName || form.notes; }
  function requestClose() {
    if (isDirty() && !window.confirm('Discard changes?')) return;
    onClose();
  }
  function handleTypeChange(t) { setForm(f => ({ ...f, type: t, meta: {} })); }

  // Live validation — errors shown as user edits
  const errors = validateBookingForm(form);
  const hasErrors = Object.keys(errors).length > 0;

  // Derive the booking's primary date (for day hint)
  const primaryDate = form.type === 'hotel'
    ? (form.meta.checkInDate || form.date)
    : form.type === 'flight'
    ? (form.meta.departureDate || form.date)
    : form.date;

  // Day hint: compute dayNumber from trip start date
  const hintDayNumber = calcDayNumber(primaryDate, tripStartDate);
  const isBeforeTrip = primaryDate && tripStartDate && primaryDate < tripStartDate.slice(0, 10);
  const isAfterTrip  = primaryDate && tripEndDate   && primaryDate > tripEndDate.slice(0, 10);
  // When user has manually linked to a specific day, adjust hint messaging
  const dayHint = linkedDayNum != null
    ? (isBeforeTrip || isAfterTrip
        ? `Date is outside trip range, but linked to Day ${linkedDayNum}.`
        : `Linked to Day ${linkedDayNum}.`)
    : !primaryDate ? null
    : !tripStartDate ? null
    : isBeforeTrip  ? 'This booking is before your trip.'
    : isAfterTrip   ? 'This booking is after your trip.'
    : hintDayNumber ? `This will appear on Day ${hintDayNumber}.`
    : null;

  function handleSave() {
    if (hasErrors || !form.title.trim()) return;
    let finalDate = primaryDate || form.date;
    let finalTime = form.type === 'hotel'
      ? (form.meta.checkInTime || form.time)
      : form.type === 'flight'
      ? (form.meta.departureTime || form.time)
      : form.time;
    // Persist linked itinerary stop in metadata (merge safely, don't wipe existing keys)
    const finalMeta = { ...form.meta };
    if (linkedStopId) {
      finalMeta.itineraryDayStopId = linkedStopId;
      finalMeta.source = 'itineraryDayStop';
    } else {
      delete finalMeta.itineraryDayStopId;
      delete finalMeta.source;
    }
    // Resolve tripDayId for the manually selected day
    const selectedTripDay = linkedDayNum != null
      ? (availableDays || []).find(d => d.dayNumber === linkedDayNum)
      : null;
    onSave({
      ...form,
      date: finalDate,
      time: finalTime,
      metadata: finalMeta,
      // Pass explicit day + item link so API uses them directly
      dayNumber:    linkedDayNum      ?? null,
      tripDayId:    selectedTripDay?.id ?? null,
      tripItemId:   linkedTripItemId  ?? null,
    });
  }

  const isEdit = !!editBooking;
  const modalTitle = isEdit
    ? `Edit ${BOOKING_CATEGORIES.find(c => c.value === form.type)?.label || form.type}`
    : dayNumber ? `Add booking — Day ${dayNumber}` : 'Add booking';

  return (
    <Modal open={open} onRequestClose={requestClose} title={modalTitle} wide>
      {/* Type selector */}
      <FormField label="Type">
        <select value={form.type} onChange={e => handleTypeChange(e.target.value)} style={inputStyle}>
          {BOOKING_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </FormField>

      {/* ── Hotel ─────────────────────────────────────────────── */}
      {form.type === 'hotel' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="Check-in date *">
              <input type="date" value={form.meta.checkInDate || ''} onChange={e => setMeta('checkInDate', e.target.value)} style={inputStyle} />
              <FieldError msg={errors.checkInDate} />
            </FormField>
            <FormField label="Check-out date *">
              <input type="date" value={form.meta.checkOutDate || ''} onChange={e => setMeta('checkOutDate', e.target.value)} style={inputStyle} />
              <FieldError msg={errors.checkOutDate} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="Check-in time (optional)">
              <input type="time" value={form.meta.checkInTime || ''} onChange={e => setMeta('checkInTime', e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Check-out time (optional)">
              <input type="time" value={form.meta.checkOutTime || ''} onChange={e => setMeta('checkOutTime', e.target.value)} style={inputStyle} />
              <FieldError msg={errors.checkOutTime} />
            </FormField>
          </div>
        </>
      )}

      {/* ── Restaurant ────────────────────────────────────────── */}
      {form.type === 'restaurant' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label="Reservation date">
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
          </FormField>
          <FormField label="Reservation time">
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={inputStyle} />
          </FormField>
        </div>
      )}

      {/* ── Experience ────────────────────────────────────────── */}
      {form.type === 'experience' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label="Date">
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
          </FormField>
          <FormField label="Start time (optional)">
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={inputStyle} />
          </FormField>
        </div>
      )}

      {/* ── Flight ────────────────────────────────────────────── */}
      {form.type === 'flight' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="Departure date">
              <input type="date" value={form.meta.departureDate || ''} onChange={e => setMeta('departureDate', e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Departure time">
              <input type="time" value={form.meta.departureTime || ''} onChange={e => setMeta('departureTime', e.target.value)} style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="Arrival date (optional)">
              <input type="date" value={form.meta.arrivalDate || ''} onChange={e => setMeta('arrivalDate', e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Arrival time (optional)">
              <input type="time" value={form.meta.arrivalTime || ''} onChange={e => setMeta('arrivalTime', e.target.value)} style={inputStyle} />
              <FieldError msg={errors.arrivalTime} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="From (airport)">
              <input type="text" value={form.meta.from || ''} onChange={e => setMeta('from', e.target.value)} placeholder="LIS" style={inputStyle} />
            </FormField>
            <FormField label="To (airport)">
              <input type="text" value={form.meta.to || ''} onChange={e => setMeta('to', e.target.value)} placeholder="MAD" style={inputStyle} />
            </FormField>
          </div>
        </>
      )}

      {/* ── Transfer ──────────────────────────────────────────── */}
      {form.type === 'transfer' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="Date">
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Pickup time">
              <input type="time" value={form.meta.pickupTime || ''} onChange={e => setMeta('pickupTime', e.target.value)} style={inputStyle} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="Pickup location">
              <input type="text" value={form.meta.pickupLocation || ''} onChange={e => setMeta('pickupLocation', e.target.value)} placeholder="Hotel or address" style={inputStyle} />
            </FormField>
            <FormField label="Drop-off location">
              <input type="text" value={form.meta.dropoffLocation || ''} onChange={e => setMeta('dropoffLocation', e.target.value)} placeholder="Airport or address" style={inputStyle} />
            </FormField>
          </div>
        </>
      )}

      {/* ── Event ─────────────────────────────────────────────── */}
      {form.type === 'event' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
            <FormField label="Date">
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
            </FormField>
            <FormField label="Start time">
              <input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={inputStyle} />
            </FormField>
          </div>
          <FormField label="End time (optional)">
            <input type="time" value={form.meta.endTime || ''} onChange={e => setMeta('endTime', e.target.value)} style={inputStyle} />
            <FieldError msg={errors.endTime} />
          </FormField>
        </>
      )}

      {/* ── Other ─────────────────────────────────────────────── */}
      {form.type === 'other' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label="Date (optional)">
            <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
          </FormField>
          <FormField label="Time (optional)">
            <input type="time" value={form.time} onChange={e => set('time', e.target.value)} style={inputStyle} />
          </FormField>
        </div>
      )}

      {/* ── Common fields ──────────────────────────────────────── */}
      <FormField label="Name / Title">
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)}
          placeholder={form.type === 'hotel' ? 'Hotel name' : form.type === 'flight' ? 'Airline + flight no.' : form.type === 'restaurant' ? 'Restaurant name' : 'Name or title'}
          style={inputStyle} autoFocus />
      </FormField>
      {form.type !== 'transfer' && form.type !== 'flight' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label="Location">
            <input type="text" value={form.locationName} onChange={e => set('locationName', e.target.value)} placeholder="City or address" style={inputStyle} />
          </FormField>
          <FormField label="Provider / Platform">
            <input type="text" value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="e.g. Booking.com" style={inputStyle} />
          </FormField>
        </div>
      )}
      {form.type === 'flight' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
          <FormField label="Airline / Provider">
            <input type="text" value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="Air France" style={inputStyle} />
          </FormField>
          <FormField label="Flight number">
            <input type="text" value={form.confirmationReference} onChange={e => set('confirmationReference', e.target.value)} placeholder="AF1234" style={inputStyle} />
          </FormField>
        </div>
      )}
      {form.type !== 'flight' && (
        <FormField label="Confirmation / Reference (optional)">
          <input type="text" value={form.confirmationReference} onChange={e => set('confirmationReference', e.target.value)} placeholder="#ABC123" style={inputStyle} />
        </FormField>
      )}
      {form.type === 'experience' && (
        <FormField label="Duration (minutes, optional)">
          <input type="number" min="0" value={form.meta.durationMinutes || ''} onChange={e => setMeta('durationMinutes', e.target.value)} placeholder="90" style={inputStyle} />
        </FormField>
      )}
      {form.type === 'restaurant' && (
        <FormField label="Party size (optional)">
          <input type="number" min="1" value={form.meta.partySize || ''} onChange={e => setMeta('partySize', e.target.value)} placeholder="2" style={inputStyle} />
        </FormField>
      )}
      <FormField label="Booking URL (optional)">
        <input type="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." style={inputStyle} />
      </FormField>
      <FormField label="Notes (optional)">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Special requests, contact info, etc." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>

      {/* ── Link to itinerary ──────────────────────────────────── */}
      {stopCtx ? (
        /* Booking opened from a specific stop: show read-only linked-stop banner */
        <div style={{ padding: '10px 14px', background: '#EFF6F5', border: '1px solid #C6E4E0', borderRadius: '6px', marginBottom: '12px' }}>
          <p style={{ fontSize: '12.5px', fontWeight: '600', color: TEAL, marginBottom: '1px' }}>
            Linked to: {stopCtx.title}
          </p>
          {dayNumber && <p style={{ fontSize: '12px', color: MUTED }}>Day {dayNumber}</p>}
        </div>
      ) : (availableDays?.length > 0) && (
        /* No stop context: allow optional link to any day/stop */
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.8px', textTransform: 'uppercase', color: MUTED, marginBottom: '8px' }}>
            Link to itinerary (optional)
          </p>
          {(() => {
            const dayItinStops = (itineraryDayStops || []).filter(s => s.dayNumber === linkedDayNum);
            const dayTripItems = (tripItems || [])
              .filter(i => i.dayNumber === linkedDayNum && !i.isHidden)
              .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
            // Encode select value as "item:{id}" or "stop:{id}" to support both sources
            const stopSelectValue = linkedTripItemId
              ? `item:${linkedTripItemId}`
              : linkedStopId
              ? `stop:${linkedStopId}`
              : '';
            function handlePlaceChange(e) {
              const v = e.target.value;
              if (!v) {
                setLinkedStopId(null); setLinkedTripItemId(null);
              } else if (v.startsWith('item:')) {
                const itemId = v.slice(5);
                setLinkedTripItemId(itemId); setLinkedStopId(null);
                const item = dayTripItems.find(i => i.id === itemId);
                if (item) {
                  if (!form.title)        set('title',        item.title);
                  if (!form.locationName) set('locationName', item.locationName || item.title);
                }
              } else if (v.startsWith('stop:')) {
                const sid = v.slice(5);
                setLinkedStopId(sid); setLinkedTripItemId(null);
                const s = dayItinStops.find(s => s.id === sid);
                if (s) {
                  if (!form.title)        set('title',        s.title);
                  if (!form.locationName) set('locationName', s.locationName || s.title);
                }
              }
            }
            return (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <p style={{ fontSize: '11px', color: MUTED, marginBottom: '4px' }}>Day</p>
                  <select value={linkedDayNum ?? ''} style={inputStyle}
                    onChange={e => {
                      const v = e.target.value ? Number(e.target.value) : null;
                      setLinkedDayNum(v); setLinkedStopId(null); setLinkedTripItemId(null);
                      if (v && tripStartDate) set('date', dayNumberToDate(tripStartDate, v));
                    }}>
                    <option value="">Not linked</option>
                    {(availableDays || []).map(d => <option key={d.dayNumber} value={d.dayNumber}>Day {d.dayNumber}</option>)}
                  </select>
                </div>
                <div>
                  <p style={{ fontSize: '11px', color: MUTED, marginBottom: '4px' }}>Place / stop</p>
                  <select value={stopSelectValue} style={inputStyle} disabled={!linkedDayNum} onChange={handlePlaceChange}>
                    <option value="">No specific stop</option>
                    {dayTripItems.length > 0 && (
                      <optgroup label="Added places">
                        {dayTripItems.map(i => <option key={`item:${i.id}`} value={`item:${i.id}`}>{i.title}</option>)}
                      </optgroup>
                    )}
                    {dayItinStops.length > 0 && (
                      <optgroup label="Itinerary stops">
                        {dayItinStops.map(s => <option key={`stop:${s.id}`} value={`stop:${s.id}`}>{s.title}</option>)}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Day placement hint — warning only when NO explicit day link is set */}
      {dayHint && (
        <p style={{
          fontSize: '12.5px', fontWeight: '500',
          color: (isBeforeTrip || isAfterTrip) && linkedDayNum == null ? '#B5600A' : TEAL,
          background: (isBeforeTrip || isAfterTrip) && linkedDayNum == null ? '#FFF8F0' : '#EFF6F5',
          border: `1px solid ${(isBeforeTrip || isAfterTrip) && linkedDayNum == null ? '#F5D9B8' : '#C6E4E0'}`,
          borderRadius: '6px', padding: '8px 12px', marginBottom: '8px',
        }}>
          {dayHint}
        </p>
      )}
      {!tripStartDate && primaryDate && (
        <p style={{ fontSize: '12px', color: '#B5A09A', marginBottom: '8px' }}>
          Set your travel dates in Trip Details to auto-place this booking.
        </p>
      )}

      {/* Summary of validation errors (if any) */}
      {hasErrors && (
        <div style={{ padding: '10px 14px', background: '#FFF0F0', border: '1px solid #F5C6C6', borderRadius: '6px', marginBottom: '4px' }}>
          {Object.values(errors).map((msg, i) => (
            <p key={i} style={{ fontSize: '12px', color: '#B04040', margin: i > 0 ? '4px 0 0' : 0 }}>• {msg}</p>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button style={btnSecondary} onClick={requestClose}>Cancel</button>
        <button
          style={{ ...btnPrimary, opacity: (hasErrors || !form.title.trim()) ? 0.5 : 1 }}
          onClick={handleSave}
          disabled={saving || hasErrors || !form.title.trim()}
        >
          {saving ? (isEdit ? 'Updating...' : 'Saving...') : (isEdit ? 'Update booking' : 'Save booking')}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// ItemCard — single user-added item
// ─────────────────────────────────────────────
const TYPE_COLORS = {
  place: '#2D7DD2', restaurant: '#D2622D', hotel: TEAL,
  transfer: '#7D5A2D', flight: '#4A2D7D', event: '#2D7D4A',
  break: '#8C8070', note: '#C9A96E',
};

function formatItemTime(item) {
  if (item.startTime && item.endTime) return `${item.startTime} → ${item.endTime}`;
  if (item.time) return item.time;
  return null;
}

function formatDuration(minutes) {
  if (!minutes) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ─────────────────────────────────────────────
// ItemImageLightbox
// ─────────────────────────────────────────────
function ItemImageLightbox({ item, onClose, canEdit, onEdit }) {
  const typeLabel = ITEM_TYPES.find(t => t.value === item.type)?.label || item.type;
  const color = TYPE_COLORS[item.type] || MUTED;

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; };
  }, [onClose]);

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.92)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px' }}
      onClick={onClose}
    >
      <div style={{ position: 'relative', maxWidth: '820px', width: '100%' }} onClick={e => e.stopPropagation()}>
        <button onClick={onClose} style={{ position: 'absolute', top: '-46px', right: 0, background: 'none', border: 'none', cursor: 'pointer', color: 'white', padding: '8px', lineHeight: 1 }}>
          <X size={22} />
        </button>
        <img
          src={item.imageUrl}
          alt={item.imageAlt || item.title}
          style={{ width: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: '8px', display: 'block' }}
        />
        <div style={{ paddingTop: '14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
          <div>
            <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color, marginBottom: '5px' }}>
              {typeLabel}
            </span>
            <p style={{ color: 'white', fontWeight: '600', fontSize: '16px', fontFamily: "'Playfair Display', Georgia, serif" }}>
              {item.title}
            </p>
          </div>
          {canEdit && onEdit && (
            <button
              onClick={() => { onClose(); onEdit(item); }}
              style={{ flexShrink: 0, padding: '8px 18px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.25)', borderRadius: '6px', color: 'white', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
            >
              Edit photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemCard({ item, linkedBookings = [], onDelete, onEdit, onEditBooking, tripName = '', itineraryDayStops = [], canEdit = true }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [imgHovered, setImgHovered] = useState(false);
  const isMobile = useIsMobile();

  const color = TYPE_COLORS[item.type] || MUTED;
  const typeLabel = ITEM_TYPES.find(t => t.value === item.type)?.label || item.type;
  const timeDisplay = formatItemTime(item);
  const durationDisplay = formatDuration(item.durationMinutes);
  const metaParts = [timeDisplay, durationDisplay, item.locationName].filter(Boolean);
  const hasImage = !!item.imageUrl;

  function handleDelete() {
    if (window.confirm(`Remove "${item.title}"?`)) onDelete(item.id);
  }

  const cardContent = (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
        <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color }}>
          {typeLabel}
        </span>
        {item.status && item.status !== 'planned' && (
          <span style={{
            fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.8px',
            textTransform: 'uppercase', padding: '2px 6px',
            borderRadius: '3px', background: item.status === 'done' ? '#EFF6EF' : '#F4F1EC',
            color: item.status === 'done' ? '#4A8F4A' : MUTED,
          }}>
            {item.status}
          </span>
        )}
      </div>
      <p style={{ fontSize: '14px', fontWeight: '600', color: CHAR, marginBottom: metaParts.length ? '4px' : 0 }}>
        {item.title}
      </p>
      {metaParts.length > 0 && (
        <p style={{ fontSize: '12.5px', color: MUTED }}>{metaParts.join(' · ')}</p>
      )}
      {item.notes && (
        <p style={{ fontSize: '13px', color: MUTED, marginTop: '5px', lineHeight: '1.5' }}>{item.notes}</p>
      )}
      {linkedBookings.length > 0 && (
        <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {linkedBookings.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', background: '#F4F0E8', borderRadius: '5px', fontSize: '12.5px' }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: CAT_COLORS[b.type] || MUTED, flexShrink: 0 }} />
              <span style={{ color: CHAR, fontWeight: '500', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {b.time && <span style={{ color: MUTED, marginRight: '5px' }}>{b.time}</span>}
                {b.title}
                {b.confirmationReference && <span style={{ color: '#8C7A60', marginLeft: '6px', fontFamily: 'monospace', fontSize: '11px' }}>#{b.confirmationReference}</span>}
              </span>
              <CalendarDropdown booking={b} tripName={tripName} itineraryDayStops={itineraryDayStops} />
              {canEdit && onEditBooking && (
                <button type="button" onClick={() => onEditBooking(b)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '1px', flexShrink: 0 }}>
                  <Pencil size={11} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );

  const actionButtons = canEdit && (
    <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
      {onEdit && (
        <button onClick={() => onEdit(item)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '2px' }} title="Edit item">
          <Pencil size={13} />
        </button>
      )}
      <button onClick={handleDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8BFB5', padding: '2px' }} title="Remove item">
        <X size={14} />
      </button>
    </div>
  );

  // ── No image: original horizontal layout ──────────────────────
  if (!hasImage) {
    return (
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '8px', borderLeft: `3px solid ${color}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>{cardContent}</div>
        {actionButtons}
      </div>
    );
  }

  // ── With image, mobile: image banner on top ───────────────────
  if (isMobile) {
    return (
      <>
        <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: '8px', borderLeft: `3px solid ${color}`, overflow: 'hidden' }}>
          <div style={{ position: 'relative', paddingBottom: '56.25%', cursor: 'pointer' }} onClick={() => setLightboxOpen(true)}>
            <img
              src={item.imageUrl}
              alt={item.imageAlt || item.title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
            />
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>{cardContent}</div>
            {actionButtons}
          </div>
        </div>
        {lightboxOpen && <ItemImageLightbox item={item} onClose={() => setLightboxOpen(false)} canEdit={canEdit} onEdit={onEdit} />}
      </>
    );
  }

  // ── With image, desktop: image panel on right ─────────────────
  return (
    <>
      <div style={{ display: 'flex', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '8px', borderLeft: `3px solid ${color}`, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '14px 16px', minWidth: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{cardContent}</div>
          {actionButtons}
        </div>
        <div
          style={{ width: '140px', flexShrink: 0, position: 'relative', cursor: 'pointer' }}
          onMouseEnter={() => setImgHovered(true)}
          onMouseLeave={() => setImgHovered(false)}
          onClick={() => setLightboxOpen(true)}
        >
          <img
            src={item.imageUrl}
            alt={item.imageAlt || item.title}
            style={{ width: '100%', height: '100%', minHeight: '90px', objectFit: 'cover', display: 'block' }}
            onError={e => { e.currentTarget.parentElement.style.display = 'none'; }}
          />
          {imgHovered && (
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.32)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase' }}>View photo</span>
            </div>
          )}
        </div>
      </div>
      {lightboxOpen && <ItemImageLightbox item={item} onClose={() => setLightboxOpen(false)} canEdit={canEdit} onEdit={onEdit} />}
    </>
  );
}

// ─────────────────────────────────────────────
// NoteCard
// ─────────────────────────────────────────────
function NoteCard({ note, onDelete, onEdit, canEdit = true }) {
  return (
    <div style={{
      padding: '18px 20px', background: 'white',
      border: `1px solid ${BORDER}`, borderRadius: '10px',
      borderLeft: `3px solid ${GOLD}`,
    }}>
      {note.title && (
        <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
          {note.title}
        </p>
      )}
      <p style={{ fontSize: '14px', color: CHAR, lineHeight: '1.65', whiteSpace: 'pre-wrap' }}>{note.content}</p>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
        <span style={{ fontSize: '11px', color: '#B5A09A' }}>{formatDate(note.createdAt)}</span>
        {canEdit && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => onEdit(note)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Pencil size={12} /> Edit
            </button>
            <button onClick={() => onDelete(note.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8BFB5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Trash2 size={12} /> Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CalendarDropdown — "Add to calendar" action
// ─────────────────────────────────────────────
function CalendarDropdown({ booking, tripName, itineraryDayStops = [] }) {
  const [open, setOpen]   = useState(false);
  const [toast, setToast] = useState('');
  const ref               = useRef(null);
  const { getToken }      = useAuth();
  const readiness         = calendarReadiness(booking);

  useEffect(() => {
    if (!open) return;
    function close(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const disabled = readiness === 'missing';

  function showToast(msg) {
    setToast(msg);
    setTimeout(() => setToast(''), 2200);
  }

  function handleGoogle() {
    const url = buildGoogleCalendarUrl(booking, tripName, itineraryDayStops);
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  }

  async function handleIcs() {
    setOpen(false);
    try {
      const token = await getToken();
      const apiUrl = buildIcsApiUrl(booking.id, token);
      // Navigate via anchor — iOS Safari intercepts text/calendar and shows "Add to Calendar";
      // desktop browsers download the attachment per Content-Disposition header.
      const a = document.createElement('a');
      a.href = apiUrl;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 200);
    } catch {
      // Fallback to client-side blob (desktop only)
      downloadIcsFallback(booking, tripName, itineraryDayStops);
    }
  }

  function handleCopy() {
    const text = buildCopyText(booking, itineraryDayStops);
    navigator.clipboard.writeText(text).catch(() => {});
    showToast('Event details copied.');
    setOpen(false);
  }

  const menuBtn = {
    display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
    fontSize: '13px', color: CHAR, textAlign: 'left',
  };

  return (
    <>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => !disabled && setOpen(o => !o)}
          title={disabled ? 'Add a date and time before sending this booking to your calendar' : 'Add to calendar'}
          style={{
            background: 'none', border: 'none', cursor: disabled ? 'default' : 'pointer',
            color: disabled ? '#C8BFB5' : MUTED, padding: '2px',
            display: 'flex', alignItems: 'center',
          }}
        >
          <CalendarPlus size={12} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', right: 0, top: '100%', marginTop: '4px',
            background: 'white', border: `1px solid ${BORDER}`, borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 200,
            minWidth: '196px', overflow: 'hidden',
          }}>
            <button onClick={handleGoogle} style={menuBtn}
              onMouseEnter={e => e.currentTarget.style.background = STONE}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <ExternalLink size={13} color={TEAL} /> Google Calendar
            </button>
            <button onClick={handleIcs} style={{ ...menuBtn, borderTop: `1px solid ${BORDER}` }}
              onMouseEnter={e => e.currentTarget.style.background = STONE}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Download size={13} color={TEAL} /> Apple / Outlook (.ics)
            </button>
            <button onClick={handleCopy} style={{ ...menuBtn, borderTop: `1px solid ${BORDER}` }}
              onMouseEnter={e => e.currentTarget.style.background = STONE}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Copy size={13} color={TEAL} /> Copy event details
            </button>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
          background: CHAR, color: 'white', padding: '9px 18px', borderRadius: '6px',
          fontSize: '13px', zIndex: 9999, pointerEvents: 'none',
          boxShadow: '0 4px 14px rgba(0,0,0,0.18)',
          whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// BookingCard
// ─────────────────────────────────────────────
const CAT_COLORS = {
  hotel: TEAL, restaurant: '#D2622D', experience: GOLD,
  flight: '#4A2D7D', transfer: '#7D5A2D', event: '#2D7D4A', other: MUTED,
};

function BookingCard({ booking, onDelete, onEdit, itineraryDayStops, tripItems = [], tripName, canEdit = true }) {
  const color = CAT_COLORS[booking.type] || MUTED;
  const catLabel = BOOKING_CATEGORIES.find(c => c.value === booking.type)?.label || booking.type;
  const linkedStop = booking.metadata?.itineraryDayStopId
    ? (itineraryDayStops || []).find(s => s.id === booking.metadata.itineraryDayStopId)
    : null;
  const linkedItem = !linkedStop && booking.tripItemId
    ? (tripItems || []).find(i => i.id === booking.tripItemId)
    : null;
  const linkedPlace = linkedStop || linkedItem;

  return (
    <div style={{
      padding: '18px 20px', background: 'white',
      border: `1px solid ${BORDER}`, borderRadius: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={{
              fontSize: '9.5px', fontWeight: '700', letterSpacing: '1.2px',
              textTransform: 'uppercase', padding: '3px 8px',
              borderRadius: '3px', background: `${color}15`, color,
            }}>
              {catLabel}
            </span>
            {booking.date && (
              <span style={{ fontSize: '12px', color: MUTED }}>{formatShortDate(booking.date)}</span>
            )}
            {booking.dayNumber && (
              <span style={{
                fontSize: '10px', fontWeight: '700', letterSpacing: '0.8px',
                color: TEAL, background: '#EFF6F5',
                padding: '2px 7px', borderRadius: '3px',
              }}>
                Day {booking.dayNumber}
              </span>
            )}
          </div>
          <p style={{ fontSize: '15px', fontWeight: '600', color: CHAR, marginBottom: '4px' }}>{booking.title}</p>
          {linkedPlace && (
            <p style={{ fontSize: '11.5px', color: TEAL, fontWeight: '500', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={10} /> {linkedPlace.title}
            </p>
          )}
          {(booking.locationName || booking.provider) && (
            <p style={{ fontSize: '13px', color: MUTED, marginBottom: '4px' }}>
              {[booking.locationName, booking.provider].filter(Boolean).join(' · ')}
            </p>
          )}
          {booking.confirmationReference && (
            <p style={{ fontSize: '12px', fontFamily: 'monospace', color: TEAL, background: '#EFF6F5', padding: '3px 8px', borderRadius: '3px', display: 'inline-block' }}>
              {booking.confirmationReference}
            </p>
          )}
          {booking.notes && (
            <p style={{ fontSize: '13px', color: MUTED, marginTop: '6px', lineHeight: '1.5' }}>{booking.notes}</p>
          )}
          {booking.url && (
            <a href={booking.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '12px', color: TEAL, marginTop: '6px', display: 'block' }}>
              View booking
            </a>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
          <CalendarDropdown booking={booking} tripName={tripName} itineraryDayStops={itineraryDayStops} />
          {canEdit && (
            <button onClick={() => onEdit(booking)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '2px', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '11px' }} title="Edit booking">
              <Pencil size={12} />
            </button>
          )}
          {canEdit && (
            <button onClick={() => onDelete(booking.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8BFB5', padding: '2px' }} title="Delete booking">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DayBookingItem — booking displayed inside a day
// ─────────────────────────────────────────────
function DayBookingItem({ booking, onEdit, tripName, itineraryDayStops = [], canEdit = true }) {
  const color = CAT_COLORS[booking.type] || MUTED;
  const catLabel = BOOKING_CATEGORIES.find(c => c.value === booking.type)?.label || booking.type;
  const meta = booking.metadata || {};
  const timeDisplay = booking.type === 'hotel'
    ? (meta.checkInDate ? `Check-in ${meta.checkInDate}` : null)
    : booking.type === 'transfer'
    ? (meta.pickupTime || booking.time || null)
    : booking.time || null;

  const transferRoute = booking.type === 'transfer' && (meta.pickupLocation || meta.dropoffLocation)
    ? [meta.pickupLocation, meta.dropoffLocation].filter(Boolean).join(' → ')
    : null;

  return (
    <div style={{
      display: 'flex', gap: '10px', alignItems: 'flex-start',
      padding: '10px 14px', background: 'white',
      border: `1px solid ${BORDER}`, borderRadius: '8px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
          <span style={{ fontSize: '9.5px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color, background: `${color}12`, padding: '2px 6px', borderRadius: '3px' }}>
            {catLabel}
          </span>
          {timeDisplay && <span style={{ fontSize: '11px', color: MUTED }}>{timeDisplay}</span>}
        </div>
        <p style={{ fontSize: '13.5px', fontWeight: '600', color: CHAR }}>{booking.title}</p>
        {transferRoute && <p style={{ fontSize: '12px', color: MUTED }}>{transferRoute}</p>}
        {!transferRoute && booking.locationName && <p style={{ fontSize: '12px', color: MUTED }}>{booking.locationName}</p>}
        {booking.confirmationReference && (
          <p style={{ fontSize: '11px', fontFamily: 'monospace', color: TEAL, marginTop: '2px' }}>{booking.confirmationReference}</p>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
        <CalendarDropdown booking={booking} tripName={tripName} itineraryDayStops={itineraryDayStops} />
        {canEdit && (
          <button onClick={() => onEdit(booking)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '2px' }} title="Edit booking">
            <Pencil size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DaySection — one full day in the timeline
// ─────────────────────────────────────────────

function DaySection({ tripDay, itinDay, itinDayStops = [], dayItems, dayNotes, dayBookings, isLast, assets, onAddItem, onAddNote, onAddBooking, onDeleteItem, onEditItem, onEditBooking, onAddBookingFromStop, onHideStop, onRestoreStop, onRestoreDayStops, hiddenStopIds = [], tripName = '', canEdit = true }) {
  const [expanded,     setExpanded]     = useState(true);
  const [confirmHide,  setConfirmHide]  = useState(null);  // stop object pending confirmation
  const [lastHidden,   setLastHidden]   = useState(null);  // { stopId, stopTitle } for undo

  const title   = tripDay.titleOverride || itinDay?.title || tripDay.title || `Day ${tripDay.dayNumber}`;
  const desc    = tripDay.descriptionOverride || itinDay?.description || tripDay.description || '';
  const bullets = itinDayStops.length > 0 ? [] : (itinDay?.bullets || []);
  const tip     = itinDay?.tip || '';
  const img     = getDayImage(tripDay.dayNumber, assets) || itinDay?.img || null;

  // Stops hidden by user for this day
  const hiddenThisDay = itinDayStops.filter(s => hiddenStopIds.includes(s.id));
  // Visible stops = all stops minus hidden ones
  const visibleStops = itinDayStops.filter(s => !hiddenStopIds.includes(s.id));

  // Undo timeout ref
  const undoTimerRef = useRef(null);

  function triggerHide(stop) {
    const hasBookings = dayBookings.some(b => b.metadata?.itineraryDayStopId === stop.id);
    setConfirmHide({ stop, hasBookings });
  }

  function confirmHideStop() {
    const { stop } = confirmHide;
    setConfirmHide(null);
    onHideStop?.(stop, tripDay);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setLastHidden({ stopId: stop.id, stopTitle: stop.title });
    undoTimerRef.current = setTimeout(() => setLastHidden(null), 6000);
  }

  function handleUndo() {
    if (!lastHidden) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    onRestoreStop?.(lastHidden.stopId);
    setLastHidden(null);
  }

  // Split bookings: linked to a visible itinerary stop, linked to a TripItem, or day-level only
  const stopBookings = {};
  const itemBookings = {};
  const dayOnlyBookings = [];
  dayBookings.forEach(b => {
    const sid = b.metadata?.itineraryDayStopId;
    const iid = b.tripItemId;
    if (sid && visibleStops.some(s => s.id === sid)) {
      // Grouped under its itinerary stop (highest priority)
      (stopBookings[sid] = stopBookings[sid] || []).push(b);
    } else if (iid) {
      // Grouped under its user-added TripItem
      (itemBookings[iid] = itemBookings[iid] || []).push(b);
    } else {
      dayOnlyBookings.push(b);
    }
  });

  if (tripDay.isHidden) return null;

  const pillStyle = {
    display: 'inline-flex', alignItems: 'center', gap: '5px',
    padding: '7px 13px', background: 'white',
    border: `1px solid ${BORDER}`, borderRadius: '20px',
    fontSize: '12px', fontWeight: '600', color: MUTED,
    cursor: 'pointer', transition: 'all 0.15s',
  };

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      {/* Timeline dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: TEAL, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', flexShrink: 0, zIndex: 1 }}>
          {tripDay.dayNumber}
        </div>
        {!isLast && <div style={{ width: '1px', flex: 1, background: BORDER, minHeight: '32px' }} />}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: '40px', minWidth: 0 }}>
        <button onClick={() => setExpanded(e => !e)} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0, width: '100%', marginBottom: '10px' }}>
          <span style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: TEAL }}>Day {tripDay.dayNumber}</span>
          <ChevronDown size={14} color={MUTED} style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', marginLeft: 'auto' }} />
        </button>

        <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: expanded ? '10px' : '0', lineHeight: '1.3' }}>
          {title}
        </h3>

        {expanded && (
          <>
            {desc && <p style={{ fontSize: '15px', color: MUTED, lineHeight: '1.75', marginBottom: (itinDayStops.length || bullets.length) ? '14px' : '0' }}>{desc}</p>}

            {/* Structured itinerary stops — with linked bookings, "Add booking", and "Remove" actions */}
            {itinDayStops.length > 0 && (
              <div style={{ marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED }}>Places today</p>
                  {/* Undo toast */}
                  {lastHidden && (
                    <span style={{ fontSize: '12px', color: MUTED }}>
                      Removed.{' '}
                      <button type="button" onClick={handleUndo} style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEAL, fontWeight: '600', fontSize: '12px', padding: 0 }}>Undo</button>
                    </span>
                  )}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {visibleStops.map((stop, i) => {
                    const linked = stopBookings[stop.id] || [];
                    return (
                      <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#C9A96E', flexShrink: 0, marginTop: '9px' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {/* Stop title + description */}
                          <div style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.6' }}>
                            <strong style={{ color: CHAR, fontWeight: '600' }}>{stop.title}</strong>
                            {stop.description && <span style={{ color: MUTED }}> — {stop.description}</span>}
                            {stop.isOptional && <span style={{ fontSize: '11px', color: '#B5AA99', marginLeft: '8px', fontWeight: '500', letterSpacing: '0.3px' }}>Optional</span>}
                            {stop.suggestedTime && <span style={{ fontSize: '12px', color: '#B5AA99', marginLeft: '6px' }}>{stop.suggestedTime}</span>}
                          </div>
                          {/* Bookings linked to this stop */}
                          {linked.length > 0 && (
                            <div style={{ marginTop: '5px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                              {linked.map(b => (
                                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', background: '#F4F0E8', borderRadius: '5px', fontSize: '12.5px' }}>
                                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: CAT_COLORS[b.type] || MUTED, flexShrink: 0 }} />
                                  <span style={{ color: CHAR, fontWeight: '500', flex: 1, minWidth: 0 }}>
                                    {b.time && <span style={{ color: MUTED, marginRight: '5px' }}>{b.time}</span>}
                                    {b.title}
                                    {b.confirmationReference && <span style={{ color: '#8C7A60', marginLeft: '6px', fontFamily: 'monospace', fontSize: '11px' }}>#{b.confirmationReference}</span>}
                                  </span>
                                  <CalendarDropdown booking={b} tripName={tripName} itineraryDayStops={itinDayStops} />
                                  {canEdit && (
                                    <button type="button" onClick={() => onEditBooking(b)}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, padding: '1px', flexShrink: 0 }}>
                                      <Pencil size={11} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Stop actions */}
                          {canEdit && (
                            <div style={{ display: 'flex', gap: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
                              {onAddBookingFromStop && (
                                <button type="button"
                                  onClick={() => onAddBookingFromStop(stop, tripDay.id, tripDay.dayNumber)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: TEAL, fontSize: '11.5px', fontWeight: '600', padding: 0 }}>
                                  + Add booking
                                </button>
                              )}
                              {onHideStop && (
                                <button type="button"
                                  onClick={() => triggerHide(stop)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B5AA99', fontSize: '11.5px', padding: 0 }}>
                                  Remove from my trip
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Restore hidden places */}
            {hiddenThisDay.length > 0 && !lastHidden && (
              <button type="button"
                onClick={() => onRestoreDayStops?.(tripDay.dayNumber)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B5AA99', fontSize: '11.5px', padding: '4px 0 0', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <RotateCcw size={11} /> Restore {hiddenThisDay.length} hidden place{hiddenThisDay.length > 1 ? 's' : ''}
              </button>
            )}

            {/* ── Confirmation modal: Remove from my trip ── */}
            {confirmHide && (
              <Modal open onRequestClose={() => setConfirmHide(null)} title="Remove this place?">
                <p style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.65', marginBottom: '16px' }}>
                  This will only remove <strong>{confirmHide.stop.title}</strong> from your personal trip plan.
                  The original itinerary will not change.
                </p>
                {confirmHide.hasBookings && (
                  <div style={{ padding: '10px 14px', background: '#FFF8F0', border: '1px solid #F5D9B8', borderRadius: '6px', marginBottom: '16px' }}>
                    <p style={{ fontSize: '13px', color: '#8C5B1A' }}>
                      This place has bookings linked to it. The bookings will remain in your day plan.
                    </p>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => setConfirmHide(null)} style={btnSecondary}>Cancel</button>
                  <button type="button" onClick={confirmHideStop}
                    style={{ ...btnPrimary, background: '#C0392B', borderColor: '#C0392B' }}>
                    Remove from my trip
                  </button>
                </div>
              </Modal>
            )}

            {bullets.length > 0 && (
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 14px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
                {bullets.map((b, i) => (
                  <li key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: GOLD, flexShrink: 0, marginTop: '9px' }} />
                    <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.6' }}>{b}</span>
                  </li>
                ))}
              </ul>
            )}

            {tip && (
              <div style={{ padding: '12px 16px', background: LIGHT, borderRadius: '6px', borderLeft: `3px solid ${GOLD}`, marginBottom: '14px' }}>
                <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.2px', textTransform: 'uppercase', color: GOLD, marginBottom: '4px' }}>Insider Tip</p>
                <p style={{ fontSize: '13.5px', color: '#4A433A', lineHeight: '1.6' }}>{tip}</p>
              </div>
            )}

            {img && <img src={img} alt={title} style={{ width: '100%', maxWidth: '460px', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }} />}

            {/* User items — with any bookings linked to that item rendered underneath */}
            {dayItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {dayItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    linkedBookings={itemBookings[item.id] || []}
                    onDelete={onDeleteItem}
                    onEdit={onEditItem}
                    onEditBooking={onEditBooking}
                    tripName={tripName}
                    itineraryDayStops={itinDayStops}
                    canEdit={canEdit}
                  />
                ))}
              </div>
            )}

            {/* Day-level bookings not linked to a specific stop */}
            {dayOnlyBookings.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {dayOnlyBookings.map(b => <DayBookingItem key={b.id} booking={b} onEdit={onEditBooking} tripName={tripName} itineraryDayStops={itinDayStops} canEdit={canEdit} />)}
              </div>
            )}

            {/* Day notes */}
            {dayNotes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {dayNotes.map(n => (
                  <div key={n.id} style={{ padding: '10px 14px', background: `${GOLD}08`, border: `1px dashed ${GOLD}40`, borderRadius: '6px' }}>
                    {n.title && <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: GOLD, marginBottom: '3px' }}>{n.title}</p>}
                    <p style={{ fontSize: '13px', color: CHAR, lineHeight: '1.5' }}>{n.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add actions */}
            {canEdit && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
                <button style={pillStyle} onClick={() => onAddItem(tripDay.id, tripDay.dayNumber)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.color = TEAL; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}>
                  <Plus size={12} /> Add place
                </button>
                <button style={pillStyle} onClick={() => onAddBooking(tripDay.id, tripDay.dayNumber)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = CAT_COLORS.hotel; e.currentTarget.style.color = CAT_COLORS.hotel; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}>
                  <Bookmark size={12} /> Add booking
                </button>
                <button style={pillStyle} onClick={() => onAddNote(tripDay.id, tripDay.dayNumber)}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}>
                  <FileText size={12} /> Add note
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// OverviewTab
// ─────────────────────────────────────────────
function OverviewTab({ workspace, onEditDetails, onEditPersonal }) {
  const isMobile = useIsMobile();
  const { trip, itinerary, tripNotes } = workspace;
  const isPersonal = trip.tripType === 'personal';
  const content = parseContent(itinerary?.content);
  const highlights = (isPersonal
    ? (Array.isArray(trip.highlights) ? trip.highlights : [])
    : content?.summary?.highlights || []);
  const bestFor    = content?.tripFacts?.bestFor || content?.summary?.bestFor || [];
  const tags       = content?.tags || bestFor;
  const whySpecial = content?.summary?.whySpecial || '';
  const routeOverview = content?.route?.overview || content?.route?.description || '';
  const description = trip.overview || itinerary?.description || '';

  const generalNotes = tripNotes?.filter(n => !n.tripDayId && !n.tripItemId) || [];

  // Trip details summary
  const hasDetails = trip.startDate || trip.travellers || trip.accommodationSummary || trip.arrivalInfo || trip.departureInfo || trip.generalNotes;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr minmax(260px, 300px)', gap: isMobile ? '28px' : '40px', alignItems: 'start' }}>
        {/* Left — editorial content */}
        <div>
          {isPersonal && onEditPersonal && (
            <div style={{ marginBottom: '28px' }}>
              <button
                onClick={onEditPersonal}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '9px 18px', border: `1px solid ${BORDER}`, borderRadius: '6px',
                  background: 'transparent', fontSize: '13px', fontWeight: '600', color: MUTED,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.color = TEAL; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}
              >
                <Pencil size={13} /> Edit trip details
              </button>
            </div>
          )}

          {description && (
            <section style={{ marginBottom: '40px' }}>
              <p style={{ fontSize: '16px', color: MUTED, lineHeight: '1.8' }}>{description}</p>
            </section>
          )}

          {highlights.length > 0 && (
            <section style={{ marginBottom: '40px' }}>
              <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: '18px' }}>
                Trip highlights
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
                {highlights.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', background: 'white', borderRadius: '8px', border: `1px solid ${BORDER}` }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#EFF6F5', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Star size={10} color={TEAL} fill={TEAL} />
                    </div>
                    <span style={{ fontSize: '13.5px', color: '#4A433A', lineHeight: '1.5' }}>{h}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {(tags.length > 0 || bestFor.length > 0) && (
            <section style={{ marginBottom: '40px' }}>
              <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: '14px' }}>
                Perfect for
              </h3>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {tags.map((t, i) => (
                  <span key={i} style={{
                    padding: '6px 14px', background: '#EFF6F5',
                    borderRadius: '20px', fontSize: '13px', fontWeight: '500', color: TEAL,
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}

          {routeOverview && (
            <section style={{ marginBottom: '40px' }}>
              <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: '12px' }}>
                Route overview
              </h3>
              <p style={{ fontSize: '15px', color: MUTED, lineHeight: '1.75' }}>{routeOverview}</p>
            </section>
          )}

          {whySpecial && (
            <section style={{
              padding: '24px 28px', background: LIGHT,
              borderRadius: '10px', borderLeft: `3px solid ${GOLD}`, marginBottom: '40px',
            }}>
              <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: GOLD, marginBottom: '8px' }}>
                Why this route
              </p>
              <p style={{ fontSize: '15px', color: CHAR, lineHeight: '1.75' }}>{whySpecial}</p>
            </section>
          )}
        </div>

        {/* Right — personal trip details card */}
        <div style={{ position: isMobile ? 'static' : 'sticky', top: '120px' }}>
          <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(135deg, #0D3834, #1B6B65)', padding: '20px 24px' }}>
              <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', marginBottom: '4px' }}>
                Your trip
              </p>
              <p style={{ fontFamily: SERIF, fontSize: '17px', fontWeight: '600', color: 'white' }}>
                {trip.destination || itinerary?.destination || 'Your journey'}
              </p>
            </div>
            <div style={{ padding: '20px 24px' }}>
              {trip.startDate && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <Calendar size={14} color={TEAL} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, marginBottom: '2px' }}>Dates</p>
                    <p style={{ fontSize: '13.5px', color: CHAR }}>
                      {formatDate(trip.startDate)}
                      {trip.endDate ? ` — ${formatDate(trip.endDate)}` : ''}
                    </p>
                  </div>
                </div>
              )}
              {trip.travellers && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <Users size={14} color={TEAL} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, marginBottom: '2px' }}>Travellers</p>
                    <p style={{ fontSize: '13.5px', color: CHAR }}>{trip.travellers}</p>
                  </div>
                </div>
              )}
              {trip.accommodationSummary && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <MapPin size={14} color={TEAL} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, marginBottom: '2px' }}>Accommodation</p>
                    <p style={{ fontSize: '13.5px', color: CHAR }}>{trip.accommodationSummary}</p>
                  </div>
                </div>
              )}
              {trip.arrivalInfo && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <Clock size={14} color={TEAL} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, marginBottom: '2px' }}>Arrival</p>
                    <p style={{ fontSize: '13.5px', color: CHAR }}>{trip.arrivalInfo}</p>
                  </div>
                </div>
              )}
              {trip.departureInfo && (
                <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                  <Clock size={14} color={TEAL} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, marginBottom: '2px' }}>Departure</p>
                    <p style={{ fontSize: '13.5px', color: CHAR }}>{trip.departureInfo}</p>
                  </div>
                </div>
              )}
              {trip.generalNotes && (
                <div style={{ padding: '12px', background: STONE, borderRadius: '6px', marginBottom: '12px' }}>
                  <p style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>Notes</p>
                  <p style={{ fontSize: '13px', color: CHAR, lineHeight: '1.55' }}>{trip.generalNotes}</p>
                </div>
              )}

              {!hasDetails && (
                <p style={{ fontSize: '13px', color: '#B5A09A', lineHeight: '1.6', marginBottom: '12px' }}>
                  Add your travel dates, flights and personal notes here.
                </p>
              )}

              <button
                onClick={onEditDetails}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  padding: '11px', border: `1px solid ${BORDER}`, borderRadius: '6px',
                  background: 'transparent', fontSize: '13px', fontWeight: '600', color: MUTED,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.color = TEAL; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}
              >
                <Pencil size={13} /> {hasDetails ? 'Edit details' : 'Add trip details'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DaysTab
// ─────────────────────────────────────────────
function DaysTab({ workspace, onAddItem, onAddNote, onAddBooking, onAddBookingFromStop, onHideStop, onRestoreStop, onRestoreDayStops, onDeleteItem, onEditItem, onEditBooking, canEdit = true }) {
  const { itinerary, tripDays, tripItems, tripNotes, tripBookings, assets, itineraryDayStops = [], hiddenStopIds = [], trip } = workspace;
  const tripName = trip?.title || trip?.destination || '';
  const content = parseContent(itinerary?.content);
  const itinDays = (content?.days || []).map(normalizeDay);

  const sorted = [...tripDays].sort((a, b) => (a.sortOrder || a.dayNumber) - (b.sortOrder || b.dayNumber));

  if (!sorted.length) {
    return (
      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '56px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: '15px', color: MUTED }}>No days found for this trip.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
        {sorted.map((tripDay, i) => {
          const itinDay = itinDays.find(d => d.dayNumber === tripDay.dayNumber) || null;
          const dayItems = tripItems.filter(item => item.tripDayId === tripDay.id);
          const dayNotes = tripNotes.filter(n => n.tripDayId === tripDay.id);
          // Match by tripDayId (FK) or by dayNumber (fallback for older bookings)
          const dayBookings = tripBookings.filter(b =>
            b.tripDayId === tripDay.id ||
            (!b.tripDayId && b.dayNumber === tripDay.dayNumber)
          );
          // Original itinerary stops for this day (read-only template content)
          const itinDayStops = itineraryDayStops.filter(s => s.dayNumber === tripDay.dayNumber)
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
          return (
            <DaySection
              key={tripDay.id}
              tripDay={tripDay}
              itinDay={itinDay}
              itinDayStops={itinDayStops}
              dayItems={dayItems}
              dayNotes={dayNotes}
              dayBookings={dayBookings}
              isLast={i === sorted.length - 1}
              assets={assets}
              onAddItem={onAddItem}
              onAddNote={onAddNote}
              onAddBooking={onAddBooking}
              onAddBookingFromStop={onAddBookingFromStop}
              onHideStop={onHideStop}
              onRestoreStop={onRestoreStop}
              onRestoreDayStops={onRestoreDayStops}
              hiddenStopIds={hiddenStopIds}
              onDeleteItem={onDeleteItem}
              onEditItem={onEditItem}
              onEditBooking={onEditBooking}
              tripName={tripName}
              canEdit={canEdit}
            />
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MapTab
// ─────────────────────────────────────────────
function MapTab({ workspace, onRefresh }) {
  const { itinerary, trip, tripItems = [], tripBookings = [], itineraryDayStops = [], hiddenStopIds = [] } = workspace;
  const slug    = itinerary?.slug;
  const content = parseContent(itinerary?.content);

  // Priority 1: structured ItineraryDayStop records (include lat/lng from API)
  const itinStops = itineraryDayStops
    .filter(s => s.showOnMap !== false && !hiddenStopIds.includes(s.id))
    .sort((a, b) => (a.dayNumber - b.dayNumber) || (a.sortOrder - b.sortOrder))
    .map((s, i) => ({
      id: s.id, name: s.title, dayNumber: s.dayNumber,
      latitude: s.latitude, longitude: s.longitude,
      isMajorStop: s.isMajorStop, type: s.isMajorStop ? 'major' : 'stop',
      description: s.description, order: i + 1, metadata: s.metadata || {},
    }));

  // Priority 2: CMS route map stops (content.routeMap.stops) — used when no structured
  // ItineraryDayStop records exist. This is what the backoffice Leaflet editor shows,
  // so My Trips should display the same route.
  const cmsStops = (content?.routeMap?.stops || [])
    .filter(s => s.visible !== false && s.latitude != null && s.longitude != null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map(s => ({
      id: s.id, name: s.name, dayNumber: s.dayNumber ?? null,
      latitude: s.latitude, longitude: s.longitude,
      isMajorStop: s.type === 'major', type: s.type || 'stop',
      description: s.description || null, order: s.order || 0, metadata: {},
    }));

  // Effective itinerary stops for the Leaflet map
  const effectiveItinStops = itinStops.length > 0 ? itinStops : cmsStops;

  // Further fallbacks (only when no coordinate-based stops exist at all)
  const RouteMapComponent = effectiveItinStops.length === 0 ? (ROUTE_MAP_COMPONENTS[slug] || null) : null;
  const mapImageUrl = effectiveItinStops.length === 0 ? (content?.routeMap?.imageUrl || null) : null;

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: 'clamp(24px, 4vw, 48px) 24px', paddingBottom: '80px' }}>

      {/* Primary: Leaflet map — uses ItineraryDayStop or CMS route map stops as itinerary layer */}
      {(effectiveItinStops.length > 0 || tripItems.length > 0 || tripBookings.length > 0) && (
        <section style={{ marginBottom: '40px' }}>
          <TripRouteMap
            itineraryStops={effectiveItinStops}
            tripItems={tripItems}
            tripBookings={tripBookings}
            trip={trip}
            onRefresh={onRefresh}
          />
        </section>
      )}

      {/* Legacy fallback: hardcoded SVG map (only when no coordinate data exists at all) */}
      {effectiveItinStops.length === 0 && RouteMapComponent && (
        <section style={{ marginBottom: '40px' }}>
          <RouteMapComponent />
        </section>
      )}

      {/* Legacy fallback: CMS static map image (only when no coordinate data exists) */}
      {effectiveItinStops.length === 0 && !RouteMapComponent && mapImageUrl && (
        <section style={{ marginBottom: '40px' }}>
          <img src={mapImageUrl} alt={content?.routeMap?.alt || `${itinerary?.title || 'Route'} map`}
            style={{ width: '100%', borderRadius: '12px', maxHeight: '520px', objectFit: 'cover' }} />
          {content?.routeMap?.caption && (
            <p style={{ fontSize: '13px', color: MUTED, textAlign: 'center', marginTop: '10px' }}>{content.routeMap.caption}</p>
          )}
        </section>
      )}

      {/* Empty state */}
      {effectiveItinStops.length === 0 && !RouteMapComponent && !mapImageUrl && tripItems.length === 0 && tripBookings.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Map size={40} color={BORDER} style={{ marginBottom: '16px' }} />
          <p style={{ fontSize: '15px', color: MUTED }}>No route map available for this itinerary yet.</p>
          <p style={{ fontSize: '13px', color: '#B5A09A', marginTop: '6px' }}>
            Coordinates will appear here once the itinerary stops are geocoded.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// NotesTab
// ─────────────────────────────────────────────
function NotesTab({ workspace, onAddNote, onDeleteNote, onEditNote, canEdit = true }) {
  const { tripNotes } = workspace;
  const general = tripNotes.filter(n => !n.tripDayId && !n.tripItemId);
  const day     = tripNotes.filter(n => n.tripDayId);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '600', color: CHAR }}>Notes</h2>
        {canEdit && (
          <button
            onClick={() => onAddNote(null, null)}
            style={{ ...btnPrimary, fontSize: '13px' }}
          >
            <Plus size={14} /> New note
          </button>
        )}
      </div>

      {general.length === 0 && day.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: 'white', borderRadius: '12px', border: `1px solid ${BORDER}` }}>
          <FileText size={36} color={BORDER} style={{ marginBottom: '14px' }} />
          <p style={{ fontSize: '15px', color: MUTED, marginBottom: '6px' }}>Your travel notebook is empty</p>
          <p style={{ fontSize: '13px', color: '#B5A09A' }}>Add notes for packing lists, useful contacts, phrases, or anything you want to remember.</p>
        </div>
      )}

      {general.length > 0 && (
        <section style={{ marginBottom: '36px' }}>
          <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
            General notes
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {general.map(n => (
              <NoteCard key={n.id} note={n} onDelete={onDeleteNote} onEdit={onEditNote} canEdit={canEdit} />
            ))}
          </div>
        </section>
      )}

      {day.length > 0 && (
        <section>
          <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: MUTED, marginBottom: '14px' }}>
            Day notes
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {day.map(n => (
              <NoteCard key={n.id} note={n} onDelete={onDeleteNote} onEdit={onEditNote} canEdit={canEdit} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BookingsTab
// ─────────────────────────────────────────────
function BookingsTab({ workspace, onAddBooking, onDeleteBooking, onEditBooking, canEdit = true }) {
  const { tripBookings, trip, itineraryDayStops = [], tripItems = [] } = workspace;
  const tripName = trip?.title || trip?.destination || '';
  const startDate = trip?.startDate ? trip.startDate.slice(0, 10) : null;

  // Sort by date ascending (nulls last), then createdAt
  const sorted = [...tripBookings].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    const da = String(a.date).slice(0, 10);
    const db = String(b.date).slice(0, 10);
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const total = sorted.length;

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '600', color: CHAR }}>
          Bookings {total > 0 && <span style={{ fontSize: '16px', color: MUTED }}>({total})</span>}
        </h2>
        {canEdit && (
          <button onClick={() => onAddBooking(null, null)} style={{ ...btnPrimary, fontSize: '13px' }}>
            <Plus size={14} /> Add booking
          </button>
        )}
      </div>

      {!startDate && total > 0 && (
        <p style={{ fontSize: '13px', color: '#B5A09A', marginBottom: '20px' }}>
          Set your travel dates in Trip Details to automatically place bookings into days.
        </p>
      )}

      {total === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: 'white', borderRadius: '12px', border: `1px solid ${BORDER}` }}>
          <Bookmark size={36} color={BORDER} style={{ marginBottom: '14px' }} />
          <p style={{ fontSize: '15px', color: MUTED, marginBottom: '6px' }}>No bookings yet</p>
          <p style={{ fontSize: '13px', color: '#B5A09A' }}>Track your hotels, flights, restaurants and experiences here.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {sorted.map(b => (
          <BookingCard key={b.id} booking={b} onDelete={onDeleteBooking} onEdit={onEditBooking} itineraryDayStops={itineraryDayStops} tripItems={tripItems} tripName={tripName} canEdit={canEdit} />
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PdfTab
// ─────────────────────────────────────────────
function PdfTab({ workspace, onDownload, onDownloadPersonalised, downloadState, downloadPersonalisedState }) {
  const { trip, itinerary } = workspace;
  const isPersonal = trip.tripType === 'personal';

  if (isPersonal) {
    return (
      <div style={{ maxWidth: '680px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '600', color: CHAR, marginBottom: '8px' }}>
          Download PDF
        </h2>
        <p style={{ fontSize: '15px', color: MUTED, lineHeight: '1.7', marginBottom: '36px' }}>
          Export your personal trip as a PDF to keep offline or share with others.
        </p>

        <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '28px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
            <div style={{ flex: 1 }}>
              <div style={{
                display: 'inline-block', padding: '3px 9px', borderRadius: '3px',
                background: '#F0ECE6', marginBottom: '10px',
                fontSize: '9.5px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: '#7C6B5A',
              }}>
                Personal Trip
              </div>
              <p style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '600', color: CHAR, marginBottom: '6px' }}>
                {trip.title || trip.destination}
              </p>
              <p style={{ fontSize: '13.5px', color: MUTED }}>
                Includes your overview, day plan, items, bookings and notes.
              </p>
            </div>
            <button
              onClick={onDownloadPersonalised}
              disabled={downloadPersonalisedState === 'downloading'}
              style={{ ...btnPrimary, flexShrink: 0, background: '#7C6B5A', opacity: downloadPersonalisedState === 'downloading' ? 0.7 : 1 }}
            >
              <Download size={14} />
              {downloadPersonalisedState === 'downloading' ? 'Preparing...' : 'Download'}
            </button>
          </div>
          {downloadPersonalisedState === 'error' && (
            <p style={{ fontSize: '12px', color: '#B04040', marginTop: '10px' }}>Download failed. Please try again.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <h2 style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '600', color: CHAR, marginBottom: '8px' }}>
        Download PDF
      </h2>
      <p style={{ fontSize: '15px', color: MUTED, lineHeight: '1.7', marginBottom: '36px' }}>
        Take your itinerary with you, even offline.
      </p>

      {/* Original itinerary PDF */}
      <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '28px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: TEAL, marginBottom: '6px' }}>
              Original itinerary
            </p>
            <p style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '600', color: CHAR, marginBottom: '6px' }}>
              {itinerary?.title || trip.destination}
            </p>
            <p style={{ fontSize: '13.5px', color: MUTED }}>
              The full editorial guide as designed by the creator.
            </p>
          </div>
          <button onClick={onDownload} disabled={downloadState === 'downloading'} style={{ ...btnPrimary, flexShrink: 0, opacity: downloadState === 'downloading' ? 0.7 : 1 }}>
            <Download size={14} />
            {downloadState === 'downloading' ? 'Preparing...' : 'Download'}
          </button>
        </div>
        {downloadState === 'error' && (
          <p style={{ fontSize: '12px', color: '#B04040', marginTop: '10px' }}>Download failed. Please try again.</p>
        )}
      </div>

      {/* Personalised PDF */}
      <div style={{ background: 'white', border: `1px solid ${BORDER}`, borderRadius: '12px', padding: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
              Your custom guide
            </p>
            <p style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '600', color: CHAR, marginBottom: '6px' }}>
              Personalised itinerary
            </p>
            <p style={{ fontSize: '13.5px', color: MUTED }}>
              Includes your notes, bookings, custom places and travel dates.
            </p>
          </div>
          <button onClick={onDownloadPersonalised} disabled={downloadPersonalisedState === 'downloading'} style={{ ...btnPrimary, flexShrink: 0, background: GOLD, opacity: downloadPersonalisedState === 'downloading' ? 0.7 : 1 }}>
            <Download size={14} />
            {downloadPersonalisedState === 'downloading' ? 'Preparing...' : 'Download'}
          </button>
        </div>
        {downloadPersonalisedState === 'error' && (
          <p style={{ fontSize: '12px', color: '#B04040', marginTop: '10px' }}>Download failed. Please try again.</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main — TripDetailPage workspace
// ─────────────────────────────────────────────
export default function TripDetailPage() {
  useSEO({ title: 'My Trip', noindex: true });
  const { id } = useParams();
  const { isLoaded, isSignedIn } = useAuth();
  const api = useApi();
  const navigate = useNavigate();

  const [workspace, setWorkspace]     = useState(null);
  const [status, setStatus]           = useState('loading');
  const [activeTab, setActiveTab]     = useState('overview');
  const [downloadState, setDownloadState] = useState('idle');
  const [deleting, setDeleting]       = useState(false);

  const [showShare, setShowShare] = useState(false);

  // Personal trip overview edit modal
  const [showPersonalOverview, setShowPersonalOverview]     = useState(false);
  const [savingPersonalOverview, setSavingPersonalOverview] = useState(false);

  // Modal states
  const [showDetails, setShowDetails]           = useState(false);
  const [savingDetails, setSavingDetails]       = useState(false);
  const [addItemCtx, setAddItemCtx]             = useState(null);   // { dayId, dayNumber }
  const [editingItem, setEditingItem]           = useState(null);   // TripItem object for editing
  const [savingItem, setSavingItem]             = useState(false);
  const [addNoteCtx, setAddNoteCtx]             = useState(null);   // { dayId, dayNumber } or {}
  const [editNote, setEditNote]                 = useState(null);   // note object for editing
  const [savingNote, setSavingNote]             = useState(false);
  const [bookingCtx, setBookingCtx]             = useState(null);   // { dayId, dayNumber } or {}
  const [editingBooking, setEditingBooking]     = useState(null);   // booking object for editing
  const [savingBooking, setSavingBooking]       = useState(false);
  const [downloadPersonalisedState, setDownloadPersonalisedState] = useState('idle');

  // ── Load workspace ────────────────────────────────────────────
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) { navigate('/sign-in'); return; }

    api.get(`/api/trips?id=${id}&action=workspace`)
      .then(res => {
        if (res.status === 404) { setStatus('notfound'); return; }
        if (!res.ok) throw new Error('Load failed');
        return res.json();
      })
      .then(data => {
        if (!data) return;
        setWorkspace(data);
        setStatus('ok');
      })
      .catch(() => setStatus('error'));
  }, [isLoaded, isSignedIn, id]);

  function triggerBlobDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Download original itinerary PDF ──────────────────────────
  async function handleDownload() {
    if (!workspace || downloadState === 'downloading') return;
    setDownloadState('downloading');

    const { trip, itinerary } = workspace;
    const slug = itinerary?.slug || trip.itinerarySlug;
    const filename = `${(slug || trip.destination || 'trip').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-hiddenatlas.pdf`;

    const audit = () => api.post(`/api/trips?id=${id}`, {
      eventType: 'DOWNLOADED',
      metadata: { source: 'workspace_original_pdf', destination: trip.destination },
    }).catch(() => {});

    try {
      // 1. Try itinerary pdfUrl (Vercel Blob — the real designer PDF)
      if (itinerary?.pdfUrl) {
        try {
          const res = await fetch(itinerary.pdfUrl);
          if (res.ok) {
            const blob = await res.blob();
            triggerBlobDownload(blob, filename);
            setDownloadState('done'); audit(); return;
          }
        } catch { /* fall through */ }
      }

      // 2. Try secure API download endpoint
      if (slug) {
        try {
          const res = await api.get(`/api/itineraries?action=download&slug=${slug}`);
          if (res.ok) {
            const blob = await res.blob();
            triggerBlobDownload(blob, filename);
            setDownloadState('done'); audit(); return;
          }
        } catch { /* fall through */ }
      }

      // 3. Try static catalog PDF generation (older itineraries with full static data)
      if (slug) {
        const matched = staticItineraries.find(it => it.id === slug || it.slug === slug);
        if (matched) {
          const { downloadItineraryPDF } = await import('../utils/downloadPDF');
          await downloadItineraryPDF(matched);
          setDownloadState('done'); audit(); return;
        }
      }

      // 4. Fallback: TripPDF (AI-generated trips or anything else)
      const [{ pdf }, { TripPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/TripPDF'),
      ]);
      const { createElement } = await import('react');
      const blob = await pdf(createElement(TripPDF, { trip })).toBlob();
      triggerBlobDownload(blob, filename);
      setDownloadState('done'); audit();
    } catch (err) {
      console.error('[TripDetailPage] download error:', err.message);
      setDownloadState('error');
    }
  }

  // ── Download personalised PDF ─────────────────────────────────
  async function handleDownloadPersonalised() {
    if (!workspace || downloadPersonalisedState === 'downloading') return;
    setDownloadPersonalisedState('downloading');
    try {
      const { downloadPersonalisedPDF } = await import('../utils/downloadPersonalisedPDF');
      await downloadPersonalisedPDF(workspace);
      setDownloadPersonalisedState('done');
    } catch (err) {
      console.error('[TripDetailPage] personalised PDF error:', err.message);
      setDownloadPersonalisedState('error');
    }
  }

  // ── Delete trip ───────────────────────────────────────────────
  async function handleDelete() {
    if (!window.confirm('Delete this trip? This cannot be undone.')) return;
    setDeleting(true);
    try {
      const res = await api.del(`/api/trips?id=${id}`);
      if (!res.ok) throw new Error('Delete failed');
      navigate('/my-trips');
    } catch {
      setDeleting(false);
      alert('Could not delete trip. Please try again.');
    }
  }

  // ── Update trip details ───────────────────────────────────────
  async function handleSaveDetails(form) {
    setSavingDetails(true);
    try {
      const res = await api.post(`/api/trips?id=${id}&action=details`, form);
      if (!res.ok) throw new Error('Save failed');
      setWorkspace(w => ({ ...w, trip: { ...w.trip, ...form } }));
      setShowDetails(false);
      // Remap bookings if start date changed — fire and forget, UI will reload on next open
      if (form.startDate) {
        api.post(`/api/trips?id=${id}&action=remap-bookings`, {})
          .then(r => r.json())
          .then(data => {
            if (data.remapped > 0) {
              // Reload workspace to get updated dayNumbers
              api.get(`/api/trips?id=${id}&action=workspace`)
                .then(r => r.json())
                .then(ws => setWorkspace(ws))
                .catch(() => {});
            }
          })
          .catch(() => {});
      }
    } catch {
      alert('Could not save details. Please try again.');
    } finally {
      setSavingDetails(false);
    }
  }

  // ── Save personal trip overview (title, destination, overview, etc.) ─────
  async function handleSavePersonalOverview(form) {
    setSavingPersonalOverview(true);
    try {
      const payload = {
        ...form,
        travellers: form.travellers ? Number(form.travellers) : null,
      };
      const res = await api.post(`/api/trips?id=${id}&action=personal-overview`, payload);
      if (!res.ok) throw new Error('Save failed');
      // Recalculate durationDays / duration locally for optimistic update
      let durationDays = null;
      let duration = '';
      if (form.startDate && form.endDate) {
        const s = new Date(form.startDate + 'T00:00:00Z');
        const e = new Date(form.endDate + 'T00:00:00Z');
        const diff = Math.round((e.getTime() - s.getTime()) / 86400000) + 1;
        if (diff > 0) { durationDays = diff; duration = diff === 1 ? '1 day' : `${diff} days`; }
      }
      const updated = { ...payload };
      if (durationDays) { updated.durationDays = durationDays; updated.duration = duration; }
      setWorkspace(w => ({ ...w, trip: { ...w.trip, ...updated } }));
      setShowPersonalOverview(false);
    } catch {
      alert('Could not save trip details. Please try again.');
    } finally {
      setSavingPersonalOverview(false);
    }
  }

  // ── Upload TripItem image ─────────────────────────────────────
  async function uploadItemImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const base64Data = e.target.result.split(',')[1];
          const res = await api.post(`/api/trips?id=${id}&action=item-image-upload`, { base64Data, filename: file.name });
          if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Upload failed'); }
          const { url } = await res.json();
          resolve(url);
        } catch (err) { reject(err); }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ── Create TripItem ───────────────────────────────────────────
  async function handleSaveItem(form) {
    if (!addItemCtx) return;
    setSavingItem(true);
    try {
      let imageUrl = form.imageUrl || null;
      if (form.imageFile) imageUrl = await uploadItemImage(form.imageFile);
      const { imageFile: _f, imagePreview: _p, ...rest } = form;
      const body = { ...rest, imageUrl, imageAlt: form.imageAlt || null, tripDayId: addItemCtx.dayId };
      const res  = await api.post(`/api/trips?id=${id}&action=item`, body);
      if (!res.ok) throw new Error('Save failed');
      const { item } = await res.json();
      if (item) {
        // Use the real DB row returned from the INSERT so state matches DB exactly
        setWorkspace(w => ({ ...w, tripItems: [...w.tripItems, item] }));
      } else {
        // Fallback: re-fetch full workspace to sync state
        const wsRes = await api.get(`/api/trips?id=${id}&action=workspace`);
        if (wsRes.ok) setWorkspace(await wsRes.json());
      }
      setAddItemCtx(null);
    } catch (err) {
      alert(`Could not add item: ${err.message || 'Please try again.'}`);
    } finally {
      setSavingItem(false);
    }
  }

  // ── Update TripItem ───────────────────────────────────────────
  async function handleUpdateItem(form) {
    if (!editingItem) return;
    setSavingItem(true);
    try {
      let imageUrl = form.imageUrl !== undefined ? (form.imageUrl || null) : undefined;
      if (form.imageFile) imageUrl = await uploadItemImage(form.imageFile);
      const { imageFile: _f, imagePreview: _p, ...rest } = form;
      const body = { ...rest, imageUrl, imageAlt: form.imageAlt || null };
      const res = await api.post(`/api/trips?action=item&itemId=${editingItem.id}`, body);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Update failed');
      }
      const { item } = await res.json();
      if (item) {
        setWorkspace(w => ({ ...w, tripItems: w.tripItems.map(i => i.id === editingItem.id ? item : i) }));
      } else {
        const wsRes = await api.get(`/api/trips?id=${id}&action=workspace`);
        if (wsRes.ok) setWorkspace(await wsRes.json());
      }
      setEditingItem(null);
    } catch (err) {
      alert(`Could not update item: ${err.message || 'Please try again.'}`);
    } finally {
      setSavingItem(false);
    }
  }

  // ── Delete TripItem ───────────────────────────────────────────
  async function handleDeleteItem(itemId) {
    try {
      const res = await api.post(`/api/trips?action=delete-item&itemId=${itemId}`, {});
      if (!res.ok) throw new Error('Delete failed');
      setWorkspace(w => ({ ...w, tripItems: w.tripItems.filter(i => i.id !== itemId) }));
    } catch {
      alert('Could not remove item.');
    }
  }

  // ── Create TripNote ───────────────────────────────────────────
  async function handleSaveNote(form) {
    setSavingNote(true);
    try {
      if (editNote) {
        // Update existing
        const res = await api.post(`/api/trips?action=note&noteId=${editNote.id}`, form);
        if (!res.ok) throw new Error('Update failed');
        setWorkspace(w => ({
          ...w,
          tripNotes: w.tripNotes.map(n => n.id === editNote.id ? { ...n, ...form } : n),
        }));
        setEditNote(null);
      } else {
        const noteType = addNoteCtx?.dayId ? 'day' : 'general';
        const body = { ...form, tripDayId: addNoteCtx?.dayId || null, noteType };
        const res  = await api.post(`/api/trips?id=${id}&action=note`, body);
        if (!res.ok) throw new Error('Save failed');
        const { id: newId } = await res.json();
        const newNote = { id: newId, tripId: id, tripDayId: addNoteCtx?.dayId || null, noteType, ...form, createdAt: new Date().toISOString() };
        setWorkspace(w => ({ ...w, tripNotes: [...w.tripNotes, newNote] }));
        setAddNoteCtx(null);
      }
    } catch {
      alert('Could not save note. Please try again.');
    } finally {
      setSavingNote(false);
      setAddNoteCtx(null);
    }
  }

  // ── Delete TripNote ───────────────────────────────────────────
  async function handleDeleteNote(noteId) {
    try {
      const res = await api.post(`/api/trips?action=delete-note&noteId=${noteId}`, {});
      if (!res.ok) throw new Error('Delete failed');
      setWorkspace(w => ({ ...w, tripNotes: w.tripNotes.filter(n => n.id !== noteId) }));
    } catch {
      alert('Could not delete note.');
    }
  }

  // ── Create / Update TripBooking ───────────────────────────────
  async function handleSaveBooking(form) {
    setSavingBooking(true);
    try {
      if (editingBooking) {
        // Update existing booking
        const res = await api.post(`/api/trips?action=booking&bookingId=${editingBooking.id}`, form);
        if (!res.ok) throw new Error('Update failed');
        // Re-fetch workspace to get the authoritative DB state (avoids date/type serialisation mismatches)
        const wsRes = await api.get(`/api/trips?id=${id}&action=workspace`);
        if (wsRes.ok) setWorkspace(await wsRes.json());
      } else {
        // Create new booking
        // If coming from a stop, copy coordinates if the booking form didn't override them
        const stopCtx = bookingCtx?.stopCtx;
        const body = {
          ...form,
          // form.tripDayId comes from modal's selectedTripDay — trust it; fall back to context
          tripDayId: form.tripDayId || bookingCtx?.dayId || null,
          latitude:  form.latitude  || stopCtx?.latitude  || null,
          longitude: form.longitude || stopCtx?.longitude || null,
        };
        const res  = await api.post(`/api/trips?id=${id}&action=booking`, body);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || 'Save failed');
        }
        // Always re-fetch workspace to avoid pg Date serialization mismatches
        // and confirm the booking is truly persisted before showing it
        const wsRes = await api.get(`/api/trips?id=${id}&action=workspace`);
        if (wsRes.ok) setWorkspace(await wsRes.json());
      }
      setBookingCtx(null);
      setEditingBooking(null);
    } catch (err) {
      alert(`Could not save booking: ${err.message || 'Please try again.'}`);
    } finally {
      setSavingBooking(false);
    }
  }

  // ── Delete TripBooking ────────────────────────────────────────
  async function handleDeleteBooking(bookingId) {
    try {
      const res = await api.post(`/api/trips?action=delete-booking&bookingId=${bookingId}`, {});
      if (!res.ok) throw new Error('Delete failed');
      setWorkspace(w => ({ ...w, tripBookings: w.tripBookings.filter(b => b.id !== bookingId) }));
    } catch {
      alert('Could not delete booking.');
    }
  }

  // ── Hide/restore original itinerary stops ────────────────────
  async function handleHideStop(stop, tripDay) {
    try {
      await api.post(`/api/trips?id=${id}&action=hide-itinerary-stop`, {
        stopId:    stop.id,
        dayNumber: stop.dayNumber,
        tripDayId: tripDay.id,
        title:     stop.title,
        type:      stop.type,
      });
      setWorkspace(w => ({ ...w, hiddenStopIds: [...(w.hiddenStopIds || []), stop.id] }));
    } catch { /* fail silently */ }
  }

  async function handleRestoreStop(stopId) {
    try {
      await api.post(`/api/trips?id=${id}&action=unhide-itinerary-stop`, { stopId });
      setWorkspace(w => ({ ...w, hiddenStopIds: (w.hiddenStopIds || []).filter(sid => sid !== stopId) }));
    } catch { /* fail silently */ }
  }

  async function handleRestoreDayStops(dayNumber) {
    try {
      await api.post(`/api/trips?id=${id}&action=unhide-day-stops`, { dayNumber });
      const dayStopIds = new Set(
        (workspace.itineraryDayStops || []).filter(s => s.dayNumber === dayNumber).map(s => s.id)
      );
      setWorkspace(w => ({ ...w, hiddenStopIds: (w.hiddenStopIds || []).filter(sid => !dayStopIds.has(sid)) }));
    } catch { /* fail silently */ }
  }

  // ── Loading / error states ────────────────────────────────────
  if (status === 'loading') {
    return (
      <div style={{ background: STONE, paddingTop: '72px', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ fontSize: '15px', color: '#9C9488' }}>Loading your trip...</p>
      </div>
    );
  }

  if (status === 'error' || status === 'notfound') {
    return (
      <div style={{ background: STONE, paddingTop: '72px', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
        <p style={{ fontSize: '15px', color: MUTED }}>
          {status === 'notfound' ? 'Trip not found.' : 'Could not load this trip.'}
        </p>
        <Link to="/my-trips" style={{ fontSize: '14px', color: TEAL, fontWeight: '600', textDecoration: 'none' }}>
          Back to My Trips
        </Link>
      </div>
    );
  }

  const { trip, itinerary, assets } = workspace;
  const access = workspace.access || { canView: true, canEdit: true, canManageSharing: true, role: 'owner' };
  const isPersonalTrip = trip.tripType === 'personal';
  const heroImage = getHeroImage(trip, itinerary, assets);
  const title     = isPersonalTrip ? (trip.title || trip.destination) : (itinerary?.title || trip.title || trip.destination);
  const subtitle  = trip.subtitle || (!isPersonalTrip ? itinerary?.subtitle : '') || '';
  const destination = isPersonalTrip ? (trip.destination || trip.country || '') : (itinerary?.destination || trip.country || '');
  const duration    = trip.duration || (itinerary?.durationDays ? `${itinerary.durationDays} days` : '');

  return (
    <div style={{ background: STONE, paddingTop: '64px', minHeight: '100vh' }}>

      {/* ── Hero ───────────────────────────────────────────── */}
      <section style={{
        position: 'relative', overflow: 'hidden',
        minHeight: 'clamp(340px, 45vh, 520px)',
        display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
      }}>
        {/* Background */}
        {heroImage ? (
          <>
            <img
              src={heroImage} alt={title}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(10,30,28,0.3) 0%, rgba(10,30,28,0.75) 100%)' }} />
          </>
        ) : (
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #0D3834 0%, #1B6B65 60%, #2D7D77 100%)' }} />
        )}

        {/* Back + actions row */}
        <div style={{ position: 'absolute', top: '20px', left: 0, right: 0, display: 'flex', justifyContent: 'space-between', padding: '0 24px', zIndex: 10 }}>
          <Link
            to="/my-trips"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '6px',
              padding: '7px 14px', background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)', borderRadius: '20px',
              fontSize: '12.5px', color: 'white', fontWeight: '600', textDecoration: 'none',
            }}
          >
            <ArrowLeft size={13} /> My Trips
          </Link>
          <div style={{ display: 'flex', gap: '8px' }}>
            {access.canManageSharing && (
              <button
                onClick={() => setShowShare(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '7px 14px', background: 'rgba(255,255,255,0.15)',
                  border: '1px solid rgba(255,255,255,0.3)', borderRadius: '20px',
                  fontSize: '12px', color: 'white', fontWeight: '600', cursor: 'pointer',
                }}
              >
                <Share2 size={12} /> Share
              </button>
            )}
            {access.canManageSharing && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '7px 14px', background: 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px',
                  fontSize: '12px', color: 'rgba(255,255,255,0.65)', cursor: 'pointer',
                }}
              >
                <Trash2 size={12} /> {deleting ? 'Deleting...' : 'Delete'}
              </button>
            )}
          </div>
        </div>

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 10, padding: 'clamp(32px, 5vw, 56px) 24px 40px', maxWidth: '760px' }}>
          {/* Badge */}
          {(() => {
            const isPersonal = trip.tripType === 'personal';
            const badgeText = isPersonal
              ? 'Personal Trip'
              : access.role === 'owner'
                ? 'Personal trip copy'
                : access.role === 'edit'
                  ? 'Shared with you · Can edit'
                  : 'Shared with you · View only';
            const badgeBg = isPersonal
              ? 'rgba(124,107,90,0.25)'
              : 'rgba(201,169,110,0.2)';
            const badgeBorder = isPersonal
              ? '1px solid rgba(124,107,90,0.5)'
              : '1px solid rgba(201,169,110,0.4)';
            const badgeColor = isPersonal ? '#D4C4B0' : GOLD;
            return (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '4px 10px', marginBottom: '14px',
                background: badgeBg, border: badgeBorder,
                borderRadius: '3px',
              }}>
                <span style={{ fontSize: '9.5px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: badgeColor }}>
                  {badgeText}
                </span>
              </div>
            );
          })()}

          {/* Title */}
          <h1 style={{
            fontFamily: SERIF, fontSize: 'clamp(28px, 5vw, 52px)',
            fontWeight: '600', color: 'white', lineHeight: '1.15',
            letterSpacing: '-0.3px', marginBottom: subtitle ? '10px' : '18px',
          }}>
            {title}
          </h1>

          {subtitle && (
            <p style={{ fontSize: 'clamp(14px, 2vw, 17px)', color: 'rgba(255,255,255,0.75)', lineHeight: '1.6', marginBottom: '20px' }}>
              {subtitle}
            </p>
          )}

          {/* Meta pills */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            {destination && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', background: 'rgba(255,255,255,0.12)', borderRadius: '20px', fontSize: '12.5px', color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                <MapPin size={11} /> {destination}
              </div>
            )}
            {duration && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', background: 'rgba(255,255,255,0.12)', borderRadius: '20px', fontSize: '12.5px', color: 'rgba(255,255,255,0.85)', fontWeight: '600' }}>
                <Clock size={11} /> {duration}
              </div>
            )}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '6px 14px', background: 'rgba(255,255,255,0.12)', borderRadius: '20px', fontSize: '12.5px', color: 'rgba(255,255,255,0.75)', fontWeight: '500' }}>
              <Calendar size={11} /> Saved {formatDate(trip.createdAt)}
            </div>

            {/* Action buttons */}
            <button
              onClick={handleDownload}
              disabled={downloadState === 'downloading'}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '7px 16px', background: 'rgba(255,255,255,0.18)',
                border: '1px solid rgba(255,255,255,0.35)', borderRadius: '20px',
                fontSize: '12.5px', color: 'white', fontWeight: '600',
                cursor: downloadState === 'downloading' ? 'default' : 'pointer',
              }}
            >
              <Download size={12} />
              {downloadState === 'downloading' ? 'Preparing...' : 'Download PDF'}
            </button>

            {access.canEdit && (
              <button
                onClick={() => setShowDetails(true)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '7px 16px', background: GOLD,
                  border: 'none', borderRadius: '20px',
                  fontSize: '12.5px', color: 'white', fontWeight: '600', cursor: 'pointer',
                }}
              >
                <Pencil size={12} />
                {(trip.startDate || trip.travellers) ? 'Edit details' : 'Add trip details'}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Workspace nav (desktop/tablet) ─────────────────── */}
      <WorkspaceNav activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Tab content ─────────────────────────────────────── */}
      {/* paddingBottom on desktop; on mobile CSS overrides to account for bottom nav + safe area */}
      <div style={{ paddingBottom: '100px' }}>
        {activeTab === 'overview' && (
          <OverviewTab
            workspace={workspace}
            onEditDetails={() => setShowDetails(true)}
            onEditPersonal={access.canEdit && trip.tripType === 'personal' ? () => setShowPersonalOverview(true) : null}
          />
        )}

        {activeTab === 'days' && (
          <DaysTab
            workspace={workspace}
            onAddItem={access.canEdit ? (dayId, dayNumber) => setAddItemCtx({ dayId, dayNumber }) : undefined}
            onAddNote={access.canEdit ? (dayId, dayNumber) => setAddNoteCtx({ dayId, dayNumber }) : undefined}
            onAddBooking={access.canEdit ? (dayId, dayNumber) => { setEditingBooking(null); setBookingCtx({ dayId, dayNumber }); } : undefined}
            onAddBookingFromStop={access.canEdit ? (stop, dayId, dayNumber) => {
              setEditingBooking(null);
              setBookingCtx({
                dayId, dayNumber,
                stopCtx: {
                  stopId:       stop.id,
                  title:        stop.title,
                  locationName: stop.locationName || stop.title,
                  address:      stop.address || null,
                  latitude:     stop.latitude  || null,
                  longitude:    stop.longitude || null,
                  type:         stop.type,
                  dayNumber:    stop.dayNumber || dayNumber,
                },
              });
            } : undefined}
            onHideStop={access.canEdit ? handleHideStop : undefined}
            onRestoreStop={access.canEdit ? handleRestoreStop : undefined}
            onRestoreDayStops={access.canEdit ? handleRestoreDayStops : undefined}
            onDeleteItem={access.canEdit ? handleDeleteItem : undefined}
            onEditItem={access.canEdit ? (item => setEditingItem(item)) : undefined}
            onEditBooking={access.canEdit ? (b => { setEditingBooking(b); setBookingCtx({}); }) : undefined}
            canEdit={access.canEdit}
          />
        )}

        {activeTab === 'map' && <MapTab workspace={workspace} onRefresh={() => {
          api.get(`/api/trips?id=${id}&action=workspace`).then(r => r.json()).then(d => { if (d) setWorkspace(d); });
        }} />}

        {activeTab === 'notes' && (
          <NotesTab
            workspace={workspace}
            onAddNote={(dayId, dayNumber) => setAddNoteCtx({ dayId, dayNumber })}
            onDeleteNote={handleDeleteNote}
            onEditNote={note => { setEditNote(note); setAddNoteCtx({}); }}
            canEdit={access.canEdit}
          />
        )}

        {activeTab === 'bookings' && (
          <BookingsTab
            workspace={workspace}
            onAddBooking={() => { setEditingBooking(null); setBookingCtx({}); }}
            onDeleteBooking={handleDeleteBooking}
            onEditBooking={b => { setEditingBooking(b); setBookingCtx({}); }}
            canEdit={access.canEdit}
          />
        )}

        {activeTab === 'pdf' && (
          <PdfTab
            workspace={workspace}
            onDownload={handleDownload}
            downloadState={downloadState}
            onDownloadPersonalised={handleDownloadPersonalised}
            downloadPersonalisedState={downloadPersonalisedState}
          />
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      <ShareModal
        tripId={id}
        tripTitle={title}
        open={showShare}
        onClose={() => setShowShare(false)}
      />

      {showDetails && access.canEdit && (
        <TripDetailsModal
          workspace={workspace}
          open={showDetails}
          onClose={() => setShowDetails(false)}
          onSave={handleSaveDetails}
          saving={savingDetails}
        />
      )}

      {showPersonalOverview && access.canEdit && trip.tripType === 'personal' && (
        <PersonalOverviewModal
          workspace={workspace}
          tripId={id}
          open={showPersonalOverview}
          onClose={() => setShowPersonalOverview(false)}
          onSave={handleSavePersonalOverview}
          saving={savingPersonalOverview}
        />
      )}

      {(addItemCtx || editingItem) && access.canEdit && (
        <ItemModal
          open={!!(addItemCtx || editingItem)}
          dayNumber={addItemCtx?.dayNumber}
          editItem={editingItem}
          onClose={() => { setAddItemCtx(null); setEditingItem(null); }}
          onSave={editingItem ? handleUpdateItem : handleSaveItem}
          saving={savingItem}
        />
      )}

      {(addNoteCtx !== null) && access.canEdit && (
        <AddNoteModal
          open={addNoteCtx !== null}
          dayNumber={addNoteCtx?.dayNumber || null}
          onClose={() => { setAddNoteCtx(null); setEditNote(null); }}
          onSave={handleSaveNote}
          saving={savingNote}
          editNote={editNote}
        />
      )}

      {(bookingCtx !== null) && access.canEdit && (
        <BookingModal
          open={bookingCtx !== null}
          dayNumber={bookingCtx?.dayNumber || null}
          editBooking={editingBooking}
          stopCtx={bookingCtx?.stopCtx || null}
          availableDays={(workspace?.tripDays || []).sort((a, b) => a.dayNumber - b.dayNumber)}
          itineraryDayStops={workspace?.itineraryDayStops || []}
          tripItems={workspace?.tripItems || []}
          onClose={() => { setBookingCtx(null); setEditingBooking(null); }}
          onSave={handleSaveBooking}
          saving={savingBooking}
          tripStartDate={workspace?.trip?.startDate ? workspace.trip.startDate.slice(0, 10) : null}
          tripEndDate={workspace?.trip?.endDate   ? workspace.trip.endDate.slice(0, 10)   : null}
        />
      )}

      {/* Hide scrollbar on the tab row in all browsers */}
      <style>{`nav .workspace-tabs-inner::-webkit-scrollbar { display: none; }`}</style>
    </div>
  );
}
