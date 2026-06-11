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

const MODEL          = 'claude-sonnet-4-6';
const ANTHROPIC_URL  = 'https://api.anthropic.com/v1/messages';
const TAVILY_URL     = 'https://api.tavily.com/search';
const PERPLEXITY_URL = 'https://api.perplexity.ai/chat/completions';
const FETCH_TIMEOUT  = 50_000; // 50s — leave headroom before Vercel 60s limit

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
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

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
        max_tokens: 8000,
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

  const lines = [
    `Find potential Travel Designers / Travel Creators matching this creator profile:\n${creatorProfile}`,
    destinationTheme && `\nOptional destination or theme context:\n${destinationTheme}`,
    creatorCountry   && `\nCreator country:\n${creatorCountry}`,
    language         && `\nLanguage:\n${language}`,
    niche            && `\nNiche / category:\n${niche}`,
    (minFollowers || maxFollowers) && `\nFollower range:\n${minFollowers ? Number(minFollowers).toLocaleString() : 'any'} to ${maxFollowers ? Number(maxFollowers).toLocaleString() : 'any'}`,
    notes            && `\nAdditional notes:\n${notes}`,
  ].filter(Boolean).join('\n');

  return `You are a talent scout for HiddenAtlas, a premium travel itinerary platform.
HiddenAtlas partners with Travel Designers and Travel Creators who design and sell curated digital itineraries.

SEARCH REQUEST:
${lines}
${webContext ? `\nWEB CONTEXT (use to identify real Instagram profiles):\n${webContext.slice(0, 6000)}` : ''}

PRIORITIZE creators with:
- Personal authority and strong visual taste
- Useful, specific travel recommendations and destination knowledge
- Potential to create or sell curated itineraries on HiddenAtlas
- Authentic human voice and credibility with their audience

INCLUDE creators such as:
- Travel creators and travel designers
- Itinerary planners and boutique travel planners
- Local experts with deep destination knowledge
- Travel bloggers who publish guides, maps, road trips, hotel recommendations or destination reels
- Creators with strong storytelling and audience interested in curated travel

EXCLUDE:
- Agencies, mass-market tour operators, generic repost pages
- Hotels, airlines, meme pages, discount-only influencers
- Accounts without a clear human creator behind them

SCORING (0–100):
- 80–100: Perfect — strong personal authority, premium taste, clear itinerary potential
- 60–79: Strong — relevant niche, good content quality and engagement
- 40–59: Potential — some relevance, needs vetting
- 0–39: Weak

Return ONLY a valid JSON array of ${limit} Instagram travel creator profiles.
No markdown, no explanation, no code block. Start with [ and end with ].

[
  {
    "username": "exact_instagram_handle_no_@",
    "displayName": "Display Name or null",
    "profileUrl": "https://www.instagram.com/username/",
    "avatarUrl": null,
    "followerCount": estimated_number_or_null,
    "postCount": null,
    "engagementRate": null,
    "bio": "known bio or short content description",
    "country": "creator country",
    "language": "language code e.g. pt en es fr",
    "category": "travel niche e.g. luxury food hiking",
    "score": 0-100,
    "fitSummary": "1-2 sentences: why this creator fits HiddenAtlas based on the requested profile",
    "destinations": ["destination1", "destination2"],
    "routeIdeas": ["route idea 1", "route idea 2"],
    "rawData": {
      "sources": [],
      "reasoning": "brief confidence note for this profile",
      "confidenceLevel": "high|medium|low"
    }
  }
]`;
}

// ── JSON parser ───────────────────────────────────────────────────────────────

function parseCreatorArray(text) {
  let s = text.trim();
  s = s.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '');
  const start = s.indexOf('[');
  const end   = s.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('No JSON array found in AI response');
  return JSON.parse(s.slice(start, end + 1));
}

// ── Provider: Claude (knowledge-only) ────────────────────────────────────────

async function runClaudeDiscovery(criteria) {
  const text = await callAnthropic(
    'You are a talent acquisition assistant for HiddenAtlas. Always respond with valid JSON only, no additional text.',
    buildCreatorPrompt(criteria),
  );
  const creators = parseCreatorArray(text);
  if (!Array.isArray(creators)) throw new Error('AI response was not an array');
  return {
    creators: creators.filter(c => c?.username),
    provider: 'claude',
    providerMeta: { model: MODEL, contextSource: 'ai_knowledge' },
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
    'You are a talent acquisition assistant for HiddenAtlas. Use the provided web search context to identify real Instagram travel creators. Always respond with valid JSON only.',
    buildCreatorPrompt(criteria, webContext),
  );
  const creators = parseCreatorArray(text);
  if (!Array.isArray(creators)) throw new Error('AI response was not an array');
  return {
    creators: creators.filter(c => c?.username),
    provider: 'tavily_claude',
    providerMeta: { model: MODEL, contextSource: 'tavily_web_search' },
  };
}

// ── Provider: Perplexity ──────────────────────────────────────────────────────

async function runPerplexityDiscovery(criteria) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT);

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
