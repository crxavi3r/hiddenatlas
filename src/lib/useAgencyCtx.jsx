import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from '@clerk/clerk-react';

const DEFAULT = {
  agencyId:    null,
  agencyName:  null,
  agencySlug:  null,
  memberId:    null,
  role:        null,
  loading:     true,
  memberships: [],
  setAgencyId: () => {},
  refetch:     () => {},
};

const AgencyCtx = createContext(DEFAULT);

export function AgencyCtxProvider({ children }) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [memberships, setMemberships]   = useState([]);
  const [agencyId,    setAgencyIdState] = useState(null);
  const [loading,     setLoading]       = useState(true);

  const fetchMemberships = useCallback(async () => {
    if (!isSignedIn) { setLoading(false); return; }
    try {
      const token = await getToken();
      if (!token) { setLoading(false); return; }
      const res = await fetch('/api/agency?action=memberships', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { setLoading(false); return; }
      const data = await res.json();
      const list = data.memberships || [];
      setMemberships(list);

      // Restore previously selected agency from sessionStorage
      const stored = typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem('ha_agency_id')
        : null;
      const found = stored ? list.find(m => m.agencyId === stored) : null;
      const resolved = found ? stored : (list[0]?.agencyId ?? null);
      setAgencyIdState(resolved);
    } catch {
      // silently fail — no agency access is a valid state
    } finally {
      setLoading(false);
    }
  }, [isSignedIn, getToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isLoaded) return;
    fetchMemberships();
  }, [isLoaded, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAgencyId = useCallback((id) => {
    setAgencyIdState(id);
    if (typeof sessionStorage !== 'undefined') {
      if (id) sessionStorage.setItem('ha_agency_id', id);
      else sessionStorage.removeItem('ha_agency_id');
    }
  }, []);

  const active = memberships.find(m => m.agencyId === agencyId) ?? null;

  return (
    <AgencyCtx.Provider value={{
      agencyId,
      agencyName:  active?.agencyName  ?? null,
      agencySlug:  active?.agencySlug  ?? null,
      memberId:    active?.memberId    ?? null,
      role:        active?.role        ?? null,
      loading,
      memberships,
      setAgencyId,
      refetch: fetchMemberships,
    }}>
      {children}
    </AgencyCtx.Provider>
  );
}

export function useAgencyCtx() {
  return useContext(AgencyCtx);
}
