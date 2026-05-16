// Manifest of in-game item artwork. Add an entry here when a real
// photograph or illustration replaces the emoji/SVG placeholder.
// Renderers check this map and prefer the image when present.
//
// Convention: keys match the catalog `id` field exactly so the
// lookup is just `WEAPON_IMAGES[w.id]`. Files live under
// /public/weapons/<id>.<ext> and are referenced by URL.

export const WEAPON_IMAGES = {
  ak47:    '/weapons/ak47.png',
  hk_psg1: '/weapons/hk_psg1.png',
};

export function weaponImage(id) {
  return WEAPON_IMAGES[id] || null;
}
