import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import { Plus, Edit2, Trash2, ExternalLink } from 'lucide-react';
import { useIsMobile } from '../../hooks/useIsMobile';

const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };

const btnPrimary = {
  padding: '8px 18px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'flex', alignItems: 'center', gap: '6px',
};
const btnSecondary = {
  padding: '8px 16px', borderRadius: '5px', border: '1px solid #E8E3DA', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A',
  display: 'flex', alignItems: 'center', gap: '6px',
};
const iconBtn = {
  background: 'none', border: 'none', cursor: 'pointer', padding: '5px',
  borderRadius: '4px', color: '#8C8070', display: 'flex', alignItems: 'center',
};

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 600,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
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

export default function CreatorsPage() {
  const { getToken } = useAuth();
  const navigate     = useNavigate();
  const isMobile     = useIsMobile();

  const [creators,  setCreators]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const [toDelete,  setToDelete]  = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const token = await getToken();
      const res   = await fetch('/api/creators?action=list', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json  = await res.json();
      if (json.error) throw new Error(json.error);
      setCreators(json.creators);
    } catch (e) { setError(e.message); }
    finally     { setLoading(false); }
  }, [getToken]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id) {
    try {
      const token = await getToken();
      const res   = await fetch(`/api/creators?action=delete&id=${id}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json  = await res.json();
      if (json.error) throw new Error(json.error);
      setCreators(prev => prev.filter(c => c.id !== id));
    } catch (e) { alert(e.message); }
    finally { setToDelete(null); }
  }

  const th = { padding: '10px 14px', textAlign: 'left', fontSize: '11px', fontWeight: '600',
    color: '#8C8070', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap' };
  const td = { padding: '12px 14px', fontSize: '13px', color: '#1C1A16', borderTop: '1px solid #F4F1EC' };

  return (
    <div style={{ padding: isMobile ? '16px' : '28px 32px' }}>

      {toDelete && (
        <ConfirmModal
          message={`Delete creator "${toDelete.name}"? Their itineraries will remain but creator attribution will be removed.`}
          onConfirm={() => handleDelete(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px',
            fontWeight: '600', color: '#1C1A16' }}>
            Creators
          </h1>
          <p style={{ fontSize: '12.5px', color: '#8C8070', marginTop: '3px' }}>
            {creators.length} creator{creators.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button onClick={() => navigate('/admin/creators/new')} style={btnPrimary}>
          <Plus size={13} /> New creator
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[...Array(3)].map((_, i) => (
            <div key={i} style={{ ...card, height: '60px', opacity: 0.5 }} />
          ))}
        </div>
      ) : error ? (
        <div style={{ ...card, padding: '24px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#C0392B' }}>{error}</p>
        </div>
      ) : creators.length === 0 ? (
        <div style={{ ...card, padding: '48px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: '#B5AA99', marginBottom: '16px' }}>
            No creators yet. Add the first one.
          </p>
          <button onClick={() => navigate('/admin/creators/new')} style={btnPrimary}>
            <Plus size={13} /> New creator
          </button>
        </div>
      ) : isMobile ? (
        <MobileList
          creators={creators}
          onEdit={c => navigate(`/admin/creators/${c.id}`)}
          onDelete={c => setToDelete(c)}
        />
      ) : (
        <div style={{ ...card, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#FAFAF8' }}>
                  <th style={th}>Creator</th>
                  <th style={th}>Slug</th>
                  <th style={{ ...th, textAlign: 'center' }}>Itineraries</th>
                  <th style={{ ...th, textAlign: 'center' }}>Status</th>
                  <th style={{ ...th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {creators.map(c => (
                  <tr key={c.id}>
                    <td style={td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {c.avatarUrl ? (
                          <img src={c.avatarUrl} alt={c.name}
                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                            onError={e => { e.currentTarget.style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%',
                            background: '#EFF6F5', flexShrink: 0, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '13px', fontWeight: '600', color: '#1B6B65' }}>
                            {c.name[0]}
                          </div>
                        )}
                        <div>
                          <p style={{ fontWeight: '600', color: '#1C1A16' }}>{c.name}</p>
                          {c.bio && (
                            <p style={{ fontSize: '11px', color: '#B5AA99',
                              maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.bio}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#8C8070' }}>
                        /{c.slug}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center', color: '#4A433A' }}>
                      {c.itinerary_count ?? 0}
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', fontSize: '10px', fontWeight: '700',
                        letterSpacing: '0.4px', textTransform: 'uppercase',
                        padding: '3px 8px', borderRadius: '10px', whiteSpace: 'nowrap',
                        color: c.isActive ? '#1B6B65' : '#8C8070',
                        background: c.isActive ? '#EFF6F5' : '#F4F1EC',
                      }}>
                        {c.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                        <a href={`/${c.slug}`} target="_blank" rel="noopener noreferrer"
                          style={{ ...iconBtn, textDecoration: 'none' }} title="View public page">
                          <ExternalLink size={13} />
                        </a>
                        <button onClick={() => navigate(`/admin/creators/${c.id}`)} style={iconBtn} title="Edit">
                          <Edit2 size={13} />
                        </button>
                        <button onClick={() => setToDelete(c)} style={{ ...iconBtn, color: '#C0392B' }} title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MobileList({ creators, onEdit, onDelete }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {creators.map(c => (
        <div key={c.id} style={{ background: 'white', border: '1px solid #E8E3DA', borderRadius: '10px', padding: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            {c.avatarUrl ? (
              <img src={c.avatarUrl} alt={c.name}
                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            ) : (
              <div style={{ width: '40px', height: '40px', borderRadius: '50%',
                background: '#EFF6F5', flexShrink: 0, display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: '16px', fontWeight: '600', color: '#1B6B65' }}>
                {c.name[0]}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: '600', color: '#1C1A16', fontSize: '14px' }}>{c.name}</p>
              <p style={{ fontSize: '11px', color: '#B5AA99', fontFamily: 'monospace' }}>/{c.slug}</p>
            </div>
            <span style={{
              fontSize: '10px', fontWeight: '700', letterSpacing: '0.4px', textTransform: 'uppercase',
              padding: '3px 8px', borderRadius: '10px',
              color: c.isActive ? '#1B6B65' : '#8C8070',
              background: c.isActive ? '#EFF6F5' : '#F4F1EC',
            }}>
              {c.isActive ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #F4F1EC', paddingTop: '12px' }}>
            <a href={`/${c.slug}`} target="_blank" rel="noopener noreferrer"
              style={{ flex: 1, textDecoration: 'none', textAlign: 'center', padding: '7px',
                borderRadius: '5px', border: '1px solid #E8E3DA', fontSize: '12px', color: '#4A433A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <ExternalLink size={11} /> View
            </a>
            <button onClick={() => onEdit(c)}
              style={{ flex: 1, padding: '7px', borderRadius: '5px', border: '1px solid #E8E3DA',
                background: 'white', cursor: 'pointer', fontSize: '12px', color: '#4A433A',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <Edit2 size={11} /> Edit
            </button>
            <button onClick={() => onDelete(c)}
              style={{ flex: 1, padding: '7px', borderRadius: '5px', border: '1px solid #FDECEA',
                background: '#FDECEA', cursor: 'pointer', fontSize: '12px', color: '#C0392B',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
              <Trash2 size={11} /> Delete
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
