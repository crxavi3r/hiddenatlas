import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Plus, RefreshCw, Eye, Edit2, Copy, Trash2, Globe, EyeOff } from 'lucide-react';
import { itineraries as STATIC_ITINERARIES } from '../../data/itineraries';
import { useIsMobile } from '../../hooks/useIsMobile';
import { resolveCoverImage } from '../../lib/resolveCoverImage';
import { useUserCtx } from '../../lib/useUserCtx.jsx';

// ── Shared style tokens ───────────────────────────────────────────────────────
const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };

const STATUS_META = {
  published: { label: 'Published', color: '#1B6B65', bg: '#EFF6F5' },
  draft:     { label: 'Draft',     color: '#8C8070', bg: '#F4F1EC' },
};

const TYPE_META = {
  free:    { label: 'Free',    color: '#1B6B65', bg: '#EFF6F5' },
  premium: { label: 'Premium', color: '#C9A96E', bg: '#FBF8F1' },
  custom:  { label: 'Custom',  color: '#7C5CBA', bg: '#F3F0FA' },
};

const VISIBILITY_META = {
  public:  { label: 'Public',  color: '#8C8070', bg: '#F4F1EC' },
  private: { label: 'Private', color: '#C0392B', bg: '#FDECEA' },
};

// Derive canonical type from both `type` and legacy `accessType` fields
function getItineraryType(it) {
  if (it.type === 'custom')  return 'custom';
  if (it.type === 'premium') return 'premium';
  if (it.type === 'free')    return 'free';
  // Legacy fallback
  return it.accessType === 'paid' ? 'premium' : 'free';
}

function Badge({ meta }) {
  if (!meta) return null;
  return (
    <span style={{
      display: 'inline-block',
      fontSize: '10px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase',
      color: meta.color, background: meta.bg,
      padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap',
    }}>
      {meta.label}
    </span>
  );
}


function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
    }}>
      <div style={{ ...card, padding: '28px 24px', maxWidth: '380px', width: '100%' }}>
        <p style={{ fontSize: '14px', color: '#1C1A16', lineHeight: '1.6', marginBottom: '24px' }}>
          {message}
        </p>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={btnSecondary}>Cancel</button>
          <button onClick={onConfirm} style={{ ...btnPrimary, background: '#C0392B' }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

const btnPrimary = {
  padding: '8px 18px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white',
};
const btnSecondary = {
  padding: '8px 18px', borderRadius: '5px', border: '1px solid #E8E3DA', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A',
};
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '5px',
  borderRadius: '4px', color: '#8C8070', display: 'flex', alignItems: 'center',
};

// ── Main component ────────────────────────────────────────────────────────────
export default function ItinerariesCMSPage() {
  const { getToken } = useAuth();
  const navigate     = useNavigate();
  const isMobile     = useIsMobile();
  const { isAdmin, creatorId: myCreatorId } = useUserCtx();

  const [items,          setItems]          = useState([]);
  const [collections,    setCollections]    = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState(null);
  const [seeding,        setSeeding]        = useState(false);
  const [seedMsg,        setSeedMsg]        = useState(null);
  const [backfilling,    setBackfilling]    = useState(false);
  const [publishing,     setPublishing]     = useState(false);
  const [toDelete,       setToDelete]       = useState(null);
  const [deleteError,    setDeleteError]    = useState(null);
  const [filter,         setFilter]         = useState('all');   // all | draft | published
  const [typeFilter,     setTypeFilter]     = useState('all');   // all | free | premium | custom
  const [creatorFilter,  setCreatorFilter]  = useState('');      // creator id or ''
  const [allCreators,    setAllCreators]    = useState([]);      // for filter dropdown

  // An itinerary is deletable if: admin (always), or designer owns it and it's a draft.
  function canDelete(it) {
    if (isAdmin) return true;
    return it.status === 'draft' && it.creator_id === myCreatorId;
  }

  function requestDelete(it) {
    if (!canDelete(it)) {
      setDeleteError('You can only delete your own draft itineraries.');
      setTimeout(() => setDeleteError(null), 4000);
      return;
    }
    setToDelete(it);
  }

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      // Only admins need the creators list (for the filter dropdown).
      // Designers always see only their own itineraries — no filter needed.
      const requests = [
        fetch('/api/itinerary-cms?action=list', { headers: { Authorization: `Bearer ${token}` } }),
        ...(isAdmin ? [fetch('/api/creators?action=list', { headers: { Authorization: `Bearer ${token}` } })] : []),
      ];
      const [cmsRes, creatorsRes] = await Promise.all(requests);
      const cmsJson      = await cmsRes.json();
      const creatorsJson = creatorsRes ? await creatorsRes.json() : {};
      if (cmsJson.error) throw new Error(cmsJson.error);
      setItems(cmsJson.itineraries);
      setCollections(cmsJson.collections ?? []);
      if (isAdmin && !creatorsJson.error) setAllCreators(creatorsJson.creators || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [getToken, isAdmin]);

  useEffect(() => { load(); }, [load]);

  async function handleSeed() {
    if (!window.confirm(`Import ${STATIC_ITINERARIES.length} itineraries from static data?\nExisting records with the same slug will be overwritten.`)) return;
    setSeeding(true); setSeedMsg(null);
    try {
      const token = await getToken();
      const res   = await fetch('/api/itinerary-cms?action=seed', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ itineraries: STATIC_ITINERARIES }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSeedMsg(`Done — ${json.inserted} created, ${json.updated} updated.`);
      await load();
    } catch (e) { setSeedMsg(`Error: ${e.message}`); }
    finally { setSeeding(false); }
  }

  async function handleBackfillPricing() {
    if (!window.confirm('This will assign the correct pricing plan to all premium itineraries.\n\n• Non-USA premiums → Premium Itinerary (€29)\n• USA 8-day → Short (€14)\n• USA 12-day → Essential (€19)\n• USA 16-day → Complete (€29)\n\nSafe to run multiple times. Continue?')) return;
    setBackfilling(true); setSeedMsg(null);
    try {
      const token = await getToken();
      const res   = await fetch('/api/itinerary-cms?action=backfill-pricing', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      const total = json.results?.reduce((n, r) => n + (r.updated || 0), 0) ?? '?';
      setSeedMsg(`Pricing backfill done — ${total} record(s) updated.`);
      await load();
    } catch (e) { setSeedMsg(`Error: ${e.message}`); }
    finally { setBackfilling(false); }
  }

  async function handleBulkPublish() {
    const unpublished = mainItems.filter(it => !it.isPublished && it.type !== 'custom' && !it.isPrivate);
    if (unpublished.length === 0) return alert('All public itineraries are already published.');
    if (!window.confirm(`Publish ${unpublished.length} unpublished public itinerary${unpublished.length > 1 ? 'ies' : ''}?`)) return;
    setPublishing(true);
    try {
      const token = await getToken();
      const res   = await fetch('/api/itinerary-cms?action=bulk-publish', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setSeedMsg(`Published ${json.published} itinerary${json.published !== 1 ? 'ies' : ''}.`);
      await load();
    } catch (e) { setSeedMsg(`Error: ${e.message}`); }
    finally { setPublishing(false); }
  }

  function handlePreview(it, nav) {
    // Custom, private, or unpublished itineraries don't exist on the public storefront.
    // Route to the CMS editor instead so the admin can still inspect the content.
    const canPreview = it.isPublished && !it.isPrivate && it.type !== 'custom';
    if (canPreview) {
      window.open(`/itineraries/${it.slug}`, '_blank');
    } else {
      nav(`/admin/itineraries/${it.id}`);
    }
  }

  async function handleTogglePublish(item) {
    const action = item.status === 'published' ? 'unpublish' : 'publish';
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=${action}&id=${item.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(prev => prev.map(it => it.id === item.id
        ? { ...it, status: json.itinerary.status, isPublished: json.itinerary.isPublished }
        : it
      ));
    } catch (e) { alert(e.message); }
  }

  async function handleDuplicate(item) {
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=duplicate&id=${item.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(prev => [json.itinerary, ...prev]);
      navigate(`/admin/itineraries/${json.itinerary.id}`);
    } catch (e) { alert(e.message); }
  }

  async function handleDelete(id) {
    try {
      const token = await getToken();
      const res   = await fetch(`/api/itinerary-cms?action=delete&id=${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setItems(prev => prev.filter(it => it.id !== id));
      setCollections(prev => prev.filter(it => it.id !== id));
      setToDelete(null);
    } catch (e) {
      setToDelete(null);
      setDeleteError(e.message);
      setTimeout(() => setDeleteError(null), 5000);
    }
  }

  // Server already splits itineraries vs collections; no client-side re-filter needed.
  const mainItems       = items;
  const collectionItems = collections;

  const filtered = filter === 'collections'
    ? collectionItems
    : mainItems.filter(it => {
        const statusOk  = filter === 'all'       ? true
                        : filter === 'published' ? it.isPublished
                        : /* draft */              !it.isPublished;
        const typeOk    = typeFilter === 'all' ? true : getItineraryType(it) === typeFilter;
        const creatorOk = !creatorFilter ? true : (it.creator_id === creatorFilter);
        return statusOk && typeOk && creatorOk;
      });

  const counts = {
    all:        mainItems.length,
    published:  mainItems.filter(i => i.isPublished).length,
    draft:      mainItems.filter(i => !i.isPublished).length,
    unpublishedPublic: mainItems.filter(i => !i.isPublished && i.type !== 'custom' && !i.isPrivate).length,
    free:       mainItems.filter(i => getItineraryType(i) === 'free').length,
    premium:    mainItems.filter(i => getItineraryType(i) === 'premium').length,
    custom:     mainItems.filter(i => getItineraryType(i) === 'custom').length,
    private:    mainItems.filter(i => i.isPrivate).length,
    collections: collectionItems.length,
  };

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>

      {toDelete && (
        <ConfirmModal
          message={`Delete "${toDelete.title}"? This cannot be undone.`}
          onConfirm={() => handleDelete(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}

      {deleteError && (
        <div style={{
          position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
          background: '#1C1A16', color: 'white', padding: '12px 20px', borderRadius: '8px',
          fontSize: '13px', zIndex: 700, boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
          maxWidth: '420px', textAlign: 'center', lineHeight: '1.5',
        }}>
          {deleteError}
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16' }}>
            Itineraries CMS
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {counts.all} total · {counts.published} published · {counts.draft} drafts
            {counts.free > 0 && ` · ${counts.free} free`}
            {counts.premium > 0 && ` · ${counts.premium} premium`}
            {counts.custom > 0 && ` · ${counts.custom} custom`}
            {counts.private > 0 && ` · ${counts.private} private`}
            {counts.collections > 0 && ` · ${counts.collections} collection${counts.collections > 1 ? 's' : ''}`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {isAdmin && (
            <>
              <button
                onClick={handleSeed}
                disabled={seeding}
                style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={12} />
                {seeding ? 'Seeding…' : 'Seed from static data'}
              </button>
              <button
                onClick={handleBackfillPricing}
                disabled={backfilling}
                title="Assign correct Stripe pricing plan to all premium itineraries"
                style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <RefreshCw size={12} />
                {backfilling ? 'Backfilling…' : 'Backfill pricing'}
              </button>
              {counts.unpublishedPublic > 0 && (
                <button
                  onClick={handleBulkPublish}
                  disabled={publishing}
                  style={{ ...btnSecondary, display: 'flex', alignItems: 'center', gap: '6px', color: '#1B6B65', borderColor: '#A8D5D0' }}
                >
                  <Globe size={12} />
                  {publishing ? 'Publishing…' : `Publish all (${counts.unpublishedPublic})`}
                </button>
              )}
            </>
          )}
          <button
            onClick={() => navigate('/admin/itineraries/new')}
            style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Plus size={13} />
            New itinerary
          </button>
        </div>
      </div>

      {seedMsg && (
        <div style={{ ...card, padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: seedMsg.startsWith('Error') ? '#C0392B' : '#1B6B65' }}>
          {seedMsg}
        </div>
      )}

      {/* Filter rows */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        {/* Status filter */}
        <div style={{ display: 'flex', gap: '3px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px', padding: '3px' }}>
          {['all', 'published', 'draft'].map(f => (
            <button key={f} onClick={() => { setFilter(f); setTypeFilter('all'); }} style={{
              padding: '5px 14px', fontSize: '12px', fontWeight: '500', border: 'none', borderRadius: '4px',
              cursor: 'pointer',
              background: filter === f ? '#1C1A16' : 'transparent',
              color: filter === f ? 'white' : '#6B6156',
            }}>
              {f === 'all' ? `All (${counts.all})` : f === 'published' ? `Published (${counts.published})` : `Draft (${counts.draft})`}
            </button>
          ))}
          {counts.collections > 0 && (
            <button onClick={() => { setFilter('collections'); setTypeFilter('all'); }} style={{
              padding: '5px 14px', fontSize: '12px', fontWeight: '500', border: 'none', borderRadius: '4px',
              cursor: 'pointer',
              background: filter === 'collections' ? '#7C5CBA' : 'transparent',
              color: filter === 'collections' ? 'white' : '#7C5CBA',
            }}>
              Collections ({counts.collections})
            </button>
          )}
        </div>
        {/* Type filter — hidden when Collections tab is active */}
        {filter !== 'collections' && (
        <div style={{ display: 'flex', gap: '3px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '6px', padding: '3px' }}>
          {[
            { key: 'all',     label: 'All types' },
            { key: 'free',    label: `Free (${counts.free})` },
            { key: 'premium', label: `Premium (${counts.premium})` },
            { key: 'custom',  label: `Custom (${counts.custom})` },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTypeFilter(key)} style={{
              padding: '5px 14px', fontSize: '12px', fontWeight: '500', border: 'none', borderRadius: '4px',
              cursor: 'pointer',
              background: typeFilter === key ? '#1C1A16' : 'transparent',
              color: typeFilter === key ? 'white' : '#6B6156',
            }}>
              {label}
            </button>
          ))}
        </div>
        )}

        {/* Creator filter — admins see full dropdown; designers see a static label */}
        {filter !== 'collections' && isAdmin && allCreators.length > 0 && (
          <select
            value={creatorFilter}
            onChange={e => setCreatorFilter(e.target.value)}
            style={{
              padding: '5px 12px', fontSize: '12px', fontWeight: '500',
              border: '1px solid #E8E3DA', borderRadius: '6px', cursor: 'pointer',
              background: creatorFilter ? '#EFF6F5' : 'white',
              color: creatorFilter ? '#1B6B65' : '#6B6156',
              outline: 'none',
            }}
          >
            <option value="">All creators</option>
            {allCreators.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        {filter !== 'collections' && !isAdmin && (
          <span style={{
            padding: '5px 12px', fontSize: '12px', fontWeight: '500',
            border: '1px solid #E8E3DA', borderRadius: '6px',
            background: '#EFF6F5', color: '#1B6B65',
          }}>
            Your itineraries
          </span>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[...Array(4)].map((_, i) => (
            <div key={i} style={{ ...card, height: '64px', opacity: 0.5 }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ ...card, padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#C0392B' }}>{error}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card, padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#B5AA99', marginBottom: '16px' }}>
            No itineraries found. {items.length === 0 && 'Use "Seed from static data" to import existing ones.'}
          </p>
          {items.length === 0 && (
            <button onClick={handleSeed} disabled={seeding} style={btnPrimary}>
              {seeding ? 'Seeding…' : 'Seed from static data'}
            </button>
          )}
        </div>
      ) : isMobile ? (
        <MobileList
          items={filtered}
          onEdit={it => navigate(`/admin/itineraries/${it.id}`)}
          onPreview={it => handlePreview(it, navigate)}
          onTogglePublish={handleTogglePublish}
          onDuplicate={handleDuplicate}
          onDelete={requestDelete}
          canDelete={canDelete}
        />
      ) : (
        <DesktopTable
          items={filtered}
          onEdit={it => navigate(`/admin/itineraries/${it.id}`)}
          onPreview={it => handlePreview(it, navigate)}
          onTogglePublish={handleTogglePublish}
          onDuplicate={handleDuplicate}
          onDelete={requestDelete}
          canDelete={canDelete}
        />
      )}
    </div>
  );
}

// ── Desktop table ─────────────────────────────────────────────────────────────
function DesktopTable({ items, onEdit, onPreview, onTogglePublish, onDuplicate, onDelete, canDelete }) {
  const [sortKey, setSortKey] = useState(null);  // null | 'pdf_version' | 'updatedAt'
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'

  const th = { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' };
  const td = { padding: '12px 14px', fontSize: '13px', color: '#1C1A16', borderTop: '1px solid #F4F1EC' };

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  // Sort items client-side if a sort key is active
  const sorted = sortKey ? [...items].sort((a, b) => {
    let av = a[sortKey] ?? '';
    let bv = b[sortKey] ?? '';
    if (sortKey === 'pdf_version') {
      // Parse vX.Y numerically so v1.10 > v1.9
      const parse = v => { const m = String(v).match(/^v(\d+)\.(\d+)$/); return m ? parseInt(m[1]) * 10000 + parseInt(m[2]) : 0; };
      av = parse(av); bv = parse(bv);
    }
    if (av < bv) return sortDir === 'asc' ? -1 : 1;
    if (av > bv) return sortDir === 'asc' ?  1 : -1;
    return 0;
  }) : items;

  function SortableHeader({ label, colKey, style }) {
    const active = sortKey === colKey;
    return (
      <th
        onClick={() => toggleSort(colKey)}
        style={{ ...th, ...style, cursor: 'pointer', userSelect: 'none',
          color: active ? '#1B6B65' : '#8C8070' }}
        title={`Sort by ${label}`}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
      </th>
    );
  }

  return (
    <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#FAFAF8' }}>
              <th style={th}>Cover</th>
              <th style={th}>Title / Slug</th>
              <th style={th}>Type</th>
              <th style={th}>Creator</th>
              <th style={th}>Destination</th>
              <th style={{ ...th, textAlign: 'center' }}>Days</th>
              <th style={{ ...th, textAlign: 'right' }}>Price</th>
              <th style={{ ...th, textAlign: 'center' }}>Status</th>
              <SortableHeader label="PDF Version" colKey="pdf_version" style={{ textAlign: 'center' }} />
              <SortableHeader label="Updated" colKey="updatedAt" style={{}} />
              <th style={{ ...th, textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(it => {
              const itType = getItineraryType(it);
              return (
              <tr key={it.id}>
                <td style={td}>
                  <div style={{
                    width: '56px', height: '38px', borderRadius: '4px', overflow: 'hidden',
                    background: '#F4F1EC', flexShrink: 0,
                  }}>
                    <img
                      src={resolveCoverImage(it.coverImage, it.slug)}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      onError={e => { e.currentTarget.style.display = 'none'; }}
                    />
                  </div>
                </td>
                <td style={td}>
                  <p style={{ fontWeight: '600', color: '#1C1A16', marginBottom: '2px' }}>{it.title}</p>
                  <p style={{ fontSize: '11px', color: '#B5AA99', fontFamily: 'monospace' }}>{it.slug}</p>
                </td>
                <td style={{ ...td }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <Badge meta={TYPE_META[itType] ?? TYPE_META.free} />
                    {it.isPrivate && <Badge meta={VISIBILITY_META.private} />}
                  </div>
                </td>
                <td style={{ ...td, color: '#4A433A', fontSize: '12px' }}>
                  {it.creator_name
                    ? <a href={`/${it.creator_slug}`} target="_blank" rel="noopener noreferrer"
                        style={{ color: '#1B6B65', textDecoration: 'none', fontWeight: '500' }}>
                        {it.creator_name}
                      </a>
                    : <span style={{ color: '#D8D0C4' }}>—</span>
                  }
                </td>
                <td style={{ ...td, color: '#4A433A' }}>
                  {it.destination || it.country || '—'}
                </td>
                <td style={{ ...td, textAlign: 'center', color: '#4A433A' }}>
                  {it.durationDays ?? '—'}
                </td>
                <td style={{ ...td, textAlign: 'right', color: '#4A433A' }}>
                  {itType === 'free' ? '—' : it.price ? `€${it.price}` : '—'}
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <Badge meta={STATUS_META[it.status] ?? STATUS_META.draft} />
                </td>
                <td style={{ ...td, textAlign: 'center' }}>
                  <span style={{
                    fontFamily: 'monospace', fontSize: '11.5px', fontWeight: '600',
                    color: '#1B6B65', background: '#EFF6F5',
                    padding: '2px 8px', borderRadius: '8px', whiteSpace: 'nowrap',
                  }}>
                    {it.pdf_version || 'v1.0'}
                  </span>
                </td>
                <td style={{ ...td, color: '#8C8070', whiteSpace: 'nowrap' }}>
                  {fmtDate(it.updatedAt)}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                    <button onClick={() => onEdit(it)} style={iconBtn} title="Edit">
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => onPreview(it)}
                      style={iconBtn}
                      title={it.isPublished && !it.isPrivate && it.type !== 'custom' ? 'Preview on site' : 'Open in editor'}
                    >
                      <Eye size={13} />
                    </button>
                    <button onClick={() => onDuplicate(it)} style={iconBtn} title="Duplicate">
                      <Copy size={13} />
                    </button>
                    <button
                      onClick={() => onTogglePublish(it)}
                      style={{ ...iconBtn, color: it.status === 'published' ? '#C9A96E' : '#1B6B65' }}
                      title={it.status === 'published' ? 'Unpublish' : 'Publish'}
                    >
                      {it.status === 'published' ? <EyeOff size={13} /> : <Globe size={13} />}
                    </button>
                    {canDelete(it) && (
                      <button
                        onClick={() => onDelete(it)}
                        style={{ ...iconBtn, color: '#C0392B' }}
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Mobile list ───────────────────────────────────────────────────────────────
function MobileList({ items, onEdit, onPreview, onTogglePublish, onDuplicate, onDelete, canDelete }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {items.map(it => (
        <div key={it.id} style={{
          background: 'white', border: '1px solid #E8E3DA', borderRadius: '10px',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', gap: '12px', padding: '14px' }}>
            <div style={{ width: '60px', height: '44px', borderRadius: '4px', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
              <img
                src={resolveCoverImage(it.coverImage, it.slug)}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '13.5px', marginBottom: '4px',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.title}
              </p>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <Badge meta={STATUS_META[it.status] ?? STATUS_META.draft} />
                <Badge meta={TYPE_META[getItineraryType(it)] ?? TYPE_META.free} />
                {it.isPrivate && <Badge meta={VISIBILITY_META.private} />}
                {it.destination && (
                  <span style={{ fontSize: '11px', color: '#8C8070' }}>{it.destination}</span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0', borderTop: '1px solid #F4F1EC' }}>
            {[
              { icon: Edit2, label: 'Edit',      action: () => onEdit(it) },
              { icon: Eye, label: it.isPublished && !it.isPrivate && it.type !== 'custom' ? 'Preview' : 'Editor', action: () => onPreview(it) },
              { icon: Copy,  label: 'Duplicate', action: () => onDuplicate(it) },
              {
                icon: it.status === 'published' ? EyeOff : Globe,
                label: it.status === 'published' ? 'Unpublish' : 'Publish',
                action: () => onTogglePublish(it),
                color: it.status === 'published' ? '#C9A96E' : '#1B6B65',
              },
              ...(canDelete(it) ? [{ icon: Trash2, label: 'Delete', action: () => onDelete(it), color: '#C0392B' }] : []),
            ].map(({ icon: Icon, label, action, color }) => (
              <button key={label} onClick={action} style={{
                flex: 1, background: 'none', border: 'none', cursor: 'pointer',
                padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px',
                color: color || '#6B6156', fontSize: '10px', fontWeight: '500',
              }}>
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
