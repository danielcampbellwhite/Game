import React from 'react';

// Inline SVG renderer for clothing items. Each item is a 100x100
// viewBox with gradient-shaded paths, textures, and small details
// (stitching, buttons, brand marks) to give it presence. Sizes well
// down to 32px and up to ~256px before the line work goes thin.
//
// Photo-realistic raster art is a non-goal — that's what an `image`
// field on the catalog is for. The wardrobe UI prefers a registered
// image asset when one is supplied; otherwise it falls back to this
// component.

// Stable, unique gradient ids per render so two icons on the same
// page don't collide. The `${id}-...` prefix keeps it scoped.
function defsId(id, suffix) { return `cl-${id}-${suffix}`; }

export default function ClothingSvg({ id, size = 64, className = '' }) {
  const Item = ITEMS[id];
  if (!Item) {
    return (
      <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
        <rect x="10" y="10" width="80" height="80" rx="8" fill="#1f2937" stroke="#374151" />
        <text x="50" y="56" textAnchor="middle" fill="#6b7280" fontSize="10" fontFamily="monospace">{id || '?'}</text>
      </svg>
    );
  }
  return <Item size={size} className={className} idKey={id} />;
}

// ─────────────────────── Hats ─────────────────────────────

function SnapbackRed({ size, className, idKey }) {
  const g1 = defsId(idKey, 'crown');
  const g2 = defsId(idKey, 'brim');
  const g3 = defsId(idKey, 'shine');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="0.4" stopColor="#b91c1c" />
          <stop offset="1" stopColor="#7f1d1d" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="1" stopColor="#450a0a" />
        </linearGradient>
        <radialGradient id={g3} cx="0.4" cy="0.3" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Crown — dome of the cap */}
      <path d="M16 52 Q18 22 50 18 Q82 22 84 52 Q60 56 50 56 Q40 56 16 52 Z" fill={`url(#${g1})`} />
      <path d="M16 52 Q18 22 50 18 Q82 22 84 52 Q60 56 50 56 Q40 56 16 52 Z" fill={`url(#${g3})`} />
      {/* Crown panel seams */}
      <path d="M50 18 L50 56" stroke="#450a0a" strokeWidth="0.4" opacity="0.55" />
      <path d="M30 21 Q38 38 38 55" stroke="#450a0a" strokeWidth="0.3" opacity="0.4" fill="none" />
      <path d="M70 21 Q62 38 62 55" stroke="#450a0a" strokeWidth="0.3" opacity="0.4" fill="none" />
      {/* Brim — flat front */}
      <path d="M10 52 Q50 60 90 52 Q92 56 90 60 Q50 70 10 60 Q8 56 10 52 Z" fill={`url(#${g2})`} />
      <path d="M10 53 Q50 60 90 53" stroke="#fff" strokeWidth="0.5" opacity="0.2" fill="none" />
      {/* Stitching under brim edge */}
      <path d="M14 58 Q50 66 86 58" stroke="#fde047" strokeWidth="0.5" opacity="0.5" fill="none" strokeDasharray="1 1.5" />
      {/* Centre embroidery — a small monogram dot */}
      <circle cx="50" cy="36" r="3.5" fill="#fde047" opacity="0.85" />
      <text x="50" y="38.5" textAnchor="middle" fill="#7f1d1d" fontSize="4.5" fontWeight="bold" fontFamily="serif">M</text>
      {/* Adjuster strap suggestion at the back */}
      <path d="M82 52 Q86 54 84 58" stroke="#450a0a" strokeWidth="0.6" fill="none" opacity="0.5" />
    </svg>
  );
}

function BucketHatCamo({ size, className, idKey }) {
  const g1 = defsId(idKey, 'base');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3f4a2a" />
          <stop offset="1" stopColor="#1f2912" />
        </linearGradient>
      </defs>
      {/* Crown — short cylindrical */}
      <path d="M22 50 L22 30 Q22 22 50 22 Q78 22 78 30 L78 50 Z" fill={`url(#${g1})`} />
      {/* Camo patches scattered on crown */}
      <ellipse cx="32" cy="32" rx="6" ry="4" fill="#556b3e" />
      <ellipse cx="46" cy="28" rx="5" ry="3" fill="#7d8757" />
      <ellipse cx="61" cy="34" rx="6" ry="4" fill="#2a3318" />
      <ellipse cx="70" cy="42" rx="4" ry="3" fill="#556b3e" />
      <ellipse cx="38" cy="44" rx="5" ry="3" fill="#7d8757" />
      <ellipse cx="55" cy="46" rx="4" ry="2.5" fill="#2a3318" />
      {/* Crown rim shadow */}
      <ellipse cx="50" cy="50" rx="28" ry="3" fill="#000" opacity="0.4" />
      {/* Wide floppy brim */}
      <path d="M8 50 Q50 64 92 50 Q94 60 88 66 Q50 76 12 66 Q6 60 8 50 Z" fill="#3f4a2a" />
      <ellipse cx="22" cy="58" rx="6" ry="3" fill="#556b3e" />
      <ellipse cx="78" cy="58" rx="5" ry="3" fill="#7d8757" />
      <ellipse cx="50" cy="64" rx="8" ry="3" fill="#2a3318" />
      {/* Top-stitching along brim */}
      <path d="M12 64 Q50 74 88 64" stroke="#222" strokeWidth="0.4" fill="none" opacity="0.6" strokeDasharray="1.5 1.2" />
    </svg>
  );
}

function FedoraCharcoal({ size, className, idKey }) {
  const g1 = defsId(idKey, 'crown');
  const g2 = defsId(idKey, 'brim');
  const g3 = defsId(idKey, 'band');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#374151" />
          <stop offset="0.55" stopColor="#1f2937" />
          <stop offset="1" stopColor="#111827" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1f2937" />
          <stop offset="1" stopColor="#0b0f1a" />
        </linearGradient>
        <linearGradient id={g3} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
      </defs>
      {/* Crown with pinched centre */}
      <path d="M26 56 Q24 26 36 22 Q44 18 50 22 Q56 18 64 22 Q76 26 74 56 Z" fill={`url(#${g1})`} />
      {/* Centre pinch line */}
      <path d="M50 24 Q49 32 50 50" stroke="#0b0f1a" strokeWidth="1.2" fill="none" opacity="0.6" />
      <path d="M48 28 Q47 36 48 50" stroke="#fff" strokeWidth="0.3" fill="none" opacity="0.15" />
      {/* Side dents */}
      <path d="M30 36 Q32 42 30 48" stroke="#0b0f1a" strokeWidth="0.6" fill="none" opacity="0.5" />
      <path d="M70 36 Q68 42 70 48" stroke="#0b0f1a" strokeWidth="0.6" fill="none" opacity="0.5" />
      {/* Hat band — grosgrain */}
      <path d="M26 55 Q50 60 74 55 L74 60 Q50 65 26 60 Z" fill={`url(#${g3})`} />
      <path d="M48 58 L52 58 L52 62 L48 62 Z" fill="#1f2937" />
      <path d="M26 57 Q50 62 74 57" stroke="#374151" strokeWidth="0.3" fill="none" opacity="0.5" />
      {/* Brim — wider than crown */}
      <path d="M10 60 Q50 74 90 60 Q92 66 88 70 Q50 80 12 70 Q8 66 10 60 Z" fill={`url(#${g2})`} />
      {/* Brim highlight along the upturned rear */}
      <path d="M14 63 Q50 73 86 63" stroke="#9ca3af" strokeWidth="0.4" fill="none" opacity="0.25" />
      <path d="M14 67 Q50 75 86 67" stroke="#000" strokeWidth="0.5" fill="none" opacity="0.5" />
    </svg>
  );
}

function PanamaCream({ size, className, idKey }) {
  const g1 = defsId(idKey, 'crown');
  const g2 = defsId(idKey, 'weave');
  const g3 = defsId(idKey, 'band');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f5ecd5" />
          <stop offset="1" stopColor="#c2a878" />
        </linearGradient>
        <pattern id={g2} x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M0 0 L2 2 M2 0 L0 2" stroke="#8a7042" strokeWidth="0.2" />
        </pattern>
        <linearGradient id={g3} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0a0a0a" />
          <stop offset="1" stopColor="#1f2937" />
        </linearGradient>
      </defs>
      {/* Crown */}
      <path d="M26 56 Q24 26 36 22 Q44 18 50 22 Q56 18 64 22 Q76 26 74 56 Z" fill={`url(#${g1})`} />
      {/* Woven texture overlay */}
      <path d="M26 56 Q24 26 36 22 Q44 18 50 22 Q56 18 64 22 Q76 26 74 56 Z" fill={`url(#${g2})`} opacity="0.6" />
      {/* Centre pinch */}
      <path d="M50 24 Q49 32 50 50" stroke="#8a7042" strokeWidth="0.8" fill="none" opacity="0.7" />
      {/* Black band */}
      <path d="M26 55 Q50 60 74 55 L74 60 Q50 65 26 60 Z" fill={`url(#${g3})`} />
      {/* Brim */}
      <path d="M10 60 Q50 74 90 60 Q92 66 88 70 Q50 80 12 70 Q8 66 10 60 Z" fill="#e6d4a8" />
      <path d="M10 60 Q50 74 90 60 Q92 66 88 70 Q50 80 12 70 Q8 66 10 60 Z" fill={`url(#${g2})`} opacity="0.5" />
      {/* Brim shadow underside */}
      <path d="M14 66 Q50 74 86 66" stroke="#8a7042" strokeWidth="0.4" fill="none" opacity="0.5" />
    </svg>
  );
}

// ─────────────────────── Tops ─────────────────────────────

function TracksuitTopBlue({ size, className, idKey }) {
  const g1 = defsId(idKey, 'body');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="0.5" stopColor="#2563eb" />
          <stop offset="1" stopColor="#1e3a8a" />
        </linearGradient>
      </defs>
      {/* Sleeves */}
      <path d="M14 28 L26 22 L34 32 L30 64 L18 62 Z" fill={`url(#${g1})`} />
      <path d="M86 28 L74 22 L66 32 L70 64 L82 62 Z" fill={`url(#${g1})`} />
      {/* Body */}
      <path d="M30 28 Q40 22 50 22 Q60 22 70 28 L72 80 L28 80 Z" fill={`url(#${g1})`} />
      {/* Centre stripe — zipper */}
      <line x1="50" y1="28" x2="50" y2="80" stroke="#0b1d4a" strokeWidth="1.2" />
      <line x1="50" y1="28" x2="50" y2="80" stroke="#9ca3af" strokeWidth="0.3" strokeDasharray="1.5 0.8" />
      {/* Stand-up collar */}
      <path d="M40 28 Q50 24 60 28 L60 32 Q50 30 40 32 Z" fill="#0b1d4a" />
      {/* White side stripes on sleeves */}
      <path d="M20 28 L18 62" stroke="#fff" strokeWidth="2.5" />
      <path d="M80 28 L82 62" stroke="#fff" strokeWidth="2.5" />
      {/* Body fold shading */}
      <path d="M36 36 Q40 60 38 78" stroke="#0b1d4a" strokeWidth="0.5" opacity="0.4" fill="none" />
      <path d="M64 36 Q60 60 62 78" stroke="#0b1d4a" strokeWidth="0.5" opacity="0.4" fill="none" />
      {/* Highlight along left side of body */}
      <path d="M34 30 Q35 50 38 78" stroke="#60a5fa" strokeWidth="1" opacity="0.4" fill="none" />
      {/* Zipper pull */}
      <rect x="48.5" y="28" width="3" height="3" rx="0.5" fill="#9ca3af" />
      {/* Hem ribbing */}
      <path d="M28 78 L72 78 L72 82 L28 82 Z" fill="#0b1d4a" />
      <path d="M28 80 L72 80" stroke="#1e40af" strokeWidth="0.3" strokeDasharray="0.8 0.5" />
    </svg>
  );
}

function HoodieBlood({ size, className, idKey }) {
  const g1 = defsId(idKey, 'body');
  const g2 = defsId(idKey, 'hood');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#991b1b" />
          <stop offset="0.5" stopColor="#7f1d1d" />
          <stop offset="1" stopColor="#5a0e0e" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#7f1d1d" />
          <stop offset="1" stopColor="#450a0a" />
        </linearGradient>
      </defs>
      {/* Sleeves */}
      <path d="M16 30 L28 24 L34 34 L30 68 L20 66 Z" fill={`url(#${g1})`} />
      <path d="M84 30 L72 24 L66 34 L70 68 L80 66 Z" fill={`url(#${g1})`} />
      {/* Hood — slightly back, V-opening at neck */}
      <path d="M30 30 Q34 14 50 14 Q66 14 70 30 L62 30 Q60 22 50 22 Q40 22 38 30 Z" fill={`url(#${g2})`} />
      <path d="M38 30 Q44 22 50 22 Q56 22 62 30 L60 32 Q50 28 40 32 Z" fill="#2a0707" />
      {/* Hood drawstring loops */}
      <line x1="44" y1="30" x2="42" y2="44" stroke="#fafafa" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="56" y1="30" x2="58" y2="44" stroke="#fafafa" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="42" cy="44" r="1" fill="#0a0a0a" />
      <circle cx="58" cy="44" r="1" fill="#0a0a0a" />
      {/* Body */}
      <path d="M30 30 L70 30 L72 82 L28 82 Z" fill={`url(#${g1})`} />
      {/* Kangaroo pocket */}
      <path d="M34 56 Q50 64 66 56 L66 72 Q50 74 34 72 Z" fill="#5a0e0e" />
      <path d="M34 56 Q50 64 66 56" stroke="#2a0707" strokeWidth="0.5" fill="none" />
      {/* Body fold shadow */}
      <path d="M36 38 Q38 60 34 80" stroke="#2a0707" strokeWidth="0.5" opacity="0.5" fill="none" />
      <path d="M64 38 Q62 60 66 80" stroke="#2a0707" strokeWidth="0.5" opacity="0.5" fill="none" />
      <path d="M50 38 Q51 60 50 80" stroke="#2a0707" strokeWidth="0.3" opacity="0.4" fill="none" />
      {/* Ribbed cuffs + hem */}
      <path d="M20 64 L30 66 L30 70 L20 68 Z" fill="#2a0707" />
      <path d="M80 64 L70 66 L70 70 L80 68 Z" fill="#2a0707" />
      <path d="M28 80 L72 80 L72 84 L28 84 Z" fill="#2a0707" />
    </svg>
  );
}

function BespokeSuit({ size, className, idKey }) {
  const g1 = defsId(idKey, 'body');
  const g2 = defsId(idKey, 'lapel');
  const g3 = defsId(idKey, 'sheen');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a2a2a" />
          <stop offset="1" stopColor="#0d0d0d" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#080808" />
        </linearGradient>
        <linearGradient id={g3} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Shoulders + body — single-breasted with peak lapel */}
      <path d="M22 30 Q30 22 50 22 Q70 22 78 30 L80 82 L20 82 Z" fill={`url(#${g1})`} />
      {/* Sleeve seams */}
      <path d="M28 32 Q30 60 26 82" stroke="#000" strokeWidth="0.4" opacity="0.6" fill="none" />
      <path d="M72 32 Q70 60 74 82" stroke="#000" strokeWidth="0.4" opacity="0.6" fill="none" />
      {/* Lapels — peaked, framing white shirt */}
      <path d="M50 22 L36 32 L38 52 L50 44 Z" fill={`url(#${g2})`} />
      <path d="M50 22 L64 32 L62 52 L50 44 Z" fill={`url(#${g2})`} />
      {/* White shirt collar between lapels */}
      <path d="M42 26 L50 24 L58 26 L58 30 L50 28 L42 30 Z" fill="#f9fafb" />
      {/* Black tie down centre */}
      <path d="M48 28 L52 28 L51 54 L49 54 Z" fill="#0a0a0a" />
      <path d="M48 28 L52 28 L51 32 L49 32 Z" fill="#1a1a1a" />
      {/* Single button */}
      <circle cx="50" cy="58" r="1.2" fill="#1a1a1a" stroke="#000" strokeWidth="0.3" />
      <circle cx="50" cy="58" r="0.4" fill="#000" />
      {/* Pocket squares — chest pocket */}
      <path d="M60 38 L70 38 L70 40 L60 40 Z" fill="#0a0a0a" />
      <path d="M61 38 L62 36 L63 38 L64 36 L65 38" stroke="#dc2626" strokeWidth="0.6" fill="none" />
      {/* Lapel notch line */}
      <path d="M50 22 L50 44" stroke="#000" strokeWidth="0.5" />
      {/* Sheen down the front for fabric polish */}
      <path d="M22 30 Q30 22 50 22 Q70 22 78 30 L80 82 L20 82 Z" fill={`url(#${g3})`} />
      {/* Vent suggestion at hem */}
      <path d="M48 70 L52 70 L52 82 L48 82 Z" fill="#0a0a0a" opacity="0.4" />
    </svg>
  );
}

function SilkShirtBlack({ size, className, idKey }) {
  const g1 = defsId(idKey, 'body');
  const g2 = defsId(idKey, 'sheen');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1f1f1f" />
          <stop offset="0.5" stopColor="#0d0d0d" />
          <stop offset="1" stopColor="#1f1f1f" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0" />
          <stop offset="0.3" stopColor="#fff" stopOpacity="0.18" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.04" />
          <stop offset="0.7" stopColor="#fff" stopOpacity="0.15" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Sleeves */}
      <path d="M16 30 L28 24 L34 34 L30 70 L20 68 Z" fill={`url(#${g1})`} />
      <path d="M84 30 L72 24 L66 34 L70 70 L80 68 Z" fill={`url(#${g1})`} />
      {/* Body with open neckline */}
      <path d="M30 28 Q40 24 50 24 Q60 24 70 28 L72 84 L28 84 Z" fill={`url(#${g1})`} />
      {/* Open collar — wide spread, two flaps */}
      <path d="M50 24 L42 26 L40 38 L46 32 Z" fill="#0a0a0a" />
      <path d="M50 24 L58 26 L60 38 L54 32 Z" fill="#0a0a0a" />
      <path d="M40 38 L46 32 L46 34 L40 40 Z" fill="#1f1f1f" />
      <path d="M60 38 L54 32 L54 34 L60 40 Z" fill="#1f1f1f" />
      {/* Centre placket */}
      <line x1="50" y1="32" x2="50" y2="84" stroke="#000" strokeWidth="0.4" />
      {/* Buttons */}
      <circle cx="50" cy="46" r="0.7" fill="#374151" />
      <circle cx="50" cy="56" r="0.7" fill="#374151" />
      <circle cx="50" cy="66" r="0.7" fill="#374151" />
      <circle cx="50" cy="76" r="0.7" fill="#374151" />
      {/* Silk sheen — broad highlight */}
      <path d="M30 28 Q40 24 50 24 Q60 24 70 28 L72 84 L28 84 Z" fill={`url(#${g2})`} />
      {/* Body folds */}
      <path d="M36 36 Q38 60 36 82" stroke="#000" strokeWidth="0.3" opacity="0.5" fill="none" />
      <path d="M64 36 Q62 60 64 82" stroke="#000" strokeWidth="0.3" opacity="0.5" fill="none" />
    </svg>
  );
}

// ─────────────────────── Bottoms ──────────────────────────

function TracksuitPantsBlue({ size, className, idKey }) {
  const g1 = defsId(idKey, 'body');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="0.5" stopColor="#1e40af" />
          <stop offset="1" stopColor="#0b1d4a" />
        </linearGradient>
      </defs>
      {/* Waistband */}
      <rect x="30" y="14" width="40" height="6" rx="1" fill="#0b1d4a" />
      <line x1="30" y1="17" x2="70" y2="17" stroke="#9ca3af" strokeWidth="0.25" strokeDasharray="1 0.6" />
      {/* Left leg */}
      <path d="M30 20 L48 20 L46 86 L34 86 L30 60 Z" fill={`url(#${g1})`} />
      {/* Right leg */}
      <path d="M52 20 L70 20 L66 60 L66 86 L54 86 Z" fill={`url(#${g1})`} />
      {/* White side stripes */}
      <path d="M34 22 L36 86" stroke="#fff" strokeWidth="2" />
      <path d="M64 22 L62 86" stroke="#fff" strokeWidth="2" />
      {/* Drawstring at waist */}
      <line x1="46" y1="14" x2="46" y2="22" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" />
      <line x1="54" y1="14" x2="54" y2="22" stroke="#fff" strokeWidth="0.8" strokeLinecap="round" />
      <circle cx="46" cy="22" r="0.7" fill="#0a0a0a" />
      <circle cx="54" cy="22" r="0.7" fill="#0a0a0a" />
      {/* Leg crease shading */}
      <path d="M40 24 Q41 56 40 84" stroke="#0b1d4a" strokeWidth="0.4" opacity="0.6" fill="none" />
      <path d="M60 24 Q59 56 60 84" stroke="#0b1d4a" strokeWidth="0.4" opacity="0.6" fill="none" />
      {/* Ribbed cuffs */}
      <rect x="34" y="84" width="12" height="4" rx="0.5" fill="#0b1d4a" />
      <rect x="54" y="84" width="12" height="4" rx="0.5" fill="#0b1d4a" />
      <line x1="35" y1="86" x2="45" y2="86" stroke="#1e40af" strokeWidth="0.2" strokeDasharray="0.6 0.4" />
      <line x1="55" y1="86" x2="65" y2="86" stroke="#1e40af" strokeWidth="0.2" strokeDasharray="0.6 0.4" />
    </svg>
  );
}

function BaggyJeans({ size, className, idKey }) {
  const g1 = defsId(idKey, 'denim');
  const g2 = defsId(idKey, 'weave');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3b6dd1" />
          <stop offset="0.5" stopColor="#2952a3" />
          <stop offset="1" stopColor="#1a3870" />
        </linearGradient>
        <pattern id={g2} x="0" y="0" width="2" height="2" patternUnits="userSpaceOnUse">
          <path d="M0 0 L0 2 M1 0 L1 2" stroke="#1a3870" strokeWidth="0.15" opacity="0.6" />
          <path d="M0 0 L2 0 M0 1 L2 1" stroke="#5b8fdb" strokeWidth="0.1" opacity="0.4" />
        </pattern>
      </defs>
      {/* Waistband */}
      <rect x="26" y="14" width="48" height="7" rx="1" fill="#1a3870" />
      <rect x="26" y="14" width="48" height="7" rx="1" fill={`url(#${g2})`} opacity="0.6" />
      <line x1="26" y1="17" x2="74" y2="17" stroke="#fcd34d" strokeWidth="0.4" strokeDasharray="1.2 0.6" opacity="0.7" />
      {/* Button + rivet */}
      <circle cx="46" cy="17.5" r="1" fill="#fcd34d" />
      <circle cx="46" cy="17.5" r="0.4" fill="#a36a14" />
      {/* Belt loops */}
      <rect x="30" y="13" width="1.6" height="3" fill="#1a3870" />
      <rect x="50" y="13" width="1.6" height="3" fill="#1a3870" />
      <rect x="68" y="13" width="1.6" height="3" fill="#1a3870" />
      {/* Wide left leg */}
      <path d="M26 21 L48 21 L48 88 L30 88 L24 56 Z" fill={`url(#${g1})`} />
      <path d="M26 21 L48 21 L48 88 L30 88 L24 56 Z" fill={`url(#${g2})`} opacity="0.5" />
      {/* Wide right leg */}
      <path d="M52 21 L74 21 L76 56 L70 88 L52 88 Z" fill={`url(#${g1})`} />
      <path d="M52 21 L74 21 L76 56 L70 88 L52 88 Z" fill={`url(#${g2})`} opacity="0.5" />
      {/* Centre seam */}
      <line x1="50" y1="21" x2="50" y2="88" stroke="#fcd34d" strokeWidth="0.4" strokeDasharray="1 0.7" opacity="0.6" />
      {/* Side seams w/ orange contrast stitch */}
      <path d="M30 22 Q28 56 32 88" stroke="#fcd34d" strokeWidth="0.3" opacity="0.4" fill="none" strokeDasharray="1 0.6" />
      <path d="M70 22 Q72 56 68 88" stroke="#fcd34d" strokeWidth="0.3" opacity="0.4" fill="none" strokeDasharray="1 0.6" />
      {/* Front pockets */}
      <path d="M30 22 Q34 32 38 30 L38 38 Q34 36 30 32 Z" fill="#1a3870" opacity="0.7" />
      <path d="M70 22 Q66 32 62 30 L62 38 Q66 36 70 32 Z" fill="#1a3870" opacity="0.7" />
      {/* Knee fade */}
      <ellipse cx="38" cy="58" rx="6" ry="3" fill="#5b8fdb" opacity="0.25" />
      <ellipse cx="62" cy="58" rx="6" ry="3" fill="#5b8fdb" opacity="0.25" />
      {/* Hems */}
      <line x1="30" y1="86" x2="48" y2="86" stroke="#1a3870" strokeWidth="0.6" />
      <line x1="52" y1="86" x2="70" y2="86" stroke="#1a3870" strokeWidth="0.6" />
    </svg>
  );
}

function TailoredTrousers({ size, className, idKey }) {
  const g1 = defsId(idKey, 'wool');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3a3a3a" />
          <stop offset="0.5" stopColor="#1f1f1f" />
          <stop offset="1" stopColor="#0d0d0d" />
        </linearGradient>
      </defs>
      {/* Slim waistband */}
      <rect x="34" y="14" width="32" height="5" rx="0.5" fill="#0a0a0a" />
      <line x1="34" y1="16.5" x2="66" y2="16.5" stroke="#fff" strokeWidth="0.15" opacity="0.3" />
      {/* Left leg — slimmer */}
      <path d="M34 19 L48 19 L48 88 L38 88 L34 60 Z" fill={`url(#${g1})`} />
      {/* Right leg */}
      <path d="M52 19 L66 19 L66 60 L62 88 L52 88 Z" fill={`url(#${g1})`} />
      {/* Crisp centre crease — knife edge */}
      <line x1="41" y1="20" x2="40" y2="88" stroke="#9ca3af" strokeWidth="0.4" opacity="0.7" />
      <line x1="59" y1="20" x2="60" y2="88" stroke="#9ca3af" strokeWidth="0.4" opacity="0.7" />
      {/* Pleats at waist */}
      <line x1="42" y1="20" x2="42" y2="28" stroke="#0a0a0a" strokeWidth="0.5" />
      <line x1="58" y1="20" x2="58" y2="28" stroke="#0a0a0a" strokeWidth="0.5" />
      {/* Side pocket suggestion */}
      <path d="M48 22 L48 30" stroke="#0a0a0a" strokeWidth="0.4" />
      <path d="M52 22 L52 30" stroke="#0a0a0a" strokeWidth="0.4" />
      {/* Cuffs */}
      <rect x="38" y="86" width="10" height="3" fill="#0a0a0a" />
      <rect x="52" y="86" width="10" height="3" fill="#0a0a0a" />
      {/* Subtle pinstripe — barely visible */}
      <line x1="38" y1="22" x2="38" y2="84" stroke="#9ca3af" strokeWidth="0.1" opacity="0.25" />
      <line x1="44" y1="22" x2="44" y2="84" stroke="#9ca3af" strokeWidth="0.1" opacity="0.25" />
      <line x1="56" y1="22" x2="56" y2="84" stroke="#9ca3af" strokeWidth="0.1" opacity="0.25" />
      <line x1="62" y1="22" x2="62" y2="84" stroke="#9ca3af" strokeWidth="0.1" opacity="0.25" />
    </svg>
  );
}

function ItalianJeans({ size, className, idKey }) {
  const g1 = defsId(idKey, 'denim');
  const g2 = defsId(idKey, 'weave');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1e3a72" />
          <stop offset="0.6" stopColor="#102447" />
          <stop offset="1" stopColor="#081530" />
        </linearGradient>
        <pattern id={g2} x="0" y="0" width="1.4" height="1.4" patternUnits="userSpaceOnUse">
          <path d="M0 0 L1.4 1.4" stroke="#0a1730" strokeWidth="0.2" />
          <path d="M1.4 0 L0 1.4" stroke="#3a5d99" strokeWidth="0.1" opacity="0.5" />
        </pattern>
      </defs>
      {/* Waistband */}
      <rect x="34" y="14" width="32" height="6" rx="0.5" fill="#081530" />
      {/* Button */}
      <circle cx="50" cy="17" r="0.9" fill="#d97706" />
      <circle cx="50" cy="17" r="0.3" fill="#451a03" />
      {/* Belt loops */}
      <rect x="38" y="13" width="1.5" height="3" fill="#081530" />
      <rect x="60" y="13" width="1.5" height="3" fill="#081530" />
      {/* Slimmer left leg */}
      <path d="M34 20 L48 20 L48 88 L38 88 L34 56 Z" fill={`url(#${g1})`} />
      <path d="M34 20 L48 20 L48 88 L38 88 L34 56 Z" fill={`url(#${g2})`} opacity="0.6" />
      {/* Slimmer right leg */}
      <path d="M52 20 L66 20 L66 56 L62 88 L52 88 Z" fill={`url(#${g1})`} />
      <path d="M52 20 L66 20 L66 56 L62 88 L52 88 Z" fill={`url(#${g2})`} opacity="0.6" />
      {/* Selvedge stitching — distinctive orange */}
      <path d="M34 20 L34 56 L38 88" stroke="#ea580c" strokeWidth="0.3" fill="none" />
      <path d="M66 20 L66 56 L62 88" stroke="#ea580c" strokeWidth="0.3" fill="none" />
      {/* Centre fly */}
      <line x1="50" y1="20" x2="50" y2="36" stroke="#ea580c" strokeWidth="0.25" strokeDasharray="1 0.6" />
      {/* Pocket curves with contrast stitching */}
      <path d="M34 22 Q40 30 44 28" stroke="#ea580c" strokeWidth="0.25" fill="none" strokeDasharray="0.8 0.5" />
      <path d="M66 22 Q60 30 56 28" stroke="#ea580c" strokeWidth="0.25" fill="none" strokeDasharray="0.8 0.5" />
      {/* Knee whiskering */}
      <path d="M38 54 Q43 55 48 54" stroke="#3a5d99" strokeWidth="0.2" opacity="0.5" fill="none" />
      <path d="M52 54 Q57 55 62 54" stroke="#3a5d99" strokeWidth="0.2" opacity="0.5" fill="none" />
      {/* Raw selvedge hem */}
      <line x1="38" y1="86" x2="48" y2="86" stroke="#ea580c" strokeWidth="0.3" />
      <line x1="52" y1="86" x2="62" y2="86" stroke="#ea580c" strokeWidth="0.3" />
    </svg>
  );
}

// ─────────────────────── Shoes ────────────────────────────

function SneakersWhite({ size, className, idKey }) {
  const g1 = defsId(idKey, 'upper');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fafafa" />
          <stop offset="0.7" stopColor="#e5e7eb" />
          <stop offset="1" stopColor="#a3a3a3" />
        </linearGradient>
      </defs>
      {/* Sole */}
      <path d="M8 68 Q12 60 20 60 L78 60 Q86 60 92 68 Q92 76 80 76 L20 76 Q8 76 8 68 Z" fill="#f3f4f6" />
      <path d="M8 68 Q12 60 20 60 L78 60 Q86 60 92 68 Q92 76 80 76 L20 76 Q8 76 8 68 Z" stroke="#000" strokeWidth="0.4" fill="none" opacity="0.5" />
      {/* Midsole stripe */}
      <line x1="14" y1="68" x2="86" y2="68" stroke="#9ca3af" strokeWidth="0.5" />
      <line x1="14" y1="72" x2="86" y2="72" stroke="#9ca3af" strokeWidth="0.3" opacity="0.5" />
      {/* Upper body — side profile */}
      <path d="M14 60 Q12 38 30 36 L70 36 Q86 40 88 60 Z" fill={`url(#${g1})`} />
      {/* Toe cap seam */}
      <path d="M70 38 Q72 50 70 60" stroke="#9ca3af" strokeWidth="0.4" fill="none" />
      {/* Heel */}
      <path d="M14 50 Q10 60 14 60" stroke="#9ca3af" strokeWidth="0.4" fill="none" />
      {/* Lace area */}
      <path d="M32 40 L52 38 L60 50 L60 58 L34 58 Z" fill="#f5f5f4" />
      <path d="M32 40 L60 50" stroke="#9ca3af" strokeWidth="0.3" fill="none" />
      {/* Laces — 4 cross-overs */}
      <path d="M36 42 L56 46" stroke="#a8a29e" strokeWidth="0.8" />
      <path d="M36 46 L56 50" stroke="#a8a29e" strokeWidth="0.8" />
      <path d="M36 50 L56 54" stroke="#a8a29e" strokeWidth="0.8" />
      <path d="M36 54 L56 58" stroke="#a8a29e" strokeWidth="0.8" />
      {/* Eyelets */}
      <circle cx="36" cy="42" r="0.6" fill="#0a0a0a" />
      <circle cx="36" cy="46" r="0.6" fill="#0a0a0a" />
      <circle cx="36" cy="50" r="0.6" fill="#0a0a0a" />
      <circle cx="36" cy="54" r="0.6" fill="#0a0a0a" />
      <circle cx="56" cy="46" r="0.6" fill="#0a0a0a" />
      <circle cx="56" cy="50" r="0.6" fill="#0a0a0a" />
      <circle cx="56" cy="54" r="0.6" fill="#0a0a0a" />
      <circle cx="56" cy="58" r="0.6" fill="#0a0a0a" />
      {/* Side swoosh-suggestion */}
      <path d="M40 56 Q50 50 68 46" stroke="#525252" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M40 56 Q50 50 68 46" stroke="#a3a3a3" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function HighTopsRed({ size, className, idKey }) {
  const g1 = defsId(idKey, 'upper');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#b91c1c" />
          <stop offset="0.6" stopColor="#7f1d1d" />
          <stop offset="1" stopColor="#450a0a" />
        </linearGradient>
      </defs>
      {/* Rubber toe cap */}
      <path d="M70 56 Q84 56 86 64 L86 70 Q82 76 76 76 L70 76 Z" fill="#fafafa" />
      {/* Sole */}
      <path d="M8 70 Q12 60 20 60 L70 60 L70 76 L20 76 Q8 76 8 70 Z" fill="#fafafa" />
      <line x1="14" y1="70" x2="70" y2="70" stroke="#9ca3af" strokeWidth="0.4" />
      <line x1="14" y1="73" x2="70" y2="73" stroke="#9ca3af" strokeWidth="0.25" opacity="0.6" />
      {/* High-top ankle collar */}
      <path d="M14 60 Q10 30 28 26 L48 24 Q52 26 50 36 L50 60 Z" fill={`url(#${g1})`} />
      {/* Forefoot */}
      <path d="M50 36 L70 56 L14 60 L26 36 Z" fill={`url(#${g1})`} />
      {/* Side circle logo */}
      <circle cx="30" cy="50" r="6" fill="#fafafa" stroke="#7f1d1d" strokeWidth="0.5" />
      <path d="M30 46 L30.7 49 L33.5 49 L31.5 51 L32.2 54 L30 52 L27.8 54 L28.5 51 L26.5 49 L29.3 49 Z" fill="#7f1d1d" />
      {/* Ankle vent holes */}
      <circle cx="20" cy="34" r="0.5" fill="#0a0a0a" />
      <circle cx="24" cy="32" r="0.5" fill="#0a0a0a" />
      <circle cx="28" cy="30" r="0.5" fill="#0a0a0a" />
      {/* Laces zigzag */}
      <path d="M38 38 L46 36 L38 44 L46 42 L38 50 L46 48 L38 56 L46 54" stroke="#fafafa" strokeWidth="0.7" fill="none" />
      {/* Eyelets */}
      <circle cx="38" cy="38" r="0.5" fill="#fafafa" />
      <circle cx="38" cy="44" r="0.5" fill="#fafafa" />
      <circle cx="38" cy="50" r="0.5" fill="#fafafa" />
      <circle cx="38" cy="56" r="0.5" fill="#fafafa" />
      <circle cx="46" cy="36" r="0.5" fill="#fafafa" />
      <circle cx="46" cy="42" r="0.5" fill="#fafafa" />
      <circle cx="46" cy="48" r="0.5" fill="#fafafa" />
      <circle cx="46" cy="54" r="0.5" fill="#fafafa" />
      {/* Ankle highlight */}
      <path d="M16 32 Q22 28 36 26" stroke="#dc2626" strokeWidth="0.5" opacity="0.5" fill="none" />
    </svg>
  );
}

function OxfordsBlack({ size, className, idKey }) {
  const g1 = defsId(idKey, 'leather');
  const g2 = defsId(idKey, 'shine');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2a2a2a" />
          <stop offset="0.5" stopColor="#0d0d0d" />
          <stop offset="1" stopColor="#000" />
        </linearGradient>
        <radialGradient id={g2} cx="0.5" cy="0.2" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Heel block */}
      <path d="M10 60 L20 60 L20 78 L10 78 Z" fill="#0a0a0a" />
      {/* Sole — leather, thin */}
      <path d="M10 70 Q12 66 20 66 L82 64 Q92 64 92 72 L88 76 L20 76 Q10 76 10 70 Z" fill="#3f3f3f" />
      <path d="M10 70 Q12 66 20 66 L82 64 Q92 64 92 72 L88 76 L20 76 Q10 76 10 70 Z" stroke="#0a0a0a" strokeWidth="0.3" fill="none" />
      {/* Upper — sleek profile */}
      <path d="M16 64 Q14 40 36 36 L70 38 Q86 44 88 64 Z" fill={`url(#${g1})`} />
      <path d="M16 64 Q14 40 36 36 L70 38 Q86 44 88 64 Z" fill={`url(#${g2})`} />
      {/* Toe cap (cap-toe oxford) */}
      <path d="M70 38 Q86 44 88 64 L82 64 Q72 56 70 50 Z" fill="#1a1a1a" />
      <path d="M70 50 L82 60" stroke="#000" strokeWidth="0.3" />
      {/* Lace channel — closed lacing characteristic */}
      <path d="M38 44 L60 44 L60 56 L38 56 Z" fill="#000" />
      {/* Laces */}
      <line x1="40" y1="46" x2="58" y2="46" stroke="#1f1f1f" strokeWidth="0.7" />
      <line x1="40" y1="50" x2="58" y2="50" stroke="#1f1f1f" strokeWidth="0.7" />
      <line x1="40" y1="54" x2="58" y2="54" stroke="#1f1f1f" strokeWidth="0.7" />
      {/* Eyelets */}
      <circle cx="42" cy="46" r="0.4" fill="#fafafa" />
      <circle cx="42" cy="50" r="0.4" fill="#fafafa" />
      <circle cx="42" cy="54" r="0.4" fill="#fafafa" />
      <circle cx="56" cy="46" r="0.4" fill="#fafafa" />
      <circle cx="56" cy="50" r="0.4" fill="#fafafa" />
      <circle cx="56" cy="54" r="0.4" fill="#fafafa" />
      {/* Brogue perforation dots along seam */}
      <circle cx="74" cy="48" r="0.3" fill="#1a1a1a" />
      <circle cx="76" cy="46" r="0.3" fill="#1a1a1a" />
      <circle cx="78" cy="48" r="0.3" fill="#1a1a1a" />
      <circle cx="80" cy="50" r="0.3" fill="#1a1a1a" />
      {/* Mirror polish glint at toe */}
      <ellipse cx="82" cy="56" rx="5" ry="2" fill="#fff" opacity="0.18" />
    </svg>
  );
}

function ItalianLoafers({ size, className, idKey }) {
  const g1 = defsId(idKey, 'leather');
  const g2 = defsId(idKey, 'shine');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5a2f0a" />
          <stop offset="0.5" stopColor="#3d1f06" />
          <stop offset="1" stopColor="#1a0d03" />
        </linearGradient>
        <radialGradient id={g2} cx="0.5" cy="0.25" r="0.5">
          <stop offset="0" stopColor="#fff" stopOpacity="0.4" />
          <stop offset="0.6" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Heel */}
      <path d="M10 60 L20 60 L20 78 L10 78 Z" fill="#1a0d03" />
      {/* Sole — slim, with stacked leather */}
      <path d="M10 70 Q12 66 20 66 L82 64 Q92 64 92 72 L88 76 L20 76 Q10 76 10 70 Z" fill="#3d1f06" />
      <line x1="14" y1="72" x2="86" y2="72" stroke="#1a0d03" strokeWidth="0.3" />
      {/* Upper — penny loafer silhouette, slip-on */}
      <path d="M16 64 Q14 42 38 38 L72 40 Q88 46 88 64 Z" fill={`url(#${g1})`} />
      <path d="M16 64 Q14 42 38 38 L72 40 Q88 46 88 64 Z" fill={`url(#${g2})`} />
      {/* Vamp opening */}
      <path d="M28 44 Q50 38 70 46 Q70 54 50 52 Q30 50 28 44 Z" fill="#0d0500" />
      {/* Penny strap detail */}
      <path d="M40 46 L60 46 L60 50 L40 50 Z" fill={`url(#${g1})`} />
      <path d="M40 46 L60 46 L60 50 L40 50 Z" stroke="#1a0d03" strokeWidth="0.3" fill="none" />
      {/* Slot in strap */}
      <rect x="48" y="47" width="4" height="2" fill="#0d0500" />
      {/* Topstitching along vamp */}
      <path d="M28 44 Q50 38 70 46" stroke="#7a4a18" strokeWidth="0.3" fill="none" strokeDasharray="1 0.6" />
      {/* Mirror polish glints */}
      <ellipse cx="80" cy="54" rx="5" ry="2" fill="#fff" opacity="0.22" />
      <ellipse cx="30" cy="56" rx="3" ry="1.4" fill="#fff" opacity="0.15" />
    </svg>
  );
}

// ─────────────────────── Accessories ──────────────────────

function GoldChainThick({ size, className, idKey }) {
  const g1 = defsId(idKey, 'gold');
  const g2 = defsId(idKey, 'hi');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="0.5" stopColor="#d97706" />
          <stop offset="1" stopColor="#7c2d12" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff8c8" />
          <stop offset="1" stopColor="#fde047" />
        </linearGradient>
      </defs>
      {/* Cuban-link chain — repeating oval links forming a U */}
      {[0,1,2,3,4,5,6,7,8].map(i => {
        const t = i / 8;
        const angle = -Math.PI * 0.7 + Math.PI * 1.4 * t;
        const cx = 50 + Math.cos(angle) * 32;
        const cy = 40 + Math.sin(angle) * 32;
        const rot = (angle * 180 / Math.PI) + 90;
        return (
          <g key={i} transform={`translate(${cx} ${cy}) rotate(${rot})`}>
            <ellipse rx="5" ry="3" fill={`url(#${g1})`} stroke="#7c2d12" strokeWidth="0.4" />
            <ellipse rx="5" ry="3" fill="#000" fillOpacity="0" stroke={`url(#${g2})`} strokeWidth="0.5" />
            <ellipse rx="2.5" ry="1.4" fill="#000" opacity="0.45" />
          </g>
        );
      })}
      {/* Centre pendant — medallion */}
      <circle cx="50" cy="78" r="9" fill={`url(#${g1})`} stroke="#7c2d12" strokeWidth="0.6" />
      <circle cx="50" cy="78" r="9" stroke={`url(#${g2})`} strokeWidth="0.5" fill="none" />
      <circle cx="50" cy="78" r="6" fill="#000" opacity="0.3" />
      <text x="50" y="81" textAnchor="middle" fill={`url(#${g2})`} fontSize="6" fontWeight="bold" fontFamily="serif">$</text>
    </svg>
  );
}

function ChunkyWatch({ size, className, idKey }) {
  const g1 = defsId(idKey, 'strap');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#0a0a0a" />
        </linearGradient>
      </defs>
      {/* Top strap */}
      <path d="M36 14 L64 14 L62 36 L38 36 Z" fill={`url(#${g1})`} />
      <line x1="40" y1="18" x2="60" y2="18" stroke="#374151" strokeWidth="0.2" />
      <line x1="40" y1="24" x2="60" y2="24" stroke="#374151" strokeWidth="0.2" />
      <line x1="40" y1="30" x2="60" y2="30" stroke="#374151" strokeWidth="0.2" />
      {/* Bottom strap with holes */}
      <path d="M38 64 L62 64 L64 86 L36 86 Z" fill={`url(#${g1})`} />
      <circle cx="50" cy="70" r="0.8" fill="#000" />
      <circle cx="50" cy="76" r="0.8" fill="#000" />
      <circle cx="50" cy="82" r="0.8" fill="#000" />
      {/* Bezel — chunky outer ring */}
      <circle cx="50" cy="50" r="22" fill="#1a1a1a" stroke="#374151" strokeWidth="0.4" />
      <circle cx="50" cy="50" r="22" fill="none" stroke="#fff" strokeWidth="0.3" opacity="0.2" />
      {/* Bezel markers */}
      {[0,1,2,3,4,5,6,7,8,9,10,11].map(i => {
        const a = (i * 30 - 90) * Math.PI / 180;
        const x1 = 50 + Math.cos(a) * 19;
        const y1 = 50 + Math.sin(a) * 19;
        const x2 = 50 + Math.cos(a) * 21;
        const y2 = 50 + Math.sin(a) * 21;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fafafa" strokeWidth="0.5" />;
      })}
      {/* Dial face */}
      <circle cx="50" cy="50" r="15" fill="#0a0a0a" />
      <circle cx="50" cy="50" r="15" stroke="#374151" strokeWidth="0.3" fill="none" />
      {/* Hour markers — chunky bars */}
      <rect x="49.3" y="37" width="1.4" height="3" fill="#fafafa" />
      <rect x="49.3" y="60" width="1.4" height="3" fill="#fafafa" />
      <rect x="60" y="49.3" width="3" height="1.4" fill="#fafafa" />
      <rect x="37" y="49.3" width="3" height="1.4" fill="#fafafa" />
      {/* Hands */}
      <line x1="50" y1="50" x2="50" y2="40" stroke="#fafafa" strokeWidth="1.3" strokeLinecap="round" />
      <line x1="50" y1="50" x2="56" y2="50" stroke="#fafafa" strokeWidth="1" strokeLinecap="round" />
      <line x1="50" y1="50" x2="48" y2="58" stroke="#dc2626" strokeWidth="0.5" strokeLinecap="round" />
      <circle cx="50" cy="50" r="1" fill="#fafafa" />
      {/* DIVER text */}
      <text x="50" y="58" textAnchor="middle" fill="#fafafa" fontSize="2.5" fontFamily="monospace" letterSpacing="0.3">DIVER</text>
      {/* Crown */}
      <rect x="72" y="49" width="3" height="3" fill="#374151" />
    </svg>
  );
}

function RolexSubmariner({ size, className, idKey }) {
  const g1 = defsId(idKey, 'steel');
  const g2 = defsId(idKey, 'bezel');
  const g3 = defsId(idKey, 'dial');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#e5e7eb" />
          <stop offset="0.5" stopColor="#9ca3af" />
          <stop offset="1" stopColor="#525252" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="0.5" stopColor="#0a0a0a" />
          <stop offset="1" stopColor="#1f2937" />
        </linearGradient>
        <radialGradient id={g3} cx="0.5" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#000" />
        </radialGradient>
      </defs>
      {/* Bracelet — Oyster-style links above */}
      <rect x="36" y="14" width="28" height="20" fill={`url(#${g1})`} />
      <line x1="42" y1="14" x2="42" y2="34" stroke="#525252" strokeWidth="0.3" />
      <line x1="50" y1="14" x2="50" y2="34" stroke="#525252" strokeWidth="0.3" />
      <line x1="58" y1="14" x2="58" y2="34" stroke="#525252" strokeWidth="0.3" />
      <line x1="36" y1="22" x2="64" y2="22" stroke="#525252" strokeWidth="0.4" />
      <line x1="36" y1="28" x2="64" y2="28" stroke="#525252" strokeWidth="0.4" />
      {/* Bracelet below */}
      <rect x="36" y="66" width="28" height="20" fill={`url(#${g1})`} />
      <line x1="42" y1="66" x2="42" y2="86" stroke="#525252" strokeWidth="0.3" />
      <line x1="50" y1="66" x2="50" y2="86" stroke="#525252" strokeWidth="0.3" />
      <line x1="58" y1="66" x2="58" y2="86" stroke="#525252" strokeWidth="0.3" />
      <line x1="36" y1="74" x2="64" y2="74" stroke="#525252" strokeWidth="0.4" />
      <line x1="36" y1="80" x2="64" y2="80" stroke="#525252" strokeWidth="0.4" />
      {/* Case */}
      <circle cx="50" cy="50" r="22" fill={`url(#${g1})`} />
      {/* Bezel — Cerachrom with markers */}
      <circle cx="50" cy="50" r="20" fill={`url(#${g2})`} />
      <circle cx="50" cy="50" r="20" stroke="#525252" strokeWidth="0.5" fill="none" />
      {/* Bezel coin-edge */}
      {[...Array(48)].map((_, i) => {
        const a = (i * 7.5) * Math.PI / 180;
        const x = 50 + Math.cos(a) * 21.5;
        const y = 50 + Math.sin(a) * 21.5;
        return <circle key={i} cx={x} cy={y} r="0.3" fill="#374151" />;
      })}
      {/* Bezel numerals at 15/30/45/60 */}
      <text x="50" y="34" textAnchor="middle" fill="#fafafa" fontSize="3" fontFamily="sans-serif" fontWeight="bold">60</text>
      <text x="66" y="52" textAnchor="middle" fill="#fafafa" fontSize="3" fontFamily="sans-serif" fontWeight="bold">15</text>
      <text x="50" y="69" textAnchor="middle" fill="#fafafa" fontSize="3" fontFamily="sans-serif" fontWeight="bold">30</text>
      <text x="34" y="52" textAnchor="middle" fill="#fafafa" fontSize="3" fontFamily="sans-serif" fontWeight="bold">45</text>
      {/* Pearl at 12 */}
      <circle cx="50" cy="32.5" r="0.8" fill="#86efac" />
      {/* Dial */}
      <circle cx="50" cy="50" r="13" fill={`url(#${g3})`} />
      <circle cx="50" cy="50" r="13" stroke="#374151" strokeWidth="0.2" fill="none" />
      {/* Mercedes hour hand */}
      <line x1="50" y1="50" x2="50" y2="40" stroke="#fafafa" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="50" cy="42" r="1.5" fill="none" stroke="#fafafa" strokeWidth="0.5" />
      <line x1="50" y1="40.5" x2="50" y2="43.5" stroke="#fafafa" strokeWidth="0.5" />
      <line x1="48.5" y1="42" x2="51.5" y2="42" stroke="#fafafa" strokeWidth="0.5" />
      {/* Minute hand */}
      <line x1="50" y1="50" x2="57" y2="50" stroke="#fafafa" strokeWidth="0.9" strokeLinecap="round" />
      {/* Seconds — green */}
      <line x1="50" y1="50" x2="46" y2="62" stroke="#22c55e" strokeWidth="0.4" strokeLinecap="round" />
      <circle cx="50" cy="50" r="0.9" fill="#22c55e" />
      {/* Hour markers — luminous dots */}
      {[0,1,2,4,5,7,8,9,10,11].map(i => {
        const a = (i * 30 - 90) * Math.PI / 180;
        const x = 50 + Math.cos(a) * 11;
        const y = 50 + Math.sin(a) * 11;
        return <circle key={i} cx={x} cy={y} r="0.9" fill="#fafafa" />;
      })}
      {/* 3 o'clock date window */}
      <rect x="60" y="48.5" width="4" height="3" fill="#fafafa" />
      <text x="62" y="51" textAnchor="middle" fill="#0a0a0a" fontSize="2.5" fontFamily="sans-serif">25</text>
      {/* Crown */}
      <rect x="71" y="49" width="3.5" height="2.5" fill="#9ca3af" />
      <line x1="71" y1="50.2" x2="74.5" y2="50.2" stroke="#525252" strokeWidth="0.3" />
    </svg>
  );
}

function PatekPhilippe({ size, className, idKey }) {
  const g1 = defsId(idKey, 'steel');
  const g2 = defsId(idKey, 'dial');
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={className}>
      <defs>
        <linearGradient id={g1} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#f3f4f6" />
          <stop offset="0.5" stopColor="#9ca3af" />
          <stop offset="1" stopColor="#525252" />
        </linearGradient>
        <linearGradient id={g2} x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#1e3a8a" />
          <stop offset="0.5" stopColor="#1e40af" />
          <stop offset="1" stopColor="#0b1d4a" />
        </linearGradient>
      </defs>
      {/* Integrated bracelet — Nautilus style */}
      <path d="M30 14 L70 14 L66 34 L34 34 Z" fill={`url(#${g1})`} />
      <line x1="40" y1="14" x2="40" y2="34" stroke="#525252" strokeWidth="0.3" />
      <line x1="50" y1="14" x2="50" y2="34" stroke="#525252" strokeWidth="0.3" />
      <line x1="60" y1="14" x2="60" y2="34" stroke="#525252" strokeWidth="0.3" />
      <line x1="32" y1="22" x2="68" y2="22" stroke="#525252" strokeWidth="0.4" />
      <line x1="32" y1="28" x2="68" y2="28" stroke="#525252" strokeWidth="0.4" />
      {/* Bracelet below */}
      <path d="M34 66 L66 66 L70 86 L30 86 Z" fill={`url(#${g1})`} />
      <line x1="40" y1="66" x2="40" y2="86" stroke="#525252" strokeWidth="0.3" />
      <line x1="50" y1="66" x2="50" y2="86" stroke="#525252" strokeWidth="0.3" />
      <line x1="60" y1="66" x2="60" y2="86" stroke="#525252" strokeWidth="0.3" />
      <line x1="32" y1="74" x2="68" y2="74" stroke="#525252" strokeWidth="0.4" />
      <line x1="32" y1="80" x2="68" y2="80" stroke="#525252" strokeWidth="0.4" />
      {/* Octagonal Nautilus bezel */}
      <polygon points="38,32 62,32 70,42 70,58 62,68 38,68 30,58 30,42" fill={`url(#${g1})`} />
      {/* Bezel screws — 4 visible on the flanks */}
      <circle cx="30" cy="44" r="1" fill="#525252" />
      <line x1="29.5" y1="43.5" x2="30.5" y2="44.5" stroke="#0a0a0a" strokeWidth="0.3" />
      <circle cx="30" cy="56" r="1" fill="#525252" />
      <line x1="29.5" y1="55.5" x2="30.5" y2="56.5" stroke="#0a0a0a" strokeWidth="0.3" />
      <circle cx="70" cy="44" r="1" fill="#525252" />
      <line x1="69.5" y1="43.5" x2="70.5" y2="44.5" stroke="#0a0a0a" strokeWidth="0.3" />
      <circle cx="70" cy="56" r="1" fill="#525252" />
      <line x1="69.5" y1="55.5" x2="70.5" y2="56.5" stroke="#0a0a0a" strokeWidth="0.3" />
      {/* Dial — blue with horizontal embossing */}
      <polygon points="40,36 60,36 66,44 66,56 60,64 40,64 34,56 34,44" fill={`url(#${g2})`} />
      {/* Horizontal embossing lines (the iconic Nautilus stripes) */}
      {[42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 62].map((y, i) => (
        <line key={i} x1="36" y1={y} x2="64" y2={y} stroke="#0b1d4a" strokeWidth="0.3" opacity="0.6" />
      ))}
      {/* Hour markers — applied gold */}
      <rect x="49.3" y="38" width="1.4" height="3" fill="#fde047" />
      <rect x="49.3" y="58" width="1.4" height="3" fill="#fde047" />
      <rect x="58" y="49.3" width="3" height="1.4" fill="#fde047" />
      <rect x="40" y="49.3" width="3" height="1.4" fill="#fde047" />
      {/* Hands */}
      <line x1="50" y1="50" x2="50" y2="42" stroke="#fde047" strokeWidth="1.4" strokeLinecap="round" />
      <line x1="50" y1="50" x2="56" y2="50" stroke="#fde047" strokeWidth="1" strokeLinecap="round" />
      <circle cx="50" cy="50" r="0.9" fill="#fde047" />
      {/* Date window at 3 */}
      <rect x="56" y="48.5" width="4" height="3" fill="#fafafa" />
      <text x="58" y="51" textAnchor="middle" fill="#0a0a0a" fontSize="2.5" fontFamily="sans-serif">8</text>
    </svg>
  );
}

// Registry — id → component. Lookup in the renderer at top.
const ITEMS = {
  snapback_red:        SnapbackRed,
  bucket_hat_camo:     BucketHatCamo,
  fedora_charcoal:     FedoraCharcoal,
  panama_cream:        PanamaCream,
  tracksuit_top_blue:  TracksuitTopBlue,
  hoodie_blood:        HoodieBlood,
  bespoke_suit:        BespokeSuit,
  silk_shirt_black:    SilkShirtBlack,
  tracksuit_pants_blue:TracksuitPantsBlue,
  baggy_jeans:         BaggyJeans,
  tailored_trousers:   TailoredTrousers,
  italian_jeans:       ItalianJeans,
  sneakers_white:      SneakersWhite,
  high_tops_red:       HighTopsRed,
  oxfords_black:       OxfordsBlack,
  italian_loafers:     ItalianLoafers,
  gold_chain_thick:    GoldChainThick,
  chunky_watch:        ChunkyWatch,
  rolex_submariner:    RolexSubmariner,
  patek_philippe:      PatekPhilippe,
};
