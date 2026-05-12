import { useEffect, useRef, useState } from 'react';

interface ScoreRingProps {
  score: number;       // 0–100
  size?: number;       // px, default 64
  stroke?: number;     // stroke width, default 5
  label?: string;      // small text inside
  animate?: boolean;   // whether to animate on mount
  className?: string;
}

function scoreColor(score: number): string {
  if (score >= 72) return '#4ade80';
  if (score >= 50) return '#facc15';
  return '#f87171';
}

/**
 * SVG circular progress ring for displaying decision scores (0–100).
 * Animates on mount by default.
 */
export function ScoreRing({ score, size = 64, stroke = 5, label, animate = true, className = '' }: ScoreRingProps) {
  const normalized = Math.max(0, Math.min(100, score));
  const radius = (size - stroke * 2) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (normalized / 100) * circumference;
  const color = scoreColor(normalized);

  const [displayed, setDisplayed] = useState(animate ? 0 : normalized);
  const rafRef = useRef<number | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!animate) { setDisplayed(normalized); return; }
    const DURATION = 900;
    const from = 0;
    const to = normalized;

    const step = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const progress = Math.min((ts - startRef.current) / DURATION, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayed(from + (to - from) * eased);
      if (progress < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [normalized]);

  const displayedOffset = circumference - (displayed / 100) * circumference;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        {/* Background track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1a1a1a"
          strokeWidth={stroke}
        />
        {/* Progress arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={displayedOffset}
          style={{
            filter: `drop-shadow(0 0 4px ${color}55)`,
            transition: animate ? undefined : 'stroke-dashoffset 0.5s ease',
          }}
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="font-mono font-bold leading-none"
          style={{ color, fontSize: size * 0.22, letterSpacing: '-0.04em' }}
        >
          {Math.round(displayed)}
        </span>
        {label && (
          <span
            className="uppercase tracking-widest font-semibold"
            style={{ color: '#333', fontSize: size * 0.1, marginTop: 1 }}
          >
            {label}
          </span>
        )}
      </div>
    </div>
  );
}
