import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

export default function AboutPage() {
  const team = [
    {
      name: 'Margot Villeneuve',
      role: 'Founder & Head Planner',
      bio: 'Former travel editor at a Paris-based luxury magazine. Has lived in Italy, Japan, and Morocco. Believes a great trip should feel like a novel — with a beginning, a middle, and an ending that changes you.',
      img: 'https://images.unsplash.com/photo-1494790108755-2616b612b5bc?w=400&q=80',
      trips: '68 countries',
    },
    {
      name: 'Elliot Okonkwo',
      role: 'Head of Africa & Americas',
      bio: 'Lagos-born, London-based. Spent a decade working with boutique safari operators before joining HiddenAtlas. Specializes in Sub-Saharan Africa, West Africa, and Latin America.',
      img: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
      trips: '44 countries',
    },
    {
      name: 'Yuki Nakashima',
      role: 'Asia & Oceania Lead',
      bio: 'Kyoto-born travel writer and cultural advisor. Expert in Japan, Southeast Asia, and the Pacific. Runs a monthly dinner series where she cooks meals from places she has visited.',
      img: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400&q=80',
      trips: '39 countries',
    },
  ];

  const values = [
    { title: 'Depth over breadth', desc: 'We would rather send you to three places done brilliantly than six places done adequately. We design for depth of experience, not passport stamp counts.' },
    { title: 'Radical honesty', desc: 'If somewhere is over-touristed, we say so. If a famous restaurant no longer lives up to its reputation, we tell you. We don\'t publish content we can\'t stand behind.' },
    { title: 'Independence always', desc: 'We accept no sponsored placements, free stays in exchange for coverage, or affiliate commissions that influence our picks. Our only incentive is your trip being extraordinary.' },
    { title: 'Local is the point', desc: 'Every itinerary prioritizes locally-owned properties, restaurants, and experiences. We measure success by how much money stays in the communities you visit.' },
  ];

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>

      {/* Hero */}
      <section style={{ padding: 'clamp(64px, 10vw, 140px) 24px', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '80px', alignItems: 'center' }}>
            <div>
              <span style={{
                fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase',
                color: '#1B6B65', display: 'block', marginBottom: '20px',
              }}>
                Our Story
              </span>
              <h1 style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: 'clamp(36px, 5vw, 56px)',
                fontWeight: '600', color: '#1C1A16',
                lineHeight: '1.15', letterSpacing: '-0.5px', marginBottom: '24px',
              }}>
                We built the planning resource we always wished existed.
              </h1>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8', marginBottom: '20px' }}>
                HiddenAtlas was born out of frustration. We were experienced travelers — people who had visited dozens of countries — and we still found trip planning exhausting, unreliable, and full of noise.
              </p>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8', marginBottom: '20px' }}>
                Generic listicles. Sponsored hotel picks. Itineraries written by people who hadn't left their desks. We knew there had to be a better way — something that felt like getting advice from a brilliant, well-traveled friend.
              </p>
              <p style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.8' }}>
                So in 2022, we started HiddenAtlas. Every itinerary is written by someone who has been there. Every recommendation is made because it's genuinely the best option, full stop.
              </p>
            </div>
            <div>
              <img
                src="https://images.unsplash.com/photo-1551632811-561732d1e306?w=700&q=80"
                alt="Travel planning"
                style={{
                  width: '100%', height: '560px',
                  objectFit: 'cover', borderRadius: '8px',
                  boxShadow: '0 24px 80px rgba(28,26,22,0.15)',
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Numbers */}
      <section style={{ background: '#1B6B65', padding: 'clamp(48px, 6vw, 80px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '40px', textAlign: 'center' }}>
            {[
              { number: '1,200+', label: 'Travelers served' },
              { number: '48', label: 'Countries covered' },
              { number: '86', label: 'Itineraries in library' },
              { number: '4.9 / 5', label: 'Average rating' },
            ].map((stat, i) => (
              <div key={i}>
                <div style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: 'clamp(36px, 5vw, 52px)',
                  fontWeight: '600', color: 'white', marginBottom: '8px',
                }}>
                  {stat.number}
                </div>
                <p style={{ fontSize: '14px', color: 'rgba(255,255,255,0.65)', letterSpacing: '0.5px' }}>
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '12px' }}>
              How We Work
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: '600', color: '#1C1A16' }}>
              Principles we don't compromise on.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '32px' }}>
            {values.map((v, i) => (
              <div key={i} style={{ padding: '32px', background: 'white', border: '1px solid #E8E3DA', borderRadius: '8px' }}>
                <div style={{
                  width: '32px', height: '3px', background: '#C9A96E', borderRadius: '2px', marginBottom: '20px',
                }} />
                <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
                  {v.title}
                </h3>
                <p style={{ fontSize: '15px', color: '#6B6156', lineHeight: '1.7' }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section style={{ padding: 'clamp(48px, 6vw, 80px) 24px', background: '#F4F1EC' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: '56px' }}>
            <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '12px' }}>
              Who We Are
            </span>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: '600', color: '#1C1A16' }}>
              People who travel because they can't not.
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '32px' }}>
            {team.map((member, i) => (
              <div key={i} style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', border: '1px solid #E8E3DA' }}>
                <img
                  src={member.img} alt={member.name}
                  style={{ width: '100%', height: '260px', objectFit: 'cover', objectPosition: 'top' }}
                />
                <div style={{ padding: '24px' }}>
                  <p style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '4px' }}>
                    {member.trips}
                  </p>
                  <h3 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '20px', fontWeight: '600', color: '#1C1A16', marginBottom: '2px' }}>
                    {member.name}
                  </h3>
                  <p style={{ fontSize: '13px', color: '#C9A96E', fontWeight: '500', marginBottom: '14px' }}>{member.role}</p>
                  <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.65' }}>{member.bio}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: 'clamp(64px, 8vw, 100px) 24px', textAlign: 'center' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto' }}>
          <h2 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(28px, 4vw, 44px)',
            fontWeight: '600', color: '#1C1A16', marginBottom: '16px',
          }}>
            Ready to plan something remarkable?
          </h2>
          <p style={{ fontSize: '16px', color: '#6B6156', lineHeight: '1.7', marginBottom: '32px' }}>
            Browse our itinerary library or get in touch to build something entirely bespoke.
          </p>
          <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link
              to="/itineraries"
              style={{
                padding: '14px 28px', background: '#1B6B65', color: 'white',
                borderRadius: '4px', fontSize: '14px', fontWeight: '600',
                letterSpacing: '0.5px', textTransform: 'uppercase',
                textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              Browse Itineraries <ArrowRight size={14} />
            </Link>
            <Link
              to="/custom"
              style={{
                padding: '14px 28px', background: 'transparent', color: '#1C1A16',
                border: '1px solid #D4CCBF', borderRadius: '4px',
                fontSize: '14px', fontWeight: '600',
                letterSpacing: '0.5px', textTransform: 'uppercase',
                textDecoration: 'none',
              }}
            >
              Plan My Trip
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
