import { useCallback, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';

function getSessionId() {
  const key = 'ha_sid';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
    sessionStorage.setItem(key, id);
  }
  return id;
}

function detectSource() {
  try {
    const params = new URLSearchParams(window.location.search);
    const utm = params.get('utm_source');
    if (utm) return utm.toLowerCase();
    const ref = document.referrer;
    if (!ref) return 'direct';
    const hostname = new URL(ref).hostname;
    if (/google/.test(hostname))          return 'google';
    if (/instagram|facebook|fb\.com/.test(hostname)) return 'instagram';
    if (/twitter|x\.com/.test(hostname))  return 'twitter';
    if (/bing/.test(hostname))            return 'bing';
    return 'referral';
  } catch {
    return 'direct';
  }
}

export function useTrack() {
  const { getToken } = useAuth();
  const sessionId = useRef(null);

  // Lazy-init sessionId (sessionStorage only available in browser)
  if (!sessionId.current) {
    try { sessionId.current = getSessionId(); } catch { sessionId.current = 'unknown'; }
  }

  const track = useCallback((eventType, payload = {}) => {
    // Fire-and-forget — never blocks the UI
    (async () => {
      try {
        let token = null;
        try { token = await getToken(); } catch { /* anonymous */ }

        fetch('/api/trips?action=track', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            eventType,
            sessionId: sessionId.current,
            source:    detectSource(),
            ...payload,
          }),
        }).catch(() => {}); // swallow network errors
      } catch { /* swallow all errors — tracking must never crash the UI */ }
    })();
  }, [getToken]);

  return { track };
}
