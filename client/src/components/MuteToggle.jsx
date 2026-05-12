import React, { useState, useEffect } from 'react';
import { isMuted, toggleMuted, onMuteChange } from '../services/sounds.js';

// Speaker / muted-speaker SVG toggle, lives in the Nav next to the
// notification bell. Reflects the live mute state from sounds.js so any
// caller can flip it and the button updates.
export default function MuteToggle() {
  const [m, setM] = useState(isMuted());
  useEffect(() => onMuteChange(setM), []);
  return (
    <button
      type="button"
      onClick={() => toggleMuted()}
      aria-label={m ? 'Unmute sound effects' : 'Mute sound effects'}
      aria-pressed={m}
      title={m ? 'Sound off' : 'Sound on'}
      className="px-2 py-1 rounded-md hover:bg-ink-800/60 transition text-ink-100/75 flex items-center justify-center">
      {m ? (
        // Muted: speaker with X
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden>
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <line x1="22" y1="9" x2="16" y2="15" />
          <line x1="16" y1="9" x2="22" y2="15" />
        </svg>
      ) : (
        // Unmuted: speaker + sound waves
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 sm:w-6 sm:h-6" aria-hidden>
          <path d="M11 5 6 9H2v6h4l5 4z" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      )}
    </button>
  );
}
