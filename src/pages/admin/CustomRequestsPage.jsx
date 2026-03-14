import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { ChevronDown, ChevronUp, ChevronsUpDown, Check, X } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_META = {
  open:        { label: 'Open',        color: '#1B6B65', bg: '#EFF6F5' },
  in_progress: { label: 'In Progress', color: '#A07830', bg: '#FBF6EE' },
  closed:      { label: 'Closed',      color: '#8C8070', bg: '#F4F1EC' },
};
const ALL_STATUSES  = Object.keys(STATUS_META);
const DEFAULT_STATUS_FILTER = ['open', 'in_progress'];

const NEXT_STATUS = {
  open:        { value: 'in_progress', label: '→ In Progress' },
  in_progress: { value: 'closed',      label: '→ Close'       },
  closed:      { value: 'open',        label: 'Reopen'        },
};

// ── Column definitions ────────────────────────────────────────────────────────
// id:    unique — used as sort/filter key
// field: data field on the row object
// type:  'text' | 'date' | 'number' | 'style' | 'status'
// minW:  minimum column width in px
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
    // nulls / empty last
    const aEmpty = av === '' || av === -Infinity;
    const bEmpty = bv === '' || bv === -Infinity;
    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;
    let cmp = col.type === 'number' || col.type === 'date'
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

function renderSortIcon(colId, sort) {
  if (sort.key !== colId) return <ChevronsUpDown size={10} color="#C4BDB4" />;
  return sort.dir === 'asc'
    ? <ChevronUp   size={10} color="#1B6B65" />
    : <ChevronDown size={10} color="#1B6B65" />;
}

// ── Status multi-select filter (inline in column header filter row) ────────────
function StatusHeaderFilter({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function onDown(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function toggle(s) {
    onChange(value.includes(s) ? value.filter(x => x !== s) : [...value, s]);
  }

  const active = value.length > 0 && value.length < ALL_STATUSES.length;
  const label  = value.length === 0 ? 'None'
    : value.length === ALL_STATUSES.length ? 'All statuses'
    : value.map(s => STATUS_META[s].label).join(', ');

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '3px 7px', background: 'white',
          border: `1px solid ${active ? '#1B6B65' : '#D4CCBF'}`, borderRadius: '3px',
          fontSize: '11px', color: active ? '#1B6B65' : '#8C8070', cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '170px' }}>
          {label}
        </span>
        <ChevronDown size={9} style={{ flexShrink: 0, marginLeft: '4px' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', left: 0, top: 'calc(100% + 2px)', zIndex: 200,
          background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px',
          boxShadow: '0 8px 24px rgba(28,26,22,0.12)', minWidth: '170px', padding: '4px 0',
        }}>
          {ALL_STATUSES.map(s => {
            const m = STATUS_META[s];
            const checked = value.includes(s);
            return (
              <button key={s} onClick={() => toggle(s)} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                width: '100%', padding: '6px 12px',
                background: checked ? '#FAFAF8' : 'white',
                border: 'none', cursor: 'pointer',
              }}>
                <div style={{
                  width: '12px', height: '12px', borderRadius: '2px', flexShrink: 0,
                  border: `2px solid ${checked ? m.color : '#D4CCBF'}`,
                  background: checked ? m.color : 'white',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <Check size={8} color="white" strokeWidth={3} />}
                </div>
                <span style={{ fontSize: '12px', fontWeight: '500', color: '#1C1A16' }}>{m.label}</span>
              </button>
            );
          })}
          <div style={{ borderTop: '1px solid #F4F1EC', padding: '4px 12px', display: 'flex', gap: '10px', marginTop: '2px' }}>
            <button onClick={() => onChange([...ALL_STATUSES])} style={{ fontSize: '11px', color: '#1B6B65', fontWeight: '600', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>All</button>
            <button onClick={() => onChange([])} style={{ fontSize: '11px', color: '#8C8070', fontWeight: '500', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>None</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── StatusAction (preserved from previous implementation) ─────────────────────
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

  // Cache token for StatusAction
  useEffect(() => {
    getToken().then(setAuthToken).catch(() => {});
  }, [getToken]);

  // Fetch all rows once — sorting/filtering is done client-side
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

  // ── Derived data ─────────────────────────────────────────────────────────────
  const { filteredRows, filteredTotal } = useMemo(() => {
    let rows = allRows;
    for (const col of COLUMNS) {
      const fv = filters[col.id];
      if (col.type === 'status') {
        rows = rows.filter(r => matchesFilter(r, col, fv));
      } else if (fv) {
        rows = rows.filter(r => matchesFilter(r, col, fv));
      }
    }
    rows = sortRows(rows, sort.key, sort.dir);
    return { filteredRows: rows, filteredTotal: rows.length };
  }, [allRows, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const pageRows   = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    for (const col of COLUMNS) {
      const fv = filters[col.id];
      if (col.type === 'status') {
        if (fv.length > 0 && fv.length < ALL_STATUSES.length) n++;
      } else if (fv) n++;
    }
    return n;
  }, [filters]);

  // ── Styles ───────────────────────────────────────────────────────────────────
  const TH = {
    padding: '8px 10px', textAlign: 'left',
    background: '#FAFAF8', borderBottom: '1px solid #E8E3DA',
    whiteSpace: 'nowrap',
  };
  const TF = {
    padding: '4px 10px',
    background: '#F4F1EC', borderBottom: '2px solid #E8E3DA',
  };
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

              {/* ── Sort row (column headers) */}
              <tr>
                {COLUMNS.map(col => (
                  <th key={col.id} style={{ ...TH, minWidth: `${col.minW}px` }}>
                    <button
                      onClick={() => handleSort(col.id)}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                        color: sort.key === col.id ? '#1C1A16' : '#6B6156',
                        fontWeight: '600', fontSize: '10.5px',
                        textTransform: 'uppercase', letterSpacing: '0.4px',
                      }}
                    >
                      {col.label}
                      {renderSortIcon(col.id, sort)}
                    </button>
                  </th>
                ))}
              </tr>

              {/* ── Filter row */}
              <tr>
                {COLUMNS.map(col => (
                  <td key={col.id} style={{ ...TF, minWidth: `${col.minW}px` }}>
                    {col.type === 'status' ? (
                      <StatusHeaderFilter
                        value={filters[col.id]}
                        onChange={val => setFilter(col.id, val)}
                      />
                    ) : (
                      <input
                        type={col.type === 'number' ? 'number' : 'text'}
                        placeholder="Filter…"
                        value={filters[col.id]}
                        onChange={e => setFilter(col.id, e.target.value)}
                        style={{
                          width: '100%', boxSizing: 'border-box',
                          padding: '3px 6px',
                          border: `1px solid ${filters[col.id] ? '#1B6B65' : '#D4CCBF'}`,
                          borderRadius: '3px', fontSize: '11px',
                          color: '#1C1A16', background: 'white', outline: 'none',
                        }}
                      />
                    )}
                  </td>
                ))}
              </tr>

            </thead>
            <tbody>

              {/* Loading skeletons */}
              {loading && [...Array(8)].map((_, i) => (
                <tr key={i} style={{ borderTop: '1px solid #F4F1EC' }}>
                  {COLUMNS.map((col, j) => (
                    <td key={col.id} style={{ ...TD }}>
                      <div style={{ height: '11px', background: '#F4F1EC', borderRadius: '3px', width: j < 3 ? '80%' : '55%' }} />
                    </td>
                  ))}
                </tr>
              ))}

              {/* Empty state */}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ padding: '48px', textAlign: 'center', color: '#B5AA99', fontSize: '13px' }}>
                    No custom requests match the current filters.
                  </td>
                </tr>
              )}

              {/* Data rows */}
              {!loading && pageRows.map((r, i) => (
                <tr key={r.id} style={{ borderTop: '1px solid #F4F1EC', background: i % 2 === 0 ? 'white' : '#FAFAF8' }}>

                  {/* 1. Date */}
                  <td style={{ ...TD, color: '#8C8070', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                    {fmtDate(r.createdAt)}
                  </td>

                  {/* 2. Name */}
                  <td style={{ ...TD, fontWeight: '500', color: '#1C1A16', whiteSpace: 'nowrap' }}>
                    {r.fullName || '—'}
                  </td>

                  {/* 3. Email */}
                  <td style={{ ...TD, maxWidth: '168px' }}>
                    <a
                      href={`mailto:${r.email}`}
                      style={{
                        color: '#1B6B65', textDecoration: 'none', fontSize: '11.5px',
                        display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}
                    >
                      {r.email || '—'}
                    </a>
                  </td>

                  {/* 4. Phone */}
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>
                    {r.phone || '—'}
                  </td>

                  {/* 5. Destination */}
                  <td style={{ ...TD, fontWeight: '500', color: '#1C1A16', whiteSpace: 'nowrap' }}>
                    {r.destination || '—'}
                  </td>

                  {/* 6. Trip Date */}
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>
                    {r.dates || '—'}
                  </td>

                  {/* 7. Duration */}
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>
                    {r.duration ? `${r.duration}d` : '—'}
                  </td>

                  {/* 8. Group (groupType label) */}
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>
                    {r.groupType || '—'}
                  </td>

                  {/* 9. Group Type */}
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>
                    {r.groupType || '—'}
                  </td>

                  {/* 10. Group Size */}
                  <td style={{ ...TD, color: '#4A433A', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.groupSize != null ? r.groupSize : '—'}
                  </td>

                  {/* 11. Budget */}
                  <td style={{ ...TD, color: '#4A433A', whiteSpace: 'nowrap' }}>
                    {r.budget || '—'}
                  </td>

                  {/* 12. Style */}
                  <td style={{ ...TD, maxWidth: '148px' }}>
                    <span
                      title={styleText(r.style)}
                      style={{
                        display: 'block', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: '#4A433A', fontSize: '11.5px',
                      }}
                    >
                      {styleText(r.style) || '—'}
                    </span>
                  </td>

                  {/* 13. Notes */}
                  <td style={{ ...TD, maxWidth: '180px' }}>
                    <span
                      title={r.notes ?? ''}
                      style={{
                        display: 'block', overflow: 'hidden',
                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        color: '#6B6156', fontSize: '11.5px',
                      }}
                    >
                      {r.notes || '—'}
                    </span>
                  </td>

                  {/* 14. Status */}
                  <td style={{ ...TD }}>
                    {authToken
                      ? <StatusAction
                          requestId={r.id}
                          current={r.status || 'open'}
                          onUpdated={handleStatusUpdated}
                          token={authToken}
                        />
                      : (
                        <span style={{
                          fontSize: '11px', fontWeight: '600',
                          color: STATUS_META[r.status]?.color ?? '#1B6B65',
                          background: STATUS_META[r.status]?.bg ?? '#EFF6F5',
                          padding: '3px 9px', borderRadius: '10px',
                        }}>
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
        <div style={{
          padding: '10px 16px', borderTop: '1px solid #F4F1EC',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
        }}>
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
