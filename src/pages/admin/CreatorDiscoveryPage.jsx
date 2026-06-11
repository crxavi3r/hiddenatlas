import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  PlusCircle, Instagram, Upload, Eye, UserPlus, EyeOff, Ban,
  X, Search, ExternalLink, Users, RefreshCw, CheckCircle, Clock,
} from 'lucide-react';

const S = {
  page:    { padding: '28px 32px', background: '#FAFAF8', minHeight: '100vh' },
  title:   { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '700', color: '#1C1A16', margin: 0 },
  sub:     { fontSize: '13px', color: '#8C8070', marginTop: '4px' },
  card:    { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '20px 24px' },
  label:   { display: 'block', fontSize: '11.5px', fontWeight: '600', color: '#4A433A', marginBottom: '4px' },
  input:   { width: '100%', padding: '7px 9px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  select:  { width: '100%', padding: '7px 9px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  textarea:{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '12.5px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white', resize: 'vertical', fontFamily: 'monospace' },
  btnPrimary:   { padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: '#1B6B65', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' },
  btnSecondary: { padding: '7px 12px', borderRadius: '6px', border: '1px solid #E8E3DA', cursor: 'pointer', fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A', display: 'inline-flex', alignItems: 'center', gap: '6px' },
  btnDanger:    { padding: '6px 10px', borderRadius: '5px', border: '1px solid #F5C6C0', cursor: 'pointer', fontSize: '11.5px', fontWeight: '500', background: 'white', color: '#C0392B', display: 'inline-flex', alignItems: 'center', gap: '4px' },
  chip: (color, bg) => ({ display: 'inline-flex', alignItems: 'center', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color, background: bg, padding: '2px 7px', borderRadius: '9px' }),
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' },
};

const MVP_SEARCH_TYPES = ['manual', 'csv_import', 'json_import'];

const STATUS_CHIP = {
  new:          { color: '#8C8070',  bg: '#F4F1EC' },
  added_to_crm: { color: '#1B6B65',  bg: '#EFF6F5' },
  ignored:      { color: '#B5AA99',  bg: '#F4F1EC' },
  blocked:      { color: '#C0392B',  bg: '#FDECEA' },
};

const RUN_STATUS_CHIP = {
  active:    { color: '#1B6B65', bg: '#EFF6F5' },
  completed: { color: '#8C8070', bg: '#F4F1EC' },
  paused:    { color: '#C9A96E', bg: '#FBF8F1' },
};

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtK(n) {
  if (n == null) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

async function crmCall(getToken, action, payload = {}) {
  const token = await getToken();
  const res = await fetch('/api/admin', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error?.message || 'Request failed');
  return json.data;
}

function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === 'error';
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 900,
      background: isError ? '#C0392B' : '#1B6B65', color: 'white',
      padding: '11px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: '7px',
    }}>
      {isError ? <X size={14} /> : <CheckCircle size={14} />}
      {toast.msg}
    </div>
  );
}

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: '#C8C0B8', fontSize: '12px' }}>—</span>;
  const color = Number(score) >= 7 ? '#1B6B65' : Number(score) >= 4 ? '#C9A96E' : '#C0392B';
  return <span style={{ fontWeight: '700', fontSize: '12px', color }}>{Number(score).toFixed(0)}</span>;
}

function ResultRow({ result, onAddToCrm, onIgnore, onBlock, acting }) {
  const navigate = useNavigate();
  const isActing = acting === result.id;
  const status   = result.status ?? 'new';
  const chip     = STATUS_CHIP[status] || STATUS_CHIP.new;
  const profileUrl = result.profileUrl || (result.platform === 'instagram' ? `https://instagram.com/${result.username}` : null);

  return (
    <tr style={{ borderBottom: '1px solid #F4F1EC', opacity: isActing ? 0.5 : 1 }}>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
            {result.avatarUrl
              ? <img src={result.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C8C0B8' }}><Users size={12} /></div>
            }
          </div>
          <div>
            <p style={{ fontWeight: '600', fontSize: '12.5px', color: '#1C1A16', margin: 0, whiteSpace: 'nowrap' }}>
              {result.displayName || result.username}
            </p>
            <p style={{ fontSize: '10.5px', color: '#8C8070', margin: '1px 0 0', fontFamily: 'monospace' }}>@{result.username}</p>
          </div>
        </div>
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle', fontSize: '11.5px', color: '#4A433A', whiteSpace: 'nowrap' }}>
        {fmtK(result.followerCount)}
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle', fontSize: '11.5px', color: '#4A433A' }}>
        {result.engagementRate != null ? `${Number(result.engagementRate).toFixed(1)}%` : '—'}
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle', fontSize: '11.5px', color: '#8C8070' }}>
        {result.country || '—'}
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle', fontSize: '11.5px', color: '#8C8070' }}>
        {result.language || '—'}
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle', fontSize: '11.5px', color: '#8C8070', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {result.category || '—'}
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
        <ScoreBadge score={result.score} />
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
        <span style={S.chip(chip.color, chip.bg)}>{status.replace(/_/g, ' ')}</span>
      </td>
      <td style={{ padding: '9px 12px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {status === 'new' && (
            <>
              <button onClick={() => onAddToCrm(result)} disabled={isActing}
                style={{ ...S.btnPrimary, padding: '4px 9px', fontSize: '11px', gap: '4px' }}>
                <UserPlus size={10} /> CRM
              </button>
              <button onClick={() => onIgnore(result)} disabled={isActing}
                title="Ignore" style={{ ...S.btnSecondary, padding: '4px 7px', fontSize: '11px' }}>
                <EyeOff size={11} />
              </button>
              <button onClick={() => onBlock(result)} disabled={isActing}
                title="Block" style={{ ...S.btnDanger, padding: '4px 7px' }}>
                <Ban size={11} />
              </button>
            </>
          )}
          {status === 'added_to_crm' && result.lead_id && (
            <button onClick={() => navigate(`/admin/creator-acquisition/leads/${result.lead_id}`)}
              style={{ ...S.btnSecondary, padding: '4px 9px', fontSize: '11px', color: '#1B6B65' }}>
              <Eye size={10} /> Lead
            </button>
          )}
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer"
              style={{ ...S.btnSecondary, padding: '4px 7px', fontSize: '11px', textDecoration: 'none' }}>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

function NewRunModal({ onClose, onCreated, getToken }) {
  const [form, setForm] = useState({
    platform: 'instagram', searchType: 'manual',
    destination: '', country: '', language: '', name: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await crmCall(getToken, 'discovery.createRun', form);
      onCreated(data.run);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  const autoNameHint = [
    form.platform.charAt(0).toUpperCase() + form.platform.slice(1),
    form.destination || null,
    fmtDate(new Date().toISOString()),
  ].filter(Boolean).join(' · ');

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.card, maxWidth: '480px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>New Discovery Run</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070' }}><X size={15} /></button>
        </div>
        <p style={{ fontSize: '12px', color: '#8C8070', marginBottom: '16px', lineHeight: '1.5' }}>
          This is a manual discovery session. Import profiles via JSON, username list, or add them one by one. No automatic scraping.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
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
                {MVP_SEARCH_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Destination / Theme <span style={{ color: '#C9A96E' }}>recommended</span></label>
              <input value={form.destination} onChange={e => set('destination', e.target.value)} placeholder="e.g. Japan slow travel, Portugal food" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Creator Country <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional</span></label>
              <input value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. Portugal, Spain" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Language <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional</span></label>
              <input value={form.language} onChange={e => set('language', e.target.value)} placeholder="e.g. pt, en, es" style={S.input} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Run Name <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional — auto-generated if blank</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={autoNameHint} style={S.input} />
            </div>
          </div>
          {error && <p style={{ color: '#C0392B', fontSize: '12px', marginTop: '10px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
            <button type="button" onClick={onClose} style={S.btnSecondary} disabled={loading}>Cancel</button>
            <button type="submit" style={S.btnPrimary} disabled={loading}>
              <PlusCircle size={13} /> {loading ? 'Creating…' : 'Create Run'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const EMPTY_MANUAL = {
  username: '', displayName: '', profileUrl: '', avatarUrl: '',
  followerCount: '', postCount: '', engagementRate: '',
  bio: '', country: '', language: '', category: '', score: '',
  destinations: '', routeIdeas: '',
};

function ImportModal({ run, onClose, onImported, getToken }) {
  const [mode, setMode]       = useState('json');
  const [jsonRaw, setJsonRaw] = useState('');
  const [usernames, setUsernames] = useState('');
  const [manual, setManual]   = useState(EMPTY_MANUAL);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);
  const setM = (k, v) => setManual(f => ({ ...f, [k]: v }));

  async function handleImport() {
    setError(null);
    let results = [];

    if (mode === 'json') {
      try {
        const parsed = JSON.parse(jsonRaw);
        results = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        setError('Invalid JSON. Paste an array of objects — each needs at least a "username" field.');
        return;
      }
    } else if (mode === 'usernames') {
      const lines = usernames.split('\n').map(l => l.trim().replace(/^@/, '')).filter(Boolean);
      if (!lines.length) { setError('Paste at least one username.'); return; }
      results = lines.map(u => ({
        username: u,
        platform: run.platform,
        profileUrl: run.platform === 'instagram' ? `https://instagram.com/${u}` : null,
      }));
    } else {
      if (!manual.username.trim()) { setError('Username is required.'); return; }
      results = [{
        ...manual,
        followerCount:  manual.followerCount  ? parseInt(manual.followerCount, 10)  : null,
        postCount:      manual.postCount      ? parseInt(manual.postCount, 10)      : null,
        engagementRate: manual.engagementRate ? parseFloat(manual.engagementRate)   : null,
        score:          manual.score          ? parseFloat(manual.score)            : null,
        destinations:   manual.destinations   ? manual.destinations.split(',').map(s => s.trim()).filter(Boolean) : [],
        routeIdeas:     manual.routeIdeas     ? manual.routeIdeas.split('\n').map(s => s.trim()).filter(Boolean)  : [],
        platform:       run.platform,
        profileUrl:     manual.profileUrl || (run.platform === 'instagram' ? `https://instagram.com/${manual.username.trim()}` : null),
      }];
    }

    setLoading(true);
    try {
      const data = await crmCall(getToken, 'discovery.importResults', { runId: run.id, results });
      onImported(data.inserted ?? 0);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  const tabStyle = (active) => ({
    padding: '6px 12px', fontSize: '12.5px', fontWeight: active ? '600' : '400',
    border: 'none', borderBottom: `2px solid ${active ? '#1B6B65' : 'transparent'}`,
    cursor: 'pointer', background: 'none', color: active ? '#1B6B65' : '#8C8070',
  });

  const MField = ({ k, label, type = 'text', placeholder = '' }) => (
    <div>
      <label style={{ ...S.label, fontSize: '11px' }}>{label}</label>
      <input type={type} value={manual[k]} onChange={e => setM(k, e.target.value)} placeholder={placeholder} style={{ ...S.input, fontSize: '12px', padding: '6px 8px' }} />
    </div>
  );

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.card, maxWidth: '580px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>Add Profiles to Run</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070' }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #E8E3DA', marginBottom: '16px', gap: '0' }}>
          {[['json','Paste JSON'],['usernames','Paste Usernames'],['manual','Add Manually']].map(([k, lbl]) => (
            <button key={k} onClick={() => { setMode(k); setError(null); }} style={tabStyle(mode === k)}>{lbl}</button>
          ))}
        </div>

        {mode === 'json' && (
          <>
            <p style={{ fontSize: '11.5px', color: '#6B6156', marginBottom: '8px' }}>
              Paste a JSON array. Each object needs at least <code style={{ background: '#F4F1EC', padding: '1px 4px', borderRadius: '3px' }}>username</code>.
              Optional: <code style={{ background: '#F4F1EC', padding: '1px 4px', borderRadius: '3px' }}>displayName, followerCount, engagementRate, bio, country, language, category, score, destinations, routeIdeas</code>
            </p>
            <textarea value={jsonRaw} onChange={e => setJsonRaw(e.target.value)} rows={8}
              placeholder={'[\n  {\n    "username": "travelblogger",\n    "displayName": "Travel Blogger",\n    "followerCount": 45000,\n    "country": "Portugal"\n  }\n]'}
              style={S.textarea} />
          </>
        )}

        {mode === 'usernames' && (
          <>
            <p style={{ fontSize: '11.5px', color: '#6B6156', marginBottom: '8px' }}>
              Paste one username per line (with or without @). Profiles will be created with minimal data for platform: <strong>{run.platform}</strong>.
            </p>
            <textarea value={usernames} onChange={e => setUsernames(e.target.value)} rows={8}
              placeholder={'@travelblogger\nexploring_portugal\n@japantravel'}
              style={S.textarea} />
          </>
        )}

        {mode === 'manual' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, fontSize: '11px' }}>Username *</label>
              <input value={manual.username} onChange={e => setM('username', e.target.value)} placeholder="e.g. travelblogger" style={{ ...S.input, fontSize: '12px', padding: '6px 8px' }} />
            </div>
            <MField k="displayName"    label="Display Name"    placeholder="Travel Blogger" />
            <MField k="followerCount"  label="Followers"       type="number" placeholder="45000" />
            <MField k="engagementRate" label="Engagement Rate" type="number" placeholder="3.2" />
            <MField k="postCount"      label="Posts Count"     type="number" placeholder="350" />
            <MField k="score"          label="Score (0–10)"    type="number" placeholder="7.5" />
            <MField k="country"        label="Country"         placeholder="Portugal" />
            <MField k="language"       label="Language"        placeholder="pt" />
            <MField k="category"       label="Category"        placeholder="travel" />
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, fontSize: '11px' }}>Profile URL</label>
              <input value={manual.profileUrl} onChange={e => setM('profileUrl', e.target.value)}
                placeholder={`https://instagram.com/${manual.username || 'username'}`}
                style={{ ...S.input, fontSize: '12px', padding: '6px 8px' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, fontSize: '11px' }}>Bio</label>
              <input value={manual.bio} onChange={e => setM('bio', e.target.value)} placeholder="Short bio…" style={{ ...S.input, fontSize: '12px', padding: '6px 8px' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, fontSize: '11px' }}>Destinations <span style={{ fontWeight: '400', color: '#B5AA99' }}>comma-separated</span></label>
              <input value={manual.destinations} onChange={e => setM('destinations', e.target.value)} placeholder="Portugal, Japan, Morocco" style={{ ...S.input, fontSize: '12px', padding: '6px 8px' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, fontSize: '11px' }}>Route Ideas <span style={{ fontWeight: '400', color: '#B5AA99' }}>one per line</span></label>
              <textarea value={manual.routeIdeas} onChange={e => setM('routeIdeas', e.target.value)} rows={3}
                placeholder={"Portugal slow travel\nJapan first timers"} style={{ ...S.textarea, fontSize: '12px' }} />
            </div>
          </div>
        )}

        {error && <p style={{ color: '#C0392B', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '16px' }}>
          <button onClick={onClose} style={S.btnSecondary} disabled={loading}>Cancel</button>
          <button onClick={handleImport} style={S.btnPrimary} disabled={loading}>
            <Upload size={13} /> {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreatorDiscoveryPage() {
  const { getToken } = useAuth();
  const [runs, setRuns]               = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [runData, setRunData]         = useState(null);
  const [loading, setLoading]         = useState(false);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError]     = useState(null);
  const [runError, setRunError]       = useState(null);
  const [acting, setActing]           = useState(null);
  const [showNewRun, setShowNewRun]   = useState(false);
  const [showImport, setShowImport]   = useState(false);
  const [toast, setToast]             = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await crmCall(getToken, 'discovery.listRuns');
      setRuns(data.runs ?? []);
    } catch (e) {
      setRunsError(e.message);
    } finally {
      setRunsLoading(false);
    }
  }, [getToken]);

  const loadRun = useCallback(async (runId) => {
    setLoading(true);
    setRunError(null);
    setActiveRunId(runId);
    try {
      const data = await crmCall(getToken, 'discovery.getRun', { id: runId });
      setRunData({ run: data.run, results: data.results ?? [] });
    } catch (e) {
      setRunError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  async function handleAddToCrm(result) {
    setActing(result.id);
    try {
      await crmCall(getToken, 'discovery.addResultToCrm', { id: result.id });
      showToast(`@${result.username} added to CRM`);
      loadRun(activeRunId);
      loadRuns();
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setActing(null);
    }
  }

  async function handleResultAction(result, status) {
    setActing(result.id);
    try {
      const action = status === 'ignored' ? 'discovery.ignoreResult' : 'discovery.blockResult';
      await crmCall(getToken, action, { id: result.id });
      setRunData(prev => prev ? {
        ...prev,
        results: prev.results.map(r => r.id === result.id ? { ...r, status } : r),
      } : prev);
    } catch (e) {
      showToast(e.message, 'error');
    } finally {
      setActing(null);
    }
  }

  async function handleMarkCompleted() {
    try {
      await crmCall(getToken, 'discovery.markCompleted', { id: activeRunId });
      showToast('Run marked as completed');
      loadRun(activeRunId);
      loadRuns();
    } catch (e) {
      showToast(e.message, 'error');
    }
  }

  const activeRun = runs.find(r => r.id === activeRunId) ?? runData?.run;
  const results   = runData?.results ?? [];
  const total     = results.length;
  const addedCt   = results.filter(r => r.status === 'added_to_crm').length;
  const ignoredCt = results.filter(r => r.status === 'ignored').length;
  const blockedCt = results.filter(r => r.status === 'blocked').length;

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '22px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={S.title}>Creator Discovery</h1>
          <p style={S.sub}>Manual discovery sessions — import profiles, qualify, add to CRM</p>
        </div>
        <button onClick={() => setShowNewRun(true)} style={S.btnPrimary}>
          <PlusCircle size={13} /> New Run
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* ── Left: run list ── */}
        <div style={S.card}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>
            Discovery Runs
          </p>
          {runsLoading && <p style={{ fontSize: '12.5px', color: '#8C8070' }}>Loading…</p>}
          {runsError && (
            <div>
              <p style={{ fontSize: '12px', color: '#C0392B', marginBottom: '8px' }}>{runsError}</p>
              <button onClick={loadRuns} style={{ ...S.btnSecondary, fontSize: '11.5px', padding: '5px 9px' }}>
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          )}
          {!runsLoading && !runsError && runs.length === 0 && (
            <p style={{ fontSize: '12.5px', color: '#B5AA99', textAlign: 'center', padding: '20px 0' }}>No runs yet</p>
          )}
          {runs.map(run => {
            const isActive = activeRunId === run.id;
            const rsc = RUN_STATUS_CHIP[run.status] || RUN_STATUS_CHIP.active;
            return (
              <div key={run.id} onClick={() => loadRun(run.id)}
                style={{ borderBottom: '1px solid #F4F1EC', padding: '10px 6px', cursor: 'pointer', borderRadius: '6px', background: isActive ? '#F4F1EC' : 'transparent', marginBottom: '2px' }}>
                <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#1C1A16', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.name}
                </p>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
                  <span style={S.chip('#1B6B65', '#EFF6F5')}>{run.platform}</span>
                  <span style={S.chip('#8C8070', '#F4F1EC')}>{(run.searchType || '').replace(/_/g, ' ')}</span>
                  <span style={S.chip(rsc.color, rsc.bg)}>{run.status || 'active'}</span>
                </div>
                {run.destination && (
                  <p style={{ fontSize: '11px', color: '#C9A96E', margin: '0 0 3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {run.destination}
                  </p>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#B5AA99' }}>
                  <span>{Number(run.resultCount ?? 0)} results · {Number(run.addedCount ?? 0)} to CRM</span>
                  <span>{fmtDate(run.createdAt)}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Right: run detail ── */}
        <div>
          {!activeRunId && (
            <div style={{ ...S.card, textAlign: 'center', padding: '56px 24px', color: '#B5AA99' }}>
              <Search size={28} style={{ marginBottom: '10px', opacity: 0.4 }} />
              <p style={{ fontSize: '14px', marginBottom: '4px' }}>Select a run to view profiles</p>
              <p style={{ fontSize: '12.5px', opacity: 0.7 }}>Or create a new run to start discovering creators</p>
            </div>
          )}

          {activeRunId && (
            <div style={S.card}>
              {activeRun && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>{activeRun.name}</h2>
                        <span style={S.chip('#1B6B65', '#EFF6F5')}>{activeRun.platform}</span>
                        <span style={S.chip('#8C8070', '#F4F1EC')}>{(activeRun.searchType || '').replace(/_/g, ' ')}</span>
                        {activeRun.status === 'completed' && <span style={S.chip('#8C8070', '#F4F1EC')}>completed</span>}
                      </div>
                      {activeRun.destination && (
                        <p style={{ fontSize: '12px', color: '#C9A96E', margin: 0 }}>{activeRun.destination}</p>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                      <button onClick={() => setShowImport(true)} style={S.btnPrimary}>
                        <Upload size={12} /> Import / Add
                      </button>
                      <button onClick={() => loadRun(activeRunId)} style={S.btnSecondary} title="Refresh">
                        <RefreshCw size={12} /> Refresh
                      </button>
                      {activeRun.status !== 'completed' && (
                        <button onClick={handleMarkCompleted} style={{ ...S.btnSecondary, color: '#1B6B65' }}>
                          <Clock size={12} /> Mark Completed
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '16px', marginBottom: '16px', padding: '10px 14px', background: '#F8F6F2', borderRadius: '8px', flexWrap: 'wrap' }}>
                    {[['Total', total, '#1C1A16'], ['Added to CRM', addedCt, '#1B6B65'], ['Ignored', ignoredCt, '#B5AA99'], ['Blocked', blockedCt, '#C0392B']].map(([lbl, val, color]) => (
                      <div key={lbl}>
                        <span style={{ fontSize: '11px', color: '#8C8070', display: 'block', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{lbl}</span>
                        <span style={{ fontSize: '20px', fontWeight: '700', color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {loading && <p style={{ textAlign: 'center', color: '#8C8070', padding: '30px' }}>Loading profiles…</p>}
              {runError && (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <p style={{ color: '#C0392B', marginBottom: '10px', fontSize: '13px' }}>{runError}</p>
                  <button onClick={() => loadRun(activeRunId)} style={S.btnSecondary}>
                    <RefreshCw size={12} /> Retry
                  </button>
                </div>
              )}

              {!loading && !runError && (
                <>
                  {results.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '40px 24px', color: '#B5AA99' }}>
                      <Users size={28} style={{ marginBottom: '10px', opacity: 0.4 }} />
                      <p style={{ fontSize: '14px', marginBottom: '8px' }}>No profiles yet</p>
                      <p style={{ fontSize: '12.5px', marginBottom: '16px', opacity: 0.7 }}>
                        Import profiles via JSON, paste usernames, or add one manually
                      </p>
                      <button onClick={() => setShowImport(true)} style={S.btnPrimary}>
                        <Upload size={13} /> Import / Add Profiles
                      </button>
                    </div>
                  )}
                  {results.length > 0 && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: '#F8F6F2' }}>
                            {['Creator','Followers','Eng.','Country','Lang.','Category','Score','Status','Actions'].map(h => (
                              <th key={h} style={{ padding: '7px 12px', textAlign: 'left', fontSize: '10.5px', fontWeight: '700', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {results.map(r => (
                            <ResultRow key={r.id} result={r}
                              onAddToCrm={handleAddToCrm}
                              onIgnore={r => handleResultAction(r, 'ignored')}
                              onBlock={r => handleResultAction(r, 'blocked')}
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

      {showNewRun && (
        <NewRunModal getToken={getToken} onClose={() => setShowNewRun(false)}
          onCreated={run => {
            setShowNewRun(false);
            loadRuns().then(() => loadRun(run.id));
            showToast(`Run "${run.name}" created`);
          }} />
      )}

      {showImport && activeRun && (
        <ImportModal run={activeRun} getToken={getToken}
          onClose={() => setShowImport(false)}
          onImported={count => {
            setShowImport(false);
            showToast(`${count} profile${count !== 1 ? 's' : ''} imported`);
            loadRun(activeRunId);
            loadRuns();
          }} />
      )}

      <Toast toast={toast} />
    </div>
  );
}
