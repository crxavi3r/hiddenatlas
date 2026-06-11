import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  PlusCircle, Upload, Eye, UserPlus, EyeOff, Ban,
  X, Search, ExternalLink, Users, RefreshCw, CheckCircle,
  Sparkles, Globe, FileUp, ChevronLeft,
} from 'lucide-react';

// ── Styles ────────────────────────────────────────────────────────────────────

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

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CHIP = {
  new:          { color: '#8C8070',  bg: '#F4F1EC' },
  added_to_crm: { color: '#1B6B65',  bg: '#EFF6F5' },
  ignored:      { color: '#B5AA99',  bg: '#F4F1EC' },
  blocked:      { color: '#C0392B',  bg: '#FDECEA' },
};

const RUN_STATUS_CHIP = {
  running:   { color: '#C9A96E', bg: '#FBF8F1' },
  active:    { color: '#1B6B65', bg: '#EFF6F5' },
  completed: { color: '#8C8070', bg: '#F4F1EC' },
  failed:    { color: '#C0392B', bg: '#FDECEA' },
};

const SEARCH_TYPE_LABELS = {
  ai_search:   'AI Search',
  manual:      'Manual',
  csv_import:  'CSV Import',
  json_import: 'JSON Import',
};

const AI_STEPS = [
  'Creating discovery run...',
  'Querying AI provider...',
  'Scoring and structuring profiles...',
  'Saving results...',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ toast }) {
  if (!toast) return null;
  const isErr = toast.type === 'error';
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 900,
      background: isErr ? '#C0392B' : '#1B6B65', color: 'white',
      padding: '11px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', gap: '7px',
      maxWidth: '320px',
    }}>
      {isErr ? <X size={14} /> : <CheckCircle size={14} />}
      <span style={{ flex: 1 }}>{toast.msg}</span>
    </div>
  );
}

// ── Score badge ───────────────────────────────────────────────────────────────

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: '#C8C0B8', fontSize: '12px' }}>—</span>;
  const n = Number(score);
  const color = n >= 70 ? '#1B6B65' : n >= 45 ? '#C9A96E' : '#C0392B';
  return <span style={{ fontWeight: '700', fontSize: '12px', color }}>{n.toFixed(0)}</span>;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ size = 16 }) {
  return (
    <>
      <style>{`@keyframes _spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{
        width: size, height: size,
        border: `2px solid #D4C8BB`, borderTopColor: '#1B6B65',
        borderRadius: '50%', animation: '_spin 0.8s linear infinite', flexShrink: 0,
      }} />
    </>
  );
}

// ── AI Progress ───────────────────────────────────────────────────────────────

function AiProgress({ currentStep, done, error }) {
  return (
    <div style={{ padding: '20px 24px', background: '#F8F6F2', borderRadius: '8px', border: '1px solid #E8E3DA' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        {!done && !error && <Spinner size={14} />}
        {done  && <CheckCircle size={14} color="#1B6B65" />}
        {error && <X size={14} color="#C0392B" />}
        <span style={{ fontSize: '13px', fontWeight: '600', color: error ? '#C0392B' : '#1C1A16' }}>
          {error ? 'Search failed' : done ? 'Search complete' : 'Searching for Travel Designers...'}
        </span>
      </div>
      {AI_STEPS.map((label, i) => {
        const isDone    = done || i < currentStep;
        const isCurrent = !done && !error && i === currentStep;
        const isPending = !done && !error && i > currentStep;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
            <div style={{ width: '16px', height: '16px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {isDone    && <CheckCircle size={14} color="#1B6B65" />}
              {isCurrent && <Spinner size={14} />}
              {isPending && <div style={{ width: '14px', height: '14px', border: '1.5px solid #D4C8BB', borderRadius: '50%' }} />}
              {error     && i === currentStep && <X size={13} color="#C0392B" />}
            </div>
            <span style={{ fontSize: '12.5px', color: isDone ? '#1B6B65' : isCurrent ? '#1C1A16' : '#B5AA99' }}>
              {label}
            </span>
          </div>
        );
      })}
      {!done && !error && (
        <p style={{ fontSize: '11.5px', color: '#B5AA99', marginTop: '12px' }}>
          This may take 20–40 seconds depending on the AI provider.
        </p>
      )}
    </div>
  );
}

// ── AI Search Panel ───────────────────────────────────────────────────────────

const EMPTY_AI = {
  destinationTheme: '', creatorCountry: '', language: '', niche: '',
  minFollowers: '', maxFollowers: '', targetCount: '20', notes: '',
};

function AiSearchPanel({ onSearchDone, getToken }) {
  const [form, setForm]         = useState(EMPTY_AI);
  const [searching, setSearching] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [done, setDone]         = useState(false);
  const [error, setError]       = useState(null);
  const [result, setResult]     = useState(null);
  const stepTimersRef           = useRef([]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  function startStepAnimation() {
    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [
      setTimeout(() => setCurrentStep(1), 6_000),
      setTimeout(() => setCurrentStep(2), 14_000),
      setTimeout(() => setCurrentStep(3), 22_000),
    ];
  }
  function clearStepTimers() { stepTimersRef.current.forEach(clearTimeout); }

  async function handleSearch(e) {
    e.preventDefault();
    if (!form.destinationTheme.trim()) return;
    setSearching(true);
    setError(null);
    setDone(false);
    setResult(null);
    setCurrentStep(0);
    startStepAnimation();
    try {
      const data = await crmCall(getToken, 'discovery.aiSearchProfiles', {
        platform:         'instagram',
        destinationTheme: form.destinationTheme.trim(),
        creatorCountry:   form.creatorCountry  || undefined,
        language:         form.language        || undefined,
        niche:            form.niche           || undefined,
        minFollowers:     form.minFollowers    ? parseInt(form.minFollowers, 10)  : undefined,
        maxFollowers:     form.maxFollowers    ? parseInt(form.maxFollowers, 10)  : undefined,
        targetCount:      parseInt(form.targetCount, 10) || 20,
        notes:            form.notes           || undefined,
      });
      clearStepTimers();
      setCurrentStep(4);
      setDone(true);
      setResult(data);
      onSearchDone(data);
    } catch (e) {
      clearStepTimers();
      setError(e.message);
    } finally {
      setSearching(false);
    }
  }

  function handleReset() {
    setDone(false);
    setError(null);
    setResult(null);
    setCurrentStep(0);
    setSearching(false);
  }

  const isProviderError = error && (
    error.includes('not configured') || error.includes('ANTHROPIC_API_KEY') || error.includes('PROVIDER_NOT_CONFIGURED')
  );

  if (searching || done || error) {
    return (
      <div>
        <AiProgress currentStep={currentStep} done={done} error={!!error} />
        {done && result && (
          <div style={{ marginTop: '12px', padding: '12px 16px', background: '#EFF6F5', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#1B6B65', fontWeight: '500' }}>
              Found {result.inserted} profile{result.inserted !== 1 ? 's' : ''}
              {result.skipped > 0 && ` (${result.skipped} skipped)`}
              {result.providerStatus?.provider && ` via ${result.providerStatus.provider}`}
            </span>
            <button onClick={handleReset} style={{ ...S.btnSecondary, fontSize: '12px', padding: '5px 10px' }}>
              New Search
            </button>
          </div>
        )}
        {error && (
          <div style={{ marginTop: '12px' }}>
            {isProviderError ? (
              <div style={{ padding: '14px 16px', background: '#FBF8F1', borderRadius: '8px', border: '1px solid #E8C97A' }}>
                <p style={{ fontSize: '13px', fontWeight: '600', color: '#C9A96E', marginBottom: '6px' }}>AI Search provider not configured</p>
                <p style={{ fontSize: '12.5px', color: '#4A433A', lineHeight: '1.6', margin: '0 0 10px' }}>
                  Add <code style={{ background: '#F4F1EC', padding: '1px 5px', borderRadius: '3px' }}>ANTHROPIC_API_KEY</code> to your Vercel environment variables to enable AI Search.
                  Optionally add <code style={{ background: '#F4F1EC', padding: '1px 5px', borderRadius: '3px' }}>TAVILY_API_KEY</code> for web-augmented search.
                </p>
                <p style={{ fontSize: '12px', color: '#8C8070', margin: 0 }}>
                  Until then, use <strong>Manual Import</strong> to add creator profiles manually.
                </p>
              </div>
            ) : (
              <div style={{ padding: '12px 14px', background: '#FDECEA', borderRadius: '8px', border: '1px solid #F5C6C0' }}>
                <p style={{ fontSize: '12.5px', color: '#C0392B', margin: '0 0 8px' }}>{error}</p>
                <button onClick={handleReset} style={{ ...S.btnSecondary, fontSize: '12px', padding: '5px 10px' }}>
                  <RefreshCw size={11} /> Retry
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSearch}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>
            Destination / Theme <span style={{ color: '#C9A96E' }}>required</span>
          </label>
          <input
            value={form.destinationTheme}
            onChange={e => set('destinationTheme', e.target.value)}
            placeholder="e.g. Japan slow travel, Menorca hidden beaches, Morocco food"
            style={S.input}
            required
          />
        </div>
        <div>
          <label style={S.label}>Creator Country <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional</span></label>
          <input value={form.creatorCountry} onChange={e => set('creatorCountry', e.target.value)} placeholder="e.g. Portugal, Japan" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Language <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional</span></label>
          <input value={form.language} onChange={e => set('language', e.target.value)} placeholder="e.g. en, pt, es, fr" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Niche / Category <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional</span></label>
          <input value={form.niche} onChange={e => set('niche', e.target.value)} placeholder="e.g. luxury, food, family, hiking" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Min Followers <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional</span></label>
          <input type="number" value={form.minFollowers} onChange={e => set('minFollowers', e.target.value)} placeholder="e.g. 10000" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Max Followers <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional</span></label>
          <input type="number" value={form.maxFollowers} onChange={e => set('maxFollowers', e.target.value)} placeholder="e.g. 500000" style={S.input} />
        </div>
        <div>
          <label style={S.label}>Target Count <span style={{ color: '#B5AA99', fontWeight: '400' }}>max 50</span></label>
          <input type="number" min="1" max="50" value={form.targetCount} onChange={e => set('targetCount', e.target.value)} style={S.input} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={S.label}>Notes <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional — extra context for the AI</span></label>
          <input value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="e.g. prefer micro-creators with personal voice, not agency accounts" style={S.input} />
        </div>
      </div>
      <div style={{ marginTop: '16px' }}>
        <button type="submit" style={{ ...S.btnPrimary, gap: '8px' }} disabled={!form.destinationTheme.trim()}>
          <Sparkles size={14} /> Find creators with AI
        </button>
        <p style={{ fontSize: '11.5px', color: '#B5AA99', marginTop: '8px' }}>
          Uses AI to suggest potential Travel Designers matching your criteria. Results are based on AI knowledge — always verify before contacting.
        </p>
      </div>
    </form>
  );
}

// ── Result Row ────────────────────────────────────────────────────────────────

function ResultRow({ result, onAddToCrm, onIgnore, onBlock, acting }) {
  const navigate = useNavigate();
  const isActing = acting === result.id;
  const status   = result.status ?? 'new';
  const chip     = STATUS_CHIP[status] || STATUS_CHIP.new;
  const profileUrl = result.profileUrl || (result.platform === 'instagram' ? `https://www.instagram.com/${result.username}/` : null);
  const meta     = typeof result.metadata === 'object' ? result.metadata : {};

  return (
    <tr style={{ borderBottom: '1px solid #F4F1EC', opacity: isActing ? 0.5 : 1 }}>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '30px', height: '30px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
            {result.avatarUrl
              ? <img src={result.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#C8C0B8' }}><Users size={11} /></div>
            }
          </div>
          <div>
            <p style={{ fontWeight: '600', fontSize: '12px', color: '#1C1A16', margin: 0, whiteSpace: 'nowrap' }}>
              {result.displayName || result.username}
            </p>
            <p style={{ fontSize: '10px', color: '#8C8070', margin: 0, fontFamily: 'monospace' }}>@{result.username}</p>
          </div>
        </div>
      </td>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle', fontSize: '11px', color: '#4A433A' }}>{fmtK(result.followerCount)}</td>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle', fontSize: '11px', color: '#8C8070' }}>{result.country || '—'}</td>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle', fontSize: '11px', color: '#8C8070' }}>{result.language || '—'}</td>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle', fontSize: '11px', color: '#8C8070', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.category || '—'}</td>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle' }}><ScoreBadge score={result.score} /></td>
      <td style={{ padding: '9px 10px', verticalAlign: 'top', maxWidth: '220px' }}>
        {result.fitSummary && (
          <p style={{ fontSize: '11px', color: '#4A433A', margin: 0, lineHeight: '1.5',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
            {result.fitSummary}
          </p>
        )}
        {meta.rawData?.confidenceLevel && (
          <span style={{ fontSize: '9.5px', color: meta.rawData.confidenceLevel === 'high' ? '#1B6B65' : meta.rawData.confidenceLevel === 'medium' ? '#C9A96E' : '#B5AA99', fontWeight: '600', textTransform: 'uppercase' }}>
            {meta.rawData.confidenceLevel}
          </span>
        )}
      </td>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle' }}>
        <span style={S.chip(chip.color, chip.bg)}>{status.replace(/_/g, ' ')}</span>
        {meta.existingLeadId && <p style={{ fontSize: '9.5px', color: '#1B6B65', margin: '2px 0 0' }}>already in CRM</p>}
      </td>
      <td style={{ padding: '9px 10px', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {status === 'new' && (
            <>
              <button onClick={() => onAddToCrm(result)} disabled={isActing}
                style={{ ...S.btnPrimary, padding: '4px 8px', fontSize: '10.5px', gap: '3px' }}>
                <UserPlus size={10} /> CRM
              </button>
              <button onClick={() => onIgnore(result)} disabled={isActing} title="Ignore"
                style={{ ...S.btnSecondary, padding: '4px 6px' }}><EyeOff size={10} /></button>
              <button onClick={() => onBlock(result)} disabled={isActing} title="Block"
                style={{ ...S.btnDanger, padding: '4px 6px' }}><Ban size={10} /></button>
            </>
          )}
          {status === 'added_to_crm' && (result.lead_id || meta.existingLeadId) && (
            <button onClick={() => navigate(`/admin/creator-acquisition/leads/${result.lead_id || meta.existingLeadId}`)}
              style={{ ...S.btnSecondary, padding: '4px 8px', fontSize: '10.5px', color: '#1B6B65' }}>
              <Eye size={10} /> Lead
            </button>
          )}
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer"
              style={{ ...S.btnSecondary, padding: '4px 6px', textDecoration: 'none' }}>
              <ExternalLink size={10} />
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Import Modal (Manual mode) ────────────────────────────────────────────────

const EMPTY_MANUAL = {
  username: '', displayName: '', profileUrl: '', avatarUrl: '',
  followerCount: '', postCount: '', engagementRate: '',
  bio: '', country: '', language: '', category: '', score: '',
  destinations: '', routeIdeas: '',
};

function ImportModal({ run, onClose, onImported, getToken }) {
  const [mode, setMode]         = useState('json');
  const [jsonRaw, setJsonRaw]   = useState('');
  const [usernames, setUsernames] = useState('');
  const [manual, setManual]     = useState(EMPTY_MANUAL);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const setM = (k, v) => setManual(f => ({ ...f, [k]: v }));

  async function handleImport() {
    setError(null);
    let results = [];
    if (mode === 'json') {
      try {
        const p = JSON.parse(jsonRaw);
        results = Array.isArray(p) ? p : [p];
      } catch { setError('Invalid JSON — paste an array of objects with at least a "username" field.'); return; }
    } else if (mode === 'usernames') {
      const lines = usernames.split('\n').map(l => l.trim().replace(/^@/, '')).filter(Boolean);
      if (!lines.length) { setError('Paste at least one username.'); return; }
      results = lines.map(u => ({ username: u, platform: run.platform, profileUrl: run.platform === 'instagram' ? `https://www.instagram.com/${u}/` : null }));
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
        profileUrl:     manual.profileUrl || (run.platform === 'instagram' ? `https://www.instagram.com/${manual.username.trim()}/` : null),
      }];
    }
    setLoading(true);
    try {
      const data = await crmCall(getToken, 'discovery.importResults', { runId: run.id, results });
      onImported(data.inserted ?? 0);
    } catch (e) { setError(e.message); setLoading(false); }
  }

  const tabStyle = (a) => ({ padding: '6px 12px', fontSize: '12.5px', fontWeight: a ? '600' : '400', border: 'none', borderBottom: `2px solid ${a ? '#1B6B65' : 'transparent'}`, cursor: 'pointer', background: 'none', color: a ? '#1B6B65' : '#8C8070' });
  const MField  = ({ k, label, type = 'text', placeholder = '' }) => (
    <div>
      <label style={{ ...S.label, fontSize: '11px' }}>{label}</label>
      <input type={type} value={manual[k]} onChange={e => setM(k, e.target.value)} placeholder={placeholder} style={{ ...S.input, fontSize: '12px', padding: '6px 8px' }} />
    </div>
  );

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.card, maxWidth: '560px', width: '100%', maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>Add Profiles to Run</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070' }}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', borderBottom: '1px solid #E8E3DA', marginBottom: '14px' }}>
          {[['json','Paste JSON'],['usernames','Paste Usernames'],['manual','Add Manually']].map(([k,l]) => (
            <button key={k} onClick={() => { setMode(k); setError(null); }} style={tabStyle(mode === k)}>{l}</button>
          ))}
        </div>
        {mode === 'json' && (
          <>
            <p style={{ fontSize: '11.5px', color: '#6B6156', marginBottom: '8px' }}>
              Paste a JSON array. Each object needs at least <code style={{ background: '#F4F1EC', padding: '1px 4px', borderRadius: '3px' }}>username</code>.
            </p>
            <textarea value={jsonRaw} onChange={e => setJsonRaw(e.target.value)} rows={7}
              placeholder={'[\n  { "username": "travelblogger", "followerCount": 45000, "country": "Portugal" }\n]'}
              style={S.textarea} />
          </>
        )}
        {mode === 'usernames' && (
          <>
            <p style={{ fontSize: '11.5px', color: '#6B6156', marginBottom: '8px' }}>
              One username per line (with or without @). Platform: <strong>{run.platform}</strong>.
            </p>
            <textarea value={usernames} onChange={e => setUsernames(e.target.value)} rows={7}
              placeholder={'@travelblogger\nexploring_portugal\njapantravel'} style={S.textarea} />
          </>
        )}
        {mode === 'manual' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ ...S.label, fontSize: '11px' }}>Username *</label>
              <input value={manual.username} onChange={e => setM('username', e.target.value)} placeholder="travelblogger" style={{ ...S.input, fontSize: '12px', padding: '6px 8px' }} />
            </div>
            <MField k="displayName"    label="Display Name"  placeholder="Travel Blogger" />
            <MField k="followerCount"  label="Followers"     type="number" placeholder="45000" />
            <MField k="engagementRate" label="Engagement %"  type="number" placeholder="3.2" />
            <MField k="score"          label="Score (0–100)" type="number" placeholder="72" />
            <MField k="country"        label="Country"       placeholder="Portugal" />
            <MField k="language"       label="Language"      placeholder="pt" />
            <MField k="category"       label="Category"      placeholder="travel" />
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
              <textarea value={manual.routeIdeas} onChange={e => setM('routeIdeas', e.target.value)} rows={3} placeholder={"Portugal slow travel\nJapan first timers"} style={{ ...S.textarea, fontSize: '12px' }} />
            </div>
          </div>
        )}
        {error && <p style={{ color: '#C0392B', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px' }}>
          <button onClick={onClose} style={S.btnSecondary} disabled={loading}>Cancel</button>
          <button onClick={handleImport} style={S.btnPrimary} disabled={loading}>
            <Upload size={13} /> {loading ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── New Manual Run Modal ──────────────────────────────────────────────────────

function NewManualRunModal({ onClose, onCreated, getToken }) {
  const [form, setForm]   = useState({ platform: 'instagram', searchType: 'manual', destination: '', country: '', language: '', name: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const autoHint = ['Instagram', form.destination || null, fmtDate(new Date().toISOString())].filter(Boolean).join(' · ');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const data = await crmCall(getToken, 'discovery.createRun', form);
      onCreated(data.run);
    } catch (e) { setError(e.message); setLoading(false); }
  }

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...S.card, maxWidth: '440px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h3 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>New Manual Run</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8C8070' }}><X size={14} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
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
                <option value="manual">Manual</option>
                <option value="csv_import">CSV Import</option>
                <option value="json_import">JSON Import</option>
              </select>
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Destination / Theme</label>
              <input value={form.destination} onChange={e => set('destination', e.target.value)} placeholder="e.g. Japan, Menorca, Morocco" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Country</label>
              <input value={form.country} onChange={e => set('country', e.target.value)} placeholder="e.g. Portugal" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Language</label>
              <input value={form.language} onChange={e => set('language', e.target.value)} placeholder="e.g. pt" style={S.input} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={S.label}>Run Name <span style={{ color: '#B5AA99', fontWeight: '400' }}>optional — auto-generated if blank</span></label>
              <input value={form.name} onChange={e => set('name', e.target.value)} placeholder={autoHint} style={S.input} />
            </div>
          </div>
          {error && <p style={{ color: '#C0392B', fontSize: '12px', marginTop: '8px' }}>{error}</p>}
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '14px' }}>
            <button type="button" onClick={onClose} style={S.btnSecondary} disabled={loading}>Cancel</button>
            <button type="submit" style={S.btnPrimary} disabled={loading}>
              <PlusCircle size={13} /> {loading ? 'Creating…' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CreatorDiscoveryPage() {
  const { getToken } = useAuth();
  const [mode, setMode]               = useState('ai_search');
  const [runs, setRuns]               = useState([]);
  const [activeRunId, setActiveRunId] = useState(null);
  const [runData, setRunData]         = useState(null);
  const [loading, setLoading]         = useState(false);
  const [runsLoading, setRunsLoading] = useState(true);
  const [runsError, setRunsError]     = useState(null);
  const [runError, setRunError]       = useState(null);
  const [acting, setActing]           = useState(null);
  const [showImport, setShowImport]   = useState(false);
  const [showNewRun, setShowNewRun]   = useState(false);
  const [toast, setToast]             = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const loadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await crmCall(getToken, 'discovery.listRuns');
      setRuns(data.runs ?? []);
    } catch (e) { setRunsError(e.message); }
    finally { setRunsLoading(false); }
  }, [getToken]);

  const loadRun = useCallback(async (runId) => {
    setLoading(true);
    setRunError(null);
    setActiveRunId(runId);
    try {
      const data = await crmCall(getToken, 'discovery.getRun', { id: runId });
      setRunData({ run: data.run, results: data.results ?? [] });
    } catch (e) { setRunError(e.message); }
    finally { setLoading(false); }
  }, [getToken]);

  useEffect(() => { loadRuns(); }, [loadRuns]);

  function handleAiSearchDone(data) {
    showToast(`Found ${data.inserted} profile${data.inserted !== 1 ? 's' : ''} via ${data.providerStatus?.provider || 'AI'}`);
    loadRuns().then(() => loadRun(data.run.id));
  }

  async function handleAddToCrm(result) {
    setActing(result.id);
    try {
      await crmCall(getToken, 'discovery.addResultToCrm', { id: result.id });
      showToast(`@${result.username} added to CRM`);
      loadRun(activeRunId);
      loadRuns();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setActing(null); }
  }

  async function handleResultAction(result, status) {
    setActing(result.id);
    try {
      const action = status === 'ignored' ? 'discovery.ignoreResult' : 'discovery.blockResult';
      await crmCall(getToken, action, { id: result.id });
      setRunData(prev => prev ? { ...prev, results: prev.results.map(r => r.id === result.id ? { ...r, status } : r) } : prev);
    } catch (e) { showToast(e.message, 'error'); }
    finally { setActing(null); }
  }

  async function handleMarkCompleted() {
    try {
      await crmCall(getToken, 'discovery.markCompleted', { id: activeRunId });
      showToast('Run marked as completed');
      loadRun(activeRunId);
      loadRuns();
    } catch (e) { showToast(e.message, 'error'); }
  }

  const activeRun = runs.find(r => r.id === activeRunId) ?? runData?.run;
  const results   = runData?.results ?? [];
  const total     = results.length;
  const addedCt   = results.filter(r => r.status === 'added_to_crm').length;
  const ignoredCt = results.filter(r => r.status === 'ignored').length;
  const blockedCt = results.filter(r => r.status === 'blocked').length;

  const MODES = [
    { key: 'ai_search', label: 'AI Search',       icon: Sparkles },
    { key: 'provider',  label: 'Provider Search',  icon: Globe },
    { key: 'manual',    label: 'Manual Import',    icon: FileUp },
  ];

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={S.title}>Creator Discovery</h1>
          <p style={S.sub}>Use AI Search to discover potential Travel Designers, then review and add the best profiles to the CRM.</p>
        </div>
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
        {MODES.map(({ key, label, icon: Icon }) => {
          const active = mode === key;
          return (
            <button key={key} onClick={() => setMode(key)} style={{
              padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '600' : '400',
              border: `1.5px solid ${active ? '#1B6B65' : '#E8E3DA'}`,
              background: active ? '#EFF6F5' : 'white', color: active ? '#1B6B65' : '#4A433A',
              display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}>
              <Icon size={13} /> {label}
            </button>
          );
        })}
      </div>

      {/* 2-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '20px', alignItems: 'start' }}>
        {/* Left: run list */}
        <div style={{ ...S.card, minHeight: '320px', boxSizing: 'border-box' }}>
          <p style={{ fontSize: '11px', fontWeight: '700', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 10px' }}>
            Discovery Runs
          </p>
          {runsLoading && <p style={{ fontSize: '12.5px', color: '#8C8070' }}>Loading…</p>}
          {runsError && (
            <div>
              <p style={{ fontSize: '12px', color: '#C0392B', marginBottom: '6px' }}>{runsError}</p>
              <button onClick={loadRuns} style={{ ...S.btnSecondary, fontSize: '11px', padding: '4px 8px' }}>
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          )}
          {!runsLoading && !runsError && runs.length === 0 && (
            <p style={{ fontSize: '12px', color: '#B5AA99', textAlign: 'center', padding: '16px 0' }}>No runs yet</p>
          )}
          {activeRunId && (
            <button onClick={() => { setActiveRunId(null); setRunData(null); }}
              style={{ ...S.btnSecondary, fontSize: '11px', padding: '4px 8px', marginBottom: '8px', color: '#8C8070' }}>
              <ChevronLeft size={11} /> Back to search
            </button>
          )}
          {runs.map(run => {
            const isActive = activeRunId === run.id;
            const rsc = RUN_STATUS_CHIP[run.status] || RUN_STATUS_CHIP.active;
            return (
              <div key={run.id} onClick={() => loadRun(run.id)}
                style={{ borderRadius: '6px', padding: '8px 6px', cursor: 'pointer', marginBottom: '2px', background: isActive ? '#EFF6F5' : 'transparent', borderBottom: isActive ? 'none' : '1px solid #F4F1EC' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#1C1A16', margin: '0 0 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {run.name}
                </p>
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={S.chip(run.searchType === 'ai_search' ? '#C9A96E' : '#8C8070', run.searchType === 'ai_search' ? '#FBF8F1' : '#F4F1EC')}>
                    {SEARCH_TYPE_LABELS[run.searchType] || run.searchType}
                  </span>
                  <span style={S.chip(rsc.color, rsc.bg)}>{run.status || 'active'}</span>
                </div>
                {run.destination && <p style={{ fontSize: '10.5px', color: '#C9A96E', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.destination}</p>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', color: '#B5AA99' }}>
                  <span>{Number(run.resultCount ?? 0)} · {Number(run.addedCount ?? 0)} CRM</span>
                  <span>{fmtDate(run.createdAt)}</span>
                </div>
              </div>
            );
          })}
          {mode === 'manual' && (
            <button onClick={() => setShowNewRun(true)}
              style={{ ...S.btnSecondary, width: '100%', justifyContent: 'center', marginTop: '10px', fontSize: '12px' }}>
              <PlusCircle size={12} /> New Manual Run
            </button>
          )}
        </div>

        {/* Right: mode content or run detail */}
        <div style={{ minWidth: 0 }}>
          {!activeRunId ? (
            <>
              {mode === 'ai_search' && (
                <div style={S.card}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Sparkles size={15} color="#C9A96E" />
                    <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>AI Search</h2>
                    <span style={{ fontSize: '11.5px', color: '#8C8070' }}>— Claude-powered creator discovery</span>
                  </div>
                  <AiSearchPanel getToken={getToken} onSearchDone={handleAiSearchDone} />
                </div>
              )}

              {mode === 'provider' && (
                <div style={{ ...S.card, textAlign: 'center', padding: '48px 32px' }}>
                  <Globe size={28} color="#D4C8BB" style={{ marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#4A433A', marginBottom: '8px' }}>External Provider Search</h3>
                  <p style={{ fontSize: '13px', color: '#8C8070', maxWidth: '360px', margin: '0 auto 16px', lineHeight: '1.6' }}>
                    External provider search is not configured yet. This mode will support dedicated creator discovery APIs in a future release.
                  </p>
                  <p style={{ fontSize: '12.5px', color: '#B5AA99' }}>Use <strong>AI Search</strong> or <strong>Manual Import</strong> in the meantime.</p>
                </div>
              )}

              {mode === 'manual' && (
                <div style={{ ...S.card, textAlign: 'center', padding: '48px 32px' }}>
                  <FileUp size={28} color="#D4C8BB" style={{ marginBottom: '12px' }} />
                  <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#4A433A', marginBottom: '8px' }}>Manual Import</h3>
                  <p style={{ fontSize: '13px', color: '#8C8070', maxWidth: '360px', margin: '0 auto 16px', lineHeight: '1.6' }}>
                    Create a manual run, then import creator profiles via JSON, paste usernames, or add them one by one.
                  </p>
                  <button onClick={() => setShowNewRun(true)} style={S.btnPrimary}>
                    <PlusCircle size={13} /> New Manual Run
                  </button>
                </div>
              )}
            </>
          ) : (
            <div style={S.card}>
              {activeRun && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '3px' }}>
                        <h2 style={{ fontSize: '15px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>{activeRun.name}</h2>
                        <span style={S.chip('#1B6B65', '#EFF6F5')}>{activeRun.platform}</span>
                        {activeRun.searchType === 'ai_search' && <span style={S.chip('#C9A96E', '#FBF8F1')}>AI Search</span>}
                        {(() => { const rsc = RUN_STATUS_CHIP[activeRun.status] || RUN_STATUS_CHIP.active; return <span style={S.chip(rsc.color, rsc.bg)}>{activeRun.status || 'active'}</span>; })()}
                      </div>
                      {activeRun.destination && <p style={{ fontSize: '12px', color: '#C9A96E', margin: 0 }}>{activeRun.destination}</p>}
                    </div>
                    <div style={{ display: 'flex', gap: '7px', flexWrap: 'wrap' }}>
                      {mode === 'manual' && (
                        <button onClick={() => setShowImport(true)} style={S.btnPrimary}>
                          <Upload size={12} /> Import / Add
                        </button>
                      )}
                      <button onClick={() => loadRun(activeRunId)} style={S.btnSecondary} title="Refresh">
                        <RefreshCw size={12} />
                      </button>
                      {activeRun.status !== 'completed' && activeRun.status !== 'failed' && (
                        <button onClick={handleMarkCompleted} style={{ ...S.btnSecondary, fontSize: '12px' }}>
                          <CheckCircle size={12} /> Mark Completed
                        </button>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '20px', marginBottom: '14px', padding: '10px 14px', background: '#F8F6F2', borderRadius: '8px', flexWrap: 'wrap' }}>
                    {[['Total', total, '#1C1A16'], ['Added to CRM', addedCt, '#1B6B65'], ['Ignored', ignoredCt, '#B5AA99'], ['Blocked', blockedCt, '#C0392B']].map(([lbl, val, color]) => (
                      <div key={lbl}>
                        <span style={{ fontSize: '10.5px', color: '#8C8070', display: 'block', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{lbl}</span>
                        <span style={{ fontSize: '22px', fontWeight: '700', color }}>{val}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {loading && <p style={{ textAlign: 'center', color: '#8C8070', padding: '30px' }}>Loading profiles…</p>}
              {runError && (
                <div style={{ textAlign: 'center', padding: '24px' }}>
                  <p style={{ color: '#C0392B', marginBottom: '10px', fontSize: '13px' }}>{runError}</p>
                  <button onClick={() => loadRun(activeRunId)} style={S.btnSecondary}><RefreshCw size={12} /> Retry</button>
                </div>
              )}

              {!loading && !runError && (
                results.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px 24px', color: '#B5AA99' }}>
                    <Users size={26} style={{ marginBottom: '10px', opacity: 0.4 }} />
                    <p style={{ fontSize: '13.5px', marginBottom: '6px' }}>No profiles in this run yet</p>
                    {mode === 'ai_search'
                      ? <p style={{ fontSize: '12.5px', opacity: 0.7 }}>Use AI Search to find creators for this destination.</p>
                      : <button onClick={() => setShowImport(true)} style={{ ...S.btnPrimary, marginTop: '10px' }}><Upload size={13} /> Import Profiles</button>
                    }
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: '#F8F6F2' }}>
                          {['Creator','Followers','Country','Lang','Category','Score','Fit / AI Notes','Status','Actions'].map(h => (
                            <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontSize: '10px', fontWeight: '700', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' }}>{h}</th>
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
                )
              )}
            </div>
          )}
        </div>
      </div>

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

      {showNewRun && (
        <NewManualRunModal getToken={getToken} onClose={() => setShowNewRun(false)}
          onCreated={run => {
            setShowNewRun(false);
            showToast(`Run "${run.name}" created`);
            loadRuns().then(() => loadRun(run.id));
          }} />
      )}

      <Toast toast={toast} />
    </div>
  );
}
