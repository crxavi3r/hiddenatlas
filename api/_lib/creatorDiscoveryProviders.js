/**
 * Creator Discovery Provider Abstraction
 *
 * Provider priority (first configured wins):
 *   tavily_claude  — Tavily web search + Claude for extraction/scoring  (TAVILY_API_KEY + ANTHROPIC_API_KEY)
 *   claude         — Claude from training knowledge                      (ANTHROPIC_API_KEY)
 *   perplexity     — Perplexity online search                           (PERPLEXITY_API_KEY)
 *
 * Add env vars to .env and to Vercel project settings.
 * Never hardcode keys here.
 */

const MODEL                  = 'claude-sonnet-4-6';
const ANTHROPIC_URL          = 'https://api.anthropic.com/v1/messages';
const TAVILY_URL             = 'https://api.tavily.com/search';
const PERPLEXITY_URL         = 'https://api.perplexity.ai/chat/completions';
const AI_DISCOVERY_TIMEOUT_MS = Number(process.env.AI_DISCOVERY_TIMEOUT_MS || 270_000); // 270s — Vercel Pro limit is 5min

// ── Provider detection ────────────────────────────────────────────────────────

export function detectProvider() {
  if (process.env.TAVILY_API_KEY && process.env.ANTHROPIC_API_KEY) return 'tavily_claude';
  if (process.env.ANTHROPIC_API_KEY)  return 'claude';
  if (process.env.PERPLEXITY_API_KEY) return 'perplexity';
  return null;
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runAiDiscovery(criteria) {
  const provider = detectProvider();

  if (!provider) {
    const err = new Error(
      'AI Search provider is not configured. ' +
      'Add ANTHROPIC_API_KEY to your environment to enable AI Search. ' +
      'Optionally add TAVILY_API_KEY for web-augmented search.'
    );
    err.status = 503;
    err.code   = 'PROVIDER_NOT_CONFIGURED';
    throw err;
  }

  try {
    if (provider === 'tavily_claude') return await runTavilyClaudeDiscovery(criteria);
    if (provider === 'claude')        return await runClaudeDiscovery(criteria);
    if (provider === 'perplexity')    return await runPerplexityDiscovery(criteria);
  } catch (err) {
    if (err.status === 503) throw err; // provider config errors bubble up as-is
    const wrapped = new Error(`AI discovery failed (${provider}): ${err.message}`);
    wrapped.status = 500;
    wrapped.code   = 'PROVIDER_ERROR';
    throw wrapped;
  }
}

// ── Anthropic helper ──────────────────────────────────────────────────────────

async function callAnthropic(systemPrompt, userPrompt) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_DISCOVERY_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: {
        'x-api-key':         process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type':      'application/json',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 4096,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.content?.[0]?.text ?? '';
}

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildCreatorPrompt(criteria, webContext = '') {
  const {
    creatorProfile, destinationTheme, creatorCountry, language, niche,
    minFollowers, maxFollowers, targetCount = 20, notes,
  } = criteria;
  const limit = Math.min(Number(targetCount) || 20, 50);

  const filters = [
    creatorCountry   && `Country: ${creatorCountry}`,
    language         && `Language: ${language}`,
    niche            && `Niche/category: ${niche}`,
    (minFollowers || maxFollowers) && `Followers: ${minFollowers ? Number(minFollowers).toLocaleString() : 'any'} to ${maxFollowers ? Number(maxFollowers).toLocaleString() : 'any'}`,
    destinationTheme && `Destination/theme context: ${destinationTheme}`,
    notes            && `Notes: ${notes}`,
  ].filter(Boolean).join('\n');

  return `You are a talent scout for HiddenAtlas, a travel itinerary platform partnering with Travel Designers and Creators.

CREATOR PROFILE BRIEF:
${creatorProfile}
${filters ? `\nFILTERS:\n${filters}` : ''}
${webContext ? `\nWEB CONTEXT:\n${webContext.slice(0, 4000)}` : ''}

INCLUDE: individual travel creators, itinerary planners, destination bloggers, authentic travel storytellers.
EXCLUDE: agencies, tour operators, hotels, meme pages, generic repost accounts, brand pages, aggregators.

STRICT RULES — follow exactly:
1. Only include Instagram handles you are highly confident actually exist as real accounts.
2. Never invent or guess usernames. If uncertain whether an account exists, skip it.
3. Set followerCount to null — never estimate or invent follower numbers.
4. Prefer real individual people over aggregator or repost pages.
5. Return fewer profiles if you cannot find enough real matches — quality over quantity.

Find up to ${limit} real Instagram accounts matching the brief above.

IMPORTANT: Return ONLY valid JSON, no markdown, no explanation, no code blocks.
Output this exact structure:
{"profiles":[{"username":"real_handle_no_at","displayName":"Full Name","followerCount":null,"bio":"known bio or null","country":"PT","language":"pt","category":"luxury travel","score":75,"fitSummary":"One sentence why this creator fits the brief.","confidence":"high"}]}

Fields:
score: 0-100 (80+ = perfect fit, 60-79 = strong, 40-59 = possible)
confidence: "high" = certain account exists / "medium" = likely exists / "low" = uncertain, prefer to skip
username: real Instagram handle without @, lowercase, no spaces
followerCount: always null — never invent or estimate numbers`;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseCreatorProfiles(text) {
  let s = text.trim();
  // Strip markdown fences
  s = s.replace(/^```(?:json)?\s*/im, '').replace(/\s*```\s*$/im, '').trim();

  // Try direct parse first
  try {
    const parsed = JSON.parse(s);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const arr = parsed.profiles || parsed.results || parsed.creators || parsed.data;
      if (Array.isArray(arr)) return arr;
    }
    if (Array.isArray(parsed)) return parsed;
  } catch (_) {}

  // Extract first JSON object {...}
  const objStart = s.indexOf('{');
  const objEnd   = s.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1) {
    try {
      const parsed = JSON.parse(s.slice(objStart, objEnd + 1));
      const arr = parsed.profiles || parsed.results || parsed.creators || parsed.data;
      if (Array.isArray(arr)) return arr;
    } catch (_) {}
  }

  // Fallback: extract first [...] array
  const arrStart = s.indexOf('[');
  const arrEnd   = s.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1) {
    try {
      return JSON.parse(s.slice(arrStart, arrEnd + 1));
    } catch (_) {}
  }

  throw new Error(`Could not parse AI response as JSON. Response starts with: ${s.slice(0, 200)}`);
}

// Try to rescue individual profile objects from partially-valid JSON text
function tryExtractPartialProfiles(text) {
  const results = [];
  // Match individual {...} objects that contain a "username" field
  const re = /\{[^{}]*?"username"\s*:\s*"([^"]{2,})"[^{}]*?\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    try {
      const obj = JSON.parse(m[0]);
      if (obj.username) results.push(obj);
    } catch {}
  }
  return results;
}

// ── Normalizer helpers ────────────────────────────────────────────────────────

function safeInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

function safeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace('%', '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function clampScore(value) {
  const n = safeInteger(value);
  if (n === null) return null;
  return Math.max(0, Math.min(100, n));
}

function extractInstagramUsername(url) {
  try {
    const u = new URL(url);
    if (!u.hostname.includes('instagram.com')) return null;
    return u.pathname.split('/').filter(Boolean)[0] || null;
  } catch { return null; }
}

// ── Username / profile normalizer ─────────────────────────────────────────────

export function normalizeAiProfile(raw) {
  // Extract username from any common field name
  let username = raw.username || raw.handle || raw.instagramHandle ||
                 raw.instagramUsername || raw.account || '';

  // If username is missing but profileUrl is present, extract from URL
  if (!username && raw.profileUrl) {
    username = extractInstagramUsername(raw.profileUrl) || '';
  }

  if (!username || typeof username !== 'string') {
    return { ok: false, reason: 'missing_username', raw };
  }

  username = username.trim()
    .replace(/^@/, '')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '')
    .split('/')[0].split('?')[0]
    .toLowerCase();

  if (!username) return { ok: false, reason: 'empty_username_after_normalize', raw };

  const platform   = raw.platform || 'instagram';
  const profileUrl = raw.profileUrl || raw.url || raw.instagramUrl ||
                     (platform === 'instagram' ? `https://www.instagram.com/${username}/` : null);

  return {
    ok: true,
    data: {
      platform,
      username,
      displayName:   raw.displayName || raw.fullName || raw.name || username,
      profileUrl,
      avatarUrl:     null, // AI cannot provide verified avatar
      // Metrics are NEVER taken from AI — only from real provider (Meta API, etc.)
      followersCount: null,
      postsCount:     null,
      engagementRate: null,
      bio:           raw.bio || raw.description || null,
      country:       raw.country   || null,
      language:      raw.language  || null,
      category:      raw.category  || raw.niche || null,
      score:         clampScore(raw.score),
      fitSummary:    raw.fitSummary || raw.fit || raw.reason || null,
      routeIdeas:    Array.isArray(raw.routeIdeas) ? raw.routeIdeas : [],
      rawData: {
        source: 'ai_suggestion',
        verificationStatus: 'unverified',
        needsManualVerification: true,
        confidence: raw.confidence || raw.confidenceLevel || 'medium',
        providerRaw: raw,
      },
    },
  };
}

// ── Provider: Claude (knowledge-only) ────────────────────────────────────────

async function runClaudeDiscovery(criteria) {
  console.log('[discovery:claude] criteria:', JSON.stringify({
    creatorProfile: (criteria.creatorProfile || '').slice(0, 80),
    destinationTheme: criteria.destinationTheme || null,
    creatorCountry: criteria.creatorCountry || null,
    language: criteria.language || null,
    niche: criteria.niche || null,
    minFollowers: criteria.minFollowers || null,
    maxFollowers: criteria.maxFollowers || null,
    targetCount: criteria.targetCount,
  }));

  const text = await callAnthropic(
    'You are a talent acquisition assistant for HiddenAtlas. Respond with valid JSON only, exactly as instructed. No markdown, no explanation.',
    buildCreatorPrompt(criteria),
  );

  console.log(`[discovery:claude] raw response length: ${text.length}, first 500 chars: ${text.slice(0, 500)}`);

  let rawProfiles;
  let parseError = null;
  try {
    rawProfiles = parseCreatorProfiles(text);
  } catch (parseErr) {
    parseError = parseErr.message;
    console.warn('[discovery:claude] JSON parse failed:', parseErr.message);
    rawProfiles = tryExtractPartialProfiles(text);
    if (rawProfiles.length > 0) {
      console.log(`[discovery:claude] partial extraction rescued ${rawProfiles.length} profile(s)`);
    } else {
      console.error('[discovery:claude] complete parse failure — returning empty. Raw preview:', text.slice(0, 300));
      return {
        creators: [],
        provider: 'claude',
        providerMeta: { model: MODEL, contextSource: 'ai_knowledge', parseError, rawPreview: text.slice(0, 300) },
      };
    }
  }

  if (!Array.isArray(rawProfiles)) {
    return {
      creators: [],
      provider: 'claude',
      providerMeta: { model: MODEL, contextSource: 'ai_knowledge', parseError: 'Parsed value was not an array' },
    };
  }

  const normalized = rawProfiles.map(normalizeAiProfile);
  const creators   = normalized.filter(r => r.ok).map(r => r.data);
  const skipped    = normalized.filter(r => !r.ok);
  console.log(`[discovery:claude] parsed ${rawProfiles.length} raw, normalized ${creators.length} valid, skipped ${skipped.length}`, skipped.map(s => s.reason));

  return {
    creators,
    provider: 'claude',
    providerMeta: { model: MODEL, contextSource: 'ai_knowledge', ...(parseError ? { parseError } : {}) },
  };
}

// ── Provider: Tavily + Claude ─────────────────────────────────────────────────

async function runTavilyClaudeDiscovery(criteria) {
  const { creatorProfile, destinationTheme, creatorCountry, niche, language } = criteria;
  const searchContext = destinationTheme || creatorProfile?.slice(0, 60) || '';
  const queries = [
    `Instagram travel creators ${searchContext} ${niche || ''} ${language ? language + ' language' : ''} micro influencer blog`,
    `best Instagram travel designers ${searchContext} ${creatorCountry ? `from ${creatorCountry}` : ''} curated itinerary guide`,
  ];

  let webContext = '';
  for (const q of queries) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 10_000);
      let r;
      try {
        r = await fetch(TAVILY_URL, {
          method:  'POST',
          signal:  ctrl.signal,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            api_key:      process.env.TAVILY_API_KEY,
            query:        q,
            search_depth: 'basic',
            max_results:  5,
            include_answer: true,
          }),
        });
      } finally {
        clearTimeout(timer);
      }
      if (r.ok) {
        const data = await r.json();
        if (data.answer) webContext += `Answer: ${data.answer}\n\n`;
        webContext += (data.results || [])
          .map(x => `[${x.title}] ${x.url}\n${(x.content || '').slice(0, 400)}`)
          .join('\n\n') + '\n\n';
      }
    } catch (e) {
      console.warn('[discovery:tavily] query failed, continuing:', e.message);
    }
  }

  if (!webContext.trim()) {
    console.warn('[discovery:tavily] no web context, falling back to Claude-only');
    return runClaudeDiscovery(criteria);
  }

  const text = await callAnthropic(
    'You are a talent acquisition assistant for HiddenAtlas. Use the provided web search context to identify real Instagram travel creators. Respond with valid JSON only, exactly as instructed. No markdown, no explanation.',
    buildCreatorPrompt(criteria, webContext),
  );

  console.log(`[discovery:tavily_claude] raw response length: ${text.length}, first 500 chars: ${text.slice(0, 500)}`);

  let rawProfiles;
  let parseError = null;
  try {
    rawProfiles = parseCreatorProfiles(text);
  } catch (parseErr) {
    parseError = parseErr.message;
    console.warn('[discovery:tavily_claude] JSON parse failed:', parseErr.message);
    rawProfiles = tryExtractPartialProfiles(text);
    if (rawProfiles.length > 0) {
      console.log(`[discovery:tavily_claude] partial extraction rescued ${rawProfiles.length} profile(s)`);
    } else {
      console.error('[discovery:tavily_claude] complete parse failure — returning empty. Raw preview:', text.slice(0, 300));
      return {
        creators: [],
        provider: 'tavily_claude',
        providerMeta: { model: MODEL, contextSource: 'tavily_web_search', parseError, rawPreview: text.slice(0, 300) },
      };
    }
  }

  if (!Array.isArray(rawProfiles)) {
    return {
      creators: [],
      provider: 'tavily_claude',
      providerMeta: { model: MODEL, contextSource: 'tavily_web_search', parseError: 'Parsed value was not an array' },
    };
  }

  const normalized = rawProfiles.map(normalizeAiProfile);
  const creators   = normalized.filter(r => r.ok).map(r => r.data);
  const skipped    = normalized.filter(r => !r.ok);
  console.log(`[discovery:tavily_claude] parsed ${rawProfiles.length} raw, normalized ${creators.length} valid, skipped ${skipped.length}`, skipped.map(s => s.reason));

  return {
    creators,
    provider: 'tavily_claude',
    providerMeta: { model: MODEL, contextSource: 'tavily_web_search', ...(parseError ? { parseError } : {}) },
  };
}

// ── Provider: Perplexity ──────────────────────────────────────────────────────

async function runPerplexityDiscovery(criteria) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), AI_DISCOVERY_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(PERPLEXITY_URL, {
      method:  'POST',
      signal:  ctrl.signal,
      headers: {
        Authorization: `Bearer ${process.env.PERPLEXITY_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-sonar-small-128k-online',
        max_tokens: 8000,
        messages: [
          { role: 'system', content: 'You are a talent acquisition assistant. Respond with valid JSON only, no markdown.' },
          { role: 'user',   content: buildCreatorPrompt(criteria) },
        ],
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Perplexity ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const creators = parseCreatorArray(text);
  if (!Array.isArray(creators)) throw new Error('Perplexity response was not an array');
  return {
    creators: creators.filter(c => c?.username),
    provider: 'perplexity',
    providerMeta: { model: 'perplexity-sonar-online', contextSource: 'web_search' },
  };
}

// ── Meta Business Discovery Provider ─────────────────────────────────────────

const META_GRAPH_URL = 'https://graph.facebook.com';

export function validateMetaConfig() {
  const version   = process.env.META_GRAPH_API_VERSION || 'v25.0';
  const accountId = process.env.META_INSTAGRAM_ACCOUNT_ID;
  // META_GRAPH_ACCESS_TOKEN is the preferred User Token; fall back to legacy names
  const token     = process.env.META_GRAPH_ACCESS_TOKEN
                 || process.env.META_PAGE_ACCESS_TOKEN
                 || process.env.META_INSTAGRAM_ACCESS_TOKEN;
  const enabled   = process.env.META_PROVIDER_ENABLED !== 'false';

  const missing = [];
  if (!accountId) missing.push('META_INSTAGRAM_ACCOUNT_ID');
  if (!token)     missing.push('META_GRAPH_ACCESS_TOKEN');

  return { configured: missing.length === 0 && enabled, missing, version, accountId, token, enabled };
}

export function normalizeUsername(raw) {
  if (!raw || typeof raw !== 'string') return '';
  let s = raw.trim();
  const urlMatch = s.match(/instagram\.com\/([A-Za-z0-9_.]+)/i);
  if (urlMatch) return urlMatch[1].toLowerCase();
  s = s.replace(/^@/, '').replace(/\/$/, '').replace(/\s+/g, '');
  return s.toLowerCase();
}

function metaFmtK(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function calcMetaScore(profile, criteria = {}) {
  let score = 0;
  const bio      = (profile.biography || '').toLowerCase();
  const captions = (profile.media?.data || []).map(m => (m.caption || '').toLowerCase()).join(' ');
  const text     = bio + ' ' + captions;

  if (/travel|viaje|viagem|voyage|trip\b|destination|itinerary|wanderlust|explorer|backpack/.test(text)) score += 20;

  const dest = (criteria.destinationTheme || '').toLowerCase().split(',')[0].trim();
  if (dest && text.includes(dest)) score += 15;

  if (profile.website) score += 10;

  const followers = profile.followers_count ?? 0;
  const min = criteria.minFollowers ?? 5_000;
  const max = criteria.maxFollowers ?? 1_000_000;
  if (followers >= min && followers <= max) score += 10;

  if ((profile.media_count ?? 0) >= 30) score += 10;

  const travelCaps = (profile.media?.data || []).filter(m =>
    /travel|trip|destination|itinerary|explore|route|guide/.test((m.caption || '').toLowerCase())
  ).length;
  if (travelCaps >= 3) score += 10;

  const niche = (criteria.niche || '').toLowerCase();
  if (niche && text.includes(niche)) score += 10;

  if (/\b(hotel|resort|airline|tour operator|travel agency|booking\.com)\b/.test(bio)) score -= 20;
  if (!profile.biography || profile.biography.length < 15) score -= 15;

  return Math.max(0, Math.min(100, score));
}

function metaFitSummary(profile, criteria = {}) {
  const parts = [];
  const bio = profile.biography || '';
  if (bio) parts.push(bio.slice(0, 120).replace(/\n/g, ' '));
  if (profile.followers_count != null) parts.push(`${metaFmtK(profile.followers_count)} followers`);
  if (profile.website) parts.push('has website');
  return parts.join(' · ').slice(0, 220) || null;
}

function metaRouteIdeas(profile, criteria = {}) {
  const ideas = [];
  const text = [profile.biography || '', ...(profile.media?.data || []).map(m => m.caption || '')].join(' ').toLowerCase();
  const dest = (criteria.destinationTheme || '').split(',')[0].trim();

  if (dest) {
    if (/slow|relax|pace|offbeat/.test(text))                       ideas.push(`Slow travel through ${dest}`);
    else if (/food|eat|culinar|gastro|cuisine|restaurant/.test(text)) ideas.push(`${dest} food and culture route`);
    else if (/luxury|boutique|premium/.test(text))                   ideas.push(`Premium ${dest} discovery`);
    else if (/hidden|secret|off.beat|underrated/.test(text))         ideas.push(`Hidden ${dest}: beyond the guidebook`);
    else                                                               ideas.push(`${dest} curated itinerary`);
  }
  if (ideas.length < 2) ideas.push(`${profile.name || profile.username || 'Creator'}'s signature travel guide`);
  return ideas.slice(0, 3);
}

export async function enrichInstagramProfilesByUsername(usernames, criteria = {}) {
  const config = validateMetaConfig();
  if (!config.configured) {
    throw Object.assign(
      new Error(`Meta provider not configured. Missing: ${config.missing.join(', ')}`),
      { status: 503, code: 'META_NOT_CONFIGURED' }
    );
  }

  const { version, accountId, token } = config;
  const fieldset = [
    'id', 'username', 'name', 'biography', 'website',
    'profile_picture_url', 'followers_count', 'follows_count', 'media_count',
    'media.limit(6){id,caption,media_type,permalink,timestamp,like_count,comments_count}',
  ].join(',');

  const results = [];
  const errors  = {};

  for (const username of usernames) {
    try {
      const fields = `business_discovery.use_username(${username}){${fieldset}}`;
      const url    = new URL(`${META_GRAPH_URL}/${version}/${accountId}`);
      url.searchParams.set('fields', fields);
      url.searchParams.set('access_token', token);

      const ctrl  = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15_000);
      let res;
      try {
        res = await fetch(url.toString(), { signal: ctrl.signal });
      } finally {
        clearTimeout(timer);
      }

      const data = await res.json();

      if (data.error) {
        const code = data.error.code;
        let msg    = data.error.message || 'Meta API error';
        if (code === 100 || msg.toLowerCase().includes('business_discovery')) {
          msg = 'Not a Business/Creator account or profile not found';
        } else if (code === 190) {
          msg = 'Meta token is invalid or expired';
        } else if (code === 4 || code === 17 || code === 32) {
          msg = 'Rate limit reached — wait a few minutes and try again';
        }
        errors[username] = msg;
        continue;
      }

      const profile = data.business_discovery;
      if (!profile) { errors[username] = 'Profile not found or not accessible'; continue; }

      results.push({
        username:     (profile.username || username).toLowerCase(),
        displayName:  profile.name                  || null,
        profileUrl:   `https://www.instagram.com/${profile.username || username}/`,
        avatarUrl:    profile.profile_picture_url   || null,
        bio:          profile.biography             || null,
        website:      profile.website               || null,
        followerCount: profile.followers_count      ?? null,
        followsCount:  profile.follows_count        ?? null,
        postCount:     profile.media_count          ?? null,
        country:      criteria.creatorCountry       || null,
        language:     criteria.language             || null,
        category:     criteria.niche               || 'travel',
        score:        calcMetaScore(profile, criteria),
        fitSummary:   metaFitSummary(profile, criteria),
        routeIdeas:   metaRouteIdeas(profile, criteria),
        rawData: {
          provider: 'meta_instagram_business_discovery',
          apiVersion: version,
          website:  profile.website        || null,
          followsCount: profile.follows_count ?? null,
          media:    profile.media?.data    || [],
        },
      });

      await new Promise(r => setTimeout(r, 400));
    } catch (e) {
      errors[username] = e.name === 'AbortError' ? 'Request timed out' : (e.message || 'Unknown error');
    }
  }

  return { results, errors, provider: 'meta_instagram_business_discovery' };
}

// ── Instagram Profile Verification (single profile) ───────────────────────────

export async function verifyInstagramCreatorProfile(usernameRaw, opts = {}) {
  // opts.token + opts.accountId let callers supply a per-creator OAuth token
  // instead of the server-level env var token.
  let version, accountId, token;
  if (opts.token && opts.accountId) {
    version   = process.env.META_GRAPH_API_VERSION || 'v25.0';
    accountId = opts.accountId;
    token     = opts.token;
  } else {
    const config = validateMetaConfig();
    if (!config.configured) {
      return {
        verified: false,
        code:     'META_PROVIDER_NOT_CONFIGURED',
        missing:  config.missing,
        metricsSource: 'not_available',
        error: `Meta provider not configured. Missing: ${config.missing.join(', ')}`,
      };
    }
    ({ version, accountId, token } = config);
  }

  // Always normalize: strip @, extract from URL, lowercase, no spaces
  const cleanUsername = normalizeUsername(usernameRaw);
  if (!cleanUsername) {
    return { verified: false, metricsSource: 'not_available', error: 'Invalid or empty username' };
  }
  const fieldset = 'id,username,name,biography,profile_picture_url,followers_count,media_count,website';
  // Correct field syntax: business_discovery.username() — NOT use_username()
  const fields   = `business_discovery.username(${cleanUsername}){${fieldset}}`;
  // Build URL manually to avoid URLSearchParams encoding issues with { } ( )
  const urlWithoutToken = `${META_GRAPH_URL}/${version}/${accountId}?fields=${encodeURIComponent(fields)}`;
  const fullUrl         = `${urlWithoutToken}&access_token=${token}`;

  console.log('[Discovery] verifyProfile request:', {
    usernameOriginal:    usernameRaw,
    cleanUsername,
    igBusinessAccountId: accountId,
    graphApiUrl:         urlWithoutToken,  // safe: no token
  });

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(fullUrl, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();

    if (data.error) {
      const errCode    = data.error.code;
      const errSubcode = data.error.error_subcode;
      const errMsg     = data.error.message || 'Meta API error';
      console.error('[Discovery] Meta API error:', { code: errCode, subcode: errSubcode, message: errMsg, cleanUsername });

      let userMsg;
      if (errCode === 190 || errCode === 102 || errCode === 467) {
        userMsg = 'Meta token is invalid or expired';
      } else if (errCode === 4 || errCode === 17 || errCode === 32 || errCode === 613) {
        userMsg = 'Rate limit reached — wait a few minutes and try again';
      } else if (errCode === 200 || errCode === 10 || errCode === 3 || (errCode >= 200 && errCode <= 299)) {
        userMsg = 'Meta permission/token error — check token scopes';
      } else if (errCode === 100) {
        // subcode 33 = object does not exist; other = bad param or unsupported operation
        userMsg = errSubcode === 33
          ? 'Profile not found or not eligible for Business Discovery'
          : 'Meta API error (code 100): possible bad parameter or unsupported account';
      } else {
        userMsg = `Meta API error (code ${errCode}): ${errMsg}`;
      }
      return { verified: false, metricsSource: 'not_available', error: userMsg, metaCode: errCode };
    }

    const profile = data.business_discovery;
    console.log('[Discovery] business_discovery present:', !!profile, profile ? { username: profile.username, followers: profile.followers_count } : null);

    if (!profile) {
      return { verified: false, metricsSource: 'not_available', error: 'Profile not found or not eligible for Business Discovery' };
    }

    const igUsername = profile.username || cleanUsername;
    return {
      verified:        true,
      metricsSource:   'meta_business_discovery',
      followersCount:  profile.followers_count ?? null,
      postsCount:      profile.media_count     ?? null,
      bio:             profile.biography       || null,
      avatarUrl:       profile.profile_picture_url || null,
      displayName:     profile.name            || null,
      website:         profile.website         || null,
      profileUrl:      `https://www.instagram.com/${igUsername}/`,
      rawMetaProfile:  profile,
    };
  } catch (e) {
    clearTimeout(timer);
    const msg = e.name === 'AbortError' ? 'Request timed out (15s)' : (e.message || 'Unknown error');
    console.error('[Discovery] verifyProfile fetch error:', msg);
    return { verified: false, metricsSource: 'not_available', error: msg };
  }
}
