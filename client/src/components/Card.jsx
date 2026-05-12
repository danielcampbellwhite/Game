import React, { useState } from 'react';

// Simple panel. Optional `collapsible` turns the title row into a
// toggle that hides/shows children — handy for long stack pages
// (e.g. /crimes) where the player wants to fold sections out of
// the way to reach later ones quickly.
//
// `right` is rendered outside the toggle so right-slot buttons
// remain independently clickable.
//
// Collapsible cards start CLOSED by default so a long list of sections
// (Crimes tiers, etc.) doesn't dump a wall of options on the player —
// they pick what they care about. Pass `defaultOpen` to override.
export default function Card({
  title,
  subtitle,
  right,
  children,
  className = '',
  collapsible = false,
  defaultOpen = false,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const showHeader = title || right;
  const bodyShown = !collapsible || open;
  return (
    <div className={`card ${className}`}>
      {showHeader && (
        <div className={`flex items-start justify-between gap-2 ${bodyShown ? 'mb-3' : ''}`}>
          {collapsible && title ? (
            <button
              type="button"
              onClick={() => setOpen(o => !o)}
              aria-expanded={open}
              className="flex-1 min-w-0 flex items-start gap-2 text-left -m-1 p-1 rounded hover:bg-ink-100/5 transition">
              <span
                className={`text-ink-100/55 mt-1 text-xs leading-none transition-transform ${open ? '' : '-rotate-90'}`}
                aria-hidden>
                ▾
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-display text-xl text-ink-50">{title}</h3>
                {subtitle && <p className="text-xs text-ink-100/50">{subtitle}</p>}
              </div>
            </button>
          ) : (
            <div className="min-w-0 flex-1">
              {title && <h3 className="font-display text-xl text-ink-50">{title}</h3>}
              {subtitle && <p className="text-xs text-ink-100/50">{subtitle}</p>}
            </div>
          )}
          {right}
        </div>
      )}
      {bodyShown && children}
    </div>
  );
}
