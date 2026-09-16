"use client";
import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

/** Small, dependency-free visuals for the practice review. Colours follow the app tokens. */

export const scoreTone = (score: number | null): BadgeTone =>
  score === null
    ? "neutral"
    : score >= 4
      ? "ok"
      : score >= 2.5
        ? "brand"
        : score >= 1.5
          ? "warn"
          : "bad";

const barClass: Record<BadgeTone, string> = {
  neutral: "bg-line-strong",
  brand: "bg-brand",
  ok: "bg-ok",
  warn: "bg-warn",
  bad: "bg-bad",
};

export const toneBar = (tone: BadgeTone) => barClass[tone];

/** Big ring for the overall score (0–5). */
export function ScoreRing({ value, label = "of 5" }: { value: number | null; label?: string }) {
  const pct = value === null ? 0 : Math.round((value / 5) * 100);
  const tone = scoreTone(value);
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div
      className="relative size-24 shrink-0"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? undefined}
      aria-label="Overall score out of 5"
    >
      <svg viewBox="0 0 80 80" className="size-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-line" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          className={`transition-[stroke-dasharray] ${toneStroke(tone)}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold">{value === null ? "—" : value.toFixed(1)}</span>
        <span className="text-ink-muted text-[11px]">{label}</span>
      </div>
    </div>
  );
}

const toneStroke = (tone: BadgeTone) =>
  ({
    neutral: "stroke-line-strong",
    brand: "stroke-brand",
    ok: "stroke-ok",
    warn: "stroke-warn",
    bad: "stroke-bad",
  })[tone];

/** Horizontal meter, 0–max, coloured by tone. */
export function Meter({
  value,
  max = 100,
  tone,
  label,
  suffix = "",
}: {
  value: number;
  max?: number;
  tone: BadgeTone;
  label: ReactNode;
  suffix?: string;
}) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="text-sm">
      <div className="flex items-center justify-between gap-2">
        <span>{label}</span>
        <span className="font-semibold tabular-nums">
          {Number.isInteger(value) ? value : value.toFixed(1)}
          {suffix}
        </span>
      </div>
      <div className="bg-line mt-1 h-2 w-full overflow-hidden rounded-full" aria-hidden>
        <div
          className={`h-full rounded-full transition-[width] ${toneBar(tone)}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Column chart of per-answer scores (0–5), coloured per bar. */
export function ScoreJourney({
  points,
}: {
  points: { label: string; score: number | null; kind: string }[];
}) {
  if (!points.length) return null;
  return (
    <div
      className="flex items-end gap-2 overflow-x-auto pb-1"
      role="img"
      aria-label="Score per answer in order"
    >
      {points.map((p, i) => {
        const tone = scoreTone(p.score);
        const h = p.score === null ? 6 : Math.max(6, (p.score / 5) * 72);
        return (
          <div key={i} className="flex w-12 shrink-0 flex-col items-center gap-1 text-[11px]">
            <span className="text-ink-muted tabular-nums">
              {p.score === null ? "–" : `${p.score}`}
            </span>
            <div className="bg-line flex h-[72px] w-6 items-end overflow-hidden rounded">
              <div className={`w-full rounded ${toneBar(tone)}`} style={{ height: `${h}px` }} />
            </div>
            <span className="text-ink-muted truncate" title={p.kind}>
              {p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Filler-word frequency as bars. */
export function FillerChart({ words }: { words: Record<string, number> }) {
  const entries = Object.entries(words)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (!entries.length) return <p className="text-ok text-sm">No filler words detected.</p>;
  const max = entries[0]![1];
  return (
    <ul className="flex flex-col gap-1.5">
      {entries.map(([word, n]) => (
        <li key={word} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-2 text-sm">
          <span className="truncate font-mono">{word}</span>
          <div className="bg-line h-2 overflow-hidden rounded-full">
            <div className="bg-warn h-full rounded-full" style={{ width: `${(n / max) * 100}%` }} />
          </div>
          <span className="text-right tabular-nums">{n}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatusPill({ status, children }: { status: string; children: ReactNode }) {
  const tone: BadgeTone =
    status === "supported" || status === "anchored"
      ? "ok"
      : status === "partially_supported" || status === "revised_by_candidate"
        ? "brand"
        : status === "not_tested" ||
            status === "withheld_confidential" ||
            status === "not_their_scope"
          ? "neutral"
          : status === "unanchored" || status === "unresolved_after_probing"
            ? "warn"
            : "bad";
  return <Badge tone={tone}>{children}</Badge>;
}

export const trendArrow: Record<string, string> = {
  increasing: "↗ more specific under follow-up",
  flat: "→ stayed at the same level",
  decreasing: "↘ got vaguer under follow-up",
  not_applicable: "· no follow-up asked",
};
