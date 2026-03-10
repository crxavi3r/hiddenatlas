/**
 * Client-side fallback cover image resolver for AI-generated trips.
 *
 * Used when a trip has no persisted coverImage (e.g. trips saved before the
 * landmark-photo feature, or when the server-side Unsplash fetch fails).
 *
 * Maps destination keywords → landmark-specific Unsplash photo IDs for
 * the most common travel destinations. Falls back to a hash-selected pool
 * of premium landscape photos for unknown destinations.
 */

// Each entry: { keys[], landmark, id }
// Ordered most-specific first. First match wins.
const LANDMARK_MAP = [
  // ── Indonesia / SE Asia ──────────────────────────────────────────────────
  { keys: ['uluwatu', 'seminyak', 'ubud', 'bali', 'lombok', 'komodo', 'indonesia'],
    landmark: 'Uluwatu Temple Bali', id: '1537996194471-e657df975ab4' },
  { keys: ['philippines', 'palawan', 'el nido', 'coron', 'boracay', 'cebu'],
    landmark: 'El Nido Palawan', id: '1531761535209-180857e963b9' },
  { keys: ['thailand', 'bangkok', 'phuket', 'koh samui', 'chiang mai', 'phi phi'],
    landmark: 'Thai beach', id: '1555865138-193ba536d7e0' },
  { keys: ['vietnam', 'hanoi', 'hoi an', 'ha long', 'ho chi minh', 'hue'],
    landmark: 'Ha Long Bay', id: '1484994223141-cd796f3c3c14' },
  { keys: ['cambodia', 'angkor', 'siem reap'],
    landmark: 'Angkor Wat', id: '1571403712587-f99cedc8cf99' },
  { keys: ['myanmar', 'burma', 'bagan', 'yangon'],
    landmark: 'Bagan temples', id: '1570692890937-f60db72ac6b4' },

  // ── East Asia ────────────────────────────────────────────────────────────
  { keys: ['kyoto', 'osaka', 'hiroshima', 'nara', 'japan', 'tokyo', 'hokkaido'],
    landmark: 'Mount Fuji Japan', id: '1570692890937-f60db72ac6b4' },
  { keys: ['china', 'beijing', 'shanghai', 'guilin', 'yunnan'],
    landmark: 'Great Wall China', id: '1571403712587-f99cedc8cf99' },

  // ── South Asia ───────────────────────────────────────────────────────────
  { keys: ['rajasthan', 'jaipur', 'udaipur', 'jodhpur', 'agra', 'india', 'kerala', 'goa'],
    landmark: 'Taj Mahal India', id: '1484994223141-cd796f3c3c14' },

  // ── Middle East ──────────────────────────────────────────────────────────
  { keys: ['petra', 'jordan', 'wadi rum', 'aqaba'],
    landmark: 'Petra Jordan', id: '1571403712587-f99cedc8cf99' },
  { keys: ['dubai', 'abu dhabi', 'uae'],
    landmark: 'Dubai skyline', id: '1541849546-216549ae216d' },

  // ── North Africa ─────────────────────────────────────────────────────────
  { keys: ['marrakech', 'fez', 'morocco', 'chefchaouen', 'sahara', 'atlas'],
    landmark: 'Marrakech riad', id: '1484994223141-cd796f3c3c14' },
  { keys: ['egypt', 'cairo', 'luxor', 'aswan', 'pyramids', 'giza'],
    landmark: 'Pyramids of Giza', id: '1571403712587-f99cedc8cf99' },

  // ── Sub-Saharan Africa ───────────────────────────────────────────────────
  { keys: ['kenya', 'masai mara', 'serengeti', 'tanzania', 'safari', 'kilimanjaro'],
    landmark: 'Serengeti safari', id: '1571403712587-f99cedc8cf99' },
  { keys: ['south africa', 'cape town', 'cape winelands', 'garden route', 'kruger'],
    landmark: 'Cape Town', id: '1515700281303-5a0a73d9c584' },

  // ── Italy ────────────────────────────────────────────────────────────────
  { keys: ['puglia', 'alberobello', 'lecce', 'polignano', 'bari', 'matera'],
    landmark: 'Alberobello trulli Puglia', id: '1658411820124-93bddab6970f' },
  { keys: ['tuscany', 'florence', 'siena', 'val d\'orcia', 'chianti'],
    landmark: 'Tuscany rolling hills', id: '1571403712587-f99cedc8cf99' },
  { keys: ['amalfi', 'positano', 'capri', 'ravello', 'sorrentino'],
    landmark: 'Amalfi Coast', id: '1528214096798-37891d32174c' },
  { keys: ['rome', 'milan', 'venice', 'cinque terre', 'sardinia', 'sicily', 'italy'],
    landmark: 'Italian landscape', id: '1528214096798-37891d32174c' },

  // ── France ───────────────────────────────────────────────────────────────
  { keys: ['normandy', 'brittany', 'mont saint michel'],
    landmark: 'Mont Saint-Michel Normandy', id: '1531250552633-528fe896fdd4' },
  { keys: ['paris', 'versailles', 'loire', 'provence', 'bordeaux', 'france'],
    landmark: 'Eiffel Tower Paris', id: '1531250552633-528fe896fdd4' },

  // ── Iberian Peninsula ────────────────────────────────────────────────────
  { keys: ['barcelona', 'madrid', 'seville', 'granada', 'andalusia', 'ibiza', 'spain'],
    landmark: 'Alhambra Granada', id: '1531250552633-528fe896fdd4' },
  { keys: ['lisbon', 'porto', 'alentejo', 'algarve', 'sintra', 'portugal'],
    landmark: 'Lisbon cityscape', id: '1528214096798-37891d32174c' },

  // ── Eastern Europe ───────────────────────────────────────────────────────
  { keys: ['albania', 'riviera', 'berat', 'gjirokaster', 'tirana'],
    landmark: 'Albanian Riviera', id: '1677426240101-4b133cef0039' },
  { keys: ['budapest', 'lake balaton', 'eger', 'hungary'],
    landmark: 'Budapest parliament', id: '1541849546-216549ae216d' },
  { keys: ['prague', 'cesky krumlov', 'czechia', 'czech republic', 'bohemia'],
    landmark: 'Prague castle', id: '1541849546-216549ae216d' },
  { keys: ['vienna', 'salzburg', 'hallstatt', 'innsbruck', 'austria'],
    landmark: 'Vienna Austria', id: '1663214957746-2da10a9f4b2b' },
  { keys: ['dubrovnik', 'split', 'plitvice', 'hvar', 'kotor', 'croatia'],
    landmark: 'Dubrovnik old town', id: '1571403712587-f99cedc8cf99' },
  { keys: ['poland', 'krakow', 'warsaw', 'gdansk', 'zakopane'],
    landmark: 'Krakow old town', id: '1541849546-216549ae216d' },
  { keys: ['greece', 'athens', 'santorini', 'mykonos', 'crete', 'meteora'],
    landmark: 'Santorini caldera', id: '1528214096798-37891d32174c' },

  // ── Northern Europe ──────────────────────────────────────────────────────
  { keys: ['scotland', 'edinburgh', 'highlands', 'isle of skye', 'glencoe', 'orkney'],
    landmark: 'Scottish Highlands', id: '1568576411512-946a1a201093' },
  { keys: ['ireland', 'dublin', 'galway', 'connemara', 'cliffs of moher', 'ring of kerry'],
    landmark: 'Cliffs of Moher Ireland', id: '1568576411512-946a1a201093' },
  { keys: ['lake district', 'cotswolds', 'yorkshire', 'cornwall', 'england', 'london'],
    landmark: 'English countryside', id: '1757788752453-c37a900f22e6' },
  { keys: ['norway', 'fjords', 'bergen', 'oslo', 'lofoten', 'geiranger'],
    landmark: 'Norwegian fjords', id: '1568576411512-946a1a201093' },
  { keys: ['iceland', 'reykjavik', 'golden circle', 'aurora', 'northern lights'],
    landmark: 'Iceland landscape', id: '1568576411512-946a1a201093' },
  { keys: ['sweden', 'stockholm', 'lapland'],
    landmark: 'Stockholm', id: '1541849546-216549ae216d' },

  // ── Americas ─────────────────────────────────────────────────────────────
  { keys: ['rio', 'rio de janeiro', 'brazil', 'amazon', 'iguazu', 'salvador'],
    landmark: 'Rio de Janeiro', id: '1515700281303-5a0a73d9c584' },
  { keys: ['machu picchu', 'cusco', 'sacred valley', 'peru', 'inca'],
    landmark: 'Machu Picchu Peru', id: '1571403712587-f99cedc8cf99' },
  { keys: ['colombia', 'cartagena', 'bogota', 'medellin', 'coffee region'],
    landmark: 'Cartagena Colombia', id: '1515700281303-5a0a73d9c584' },
  { keys: ['mexico', 'oaxaca', 'yucatan', 'tulum', 'merida', 'cdmx', 'guadalajara'],
    landmark: 'Mexican landscape', id: '1555865138-193ba536d7e0' },
  { keys: ['patagonia', 'torres del paine', 'chile', 'argentina', 'buenos aires'],
    landmark: 'Patagonia landscape', id: '1568576411512-946a1a201093' },
  { keys: ['costa rica', 'panama', 'nicaragua', 'belize'],
    landmark: 'Costa Rica rainforest', id: '1555865138-193ba536d7e0' },

  // ── Oceania ──────────────────────────────────────────────────────────────
  { keys: ['new zealand', 'auckland', 'queenstown', 'milford sound', 'fiordland'],
    landmark: 'Milford Sound New Zealand', id: '1568576411512-946a1a201093' },
  { keys: ['australia', 'sydney', 'melbourne', 'great barrier reef', 'uluru', 'queensland'],
    landmark: 'Sydney Harbour', id: '1555865138-193ba536d7e0' },
];

// Premium landscape fallback pool — used for truly unknown destinations
const FALLBACK_POOL = [
  '1537996194471-e657df975ab4', // Bali temple
  '1570692890937-f60db72ac6b4', // Japan landscape
  '1571403712587-f99cedc8cf99', // Dramatic landscape
  '1528214096798-37891d32174c', // Mediterranean
  '1568576411512-946a1a201093', // Northern Europe landscape
  '1531250552633-528fe896fdd4', // France
  '1555865138-193ba536d7e0',    // Tropical beach
  '1515700281303-5a0a73d9c584', // South America
  '1541849546-216549ae216d',    // European city
  '1658411820124-93bddab6970f', // Puglia / Mediterranean village
];

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/**
 * Returns a full Unsplash image URL for the given destination string.
 * Always returns a URL — uses landmark-level matching, then hash-selected pool.
 * @param {string} destination
 * @param {number} width
 */
export function getAiCoverImage(destination, width = 800) {
  if (!destination) {
    return `https://images.unsplash.com/photo-${FALLBACK_POOL[0]}?w=${width}&q=85&fit=crop`;
  }

  const needle = destination.toLowerCase();

  for (const entry of LANDMARK_MAP) {
    if (entry.keys.some(k => needle.includes(k))) {
      return `https://images.unsplash.com/photo-${entry.id}?w=${width}&q=85&fit=crop`;
    }
  }

  const idx = hashString(needle) % FALLBACK_POOL.length;
  return `https://images.unsplash.com/photo-${FALLBACK_POOL[idx]}?w=${width}&q=85&fit=crop`;
}
