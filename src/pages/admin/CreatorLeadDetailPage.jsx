import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  ArrowLeft, Instagram, Copy, CheckCircle, Clock, MessageSquare,
  Activity, CheckSquare, Edit2, X, PlusCircle, Users, RefreshCw,
  ExternalLink, Camera, Pencil,
} from 'lucide-react';
import EditLeadModal from './EditLeadModal.jsx';

const S = {
  page:    { padding: '28px 32px', background: '#FAFAF8', minHeight: '100vh' },
  card:    { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '20px 24px', marginBottom: '16px' },
  label:   { display: 'block', fontSize: '11.5px', fontWeight: '600', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' },
  value:   { fontSize: '13.5px', color: '#1C1A16' },
  input:   { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  select:  { width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white' },
  textarea:{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #D4C8BB', fontSize: '13px', color: '#1C1A16', boxSizing: 'border-box', outline: 'none', background: 'white', resize: 'vertical', fontFamily: 'inherit' },
  btnPrimary:   { padding: '8px 16px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', background: '#1B6B65', color: 'white', display: 'inline-flex', alignItems: 'center', gap: '6px' },
  btnSecondary: { padding: '7px 13px', borderRadius: '6px', border: '1px solid #E8E3DA', cursor: 'pointer', fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A', display: 'inline-flex', alignItems: 'center', gap: '6px' },
  tab: (active) => ({ padding: '8px 16px', borderRadius: '6px 6px 0 0', border: '1px solid ' + (active ? '#E8E3DA' : 'transparent'), borderBottom: active ? '1px solid white' : '1px solid #E8E3DA', cursor: 'pointer', fontSize: '13px', fontWeight: active ? '600' : '400', color: active ? '#1C1A16' : '#8C8070', background: active ? 'white' : 'transparent', position: 'relative', bottom: '-1px', display: 'inline-flex', alignItems: 'center', gap: '6px' }),
};

const PIPELINE_STATUSES = [
  'identified','qualified','message_prepared','contacted','replied','interested',
  'proposal_sent','demo_scheduled','accepted','onboarding','itinerary_in_creation','active',
  'rejected','follow_up_later','blocked','not_fit',
];

const STATUS_COLORS = {
  identified: ['#8C8070','#F4F1EC'], qualified: ['#C9A96E','#FBF8F1'],
  message_prepared: ['#1B6B65','#EFF6F5'], contacted: ['#1B6B65','#EFF6F5'],
  replied: ['#2E8B57','#F0F8F1'], interested: ['#2E8B57','#F0F8F1'],
  proposal_sent: ['#1B6B65','#EFF6F5'], demo_scheduled: ['#1B6B65','#EFF6F5'],
  accepted: ['#1B6B65','#EFF6F5'], onboarding: ['#1B6B65','#EFF6F5'],
  itinerary_in_creation: ['#1B6B65','#EFF6F5'], active: ['#1B6B65','#EFF6F5'],
  rejected: ['#C0392B','#FDECEA'], follow_up_later: ['#C9A96E','#FBF8F1'],
  blocked: ['#C0392B','#FDECEA'], not_fit: ['#C0392B','#FDECEA'],
};

function StatusChip({ status }) {
  const [color, bg] = STATUS_COLORS[status] || ['#8C8070','#F4F1EC'];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color, background: bg, padding: '3px 9px', borderRadius: '9px' }}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function fmtDate(ts, full) {
  if (!ts) return '—';
  if (full) return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtFollowers(n) {
  if (n == null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)}k`;
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

function TaskItem({ task, onUpdate }) {
  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status !== 'done' && task.status !== 'cancelled';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid #F4F1EC' }}>
      <button onClick={() => onUpdate(task.id, { status: task.status === 'done' ? 'open' : 'done', completedAt: task.status === 'done' ? null : new Date().toISOString() })}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: task.status === 'done' ? '#1B6B65' : '#C8C0B8', flexShrink: 0, marginTop: '1px' }}>
        <CheckSquare size={16} />
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '13px', fontWeight: '500', color: task.status === 'done' ? '#B5AA99' : '#1C1A16', margin: 0, textDecoration: task.status === 'done' ? 'line-through' : 'none' }}>
          {task.title}
        </p>
        {task.description && (
          <p style={{ fontSize: '11.5px', color: '#8C8070', margin: '2px 0 0' }}>{task.description}</p>
        )}
        <p style={{ fontSize: '11px', color: isOverdue ? '#C0392B' : '#B5AA99', margin: '3px 0 0', fontWeight: isOverdue ? '600' : '400' }}>
          {isOverdue ? 'OVERDUE — ' : ''}{task.dueAt ? fmtDate(task.dueAt) : 'No due date'}
        </p>
      </div>
    </div>
  );
}

function ActivityItem({ item }) {
  const icons = { status_change: Activity, note: MessageSquare, message_prepared: MessageSquare, message_sent: ExternalLink, task_created: CheckSquare, task_completed: CheckCircle, system: Activity };
  const Icon = icons[item.type] || Activity;
  const colors = { status_change: '#C9A96E', note: '#1B6B65', message_sent: '#1B6B65', message_prepared: '#8C8070', system: '#B5AA99', task_created: '#8C8070', task_completed: '#1B6B65' };
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F4F1EC' }}>
      <div style={{ flexShrink: 0, width: '24px', height: '24px', borderRadius: '50%', background: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
        <Icon size={11} color={colors[item.type] || '#8C8070'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '12.5px', color: '#1C1A16', margin: 0 }}>{item.body}</p>
        {item.type === 'status_change' && item.metadata?.from && (
          <p style={{ fontSize: '11px', color: '#8C8070', margin: '2px 0 0' }}>
            {item.metadata.from} → {item.metadata.to}
          </p>
        )}
        <p style={{ fontSize: '11px', color: '#B5AA99', margin: '2px 0 0' }}>
          {fmtDate(item.createdAt, true)}
        </p>
      </div>
    </div>
  );
}

function AvatarModal({ src, onClose }) {
  if (!src) return null;
  return (
    <div onClick={onClose}
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.88)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' }}>
      <img src={src} alt="" onClick={e => e.stopPropagation()}
        style={{ maxWidth: '80vw', maxHeight: '80vh', borderRadius: '10px', objectFit: 'contain', boxShadow: '0 8px 40px rgba(0,0,0,0.5)', cursor: 'default' }} />
      <button onClick={onClose}
        style={{ position: 'absolute', top: '20px', right: '24px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '36px', height: '36px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <X size={18} />
      </button>
    </div>
  );
}

export default function CreatorLeadDetailPage() {
  const { id }       = useParams();
  const { getToken } = useAuth();
  const navigate     = useNavigate();

  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [saving, setSaving]     = useState(false);

  const [newStatus, setNewStatus]         = useState('');
  const [statusNote, setStatusNote]       = useState('');
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [showEdit, setShowEdit]                 = useState(false);

  const [noteText, setNoteText]   = useState('');
  const [addingNote, setAddingNote] = useState(false);

  const [taskTitle, setTaskTitle]   = useState('');
  const [taskDueAt, setTaskDueAt]   = useState('');
  const [addingTask, setAddingTask] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  const [templates, setTemplates]               = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [messageBody, setMessageBody]           = useState('');
  const [generatingMsg, setGeneratingMsg]       = useState(false);
  const [savingMsg, setSavingMsg]               = useState(false);
  const [copiedMsgId, setCopiedMsgId]           = useState(null);

  const [refreshingIg, setRefreshingIg]     = useState(false);
  const [igRefreshError, setIgRefreshError] = useState(null);
  const [igTokenExpired, setIgTokenExpired] = useState(false);
  const [igProfileError, setIgProfileError] = useState(false);
  const [igReconnectSlug, setIgReconnectSlug] = useState(null);
  const [reconnecting, setReconnecting]     = useState(false);
  const [debuggingMeta, setDebuggingMeta]   = useState(false);
  const [metaDebugResult, setMetaDebugResult] = useState(null);
  const [avatarModal, setAvatarModal] = useState(null);
  const [toast, setToast] = useState(null);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [leadData, tmplData] = await Promise.all([
        crmCall(getToken, 'leads.get', { id }),
        crmCall(getToken, 'messages.listTemplates'),
      ]);
      setData(leadData);
      setTemplates(tmplData.templates ?? []);
      setNewStatus(leadData.lead?.status || '');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id, getToken]);

  useEffect(() => { load(); }, [load]);

  async function handleChangeStatus() {
    if (!newStatus) return;
    setSaving(true);
    try {
      await crmCall(getToken, 'leads.changeStatus', { id, status: newStatus, note: statusNote });
      setShowStatusChange(false);
      setStatusNote('');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSaving(false); }
  }

  async function handleAddNote(e) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await crmCall(getToken, 'leads.addNote', { id, content: noteText.trim() });
      setNoteText('');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setAddingNote(false); }
  }

  async function handleAddTask(e) {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setAddingTask(true);
    try {
      await crmCall(getToken, 'leads.createTask', { id, title: taskTitle.trim(), dueAt: taskDueAt || null });
      setTaskTitle(''); setTaskDueAt(''); setShowAddTask(false);
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setAddingTask(false); }
  }

  async function handleUpdateTask(taskId, updates) {
    try {
      await crmCall(getToken, 'leads.updateTask', { id, taskId, ...updates });
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function handleGenerateMessage() {
    setGeneratingMsg(true);
    try {
      const result = await crmCall(getToken, 'messages.generateForLead', { id, templateId: selectedTemplate || undefined });
      setMessageBody(result.personalizedBody || '');
    } catch (e) { showToast(e.message, 'error'); }
    finally { setGeneratingMsg(false); }
  }

  async function handleSaveMessage() {
    if (!messageBody.trim()) return;
    setSavingMsg(true);
    try {
      await crmCall(getToken, 'messages.saveForLead', {
        id,
        templateId: selectedTemplate || null,
        personalizedBody: messageBody.trim(),
        channel: data?.lead?.platform || 'instagram',
      });
      setMessageBody('');
      showToast('Message saved as draft');
      load();
    } catch (e) { showToast(e.message, 'error'); }
    finally { setSavingMsg(false); }
  }

  async function handleCopyMessage(msg) {
    await navigator.clipboard.writeText(msg.body).catch(() => {});
    setCopiedMsgId(msg.id);
    setTimeout(() => setCopiedMsgId(null), 2500);
    try {
      await crmCall(getToken, 'messages.markCopied', { msgId: msg.id });
      load();
    } catch {}
  }

  async function handleMarkSent(msg) {
    try {
      await crmCall(getToken, 'messages.markSent', { msgId: msg.id });
      showToast('Marked as sent');
      load();
    } catch (e) { showToast(e.message, 'error'); }
  }

  async function handleRefreshInstagram() {
    setRefreshingIg(true);
    setIgRefreshError(null);
    setIgProfileError(false);
    setIgTokenExpired(false);
    try {
      const result = await crmCall(getToken, 'leads.refreshInstagram', { id });
      if (result.configError) {
        setIgRefreshError('Instagram enrichment is not configured on this server. Admin must set META_PAGE_ACCESS_TOKEN and META_INSTAGRAM_ACCOUNT_ID in Vercel, then redeploy.');
        return;
      }
      if (result.isTokenExpired || result.isServerTokenExpired) {
        setIgTokenExpired(true);
        setIgProfileError(false);
        setIgReconnectSlug(null);
        setIgRefreshError(null);
        return;
      }
      if (result.isProfileError) {
        setIgProfileError(true);
        setIgTokenExpired(false);
        setIgRefreshError(null);
        return;
      }
      if (!result.refreshed) {
        setIgRefreshError(result.error || 'Instagram refresh failed');
        return;
      }
      setIgTokenExpired(false);
      setIgProfileError(false);
      load();
    } catch (e) {
      setIgRefreshError(e.message);
    } finally {
      setRefreshingIg(false);
    }
  }

  async function handleReconnectMeta() {
    setReconnecting(true);
    try {
      const token = await getToken();
      const res   = await fetch('/api/instagram?action=my-auth-url', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else if (igReconnectSlug) {
        navigate(`/admin/creators/${igReconnectSlug}`);
      } else {
        navigate('/admin/creators');
      }
    } catch {
      // fallback: send them to creator settings list
      if (igReconnectSlug) navigate(`/admin/creators/${igReconnectSlug}`);
      else navigate('/admin/creators');
    } finally {
      setReconnecting(false);
    }
  }

  async function handleDebugMeta() {
    setDebuggingMeta(true);
    setMetaDebugResult(null);
    try {
      const result = await crmCall(getToken, 'debug.metaDiscovery', { username: data?.lead?.username || 'travelstoriesfrommyworld' });
      setMetaDebugResult(result);
    } catch (e) {
      setMetaDebugResult({ ok: false, error: e.message });
    } finally {
      setDebuggingMeta(false);
    }
  }

  if (loading) return <div style={{ ...S.page, color: '#8C8070' }}>Loading lead…</div>;
  if (error) return (
    <div style={S.page}>
      <button onClick={() => navigate('/admin/creator-acquisition/crm')} style={{ ...S.btnSecondary, marginBottom: '16px', fontSize: '12px' }}>
        <ArrowLeft size={12} /> Back
      </button>
      <p style={{ color: '#C0392B', marginBottom: '12px' }}>Error: {error}</p>
      <button onClick={load} style={{ ...S.btnSecondary, fontSize: '12.5px' }}>
        <RefreshCw size={13} /> Retry
      </button>
    </div>
  );
  if (!data?.lead) return (
    <div style={S.page}>
      <button onClick={() => navigate('/admin/creator-acquisition/crm')} style={{ ...S.btnSecondary, marginBottom: '16px', fontSize: '12px' }}>
        <ArrowLeft size={12} /> Back
      </button>
      <p style={{ color: '#8C8070' }}>Lead not found.</p>
    </div>
  );

  const { lead, messages = [], activities = [], tasks = [] } = data;
  const instagramUrl = lead.profileUrl || (lead.platform === 'instagram' ? `https://instagram.com/${lead.username}` : null);
  const pendingTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled');
  const doneTasks    = tasks.filter(t => t.status === 'done');

  // Derive last Instagram refresh timestamp from aiAnalysis
  const aiAnalysis = (typeof lead.aiAnalysis === 'object' && lead.aiAnalysis) ? lead.aiAnalysis : {};
  const lastRefreshedAt = aiAnalysis.lastInstagramRefresh?.refreshedAt || null;
  const isIgVerified = aiAnalysis.lastInstagramRefresh?.source === 'meta_business_discovery'
    || aiAnalysis.metaBusinessDiscovery != null;

  // Instagram Messaging API eligibility:
  // Requires an existing conversation (thread/recipient id from an inbound message or opt-in),
  // an open messaging window, and valid API token. Cold DM to any username is not allowed.
  const igMeta         = aiAnalysis; // eligibility stored inside aiAnalysis
  const hasThreadId    = !!(lead.externalThreadId || igMeta.instagramThreadId || igMeta.instagramRecipientId);
  const windowExpiry   = igMeta.messagingWindowExpiresAt ? new Date(igMeta.messagingWindowExpiresAt) : null;
  const windowOpen     = windowExpiry && windowExpiry > new Date();
  const isMessagingEligible = lead.platform === 'instagram'
    && hasThreadId
    && (igMeta.instagramMessagingEligible === true)
    && windowOpen;

  return (
    <div style={S.page}>
      <AvatarModal src={avatarModal} onClose={() => setAvatarModal(null)} />

      {showEdit && (
        <EditLeadModal
          lead={lead}
          getToken={getToken}
          onClose={() => setShowEdit(false)}
          onSaved={updated => {
            setData(d => ({ ...d, lead: { ...d.lead, ...updated } }));
            setShowEdit(false);
          }}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 9000, padding: '12px 18px', borderRadius: '8px', background: toast.type === 'error' ? '#C0392B' : '#1B6B65', color: 'white', fontSize: '13px', fontWeight: '500', boxShadow: '0 4px 16px rgba(0,0,0,0.18)', maxWidth: '360px' }}>
          {toast.msg}
        </div>
      )}

      <button onClick={() => navigate('/admin/creator-acquisition/crm')}
        style={{ ...S.btnSecondary, marginBottom: '18px', fontSize: '12px' }}>
        <ArrowLeft size={12} /> Back to CRM
      </button>

      {/* Header card */}
      <div style={S.card}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div
            onClick={() => lead.avatarUrl && setAvatarModal(lead.avatarUrl)}
            style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC', cursor: lead.avatarUrl ? 'zoom-in' : 'default', position: 'relative' }}>
            {lead.avatarUrl
              ? <img src={lead.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={24} color="#C8C0B8" /></div>
            }
            {lead.avatarUrl && (
              <div style={{ position: 'absolute', bottom: '2px', right: '2px', background: 'rgba(0,0,0,0.45)', borderRadius: '50%', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Camera size={9} color="white" />
              </div>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>
                {lead.displayName || lead.username}
              </h1>
              <StatusChip status={lead.status} />
              {lead.score != null && (
                <span style={{ fontSize: '13px', fontWeight: '700', color: lead.score >= 8 ? '#1B6B65' : lead.score >= 5 ? '#C9A96E' : '#C0392B' }}>
                  Score: {Number(lead.score).toFixed(1)}
                </span>
              )}
            </div>
            <p style={{ fontSize: '13px', color: '#8C8070', margin: '4px 0 0', fontFamily: 'monospace' }}>
              @{lead.username} · {lead.platform}
              {lead.country && ` · ${lead.country}`}
              {lead.language && ` · ${lead.language}`}
            </p>
            <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
              {lead.followersCount != null && (
                <span style={{ fontSize: '12px', color: '#4A433A' }}><strong>{fmtFollowers(lead.followersCount)}</strong> followers</span>
              )}
              {lead.postsCount != null && (
                <span style={{ fontSize: '12px', color: '#4A433A' }}><strong>{lead.postsCount}</strong> posts</span>
              )}
              {lead.engagementRate != null && (
                <span style={{ fontSize: '12px', color: '#4A433A' }}><strong>{Number(lead.engagementRate).toFixed(1)}%</strong> engagement</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.btnSecondary, textDecoration: 'none', color: '#E1306C', borderColor: '#F5C6C0' }}>
                <Instagram size={13} /> Open IG
              </a>
            )}
            <button onClick={() => setShowEdit(true)} style={S.btnSecondary}>
              <Pencil size={13} /> Edit Lead
            </button>
            <button onClick={() => setShowStatusChange(v => !v)} style={S.btnSecondary}>
              <Edit2 size={13} /> Change Status
            </button>
            <button onClick={() => { setActiveTab('tasks'); setShowAddTask(true); }} style={S.btnSecondary}>
              <Clock size={13} /> Add Task
            </button>
          </div>
        </div>

        {showStatusChange && (
          <div style={{ marginTop: '16px', padding: '14px', background: '#F8F6F2', borderRadius: '8px', border: '1px solid #E8E3DA' }}>
            <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#4A433A', marginBottom: '8px' }}>Change Status</p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 180px' }}>
                <select value={newStatus} onChange={e => setNewStatus(e.target.value)} style={S.select}>
                  {PIPELINE_STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <input value={statusNote} onChange={e => setStatusNote(e.target.value)} placeholder="Optional note…" style={S.input} />
              </div>
              <button onClick={handleChangeStatus} disabled={saving || newStatus === lead.status} style={{ ...S.btnPrimary, opacity: newStatus === lead.status ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              <button onClick={() => setShowStatusChange(false)} style={S.btnSecondary}><X size={12} /></button>
            </div>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E8E3DA', marginBottom: '-1px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
        {[
          { key: 'overview',  label: 'Overview',               icon: Users },
          { key: 'messages',  label: `Messages (${messages.length})`, icon: MessageSquare },
          { key: 'tasks',     label: `Tasks (${pendingTasks.length})`, icon: CheckSquare },
          { key: 'activity',  label: 'Activity',               icon: Activity },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key)} style={S.tab(activeTab === key)}>
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      <div style={{ ...S.card, borderRadius: '0 10px 10px 10px' }}>

        {/* ── Overview ── */}
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '28px' }}>

            {/* Left: Profile + CRM fields */}
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '14px' }}>Profile Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {[
                  ['Category', lead.category],
                  ['Country', lead.country],
                  ['Language', lead.language],
                  ['Email', lead.email],
                  ['Website', lead.websiteUrl],
                  ['Priority', lead.priority != null ? ({ 0: 'Low', 1: 'Medium', 2: 'High' }[lead.priority] ?? String(lead.priority)) : null],
                  ['Last Contacted', fmtDate(lead.lastContactedAt)],
                  ['Next Follow-up', fmtDate(lead.nextFollowUpAt)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span style={S.label}>{k}</span>
                    <span style={{ ...S.value, color: v && v !== '—' ? '#1C1A16' : '#C8C0B8' }}>{v || '—'}</span>
                  </div>
                ))}
              </div>
              {lead.bio && (
                <div style={{ marginTop: '14px' }}>
                  <span style={S.label}>Bio</span>
                  <p style={{ ...S.value, lineHeight: '1.5', margin: 0 }}>{lead.bio}</p>
                </div>
              )}
              {lead.fitSummary && (
                <div style={{ marginTop: '14px' }}>
                  <span style={S.label}>Fit Summary</span>
                  <p style={{ ...S.value, lineHeight: '1.5', margin: 0 }}>{lead.fitSummary}</p>
                </div>
              )}
              {(Array.isArray(lead.destinations) ? lead.destinations : []).length > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <span style={S.label}>Destinations</span>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {lead.destinations.map(d => (
                      <span key={d} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9px', background: '#EFF6F5', color: '#1B6B65', fontWeight: '500' }}>{d}</span>
                    ))}
                  </div>
                </div>
              )}
              {(Array.isArray(lead.niches) ? lead.niches : []).length > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <span style={S.label}>Niches</span>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {lead.niches.map(n => (
                      <span key={n} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9px', background: '#FBF8F1', color: '#C9A96E', fontWeight: '500' }}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
              {(Array.isArray(lead.routeIdeas) ? lead.routeIdeas : []).length > 0 && (
                <div style={{ marginTop: '14px' }}>
                  <span style={S.label}>Route Ideas</span>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                    {lead.routeIdeas.map((idea, i) => (
                      <li key={i} style={{ fontSize: '12.5px', color: '#4A433A', marginBottom: '2px' }}>{idea}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Right: Instagram verification block */}
            <div>
              <div style={{ border: '1px solid #E8E3DA', borderRadius: '10px', padding: '16px 18px', background: '#FAFAF8' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: (igTokenExpired || igProfileError) ? '10px' : '14px' }}>
                  <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Instagram size={13} color="#E1306C" /> Instagram
                    {isIgVerified && !igTokenExpired && !igProfileError && (
                      <span style={{ fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color: '#1B6B65', background: '#EFF6F5', padding: '2px 6px', borderRadius: '8px' }}>Verified</span>
                    )}
                    {igTokenExpired && (
                      <span style={{ fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color: '#C0392B', background: '#FDECEA', padding: '2px 6px', borderRadius: '8px' }}>OAuth Error</span>
                    )}
                    {igProfileError && (
                      <span style={{ fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color: '#7A5C1E', background: '#FBF8F1', padding: '2px 6px', borderRadius: '8px' }}>Not Eligible</span>
                    )}
                  </h3>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={handleRefreshInstagram} disabled={refreshingIg}
                      title="Re-fetch latest data from Instagram via Meta API"
                      style={{ ...S.btnSecondary, fontSize: '11.5px', padding: '5px 10px', color: refreshingIg ? '#B5AA99' : '#1B6B65' }}>
                      <RefreshCw size={11} style={{ animation: refreshingIg ? 'spin 1s linear infinite' : 'none' }} />
                      {refreshingIg ? 'Refreshing…' : (igTokenExpired || igProfileError) ? 'Retry' : 'Refresh'}
                    </button>
                    {instagramUrl && (
                      <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
                        style={{ ...S.btnSecondary, textDecoration: 'none', fontSize: '11.5px', padding: '5px 10px', color: '#E1306C', borderColor: '#F5C6C0' }}>
                        <ExternalLink size={11} /> Open
                      </a>
                    )}
                  </div>
                </div>

                {igTokenExpired && (
                  <div style={{ background: '#FBF8F1', border: '1px solid #E8D9B8', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px' }}>
                    <p style={{ margin: 0, fontSize: '12.5px', fontWeight: '600', color: '#7A5C1E' }}>Meta OAuth error (code 190)</p>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#7A5C1E', lineHeight: '1.5' }}>
                      The server token may be expired, OR this specific account is not accessible via Business Discovery.
                      If other accounts enrich successfully, the token is fine — this profile may be private or not a Business/Creator account.
                      If all enrichments fail, check{' '}
                      <code style={{ background: '#F4EDD8', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>META_PAGE_ACCESS_TOKEN</code>{' '}
                      and{' '}
                      <code style={{ background: '#F4EDD8', padding: '1px 4px', borderRadius: '3px', fontSize: '11px' }}>META_INSTAGRAM_ACCOUNT_ID</code>{' '}
                      in Vercel, then redeploy. Lead data and manual edits are safe. Use the <strong>Retry</strong> button above to try again.
                    </p>
                    <div style={{ marginTop: '8px' }}>
                      <button onClick={() => { setIgTokenExpired(false); setIgRefreshError(null); }}
                        style={{ padding: '5px 12px', borderRadius: '5px', border: '1px solid #E8D9B8', cursor: 'pointer', fontSize: '12px', background: 'white', color: '#7A5C1E' }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {igProfileError && (
                  <div style={{ background: '#FBF8F1', border: '1px solid #DDD0BC', borderRadius: '6px', padding: '10px 12px', marginBottom: '12px' }}>
                    <p style={{ margin: 0, fontSize: '12.5px', fontWeight: '600', color: '#6B5B3E' }}>Profile not available for enrichment</p>
                    <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6B5B3E', lineHeight: '1.5' }}>
                      The account may not be a Business or Creator account, may be private, or may not be accessible via Meta Business Discovery. Lead data and manual edits are safe. Use <strong>Retry</strong> above to try again.
                    </p>
                    <div style={{ marginTop: '8px' }}>
                      <button onClick={() => setIgProfileError(false)}
                        style={{ padding: '5px 12px', borderRadius: '5px', border: '1px solid #DDD0BC', cursor: 'pointer', fontSize: '12px', background: 'white', color: '#6B5B3E' }}>
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {igRefreshError && (
                  <div style={{ background: '#FDECEA', border: '1px solid #F5C6C0', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px', fontSize: '12px', color: '#C0392B' }}>
                    {igRefreshError}
                    <button onClick={() => setIgRefreshError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer', color: '#C0392B', padding: 0 }}>
                      <X size={12} />
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div
                    onClick={() => lead.avatarUrl && setAvatarModal(lead.avatarUrl)}
                    style={{ width: '56px', height: '56px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC', cursor: lead.avatarUrl ? 'zoom-in' : 'default', border: '2px solid #E8E3DA', position: 'relative' }}>
                    {lead.avatarUrl
                      ? <img src={lead.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
                      : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={20} color="#C8C0B8" /></div>
                    }
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '13.5px', fontWeight: '600', color: '#1C1A16', margin: '0 0 2px' }}>
                      {lead.displayName || '—'}
                    </p>
                    <p style={{ fontSize: '12px', color: '#8C8070', margin: '0 0 8px', fontFamily: 'monospace' }}>@{lead.username}</p>
                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ ...S.label, marginBottom: '1px' }}>Followers</span>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: lead.followersCount != null ? '#1C1A16' : '#C8C0B8' }}>
                          {fmtFollowers(lead.followersCount)}
                        </span>
                      </div>
                      <div>
                        <span style={{ ...S.label, marginBottom: '1px' }}>Posts</span>
                        <span style={{ fontSize: '15px', fontWeight: '700', color: lead.postsCount != null ? '#1C1A16' : '#C8C0B8' }}>
                          {lead.postsCount ?? '—'}
                        </span>
                      </div>
                      {lead.engagementRate != null && (
                        <div>
                          <span style={{ ...S.label, marginBottom: '1px' }}>Engagement</span>
                          <span style={{ fontSize: '15px', fontWeight: '700', color: '#1C1A16' }}>
                            {Number(lead.engagementRate).toFixed(1)}%
                          </span>
                        </div>
                      )}
                    </div>
                    {lead.websiteUrl && (
                      <a href={lead.websiteUrl} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '12px', color: '#1B6B65', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '6px', wordBreak: 'break-all', textDecoration: 'none' }}>
                        <ExternalLink size={10} /> {lead.websiteUrl}
                      </a>
                    )}
                  </div>
                </div>

                {lastRefreshedAt && (
                  <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '12px', marginBottom: 0 }}>
                    Last Instagram refresh: {fmtDate(lastRefreshedAt, true)}
                  </p>
                )}

                <div style={{ marginTop: '12px', borderTop: '1px solid #F4F1EC', paddingTop: '10px' }}>
                  <button onClick={handleDebugMeta} disabled={debuggingMeta}
                    style={{ ...S.btnSecondary, fontSize: '11px', padding: '4px 10px', color: '#8C8070' }}>
                    <RefreshCw size={10} style={{ animation: debuggingMeta ? 'spin 1s linear infinite' : 'none' }} />
                    {debuggingMeta ? 'Testing Meta connection…' : 'Debug Meta connection'}
                  </button>
                  {metaDebugResult && (
                    <div style={{ marginTop: '8px', background: '#F8F6F2', border: `1px solid ${metaDebugResult.ok ? '#C0DDD0' : '#E8D9B8'}`, borderRadius: '6px', padding: '10px 12px', fontSize: '11.5px' }}>
                      <p style={{ margin: '0 0 8px', fontWeight: '700', color: metaDebugResult.ok ? '#2E8B57' : '#7A5C1E' }}>
                        {metaDebugResult.ok ? '✓ Meta connection OK — both tests passed' : '✗ Meta connection issue detected'}
                      </p>

                      {/* Config row */}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontFamily: 'monospace', fontSize: '11px', color: '#4A433A', marginBottom: '8px' }}>
                        <div>Env: <strong>{metaDebugResult.runtimeEnv || '—'}</strong></div>
                        <div>API: <strong>{metaDebugResult.graphApiVersion || '—'}</strong></div>
                        <div>Account ID: <strong style={{ color: metaDebugResult.accountIdPresent ? '#1C1A16' : '#C0392B' }}>{metaDebugResult.maskedAccountId || '(not set)'}</strong> <span style={{ color: '#8C8070' }}>({metaDebugResult.accountIdLength} chars)</span></div>
                        <div>Token source: <strong style={{ color: metaDebugResult.tokenPresent ? '#1C1A16' : '#C0392B' }}>{metaDebugResult.tokenSource || '(none)'}</strong></div>
                        <div>Token prefix: <strong>{metaDebugResult.tokenPrefix || '—'}</strong></div>
                        <div>Target: <strong>@{metaDebugResult.targetUsername || '—'}</strong></div>
                      </div>

                      {/* Test A */}
                      <div style={{ marginBottom: '6px', padding: '6px 8px', borderRadius: '4px', background: metaDebugResult.baseAccountTestStatus === 'pass' ? '#EFF6F5' : metaDebugResult.baseAccountTestStatus === 'fail' ? '#FDECEA' : '#F4F1EC' }}>
                        <div style={{ fontWeight: '600', color: metaDebugResult.baseAccountTestStatus === 'pass' ? '#2E8B57' : metaDebugResult.baseAccountTestStatus === 'fail' ? '#C0392B' : '#8C8070' }}>
                          Test A — Base account: {metaDebugResult.baseAccountTestStatus}
                        </div>
                        {metaDebugResult.baseAccountRequestPath && (
                          <div style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#8C8070', marginTop: '2px', wordBreak: 'break-all' }}>GET {metaDebugResult.baseAccountRequestPath}</div>
                        )}
                        {metaDebugResult.baseAccountTestResponse && (
                          <div style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#4A433A', marginTop: '3px' }}>
                            id: {metaDebugResult.baseAccountTestResponse.id} · @{metaDebugResult.baseAccountTestResponse.username} · {metaDebugResult.baseAccountTestResponse.followers_count?.toLocaleString()} followers · {metaDebugResult.baseAccountTestResponse.media_count} posts
                          </div>
                        )}
                        {metaDebugResult.baseAccountTestError && (
                          <div style={{ color: '#C0392B', fontSize: '10.5px', marginTop: '2px' }}>
                            code {metaDebugResult.baseAccountTestError.code}{metaDebugResult.baseAccountTestError.subcode ? `/${metaDebugResult.baseAccountTestError.subcode}` : ''}: {metaDebugResult.baseAccountTestError.message}
                          </div>
                        )}
                      </div>

                      {/* Test B */}
                      <div style={{ marginBottom: '8px', padding: '6px 8px', borderRadius: '4px', background: metaDebugResult.businessDiscoveryTestStatus === 'pass' ? '#EFF6F5' : metaDebugResult.businessDiscoveryTestStatus === 'fail' ? '#FDECEA' : '#F4F1EC' }}>
                        <div style={{ fontWeight: '600', color: metaDebugResult.businessDiscoveryTestStatus === 'pass' ? '#2E8B57' : metaDebugResult.businessDiscoveryTestStatus === 'fail' ? '#C0392B' : '#8C8070' }}>
                          Test B — Business Discovery: {metaDebugResult.businessDiscoveryTestStatus}
                        </div>
                        {metaDebugResult.businessDiscoveryRequestPath && (
                          <div style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#8C8070', marginTop: '2px', wordBreak: 'break-all' }}>GET {metaDebugResult.businessDiscoveryRequestPath}</div>
                        )}
                        {metaDebugResult.businessDiscoveryResponse && (
                          <div style={{ fontFamily: 'monospace', fontSize: '10.5px', color: '#4A433A', marginTop: '3px' }}>
                            @{metaDebugResult.businessDiscoveryResponse.username} · {metaDebugResult.businessDiscoveryResponse.followers_count?.toLocaleString()} followers · {metaDebugResult.businessDiscoveryResponse.media_count} posts{metaDebugResult.businessDiscoveryResponse.website ? ` · ${metaDebugResult.businessDiscoveryResponse.website}` : ''}
                          </div>
                        )}
                        {metaDebugResult.businessDiscoveryError && (
                          <div style={{ color: '#C0392B', fontSize: '10.5px', marginTop: '2px' }}>
                            code {metaDebugResult.businessDiscoveryError.code}{metaDebugResult.businessDiscoveryError.subcode ? `/${metaDebugResult.businessDiscoveryError.subcode}` : ''}: {metaDebugResult.businessDiscoveryError.message}
                          </div>
                        )}
                      </div>

                      {/* Diagnosis */}
                      {metaDebugResult.diagnosis && (
                        <div style={{ fontSize: '11px', color: metaDebugResult.ok ? '#2E8B57' : '#7A5C1E', fontStyle: 'italic', marginBottom: '6px' }}>
                          {metaDebugResult.diagnosis}
                        </div>
                      )}

                      <button onClick={() => setMetaDebugResult(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', color: '#8C8070', padding: 0 }}>
                        Dismiss
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Messages ── */}
        {activeTab === 'messages' && (
          <div>
            {/* Messaging eligibility notice */}
            {!isMessagingEligible && (
              <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '10px 14px', background: '#F8F6F2', border: '1px solid #E8E3DA', borderRadius: '8px', marginBottom: '16px' }}>
                <Instagram size={14} color="#8C8070" style={{ flexShrink: 0, marginTop: '1px' }} />
                <div>
                  <p style={{ margin: 0, fontSize: '12.5px', fontWeight: '600', color: '#4A433A' }}>Direct Instagram sending not available for this profile yet.</p>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#8C8070' }}>
                    Copy the message and send it manually from <strong>@hiddenatlas.travel</strong>. Direct API sending requires an existing Instagram conversation initiated by the creator.
                  </p>
                </div>
              </div>
            )}

            {/* Compose area */}
            <div style={{ marginBottom: '20px', padding: '16px', background: '#F8F6F2', borderRadius: '8px', border: '1px solid #E8E3DA' }}>
              <h4 style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '12px' }}>Prepare Message</h4>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 200px' }}>
                  <label style={S.label}>Template</label>
                  <select value={selectedTemplate} onChange={e => setSelectedTemplate(e.target.value)} style={S.select}>
                    <option value="">Auto-select by platform</option>
                    {templates.map(t => <option key={t.id} value={t.id}>{t.name} ({t.language})</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                  <button onClick={handleGenerateMessage} disabled={generatingMsg} style={S.btnSecondary}>
                    {generatingMsg ? 'Generating…' : 'Generate Message'}
                  </button>
                </div>
              </div>
              <textarea
                value={messageBody}
                onChange={e => setMessageBody(e.target.value)}
                rows={5}
                placeholder="Message will appear here after generating, or type manually…"
                style={S.textarea}
              />
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '10px' }}>
                <button onClick={handleSaveMessage} disabled={!messageBody.trim() || savingMsg} style={{ ...S.btnPrimary, opacity: !messageBody.trim() ? 0.5 : 1 }}>
                  {savingMsg ? 'Saving…' : 'Save as Draft'}
                </button>
              </div>
            </div>

            {messages.length === 0 && (
              <p style={{ textAlign: 'center', color: '#B5AA99', padding: '24px' }}>No messages yet</p>
            )}
            {messages.map(msg => {
              const msgEligible = isMessagingEligible && msg.status !== 'sent_manual';
              return (
                <div key={msg.id} style={{ padding: '14px', border: '1px solid #E8E3DA', borderRadius: '8px', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                    <div>
                      {msg.template_name && (
                        <span style={{ fontSize: '11px', color: '#8C8070', display: 'block', marginBottom: '2px' }}>Template: {msg.template_name}</span>
                      )}
                      <span style={{
                        fontSize: '10.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase',
                        color: msg.status === 'sent_manual' ? '#1B6B65' : msg.status === 'sent' ? '#1B6B65' : msg.status === 'copied' ? '#C9A96E' : '#8C8070',
                        background: msg.status === 'sent_manual' || msg.status === 'sent' ? '#EFF6F5' : msg.status === 'copied' ? '#FBF8F1' : '#F4F1EC',
                        padding: '2px 7px', borderRadius: '9px',
                      }}>
                        {msg.status === 'sent_manual' ? 'sent manually' : (msg.status ?? '').replace(/_/g, ' ')}
                      </span>
                      {msg.channel && msg.channel !== 'instagram' && (
                        <span style={{ fontSize: '10.5px', color: '#B5AA99', marginLeft: '6px' }}>{msg.channel}</span>
                      )}
                      {msg.copiedAt && <span style={{ fontSize: '11px', color: '#B5AA99', marginLeft: '8px' }}>Copied {fmtDate(msg.copiedAt)}</span>}
                      {msg.sentAt && <span style={{ fontSize: '11px', color: '#B5AA99', marginLeft: '8px' }}>Sent {fmtDate(msg.sentAt)}</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap' }}>
                      {/* Send via Instagram API — only when messaging-eligible (no active conversation = never shows) */}
                      {msgEligible && (
                        <button
                          onClick={() => {
                            if (window.confirm('This will send from @hiddenatlas.travel via Instagram. Continue?')) {
                              showToast('Instagram API sending not yet implemented', 'error');
                            }
                          }}
                          style={{ ...S.btnPrimary, padding: '5px 12px', fontSize: '12px', background: '#E1306C', borderColor: '#E1306C' }}>
                          <Instagram size={12} /> Send via Instagram
                        </button>
                      )}
                      {/* Manual flow — always visible */}
                      <button onClick={() => handleCopyMessage(msg)}
                        style={{ ...S.btnPrimary, padding: '5px 12px', fontSize: '12px', background: copiedMsgId === msg.id ? '#2E8B57' : '#1B6B65' }}>
                        {copiedMsgId === msg.id ? <CheckCircle size={12} /> : <Copy size={12} />}
                        {copiedMsgId === msg.id ? 'Copied!' : 'Copy for IG DM'}
                      </button>
                      {instagramUrl && (
                        <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
                          style={{ ...S.btnSecondary, textDecoration: 'none', color: '#E1306C', borderColor: '#F5C6C0', padding: '5px 10px', fontSize: '12px' }}>
                          <Instagram size={12} /> Open Instagram
                        </a>
                      )}
                      {msg.status !== 'sent_manual' && msg.status !== 'sent' && (
                        <button onClick={() => handleMarkSent(msg)} style={{ ...S.btnSecondary, fontSize: '11.5px', padding: '5px 10px' }}>
                          <CheckCircle size={11} /> Mark Sent
                        </button>
                      )}
                    </div>
                  </div>
                  <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '13px', color: '#1C1A16', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.body}
                  </pre>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Tasks ── */}
        {activeTab === 'tasks' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>Tasks & Follow-ups</h3>
              <button onClick={() => setShowAddTask(v => !v)} style={S.btnPrimary}>
                <PlusCircle size={13} /> Add Task
              </button>
            </div>
            {showAddTask && (
              <form onSubmit={handleAddTask} style={{ padding: '14px', background: '#F8F6F2', borderRadius: '8px', border: '1px solid #E8E3DA', marginBottom: '14px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title *" style={{ ...S.input, flex: '1 1 200px' }} />
                  <input type="date" value={taskDueAt} onChange={e => setTaskDueAt(e.target.value)} style={{ ...S.input, width: '160px' }} />
                  <button type="submit" disabled={!taskTitle.trim() || addingTask} style={S.btnPrimary}>
                    {addingTask ? 'Saving…' : 'Add'}
                  </button>
                  <button type="button" onClick={() => setShowAddTask(false)} style={S.btnSecondary}><X size={12} /></button>
                </div>
              </form>
            )}
            {pendingTasks.length === 0 && doneTasks.length === 0 && (
              <p style={{ textAlign: 'center', color: '#B5AA99', padding: '24px' }}>No tasks yet</p>
            )}
            {pendingTasks.map(t => <TaskItem key={t.id} task={t} onUpdate={handleUpdateTask} />)}
            {doneTasks.length > 0 && (
              <>
                <p style={{ fontSize: '11.5px', color: '#B5AA99', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.4px', margin: '14px 0 6px' }}>Done</p>
                {doneTasks.map(t => <TaskItem key={t.id} task={t} onUpdate={handleUpdateTask} />)}
              </>
            )}
          </div>
        )}

        {/* ── Activity ── */}
        {activeTab === 'activity' && (
          <div>
            <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '14px' }}>Activity & Notes</h3>
            <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder="Add a note…"
                style={{ ...S.input, flex: 1 }}
              />
              <button type="submit" disabled={!noteText.trim() || addingNote} style={{ ...S.btnPrimary, opacity: !noteText.trim() ? 0.5 : 1 }}>
                {addingNote ? 'Adding…' : 'Add Note'}
              </button>
            </form>
            {activities.length === 0 && (
              <p style={{ textAlign: 'center', color: '#B5AA99', padding: '24px' }}>No activity yet</p>
            )}
            {activities.map(a => <ActivityItem key={a.id} item={a} />)}
          </div>
        )}
      </div>
    </div>
  );
}
