// Per-city stylised top-down layouts for CityMap. Each entry defines
// the characteristic geography (water, parks, road style, landmarks)
// so a player who knows the real city goes "yeah, that tracks". Not
// trying to be cartographically correct — just recognisable.
//
// Coordinate system: 0-100 in both axes. The map is rendered with
// preserveAspectRatio="none" so this is effectively a percentage grid.
//
// Schema:
//   waters[]   — water bodies. {type: 'rect'|'path', ...} drawn first under everything
//   parks[]    — green spaces. {x,y,w,h, name?}
//   roads      — 'manhattan' | 'radial' | 'organic' | 'grid' | 'coastal' | 'ring'
//                + custom roads array of {x1,y1,x2,y2,thick} for signature streets
//   landmarks[] — labelled flavour pins. {x,y, label, kind?: 'civic'|'tower'|'arena'}
//   accent     — palette tint (hex) for the asphalt — desert, snowy, lush, etc.
//   skyline    — optional silhouette band drawn at top to feel "city-sized".

const NY = {
  // Manhattan — narrow island, dense N/S grid, Hudson left, East River right,
  // Central Park sliced into the upper half.
  accent: '#1f1d1b',
  waters: [
    { type: 'rect', x: 0,  y: 0, w: 11, h: 100, fill: '#1e3a5f', name: 'Hudson' },
    { type: 'rect', x: 89, y: 0, w: 11, h: 100, fill: '#1e3a5f', name: 'East R.' },
  ],
  parks: [
    { x: 42, y: 18, w: 16, h: 24, name: 'Central Park' },
  ],
  roads: 'manhattan',
  customRoads: [
    // 5th Ave / Broadway diagonal
    { x1: 50, y1: 0, x2: 50, y2: 100, thick: 1.4 },
    { x1: 30, y1: 0, x2: 70, y2: 100, thick: 0.9, dash: true, label: 'Broadway' },
  ],
  landmarks: [
    { x: 50, y: 56, label: 'Times Sq' },
    { x: 50, y: 76, label: 'Empire St.' },
    { x: 50, y: 92, label: 'Wall St' },
  ],
  signature: 'island', // narrow + tall feel
};

const LONDON = {
  // Thames meanders W→E, S-shape; parks scattered north of river; older
  // streets so we render 'organic' roads — irregular, branching.
  accent: '#22201d',
  waters: [
    { type: 'path', d: 'M0 60 Q 25 50 45 62 Q 60 70 78 60 Q 92 53 100 58 L 100 70 Q 90 66 78 70 Q 60 80 45 72 Q 25 60 0 70 Z',
      fill: '#1e3a5f', name: 'Thames' },
  ],
  parks: [
    { x: 30, y: 28, w: 14, h: 12, name: 'Hyde Park' },
    { x: 52, y: 22, w: 8,  h: 8,  name: "Regent's" },
    { x: 16, y: 38, w: 8,  h: 8,  name: 'Holland' },
  ],
  roads: 'organic',
  landmarks: [
    { x: 56, y: 64, label: 'Tower Br.' },
    { x: 38, y: 50, label: 'Westmin.' },
    { x: 70, y: 74, label: 'Canary' },
  ],
};

const PARIS = {
  // Seine cuts through middle, Île de la Cité as small island, radial
  // boulevards from a central étoile. Cleaner than London.
  accent: '#23201c',
  waters: [
    { type: 'path', d: 'M0 56 Q 30 52 50 58 Q 70 64 100 58 L 100 64 Q 70 70 50 64 Q 30 58 0 62 Z',
      fill: '#1e3a5f', name: 'Seine' },
    // Île de la Cité
    { type: 'ellipse', cx: 52, cy: 60, rx: 5, ry: 1.6, fill: '#3a3a36' },
  ],
  parks: [
    { x: 18, y: 40, w: 9, h: 9, name: 'Bois' },      // Bois de Boulogne
    { x: 78, y: 42, w: 7, h: 7, name: 'Vincennes' },
    { x: 48, y: 30, w: 6, h: 5, name: 'Tuileries' },
  ],
  roads: 'radial',
  // Étoile sits at (50, 36) — twelve avenues fan from there.
  radialCenter: { x: 50, y: 36, count: 12, length: 38 },
  landmarks: [
    { x: 50, y: 36, label: 'Étoile' },
    { x: 44, y: 46, label: 'Eiffel' },
    { x: 60, y: 64, label: 'Notre-Dame' },
  ],
};

const BERLIN = {
  // Spree winds east/west, Tiergarten centre-left, ring of S-Bahn
  // implied, modest grid — ringed park.
  accent: '#21201c',
  waters: [
    { type: 'path', d: 'M0 48 Q 20 44 40 50 Q 60 56 80 50 Q 92 46 100 50 L 100 56 Q 92 52 80 56 Q 60 62 40 56 Q 20 50 0 54 Z',
      fill: '#1e3a5f', name: 'Spree' },
  ],
  parks: [
    { x: 38, y: 38, w: 14, h: 8, name: 'Tiergarten' },
    { x: 70, y: 32, w: 6,  h: 6, name: 'Volkspark' },
  ],
  roads: 'grid',
  customRoads: [
    // Unter den Linden
    { x1: 42, y1: 40, x2: 78, y2: 40, thick: 1.3 },
  ],
  landmarks: [
    { x: 50, y: 42, label: 'Brandenburg' },
    { x: 60, y: 56, label: 'Alexander' },
  ],
};

const MOSCOW = {
  // Moskva river big S-curve, concentric ring roads around the Kremlin,
  // snowy palette.
  accent: '#23211e',
  waters: [
    { type: 'path', d: 'M0 70 Q 20 80 40 68 Q 55 58 70 70 Q 85 80 100 72 L 100 80 Q 85 88 70 78 Q 55 66 40 76 Q 20 88 0 78 Z',
      fill: '#1e3a5f', name: 'Moskva' },
  ],
  parks: [
    { x: 14, y: 30, w: 8, h: 10, name: 'Sokolniki' },
    { x: 78, y: 24, w: 8, h: 8,  name: 'Izmaylovo' },
  ],
  roads: 'ring',
  ringCenter: { x: 50, y: 46, ringsAt: [9, 18, 30] },
  landmarks: [
    { x: 50, y: 46, label: 'Kremlin' },
    { x: 56, y: 52, label: 'Red Sq' },
  ],
};

const TOKYO = {
  // Bay on the south-east, Sumida river N-S, dense grid, Shinjuku
  // and Shibuya hubs marked.
  accent: '#1f1d1b',
  waters: [
    { type: 'path', d: 'M70 100 Q 80 70 100 60 L 100 100 Z', fill: '#1e3a5f', name: 'Tokyo Bay' },
    { type: 'rect', x: 64, y: 10, w: 2.5, h: 80, fill: '#1e3a5f', name: 'Sumida' },
  ],
  parks: [
    { x: 30, y: 36, w: 8, h: 8,   name: 'Shinjuku G.' },
    { x: 50, y: 40, w: 5, h: 5,   name: 'Imp. Palace' },
    { x: 24, y: 22, w: 5, h: 5,   name: 'Yoyogi' },
  ],
  roads: 'grid',
  landmarks: [
    { x: 30, y: 40, label: 'Shinjuku' },
    { x: 40, y: 56, label: 'Shibuya' },
    { x: 56, y: 50, label: 'Ginza' },
    { x: 68, y: 64, label: 'Tokyo Tower' },
  ],
};

const HONG_KONG = {
  // Victoria Harbour cuts E-W, island below, Kowloon above. Mountain
  // green band on south of island.
  accent: '#1f1d1b',
  waters: [
    { type: 'rect', x: 0, y: 44, w: 100, h: 16, fill: '#1e3a5f', name: 'Victoria H.' },
  ],
  parks: [
    { x: 18, y: 78, w: 64, h: 14, name: 'The Peak' }, // mountain band
    { x: 70, y: 22, w: 8,  h: 6,  name: 'Kowloon P.' },
  ],
  roads: 'coastal',
  landmarks: [
    { x: 50, y: 32, label: 'Tsim Sha Tsui' },
    { x: 50, y: 70, label: 'Central' },
    { x: 76, y: 68, label: 'Causeway Bay' },
  ],
  signature: 'harbour',
};

const SYDNEY = {
  // Big harbour bite from the north with the iconic prongs, Opera
  // House promontory, Botanic Garden, harbour bridge spans the gap.
  accent: '#1f1d1b',
  waters: [
    { type: 'path', d: 'M0 0 L 100 0 L 100 36 Q 88 38 80 30 Q 76 24 70 30 Q 60 42 52 32 Q 44 24 38 32 Q 30 42 22 34 Q 12 24 0 30 Z',
      fill: '#1e3a5f', name: 'Sydney Harbour' },
  ],
  parks: [
    { x: 56, y: 36, w: 10, h: 10, name: 'Botanic G.' },
    { x: 30, y: 46, w: 8,  h: 8,  name: 'Hyde Park' },
  ],
  roads: 'grid',
  customRoads: [
    // Harbour bridge spanning the gap
    { x1: 38, y1: 30, x2: 38, y2: 8, thick: 1.6, label: 'Harbour Br.' },
  ],
  landmarks: [
    { x: 60, y: 32, label: 'Opera' },
    { x: 50, y: 52, label: 'CBD' },
  ],
};

const RIO = {
  // Mountains everywhere (irregular green blobs), beach arcs along
  // the south, the bay on the east.
  accent: '#1f1d1b',
  waters: [
    { type: 'path', d: 'M82 0 Q 78 30 88 50 Q 96 70 100 80 L 100 0 Z', fill: '#1e3a5f', name: 'Guanabara Bay' },
    // Copacabana beach arc
    { type: 'path', d: 'M14 88 Q 40 84 70 90 Q 78 92 80 96 L 78 100 L 12 100 Z', fill: '#c2a878', name: 'Copacabana' },
  ],
  parks: [
    // Tijuca / mountain blobs
    { x: 30, y: 30, w: 18, h: 16, name: 'Tijuca' },
    { x: 56, y: 50, w: 10, h: 10, name: 'Sugarloaf' },
    { x: 14, y: 60, w: 10, h: 10, name: 'Corcovado' },
  ],
  roads: 'organic',
  landmarks: [
    { x: 22, y: 64, label: 'Christ' },
    { x: 60, y: 56, label: 'Sugarloaf' },
    { x: 50, y: 86, label: 'Ipanema' },
  ],
};

const LA = {
  // Sprawling grid, Pacific on the west, Hollywood hills band north,
  // freeways as bold diagonals.
  accent: '#1f1d1b',
  waters: [
    { type: 'rect', x: 0, y: 0, w: 9, h: 100, fill: '#1e3a5f', name: 'Pacific' },
    { type: 'path', d: 'M0 88 Q 20 90 40 86 Q 60 82 80 90 L 80 100 L 0 100 Z', fill: '#c2a878', name: 'Beach' },
  ],
  parks: [
    { x: 32, y: 12, w: 30, h: 12, name: 'Hollywood Hills' }, // hill band
    { x: 70, y: 36, w: 8,  h: 8,  name: 'Griffith' },
  ],
  roads: 'grid',
  customRoads: [
    // 405 freeway
    { x1: 18, y1: 0, x2: 26, y2: 100, thick: 1.4 },
    // 101 freeway
    { x1: 36, y1: 16, x2: 96, y2: 28, thick: 1.4 },
    // 110 freeway
    { x1: 50, y1: 100, x2: 60, y2: 16, thick: 1.2 },
  ],
  landmarks: [
    { x: 44, y: 18, label: 'Hollywood' },
    { x: 64, y: 38, label: 'Downtown' },
    { x: 30, y: 60, label: 'Beverly' },
    { x: 22, y: 78, label: 'Santa Monica' },
  ],
};

const MIAMI = {
  // Peninsula + Miami Beach barrier island east, bay between, palm-tree
  // sandy palette.
  accent: '#1f1d1b',
  waters: [
    { type: 'rect', x: 70, y: 0, w: 10, h: 100, fill: '#1e3a5f', name: 'Bay' },
    { type: 'path', d: 'M0 92 Q 50 88 100 92 L 100 100 L 0 100 Z', fill: '#c2a878', name: 'Beach' },
  ],
  parks: [
    { x: 40, y: 32, w: 10, h: 10, name: 'Bayfront' },
    { x: 86, y: 34, w: 8,  h: 12, name: 'S. Beach' }, // barrier island
  ],
  roads: 'grid',
  customRoads: [
    // Causeway across bay
    { x1: 50, y1: 36, x2: 86, y2: 38, thick: 1.4, label: 'Causeway' },
  ],
  landmarks: [
    { x: 90, y: 40, label: 'S. Beach' },
    { x: 40, y: 50, label: 'Downtown' },
    { x: 30, y: 24, label: 'Wynwood' },
  ],
};

const DUBAI = {
  // Coastline arc south-west, palm island, big highway (Sheikh Zayed Rd).
  accent: '#23201c', // sandy tint
  waters: [
    { type: 'path', d: 'M0 60 Q 30 56 60 64 Q 80 70 100 66 L 100 100 L 0 100 Z', fill: '#1e3a5f', name: 'Gulf' },
    // Palm Jumeirah — stylised
    { type: 'path', d: 'M14 76 L 22 70 L 30 76 L 22 82 Z', fill: '#3a3a36', name: 'Palm' },
  ],
  parks: [
    { x: 60, y: 30, w: 10, h: 10, name: 'Safa Park' },
  ],
  roads: 'desert',
  customRoads: [
    // Sheikh Zayed Road — the long highway
    { x1: 0, y1: 50, x2: 100, y2: 56, thick: 2.0, label: 'Sheikh Zayed Rd' },
  ],
  landmarks: [
    { x: 44, y: 50, label: 'Burj' },
    { x: 64, y: 48, label: 'Marina' },
    { x: 24, y: 38, label: 'Old Dubai' },
  ],
};

const KINGSTON = {
  // Harbour to the south, mountain band north, low-rise grid centre.
  accent: '#1f1d1b',
  waters: [
    { type: 'path', d: 'M0 78 Q 30 82 60 76 Q 80 72 100 78 L 100 100 L 0 100 Z', fill: '#1e3a5f', name: 'Harbour' },
  ],
  parks: [
    { x: 8,  y: 4,  w: 84, h: 16, name: 'Blue Mtns' }, // mountain band
    { x: 42, y: 38, w: 10, h: 8,  name: 'Heroes Park' },
  ],
  roads: 'organic',
  landmarks: [
    { x: 48, y: 42, label: 'Half Way Tree' },
    { x: 56, y: 64, label: 'Downtown' },
  ],
};

const CAPE_TOWN = {
  // Table Mountain dominates centre-south, coast on west and south,
  // city bowl tucked between mountain and sea.
  accent: '#1f1d1b',
  waters: [
    { type: 'rect', x: 0, y: 0, w: 9, h: 100, fill: '#1e3a5f', name: 'Atlantic' },
    { type: 'path', d: 'M0 86 Q 30 82 60 86 Q 80 88 100 84 L 100 100 L 0 100 Z', fill: '#1e3a5f', name: 'False Bay' },
  ],
  parks: [
    // Table Mountain — broad flat-top band centred
    { x: 20, y: 56, w: 50, h: 18, name: 'Table Mtn' },
    { x: 14, y: 38, w: 8,  h: 8,  name: 'Lion’s Head' },
  ],
  roads: 'organic',
  landmarks: [
    { x: 28, y: 32, label: 'V&A Wf' },
    { x: 46, y: 42, label: 'CBD' },
    { x: 70, y: 50, label: 'Camps Bay' },
  ],
};

export const CITY_LAYOUTS = {
  new_york: NY,
  london: LONDON,
  paris: PARIS,
  berlin: BERLIN,
  moscow: MOSCOW,
  tokyo: TOKYO,
  hong_kong: HONG_KONG,
  sydney: SYDNEY,
  rio: RIO,
  los_angeles: LA,
  miami: MIAMI,
  dubai: DUBAI,
  kingston: KINGSTON,
  cape_town: CAPE_TOWN,
};

// Fallback for any city without a hand-authored layout — generic grid
// with a faint river ribbon.
export const DEFAULT_LAYOUT = {
  accent: '#1f1d1b',
  waters: [
    { type: 'path', d: 'M0 65 Q 25 62 45 70 T 100 78 L 100 100 L 0 100 Z',
      fill: '#1e3a5f', opacity: 0.5 },
  ],
  parks: [{ x: 44, y: 6, w: 12, h: 14, name: 'Park' }],
  roads: 'grid',
  landmarks: [],
};

export function layoutFor(cityId) {
  return CITY_LAYOUTS[cityId] || DEFAULT_LAYOUT;
}
