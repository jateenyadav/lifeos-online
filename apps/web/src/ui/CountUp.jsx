import { useEffect, useRef, useState } from 'react';
import { useMotion } from './prefs.js';

/** Counts a number up once on first show (650 ms, ease-out). Static when motion is off. */
export default function CountUp({ value, format = String, className = '' }) {
  const moving = useMotion();
  const [shown, setShown] = useState(moving ? 0 : value);
  const started = useRef(false);
  useEffect(() => {
    if (
      !moving ||
      started.current ||
      typeof requestAnimationFrame !== 'function'
    ) {
      setShown(value);
      return undefined;
    }
    const begin = performance.now();
    let frame;
    const tick = (now) => {
      const progress = Math.min(1, (now - begin) / 650);
      const eased = 1 - (1 - progress) ** 3;
      setShown(progress >= 1 ? value : Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
      else started.current = true;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, moving]);
  return <span className={`count-up ${className}`}>{format(shown)}</span>;
}
