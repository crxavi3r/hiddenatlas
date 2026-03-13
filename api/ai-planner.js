import Anthropic from '@anthropic-ai/sdk';

async function fetchLandmarkCoverImage(heroLandmark, destination) {
  try {
    const keywords = [heroLandmark, destination, 'travel photography']
      .filter(Boolean)
      .map(k => k.trim().replace(/\s+/g, '+'))
      .join(',');

    const resp = await fetch(
      `https://source.unsplash.com/featured/1600x900/?${keywords}`,
      { redirect: 'follow', signal: AbortSignal.timeout(5000) },
    );

    if (resp.ok && resp.url.includes('unsplash.com')) {
      const base = resp.url.split('?')[0];
      return `${base}?w=1200&q=85&fit=crop`;
    }
  } catch (err) {
    console.warn('[ai-planner] cover image fetch failed:', err.message);
  }
  return null;
}

const DAY_COUNTS = {
  '3–5 days': 4,
  '7–10 days': 7,
  '11–14 days': 10,
  '15+ days': 12,
};

// POST /api/ai-planner
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { destination, tripLength = '7–10 days', style = 'Cultural', budget = 'Luxury', groupType = 'Couple' } = req.body || {};

  if (!destination?.trim()) {
    return res.status(400).json({ error: 'Destination is required.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'AI service not configured. Add ANTHROPIC_API_KEY to your Vercel environment variables.' });
  }

  const numDays = DAY_COUNTS[tripLength] ?? 7;

  const prompt = `You are a senior luxury travel editor for HiddenAtlas, a premium travel platform. Generate a sophisticated, specific travel itinerary. Avoid tourist clichés. Prioritise hidden gems, boutique accommodation, local culture, and bookable experiences that feel authentic.

Trip details:
- Destination: ${destination}
- Trip Length: ${tripLength}
- Travel Style: ${style}
- Budget: ${budget}
- Group Type: ${groupType}

Return ONLY valid JSON with this exact structure — no markdown, no other text, just the JSON object:
{
  "destination": "string (city or region name)",
  "country": "string",
  "duration": "string (e.g. '7 days')",
  "heroLandmark": "string (ONE iconic visual landmark or landscape feature that defines this destination — be specific and photogenic, e.g. 'Uluwatu Temple' for Bali, 'Mount Fuji' for Tokyo, 'Mont Saint-Michel' for Normandy, 'Alberobello trulli' for Puglia, 'Riad courtyards' for Marrakech)",
  "overview": "string (2–3 sentences, sophisticated editorial tone, specific to the destination)",
  "highlights": [
    "string (4 specific, compelling highlights — not generic)"
  ],
  "days": [
    {
      "day": 1,
      "title": "string (evocative title for the day)",
      "description": "string (2–3 sentences with specific place names, experiences, and insider details)"
    }
  ],
  "hotels": [
    {
      "name": "string (real or plausible boutique hotel name)",
      "type": "string (e.g. Boutique Hotel, Ryokan, Masseria, Riad)",
      "note": "string (one sentence on why it's right for this trip)"
    }
  ],
  "experiences": [
    "string (5–6 specific, bookable experiences with place names)"
  ]
}

Generate exactly ${numDays} days. Be specific: use real neighbourhood names, market names, restaurant types, landscape descriptions. Write in a polished, editorial travel voice.`;

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2800,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = message.content[0]?.text ?? '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Invalid AI response format');

    const itinerary = JSON.parse(jsonMatch[0]);

    const coverImage = await fetchLandmarkCoverImage(
      itinerary.heroLandmark,
      itinerary.destination,
    );
    if (coverImage) itinerary.coverImage = coverImage;

    return res.status(200).json(itinerary);
  } catch (err) {
    console.error('[ai-planner]', err);
    const isJsonError = err instanceof SyntaxError;
    return res.status(500).json({
      error: isJsonError
        ? 'The AI returned an unexpected format. Please try again.'
        : 'Failed to generate itinerary. Please try again.',
    });
  }
}
