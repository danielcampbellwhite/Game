import React from 'react';

// Renders a player's profile picture if they've uploaded one,
// otherwise falls back to their emoji avatar (or a placeholder).
// Pass either a full character/profile object as `entity`, or
// the explicit `image` + `emoji` fields directly.
//
// Usage:
//   <Avatar entity={character} size={48} />
//   <Avatar image={p.avatar_image} emoji={p.avatar} size={32} />

export default function Avatar({ entity, image, emoji, size = 32, className = '' }) {
  const src = image ?? entity?.avatar_image ?? null;
  const fallback = emoji ?? entity?.avatar ?? '';
  const dim = `${size}px`;

  if (src) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={`rounded-full object-cover border border-ink-100/15 shrink-0 ${className}`}
        style={{ width: dim, height: dim }}
      />
    );
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-ink-900/60 border border-ink-100/10 shrink-0 leading-none ${className}`}
      style={{ width: dim, height: dim, fontSize: `${size * 0.55}px` }}>
      {fallback || ''}
    </span>
  );
}
