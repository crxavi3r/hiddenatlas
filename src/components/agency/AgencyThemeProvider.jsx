import { createContext, useContext } from 'react';

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

const DEFAULTS = {
  primary:   '#1B6B65',
  accent:    '#C9A96E',
  logoUrl:   null,
  logoDarkUrl: null,
  agencyName: '',
  showPoweredBy: true,
};

const AgencyThemeContext = createContext(DEFAULTS);

export function AgencyThemeProvider({ branding, children }) {
  const primary = HEX_RE.test(branding?.primaryColor || '') ? branding.primaryColor : DEFAULTS.primary;
  const accent  = HEX_RE.test(branding?.accentColor  || '') ? branding.accentColor  : DEFAULTS.accent;

  const ctx = {
    primary,
    accent,
    logoUrl:       branding?.logoUrl       ?? null,
    logoDarkUrl:   branding?.logoDarkUrl   ?? null,
    agencyName:    branding?.agencyName    ?? '',
    showPoweredBy: branding?.showPoweredByHiddenatlas ?? true,
    website:       branding?.website       ?? null,
    supportEmail:  branding?.supportEmail  ?? null,
    phone:         branding?.phone         ?? null,
    whatsapp:      branding?.whatsapp      ?? null,
  };

  return (
    <AgencyThemeContext.Provider value={ctx}>
      <div style={{
        '--agency-primary': primary,
        '--agency-accent':  accent,
      }}>
        {children}
      </div>
    </AgencyThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAgencyTheme() {
  return useContext(AgencyThemeContext);
}
