import { useEffect } from 'react';

// Scrolls the window to the top whenever the supplied state value flips
// from falsy to a non-empty value. Pages set their action-result `msg`
// near the top of the layout, so after any buy/sell/use/etc. action the
// player gets the result without having to scroll back up themselves.
export function useScrollOnMessage(value) {
  useEffect(() => {
    if (value) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [value]);
}
