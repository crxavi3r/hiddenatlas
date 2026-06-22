import { useState, useEffect, useRef } from 'react';
import { X, Search, Check, AlertTriangle, ExternalLink, MapPin, Calendar, Layers } from 'lucide-react';

// ── Shared style tokens (mirrors the rest of the CMS) ────────────────────────
const card = { background: 'white', borderRadius: '10px', border: '1px solid #E8E3DA' };
const btnPrimary = {
  padding: '9px 20px', borderRadius: '5px', border: 'none', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '600', background: '#1B6B65', color: 'white',
  display: 'flex', alignItems: 'center', gap: '6px',
};
const btnSecondary = {
  padding: '8px 16px', borderRadius: '5px', border: '1px solid #E8E3DA', cursor: 'pointer',
  fontSize: '12.5px', fontWeight: '500', background: 'white', color: '#4A433A',
  display: 'flex', alignItems: 'center', gap: '6px',
};

function fmtDate(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const STATUS_LABELS = {
  draft:          'Draft',
  published:      'Published',
  pending_review: 'Pending Review',
  rejected:       'Rejected',
};

// ── Trip card in list ─────────────────────────────────────────────────────────
function TripCard({ trip, selected, onSelect }) {
  const isSelected = selected?.id === trip.id;
  return (
    <div
      onClick={() => onSelect(trip)}
      style={{
        display: 'flex', gap: '12px', alignItems: 'center',
        padding: '12px 14px', borderRadius: '8px', cursor: 'pointer',
        border: `1.5px solid ${isSelected ? '#1B6B65' : '#E8E3DA'}`,
        background: isSelected ? '#EFF6F5' : 'white',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Cover image */}
      <div style={{
        width: '52px', height: '38px', borderRadius: '5px', overflow: 'hidden',
        background: '#F4F1EC', flexShrink: 0,
      }}>
        {trip.coverImage ? (
          <img
            src={trip.coverImage}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <MapPin size={14} color="#B5AA99" />
          </div>
        )}
      </div>

      {/* Trip info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#1C1A16',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '260px' }}>
            {trip.title}
          </p>
          {trip.existingCms && (
            <span style={{
              fontSize: '10px', fontWeight: '700', letterSpacing: '0.3px',
              textTransform: 'uppercase', color: '#C9A96E', background: '#FBF8F1',
              padding: '2px 7px', borderRadius: '8px', border: '1px solid #EDD898',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              Already in CMS
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', marginTop: '3px', flexWrap: 'wrap' }}>
          {trip.destination && (
            <span style={{ fontSize: '11.5px', color: '#6B6156', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <MapPin size={10} /> {trip.destination}
            </span>
          )}
          {trip.dayCount > 0 && (
            <span style={{ fontSize: '11.5px', color: '#6B6156' }}>
              {trip.dayCount} {trip.dayCount === 1 ? 'day' : 'days'}
            </span>
          )}
          {trip.updatedAt && (
            <span style={{ fontSize: '11px', color: '#B5AA99', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Calendar size={10} /> Updated {fmtDate(trip.updatedAt)}
            </span>
          )}
        </div>
      </div>

      {/* Selected check */}
      {isSelected && (
        <div style={{
          width: '20px', height: '20px', borderRadius: '50%',
          background: '#1B6B65', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Check size={12} color="white" strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

// ── Summary row in preview ─────────────────────────────────────────────────────
function PreviewRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: '12px', padding: '8px 0', borderBottom: '1px solid #F4F1EC' }}>
      <span style={{ fontSize: '12px', color: '#8C8070', fontWeight: '500', minWidth: '140px', flexShrink: 0 }}>
        {label}
      </span>
      <span style={{ fontSize: '12.5px', color: '#1C1A16', flex: 1 }}>
        {value}
      </span>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function FromMyTripsModal({ getToken, onClose, onSuccess }) {
  const [screen,          setScreen]          = useState('loading'); // loading | list | preview | creating
  const [trips,           setTrips]           = useState([]);
  const [fetchError,      setFetchError]      = useState(null);
  const [search,          setSearch]          = useState('');
  const [selected,        setSelected]        = useState(null);
  const [confirmed,       setConfirmed]       = useState(false);
  const [dupAcknowledged, setDupAcknowledged] = useState(false);
  const [createError,     setCreateError]     = useState(null);
  const searchRef = useRef(null);

  useEffect(() => {
    fetchTrips();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (screen === 'list' && searchRef.current) {
      searchRef.current.focus();
    }
  }, [screen]);

  async function fetchTrips() {
    setScreen('loading');
    setFetchError(null);
    try {
      const token = await getToken();
      const res   = await fetch('/api/itinerary-cms?action=my-trips-for-import', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setTrips(json.trips || []);
      setScreen('list');
    } catch (e) {
      setFetchError(e.message);
      setScreen('list');
    }
  }

  function handleSelectTrip(trip) {
    setSelected(trip);
    setConfirmed(false);
    setDupAcknowledged(false);
    setCreateError(null);
  }

  function handleGoToPreview() {
    if (!selected) return;
    setCreateError(null);
    setConfirmed(false);
    setScreen('preview');
  }

  async function handleCreate() {
    if (!selected || !confirmed) return;
    setScreen('creating');
    setCreateError(null);
    try {
      const token = await getToken();
      const res   = await fetch('/api/itinerary-cms?action=create-from-trip', {
        method:  'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tripId: selected.id, forceCreate: dupAcknowledged }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      if (json.duplicate && !dupAcknowledged) {
        setScreen('preview');
        return;
      }
      onSuccess(json.itinerary.id, json.warnings || []);
    } catch (e) {
      setCreateError(e.message);
      setScreen('preview');
    }
  }

  const filtered = trips.filter(t => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (t.title       || '').toLowerCase().includes(q) ||
           (t.destination || '').toLowerCase().includes(q);
  });

  const hasDuplicate = selected?.existingCms && !dupAcknowledged;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 800,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        ...card,
        width: '100%', maxWidth: '680px', maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: '1px solid #F4F1EC', flexShrink: 0,
        }}>
          <div>
            <p style={{ fontSize: '14.5px', fontWeight: '700', color: '#1C1A16' }}>
              {screen === 'preview' || screen === 'creating' ? 'Preview CMS itinerary' : 'Create from My Trips'}
            </p>
            <p style={{ fontSize: '11.5px', color: '#8C8070', marginTop: '2px' }}>
              {screen === 'list' || screen === 'loading'
                ? 'Select a personal trip to turn into a CMS itinerary'
                : 'Review what will be created before confirming'}
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: '#6B6156' }}>
            <X size={18} />
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>

          {/* Loading */}
          {screen === 'loading' && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#8C8070', fontSize: '13.5px' }}>
              Loading your trips...
            </div>
          )}

          {/* Creating */}
          {screen === 'creating' && (
            <div style={{ textAlign: 'center', padding: '48px 0' }}>
              <p style={{ fontSize: '13.5px', color: '#1C1A16', fontWeight: '600', marginBottom: '8px' }}>
                Creating CMS itinerary...
              </p>
              <p style={{ fontSize: '12.5px', color: '#8C8070' }}>
                Copying days, places, and images from your trip.
              </p>
            </div>
          )}

          {/* List screen */}
          {screen === 'list' && (
            <>
              {fetchError && (
                <div style={{
                  padding: '12px 14px', borderRadius: '7px', background: '#FEF2F2',
                  border: '1px solid #FECACA', color: '#C0392B', fontSize: '12.5px',
                  marginBottom: '14px', lineHeight: '1.5',
                }}>
                  {fetchError}
                </div>
              )}

              {/* Search */}
              {trips.length > 0 && (
                <div style={{
                  position: 'relative', marginBottom: '14px',
                }}>
                  <Search size={14} style={{
                    position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)',
                    color: '#B5AA99', pointerEvents: 'none',
                  }} />
                  <input
                    ref={searchRef}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search by title or destination..."
                    style={{
                      width: '100%', padding: '9px 12px 9px 34px',
                      border: '1px solid #E8E3DA', borderRadius: '6px',
                      fontSize: '13px', color: '#1C1A16', background: 'white',
                      outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
                    }}
                  />
                </div>
              )}

              {/* Empty state */}
              {!fetchError && trips.length === 0 && (
                <div style={{ textAlign: 'center', padding: '48px 20px' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: '#F4F1EC', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <Layers size={22} color="#B5AA99" />
                  </div>
                  <p style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: '17px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px',
                  }}>
                    No personal trips available
                  </p>
                  <p style={{ fontSize: '13px', color: '#8C8070', lineHeight: '1.6', marginBottom: '20px', maxWidth: '340px', margin: '0 auto 20px' }}>
                    Create and plan a trip in My Trips before turning it into a CMS itinerary.
                  </p>
                  <a
                    href="/my-trips"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: '6px',
                      padding: '9px 18px', borderRadius: '6px', border: '1px solid #1B6B65',
                      fontSize: '12.5px', fontWeight: '600', color: '#1B6B65',
                      textDecoration: 'none',
                    }}
                  >
                    <ExternalLink size={13} />
                    Open My Trips
                  </a>
                </div>
              )}

              {/* No results (search) */}
              {!fetchError && trips.length > 0 && filtered.length === 0 && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: '#B5AA99', fontSize: '13px' }}>
                  No trips match "{search}"
                </div>
              )}

              {/* Trip list */}
              {filtered.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {filtered.map(trip => (
                    <TripCard
                      key={trip.id}
                      trip={trip}
                      selected={selected}
                      onSelect={handleSelectTrip}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Preview screen */}
          {(screen === 'preview') && selected && (
            <>
              {/* Duplicate warning */}
              {hasDuplicate && (
                <div style={{
                  padding: '14px 16px', borderRadius: '8px',
                  background: '#FBF8F1', border: '1px solid #EDD898',
                  marginBottom: '18px',
                }}>
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <AlertTriangle size={16} color="#C9A96E" style={{ flexShrink: 0, marginTop: '1px' }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '13px', fontWeight: '600', color: '#7D5A00', marginBottom: '4px' }}>
                        This My Trip has already been used to create a CMS itinerary.
                      </p>
                      <p style={{ fontSize: '12px', color: '#9B7A20', lineHeight: '1.5', marginBottom: '10px' }}>
                        An itinerary called "{selected.existingCms.title}" ({STATUS_LABELS[selected.existingCms.status] || selected.existingCms.status}) already exists from this trip.
                      </p>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <a
                          href={`/admin/itineraries/${selected.existingCms.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                            padding: '6px 12px', borderRadius: '5px',
                            border: '1px solid #C9A96E', background: 'white',
                            fontSize: '11.5px', fontWeight: '600', color: '#7D5A00',
                            textDecoration: 'none',
                          }}
                        >
                          <ExternalLink size={11} />
                          Open existing itinerary
                        </a>
                        <button
                          onClick={() => setDupAcknowledged(true)}
                          style={{
                            padding: '6px 12px', borderRadius: '5px',
                            border: '1px solid #E8E3DA', background: 'white',
                            fontSize: '11.5px', fontWeight: '500', color: '#4A433A', cursor: 'pointer',
                          }}
                        >
                          Create another copy
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Summary */}
              {!hasDuplicate && (
                <>
                  <div style={{ marginBottom: '18px' }}>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: '#6B6156', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '10px' }}>
                      What will be created
                    </p>
                    <div style={{ ...card, padding: '4px 16px' }}>
                      <PreviewRow label="Source trip"      value={selected.title} />
                      <PreviewRow label="Destination"      value={selected.destination || '—'} />
                      <PreviewRow label="Number of days"   value={selected.dayCount > 0 ? `${selected.dayCount} days` : '—'} />
                      <PreviewRow label="Places to copy"   value={selected.eligiblePlaceCount > 0 ? `${selected.eligiblePlaceCount} places` : '—'} />
                      <PreviewRow label="Images"           value={selected.imageCount > 0 ? `${selected.imageCount} images` : '—'} />
                      <PreviewRow label="Resulting status" value={
                        <span style={{ color: '#1B6B65', fontWeight: '600' }}>Draft</span>
                      } />
                    </div>
                  </div>

                  {/* What will NOT be copied */}
                  <div style={{
                    padding: '13px 15px', borderRadius: '7px',
                    background: '#F7F5F2', border: '1px solid #E8E3DA', marginBottom: '18px',
                  }}>
                    <p style={{ fontSize: '11px', fontWeight: '700', color: '#6B6156', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '8px' }}>
                      Will NOT be copied
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {[
                        'Exact travel dates (start and end date)',
                        'Booking references and confirmation numbers',
                        'Personal notes and private attachments',
                        'Shared user information and permissions',
                        'Flight, hotel, and activity bookings',
                        'Payment and pricing information',
                      ].map(item => (
                        <li key={item} style={{ fontSize: '12px', color: '#6B6156', lineHeight: '1.5' }}>{item}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Create error */}
                  {createError && (
                    <div style={{
                      padding: '11px 14px', borderRadius: '7px', background: '#FEF2F2',
                      border: '1px solid #FECACA', color: '#C0392B', fontSize: '12.5px',
                      marginBottom: '14px', lineHeight: '1.5',
                    }}>
                      {createError}
                    </div>
                  )}

                  {/* Confirmation checkbox */}
                  <label style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={confirmed}
                      onChange={e => setConfirmed(e.target.checked)}
                      style={{ marginTop: '3px', accentColor: '#1B6B65', cursor: 'pointer', flexShrink: 0 }}
                    />
                    <span style={{ fontSize: '12.5px', color: '#4A433A', lineHeight: '1.6' }}>
                      I confirm that I have reviewed the content and have the right to use the imported images.
                    </span>
                  </label>
                </>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderTop: '1px solid #F4F1EC', flexShrink: 0, background: '#FAFAF8',
          gap: '10px',
        }}>
          <button
            onClick={screen === 'preview' ? () => { setScreen('list'); setConfirmed(false); } : onClose}
            style={btnSecondary}
          >
            {screen === 'preview' ? '← Back' : 'Cancel'}
          </button>

          {screen === 'list' && (
            <button
              onClick={handleGoToPreview}
              disabled={!selected}
              style={{
                ...btnPrimary,
                opacity: !selected ? 0.5 : 1,
                cursor: !selected ? 'not-allowed' : 'pointer',
              }}
            >
              Preview →
            </button>
          )}

          {screen === 'preview' && !hasDuplicate && (
            <button
              onClick={handleCreate}
              disabled={!confirmed}
              style={{
                ...btnPrimary,
                opacity: !confirmed ? 0.5 : 1,
                cursor: !confirmed ? 'not-allowed' : 'pointer',
              }}
            >
              <Check size={13} />
              Create CMS itinerary
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
