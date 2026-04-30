import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Check, X, Filter, ChevronRight, ExternalLink, Send, UserCircle, Plus } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useUserCtx } from '../../lib/useUserCtx.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_META = {
  open:        { label: 'Request received',        color: '#1B6B65', bg: '#EFF6F5' },
  in_progress: { label: 'Building your itinerary', color: '#A07830', bg: '#FBF6EE' },
  done:        { label: 'Ready',                   color: '#166534', bg: '#DCFCE7' },
};
const ALL_STATUSES          = Object.keys(STATUS_META);
const DEFAULT_STATUS_FILTER = ['open', 'in_progress'];

const PAYMENT_META = {
  unpaid: { label: 'Unpaid', color: '#8C8070', bg: '#F4F1EC' },
  paid:   { label: 'Paid',   color: '#1B6B65', bg: '#EFF6F5' },
};
const ALL_PAYMENT_STATUSES = Object.keys(PAYMENT_META);

const NEXT_STATUS = {
  open:        { value: 'in_progress', label: '→ Building'   },
  in_progress: { value: 'done',        label: '→ Mark Ready' },
  done:        { value: 'open',        label: 'Reopen'       },
};

// ── Column definitions ────────────────────────────────────────────────────────
const PRIMARY_COLS = [
  { id: 'createdAt',     label: 'Date',        field: 'createdAt',     type: 'date',    minW: 100 },
  { id: 'fullName',      label: 'Name',         field: 'fullName',      type: 'text',    minW: 110 },
  { id: 'email',         label: 'Email',        field: 'email',         type: 'text',    minW: 152 },
  { id: 'destination',   label: 'Destination',  field: 'destination',   type: 'text',    minW: 100 },
  { id: 'dates',         label: 'Trip Date',    field: 'dates',         type: 'text',    minW: 88  },
  { id: 'duration',      label: 'Duration',     field: 'duration',      type: 'text',    minW: 64  },
  { id: 'groupSize',     label: 'Pax',          field: 'groupSize',     type: 'number',  minW: 46  },
  { id: 'status',        label: 'Status',       field: 'status',        type: 'status',  minW: 190 },
  { id: 'paymentStatus', label: 'Payment',      field: 'paymentStatus', type: 'payment', minW: 150 },
];

const SECONDARY_COLS = [
  { id: 'phone',     label: 'Phone',       field: 'phone',     type: 'text'  },
  { id: 'groupType', label: 'Group Type',  field: 'groupType', type: 'text'  },
  { id: 'budget',    label: 'Budget',      field: 'budget',    type: 'text'  },
  { id: 'style',     label: 'Style',       field: 'style',     type: 'style' },
  { id: 'notes',     label: 'Notes',       field: 'notes',     type: 'text'  },
];

const COLUMNS  = [...PRIMARY_COLS, ...SECONDARY_COLS];
const PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function styleText(val) {
  if (Array.isArray(val)) return val.join(', ');
  if (typeof val === 'string') {
    try { return JSON.parse(val).join(', '); } catch { return val; }
  }
  return '';
}

function getSortValue(row, col) {
  const raw = row[col.field];
  if (col.type === 'style')  return styleText(raw).toLowerCase();
  if (col.type === 'number') return raw != null ? Number(raw) : -Infinity;
  if (col.type === 'date')   return raw ? new Date(raw).getTime() : 0;
  return String(raw ?? '').toLowerCase();
}

function sortRows(rows, key, dir) {
  if (!key) return rows;
  const col = COLUMNS.find(c => c.id === key);
  if (!col) return rows;
  return [...rows].sort((a, b) => {
    const av = getSortValue(a, col);
    const bv = getSortValue(b, col);
    const aEmpty = av === '' || av === -Infinity;
    const bEmpty = bv === '' || bv === -Infinity;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    const cmp = col.type === 'number' || col.type === 'date'
      ? av - bv
      : String(av).localeCompare(String(bv));
    return dir === 'asc' ? cmp : -cmp;
  });
}

function matchesFilter(row, col, filterVal) {
  if (col.type === 'status') {
    if (!filterVal || filterVal.length === 0 || filterVal.length === ALL_STATUSES.length) return true;
    return filterVal.includes(row[col.field] || 'open');
  }
  if (col.type === 'payment') {
    if (!filterVal || filterVal.length === 0 || filterVal.length === ALL_PAYMENT_STATUSES.length) return true;
    return filterVal.includes(row.isPaid ? 'paid' : 'unpaid');
  }
  if (!filterVal) return true;
  const search = String(filterVal).toLowerCase().trim();
  if (!search) return true;
  const raw = row[col.field];
  const display = col.type === 'style' ? styleText(raw) : String(raw ?? '');
  return display.toLowerCase().includes(search);
}

function initFilters() {
  const f = {};
  for (const col of COLUMNS) {
    if (col.type === 'status')  f[col.id] = [...DEFAULT_STATUS_FILTER];
    else if (col.type === 'payment') f[col.id] = [...ALL_PAYMENT_STATUSES];
    else f[col.id] = '';
  }
  return f;
}

function emptyFilters() {
  const f = {};
  for (const col of COLUMNS) {
    if (col.type === 'status')  f[col.id] = [...ALL_STATUSES];
    else if (col.type === 'payment') f[col.id] = [...ALL_PAYMENT_STATUSES];
    else f[col.id] = '';
  }
  return f;
}

function isFilterActive(col, filterVal) {
  if (col.type === 'status')  return filterVal.length > 0 && filterVal.length < ALL_STATUSES.length;
  if (col.type === 'payment') return filterVal.length > 0 && filterVal.length < ALL_PAYMENT_STATUSES.length;
  return !!filterVal;
}

function renderSortIcon(colId, sort) {
  if (sort.key !== colId) return <ChevronsUpDown size={10} color="#C4BDB4" />;
  return sort.dir === 'asc'
    ? <ChevronUp   size={10} color="#1B6B65" />
    : <ChevronDown size={10} color="#1B6B65" />;
}

// ── Detail field ──────────────────────────────────────────────────────────────
function DetailField({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p style={{ fontSize: '10px', fontWeight: '600', color: '#B5AA99', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>
        {label}
      </p>
      <p style={{ fontSize: '12.5px', color: '#4A433A', lineHeight: '1.4' }}>{value}</p>
    </div>
  );
}

// ── Status filter inside popover ──────────────────────────────────────────────
function CheckboxPopoverFilter({ meta, allKeys, value, onChange }) {
  function toggle(s) {
    onChange(value.includes(s) ? value.filter(x => x !== s) : [...value, s]);
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {allKeys.map(s => {
          const m       = meta[s];
          const checked = value.includes(s);
          return (
            <button key={s} onClick={() => toggle(s)} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 8px',
              background: checked ? '#FAFAF8' : 'transparent',
              border: `1px solid ${checked ? '#E8E3DA' : 'transparent'}`,
              borderRadius: '5px', cursor: 'pointer', textAlign: 'left',
            }}>
              <div style={{
                width: '13px', height: '13px', borderRadius: '2px', flexShrink: 0,
                border: `2px solid ${checked ? m.color : '#D4CCBF'}`,
                background: checked ? m.color : 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {checked && <Check size={8} color="white" strokeWidth={3} />}
              </div>
              <span style={{ fontSize: '12.5px', color: '#1C1A16' }}>{m.label}</span>
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: '1px solid #F4F1EC', marginTop: '8px', paddingTop: '8px', display: 'flex', gap: '12px' }}>
        <button onClick={() => onChange([...allKeys])} style={{ fontSize: '11px', color: '#1B6B65', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>All</button>
        <button onClick={() => onChange([])}           style={{ fontSize: '11px', color: '#8C8070',  background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>None</button>
      </div>
    </div>
  );
}

// ── FilterPopover ─────────────────────────────────────────────────────────────
function FilterPopover({ col, value, onChange, onClose, anchorRect }) {
  const ref      = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (col.type !== 'status' && col.type !== 'payment') inputRef.current?.focus();
  }, [col.type]);

  useEffect(() => {
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) onClose(); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    function onScroll() { onClose(); }
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [onClose]);

  const left = Math.min(anchorRect.left, window.innerWidth - 252);
  const top  = anchorRect.bottom + 6;

  return (
    <div ref={ref} style={{
      position: 'fixed', top, left, zIndex: 9999,
      background: 'white',
      border: '1px solid #E8E3DA', borderRadius: '8px',
      boxShadow: '0 8px 28px rgba(28,26,22,0.14)',
      minWidth: '236px', padding: '14px',
    }}>
      <p style={{ fontSize: '10.5px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
        {col.label}
      </p>

      {col.type === 'status' ? (
        <CheckboxPopoverFilter meta={STATUS_META} allKeys={ALL_STATUSES} value={value} onChange={onChange} />
      ) : col.type === 'payment' ? (
        <CheckboxPopoverFilter meta={PAYMENT_META} allKeys={ALL_PAYMENT_STATUSES} value={value} onChange={onChange} />
      ) : (
        <>
          <input
            ref={inputRef}
            type={col.type === 'number' ? 'number' : 'text'}
            placeholder="Search…"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onClose(); }}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px',
              border: '1px solid #D4CCBF', borderRadius: '4px',
              fontSize: '12.5px', color: '#1C1A16', background: 'white', outline: 'none',
            }}
            onFocus={e => { e.target.style.borderColor = '#1B6B65'; }}
            onBlur={e  => { e.target.style.borderColor = '#D4CCBF'; }}
          />
          {value ? (
            <button
              onClick={() => onChange('')}
              style={{
                marginTop: '8px', width: '100%', padding: '5px 0',
                background: 'none', border: '1px solid #E8E3DA', borderRadius: '4px',
                fontSize: '11.5px', color: '#8C8070', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
              }}
            >
              <X size={10} /> Clear
            </button>
          ) : (
            <p style={{ fontSize: '11px', color: '#C4BDB4', marginTop: '6px', textAlign: 'center' }}>
              Press Enter to apply
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── ColHeader ─────────────────────────────────────────────────────────────────
function ColHeader({ col, sort, onSort, filterActive, onOpenFilter }) {
  const [hovered, setHovered] = useState(false);

  return (
    <th
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: '9px 10px', textAlign: 'left',
        background: '#FAFAF8', borderBottom: '1px solid #E8E3DA',
        whiteSpace: 'nowrap', minWidth: `${col.minW}px`, userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        <button
          onClick={() => onSort(col.id)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '3px',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: sort.key === col.id ? '#1C1A16' : '#6B6156',
            fontWeight: '600', fontSize: '10.5px',
            textTransform: 'uppercase', letterSpacing: '0.4px',
          }}
        >
          {col.label}
          {renderSortIcon(col.id, sort)}
        </button>
        <button
          onClick={e => { e.stopPropagation(); onOpenFilter(col.id, e.currentTarget.getBoundingClientRect()); }}
          title={`Filter ${col.label}`}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: '18px', height: '18px', flexShrink: 0,
            background: filterActive ? '#EFF6F5' : 'transparent',
            border: `1px solid ${filterActive ? '#A8D5D0' : 'transparent'}`,
            borderRadius: '3px', cursor: 'pointer', padding: 0,
            opacity: hovered || filterActive ? 1 : 0,
            transition: 'opacity 0.12s',
          }}
        >
          <Filter size={9} color={filterActive ? '#1B6B65' : '#9C9488'} />
        </button>
      </div>
    </th>
  );
}

// ── StatusAction — workflow status badge + advance button ─────────────────────
function StatusAction({ requestId, current, linkedItineraryStatus, onUpdated, token }) {
  const [loading,     setLoading]     = useState(false);
  const [confirming,  setConfirming]  = useState(false);

  async function doAdvance(next, confirm = false) {
    setLoading(true);
    try {
      const body = { id: requestId, status: next };
      if (confirm) body.confirm = true;
      const res  = await fetch(`/api/admin?action=custom-request-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.needsConfirm) {
        setConfirming(true);
        return;
      }
      onUpdated(requestId, next);
    } catch (err) {
      console.error('[admin/custom-requests] status update failed:', err);
    } finally { setLoading(false); }
  }

  function advance() {
    const next = NEXT_STATUS[current]?.value;
    if (!next) return;
    doAdvance(next);
  }

  function confirmPublish() {
    setConfirming(false);
    doAdvance('done', true);
  }

  const m    = STATUS_META[current] ?? STATUS_META.open;
  const next = NEXT_STATUS[current];

  if (confirming) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxWidth: '260px' }}>
        <p style={{ fontSize: '11px', color: '#4A433A', lineHeight: '1.4', margin: 0 }}>
          The linked itinerary is still a draft. Mark ready and publish it now?
        </p>
        <div style={{ display: 'flex', gap: '6px' }}>
          <button onClick={confirmPublish} disabled={loading} style={{
            fontSize: '11px', fontWeight: '600', color: 'white', background: '#1B6B65',
            border: 'none', borderRadius: '6px',
            padding: '4px 10px', cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
          }}>
            {loading ? '…' : 'Publish + Mark Ready'}
          </button>
          <button onClick={() => setConfirming(false)} disabled={loading} style={{
            fontSize: '11px', fontWeight: '500', color: '#6B6156', background: 'white',
            border: '1px solid #E8E3DA', borderRadius: '6px',
            padding: '4px 10px', cursor: 'pointer',
          }}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap' }}>
      <span style={{
        fontSize: '11px', fontWeight: '600', color: m.color, background: m.bg,
        padding: '3px 9px', borderRadius: '10px', whiteSpace: 'nowrap',
      }}>
        {m.label}
      </span>
      {next && (
        <button onClick={advance} disabled={loading} style={{
          fontSize: '11px', fontWeight: '500', color: '#4A433A', background: 'white',
          border: '1px solid #E8E3DA', borderRadius: '6px',
          padding: '3px 9px', cursor: loading ? 'wait' : 'pointer',
          whiteSpace: 'nowrap', opacity: loading ? 0.6 : 1,
        }}>
          {loading ? '…' : next.label}
        </button>
      )}
    </div>
  );
}

// ── PaymentBadge ──────────────────────────────────────────────────────────────
function PaymentBadge({ isPaid }) {
  const m = isPaid ? PAYMENT_META.paid : PAYMENT_META.unpaid;
  return (
    <span style={{
      fontSize: '11px', fontWeight: '600', color: m.color, background: m.bg,
      padding: '3px 9px', borderRadius: '10px', whiteSpace: 'nowrap',
    }}>
      {m.label}
    </span>
  );
}

// ── DesignerCell — shows designer name or unassigned badge (admin only) ───────
function DesignerCell({ requestId, designerId, designerName, designers, token, onAssigned }) {
  const [open, setOpen]       = useState(false);
  const [saving, setSaving]   = useState(false);
  const ref                   = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function assign(newId) {
    setSaving(true);
    setOpen(false);
    try {
      await fetch('/api/admin?action=custom-request-assign', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: requestId, designerId: newId || null }),
      });
      const found = designers.find(d => d.id === newId);
      onAssigned(requestId, newId || null, found?.name ?? null, found?.email ?? null);
    } catch (err) {
      console.error('[admin/assign-designer]', err);
    } finally { setSaving(false); }
  }

  const label = designerName ?? null;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        disabled={saving}
        title={label ? `Assigned to ${label} — click to change` : 'Unassigned — click to assign'}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '3px 8px',
          background: label ? '#EFF6F5' : '#F4F1EC',
          border: `1px solid ${label ? '#A8D5D0' : '#D4CCBF'}`,
          borderRadius: '10px', cursor: saving ? 'wait' : 'pointer',
          fontSize: '11px', fontWeight: '600',
          color: label ? '#1B6B65' : '#8C8070',
          whiteSpace: 'nowrap',
          opacity: saving ? 0.6 : 1,
        }}
      >
        <UserCircle size={11} />
        {saving ? '…' : (label ?? 'Unassigned')}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 9999,
          marginTop: '4px', background: 'white',
          border: '1px solid #E8E3DA', borderRadius: '8px',
          boxShadow: '0 8px 28px rgba(28,26,22,0.14)',
          minWidth: '200px', padding: '6px',
        }}>
          <button
            onClick={() => assign(null)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '7px 10px', fontSize: '12.5px',
              color: designerId ? '#4A433A' : '#1B6B65',
              fontWeight: designerId ? '400' : '600',
              background: designerId ? 'transparent' : '#EFF6F5',
              border: 'none', borderRadius: '5px', cursor: 'pointer',
            }}
          >
            Unassigned
          </button>
          {designers.map(d => (
            <button
              key={d.id}
              onClick={() => assign(d.id)}
              style={{
                display: 'block', width: '100%', textAlign: 'left',
                padding: '7px 10px', fontSize: '12.5px',
                color: d.id === designerId ? '#1B6B65' : '#4A433A',
                fontWeight: d.id === designerId ? '600' : '400',
                background: d.id === designerId ? '#EFF6F5' : 'transparent',
                border: 'none', borderRadius: '5px', cursor: 'pointer',
              }}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── ReplyModal ────────────────────────────────────────────────────────────────
function ReplyModal({ request, token, onClose }) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState(null);
  const textareaRef           = useRef(null);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function send() {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const res  = await fetch('/api/admin?action=custom-request-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: request.id, message: message.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send');
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(15,26,24,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{
        background: 'white', borderRadius: '12px',
        padding: '28px', width: '100%', maxWidth: '520px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.25)',
      }}>
        {sent ? (
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: '#EFF6F5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <Check size={22} color="#1B6B65" />
            </div>
            <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '15px', marginBottom: '6px' }}>Message sent</p>
            <p style={{ fontSize: '13px', color: '#8C8070', marginBottom: '20px' }}>
              Your message was delivered to <strong>{request.email}</strong>.
            </p>
            <button onClick={onClose} style={{ padding: '8px 20px', background: '#1B6B65', color: 'white', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>
              Close
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '18px' }}>
              <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '17px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>
                Reply to client
              </h3>
              <p style={{ fontSize: '12.5px', color: '#8C8070' }}>
                Sending to <strong>{request.fullName}</strong> at <a href={`mailto:${request.email}`} style={{ color: '#1B6B65' }}>{request.email}</a>
              </p>
            </div>

            <textarea
              ref={textareaRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Write your message to the client…"
              rows={6}
              style={{
                width: '100%', boxSizing: 'border-box',
                padding: '10px 12px',
                border: '1px solid #D4CCBF', borderRadius: '6px',
                fontSize: '13.5px', color: '#1C1A16', lineHeight: '1.6',
                resize: 'vertical', outline: 'none', fontFamily: 'inherit',
              }}
              onFocus={e => { e.target.style.borderColor = '#1B6B65'; }}
              onBlur={e  => { e.target.style.borderColor = '#D4CCBF'; }}
            />

            {error && (
              <p style={{ fontSize: '12px', color: '#B91C1C', marginTop: '8px' }}>{error}</p>
            )}

            <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '8px' }}>
              Sent from HiddenAtlas &lt;noreply@hiddenatlas.travel&gt;. The client's reply will go to the designer's email address.
            </p>

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
              <button onClick={onClose} style={{ padding: '8px 16px', background: 'white', color: '#4A433A', border: '1px solid #E8E3DA', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button
                onClick={send}
                disabled={!message.trim() || sending}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  padding: '8px 18px', background: '#1B6B65', color: 'white',
                  border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600',
                  cursor: (!message.trim() || sending) ? 'not-allowed' : 'pointer',
                  opacity: (!message.trim() || sending) ? 0.6 : 1,
                }}
              >
                <Send size={13} />
                {sending ? 'Sending…' : 'Send message'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function Toast({ message, onDismiss }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      zIndex: 10001, background: '#1C1A16', color: 'white',
      padding: '10px 18px', borderRadius: '8px',
      fontSize: '13px', fontWeight: '500',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      display: 'flex', alignItems: 'center', gap: '10px',
      whiteSpace: 'nowrap',
    }}>
      <Check size={14} color="#4ADE80" />
      {message}
      <button
        onClick={onDismiss}
        style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', padding: '0 0 0 6px', display: 'flex', alignItems: 'center' }}
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CustomRequestsPage() {
  const { getToken }                              = useAuth();
  const { isAdmin, isDesigner }                   = useUserCtx();
  const navigate                                  = useNavigate();
  const [allRows, setAllRows]                     = useState([]);
  const [designers, setDesigners]                 = useState([]);
  const [designerFilter, setDesignerFilter]       = useState('');
  const [counts, setCounts]                       = useState({});
  const [paymentCounts, setPaymentCounts]         = useState({});
  const [loading, setLoading]                     = useState(true);
  const [authToken, setAuthToken]                 = useState(null);
  const [sort, setSort]                           = useState({ key: 'createdAt', dir: 'desc' });
  const [filters, setFilters]                     = useState(initFilters);
  const [page, setPage]                           = useState(1);
  const [popover, setPopover]                     = useState(null);
  const [expandedRows, setExpandedRows]           = useState(new Set());
  const [replyModal, setReplyModal]               = useState(null);
  const [creatingItinerary, setCreatingItinerary] = useState(new Set());
  const [toast, setToast]                         = useState(null);
  const isMobile                                  = useIsMobile();

  // Extra columns rendered manually (not in PRIMARY_COLS filter system)
  // Admin: expand + 9 data cols + Itinerary + Designer = 12; designer: expand + 9 + Itinerary = 11
  const COL_SPAN = PRIMARY_COLS.length + 2 + (isAdmin ? 1 : 0);

  useEffect(() => {
    getToken().then(setAuthToken).catch(() => {});
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res   = await fetch(`/api/admin?action=custom-requests&all=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAllRows(data.requests       ?? []);
      setDesigners(data.designers    ?? []);
      setCounts(data.counts          ?? {});
      setPaymentCounts(data.paymentCounts ?? {});
    } catch (err) {
      console.error('[admin/custom-requests]', err);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  function handleStatusUpdated(id, newStatus) {
    setAllRows(prev => {
      const row = prev.find(r => r.id === id);
      if (row) {
        const old = row.status || 'open';
        setCounts(c => ({
          ...c,
          [old]:      Math.max(0, (c[old]      ?? 0) - 1),
          [newStatus]:           (c[newStatus]  ?? 0) + 1,
        }));
      }
      return prev.map(r => r.id === id ? { ...r, status: newStatus } : r);
    });
  }

  function handleDesignerAssigned(id, designerId, designerName, designerEmail) {
    setAllRows(prev => prev.map(r =>
      r.id === id ? { ...r, designerId, designerName: designerName ?? null, designerEmail: designerEmail ?? null } : r
    ));
  }

  async function handleCreateItinerary(requestId) {
    if (creatingItinerary.has(requestId) || !authToken) return;
    setCreatingItinerary(prev => new Set([...prev, requestId]));
    try {
      const res  = await fetch('/api/admin?action=create-itinerary-from-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ id: requestId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create itinerary');
      const { itineraryId, isNew, title } = data;
      setAllRows(prev => prev.map(r =>
        r.id === requestId ? { ...r, itineraryId, linkedItineraryTitle: title ?? r.linkedItineraryTitle } : r
      ));
      if (isNew) setToast('Custom itinerary created and linked to this request.');
      navigate(`/admin/itineraries/${itineraryId}`);
    } catch (err) {
      console.error('[admin/create-itinerary]', err);
      setToast(`Error: ${err.message}`);
    } finally {
      setCreatingItinerary(prev => { const next = new Set(prev); next.delete(requestId); return next; });
    }
  }

  function setFilter(colId, val) {
    setFilters(prev => ({ ...prev, [colId]: val }));
    setPage(1);
  }

  function clearAllFilters() {
    setFilters(emptyFilters());
    setDesignerFilter('');
    setPage(1);
  }

  function handleSort(colId) {
    setSort(prev =>
      prev.key === colId
        ? { key: colId, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key: colId, dir: 'asc' }
    );
  }

  function openFilterPopover(colId, rect) {
    setPopover(prev => prev?.colId === colId ? null : { colId, anchorRect: rect });
  }

  function closePopover() { setPopover(null); }

  function toggleExpand(id) {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Derived data ─────────────────────────────────────────────────────────────
  const { filteredRows, filteredTotal } = useMemo(() => {
    let rows = allRows;
    for (const col of COLUMNS) {
      const fv = filters[col.id];
      if (fv !== '' && fv !== undefined) {
        rows = rows.filter(r => matchesFilter(r, col, fv));
      }
    }
    if (designerFilter) {
      rows = rows.filter(r => r.designerId === designerFilter);
    }
    rows = sortRows(rows, sort.key, sort.dir);
    return { filteredRows: rows, filteredTotal: rows.length };
  }, [allRows, filters, designerFilter, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const pageRows   = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilterCount = useMemo(() => {
    const colCount = COLUMNS.reduce((n, col) => isFilterActive(col, filters[col.id]) ? n + 1 : n, 0);
    return colCount + (designerFilter ? 1 : 0);
  }, [filters, designerFilter]);

  const TD = { padding: '9px 10px' };

  // ── Mobile card ───────────────────────────────────────────────────────────────
  function MobileCard({ r, i }) {
    const sm = STATUS_META[r.status] ?? STATUS_META.open;
    const pm = PAYMENT_META[r.isPaid ? 'paid' : 'unpaid'];
    return (
      <div style={{ padding: '14px 16px', borderTop: i > 0 ? '1px solid #F4F1EC' : 'none', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '13px' }}>{r.fullName || '—'}</p>
            <a href={`mailto:${r.email}`} style={{ color: '#1B6B65', fontSize: '12px', textDecoration: 'none' }}>{r.email}</a>
          </div>
          <div style={{ display: 'flex', gap: '5px', flexShrink: 0, marginLeft: '10px' }}>
            <span style={{ fontSize: '10.5px', fontWeight: '600', color: sm.color, background: sm.bg, padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
              {sm.label}
            </span>
            <span style={{ fontSize: '10.5px', fontWeight: '600', color: pm.color, background: pm.bg, padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap' }}>
              {pm.label}
            </span>
          </div>
        </div>
        {isAdmin && r.designerName && (
          <p style={{ fontSize: '11px', color: '#8C8070', marginBottom: '6px' }}>
            <span style={{ color: '#B5AA99' }}>Designer: </span>{r.designerName}
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', color: '#4A433A' }}>
            <span style={{ color: '#B5AA99', fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>To </span>
            {r.destination || '—'}
          </span>
          {r.dates     && <span style={{ fontSize: '12px', color: '#4A433A' }}>{r.dates}</span>}
          {r.duration  && <span style={{ fontSize: '12px', color: '#4A433A' }}>{r.duration}</span>}
          {r.groupSize != null && <span style={{ fontSize: '12px', color: '#4A433A' }}>{r.groupSize} pax</span>}
          {r.budget    && <span style={{ fontSize: '12px', color: '#4A433A' }}>{r.budget}</span>}
        </div>
        {r.notes && (
          <p style={{ fontSize: '11.5px', color: '#6B6156', lineHeight: '1.4', marginBottom: '8px' }}>
            {r.notes.length > 100 ? r.notes.slice(0, 100) + '…' : r.notes}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#B5AA99' }}>{fmtDate(r.createdAt)}</span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            {authToken && (
              <StatusAction requestId={r.id} current={r.status || 'open'} linkedItineraryStatus={r.linkedItineraryStatus} onUpdated={handleStatusUpdated} token={authToken} />
            )}
            <PaymentBadge isPaid={r.isPaid} />
            {r.itineraryId ? (
              <Link
                to={`/admin/itineraries/${r.itineraryId}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', fontWeight: '500', color: '#1B6B65',
                  background: '#EFF6F5', border: '1px solid #A8D5D0',
                  padding: '3px 9px', borderRadius: '6px', textDecoration: 'none',
                }}
              >
                Open itinerary <ExternalLink size={10} />
              </Link>
            ) : (isAdmin || isDesigner) ? (
              <button
                onClick={() => handleCreateItinerary(r.id)}
                disabled={creatingItinerary.has(r.id)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', fontWeight: '500', color: '#6B6156',
                  background: 'white', border: '1px solid #D4CCBF',
                  padding: '3px 9px', borderRadius: '6px',
                  cursor: creatingItinerary.has(r.id) ? 'wait' : 'pointer',
                  opacity: creatingItinerary.has(r.id) ? 0.6 : 1,
                }}
              >
                {creatingItinerary.has(r.id) ? '…' : <><Plus size={10} /> Itinerary</>}
              </button>
            ) : null}
            {authToken && (isAdmin || isDesigner) && (
              <button
                onClick={() => setReplyModal(r)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', fontWeight: '500', color: '#4A433A',
                  background: 'white', border: '1px solid #E8E3DA',
                  padding: '3px 9px', borderRadius: '6px', cursor: 'pointer',
                }}
              >
                <Send size={10} /> Reply
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16' }}>
            Custom Requests
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {counts.all != null
              ? isAdmin
                ? `${counts.all} total · ${counts.open ?? 0} open · ${counts.in_progress ?? 0} in progress · ${paymentCounts.paid ?? 0} paid`
                : `${counts.all} assigned to you · ${counts.open ?? 0} open · ${counts.in_progress ?? 0} in progress`
              : '—'}
            {!loading && filteredTotal !== (counts.all ?? 0) && (
              <span style={{ color: '#1B6B65' }}> · {filteredTotal} shown</span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Designer filter — admin only */}
          {isAdmin && designers.length > 0 && (
            <select
              value={designerFilter}
              onChange={e => { setDesignerFilter(e.target.value); setPage(1); }}
              style={{
                padding: '6px 10px', fontSize: '12px', borderRadius: '6px',
                border: `1px solid ${designerFilter ? '#A8D5D0' : '#D4CCBF'}`,
                background: designerFilter ? '#EFF6F5' : 'white',
                color: designerFilter ? '#1B6B65' : '#4A433A',
                cursor: 'pointer', outline: 'none',
              }}
            >
              <option value="">All designers</option>
              <option value="__unassigned__" disabled style={{ color: '#B5AA99' }}>— Unassigned —</option>
              {designers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          )}

          {activeFilterCount > 0 && (
            <button
              onClick={clearAllFilters}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '5px',
                padding: '6px 12px', background: '#FBF6EE',
                border: '1px solid #E8C87A', borderRadius: '6px',
                fontSize: '12px', fontWeight: '500', color: '#A07830', cursor: 'pointer',
              }}
            >
              <X size={11} />
              Clear {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Table / Card list */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', overflow: 'hidden' }}>
        {isMobile ? (
          <div>
            {loading && [...Array(5)].map((_, i) => (
              <div key={i} style={{ padding: '14px 16px', borderTop: i > 0 ? '1px solid #F4F1EC' : 'none' }}>
                <div style={{ height: '13px', background: '#F4F1EC', borderRadius: '3px', width: '60%', marginBottom: '8px' }} />
                <div style={{ height: '11px', background: '#F4F1EC', borderRadius: '3px', width: '80%' }} />
              </div>
            ))}
            {!loading && pageRows.length === 0 && (
              <p style={{ padding: '40px', textAlign: 'center', color: '#B5AA99', fontSize: '13px' }}>
                {isDesigner && !isAdmin
                  ? 'No custom requests assigned to you yet.'
                  : 'No custom requests match the current filters.'}
              </p>
            )}
            {!loading && pageRows.map((r, i) => <MobileCard key={r.id} r={r} i={i} />)}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr>
                  <th style={{ width: '32px', padding: '9px 4px 9px 12px', background: '#FAFAF8', borderBottom: '1px solid #E8E3DA' }} />
                  {PRIMARY_COLS.map(col => (
                    <ColHeader
                      key={col.id}
                      col={col}
                      sort={sort}
                      onSort={handleSort}
                      filterActive={isFilterActive(col, filters[col.id])}
                      onOpenFilter={openFilterPopover}
                    />
                  ))}
                  <th style={{ padding: '9px 10px', background: '#FAFAF8', borderBottom: '1px solid #E8E3DA', whiteSpace: 'nowrap', fontSize: '11px', fontWeight: '600', color: '#8C8070', textAlign: 'left' }}>
                    Itinerary
                  </th>
                  {isAdmin && (
                    <th style={{ padding: '9px 10px', background: '#FAFAF8', borderBottom: '1px solid #E8E3DA', whiteSpace: 'nowrap', minWidth: '140px', fontSize: '11px', fontWeight: '600', color: '#8C8070', textAlign: 'left' }}>
                      Designer
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>

                {loading && [...Array(8)].map((_, i) => (
                  <tr key={i} style={{ borderTop: '1px solid #F4F1EC' }}>
                    <td style={{ ...TD, width: '32px' }} />
                    {PRIMARY_COLS.map((col, j) => (
                      <td key={col.id} style={TD}>
                        <div style={{ height: '11px', background: '#F4F1EC', borderRadius: '3px', width: j < 3 ? '80%' : '55%' }} />
                      </td>
                    ))}
                    <td style={TD} />
                    {isAdmin && <td style={TD} />}
                  </tr>
                ))}

                {!loading && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={COL_SPAN} style={{ padding: '48px', textAlign: 'center', color: '#B5AA99', fontSize: '13px' }}>
                      {isDesigner && !isAdmin
                        ? 'No custom requests assigned to you yet.'
                        : 'No custom requests match the current filters.'}
                    </td>
                  </tr>
                )}

                {!loading && pageRows.map((r, i) => {
                  const isExpanded   = expandedRows.has(r.id);
                  const rowBg        = i % 2 === 0 ? 'white' : '#FAFAF8';
                  const hasSecondary = r.phone || r.groupType || r.budget || styleText(r.style) || r.notes;

                  return [
                    <tr key={r.id} style={{ borderTop: '1px solid #F4F1EC', background: rowBg }}>
                      {/* Expand toggle */}
                      <td style={{ ...TD, width: '32px', padding: '9px 4px 9px 12px' }}>
                        {hasSecondary ? (
                          <button
                            onClick={() => toggleExpand(r.id)}
                            title={isExpanded ? 'Collapse' : 'Show more'}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              width: '20px', height: '20px', padding: 0,
                              background: isExpanded ? '#EFF6F5' : 'transparent',
                              border: `1px solid ${isExpanded ? '#A8D5D0' : '#E8E3DA'}`,
                              borderRadius: '4px', cursor: 'pointer',
                              transition: 'background 0.1s',
                            }}
                          >
                            <ChevronRight
                              size={11}
                              color={isExpanded ? '#1B6B65' : '#B5AA99'}
                              style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
                            />
                          </button>
                        ) : (
                          <div style={{ width: '20px' }} />
                        )}
                      </td>

                      <td style={{ ...TD, color: '#8C8070', fontSize: '11.5px', whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                      <td style={{ ...TD, fontWeight: '500', color: '#1C1A16', whiteSpace: 'nowrap' }}>{r.fullName || '—'}</td>
                      <td style={{ ...TD, maxWidth: '152px' }}>
                        <a
                          href={`mailto:${r.email}`}
                          title={r.email}
                          style={{ color: '#1B6B65', textDecoration: 'none', fontSize: '11.5px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {r.email || '—'}
                        </a>
                      </td>
                      <td style={{ ...TD, fontWeight: '500', color: '#1C1A16', whiteSpace: 'nowrap' }}>{r.destination || '—'}</td>
                      <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.dates    || '—'}</td>
                      <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.duration || '—'}</td>
                      <td style={{ ...TD, color: '#4A433A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                        {r.groupSize != null ? r.groupSize : '—'}
                      </td>

                      {/* Workflow status */}
                      <td style={TD}>
                        {authToken
                          ? <StatusAction requestId={r.id} current={r.status || 'open'} linkedItineraryStatus={r.linkedItineraryStatus} onUpdated={handleStatusUpdated} token={authToken} />
                          : (
                            <span style={{ fontSize: '11px', fontWeight: '600', color: STATUS_META[r.status]?.color ?? '#1B6B65', background: STATUS_META[r.status]?.bg ?? '#EFF6F5', padding: '3px 9px', borderRadius: '10px' }}>
                              {STATUS_META[r.status]?.label ?? 'Open'}
                            </span>
                          )
                        }
                      </td>

                      {/* Payment status */}
                      <td style={TD}>
                        <PaymentBadge isPaid={r.isPaid} />
                      </td>

                      {/* Itinerary */}
                      <td style={{ ...TD, maxWidth: '180px' }}>
                        {r.itineraryId ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            {r.linkedItineraryTitle && (
                              <span style={{ fontSize: '11px', color: '#4A433A', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px', display: 'block' }}>
                                {r.linkedItineraryTitle}
                              </span>
                            )}
                            <Link
                              to={`/admin/itineraries/${r.itineraryId}`}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                fontSize: '11px', fontWeight: '500', color: '#1B6B65',
                                background: '#EFF6F5', border: '1px solid #A8D5D0',
                                padding: '3px 9px', borderRadius: '6px',
                                textDecoration: 'none', whiteSpace: 'nowrap', width: 'fit-content',
                              }}
                            >
                              Open <ExternalLink size={10} />
                            </Link>
                          </div>
                        ) : (isAdmin || isDesigner) ? (
                          <button
                            onClick={() => handleCreateItinerary(r.id)}
                            disabled={creatingItinerary.has(r.id)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              fontSize: '11px', fontWeight: '500', color: '#6B6156',
                              background: 'white', border: '1px solid #D4CCBF',
                              padding: '3px 9px', borderRadius: '6px',
                              cursor: creatingItinerary.has(r.id) ? 'wait' : 'pointer',
                              opacity: creatingItinerary.has(r.id) ? 0.6 : 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {creatingItinerary.has(r.id) ? '…' : <><Plus size={10} /> Itinerary</>}
                          </button>
                        ) : (
                          <span style={{ fontSize: '11px', color: '#C4BDB4' }}>—</span>
                        )}
                      </td>

                      {/* Designer assignment — admin only */}
                      {isAdmin && (
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          {authToken ? (
                            <DesignerCell
                              requestId={r.id}
                              designerId={r.designerId ?? null}
                              designerName={r.designerName ?? null}
                              designers={designers}
                              token={authToken}
                              onAssigned={handleDesignerAssigned}
                            />
                          ) : (
                            <span style={{ fontSize: '11px', color: '#C4BDB4' }}>
                              {r.designerName ?? 'Unassigned'}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>,

                    isExpanded && (
                      <tr key={`${r.id}-detail`} style={{ background: rowBg }}>
                        <td colSpan={COL_SPAN} style={{ padding: 0, borderTop: 'none' }}>
                          <div style={{
                            background: '#F8F6F2',
                            borderTop: '1px solid #EDE8DF',
                            borderBottom: '1px solid #EDE8DF',
                            padding: '14px 16px 14px 44px',
                          }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 40px', maxWidth: '560px', marginBottom: '14px' }}>
                              {/* Left column */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {r.phone     && <DetailField label="Phone"      value={r.phone} />}
                                {r.groupType && <DetailField label="Group Type" value={r.groupType} />}
                                {r.budget    && <DetailField label="Budget"     value={r.budget} />}
                              </div>
                              {/* Right column */}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {styleText(r.style) && <DetailField label="Style" value={styleText(r.style)} />}
                                {r.notes && (
                                  <div>
                                    <p style={{ fontSize: '10px', fontWeight: '600', color: '#B5AA99', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '3px' }}>Notes</p>
                                    <p style={{ fontSize: '12.5px', color: '#4A433A', lineHeight: '1.5' }}>{r.notes}</p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            {authToken && (isAdmin || isDesigner) && (
                              <div style={{ borderTop: '1px solid #EDE8DF', paddingTop: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                                {r.itineraryId ? (
                                  <Link
                                    to={`/admin/itineraries/${r.itineraryId}`}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                                      padding: '6px 14px',
                                      background: '#1B6B65', color: 'white',
                                      border: 'none', borderRadius: '6px',
                                      fontSize: '12px', fontWeight: '600',
                                      textDecoration: 'none',
                                    }}
                                  >
                                    Open itinerary <ExternalLink size={12} />
                                  </Link>
                                ) : (
                                  <button
                                    onClick={() => handleCreateItinerary(r.id)}
                                    disabled={creatingItinerary.has(r.id)}
                                    style={{
                                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                                      padding: '6px 14px',
                                      background: '#1B6B65', color: 'white',
                                      border: 'none', borderRadius: '6px',
                                      fontSize: '12px', fontWeight: '600',
                                      cursor: creatingItinerary.has(r.id) ? 'wait' : 'pointer',
                                      opacity: creatingItinerary.has(r.id) ? 0.6 : 1,
                                    }}
                                  >
                                    <Plus size={12} />
                                    {creatingItinerary.has(r.id) ? 'Creating…' : 'Create itinerary'}
                                  </button>
                                )}
                                <button
                                  onClick={() => setReplyModal(r)}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 14px',
                                    background: 'white', border: '1px solid #D4CCBF',
                                    borderRadius: '6px', cursor: 'pointer',
                                    fontSize: '12px', fontWeight: '500', color: '#4A433A',
                                  }}
                                >
                                  <Send size={12} />
                                  Reply to {r.fullName?.split(' ')[0] ?? 'client'}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}

              </tbody>
            </table>
          </div>
        )}

        {/* Footer / pagination */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#8C8070' }}>
            {loading ? '—' : `${filteredTotal} result${filteredTotal !== 1 ? 's' : ''}`}
            {!loading && totalPages > 1 && ` · page ${page} of ${totalPages}`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))}         disabled={page === 1}          style={btnStyle(page === 1)}>← Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnStyle(page === totalPages)}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* Filter popover */}
      {popover && (() => {
        const col = PRIMARY_COLS.find(c => c.id === popover.colId);
        return col ? (
          <FilterPopover
            col={col}
            value={filters[popover.colId]}
            onChange={val => setFilter(popover.colId, val)}
            onClose={closePopover}
            anchorRect={popover.anchorRect}
          />
        ) : null;
      })()}

      {/* Reply modal */}
      {replyModal && (
        <ReplyModal
          request={replyModal}
          token={authToken}
          onClose={() => setReplyModal(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

    </div>
  );
}

function btnStyle(disabled) {
  return {
    padding: '5px 12px', fontSize: '12px', borderRadius: '4px',
    border: '1px solid #E8E3DA', background: disabled ? '#F4F1EC' : 'white',
    color: disabled ? '#B5AA99' : '#4A433A', cursor: disabled ? 'default' : 'pointer',
  };
}
