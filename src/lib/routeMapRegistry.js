/**
 * routeMapRegistry.js
 *
 * Single source of truth for which itineraries have route map components
 * and what route points they cover. Used by the backoffice to display status;
 * not used at runtime on the public site or in PDF generation.
 */

export const ROUTE_MAP_REGISTRY = {
  'morocco-motorcycle-expedition': {
    points: ['Chefchaouen', 'Fes', 'Errachidia', 'Merzouga', 'Ouarzazate', 'Marrakech', 'Oualidia', 'Casablanca', 'Rabat', 'Tangier Med'],
  },
  'japan-grand-cultural-journey': {
    points: ['Tokyo', 'Kanazawa', 'Shirakawa-go', 'Takayama', 'Kyoto', 'Osaka', 'Kōyasan', 'Himeji', 'Okayama', 'Hakone'],
  },
  'philippines-island-journey': {
    points: ['Manila', 'San Vicente', 'El Nido', 'Coron', 'Boracay'],
  },
  'california-american-west': {
    points: ['San Francisco', 'Yosemite', 'Las Vegas', 'Antelope Canyon', 'Grand Canyon', 'Los Angeles', 'San Diego'],
  },
  'california-american-west-16-days': {
    points: ['San Francisco', 'Yosemite', 'Las Vegas', 'Antelope Canyon', 'Grand Canyon', 'Los Angeles', 'San Diego'],
  },
  'california-american-west-12-days': {
    points: ['San Francisco', 'Yosemite', 'Las Vegas', 'Grand Canyon', 'Los Angeles'],
  },
  'california-american-west-8-days': {
    points: ['Los Angeles', 'Joshua Tree', 'Las Vegas', 'Zion', 'Bryce Canyon'],
  },
  'tuscany-wine-roads-in-7-days': {
    points: ['San Gimignano', 'Siena', "Val d'Orcia", 'Montepulciano', 'Cortona', 'Pitigliano', 'Saturnia', 'Montalcino', 'San Galgano', 'Volterra', 'Lucca', 'Pisa'],
  },
  'croatia-by-sea-dubrovnik-hvar-and-split': {
    points: ['Dubrovnik', 'Hvar', 'Pakleni Islands', 'Vis / Komiža', 'Split'],
  },
  'northern-england-roadtrip': {
    points: ['Leeds', 'Malham', 'Ambleside / Lake District', 'Grasmere', 'Durham', 'Whitby', 'Scarborough', 'York'],
  },
};
