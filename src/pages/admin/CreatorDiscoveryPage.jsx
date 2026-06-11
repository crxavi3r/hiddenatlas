import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { PlusCircle, Instagram, Upload, Eye, UserPlus, EyeOff, Ban, X, ChevronDown, ChevronUp, ExternalLink, Users } from 'lucide-react';

const S = {
  page:    { padding: '28px 32px', background: '#FAFAF8', minHeight: '100vh' },
  title:   { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '700', color: '#1C1A16', margin: 0 },
  sub:     { fontSize: '13px', color: '#8C8070', marginTop: '4px' },
  card:    { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '20px 24px' },
  label:   { display: 'block', fontSize: '12px', fontWeight: '600', color: '#4A433A', marginBottom: '5px' },
  input:   { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  select:  { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  btnPrimary:   { padding: '9px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: '#1B6B65', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '7px' },
  btnSecondary: { padding: '8px 14px', borderRadius: '6px', border: '1px solid #E8E3DA', cursor: 'pointer', fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A', display: 'inline-flex', alignItems: 'center', gap: '6px' },
  btnDanger:    { padding: '7px 12px', borderRadius: '5px', border: '1px solid #F5C6C0', cursor: 'pointer', fontSize: '11.5px', fontWeight: '500', background: 'white', color: '#C0392B', display: 'inline-flex', alignItems: 'center', gap: '5px' },
  chip: (color, bg) => ({ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color, background: bg, padding: '2px 7px', borderRadius: '9px' }),
};

const SEARCH_TYPES = ['manual','hashtag','username','keyword','location','csv_import','provider_import'];
const STATUS_CHIP = {
  new:         { color: '#8C8070', bg: '#F4F1EC' },
  added_to_crm:{ color: '#1B6B65', bg: '#EFF6F5' },
  ignored:     { color: '#B5AA99', bg: '#F4F1EC' },
  blocked:     { color: '#C0392B', bg: '#FDECEA' },
};

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: '#C8C0B8', fontSize: '12px' }}>—</span>;
  const color = score >= 8 ? '#1B6B65' : score >= 5 ? '#C9A96E' : '#C0392B';
  return (
    <span style={{ fontWeight: '700', fontSize: '13px', color }}>{score.toFixed(1)}</span>
  );
}

function ResultRow({ result, onAddToCrm, onIgnore, onBlock, acting }) {
  const navigate = useNavigate();
  const isActing = acting === result.id;
  const status   = result.status;
  const chip = STATUS_CHIP[status] || STATUS_CHIP.new;

  return (
    <tr style={{ borderBottom: '1px solid #F4F1EC' }}>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
            {result.avatarUrl
              ? <img src={result.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C8C0B8' }}><Users size={14} /></div>
            }
          </div>
          <div>
            <p style={{ fontWeight: '600', fontSize: '13px', color: '#1C1A16', margin: 0 }}>
              {result.displayName || result.username}
              {result.isVerified && <span style={{ marginLeft: '4px', color: '#1B6B65', fontSize: '10px' }}>✓</span>}
            </p>
            <p style={{ fontSize: '11px', color: '#8C8070', margin: '1px 0 0', fontFamily: 'monospace' }}>@{result.username}</p>
          </div>
        </div>
      </td>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '12px', color: '#4A433A' }}>
        {result.followerCount != null ? result.followerCount.toLocaleString() : '—'}
      </td>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '12px', color: '#4A433A' }}>
        {result.engagementRate != null ? `${result.engagementRate.toFixed(1)}%` : '—'}
      </td>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '12px', color: '#8C8070', maxWidth: '200px' }}>
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {result.bio || '—'}
        </span>
      </td>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle', fontSize: '12px', color: '#4A433A' }}>
        {result.country || '—'}
      </td>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        <ScoreBadge score={result.score} />
      </td>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        <span style={S.chip(chip.color, chip.bg)}>{status.replace(/_/g, ' ')}</span>
      </td>
      <td style={{ padding: '10px 14px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
          {status === 'new' && (
            <>
              <button onClick={() => onAddToCrm(result)} disabled={isActing}
                style={{ ...S.btnPrimary, padding: '5px 10px', fontSize: '11px', opacity: isActing ? 0.6 : 1 }}>
                <UserPlus size={11} /> Add to CRM
              </button>
              <button onClick={() => onIgnore(result)} disabled={isActing}
                style={{ ...S.btnSecondary, padding: '4px 8px', fontSize: '11px' }}>
                <EyeOff size={11} />
              </button>
              <button onClick={() => onBlock(result)} disabled={isActing}
                style={{ ...S.btnDanger, padding: '4px 8px' }}>
                <Ban size={11} />
              </button>
            </>
          )}
          {status === 'added_to_crm' && result.lead_id && (
            <button onClick={() => navigate(`/admin/creator-acquisition/leads/${result.lead_id}`)}
              style={{ ...S.btnSecondary, padding: '4px 10px', fontSize: '11px', color: '#1B6B65' }}>
              <Eye size={11} /> View Lead
            </button>
          )}
          {result.profileUrl && (
            <a href={result.profileUrl} target="_blank" rel="noopener noreferrer"
              style={{ ...S.btnSecondary, padding: '4px 8px', fontSize: '11px', textDecoration: 'none' }}>
              <ExternalLink size={11} />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Manual import modal ───────────────────────────────────────────────────────
function ImportModal({ runId, onClose, onImported, getToken }) {
  const [raw, setRaw]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  async function handleImport() {
    setError(null);
    let results;
    try {
      results = JSON.parse(raw);
      if (!Array.isArray(results)) results = [results];
    } catch {
      setError('Invalid JSON. Paste an array of objects with at least a "username" field.');
      return;
    }
    setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch('/api/admin?action=crm-import-results', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId, results }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onImported(json.inserted);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
      <div style={{ ...S.card, maxWidth: '560px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>Import Results (JSON)</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070' }}><X size={16} /></button>
        </div>
        <p style={{ fontSize: '12.5px', color: '#6B6156', marginBottom: '12px' }}>
          Paste a JSON array of creator profiles. Each object needs at least a <code>username</code> field.
          Optional fields: <code>displayName, avatarUrl, followerCount, engagementRate, bio, country, language, category, score</code>.
        </p>
        <textarea
          value={raw}
          onChange={e => setRaw(e.target.value)}
          rows={8}
          placeholder='[{"username":"travelblogger","displayName":"Travel Blogger","followerCount":45000}]'
          style={{ ...S.input, resize: 'vertical', fontFamily: 'monospace', fontSize: '11.5px' }}
        />
        {error && <p style={{ color: '#C0392B', fontSize: '12px', marginTop: '6px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={onClose} style={S.btnSecondary} disabled={loading}>Cancel</button>
          <button onClick={handleImport} style={S.btnPrimary} disabled={loading || !raw.trim()}>
            <Upload size={13} /> {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Create run form ────────────────────────────────────────────────────────────
function CreateRunForm({ onCreated, getToken }) {
  const [form, setForm]       = useState({ name: '', platform: 'instagram', searchType: 'manual', destination: '', country: '', language: '', minFollowers: '', maxFollowers: '', category: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleCreate(e) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) { setError('Name is required'); return; }
    setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch('/api/admin?action=crm-create-run', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      onCreated(json.run);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleCreate}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        {[
          { k: 'name',        lbl: 'Run Name *',           type: 'text',   span: 2 },
          { k: 'destination', lbl: 'Destination / Theme',  type: 'text' },
          { k: 'country',     lbl: 'Creator Country',      type: 'text' },
          { k: 'category',    lbl: 'Category / Niche',     type: 'text' },
          { k: 'language',    lbl: 'Language',             type: 'text' },
          { k: 'minFollowers',lbl: 'Min Followers',        type: 'number' },
          { k: 'maxFollowers',lbl: 'Max Followers',        type: 'number' },
        ].map(({ k, lbl, type, span }) => (
          <div key={k} style={{ gridColumn: span === 2 ? '1 / -1' : undefined }}>
            <label style={S.label}>{lbl}</label>
            <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} style={S.input} />
          </div>
        ))}
        <div>
          <label style={S.label}>Platform</label>
          <select value={form.platform} onChange={e => set('platform', e.target.value)} style={S.select}>
            <option value="instagram">Instagram</option>
            <option value="tiktok">TikTok</option>
            <option value="youtube">YouTube</option>
            <option value="blog">Blog</option>
          </select>
        </div>
        <div>
          <label style={S.label}>Search Type</label>
          <select value={form.searchType} onChange={e => set('searchType', e.target.value)} style={S.select}>
            {SEARCH_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>
      {error && <p style={{ color: '#C0392B', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
        <button type="submit" style={S.btnPrimary} disabled={loading}>
          <PlusCircle size={13} /> {loading ? 'Creating…' : 'Create Run'}
        </button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CreatorDiscoveryPage() {
  const { getToken } = useAuth();
  const [runs, setRuns]             = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [runData, setRunData]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [runsLoading, setRunsLoading] = useState(true);
  const [error, setError]           = useState(null);
  const [acting, setActing]         = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [expandedRunId, setExpandedRunId] = useState(null);

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch('/api/admin?action=crm-list-runs', { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRuns(json.runs || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setRunsLoading(false);
    }
  }, [getToken]);

  const loadRun = useCallback(async (runId) => {
    setLoading(true);
    setActiveRunId(runId);
    try {
      const token = await getToken();
      const res   = await fetch(`/api/admin?action=crm-get-run&id=${runId}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setRunData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function handleAddToCrm(result) {
    setActing(result.id);
    try {
      const token = await getToken();
      const res   = await fetch('/api/admin?action=crm-add-to-crm', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId: result.id }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      loadRun(activeRunId);
    } catch (e) {
      alert(e.message);
    } finally {
      setActing(null);
    }
  }

  async function handleResultAction(result, action) {
    setActing(result.id);
    try {
      const token = await getToken();
      const res   = await fetch(`/api/admin?action=${action}&id=${result.id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      loadRun(activeRunId);
    } catch (e) {
      alert(e.message);
    } finally {
      setActing(null);
    }
  }

  const activeRun = runs.find(r => r.id === activeRunId);

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={S.title}>Creator Discovery</h1>
          <p style={S.sub}>Create search runs and import creator profiles</p>
        </div>
        <button onClick={() => setShowCreateForm(v => !v)} style={S.btnPrimary}>
          <PlusCircle size={13} /> New Run
        </button>
      </div>

      {showCreateForm && (
        <div style={{ ...S.card, marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>New Discovery Run</h3>
            <button onClick={() => setShowCreateForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070' }}><X size={14} /></button>
          </div>
          <CreateRunForm getToken={getToken} onCreated={run => { loadRuns(); setShowCreateForm(false); loadRun(run.id); }} />
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '18px', alignItems: 'start' }}>
        {/* Runs sidebar */}
        <div style={S.card}>
          <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Discovery Runs
          </h2>
          {runsLoading && <p style={{ fontSize: '13px', color: '#8C8070' }}>Loading…</p>}
          {!runsLoading && runs.length === 0 && (
            <p style={{ fontSize: '13px', color: '#B5AA99', textAlign: 'center', padding: '16px 0' }}>No runs yet</p>
          )}
          {runs.map(run => (
            <div key={run.id}
              onClick={() => { setExpandedRunId(run.id === expandedRunId ? null : run.id); loadRun(run.id); }}
              style={{ borderBottom: '1px solid #F4F1EC', padding: '10px 0', cursor: 'pointer', background: activeRunId === run.id ? '#F8F6F2' : 'transparent' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#1C1A16', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.name}
                  </p>
                  <p style={{ fontSize: '11px', color: '#8C8070', margin: '2px 0 0' }}>
                    {run.platform} · {run.searchType}
                  </p>
                </div>
                <span style={{ fontSize: '11px', fontWeight: '600', color: '#1B6B65', flexShrink: 0, marginLeft: '6px' }}>
                  {Number(run.resultCount || 0)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Results panel */}
        <div>
          {!activeRunId && (
            <div style={{ ...S.card, textAlign: 'center', padding: '48px 24px', color: '#B5AA99' }}>
              <Search size={28} style={{ marginBottom: '10px', opacity: 0.5 }} />
              <p style={{ fontSize: '14px' }}>Select a run to view results</p>
            </div>
          )}
          {activeRunId && (
            <div style={S.card}>
              {activeRun && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>{activeRun.name}</h2>
                    <p style={{ fontSize: '11.5px', color: '#8C8070', margin: '2px 0 0' }}>
                      {activeRun.platform} · {activeRun.searchType} · {Number(activeRun.resultCount || 0)} results
                      {activeRun.addedCount > 0 && ` · ${activeRun.addedCount} added to CRM`}
                    </p>
                  </div>
                  <button onClick={() => setShowImport(true)} style={S.btnSecondary}>
                    <Upload size={13} /> Import Results
                  </button>
                </div>
              )}
              {loading && <p style={{ textAlign: 'center', color: '#8C8070', padding: '30px' }}>Loading results…</p>}
              {!loading && runData && (
                <>
                  {runData.results.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#B5AA99' }}>
                      <p style={{ fontSize: '14px', marginBottom: '8px' }}>No results yet</p>
                      <button onClick={() => setShowImport(true)} style={S.btnPrimary}>
                        <Upload size={13} /> Import Results
                      </button>
                    </div>
                  )}
                  {runData.results.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                        <thead>
                          <tr style={{ background: '#F8F6F2' }}>
                            {['Creator','Followers','Engagement','Bio','Country','Score','Status','Actions'].map(h => (
                              <th key={h} style={{ padding: '8px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '700', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {runData.results.map(r => (
                            <ResultRow key={r.id} result={r} onAddToCrm={handleAddToCrm}
                              onIgnore={r => handleResultAction(r, 'crm-ignore-result')}
                              onBlock={r => handleResultAction(r, 'crm-block-result')}
                              acting={acting} />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showImport && (
        <ImportModal
          runId={activeRunId}
          getToken={getToken}
          onClose={() => setShowImport(false)}
          onImported={count => { setShowImport(false); loadRun(activeRunId); loadRuns(); alert(`${count} result(s) imported.`); }}
        />
      )}
    </div>
  );
}
