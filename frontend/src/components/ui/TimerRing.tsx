"use client";

import { cn } from "@/lib/utils/cn";
import { formatClock } from "@/lib/utils/time";

interface Props {
  remaining: number;
  total: number;
  warning: boolean;
  label: string;
}

/** Circular countdown. Colour shifts only in the last 10 s; no other signalling. */
export function TimerRing({ remaining, total, warning, label }: Props) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const fraction = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  return (
    <div
      className="flex items-center gap-2"
      role="timer"
      aria-label={`${label}: ${formatClock(remaining)}`}
    >
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden className="-rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--line)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={warning ? "var(--warn)" : "var(--brand)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 0.3s linear, stroke 0.3s ease" }}
        />
      </svg>
      <span
        className={cn(
          "font-mono text-sm tabular-nums",
          warning ? "text-warn font-semibold" : "text-ink-muted",
        )}
      >
        {formatClock(remaining)}
      </span>
    </div>
  );
}
