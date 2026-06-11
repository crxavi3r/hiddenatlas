import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Users, Search, MessageSquare, Clock, TrendingUp, PlusCircle, ChevronRight, AlertCircle } from 'lucide-react';

const S = {
  page:   { padding: '28px 32px', background: '#FAFAF8', minHeight: '100vh' },
  title:  { fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '700', color: '#1C1A16', margin: 0 },
  sub:    { fontSize: '13px', color: '#8C8070', marginTop: '4px' },
  card:   { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '20px 24px' },
  kpiVal: { fontSize: '32px', fontWeight: '700', color: '#1C1A16', letterSpacing: '-0.5px' },
  kpiLbl: { fontSize: '11.5px', color: '#8C8070', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' },
  btn:    { padding: '9px 18px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '7px' },
};

const STATUS_GROUPS = {
  pipeline:  ['identified','qualified','message_prepared','contacted','replied','interested'],
  proposal:  ['proposal_sent','demo_scheduled','accepted','onboarding','itinerary_in_creation','active'],
  inactive:  ['rejected','follow_up_later','blocked','not_fit'],
};

const STATUS_LABELS = {
  identified: 'Identified', qualified: 'Qualified', message_prepared: 'Message Prepared',
  contacted: 'Contacted', replied: 'Replied', interested: 'Interested',
  proposal_sent: 'Proposal Sent', demo_scheduled: 'Demo Scheduled',
  accepted: 'Accepted', onboarding: 'Onboarding',
  itinerary_in_creation: 'Creating Itinerary', active: 'Active',
  rejected: 'Rejected', follow_up_later: 'Follow Up Later',
  blocked: 'Blocked', not_fit: 'Not Fit',
};

const STATUS_COLORS = {
  identified: '#8C8070', qualified: '#C9A96E', message_prepared: '#1B6B65',
  contacted: '#1B6B65', replied: '#1B6B65', interested: '#2E8B57',
  proposal_sent: '#2E8B57', demo_scheduled: '#1B6B65', accepted: '#1B6B65',
  onboarding: '#1B6B65', itinerary_in_creation: '#1B6B65', active: '#1B6B65',
  rejected: '#C0392B', follow_up_later: '#C9A96E', blocked: '#C0392B', not_fit: '#C0392B',
};

function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function CreatorAcquisitionDashboardPage() {
  const { getToken } = useAuth();
  const navigate     = useNavigate();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res   = await fetch('/api/admin?action=crm-dashboard', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div style={{ ...S.page, color: '#8C8070' }}>Loading dashboard…</div>;
  if (error)   return <div style={{ ...S.page, color: '#C0392B' }}>Error: {error}</div>;

  const byStatus = data?.byStatus || {};
  const pipelineTotal = STATUS_GROUPS.pipeline.reduce((s, k) => s + (byStatus[k] || 0), 0);
  const conversionTotal = STATUS_GROUPS.proposal.reduce((s, k) => s + (byStatus[k] || 0), 0);

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={S.title}>Creator Acquisition</h1>
          <p style={S.sub}>Discover, qualify and convert travel creators into HiddenAtlas designers</p>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/admin/creator-acquisition/discovery')}
            style={{ ...S.btn, background: '#1B6B65', color: 'white' }}>
            <Search size={14} /> New Discovery Run
          </button>
          <button onClick={() => navigate('/admin/creator-acquisition/crm')}
            style={{ ...S.btn, background: 'white', color: '#1C1A16', border: '1px solid #E8E3DA' }}>
            <Users size={14} /> View CRM
          </button>
          <button onClick={() => navigate('/admin/creator-acquisition/templates')}
            style={{ ...S.btn, background: 'white', color: '#1C1A16', border: '1px solid #E8E3DA' }}>
            <MessageSquare size={14} /> Templates
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '14px', marginBottom: '28px' }}>
        {[
          { icon: Users,        val: data.totalLeads,       lbl: 'Total Leads',        color: '#1B6B65' },
          { icon: TrendingUp,   val: pipelineTotal,         lbl: 'In Pipeline',        color: '#C9A96E' },
          { icon: TrendingUp,   val: conversionTotal,       lbl: 'Proposal / Active',  color: '#2E8B57' },
          { icon: AlertCircle,  val: data.overdueFollowUps, lbl: 'Overdue Follow-ups', color: '#C0392B' },
          { icon: TrendingUp,   val: data.avgScore?.toFixed(1) ?? '—', lbl: 'Avg Score', color: '#1B6B65' },
        ].map(({ icon: Icon, val, lbl, color }) => (
          <div key={lbl} style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
              <Icon size={14} color={color} />
              <span style={{ ...S.kpiLbl, margin: 0 }}>{lbl}</span>
            </div>
            <div style={{ ...S.kpiVal, color }}>{val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '18px', alignItems: 'start' }}>
        {/* Pipeline breakdown */}
        <div style={S.card}>
          <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: '0 0 16px' }}>Pipeline Status Breakdown</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => {
              const count = byStatus[key] || 0;
              const maxCount = Math.max(...Object.values(byStatus).map(Number), 1);
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                  onClick={() => navigate(`/admin/creator-acquisition/crm?status=${key}`)}>
                  <span style={{ width: '150px', fontSize: '12.5px', color: '#4A433A', flexShrink: 0 }}>{label}</span>
                  <div style={{ flex: 1, height: '8px', background: '#F4F1EC', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${(count / maxCount) * 100}%`, background: STATUS_COLORS[key] || '#1B6B65', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                  </div>
                  <span style={{ width: '28px', textAlign: 'right', fontSize: '12.5px', fontWeight: '600', color: count > 0 ? '#1C1A16' : '#C8C0B8' }}>{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming tasks */}
        <div style={S.card}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
            <h2 style={{ fontSize: '14px', fontWeight: '700', color: '#1C1A16', margin: 0 }}>
              <Clock size={13} style={{ marginRight: '6px', verticalAlign: 'middle', color: '#C9A96E' }} />
              Upcoming Tasks
            </h2>
            <button onClick={() => navigate('/admin/creator-acquisition/crm?overdueOnly=true')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#1B6B65', fontWeight: '600' }}>
              View all
            </button>
          </div>
          {data.upcomingTasks?.length === 0 && (
            <p style={{ fontSize: '13px', color: '#B5AA99', textAlign: 'center', padding: '20px 0' }}>No pending tasks</p>
          )}
          {data.upcomingTasks?.map(task => (
            <div key={task.id} style={{ borderBottom: '1px solid #F4F1EC', padding: '10px 0', cursor: 'pointer' }}
              onClick={() => navigate(`/admin/creator-acquisition/leads/${task.leadId}`)}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: '12.5px', fontWeight: '600', color: '#1C1A16', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {task.title}
                  </p>
                  <p style={{ fontSize: '11px', color: '#8C8070', margin: '2px 0 0' }}>
                    @{task.username || task.displayName}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0, marginLeft: '8px' }}>
                  {task.dueAt && new Date(task.dueAt) < new Date() && (
                    <span style={{ fontSize: '10px', color: '#C0392B', fontWeight: '700' }}>OVERDUE</span>
                  )}
                  <span style={{ fontSize: '11px', color: '#8C8070' }}>{fmtDate(task.dueAt)}</span>
                  <ChevronRight size={12} color="#C8C0B8" />
                </div>
              </div>
            </div>
          ))}
          {data.overdueFollowUps > 0 && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: '#FEF3F2', borderRadius: '6px', border: '1px solid #F5C6C0' }}>
              <p style={{ fontSize: '12.5px', color: '#C0392B', fontWeight: '600', margin: 0 }}>
                <AlertCircle size={12} style={{ verticalAlign: 'middle', marginRight: '5px' }} />
                {data.overdueFollowUps} overdue follow-up{data.overdueFollowUps !== 1 ? 's' : ''}
              </p>
            </div>
          )}
          <button onClick={() => navigate('/admin/creator-acquisition/crm')}
            style={{ ...S.btn, background: '#1B6B65', color: 'white', width: '100%', justifyContent: 'center', marginTop: '14px' }}>
            <PlusCircle size={13} /> Add New Lead
          </button>
        </div>
      </div>
    </div>
  );
}
