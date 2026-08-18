import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@clerk/clerk-react';
import {
  Bed, Plane, MapPin, Utensils, Car, FileText,
  Globe, Mail, Phone, MessageCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

/* ─── Design tokens ─────────────────────────────────────────── */
const SERIF    = "'Playfair Display', Georgia, serif";
const SANS     = "'Inter', system-ui, sans-serif";
const CHARCOAL = '#1C1A16';
const MUTED    = '#8C8070';
const STONE    = '#FAFAF8';
const BORDER   = '#E8E3DA';

const DEFAULT_PRIMARY = '#1B6B65';
const DEFAULT_ACCENT  = '#C9A96E';

/* ─── Item type → Lucide icon ───────────────────────────────── */
const ITEM_ICONS = {
  hotel:      Bed,
  flight:     Plane,
  activity:   MapPin,
  restaurant: Utensils,
  transfer:   Car,
  note:       FileText,
};

/* ─── Helpers ───────────────────────────────────────────────── */
function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  // Parse as UTC to prevent day-shift from local timezone offset
  const raw = String(dateStr).split('T')[0];
  const [y, m, d] = raw.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  return utc.toLocaleDateString('en-GB', {
    day:      'numeric',
    month:    'short',
    year:     'numeric',
    timeZone: 'UTC',
  });
}

function formatDateRange(start, end) {
  const s = formatDisplayDate(start);
  const e = formatDisplayDate(end);
  if (!s) return '';
  if (!e || s === e) return s;
  return `${s} – ${e}`;
}

function formatTimeRange(startTime, endTime) {
  if (!startTime) return '';
  if (!endTime) return startTime;
  return `${startTime} – ${endTime}`;
}

/* ─── Loading spinner ───────────────────────────────────────── */
function Spinner({ color }) {
  const c = color || DEFAULT_PRIMARY;
  return (
    <>
      <style>{`@keyframes ha-spin { to { transform: rotate(360deg); } }`}</style>
      <div
        role="status"
        aria-label="Loading"
        style={{
          width:  40,
          height: 40,
          borderRadius: '50%',
          border: `3px solid ${c}28`,
          borderTopColor: c,
          animation: 'ha-spin 0.75s linear infinite',
          flexShrink: 0,
        }}
      />
    </>
  );
}

/* ─── Error state ───────────────────────────────────────────── */
function ErrorState() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '48px 24px',
        background: STONE,
        fontFamily: SANS,
        textAlign: 'center',
      }}
    >
      <div style={{
        width: 56,
        height: 56,
        borderRadius: '50%',
        background: `${DEFAULT_PRIMARY}15`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
      }}>
        <MapPin size={24} color={DEFAULT_PRIMARY} />
      </div>
      <h1 style={{
        fontFamily: SERIF,
        fontSize: 24,
        fontWeight: 600,
        color: CHARCOAL,
        marginBottom: 12,
      }}>
        Link not found
      </h1>
      <p style={{ fontSize: 15, color: MUTED, marginBottom: 32, maxWidth: 340 }}>
        This link is no longer valid or has expired. Please contact your travel designer for a new link.
      </p>
      <a
        href="/"
        style={{
          fontSize: 14,
          color: DEFAULT_PRIMARY,
          textDecoration: 'underline',
          fontWeight: 500,
        }}
      >
        Return to homepage
      </a>
    </div>
  );
}

/* ─── Preview banner ────────────────────────────────────────── */
function PreviewBanner() {
  return (
    <div
      style={{
        position:   'sticky',
        top:        0,
        zIndex:     1000,
        background: '#FEF3C7',
        color:      CHARCOAL,
        fontFamily: SANS,
        fontSize:   13,
        fontWeight: 500,
        textAlign:  'center',
        padding:    '10px 24px',
        borderBottom: '1px solid #FDE68A',
        lineHeight: 1.4,
      }}
    >
      Preview mode &mdash; this is how your client will see their trip portal.
    </div>
  );
}

/* ─── Agency top bar ────────────────────────────────────────── */
function AgencyTopBar({ branding }) {
  const primary = branding?.primaryColor || DEFAULT_PRIMARY;
  const logoSrc = branding?.logoUrl || branding?.logoDarkUrl;

  return (
    <div
      style={{
        height:         60,
        background:     primary,
        display:        'flex',
        alignItems:     'center',
        padding:        '0 24px',
        flexShrink:     0,
      }}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={branding?.agencyName || 'Agency'}
          style={{ maxHeight: 36, maxWidth: 200, objectFit: 'contain' }}
        />
      ) : (
        <span
          style={{
            fontFamily: SERIF,
            fontSize:   18,
            fontWeight: 600,
            color:      '#FFFFFF',
            letterSpacing: '0.01em',
          }}
        >
          {branding?.agencyName || 'Travel Agency'}
        </span>
      )}
    </div>
  );
}

/* ─── Hero section ──────────────────────────────────────────── */
function HeroSection({ branding, client, travellers, trip }) {
  const primary = branding?.primaryColor || DEFAULT_PRIMARY;
  const dates   = formatDateRange(trip?.startDate, trip?.endDate);

  // Primary traveller name: client.name fallback to first traveller with role=primary
  const primaryName = client?.name
    || travellers?.find(t => t.role === 'primary')?.name
    || travellers?.[0]?.name
    || null;

  return (
    <div
      style={{
        background: primary,
        padding:    '48px 24px 52px',
        color:      '#FFFFFF',
        textAlign:  'center',
      }}
    >
      {/* Trip title */}
      <h1
        style={{
          fontFamily:    SERIF,
          fontSize:      'clamp(24px, 5vw, 36px)',
          fontWeight:    700,
          lineHeight:    1.25,
          margin:        '0 auto 16px',
          maxWidth:      680,
          color:         '#FFFFFF',
        }}
      >
        {trip?.title || 'Your Trip'}
      </h1>

      {/* Travel dates */}
      {dates && (
        <p style={{ fontSize: 14, opacity: 0.9, marginBottom: 8, fontFamily: SANS }}>
          {dates}
        </p>
      )}

      {/* Client name */}
      {primaryName && (
        <p style={{ fontSize: 13, opacity: 0.7, fontFamily: SANS }}>
          Prepared for {primaryName}
        </p>
      )}
    </div>
  );
}

/* ─── Day card ──────────────────────────────────────────────── */
function DayCard({ day, accent, isOpen, onToggle }) {
  const accentColor = accent || DEFAULT_ACCENT;

  return (
    <div
      style={{
        borderRadius:  10,
        border:        `1px solid ${BORDER}`,
        overflow:      'hidden',
        marginBottom:  12,
        background:    '#FFFFFF',
      }}
    >
      {/* Day header — clickable */}
      <button
        onClick={onToggle}
        style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          width:          '100%',
          padding:        '14px 18px',
          background:     'none',
          border:         'none',
          cursor:         'pointer',
          textAlign:      'left',
          gap:            12,
        }}
      >
        <div style={{ minWidth: 0 }}>
          {day.date && (
            <span
              style={{
                display:      'block',
                fontSize:     11,
                fontWeight:   600,
                color:        accentColor,
                letterSpacing:'0.07em',
                textTransform:'uppercase',
                marginBottom: 2,
                fontFamily:   SANS,
              }}
            >
              {formatDisplayDate(day.date)}
            </span>
          )}
          <span
            style={{
              fontSize:   15,
              fontWeight: 600,
              color:      CHARCOAL,
              fontFamily: SANS,
              lineHeight: 1.3,
            }}
          >
            {day.title || `Day ${day.dayNumber ?? ''}`}
          </span>
        </div>
        <div style={{ flexShrink: 0, color: MUTED }}>
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Collapsible body */}
      {isOpen && (
        <div style={{ padding: '4px 18px 18px' }}>
          {/* Notes */}
          {day.notes?.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              {day.notes.map(note => (
                <p
                  key={note.id}
                  style={{
                    fontSize:   13,
                    color:      MUTED,
                    fontFamily: SANS,
                    fontStyle:  'italic',
                    lineHeight: 1.6,
                    margin:     '0 0 6px',
                    paddingLeft: 4,
                  }}
                >
                  {note.content}
                </p>
              ))}
            </div>
          )}

          {/* Items */}
          {day.items?.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {day.items.map(item => (
                <ItemRow key={item.id} item={item} accent={accentColor} />
              ))}
            </div>
          ) : (
            <p style={{ fontSize: 13, color: MUTED, fontFamily: SANS, fontStyle: 'italic' }}>
              No items yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Item row ──────────────────────────────────────────────── */
function ItemRow({ item, accent }) {
  const Icon     = ITEM_ICONS[item.type] || MapPin;
  const timeStr  = formatTimeRange(item.startTime, item.endTime);

  return (
    <div
      style={{
        display:      'flex',
        gap:          12,
        paddingLeft:  16,
        borderLeft:   `2px solid ${accent}`,
      }}
    >
      {/* Icon */}
      <div
        style={{
          flexShrink:  0,
          marginTop:   2,
          color:       accent,
          opacity:     0.85,
        }}
      >
        <Icon size={15} />
      </div>

      {/* Content */}
      <div style={{ minWidth: 0, flex: 1 }}>
        {timeStr && (
          <p style={{
            fontSize:   11,
            color:      MUTED,
            fontFamily: SANS,
            margin:     '0 0 2px',
            fontWeight: 500,
          }}>
            {timeStr}
          </p>
        )}
        <p style={{
          fontSize:   14,
          fontWeight: 600,
          color:      CHARCOAL,
          fontFamily: SANS,
          margin:     '0 0 4px',
          lineHeight: 1.3,
        }}>
          {item.title}
        </p>
        {item.description && (
          <p style={{
            fontSize:   13,
            color:      '#4A433A',
            fontFamily: SANS,
            lineHeight: 1.6,
            margin:     0,
          }}>
            {item.description}
          </p>
        )}
      </div>
    </div>
  );
}

/* ─── Days section ──────────────────────────────────────────── */
function DaysSection({ trip, branding }) {
  const accent = branding?.accentColor || DEFAULT_ACCENT;
  const days   = trip?.days || [];

  // Start with all days expanded
  const [openMap, setOpenMap] = useState(() => {
    const init = {};
    days.forEach(d => { init[d.id] = true; });
    return init;
  });

  function toggle(id) {
    setOpenMap(prev => ({ ...prev, [id]: !prev[id] }));
  }

  if (days.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: MUTED, fontFamily: SANS }}>
          No days have been added to this trip yet.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        background: STONE,
        padding:    '32px 24px 48px',
        flex:       1,
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {days.map(day => (
          <DayCard
            key={day.id}
            day={day}
            accent={accent}
            isOpen={!!openMap[day.id]}
            onToggle={() => toggle(day.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ─── Contact bar ───────────────────────────────────────────── */
function ContactBar({ branding }) {
  const { website, supportEmail, phone, whatsapp, showPoweredByHiddenatlas } = branding || {};
  const hasContact = website || supportEmail || phone || whatsapp;

  if (!hasContact && !showPoweredByHiddenatlas) return null;

  return (
    <div
      style={{
        background:    '#F0EDE8',
        borderTop:     `1px solid ${BORDER}`,
        padding:       '20px 24px',
        textAlign:     'center',
        fontFamily:    SANS,
      }}
    >
      {hasContact && (
        <div
          style={{
            display:        'flex',
            flexWrap:       'wrap',
            gap:            '16px 24px',
            justifyContent: 'center',
            alignItems:     'center',
            marginBottom:   showPoweredByHiddenatlas ? 14 : 0,
          }}
        >
          {website && (
            <a
              href={website.startsWith('http') ? website : `https://${website}`}
              target="_blank"
              rel="noopener noreferrer"
              style={contactLinkStyle}
              aria-label="Agency website"
            >
              <Globe size={15} />
              <span>{website.replace(/^https?:\/\//, '')}</span>
            </a>
          )}
          {supportEmail && (
            <a
              href={`mailto:${supportEmail}`}
              style={contactLinkStyle}
              aria-label="Email support"
            >
              <Mail size={15} />
              <span>{supportEmail}</span>
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone}`}
              style={contactLinkStyle}
              aria-label="Call us"
            >
              <Phone size={15} />
              <span>{phone}</span>
            </a>
          )}
          {whatsapp && (
            <a
              href={`https://wa.me/${whatsapp.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              style={contactLinkStyle}
              aria-label="WhatsApp"
            >
              <MessageCircle size={15} />
              <span>WhatsApp</span>
            </a>
          )}
        </div>
      )}

      {showPoweredByHiddenatlas && (
        <p style={{ fontSize: 11, color: MUTED, margin: 0, letterSpacing: '0.02em' }}>
          Powered by{' '}
          <a
            href="https://hiddenatlas.com"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: DEFAULT_PRIMARY, textDecoration: 'underline', fontWeight: 500 }}
          >
            HiddenAtlas
          </a>
        </p>
      )}
    </div>
  );
}

const contactLinkStyle = {
  display:        'inline-flex',
  alignItems:     'center',
  gap:            6,
  fontSize:       13,
  color:          CHARCOAL,
  textDecoration: 'none',
  fontWeight:     500,
  opacity:        0.8,
};

/* ─── Main component ────────────────────────────────────────── */
export default function TravelPortal({ mode }) {
  const { token, agencyTripId } = useParams();
  const { getToken }            = useAuth();
  const isPreview               = mode === 'preview';

  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        let url;
        const headers = {};

        if (isPreview) {
          const authToken = await getToken();
          if (!authToken) throw new Error('unauthenticated');
          url = `/api/agency-trips?action=preview-data&agencyTripId=${agencyTripId}`;
          headers['Authorization'] = `Bearer ${authToken}`;
        } else {
          url = `/api/agency-trips?action=resolve-share&token=${token}`;
        }

        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`http_${res.status}`);

        const json = await res.json();
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [token, agencyTripId, isPreview, getToken]);

  /* ── Loading ── */
  if (loading) {
    const primary = DEFAULT_PRIMARY;
    return (
      <div
        style={{
          minHeight:      '100vh',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     STONE,
        }}
      >
        <Spinner color={primary} />
      </div>
    );
  }

  /* ── Error ── */
  if (error || !data) {
    return <ErrorState />;
  }

  const { branding, client, travellers, trip } = data;
  // Apply branding-aware primary for loading spinner after data arrives — used in top bar
  // (already shown through AgencyTopBar/HeroSection)

  return (
    <div
      style={{
        minHeight:      '100vh',
        display:        'flex',
        flexDirection:  'column',
        fontFamily:     SANS,
        background:     STONE,
        overflowX:      'hidden',
      }}
    >
      {/* Preview sticky banner */}
      {isPreview && <PreviewBanner />}

      {/* Agency branded top bar */}
      <AgencyTopBar branding={branding} />

      {/* Hero */}
      <HeroSection
        branding={branding}
        client={client}
        travellers={travellers}
        trip={trip}
      />

      {/* Days */}
      <DaysSection trip={trip} branding={branding} />

      {/* Contact + powered-by */}
      <ContactBar branding={branding} />
    </div>
  );
}
