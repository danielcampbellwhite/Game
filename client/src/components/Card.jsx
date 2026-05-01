import React from 'react';

export default function Card({ title, subtitle, right, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between mb-3">
          <div>
            {title && <h3 className="font-display text-xl text-ink-50">{title}</h3>}
            {subtitle && <p className="text-xs text-ink-100/50">{subtitle}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}
