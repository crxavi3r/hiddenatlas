// Shared fetch wrapper — automatically attaches the Clerk JWT
// when one is available. Import and use instead of raw fetch().
//
// Usage:
//   const api = useApi();
//   const data = await api.get('/api/my-trips');
//   const result = await api.post('/api/itineraries/bali/purchase', { amount: 29 });

import { useAuth } from '@clerk/clerk-react';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function useApi() {
  const { getToken } = useAuth();

  async function request(path, options = {}) {
    const token = await getToken();
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
    return res;
  }

  return {
    get:  (path)         => request(path, { method: 'GET' }),
    post: (path, body)   => request(path, { method: 'POST', body: JSON.stringify(body) }),
  };
}
