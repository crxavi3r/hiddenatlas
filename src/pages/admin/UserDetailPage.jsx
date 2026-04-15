import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { ArrowLeft, ShoppingBag, Download, Eye, FileText, LogIn, UserPlus, Trash2 } from 'lucide-react';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA', padding: '20px' };

function fmtDate(ts, full = false) {
  if (!ts) return '—';
  if (full) return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtEur(n) { return `€${parseFloat(n || 0).toFixed(2)}`; }

// ── Journey event types ───────────────────────────────────────────────────────
const EVENT_META = {
  signup:         { icon: UserPlus, color: '#1B6B65', bg: '#EFF6F5',  label: 'Signed up' },
  purchase:       { icon: ShoppingBag, color: '#C9A96E', bg: '#FBF8F1', label: 'Purchased' },
  download:       { icon: Download,    color: '#4A433A', bg: '#F4F1EC', label: 'Downloaded' },
  saved:          { icon: FileText,    color: '#8C8070', bg: '#FAFAF8', label: 'Saved trip' },
  deleted:        { icon: Trash2,      color: '#B04040', bg: '#FDF2F2', label: 'Deleted trip' },
  itinerary_view: { icon: Eye,         color: '#2E8B7A', bg: '#EFF6F5', label: 'Viewed itinerary' },
  page_view:      { icon: Eye,         color: '#D4CCBF', bg: '#FAFAF8', label: 'Page view' },
};

function JourneyEvent({ item }) {
  const meta = EVENT_META[item.type] ?? { icon: Eye, color: '#B5AA99', bg: '#FAFAF8', label: item.type };
  const Icon = meta.icon;
  return (
    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
      {/* Timeline dot */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: meta.bg, border: `1.5px solid ${meta.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={12} color={meta.color} />
        </div>
        <div style={{ width: '1px', flex: 1, background: '#F0EBE3', minHeight: '16px' }} />
      </div>
      {/* Content */}
      <div style={{ flex: 1, paddingBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11.5px', fontWeight: '600', color: meta.color }}>{meta.label}</span>
          {item.amount && <span style={{ fontSize: '11.5px', fontWeight: '700', color: '#1C1A16' }}>{fmtEur(item.amount)}</span>}
          <span style={{ fontSize: '11px', color: '#B5AA99', marginLeft: 'auto' }}>{fmtDate(item.ts, true)}</span>
        </div>
        {item.detail && item.detail !== 'Account created' && (
          <p style={{ fontSize: '12px', color: '#4A433A', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.detail}
          </p>
        )}
        {item.source && (
          <span style={{ fontSize: '10.5px', color: '#B5AA99' }}>via {item.source}</span>
        )}
        {item.device && (
          <span style={{ fontSize: '10.5px', color: '#B5AA99', marginLeft: '8px' }}>{item.device}</span>
        )}
      </div>
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams();
  const [data, setData]   = useState(null);
  const [loading, setLoading] = useState(true);
  const { getToken } = useAuth();

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) { setLoading(false); return; }
        const res = await fetch(`/api/admin?action=user&id=${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setData(await res.json());
      } catch (err) {
        console.error('[admin/user]', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, getToken]);

  if (loading) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <div style={{ height: '20px', background: '#F4F1EC', borderRadius: '4px', width: '200px', marginBottom: '24px' }} />
        <div style={{ ...card, height: '120px' }} />
      </div>
    );
  }
  if (!data || !data.user) {
    return (
      <div style={{ padding: '28px 32px' }}>
        <Link to="/admin/users" style={{ fontSize: '13px', color: '#1B6B65', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={13} /> Back to Users
        </Link>
        <p style={{ marginTop: '24px', color: '#8C8070' }}>User not found.</p>
      </div>
    );
  }

  const { user, purchases, journey } = data;
  const pageViews = journey.filter(e => e.type === 'page_view').length;
  const itinViews = journey.filter(e => e.type === 'itinerary_view').length;

  return (
    <div style={{ padding: '28px 32px' }}>
      {/* Back */}
      <Link to="/admin/users" style={{ fontSize: '12.5px', color: '#1B6B65', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '5px', marginBottom: '20px' }}>
        <ArrowLeft size={12} /> Back to Users
      </Link>

      {/* ── User summary ── */}
      <div style={{ ...card, marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Avatar */}
          <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#1B6B65', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: '20px', fontWeight: '600', color: 'white' }}>
              {(user.name || user.email)[0].toUpperCase()}
            </span>
          </div>
          {/* Info */}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '2px' }}>
              {user.name || user.email}
            </h2>
            <p style={{ fontSize: '13px', color: '#8C8070' }}>{user.email}</p>
            <p style={{ fontSize: '12px', color: '#B5AA99', marginTop: '4px' }}>
              Joined {fmtDate(user.createdAt)} · Clerk ID: {user.clerkId ?? '—'}
            </p>
          </div>
          {/* Stats */}
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {[
              { label: 'Purchases', value: user.purchases },
              { label: 'Downloads', value: user.downloads },
              { label: 'Revenue',   value: fmtEur(user.revenue) },
              { label: 'Page views',value: pageViews },
              { label: 'Itin. views',value: itinViews },
            ].map(s => (
              <div key={s.label} style={{ textAlign: 'center' }}>
                <p style={{ fontSize: '20px', fontWeight: '700', color: '#1C1A16', fontFamily: "'Playfair Display', Georgia, serif" }}>{s.value}</p>
                <p style={{ fontSize: '10.5px', color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px', alignItems: 'flex-start' }}>
        {/* ── Journey timeline ── */}
        <div style={card}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
            User Journey
            <span style={{ fontSize: '11px', fontWeight: '400', color: '#8C8070', marginLeft: '8px' }}>
              {journey.length} events
            </span>
          </p>
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {journey.length === 0 && (
              <p style={{ color: '#B5AA99', fontSize: '13px' }}>No events recorded yet.</p>
            )}
            {journey.map((item, i) => (
              <JourneyEvent key={i} item={item} />
            ))}
          </div>
        </div>

        {/* ── Purchases sidebar ── */}
        <div>
          <div style={{ ...card, marginBottom: '16px' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16', marginBottom: '14px' }}>
              Purchases ({purchases.length})
            </p>
            {purchases.length === 0 && (
              <p style={{ fontSize: '12.5px', color: '#B5AA99' }}>No purchases yet.</p>
            )}
            {purchases.map(p => (
              <div key={p.slug} style={{ padding: '10px 0', borderBottom: '1px solid #F4F1EC' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <p style={{ fontSize: '12.5px', fontWeight: '500', color: '#1C1A16', flex: 1, marginRight: '8px' }}>{p.title}</p>
                  <p style={{ fontSize: '13px', fontWeight: '700', color: '#1B6B65', flexShrink: 0 }}>{fmtEur(p.amount)}</p>
                </div>
                <p style={{ fontSize: '11px', color: '#B5AA99', marginTop: '2px' }}>{fmtDate(p.purchasedAt)} · {p.status}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
