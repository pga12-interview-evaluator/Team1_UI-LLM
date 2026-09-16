"use client";

import { useEffect, useState } from "react";

/**
 * Whole-interview clock: elapsed vs planned length. The server is the authority — every
 * response carries `elapsed_seconds`; this only ticks forward between responses.
 */
export function InterviewClock({
  elapsedSeconds,
  durationMinutes,
  running,
}: {
  elapsedSeconds: number;
  durationMinutes: number;
  running: boolean;
}) {
  const [elapsed, setElapsed] = useState(elapsedSeconds);

  useEffect(() => {
    // Re-anchor on every server value, then tick locally once a second while the interview runs.
    const anchoredAt = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setElapsed(elapsedSeconds);
    if (!running) return;
    const timer = window.setInterval(
      () => setElapsed(elapsedSeconds + Math.round((Date.now() - anchoredAt) / 1000)),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [elapsedSeconds, running]);

  const total = durationMinutes * 60;
  const remaining = Math.max(0, total - elapsed);
  const pct = total ? Math.min(100, (elapsed / total) * 100) : 0;
  const tone = remaining <= 120 ? "bg-bad" : remaining <= 300 ? "bg-warn" : "bg-brand";

  return (
    <div className="border-line bg-surface-2 rounded-lg border px-3 py-2" aria-live="off">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-muted">Interview time</span>
        <span className="font-mono tabular-nums">
          <span className="text-ink font-semibold">{format(elapsed)}</span>
          <span className="text-ink-muted"> / {format(total)}</span>
        </span>
      </div>
      <div
        className="bg-line mt-2 h-1.5 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={elapsed}
        aria-label="Interview time used"
      >
        <div className={`h-full transition-[width] ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-ink-muted mt-1 text-xs">
        {remaining > 0
          ? `${format(remaining)} left`
          : "Planned time used — the interviewer will wrap up"}
      </p>
    </div>
  );
}

function format(seconds: number): string {
  const m = Math.floor(Math.max(0, seconds) / 60);
  const s = Math.max(0, seconds) % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
