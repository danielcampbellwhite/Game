// One-shot Voronoi polygon generator. Run with `node scripts/gen-areas.mjs > ../server/src/data-areas.js`
// Produces a JS module with the static polygon data baked in.
//
// Per city: place N seed points using a deterministic seeded RNG inside
// the city's bbox, compute the Voronoi diagram via d3-delaunay, clip to
// bbox. Areas get short Hayes/cardinal-direction names so they read at
// a glance ("North Docks", "Central West", etc.).
import { Delaunay } from 'd3-delaunay';

// City catalogue mirrored from server/src/data.js — kept in sync by hand;
// this script only runs on demand.
const CITIES = {
  // hub cities — 9 areas
  new_york:    { center: [40.7580, -73.9855], spanKm: 6,  count: 9 },
  los_angeles: { center: [34.0522, -118.2437], spanKm: 9, count: 9 },
  london:      { center: [51.5074,  -0.1278], spanKm: 6,  count: 9 },
  tokyo:       { center: [35.6762, 139.6503], spanKm: 8,  count: 9 },
  hong_kong:   { center: [22.3193, 114.1694], spanKm: 6,  count: 9 },
  dubai:       { center: [25.2048,  55.2708], spanKm: 9,  count: 9 },
  // mid cities — 6 areas
  paris:       { center: [48.8566,   2.3522], spanKm: 5,  count: 6 },
  berlin:      { center: [52.5200,  13.4050], spanKm: 6,  count: 6 },
  miami:       { center: [25.7617, -80.1918], spanKm: 6,  count: 6 },
  sydney:      { center: [-33.8688, 151.2093], spanKm: 6, count: 6 },
  moscow:      { center: [55.7558,  37.6173], spanKm: 8,  count: 6 },
  rio:         { center: [-22.9068, -43.1729], spanKm: 7, count: 6 },
  // small cities — 4 areas
  kingston:    { center: [17.9970, -76.7936], spanKm: 6,  count: 4 },
  cape_town:   { center: [-33.9249, 18.4241], spanKm: 8,  count: 4 },
};

// Mulberry32 — small, fast, deterministic. Same seed → same areas every
// rebuild, so existing capture state in the DB still maps to the same
// polygon visually.
function mulberry32(seed) {
  return () => {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Convert km offset from city centre into degrees (lat/lng). Latitude
// is fixed at 1°≈111km; longitude scales with cos(lat).
function bboxFor(view) {
  const [lat, lng] = view.center;
  const halfDegLat = (view.spanKm / 2) / 111;
  const halfDegLng = (view.spanKm / 2) / (111 * Math.cos(lat * Math.PI / 180));
  return {
    south: lat - halfDegLat,
    north: lat + halfDegLat,
    west:  lng - halfDegLng,
    east:  lng + halfDegLng,
  };
}

// Cardinal-name a polygon based on its centroid relative to the bbox
// centre. 9-area cities can hit all 9 cells (NW/N/NE/W/Central/E/SW/S/SE);
// smaller cities will collide on coarser names — we de-dupe with a
// trailing index where needed.
const NAMES = [
  ['North-West Quarter', 'North End',     'North-East Quarter'],
  ['West Side',          'Central',       'East Side'         ],
  ['South-West Quarter', 'South End',     'South-East Quarter'],
];
function nameFor(centroid, bbox, used) {
  const dx = (centroid[0] - (bbox.west + bbox.east) / 2) / ((bbox.east - bbox.west) / 2);
  const dy = (centroid[1] - (bbox.south + bbox.north) / 2) / ((bbox.north - bbox.south) / 2);
  // Map to 3×3 grid: -1..-0.33 → 0, -0.33..0.33 → 1, 0.33..1 → 2
  const col = dx < -0.33 ? 0 : dx > 0.33 ? 2 : 1;
  const row = dy > 0.33 ? 0 : dy < -0.33 ? 2 : 1; // y up = north
  let base = NAMES[row][col];
  if (used.has(base)) {
    let n = 2;
    while (used.has(`${base} ${n}`)) n++;
    base = `${base} ${n}`;
  }
  used.add(base);
  return base;
}

function genCity(cityId, view, seed) {
  const rng = mulberry32(seed);
  const bbox = bboxFor(view);
  // Seeds in lng,lat order (d3-delaunay is x,y).
  const seeds = Array.from({ length: view.count }, () => [
    bbox.west + rng() * (bbox.east - bbox.west),
    bbox.south + rng() * (bbox.north - bbox.south),
  ]);
  const delaunay = Delaunay.from(seeds);
  const voronoi = delaunay.voronoi([bbox.west, bbox.south, bbox.east, bbox.north]);
  const used = new Set();
  return seeds.map((s, i) => {
    const poly = voronoi.cellPolygon(i);
    if (!poly) return null;
    // Centroid for naming + label placement.
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x; cy += y; }
    cx /= poly.length; cy /= poly.length;
    const name = nameFor([cx, cy], bbox, used);
    return {
      id: `${cityId}_a${i + 1}`,
      city: cityId,
      name,
      // Polygon as [[lat, lng], ...] for Leaflet (it expects lat-first).
      polygon: poly.map(([lng, lat]) => [+lat.toFixed(5), +lng.toFixed(5)]),
      centroid: [+cy.toFixed(5), +cx.toFixed(5)],
    };
  }).filter(Boolean);
}

const out = {};
for (const [cityId, view] of Object.entries(CITIES)) {
  // Hash cityId to int as the seed so the same city always generates
  // the same polygons.
  const seed = [...cityId].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  out[cityId] = genCity(cityId, view, seed);
}

// Serialise as a generated JS module so the server can import it
// directly. JSON file would also work but a module hangs nicely off
// the existing data layer.
const totalAreas = Object.values(out).reduce((n, list) => n + list.length, 0);
process.stderr.write(`Generated ${totalAreas} areas across ${Object.keys(out).length} cities\n`);
process.stdout.write(`// Auto-generated by client/scripts/gen-areas.mjs — do not hand-edit.\n`);
process.stdout.write(`// Re-run with: node client/scripts/gen-areas.mjs > server/src/data-areas.js\n`);
process.stdout.write(`export const CITY_AREAS = ${JSON.stringify(out, null, 2)};\n\n`);
process.stdout.write(`export const ALL_AREAS = Object.values(CITY_AREAS).flat();\n`);
process.stdout.write(`export const areaById = id => ALL_AREAS.find(a => a.id === id) || null;\n`);
process.stdout.write(`export const areasInCity = city => CITY_AREAS[city] || [];\n`);
