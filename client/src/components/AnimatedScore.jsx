import React, { useEffect, useRef, useState } from 'react';

export function AnimatedScore({ value, animationsEnabled = true, className = '' }) {
  const [displayValue, setDisplayValue] = useState(value);
  const currentRef = useRef(value);

  useEffect(() => {
    if (!animationsEnabled) {
      currentRef.current = value;
      setDisplayValue(value);
      return;
    }

    const startVal = currentRef.current;
    const endVal = value;
    if (startVal === endVal) return;

    const duration = 750;
    const startTime = performance.now();
    let rafId = null;

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = Math.round(startVal + (endVal - startVal) * eased);
      currentRef.current = next;
      setDisplayValue(next);
      if (progress < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        currentRef.current = endVal;
        setDisplayValue(endVal);
      }
    };

    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [value, animationsEnabled]);

  return <span className={`tabular-nums ${className}`}>{displayValue}</span>;
}
