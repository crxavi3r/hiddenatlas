import { Component } from 'react';
import { Link } from 'react-router-dom';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 24px', fontFamily: "'Inter', system-ui, sans-serif",
        }}>
          <div style={{ maxWidth: '400px', textAlign: 'center' }}>
            <p style={{ fontSize: '13px', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', color: '#1B6B65', marginBottom: '16px' }}>
              Something went wrong
            </p>
            <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: '26px', fontWeight: '600', color: '#1C1A16', marginBottom: '12px' }}>
              This page couldn't load.
            </h2>
            <p style={{ fontSize: '14px', color: '#6B6156', lineHeight: '1.7', marginBottom: '28px' }}>
              An unexpected error occurred. Try refreshing the page, or return home.
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
              <button
                onClick={() => window.location.reload()}
                style={{
                  padding: '11px 22px', background: '#1B6B65', color: 'white',
                  border: 'none', borderRadius: '4px', fontSize: '13px', fontWeight: '600',
                  letterSpacing: '0.4px', textTransform: 'uppercase', cursor: 'pointer',
                }}
              >
                Refresh
              </button>
              <Link
                to="/"
                style={{
                  padding: '11px 22px', background: 'transparent', color: '#1C1A16',
                  border: '1px solid #D4CCBF', borderRadius: '4px', fontSize: '13px', fontWeight: '600',
                  letterSpacing: '0.4px', textTransform: 'uppercase', textDecoration: 'none',
                }}
              >
                Go home
              </Link>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
