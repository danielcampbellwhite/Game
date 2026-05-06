import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Real OSM-backed city map. Each city has a centre and zoom that
// frames its core; venues are scattered around that centre using
// percentage offsets into a fixed bounding box, so the existing
// (x, y) layout used by the previous stylised map carries over.
//
// Tile source: Carto "dark_all" — monochrome dark basemap that fits
// the game's noir aesthetic. Free for low-volume use, attribution
// retained in the bottom-right.

const VENUES = [
  // Civic / financial
  { to: '/bank',           name: 'Bank',           x: 22, y: 18, tone: 'gold' },
  { to: '/stocks',         name: 'Stock Broker',   x: 30, y: 27, tone: 'gold' },
  { to: '/property',       name: 'Estate Agent',   x: 18, y: 32, tone: 'gold' },
  { to: '/jail',           name: 'Jail',           x: 13, y: 14, tone: 'gold' },
  // Medical / academic
  { to: '/hospital',       name: 'Hospital',       x: 78, y: 16, tone: 'gold' },
  { to: '/shop/pharmacy',  name: 'Pharmacy',       x: 70, y: 22, tone: 'gold' },
  { to: '/university',     name: 'University',     x: 86, y: 28, tone: 'gold' },
  { to: '/driving-school', name: 'Driving School', x: 78, y: 34, tone: 'gold' },
  // High street
  { to: '/general-store',     name: 'General Store',   x: 42, y: 46, tone: 'gold' },
  { to: '/shop/coffee',       name: 'Coffee Shop',     x: 50, y: 40, tone: 'gold' },
  { to: '/shop/gift_shop',    name: 'Gift Shop',       x: 58, y: 46, tone: 'gold' },
  { to: '/shop/deli',         name: 'Late-Night Deli', x: 50, y: 52, tone: 'gold' },
  { to: '/shop/off_licence',  name: 'Off-Licence',     x: 38, y: 54, tone: 'gold' },
  { to: '/gun-store',         name: 'Weapon Dealer',   x: 62, y: 54, tone: 'gold' },
  // Training
  { to: '/gym',            name: 'Gym',            x: 18, y: 50, tone: 'gold' },
  { to: '/range',          name: 'Shooting Range', x: 82, y: 50, tone: 'gold' },
  // Commerce / transport
  { to: '/dealership',     name: 'Car Dealership', x: 72, y: 70, tone: 'gold' },
  { to: '/repair',         name: 'Repair Shop',    x: 80, y: 76, tone: 'gold' },
  { to: '/travel',         name: 'Airport',        x: 88, y: 88, tone: 'gold' },
  // Underworld
  { to: '/chop-shop',      name: 'Chop Shop',      x: 22, y: 84, tone: 'blood' },
  { to: '/fence',          name: 'The Fence',      x: 32, y: 78, tone: 'blood' },
  { to: '/casino',         name: 'Casino',         x: 30, y: 92, tone: 'blood' },
  { to: '/bookmaker',      name: 'Bookmaker',      x: 42, y: 88, tone: 'blood' },
];

// Per-city map view: real lat/lng for the city centre + a default
// zoom level that frames the central business district. spanKm is
// the side length of the bounding box used to spread venue pins
// around the centre — bigger spread = more legible map, smaller
// spread = denser cluster.
const CITY_VIEWS = {
  new_york:    { center: [40.7580, -73.9855], zoom: 13, spanKm: 6 },
  los_angeles: { center: [34.0522, -118.2437], zoom: 12, spanKm: 9 },
  miami:       { center: [25.7617, -80.1918], zoom: 13, spanKm: 6 },
  kingston:    { center: [17.9970, -76.7936], zoom: 13, spanKm: 6 },
  rio:         { center: [-22.9068, -43.1729], zoom: 13, spanKm: 7 },
  london:      { center: [51.5074,  -0.1278], zoom: 13, spanKm: 6 },
  paris:       { center: [48.8566,   2.3522], zoom: 13, spanKm: 5 },
  berlin:      { center: [52.5200,  13.4050], zoom: 13, spanKm: 6 },
  moscow:      { center: [55.7558,  37.6173], zoom: 12, spanKm: 8 },
  dubai:       { center: [25.2048,  55.2708], zoom: 12, spanKm: 9 },
  tokyo:       { center: [35.6762, 139.6503], zoom: 12, spanKm: 8 },
  hong_kong:   { center: [22.3193, 114.1694], zoom: 13, spanKm: 6 },
  sydney:      { center: [-33.8688, 151.2093], zoom: 13, spanKm: 6 },
  cape_town:   { center: [-33.9249,  18.4241], zoom: 12, spanKm: 8 },
};
const DEFAULT_VIEW = { center: [40.7580, -73.9855], zoom: 13, spanKm: 6 };

// Convert a venue's percentage layout (x: 0..100 = W→E, y: 0..100 =
// N→S) into a real lat/lng inside the city's bounding box.
function venueLatLng(view, venue) {
  const [lat, lng] = view.center;
  const halfDegLat = (view.spanKm / 2) / 111;
  const halfDegLng = (view.spanKm / 2) / (111 * Math.cos(lat * Math.PI / 180));
  const dLng = (venue.x / 100 - 0.5) * 2 * halfDegLng;
  const dLat = -(venue.y / 100 - 0.5) * 2 * halfDegLat;
  return [lat + dLat, lng + dLng];
}

const TONE_FILL = { gold: '#facc15', blood: '#ef4444' };
const TONE_STROKE = { gold: '#fde047', blood: '#fca5a5' };

// Custom DivIcon — a circular dot with a labelled tag below. Inline
// SVG + HTML so we don't ship Leaflet's default marker images.
function venueIcon(v) {
  const fill = TONE_FILL[v.tone];
  const stroke = TONE_STROKE[v.tone];
  return L.divIcon({
    html: `
      <div class="city-pin" style="--fill:${fill};--stroke:${stroke}">
        <span class="city-pin-dot"></span>
        <span class="city-pin-label">${v.name}</span>
      </div>
    `,
    className: '',
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

export default function CityMap({ city = 'new_york' }) {
  const view = CITY_VIEWS[city] || DEFAULT_VIEW;
  const navigate = useNavigate();
  // Memoise icons so they don't re-instantiate every render.
  const icons = useMemo(() => Object.fromEntries(VENUES.map(v => [v.to, venueIcon(v)])), []);

  // Re-key the MapContainer on city change so it remounts cleanly
  // (Leaflet doesn't reactively update center/zoom from props once
  // mounted — would otherwise need a useMap helper).
  return (
    <div className="space-y-2">
      <style>{`
        .leaflet-container { background:#0a0908; font-family: inherit; }
        .leaflet-control-attribution { background: rgba(10,9,8,0.7) !important; color: rgba(245,245,244,0.55) !important; font-size: 9px !important; }
        .leaflet-control-attribution a { color: rgba(245,245,244,0.75) !important; }
        .leaflet-control-zoom a {
          background: rgba(10,9,8,0.85) !important; color: #f5f5f4 !important;
          border-color: rgba(255,255,255,0.15) !important;
        }
        .leaflet-control-zoom a:hover { background: rgba(20,17,15,0.95) !important; border-color: rgba(220,38,38,0.6) !important; }
        .city-pin { transform: translate(-50%, -100%); cursor: pointer; pointer-events: auto; }
        .city-pin-dot {
          display: block; width: 11px; height: 11px; border-radius: 9999px;
          background: var(--fill); box-shadow: 0 0 0 2px var(--stroke), 0 0 8px rgba(0,0,0,0.7);
          margin: 0 auto;
        }
        .city-pin-label {
          display: block; margin-top: 2px;
          font-size: 10px; font-weight: 600; line-height: 1.1;
          color: #f5f5f4; text-align: center; white-space: nowrap;
          padding: 1px 5px; border-radius: 3px;
          background: rgba(10,9,8,0.85);
          text-shadow: 0 1px 2px rgba(0,0,0,0.9);
        }
        .city-pin:hover .city-pin-dot { transform: scale(1.25); }
      `}</style>
      <div className="relative w-full aspect-square max-w-5xl mx-auto rounded-xl border border-ink-100/10 overflow-hidden bg-ink-1000">
        <MapContainer
          key={city}
          center={view.center}
          zoom={view.zoom}
          minZoom={11}
          maxZoom={17}
          scrollWheelZoom
          style={{ height: '100%', width: '100%' }}
          attributionControl>
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
            subdomains={['a', 'b', 'c', 'd']}
          />
          {VENUES.map(v => (
            <Marker
              key={v.to}
              position={venueLatLng(view, v)}
              icon={icons[v.to]}
              eventHandlers={{ click: () => navigate(v.to) }}
            />
          ))}
        </MapContainer>
        {/* Legend overlay */}
        <div className="absolute bottom-2 left-2 z-[1000] text-[9px] text-ink-100/55 bg-ink-950/80 border border-ink-100/10 rounded px-1.5 py-1 leading-tight pointer-events-none">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gold-400 ring-1 ring-gold-200/60" /> Around town</div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blood-500 ring-1 ring-blood-300/50" /> Underworld</div>
        </div>
      </div>
      <p className="text-[10px] text-ink-100/45 text-center">
        Real streets via OpenStreetMap · scroll or pinch to zoom · drag to pan · tap any pin to walk in.
      </p>
    </div>
  );
}
