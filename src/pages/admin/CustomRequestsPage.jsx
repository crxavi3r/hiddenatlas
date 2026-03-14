import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Check, X, Filter } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_META = {
  open:        { label: 'Open',        color: '#1B6B65', bg: '#EFF6F5' },
  in_progress: { label: 'In Progress', color: '#A07830', bg: '#FBF6EE' },
  closed:      { label: 'Closed',      color: '#8C8070', bg: '#F4F1EC' },
};
const ALL_STATUSES          = Object.keys(STATUS_META);
const DEFAULT_STATUS_FILTER = ['open', 'in_progress'];

const NEXT_STATUS = {
  open:        { value: 'in_progress', label: '→ In Progress' },
  in_progress: { value: 'closed',      label: '→ Close'       },
  closed:      { value: 'open',        label: 'Reopen'        },
};

const COLUMNS = [
  { id: 'createdAt',   label: 'Date',         field: 'createdAt',  type: 'date',   minW: 148 },
  { id: 'fullName',    label: 'Name',          field: 'fullName',   type: 'text',   minW: 128 },
  { id: 'email',       label: 'Email',         field: 'email',      type: 'text',   minW: 168 },
  { id: 'phone',       label: 'Phone',         field: 'phone',      type: 'text',   minW: 108 },
  { id: 'destination', label: 'Destination',   field: 'destination',type: 'text',   minW: 118 },
  { id: 'dates',       label: 'Trip Date',     field: 'dates',      type: 'text',   minW: 108 },
  { id: 'duration',    label: 'Duration',      field: 'duration',   type: 'text',   minW: 88  },
  { id: 'group',       label: 'Group',         field: 'groupType',  type: 'text',   minW: 100 },
  { id: 'groupType',   label: 'Group Type',    field: 'groupType',  type: 'text',   minW: 100 },
  { id: 'groupSize',   label: 'Group Size',    field: 'groupSize',  type: 'number', minW: 84  },
  { id: 'budget',      label: 'Budget',        field: 'budget',     type: 'text',   minW: 108 },
  { id: 'style',       label: 'Style',         field: 'style',      type: 'style',  minW: 148 },
  { id: 'notes',       label: 'Notes',         field: 'notes',      type: 'text',   minW: 180 },
  { id: 'status',      label: 'Status',        field: 'status',     type: 'status', minW: 232 },
];

const PAGE_SIZE = 25;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
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
    f[col.id] = col.type === 'status' ? [...DEFAULT_STATUS_FILTER] : '';
  }
  return f;
}

function isFilterActive(col, filterVal) {
  if (col.type === 'status') return filterVal.length > 0 && filterVal.length < ALL_STATUSES.length;
  return !!filterVal;
}

function renderSortIcon(colId, sort) {
  if (sort.key !== colId) return <ChevronsUpDown size={10} color="#C4BDB4" />;
  return sort.dir === 'asc'
    ? <ChevronUp   size={10} color="#1B6B65" />
    : <ChevronDown size={10} color="#1B6B65" />;
}

// ── Status filter inside popover ──────────────────────────────────────────────
function StatusPopoverFilter({ value, onChange }) {
  function toggle(s) {
    onChange(value.includes(s) ? value.filter(x => x !== s) : [...value, s]);
  }
  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {ALL_STATUSES.map(s => {
          const m = STATUS_META[s];
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
        <button onClick={() => onChange([...ALL_STATUSES])} style={{ fontSize: '11px', color: '#1B6B65', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>All</button>
        <button onClick={() => onChange([])} style={{ fontSize: '11px', color: '#8C8070', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>None</button>
      </div>
    </div>
  );
}

// ── FilterPopover — rendered at position:fixed, outside the table DOM ─────────
function FilterPopover({ col, value, onChange, onClose, anchorRect }) {
  const ref      = useRef(null);
  const inputRef = useRef(null);

  // Auto-focus text input
  useEffect(() => {
    if (col.type !== 'status') inputRef.current?.focus();
  }, [col.type]);

  // Close on outside click
  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Close on any scroll so position doesn't go stale
  useEffect(() => {
    function onScroll() { onClose(); }
    window.addEventListener('scroll', onScroll, true);
    return () => window.removeEventListener('scroll', onScroll, true);
  }, [onClose]);

  // Position below the anchor, constrain to viewport
  const left = Math.min(anchorRect.left, window.innerWidth - 252);
  const top  = anchorRect.bottom + 6;

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed', top, left, zIndex: 9999,
        background: 'white',
        border: '1px solid #E8E3DA', borderRadius: '8px',
        boxShadow: '0 8px 28px rgba(28,26,22,0.14)',
        minWidth: '236px', padding: '14px',
      }}
    >
      {/* Column label */}
      <p style={{
        fontSize: '10.5px', fontWeight: '600', color: '#8C8070',
        textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
      }}>
        {col.label}
      </p>

      {col.type === 'status' ? (
        <StatusPopoverFilter value={value} onChange={onChange} />
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
            onFocus={e  => { e.target.style.borderColor = '#1B6B65'; }}
            onBlur={e   => { e.target.style.borderColor = '#D4CCBF'; }}
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

// ── ColHeader — individual sortable + filterable column header ─────────────────
function ColHeader({ col, sort, onSort, filterActive, onOpenFilter }) {
  const [hovered, setHovered] = useState(false);

  function handleFilterClick(e) {
    e.stopPropagation();
    onOpenFilter(col.id, e.currentTarget.getBoundingClientRect());
  }

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
        {/* Sort trigger */}
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

        {/* Filter icon — visible on hover or when a filter is active */}
        <button
          onClick={handleFilterClick}
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

// ── StatusAction (unchanged) ──────────────────────────────────────────────────
function StatusAction({ requestId, current, onUpdated, token }) {
  const [loading, setLoading] = useState(false);

  async function advance() {
    const next = NEXT_STATUS[current]?.value;
    if (!next) return;
    setLoading(true);
    try {
      await fetch(`/api/admin?action=custom-request-status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: requestId, status: next }),
      });
      onUpdated(requestId, next);
    } catch (err) {
      console.error('[admin/custom-requests] status update failed:', err);
    } finally { setLoading(false); }
  }

  const m    = STATUS_META[current] ?? STATUS_META.open;
  const next = NEXT_STATUS[current];
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

// ── Page ──────────────────────────────────────────────────────────────────────
export default function CustomRequestsPage() {
  const { getToken }                       = useAuth();
  const [allRows, setAllRows]              = useState([]);
  const [counts, setCounts]                = useState({});
  const [loading, setLoading]              = useState(true);
  const [authToken, setAuthToken]          = useState(null);
  const [sort, setSort]                    = useState({ key: 'createdAt', dir: 'desc' });
  const [filters, setFilters]              = useState(initFilters);
  const [page, setPage]                    = useState(1);
  const [popover, setPopover]              = useState(null); // { colId, anchorRect }

  useEffect(() => {
    getToken().then(setAuthToken).catch(() => {});
  }, [getToken]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/admin?action=custom-requests&all=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setAllRows(data.requests ?? []);
      setCounts(data.counts  ?? {});
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

  function setFilter(colId, val) {
    setFilters(prev => ({ ...prev, [colId]: val }));
    setPage(1);
  }

  function clearAllFilters() {
    setFilters(initFilters());
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

  // ── Derived data ─────────────────────────────────────────────────────────────
  const { filteredRows, filteredTotal } = useMemo(() => {
    let rows = allRows;
    for (const col of COLUMNS) {
      const fv = filters[col.id];
      if (fv !== '' && fv !== undefined) {
        rows = rows.filter(r => matchesFilter(r, col, fv));
      }
    }
    rows = sortRows(rows, sort.key, sort.dir);
    return { filteredRows: rows, filteredTotal: rows.length };
  }, [allRows, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const pageRows   = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilterCount = useMemo(() => {
    return COLUMNS.reduce((n, col) => isFilterActive(col, filters[col.id]) ? n + 1 : n, 0);
  }, [filters]);

  const TD = { padding: '9px 10px' };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '28px 32px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '24px', fontWeight: '600', color: '#1C1A16' }}>
            Custom Requests
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {counts.all != null
              ? `${counts.all} total · ${counts.open ?? 0} open · ${counts.in_progress ?? 0} in progress`
              : '—'}
            {!loading && filteredTotal !== (counts.all ?? 0) && (
              <span style={{ color: '#1B6B65' }}> · {filteredTotal} shown</span>
            )}
          </p>
        </div>

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

      {/* Table */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {COLUMNS.map(col => (
                  <ColHeader
                    key={col.id}
                    col={col}
                    sort={sort}
                    onSort={handleSort}
                    filterActive={isFilterActive(col, filters[col.id])}
                    onOpenFilter={openFilterPopover}
                  />
                ))}
              </tr>
            </thead>
            <tbody>

              {loading && [...Array(8)].map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F4F1EC' }}>
                  {COLUMNS.map((col, j) => (
                    <td key={col.id} style={TD}>
                      <div style={{ height: '11px', background: '#F4F1EC', borderRadius: '3px', width: j < 3 ? '80%' : '55%' }} />
                    </td>
                  ))}
                </tr>
              ))}

              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ padding: '48px', textAlign: 'center', color: '#B5AA99', fontSize: '13px' }}>
                    No custom requests match the current filters.
                  </td>
                </tr>
              )}

              {!loading && pageRows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>
                  <td style={{ ...TD, color: '#8C8070', fontSize: '11.5px', whiteSpace: 'nowrap' }}>{fmtDate(r.createdAt)}</td>
                  <td style={{ ...TD, fontWeight: '500', color: '#1C1A16', whiteSpace: 'nowrap' }}>{r.fullName || '—'}</td>
                  <td style={{ ...TD, maxWidth: '168px' }}>
                    <a href={`mailto:${r.email}`} style={{ color: '#1B6B65', textDecoration: 'none', fontSize: '11.5px', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.email || '—'}
                    </a>
                  </td>
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.phone || '—'}</td>
                  <td style={{ ...TD, fontWeight: '500', color: '#1C1A16', whiteSpace: 'nowrap' }}>{r.destination || '—'}</td>
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.dates || '—'}</td>
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.duration ? `${r.duration}d` : '—'}</td>
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.groupType || '—'}</td>
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.groupType || '—'}</td>
                  <td style={{ ...TD, color: '#4A433A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.groupSize != null ? r.groupSize : '—'}</td>
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>{r.budget || '—'}</td>
                  <td style={{ ...TD, maxWidth: '148px' }}>
                    <span title={styleText(r.style)} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#4A433A', fontSize: '11.5px' }}>
                      {styleText(r.style) || '—'}
                    </span>
                  </td>
                  <td style={{ ...TD, maxWidth: '180px' }}>
                    <span title={r.notes ?? ''} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6B6156', fontSize: '11.5px' }}>
                      {r.notes || '—'}
                    </span>
                  </td>
                  <td style={TD}>
                    {authToken
                      ? <StatusAction requestId={r.id} current={r.status || 'open'} onUpdated={handleStatusUpdated} token={authToken} />
                      : (
                        <span style={{ fontSize: '11px', fontWeight: '600', color: STATUS_META[r.status]?.color ?? '#1B6B65', background: STATUS_META[r.status]?.bg ?? '#EFF6F5', padding: '3px 9px', borderRadius: '10px' }}>
                          {STATUS_META[r.status]?.label ?? 'Open'}
                        </span>
                      )
                    }
                  </td>
                </tr>
              ))}

            </tbody>
          </table>
        </div>

        {/* Footer / pagination */}
        <div style={{ padding: '10px 16px', borderTop: '1px solid #F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#8C8070' }}>
            {loading ? '—' : `${filteredTotal} result${filteredTotal !== 1 ? 's' : ''}`}
            {!loading && totalPages > 1 && ` · page ${page} of ${totalPages}`}
          </span>
          {totalPages > 1 && (
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnStyle(page === 1)}>← Prev</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnStyle(page === totalPages)}>Next →</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Filter popover — rendered outside table, position:fixed ── */}
      {popover && (() => {
        const col = COLUMNS.find(c => c.id === popover.colId);
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
