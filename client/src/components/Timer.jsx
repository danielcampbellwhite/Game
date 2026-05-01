import React, { useEffect, useState } from 'react';

function fmtMs(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

export default function Timer({ until, onExpire, prefix = '' }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const remaining = until - now;
  useEffect(() => {
    if (remaining <= 0 && onExpire) onExpire();
  }, [remaining, onExpire]);
  if (!until || remaining <= 0) return null;
  return <span className="tabular-nums">{prefix}{fmtMs(remaining)}</span>;
}
