import { useParams, Link } from 'react-router-dom';
import { Clock, Users, MapPin, Check, Star, ArrowRight, Lock, Download, ChevronRight, Route } from 'lucide-react';
import { itineraries } from '../data/itineraries';

export default function ItineraryDetailPage() {
  const { id } = useParams();
  const itinerary = itineraries.find(it => it.id === id);

  if (!itinerary) {
    return (
      <div style={{ padding: '120px 24px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '32px', marginBottom: '16px' }}>
          Itinerary not found
        </h1>
        <Link to="/itineraries" style={{ color: '#1B6B65', fontWeight: '600' }}>← Back to Itineraries</Link>
      </div>
    );
  }

  const {
    title, subtitle, country, region, duration, groupSize, price, isPremium,
    image, coverImage, highlights, description, bestFor, difficulty,
    days = [], whySpecial, routeOverview, included = [],
  } = itinerary;

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero Cover */}
      <section style={{ position: 'relative', height: 'clamp(400px, 55vw, 600px)', overflow: 'hidden' }}>
        <img
          src={coverImage || image}
          alt={title}
          style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(14,61,57,0.85) 0%, rgba(14,61,57,0.2) 60%, transparent 100%)',
        }} />
        <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, padding: '0 24px' }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Link to="/itineraries" style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', textDecoration: 'none' }}>
                Itineraries
              </Link>
              <ChevronRight size={12} color="rgba(255,255,255,0.5)" />
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)' }}>{country}</span>
            </div>
            <h1 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: 'clamp(28px, 4vw, 52px)',
              fontWeight: '600', color: 'white',
              lineHeight: '1.15', letterSpacing: '-0.5px',
              marginBottom: '8px',
            }}>
              {title}
            </h1>
            <p style={{ fontSize: '18px', color: 'rgba(255,255,255,0.75)' }}>{subtitle}</p>
            <div style={{ display: 'flex', gap: '20px', marginTop: '16px', flexWrap: 'wrap' }}>
              {[
                [MapPin, region],
                [Clock, duration],
                [Users, groupSize],
              ].map(([Icon, text], i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', color: 'rgba(255,255,255,0.8)' }}>
                  <Icon size={14} />
                  {text}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Body */}
      <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '60px 24px' }}>
        <div className="resp-detail-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '64px', alignItems: 'start' }}>

          {/* Left: Content */}
          <div>
            {/* Overview */}
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>
                Overview
              </h2>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8' }}>{description}</p>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '24px' }}>
                {bestFor.map(tag => (
                  <span key={tag} style={{
                    padding: '6px 14px', borderRadius: '3px',
                    background: '#EFF6F5', color: '#1B6B65',
                    fontSize: '12px', fontWeight: '600', letterSpacing: '0.5px',
                  }}>
                    {tag}
                  </span>
                ))}
                <span style={{
                  padding: '6px 14px', borderRadius: '3px',
                  background: '#F4F1EC', color: '#6B6156',
                  fontSize: '12px', fontWeight: '600',
                }}>
                  {difficulty} Pace
                </span>
              </div>
            </section>

            {/* Highlights */}
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '24px' }}>
                Trip Highlights
              </h2>
              <div className="resp-highlights-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                {highlights.map((h, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: '#EFF6F5', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Star size={11} color="#1B6B65" fill="#1B6B65" />
                    </div>
                    <span style={{ fontSize: '15px', color: '#4A433A', lineHeight: '1.5' }}>{h}</span>
                  </div>
                ))}
              </div>
            </section>

            {/* Day by Day */}
            <section style={{ marginBottom: '60px' }}>
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '32px' }}>
                Day by Day
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {days.map((day, i) => {
                  const isLocked = isPremium && i >= 2;
                  return (
                    <div key={i} style={{ display: 'flex', gap: '24px', position: 'relative' }}>
                      {/* Timeline */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          background: isLocked ? '#E8E3DA' : '#1B6B65',
                          color: isLocked ? '#8C8070' : 'white',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: '600', flexShrink: 0,
                          zIndex: 1,
                        }}>
                          {isLocked ? <Lock size={13} /> : day.day}
                        </div>
                        {i < days.length - 1 && (
                          <div style={{ width: '1px', flex: 1, background: '#E8E3DA', minHeight: '24px' }} />
                        )}
                      </div>

                      {/* Content */}
                      <div style={{
                        paddingBottom: '40px',
                        filter: isLocked ? 'blur(4px)' : 'none',
                        userSelect: isLocked ? 'none' : 'auto',
                        transition: 'filter 0.3s',
                        flex: 1,
                      }}>
                        <p style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '6px' }}>
                          Day {day.day}
                        </p>
                        <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '10px' }}>
                          {day.title}
                        </h3>
                        <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7', marginBottom: day.bullets?.length ? '16px' : '0' }}>
                          {day.desc}
                        </p>

                        {/* Bullets */}
                        {day.bullets?.length > 0 && (
                          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {day.bullets.map((bullet, bi) => (
                              <li key={bi} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                                <span style={{
                                  width: '5px', height: '5px', borderRadius: '50%',
                                  background: '#C9A96E', flexShrink: 0, marginTop: '8px',
                                }} />
                                <span style={{ fontSize: '14px', color: '#4A433A', lineHeight: '1.6' }}>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        )}

                        {day.img && !isLocked && (
                          <img
                            src={day.img} alt={day.title}
                            style={{ width: '100%', maxWidth: '480px', height: '220px', objectFit: 'cover', borderRadius: '6px' }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {isPremium && (
                <div style={{
                  background: '#F4F1EC',
                  borderRadius: '8px',
                  padding: '32px',
                  textAlign: 'center',
                  border: '1px solid #E8E3DA',
                }}>
                  <Lock size={24} color="#8C8070" style={{ margin: '0 auto 16px' }} />
                  <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '22px', fontWeight: '600', color: '#1C1A16', marginBottom: '8px' }}>
                    Unlock the full {duration} itinerary
                  </h3>
                  <p style={{ fontSize: '15px', color: '#6B6156', marginBottom: '24px' }}>
                    Get complete day-by-day plans, every recommendation, logistics, and insider notes.
                  </p>
                  <button
                    onClick={() => window.location.href = '/pricing'}
                    style={{
                      padding: '14px 32px',
                      background: '#C9A96E', color: 'white',
                      border: 'none', borderRadius: '4px',
                      fontSize: '14px', fontWeight: '600',
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Unlock for €{price}
                  </button>
                </div>
              )}
            </section>

            {/* Why This Journey Is Special */}
            {whySpecial && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '16px' }}>
                  Why This Journey Is Special
                </h2>
                <div style={{
                  borderLeft: '3px solid #C9A96E',
                  paddingLeft: '24px',
                }}>
                  <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.85', fontStyle: 'italic' }}>
                    {whySpecial}
                  </p>
                </div>
              </section>
            )}

            {/* Route Overview */}
            {routeOverview && (
              <section style={{ marginBottom: '60px' }}>
                <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', marginBottom: '20px' }}>
                  Route Overview
                </h2>
                <div style={{
                  background: '#EFF6F5',
                  borderRadius: '8px',
                  padding: '24px 28px',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'flex-start',
                }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '50%',
                    background: '#1B6B65', flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Route size={16} color="white" />
                  </div>
                  <p style={{ fontSize: '15px', color: '#2C5F5A', lineHeight: '1.7', fontWeight: '500' }}>
                    {routeOverview}
                  </p>
                </div>
              </section>
            )}
          </div>

          {/* Right: Sidebar */}
          <div className="resp-sidebar" style={{ position: 'sticky', top: '100px' }}>
            <div style={{
              background: 'white',
              border: '1px solid #E8E3DA',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 8px 40px rgba(28,26,22,0.08)',
            }}>
              <div style={{
                background: isPremium ? 'linear-gradient(135deg, #0E3D39, #1B6B65)' : '#EFF6F5',
                padding: '28px',
              }}>
                {isPremium ? (
                  <>
                    <div style={{ display: 'flex', gap: '2px', marginBottom: '12px' }}>
                      {[1,2,3,4,5].map(i => <Star key={i} size={12} fill="#C9A96E" color="#C9A96E" />)}
                    </div>
                    <div style={{ fontSize: '36px', fontWeight: '700', color: 'white', fontFamily: "'Playfair Display', Georgia, serif" }}>
                      €{price}
                    </div>
                    <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.65)', marginTop: '4px' }}>One-time purchase · Digital download</p>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: '28px', fontWeight: '700', color: '#1B6B65', fontFamily: "'Playfair Display', Georgia, serif" }}>
                      Free
                    </div>
                    <p style={{ fontSize: '13px', color: '#4A433A', marginTop: '4px' }}>No account required</p>
                  </>
                )}
              </div>

              <div style={{ padding: '28px' }}>
                {included.length > 0 && (
                  <>
                    <p style={{ fontSize: '13px', fontWeight: '600', color: '#4A433A', marginBottom: '16px', letterSpacing: '0.3px' }}>
                      What's included:
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '28px' }}>
                      {included.map((item, i) => (
                        <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <Check size={14} color="#1B6B65" style={{ flexShrink: 0, marginTop: '2px' }} strokeWidth={2.5} />
                          <span style={{ fontSize: '13px', color: '#4A433A', lineHeight: '1.5' }}>{item}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {isPremium ? (
                  <button
                    style={{
                      width: '100%', padding: '16px',
                      background: '#C9A96E', color: 'white',
                      border: 'none', borderRadius: '4px',
                      fontSize: '14px', fontWeight: '600',
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    <Download size={15} />
                    Unlock for €{price}
                  </button>
                ) : (
                  <button
                    style={{
                      width: '100%', padding: '16px',
                      background: '#1B6B65', color: 'white',
                      border: 'none', borderRadius: '4px',
                      fontSize: '14px', fontWeight: '600',
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      marginBottom: '12px',
                    }}
                  >
                    <Download size={15} />
                    Download Free
                  </button>
                )}

                <Link
                  to="/custom"
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                    width: '100%', padding: '12px',
                    border: '1px solid #E8E3DA', borderRadius: '4px',
                    fontSize: '13px', fontWeight: '600', color: '#4A433A',
                    textDecoration: 'none',
                  }}
                >
                  Customize This Route <ArrowRight size={13} />
                </Link>

                <p style={{ fontSize: '12px', color: '#B5AA99', textAlign: 'center', marginTop: '16px' }}>
                  Or <Link to="/custom" style={{ color: '#1B6B65', fontWeight: '600' }}>build a custom trip</Link> from scratch
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
