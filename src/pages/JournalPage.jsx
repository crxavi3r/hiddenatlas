import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Clock, Calendar } from 'lucide-react';
import { journalPosts } from '../data/itineraries';
import { useSEO } from '../hooks/useSEO';

const allPosts = [
  ...journalPosts,
  {
    id: 'portugal-hidden-coastline',
    title: 'The Portuguese Coastline Nobody Talks About',
    category: 'Destination Guides',
    date: 'November 2024',
    readTime: '9 min read',
    image: 'https://images.unsplash.com/photo-1555881400-74d7acaacd8b?w=600&q=80',
    excerpt: 'While everyone fights for a sunbed in the Algarve, the Costa Vicentina remains wild, wind-swept, and almost entirely tourist-free.',
  },
  {
    id: 'morocco-without-marrakech',
    title: 'Morocco Without Marrakech: The Case for Going Deeper',
    category: 'Destination Guides',
    date: 'October 2024',
    readTime: '10 min read',
    image: 'https://images.unsplash.com/photo-1489749798305-4fea3ae63d43?w=600&q=80',
    excerpt: 'Fes is more authentic. The Draa Valley is more beautiful. And you won\'t have to fight anyone for a table. Here\'s the argument.',
  },
  {
    id: 'solo-travel-safety',
    title: 'A Realistic Guide to Solo Travel in 2025',
    category: 'Travel Planning',
    date: 'September 2024',
    readTime: '11 min read',
    image: 'https://images.unsplash.com/photo-1501554728187-ce583db33af7?w=600&q=80',
    excerpt: 'Not a listicle. A genuine, field-tested breakdown of what solo travel actually looks like in the places you want to go.',
  },
];

function PostCard({ post, featured = false }) {
  const [hovered, setHovered] = useState(false);

  if (featured) {
    return (
      <Link
        to={`/journal/${post.id}`}
        style={{ textDecoration: 'none', display: 'block' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <div style={{
          borderRadius: '10px', overflow: 'hidden', background: 'white',
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          boxShadow: hovered ? '0 20px 60px rgba(28,26,22,0.12)' : '0 4px 24px rgba(28,26,22,0.07)',
          transition: 'box-shadow 0.3s',
        }}>
          <div style={{ position: 'relative', overflow: 'hidden', minHeight: '360px' }}>
            <img
              src={post.image} alt={post.title}
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                position: 'absolute', inset: 0,
                transform: hovered ? 'scale(1.04)' : 'scale(1)',
                transition: 'transform 0.5s',
              }}
            />
          </div>
          <div style={{ padding: '48px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65' }}>
                {post.category}
              </span>
              <span style={{ fontSize: '11px', color: '#B5AA99' }}>· {post.readTime}</span>
            </div>
            <h2 style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: '28px', fontWeight: '600', color: '#1C1A16',
              lineHeight: '1.35', marginBottom: '16px',
            }}>
              {post.title}
            </h2>
            <p style={{ fontSize: '16px', color: '#6B6156', lineHeight: '1.7', marginBottom: '28px' }}>
              {post.excerpt}
            </p>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              fontSize: '13px', fontWeight: '700',
              color: hovered ? '#1B6B65' : '#4A433A',
              transition: 'color 0.2s', letterSpacing: '0.3px',
              textTransform: 'uppercase',
            }}>
              Read Article <ArrowRight size={13} />
            </div>
          </div>
        </div>
      </Link>
    );
  }

  return (
    <Link
      to={`/journal/${post.id}`}
      style={{ textDecoration: 'none', display: 'block' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{
        borderRadius: '8px', overflow: 'hidden', background: 'white',
        boxShadow: hovered ? '0 16px 50px rgba(28,26,22,0.10)' : '0 2px 16px rgba(28,26,22,0.05)',
        transition: 'box-shadow 0.3s, transform 0.3s',
        transform: hovered ? 'translateY(-4px)' : 'none',
      }}>
        <div style={{ position: 'relative', paddingTop: '60%', overflow: 'hidden' }}>
          <img
            src={post.image} alt={post.title}
            style={{
              position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
              objectFit: 'cover',
              transform: hovered ? 'scale(1.04)' : 'scale(1)',
              transition: 'transform 0.5s',
            }}
          />
        </div>
        <div style={{ padding: '24px' }}>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65' }}>
              {post.category}
            </span>
            <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: '#D4CCBF', flexShrink: 0 }} />
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: '#B5AA99' }}>
              <Clock size={11} /> {post.readTime}
            </span>
          </div>
          <h3 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '19px', fontWeight: '600', color: '#1C1A16',
            lineHeight: '1.4', marginBottom: '10px',
          }}>
            {post.title}
          </h3>
          <p style={{ fontSize: '14px', color: '#8C8070', lineHeight: '1.6' }}>{post.excerpt}</p>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            marginTop: '20px', fontSize: '13px', fontWeight: '600',
            color: hovered ? '#1B6B65' : '#8C8070', transition: 'color 0.2s',
          }}>
            Read more <ArrowRight size={13} />
          </div>
        </div>
      </div>
    </Link>
  );
}

export function JournalListPage() {
  const categories = ['All', 'Destination Guides', 'Stay Guides', 'Travel Planning'];
  const [active, setActive] = useState('All');

  const filtered = active === 'All' ? allPosts : allPosts.filter(p => p.category === active);

  useSEO({
    title: 'Travel Journal — Destination Guides & Planning Advice',
    description: 'Honest destination guides, stay recommendations, and practical travel advice from HiddenAtlas. Written by people who have actually been there.',
    canonical: 'https://hiddenatlas.travel/journal',
  });

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>
      <section style={{ padding: 'clamp(48px, 8vw, 100px) 24px', background: '#F4F1EC', textAlign: 'center' }}>
        <div style={{ maxWidth: '600px', margin: '0 auto' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '16px' }}>
            The Journal
          </span>
          <h1 style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: 'clamp(32px, 5vw, 52px)',
            fontWeight: '600', color: '#1C1A16', lineHeight: '1.2',
            letterSpacing: '-0.5px', marginBottom: '20px',
          }}>
            Travel writing worth reading.
          </h1>
          <p style={{ fontSize: '17px', color: '#6B6156', lineHeight: '1.7' }}>
            Honest advice, destination deep dives, and practical guides from people who've actually been there.
          </p>
        </div>
      </section>

      {/* Category tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #E8E3DA', padding: '0 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto', display: 'flex', gap: '0', overflowX: 'auto' }}>
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setActive(cat)}
              style={{
                padding: '16px 20px',
                background: 'none', border: 'none', cursor: 'pointer',
                fontSize: '14px', fontWeight: '500',
                color: active === cat ? '#1B6B65' : '#6B6156',
                borderBottom: active === cat ? '2px solid #1B6B65' : '2px solid transparent',
                whiteSpace: 'nowrap',
                transition: 'color 0.2s',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <section style={{ padding: 'clamp(40px, 5vw, 80px) 24px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          {/* Featured */}
          {active === 'All' && (
            <div style={{ marginBottom: '48px' }}>
              <PostCard post={filtered[0]} featured />
            </div>
          )}

          {/* Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '28px' }}>
            {(active === 'All' ? filtered.slice(1) : filtered).map(post => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export function JournalPostPage() {
  const { id } = useParams();
  const post = allPosts.find(p => p.id === id);

  useSEO({
    title: post ? post.title : null,
    description: post ? post.excerpt : null,
    canonical: post ? `https://hiddenatlas.travel/journal/${post.id}` : null,
    ogImage: post ? post.image : null,
  });

  if (!post) {
    return (
      <div style={{ padding: '120px 24px', textAlign: 'center', paddingTop: '100px' }}>
        <h1 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '32px', marginBottom: '16px' }}>Article not found</h1>
        <Link to="/journal" style={{ color: '#1B6B65', fontWeight: '600' }}>← Back to Journal</Link>
      </div>
    );
  }

  return (
    <div style={{ background: '#FAFAF8', paddingTop: '72px' }}>
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '60px 24px' }}>
        <Link to="/journal" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#8C8070', marginBottom: '40px', fontWeight: '500' }}>
          ← Back to Journal
        </Link>

        <span style={{ fontSize: '11px', fontWeight: '600', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#1B6B65', display: 'block', marginBottom: '16px' }}>
          {post.category}
        </span>
        <h1 style={{
          fontFamily: "'Playfair Display', Georgia, serif",
          fontSize: 'clamp(28px, 5vw, 48px)',
          fontWeight: '600', color: '#1C1A16',
          lineHeight: '1.2', letterSpacing: '-0.5px', marginBottom: '16px',
        }}>
          {post.title}
        </h1>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '36px', color: '#8C8070', fontSize: '13px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Calendar size={13} />{post.date}</span>
          <span>·</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}><Clock size={13} />{post.readTime}</span>
        </div>

        <img
          src={post.image} alt={post.title}
          style={{ width: '100%', height: '420px', objectFit: 'cover', borderRadius: '8px', marginBottom: '48px' }}
        />

        {/* Article body — placeholder content */}
        <div style={{ fontSize: '17px', color: '#4A433A', lineHeight: '1.85' }}>
          <p style={{ marginBottom: '24px' }}>
            {post.excerpt} The places worth visiting are rarely the ones with the longest queues or the most Instagram tags. They're the ones you find when you look just slightly past the obvious.
          </p>
          <p style={{ marginBottom: '24px' }}>
            After years of researching and traveling through some of the world's most compelling destinations, we've learned that the best experiences share a common thread: they require a little more intention, a little more curiosity, and usually a willingness to leave the main road.
          </p>
          <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '28px', fontWeight: '600', color: '#1C1A16', margin: '40px 0 16px' }}>
            What we found
          </h2>
          <p style={{ marginBottom: '24px' }}>
            The research for this guide began eighteen months ago, when one of our planners spent three weeks traveling through the region without a fixed itinerary, following recommendations from locals, doubling back to revisit places that deserved more time, and deliberately avoiding the sites most featured in guidebooks.
          </p>
          <p style={{ marginBottom: '24px' }}>
            What emerged was a picture of a place far more interesting, more layered, and more accessible than its reputation suggests. Here is what we learned, and what we think you should know before you go.
          </p>

          <div style={{
            background: '#EFF6F5', border: '1px solid #A8D5D1',
            borderLeft: '3px solid #1B6B65',
            padding: '24px 28px', borderRadius: '4px', margin: '36px 0',
          }}>
            <p style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '19px', color: '#0E3D39', fontStyle: 'italic', lineHeight: '1.6' }}>
              "The best trips aren't the ones you plan perfectly. They're the ones you plan just enough, then let breathe."
            </p>
            <p style={{ fontSize: '13px', color: '#1B6B65', marginTop: '12px', fontWeight: '600' }}>HiddenAtlas</p>
          </div>

          <p style={{ marginBottom: '24px' }}>
            The full route is detailed in our premium itinerary, including specific accommodation recommendations, restaurant lists, and transport logistics. If you have questions about this destination or want help planning your own trip, our custom planning service is designed exactly for this.
          </p>
        </div>

        {/* CTA */}
        <div style={{
          borderTop: '1px solid #E8E3DA',
          paddingTop: '40px', marginTop: '48px',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', flexWrap: 'wrap', gap: '20px',
        }}>
          <div>
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#1C1A16', marginBottom: '4px' }}>Ready to plan this trip?</p>
            <p style={{ fontSize: '13px', color: '#8C8070' }}>Download the full itinerary or get custom planning help.</p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Link
              to="/itineraries"
              style={{
                padding: '12px 22px', background: '#1B6B65', color: 'white',
                borderRadius: '4px', fontSize: '13px', fontWeight: '600',
                letterSpacing: '0.3px', textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              Browse Itineraries <ArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
