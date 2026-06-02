// My Trips detail — traveller workspace
import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Calendar, Clock, Users, MapPin, Download, Pencil, Trash2,
  Plus, X, Map, FileText, Bookmark, BookOpen, Check, Star, ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useAuth } from '@clerk/clerk-react';
import { useApi } from '../lib/api';
import { itineraries as staticItineraries } from '../data/itineraries';
import { useSEO } from '../hooks/useSEO';
import { useIsMobile } from '../hooks/useIsMobile';

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
  { value: 'place',      label: 'Place to Visit' },
  { value: 'restaurant', label: 'Restaurant'     },
  { value: 'hotel',      label: 'Hotel / Stay'   },
  { value: 'transfer',   label: 'Transfer'       },
  { value: 'flight',     label: 'Flight'         },
  { value: 'event',      label: 'Event'          },
  { value: 'break',      label: 'Free Time'      },
  { value: 'note',       label: 'Note / Reminder'},
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

// ─────────────────────────────────────────────
// Primitive UI
// ─────────────────────────────────────────────
function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const esc = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(28,26,22,0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        padding: '0',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
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
            onClick={onClose}
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
// WorkspaceNav — sticky horizontal tab bar
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
        display: 'flex', overflowX: 'auto',
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

// ─────────────────────────────────────────────
// Mobile bottom nav
// ─────────────────────────────────────────────
function MobileNav({ activeTab, onChange }) {
  const primary = TABS.filter(t => ['overview','days','map','notes'].includes(t.id));
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      background: 'white', borderTop: `1px solid ${BORDER}`,
      display: 'flex', padding: '8px 0 20px',
    }}>
      {primary.map(({ id, label, Icon }) => {
        const active = activeTab === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '4px',
              background: 'none', border: 'none', cursor: 'pointer',
              color: active ? TEAL : '#B5A09A',
              transition: 'color 0.15s',
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '0.5px' }}>
              {label === 'Day by Day' ? 'Days' : label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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

  return (
    <Modal open={open} onClose={onClose} title="Your trip details" wide>
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
        <textarea
          value={form.generalNotes}
          onChange={e => set('generalNotes', e.target.value)}
          placeholder="Anything useful to remember..."
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '8px' }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving}>
          {saving ? 'Saving...' : 'Save details'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// AddItemModal — add custom item to a day
// ─────────────────────────────────────────────
function AddItemModal({ open, tripId, tripDayId, dayNumber, onClose, onSave, saving }) {
  const [form, setForm] = useState({ type: 'place', title: '', time: '', locationName: '', durationMinutes: '', notes: '' });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function reset() { setForm({ type: 'place', title: '', time: '', locationName: '', durationMinutes: '', notes: '' }); }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={`Add to Day ${dayNumber || ''}`}>
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
          <input type="text" value={form.time} onChange={e => set('time', e.target.value)} placeholder="e.g. 10:00" style={inputStyle} />
        </FormField>
        <FormField label="Duration in minutes (optional)">
          <input type="number" min="0" value={form.durationMinutes} onChange={e => set('durationMinutes', e.target.value)} placeholder="e.g. 90" style={inputStyle} />
        </FormField>
      </div>
      <FormField label="Location (optional)">
        <input type="text" value={form.locationName} onChange={e => set('locationName', e.target.value)} placeholder="e.g. Marrakech medina" style={inputStyle} />
      </FormField>
      <FormField label="Notes (optional)">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any details..." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button style={btnSecondary} onClick={() => { reset(); onClose(); }}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving || !form.title.trim()}>
          {saving ? 'Adding...' : 'Add item'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// AddNoteModal
// ─────────────────────────────────────────────
function AddNoteModal({ open, tripId, tripDayId, dayNumber, onClose, onSave, saving, editNote }) {
  const [form, setForm] = useState({ title: '', content: '' });
  useEffect(() => {
    if (open) setForm({ title: editNote?.title || '', content: editNote?.content || '' });
  }, [open, editNote]);
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  return (
    <Modal open={open} onClose={onClose} title={editNote ? 'Edit note' : dayNumber ? `Note for Day ${dayNumber}` : 'Add note'}>
      <FormField label="Title (optional)">
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Things to pack" style={inputStyle} />
      </FormField>
      <FormField label="Note">
        <textarea
          value={form.content}
          onChange={e => set('content', e.target.value)}
          placeholder="Write your note..."
          rows={5}
          style={{ ...inputStyle, resize: 'vertical' }}
          autoFocus
        />
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button style={btnSecondary} onClick={onClose}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving || !form.content.trim()}>
          {saving ? 'Saving...' : editNote ? 'Update note' : 'Save note'}
        </button>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// AddBookingModal
// ─────────────────────────────────────────────
function AddBookingModal({ open, tripId, tripDayId, dayNumber, onClose, onSave, saving }) {
  const [form, setForm] = useState({ type: 'hotel', title: '', date: '', time: '', locationName: '', provider: '', confirmationReference: '', notes: '', url: '' });
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function reset() { setForm({ type: 'hotel', title: '', date: '', time: '', locationName: '', provider: '', confirmationReference: '', notes: '', url: '' }); }

  return (
    <Modal open={open} onClose={() => { reset(); onClose(); }} title={dayNumber ? `Add booking — Day ${dayNumber}` : 'Add booking'} wide>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <FormField label="Type">
          <select value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}>
            {BOOKING_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </FormField>
        <FormField label="Date">
          <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle} />
        </FormField>
      </div>
      <FormField label="Name / Title">
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Riad Farnatchi" style={inputStyle} autoFocus />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px' }}>
        <FormField label="Time">
          <input type="text" value={form.time} onChange={e => set('time', e.target.value)} placeholder="e.g. 15:00" style={inputStyle} />
        </FormField>
        <FormField label="Provider">
          <input type="text" value={form.provider} onChange={e => set('provider', e.target.value)} placeholder="e.g. Booking.com" style={inputStyle} />
        </FormField>
      </div>
      <FormField label="Location">
        <input type="text" value={form.locationName} onChange={e => set('locationName', e.target.value)} placeholder="Address or area" style={inputStyle} />
      </FormField>
      <FormField label="Confirmation / Reference">
        <input type="text" value={form.confirmationReference} onChange={e => set('confirmationReference', e.target.value)} placeholder="e.g. #ABC123456" style={inputStyle} />
      </FormField>
      <FormField label="Booking URL (optional)">
        <input type="url" value={form.url} onChange={e => set('url', e.target.value)} placeholder="https://..." style={inputStyle} />
      </FormField>
      <FormField label="Notes (optional)">
        <textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Check-in time, contact, etc." rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      </FormField>
      <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
        <button style={btnSecondary} onClick={() => { reset(); onClose(); }}>Cancel</button>
        <button style={btnPrimary} onClick={() => onSave(form)} disabled={saving || !form.title.trim()}>
          {saving ? 'Adding...' : 'Save booking'}
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

function ItemCard({ item, onDelete }) {
  const color = TYPE_COLORS[item.type] || MUTED;
  const typeLabel = ITEM_TYPES.find(t => t.value === item.type)?.label || item.type;
  const timeDisplay = formatItemTime(item);
  const durationDisplay = formatDuration(item.durationMinutes);
  const metaParts = [timeDisplay, durationDisplay, item.locationName].filter(Boolean);

  return (
    <div style={{
      display: 'flex', gap: '12px', alignItems: 'flex-start',
      padding: '14px 16px', background: 'white',
      border: `1px solid ${BORDER}`, borderRadius: '8px',
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
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
      </div>
      <button
        onClick={() => onDelete(item.id)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8BFB5', padding: '2px', flexShrink: 0 }}
        title="Remove item"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────
// NoteCard
// ─────────────────────────────────────────────
function NoteCard({ note, onDelete, onEdit }) {
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
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => onEdit(note)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Pencil size={12} /> Edit
          </button>
          <button onClick={() => onDelete(note.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8BFB5', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BookingCard
// ─────────────────────────────────────────────
const CAT_COLORS = {
  hotel: TEAL, restaurant: '#D2622D', experience: GOLD,
  flight: '#4A2D7D', transfer: '#7D5A2D', event: '#2D7D4A', other: MUTED,
};

function BookingCard({ booking, onDelete }) {
  const color = CAT_COLORS[booking.type] || MUTED;
  const catLabel = BOOKING_CATEGORIES.find(c => c.value === booking.type)?.label || booking.type;

  return (
    <div style={{
      padding: '18px 20px', background: 'white',
      border: `1px solid ${BORDER}`, borderRadius: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
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
          </div>
          <p style={{ fontSize: '15px', fontWeight: '600', color: CHAR, marginBottom: '4px' }}>{booking.title}</p>
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
        <button onClick={() => onDelete(booking.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#C8BFB5', padding: '2px', flexShrink: 0 }}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// DaySection — one full day in the timeline
// ─────────────────────────────────────────────
function DaySection({ tripDay, itinDay, dayItems, dayNotes, isLast, assets, onAddItem, onAddNote, onDeleteItem }) {
  const [expanded, setExpanded] = useState(true);
  const [showActions, setShowActions] = useState(false);

  const title = tripDay.titleOverride || itinDay?.title || tripDay.title || `Day ${tripDay.dayNumber}`;
  const desc  = tripDay.descriptionOverride || itinDay?.description || tripDay.description || '';
  const bullets = itinDay?.bullets || [];
  const tip = itinDay?.tip || '';
  const img = getDayImage(tripDay.dayNumber, assets) || itinDay?.img || null;

  if (tripDay.isHidden) return null;

  return (
    <div style={{ display: 'flex', gap: '20px' }}>
      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{
          width: '36px', height: '36px', borderRadius: '50%',
          background: TEAL, color: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '13px', fontWeight: '700', flexShrink: 0, zIndex: 1,
        }}>
          {tripDay.dayNumber}
        </div>
        {!isLast && (
          <div style={{ width: '1px', flex: 1, background: BORDER, minHeight: '32px' }} />
        )}
      </div>

      {/* Content */}
      <div style={{ flex: 1, paddingBottom: '40px', minWidth: 0 }}>
        {/* Day header */}
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'none', border: 'none', cursor: 'pointer',
            textAlign: 'left', padding: 0, width: '100%', marginBottom: '10px',
          }}
        >
          <span style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.8px', textTransform: 'uppercase', color: TEAL }}>
            Day {tripDay.dayNumber}
          </span>
          <ChevronDown
            size={14}
            color={MUTED}
            style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.2s', marginLeft: 'auto' }}
          />
        </button>

        <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: expanded ? '10px' : '0', lineHeight: '1.3' }}>
          {title}
        </h3>

        {expanded && (
          <>
            {desc && (
              <p style={{ fontSize: '15px', color: MUTED, lineHeight: '1.75', marginBottom: bullets.length ? '14px' : '0' }}>
                {desc}
              </p>
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
                <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1.2px', textTransform: 'uppercase', color: GOLD, marginBottom: '4px' }}>
                  Insider Tip
                </p>
                <p style={{ fontSize: '13.5px', color: '#4A433A', lineHeight: '1.6' }}>{tip}</p>
              </div>
            )}

            {img && (
              <img
                src={img} alt={title}
                style={{ width: '100%', maxWidth: '460px', height: '200px', objectFit: 'cover', borderRadius: '8px', marginBottom: '16px' }}
              />
            )}

            {/* User items */}
            {dayItems.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {dayItems.map(item => (
                  <ItemCard key={item.id} item={item} onDelete={onDeleteItem} />
                ))}
              </div>
            )}

            {/* Day notes */}
            {dayNotes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                {dayNotes.map(n => (
                  <div key={n.id} style={{
                    padding: '10px 14px', background: `${GOLD}08`,
                    border: `1px dashed ${GOLD}40`, borderRadius: '6px',
                  }}>
                    {n.title && <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '1px', textTransform: 'uppercase', color: GOLD, marginBottom: '3px' }}>{n.title}</p>}
                    <p style={{ fontSize: '13px', color: CHAR, lineHeight: '1.5' }}>{n.content}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Add actions */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
              <button
                onClick={() => onAddItem(tripDay.id, tripDay.dayNumber)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '7px 13px', background: 'white',
                  border: `1px solid ${BORDER}`, borderRadius: '20px',
                  fontSize: '12px', fontWeight: '600', color: MUTED,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = TEAL; e.currentTarget.style.color = TEAL; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}
              >
                <Plus size={12} /> Add place
              </button>
              <button
                onClick={() => onAddNote(tripDay.id, tripDay.dayNumber)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '5px',
                  padding: '7px 13px', background: 'white',
                  border: `1px solid ${BORDER}`, borderRadius: '20px',
                  fontSize: '12px', fontWeight: '600', color: MUTED,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = GOLD; e.currentTarget.style.color = GOLD; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = BORDER; e.currentTarget.style.color = MUTED; }}
              >
                <FileText size={12} /> Add note
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// OverviewTab
// ─────────────────────────────────────────────
function OverviewTab({ workspace, onEditDetails }) {
  const isMobile = useIsMobile();
  const { trip, itinerary, tripNotes } = workspace;
  const content = parseContent(itinerary?.content);
  const highlights = content?.summary?.highlights || [];
  const bestFor    = content?.tripFacts?.bestFor || content?.summary?.bestFor || [];
  const tags       = content?.tags || bestFor;
  const whySpecial = content?.summary?.whySpecial || '';
  const routeOverview = content?.route?.overview || content?.route?.description || '';
  const description = itinerary?.description || trip.overview || '';

  const generalNotes = tripNotes?.filter(n => !n.tripDayId && !n.tripItemId) || [];

  // Trip details summary
  const hasDetails = trip.startDate || trip.travellers || trip.accommodationSummary || trip.arrivalInfo || trip.departureInfo || trip.generalNotes;

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr minmax(260px, 300px)', gap: isMobile ? '28px' : '40px', alignItems: 'start' }}>
        {/* Left — editorial content */}
        <div>
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
function DaysTab({ workspace, onAddItem, onAddNote, onDeleteItem }) {
  const { itinerary, tripDays, tripItems, tripNotes, assets } = workspace;
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
          return (
            <DaySection
              key={tripDay.id}
              tripDay={tripDay}
              itinDay={itinDay}
              dayItems={dayItems}
              dayNotes={dayNotes}
              isLast={i === sorted.length - 1}
              assets={assets}
              onAddItem={onAddItem}
              onAddNote={onAddNote}
              onDeleteItem={onDeleteItem}
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
function MapTab({ workspace }) {
  const { itinerary, tripItems } = workspace;
  const content = parseContent(itinerary?.content);
  const stops = content?.routeMap?.stops || [];
  const mapImageUrl = content?.routeMap?.imageUrl || null;
  const mapAlt = content?.routeMap?.alt || `${itinerary?.title || 'Route'} map`;

  const userPlaces = tripItems.filter(i => i.locationName || i.type === 'place');

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      {mapImageUrl && (
        <section style={{ marginBottom: '40px' }}>
          <img
            src={mapImageUrl}
            alt={mapAlt}
            style={{ width: '100%', borderRadius: '12px', maxHeight: '480px', objectFit: 'cover' }}
          />
          {content?.routeMap?.caption && (
            <p style={{ fontSize: '13px', color: MUTED, textAlign: 'center', marginTop: '10px' }}>
              {content.routeMap.caption}
            </p>
          )}
        </section>
      )}

      {stops.length > 0 && (
        <section style={{ marginBottom: '40px' }}>
          <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: '20px' }}>
            Route stops
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {stops.map((stop, i) => (
              <div key={i} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: TEAL, color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700' }}>
                    {i + 1}
                  </div>
                  {i < stops.length - 1 && <div style={{ width: '1px', flex: 1, background: BORDER, minHeight: '20px' }} />}
                </div>
                <div style={{ paddingBottom: '20px' }}>
                  <p style={{ fontSize: '14.5px', fontWeight: '600', color: CHAR }}>
                    {stop.name || stop.location || `Stop ${i + 1}`}
                  </p>
                  {stop.dayNumber && (
                    <p style={{ fontSize: '12px', color: MUTED }}>Day {stop.dayNumber}</p>
                  )}
                  {stop.description && (
                    <p style={{ fontSize: '13.5px', color: MUTED, lineHeight: '1.6', marginTop: '3px' }}>{stop.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {userPlaces.length > 0 && (
        <section>
          <h3 style={{ fontFamily: SERIF, fontSize: '20px', fontWeight: '600', color: CHAR, marginBottom: '16px' }}>
            Your places
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {userPlaces.map(place => (
              <div key={place.id} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '12px 14px', background: 'white', border: `1px solid ${BORDER}`, borderRadius: '8px' }}>
                <MapPin size={14} color={GOLD} style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: CHAR }}>{place.title}</p>
                  {place.locationName && <p style={{ fontSize: '12.5px', color: MUTED }}>{place.locationName}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {!mapImageUrl && stops.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px' }}>
          <Map size={40} color={BORDER} style={{ marginBottom: '16px' }} />
          <p style={{ fontSize: '15px', color: MUTED }}>No route map available for this itinerary.</p>
          <p style={{ fontSize: '13px', color: '#B5A09A', marginTop: '6px' }}>
            Add places with locations in Day by Day and they will appear here.
          </p>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// NotesTab
// ─────────────────────────────────────────────
function NotesTab({ workspace, onAddNote, onDeleteNote, onEditNote }) {
  const { tripNotes } = workspace;
  const general = tripNotes.filter(n => !n.tripDayId && !n.tripItemId);
  const day     = tripNotes.filter(n => n.tripDayId);

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '600', color: CHAR }}>Notes</h2>
        <button
          onClick={() => onAddNote(null, null)}
          style={{ ...btnPrimary, fontSize: '13px' }}
        >
          <Plus size={14} /> New note
        </button>
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
              <NoteCard key={n.id} note={n} onDelete={onDeleteNote} onEdit={onEditNote} />
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
              <NoteCard key={n.id} note={n} onDelete={onDeleteNote} onEdit={onEditNote} />
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
function BookingsTab({ workspace, onAddBooking, onDeleteBooking }) {
  const { tripBookings } = workspace;

  const byCategory = BOOKING_CATEGORIES.reduce((acc, cat) => {
    acc[cat.value] = tripBookings.filter(b => b.type === cat.value);
    return acc;
  }, {});

  const total = tripBookings.length;

  return (
    <div style={{ maxWidth: '720px', margin: '0 auto', padding: 'clamp(32px, 5vw, 56px) 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px' }}>
        <h2 style={{ fontFamily: SERIF, fontSize: '26px', fontWeight: '600', color: CHAR }}>
          Bookings {total > 0 && <span style={{ fontSize: '16px', color: MUTED }}>({total})</span>}
        </h2>
        <button onClick={() => onAddBooking(null, null)} style={{ ...btnPrimary, fontSize: '13px' }}>
          <Plus size={14} /> Add booking
        </button>
      </div>

      {total === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 24px', background: 'white', borderRadius: '12px', border: `1px solid ${BORDER}` }}>
          <Bookmark size={36} color={BORDER} style={{ marginBottom: '14px' }} />
          <p style={{ fontSize: '15px', color: MUTED, marginBottom: '6px' }}>No bookings yet</p>
          <p style={{ fontSize: '13px', color: '#B5A09A' }}>Track your hotels, flights, restaurants and experiences here.</p>
        </div>
      )}

      {BOOKING_CATEGORIES.map(({ value, label }) => {
        const items = byCategory[value] || [];
        if (!items.length) return null;
        return (
          <section key={value} style={{ marginBottom: '32px' }}>
            <p style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: CAT_COLORS[value] || MUTED, marginBottom: '12px' }}>
              {label}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {items.map(b => (
                <BookingCard key={b.id} booking={b} onDelete={onDeleteBooking} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// PdfTab
// ─────────────────────────────────────────────
function PdfTab({ workspace, onDownload, downloadState }) {
  const { trip, itinerary } = workspace;

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
          <div>
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
          <button
            onClick={onDownload}
            disabled={downloadState === 'downloading'}
            style={{
              ...btnPrimary,
              flexShrink: 0,
              opacity: downloadState === 'downloading' ? 0.7 : 1,
            }}
          >
            <Download size={14} />
            {downloadState === 'downloading' ? 'Preparing...' : 'Download'}
          </button>
        </div>
        {downloadState === 'error' && (
          <p style={{ fontSize: '12px', color: '#B04040', marginTop: '10px' }}>
            Download failed. Please try again.
          </p>
        )}
      </div>

      {/* Personalised PDF — coming soon */}
      <div style={{ background: STONE, border: `1px dashed ${BORDER}`, borderRadius: '12px', padding: '28px', opacity: 0.7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
          <div>
            <p style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: GOLD, marginBottom: '6px' }}>
              Personalised PDF
            </p>
            <p style={{ fontFamily: SERIF, fontSize: '18px', fontWeight: '600', color: CHAR, marginBottom: '6px' }}>
              Your custom guide
            </p>
            <p style={{ fontSize: '13.5px', color: MUTED }}>
              Includes your notes, bookings, custom places and travel dates.
            </p>
          </div>
          <span style={{
            flexShrink: 0, padding: '7px 14px', background: LIGHT,
            border: `1px solid ${BORDER}`, borderRadius: '6px',
            fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px', color: '#B5A09A',
          }}>
            Coming soon
          </span>
        </div>
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

  // Modal states
  const [showDetails, setShowDetails]       = useState(false);
  const [savingDetails, setSavingDetails]   = useState(false);
  const [addItemCtx, setAddItemCtx]         = useState(null);  // { dayId, dayNumber }
  const [savingItem, setSavingItem]         = useState(false);
  const [addNoteCtx, setAddNoteCtx]         = useState(null);  // { dayId, dayNumber } or null for general
  const [editNote, setEditNote]             = useState(null);  // note object for editing
  const [savingNote, setSavingNote]         = useState(false);
  const [addBookingCtx, setAddBookingCtx]   = useState(null);
  const [savingBooking, setSavingBooking]   = useState(false);

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

  // ── Download PDF ──────────────────────────────────────────────
  async function handleDownload() {
    if (!workspace || downloadState === 'downloading') return;
    setDownloadState('downloading');

    const { trip, itinerary } = workspace;
    const slug = itinerary?.slug || trip.itinerarySlug;

    const audit = () => api.post(`/api/trips?id=${id}`, {
      eventType: 'DOWNLOADED',
      metadata: { source: 'workspace_pdf', destination: trip.destination },
    }).catch(() => {});

    try {
      if (slug && (trip.source === 'FREE_JOURNEY' || trip.source === 'PREMIUM_JOURNEY')) {
        // Try to download the editorial PDF for catalog itineraries
        const matched = staticItineraries.find(it => it.id === slug || it.slug === slug);
        if (matched) {
          const { downloadItineraryPDF } = await import('../utils/downloadPDF');
          await downloadItineraryPDF(matched);
          setDownloadState('done');
          audit();
          return;
        }
      }

      // AI_GENERATED or unmatched: use TripPDF
      const [{ pdf }, { TripPDF }] = await Promise.all([
        import('@react-pdf/renderer'),
        import('../components/TripPDF'),
      ]);
      const { createElement } = await import('react');
      const blob = await pdf(createElement(TripPDF, { trip })).toBlob();
      const fn = `${(trip.destination || 'trip').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-itinerary.pdf`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = fn;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloadState('done');
      audit();
    } catch (err) {
      console.error('[TripDetailPage] download error:', err.message);
      setDownloadState('error');
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
    } catch (err) {
      alert('Could not save details. Please try again.');
    } finally {
      setSavingDetails(false);
    }
  }

  // ── Create TripItem ───────────────────────────────────────────
  async function handleSaveItem(form) {
    if (!addItemCtx) return;
    setSavingItem(true);
    try {
      const body = { ...form, tripDayId: addItemCtx.dayId };
      const res  = await api.post(`/api/trips?id=${id}&action=item`, body);
      if (!res.ok) throw new Error('Save failed');
      const { id: newId } = await res.json();
      const newItem = { id: newId, tripId: id, tripDayId: addItemCtx.dayId, ...form, status: 'planned', isHidden: false, sortOrder: 0, createdAt: new Date().toISOString() };
      setWorkspace(w => ({ ...w, tripItems: [...w.tripItems, newItem] }));
      setAddItemCtx(null);
    } catch {
      alert('Could not add item. Please try again.');
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

  // ── Create TripBooking ────────────────────────────────────────
  async function handleSaveBooking(form) {
    setSavingBooking(true);
    try {
      const body = { ...form, tripDayId: addBookingCtx?.dayId || null };
      const res  = await api.post(`/api/trips?id=${id}&action=booking`, body);
      if (!res.ok) throw new Error('Save failed');
      const { id: newId } = await res.json();
      const newBooking = { id: newId, tripId: id, tripDayId: addBookingCtx?.dayId || null, ...form, createdAt: new Date().toISOString() };
      setWorkspace(w => ({ ...w, tripBookings: [...w.tripBookings, newBooking] }));
      setAddBookingCtx(null);
    } catch {
      alert('Could not save booking. Please try again.');
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
  const heroImage = getHeroImage(trip, itinerary, assets);
  const title     = itinerary?.title || trip.title || trip.destination;
  const subtitle  = trip.subtitle || itinerary?.subtitle || '';
  const destination = itinerary?.destination || trip.country || '';
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

        {/* Back + delete row */}
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
        </div>

        {/* Hero content */}
        <div style={{ position: 'relative', zIndex: 10, padding: 'clamp(32px, 5vw, 56px) 24px 40px', maxWidth: '760px' }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '5px',
            padding: '4px 10px', marginBottom: '14px',
            background: 'rgba(201,169,110,0.2)', border: '1px solid rgba(201,169,110,0.4)',
            borderRadius: '3px',
          }}>
            <span style={{ fontSize: '9.5px', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', color: GOLD }}>
              Personal trip copy
            </span>
          </div>

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
          </div>
        </div>
      </section>

      {/* ── Workspace nav ──────────────────────────────────── */}
      <WorkspaceNav activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Tab content ─────────────────────────────────────── */}
      <div style={{ paddingBottom: '100px' }}>
        {activeTab === 'overview' && (
          <OverviewTab workspace={workspace} onEditDetails={() => setShowDetails(true)} />
        )}

        {activeTab === 'days' && (
          <DaysTab
            workspace={workspace}
            onAddItem={(dayId, dayNumber) => setAddItemCtx({ dayId, dayNumber })}
            onAddNote={(dayId, dayNumber) => setAddNoteCtx({ dayId, dayNumber })}
            onDeleteItem={handleDeleteItem}
          />
        )}

        {activeTab === 'map' && <MapTab workspace={workspace} />}

        {activeTab === 'notes' && (
          <NotesTab
            workspace={workspace}
            onAddNote={(dayId, dayNumber) => setAddNoteCtx({ dayId, dayNumber })}
            onDeleteNote={handleDeleteNote}
            onEditNote={note => { setEditNote(note); setAddNoteCtx({}); }}
          />
        )}

        {activeTab === 'bookings' && (
          <BookingsTab
            workspace={workspace}
            onAddBooking={(dayId, dayNumber) => setAddBookingCtx({ dayId, dayNumber })}
            onDeleteBooking={handleDeleteBooking}
          />
        )}

        {activeTab === 'pdf' && (
          <PdfTab workspace={workspace} onDownload={handleDownload} downloadState={downloadState} />
        )}
      </div>

      {/* ── Mobile bottom nav ──────────────────────────────── */}
      <div style={{ display: 'none' }} className="mobile-nav-wrapper">
        <MobileNav activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* ── Modals ─────────────────────────────────────────── */}
      {showDetails && (
        <TripDetailsModal
          workspace={workspace}
          open={showDetails}
          onClose={() => setShowDetails(false)}
          onSave={handleSaveDetails}
          saving={savingDetails}
        />
      )}

      {addItemCtx && (
        <AddItemModal
          open={!!addItemCtx}
          tripId={id}
          tripDayId={addItemCtx.dayId}
          dayNumber={addItemCtx.dayNumber}
          onClose={() => setAddItemCtx(null)}
          onSave={handleSaveItem}
          saving={savingItem}
        />
      )}

      {(addNoteCtx !== null) && (
        <AddNoteModal
          open={addNoteCtx !== null}
          tripId={id}
          tripDayId={addNoteCtx?.dayId || null}
          dayNumber={addNoteCtx?.dayNumber || null}
          onClose={() => { setAddNoteCtx(null); setEditNote(null); }}
          onSave={handleSaveNote}
          saving={savingNote}
          editNote={editNote}
        />
      )}

      {addBookingCtx && (
        <AddBookingModal
          open={!!addBookingCtx}
          tripId={id}
          tripDayId={addBookingCtx?.dayId || null}
          dayNumber={addBookingCtx?.dayNumber || null}
          onClose={() => setAddBookingCtx(null)}
          onSave={handleSaveBooking}
          saving={savingBooking}
        />
      )}

      {/* Mobile nav — CSS media query controlled */}
      <style>{`
        @media (max-width: 640px) {
          .mobile-nav-wrapper { display: block !important; }
        }
      `}</style>
    </div>
  );
}
