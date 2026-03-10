/**
 * Deterministic cover image resolution for AI-generated trips.
 *
 * Maps destination keywords → verified Unsplash photo IDs already used
 * throughout the project. Falls back to a hash-selected pool for unknown
 * destinations so every trip always gets a real photograph.
 */

const DESTINATION_MAP = [
  // Southeast Asia
  { keys: ['bali', 'indonesia', 'lombok', 'komodo'], id: '1537996194471-e657df975ab4' },
  { keys: ['philippines', 'palawan', 'cebu', 'boracay'], id: '1531761535209-180857e963b9' },
  { keys: ['thailand', 'bangkok', 'phuket', 'chiang mai', 'koh samui'], id: '1555865138-193ba536d7e0' },
  { keys: ['vietnam', 'hanoi', 'hoi an', 'ha long', 'ho chi minh'], id: '1484994223141-cd796f3c3c14' },
  // East Asia
  { keys: ['japan', 'tokyo', 'kyoto', 'osaka', 'hiroshima', 'hokkaido'], id: '1570692890937-f60db72ac6b4' },
  // South Asia
  { keys: ['india', 'rajasthan', 'kerala', 'goa', 'mumbai', 'delhi'], id: '1484994223141-cd796f3c3c14' },
  // Middle East / North Africa
  { keys: ['morocco', 'marrakech', 'fez', 'sahara', 'essaouira'], id: '1484994223141-cd796f3c3c14' },
  { keys: ['egypt', 'cairo', 'luxor', 'aswan', 'petra', 'jordan'], id: '1571403712587-f99cedc8cf99' },
  // Europe — Mediterranean
  { keys: ['italy', 'rome', 'venice', 'florence', 'milan', 'sicily', 'amalfi'], id: '1528214096798-37891d32174c' },
  { keys: ['puglia', 'tuscany', 'sardinia', 'cinque terre'], id: '1658411820124-93bddab6970f' },
  { keys: ['greece', 'athens', 'santorini', 'mykonos', 'crete'], id: '1571403712587-f99cedc8cf99' },
  { keys: ['spain', 'barcelona', 'madrid', 'seville', 'granada', 'ibiza'], id: '1531250552633-528fe896fdd4' },
  { keys: ['france', 'paris', 'provence', 'normandy', 'bordeaux', 'lyon'], id: '1531250552633-528fe896fdd4' },
  { keys: ['portugal', 'lisbon', 'porto', 'algarve', 'sintra'], id: '1528214096798-37891d32174c' },
  // Europe — Central & Eastern
  { keys: ['albania', 'tirana', 'berat', 'gjirokaster', 'riviera'], id: '1677426240101-4b133cef0039' },
  { keys: ['budapest', 'hungary', 'prague', 'czechia', 'bratislava', 'slovakia'], id: '1541849546-216549ae216d' },
  { keys: ['vienna', 'austria', 'salzburg', 'hallstatt'], id: '1663214957746-2da10a9f4b2b' },
  { keys: ['croatia', 'dubrovnik', 'split', 'plitvice', 'hvar'], id: '1571403712587-f99cedc8cf99' },
  { keys: ['poland', 'krakow', 'warsaw', 'gdansk', 'wroclaw'], id: '1541849546-216549ae216d' },
  // Northern Europe
  { keys: ['scotland', 'edinburgh', 'highlands', 'isle of skye', 'orkney'], id: '1568576411512-946a1a201093' },
  { keys: ['ireland', 'dublin', 'galway', 'connemara', 'ring of kerry'], id: '1568576411512-946a1a201093' },
  { keys: ['england', 'london', 'yorkshire', 'cotswolds', 'lake district'], id: '1757788752453-c37a900f22e6' },
  { keys: ['norway', 'fjords', 'bergen', 'oslo', 'lofoten'], id: '1568576411512-946a1a201093' },
  { keys: ['iceland', 'reykjavik', 'aurora', 'northern lights'], id: '1568576411512-946a1a201093' },
  // Americas
  { keys: ['brazil', 'rio', 'amazon', 'salvador', 'iguazu'], id: '1515700281303-5a0a73d9c584' },
  { keys: ['peru', 'machu picchu', 'lima', 'cusco', 'inca'], id: '1571403712587-f99cedc8cf99' },
  { keys: ['colombia', 'cartagena', 'bogota', 'medellin'], id: '1515700281303-5a0a73d9c584' },
  { keys: ['mexico', 'cancun', 'oaxaca', 'cdmx', 'yucatan', 'tulum'], id: '1555865138-193ba536d7e0' },
  { keys: ['costa rica', 'patagonia', 'argentina', 'chile'], id: '1568576411512-946a1a201093' },
  // Africa
  { keys: ['kenya', 'tanzania', 'safari', 'serengeti', 'kilimanjaro'], id: '1571403712587-f99cedc8cf99' },
  { keys: ['south africa', 'cape town', 'johannesburg', 'kruger'], id: '1515700281303-5a0a73d9c584' },
  // Oceania
  { keys: ['australia', 'sydney', 'melbourne', 'queensland', 'great barrier reef'], id: '1555865138-193ba536d7e0' },
  { keys: ['new zealand', 'auckland', 'queenstown', 'milford sound'], id: '1568576411512-946a1a201093' },
];

// Fallback pool — beautiful travel photos, nothing destination-specific
const FALLBACK_POOL = [
  '1537996194471-e657df975ab4',
  '1570692890937-f60db72ac6b4',
  '1571403712587-f99cedc8cf99',
  '1528214096798-37891d32174c',
  '1568576411512-946a1a201093',
  '1531250552633-528fe896fdd4',
  '1555865138-193ba536d7e0',
  '1515700281303-5a0a73d9c584',
  '1541849546-216549ae216d',
  '1658411820124-93bddab6970f',
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
 * Always returns a URL — falls back to a hash-selected pool photo.
 */
export function getAiCoverImage(destination, width = 800) {
  if (!destination) {
    return `https://images.unsplash.com/photo-${FALLBACK_POOL[0]}?w=${width}&q=80`;
  }

  const needle = destination.toLowerCase();

  for (const entry of DESTINATION_MAP) {
    if (entry.keys.some(k => needle.includes(k))) {
      return `https://images.unsplash.com/photo-${entry.id}?w=${width}&q=80`;
    }
  }

  // Unknown destination — use a stable hash to pick from the fallback pool
  const idx = hashString(needle) % FALLBACK_POOL.length;
  return `https://images.unsplash.com/photo-${FALLBACK_POOL[idx]}?w=${width}&q=80`;
}
