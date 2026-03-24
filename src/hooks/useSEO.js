/**
 * useSEO — lightweight head-tag manager for HiddenAtlas SPA.
 *
 * Mutates document.title and <head> meta/link/script tags on mount,
 * and restores defaults on unmount so each page gets a clean slate.
 *
 * No external dependencies (no react-helmet).
 */
import { useEffect } from 'react';

const SITE_NAME = 'HiddenAtlas';
const DEFAULT_TITLE = 'HiddenAtlas — Curated Luxury Travel Itineraries';
const DEFAULT_DESCRIPTION =
  'Expert-crafted travel itineraries for discerning travelers. Boutique stays, hidden routes, real local knowledge. No tourist traps, no guesswork.';
const DEFAULT_OG_IMAGE = '/assets/logo-hiddenatlas.svg';

/** Create or update a <meta> tag matched by a CSS attribute selector. */
function upsertMeta(selector, value) {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    // Parse e.g. `meta[name="robots"]` → set name="robots"
    const m = selector.match(/\[([\w:]+)="([^"]+)"\]/);
    if (m) el.setAttribute(m[1], m[2]);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

/**
 * @param {object} opts
 * @param {string}   [opts.title]       — page title (appended with "| HiddenAtlas")
 * @param {string}   [opts.description] — meta description
 * @param {string}   [opts.canonical]   — absolute canonical URL
 * @param {string}   [opts.ogImage]     — absolute or relative image URL for OG/Twitter
 * @param {boolean}  [opts.noindex]     — emit noindex,follow robots directive
 * @param {object[]} [opts.schemas]     — array of JSON-LD schema objects
 */
export function useSEO({
  title,
  description,
  canonical,
  ogImage,
  noindex = false,
  schemas = [],
} = {}) {
  // Stable key so useEffect only re-runs when schemas actually change
  const schemaKey = JSON.stringify(schemas);

  useEffect(() => {
    // ── <title> ──────────────────────────────────────────────────────────────
    document.title = title ? `${title} | ${SITE_NAME}` : DEFAULT_TITLE;

    // ── Meta description ─────────────────────────────────────────────────────
    upsertMeta('meta[name="description"]', description || DEFAULT_DESCRIPTION);

    // ── Robots ───────────────────────────────────────────────────────────────
    upsertMeta('meta[name="robots"]', noindex ? 'noindex, follow' : 'index, follow');

    // ── Open Graph ───────────────────────────────────────────────────────────
    upsertMeta('meta[property="og:title"]', title || DEFAULT_TITLE);
    upsertMeta('meta[property="og:description"]', description || DEFAULT_DESCRIPTION);
    upsertMeta('meta[property="og:image"]', ogImage || DEFAULT_OG_IMAGE);
    if (canonical) {
      upsertMeta('meta[property="og:url"]', canonical);
    }

    // ── Twitter / X Card ─────────────────────────────────────────────────────
    upsertMeta('meta[name="twitter:title"]', title || DEFAULT_TITLE);
    upsertMeta('meta[name="twitter:description"]', description || DEFAULT_DESCRIPTION);
    upsertMeta('meta[name="twitter:image"]', ogImage || DEFAULT_OG_IMAGE);
    // Use large-image card when we have a real photo; summary for logo-only
    upsertMeta(
      'meta[name="twitter:card"]',
      ogImage && ogImage !== DEFAULT_OG_IMAGE ? 'summary_large_image' : 'summary',
    );

    // ── Canonical <link> ─────────────────────────────────────────────────────
    let canonicalEl = document.querySelector('link[rel="canonical"]');
    if (canonical) {
      if (!canonicalEl) {
        canonicalEl = document.createElement('link');
        canonicalEl.rel = 'canonical';
        document.head.appendChild(canonicalEl);
      }
      canonicalEl.href = canonical;
    } else if (canonicalEl) {
      canonicalEl.remove();
    }

    // ── JSON-LD structured data ───────────────────────────────────────────────
    // Remove any schemas injected by a previous page
    document.querySelectorAll('script[data-ha-schema]').forEach(el => el.remove());
    schemas.forEach((schema, i) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-ha-schema', String(i));
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    });

    // ── Cleanup: restore index.html defaults on unmount ───────────────────────
    return () => {
      document.title = DEFAULT_TITLE;
      upsertMeta('meta[name="description"]', DEFAULT_DESCRIPTION);
      upsertMeta('meta[property="og:title"]', DEFAULT_TITLE);
      upsertMeta('meta[property="og:description"]', DEFAULT_DESCRIPTION);
      upsertMeta('meta[property="og:image"]', DEFAULT_OG_IMAGE);
      upsertMeta('meta[name="twitter:title"]', DEFAULT_TITLE);
      upsertMeta('meta[name="twitter:description"]', DEFAULT_DESCRIPTION);
      upsertMeta('meta[name="twitter:image"]', DEFAULT_OG_IMAGE);
      upsertMeta('meta[name="twitter:card"]', 'summary');

      const robotsEl = document.querySelector('meta[name="robots"]');
      if (robotsEl) robotsEl.remove();

      const ogUrlEl = document.querySelector('meta[property="og:url"]');
      if (ogUrlEl) ogUrlEl.remove();

      const cl = document.querySelector('link[rel="canonical"]');
      if (cl) cl.remove();

      document.querySelectorAll('script[data-ha-schema]').forEach(el => el.remove());
    };
  }, [title, description, canonical, ogImage, noindex, schemaKey]); // eslint-disable-line react-hooks/exhaustive-deps
}
