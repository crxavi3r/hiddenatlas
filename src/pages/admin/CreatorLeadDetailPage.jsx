import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, Instagram, Copy, CheckCircle, Send, Clock, MessageSquare, Activity, CheckSquare, Edit2, X, PlusCircle, Users, RefreshCw } from 'lucide-react';

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
  const isOverdue = task.dueAt && new Date(task.dueAt) < new Date() && task.status === 'pending';
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderBottom: '1px solid #F4F1EC' }}>
      <button onClick={() => onUpdate(task.id, { status: task.status === 'done' ? 'pending' : 'done', completedAt: task.status === 'done' ? null : new Date().toISOString() })}
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
  const icons = { status_change: Activity, note: MessageSquare, message_prepared: MessageSquare, message_sent: Send, task_created: CheckSquare, task_completed: CheckCircle, system: Activity };
  const Icon = icons[item.type] || Activity;
  const colors = { status_change: '#C9A96E', note: '#1B6B65', message_sent: '#1B6B65', message_prepared: '#8C8070', system: '#B5AA99', task_created: '#8C8070', task_completed: '#1B6B65' };
  return (
    <div style={{ display: 'flex', gap: '10px', padding: '8px 0', borderBottom: '1px solid #F4F1EC' }}>
      <div style={{ flexShrink: 0, width: '24px', height: '24px', borderRadius: '50%', background: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
        <Icon size={11} color={colors[item.type] || '#8C8070'} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: '12.5px', color: '#1C1A16', margin: 0 }}>{item.content}</p>
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
    } catch (e) { alert(e.message); }
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
    } catch (e) { alert(e.message); }
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
    } catch (e) { alert(e.message); }
    finally { setAddingTask(false); }
  }

  async function handleUpdateTask(taskId, updates) {
    try {
      await crmCall(getToken, 'leads.updateTask', { id, taskId, ...updates });
      load();
    } catch (e) { alert(e.message); }
  }

  async function handleGenerateMessage() {
    setGeneratingMsg(true);
    try {
      const data = await crmCall(getToken, 'messages.generateForLead', { id, templateId: selectedTemplate || undefined });
      setMessageBody(data.personalizedBody || '');
    } catch (e) { alert(e.message); }
    finally { setGeneratingMsg(false); }
  }

  async function handleSaveMessage() {
    if (!messageBody.trim()) return;
    setSavingMsg(true);
    try {
      await crmCall(getToken, 'messages.saveForLead', { id, templateId: selectedTemplate || null, personalizedBody: messageBody.trim(), platform: data?.lead?.platform || 'instagram' });
      setMessageBody('');
      load();
    } catch (e) { alert(e.message); }
    finally { setSavingMsg(false); }
  }

  async function handleCopyMessage(msg) {
    await navigator.clipboard.writeText(msg.personalizedBody || msg.body).catch(() => {});
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
      load();
    } catch (e) { alert(e.message); }
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
  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const doneTasks    = tasks.filter(t => t.status === 'done');

  return (
    <div style={S.page}>
      <button onClick={() => navigate('/admin/creator-acquisition/crm')}
        style={{ ...S.btnSecondary, marginBottom: '18px', fontSize: '12px' }}>
        <ArrowLeft size={12} /> Back to CRM
      </button>

      <div style={S.card}>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: '64px', height: '64px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, background: '#F4F1EC' }}>
            {lead.avatarUrl
              ? <img src={lead.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Users size={24} color="#C8C0B8" /></div>
            }
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
              {lead.followerCount != null && (
                <span style={{ fontSize: '12px', color: '#4A433A' }}><strong>{fmtFollowers(lead.followerCount)}</strong> followers</span>
              )}
              {lead.engagementRate != null && (
                <span style={{ fontSize: '12px', color: '#4A433A' }}><strong>{Number(lead.engagementRate).toFixed(1)}%</strong> engagement</span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {instagramUrl && (
              <a href={instagramUrl} target="_blank" rel="noopener noreferrer" style={{ ...S.btnSecondary, textDecoration: 'none', color: '#E1306C', borderColor: '#F5C6C0' }}>
                <Instagram size={13} /> Open
              </a>
            )}
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
        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            <div>
              <h3 style={{ fontSize: '13px', fontWeight: '700', color: '#1C1A16', marginBottom: '14px' }}>Profile Information</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {[
                  ['First Name', lead.firstName], ['Email', lead.email],
                  ['Website', lead.website], ['Category', lead.category],
                  ['Country', lead.country], ['Language', lead.language],
                  ['Followers', lead.followerCount != null ? fmtFollowers(lead.followerCount) : null],
                  ['Engagement', lead.engagementRate != null ? `${Number(lead.engagementRate).toFixed(1)}%` : null],
                  ['Priority', lead.priority], ['Assigned To', lead.assignedTo],
                  ['Last Contacted', fmtDate(lead.lastContactedAt)],
                  ['Next Follow-up', fmtDate(lead.nextFollowUpAt)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <span style={S.label}>{k}</span>
                    <span style={{ ...S.value, color: v ? '#1C1A16' : '#C8C0B8' }}>{v || '—'}</span>
                  </div>
                ))}
              </div>
              {lead.bio && (
                <div style={{ marginTop: '14px' }}>
                  <span style={S.label}>Bio</span>
                  <p style={{ ...S.value, lineHeight: '1.5', margin: 0 }}>{lead.bio}</p>
                </div>
              )}
            </div>
            <div>
              {lead.fitSummary && (
                <div style={{ marginBottom: '16px' }}>
                  <span style={S.label}>Fit Summary</span>
                  <p style={{ ...S.value, lineHeight: '1.5', margin: 0 }}>{lead.fitSummary}</p>
                </div>
              )}
              {(Array.isArray(lead.destinations) ? lead.destinations : []).length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <span style={S.label}>Destinations</span>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {(Array.isArray(lead.destinations) ? lead.destinations : []).map(d => (
                      <span key={d} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9px', background: '#EFF6F5', color: '#1B6B65', fontWeight: '500' }}>{d}</span>
                    ))}
                  </div>
                </div>
              )}
              {(Array.isArray(lead.niches) ? lead.niches : []).length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <span style={S.label}>Niches</span>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '4px' }}>
                    {(Array.isArray(lead.niches) ? lead.niches : []).map(n => (
                      <span key={n} style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '9px', background: '#FBF8F1', color: '#C9A96E', fontWeight: '500' }}>{n}</span>
                    ))}
                  </div>
                </div>
              )}
              {(Array.isArray(lead.routeIdeas) ? lead.routeIdeas : []).length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <span style={S.label}>Route Ideas</span>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                    {(Array.isArray(lead.routeIdeas) ? lead.routeIdeas : []).map((idea, i) => (
                      <li key={i} style={{ fontSize: '12.5px', color: '#4A433A', marginBottom: '2px' }}>{idea}</li>
                    ))}
                  </ul>
                </div>
              )}
              {(Array.isArray(lead.positiveSignals) ? lead.positiveSignals : []).length > 0 && (
                <div style={{ marginBottom: '14px' }}>
                  <span style={S.label}>Positive Signals</span>
                  <ul style={{ margin: '4px 0 0', paddingLeft: '16px' }}>
                    {(Array.isArray(lead.positiveSignals) ? lead.positiveSignals : []).map((s, i) => (
                      <li key={i} style={{ fontSize: '12.5px', color: '#1B6B65', marginBottom: '2px' }}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'messages' && (
          <div>
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
                  <Send size={13} /> {savingMsg ? 'Saving…' : 'Save Message'}
                </button>
              </div>
            </div>

            {messages.length === 0 && (
              <p style={{ textAlign: 'center', color: '#B5AA99', padding: '24px' }}>No messages yet</p>
            )}
            {messages.map(msg => (
              <div key={msg.id} style={{ padding: '14px', border: '1px solid #E8E3DA', borderRadius: '8px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', marginBottom: '8px' }}>
                  <div>
                    {msg.template_name && (
                      <span style={{ fontSize: '11px', color: '#8C8070', display: 'block', marginBottom: '2px' }}>Template: {msg.template_name}</span>
                    )}
                    <span style={{ fontSize: '10.5px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase', color: msg.status === 'sent_manual' ? '#1B6B65' : msg.status === 'copied' ? '#C9A96E' : '#8C8070', background: msg.status === 'sent_manual' ? '#EFF6F5' : msg.status === 'copied' ? '#FBF8F1' : '#F4F1EC', padding: '2px 7px', borderRadius: '9px' }}>
                      {(msg.status ?? '').replace(/_/g, ' ')}
                    </span>
                    {msg.copiedAt && <span style={{ fontSize: '11px', color: '#B5AA99', marginLeft: '8px' }}>Copied {fmtDate(msg.copiedAt)}</span>}
                    {msg.sentAt && <span style={{ fontSize: '11px', color: '#B5AA99', marginLeft: '8px' }}>Sent {fmtDate(msg.sentAt)}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    <button onClick={() => handleCopyMessage(msg)}
                      style={{ ...S.btnPrimary, padding: '5px 12px', fontSize: '12px', background: copiedMsgId === msg.id ? '#2E8B57' : '#1B6B65' }}>
                      {copiedMsgId === msg.id ? <CheckCircle size={12} /> : <Copy size={12} />}
                      {copiedMsgId === msg.id ? 'Copied!' : 'Copy'}
                    </button>
                    {instagramUrl && (
                      <a href={instagramUrl} target="_blank" rel="noopener noreferrer"
                        style={{ ...S.btnSecondary, textDecoration: 'none', color: '#E1306C', borderColor: '#F5C6C0', padding: '5px 10px', fontSize: '12px' }}>
                        <Instagram size={12} /> DM
                      </a>
                    )}
                    {msg.status !== 'sent_manual' && (
                      <button onClick={() => handleMarkSent(msg)} style={{ ...S.btnSecondary, fontSize: '11.5px', padding: '5px 10px' }}>
                        <Send size={11} /> Mark Sent
                      </button>
                    )}
                  </div>
                </div>
                <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: '13px', color: '#1C1A16', lineHeight: '1.6', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {msg.personalizedBody || msg.body}
                </pre>
              </div>
            ))}
          </div>
        )}

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
