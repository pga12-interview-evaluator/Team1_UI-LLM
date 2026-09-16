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

/** Kernel-smoothed pace over the whole interview — a Spotify-style area curve with answer marks. */
export function PaceCurve({
  curve,
}: {
  curve: {
    points: number[];
    average: number;
    peak: number;
    total_seconds: number;
    answer_marks: { at: number; label: string }[];
  };
}) {
  const W = 600;
  const H = 140;
  const padX = 8;
  const padTop = 14;
  const padBottom = 22;
  const max = Math.max(curve.peak, curve.average, 1) * 1.15;
  const x = (i: number) => padX + (i / Math.max(1, curve.points.length - 1)) * (W - padX * 2);
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);
  const line = curve.points
    .map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(" ");
  const area = `${line} L${x(curve.points.length - 1).toFixed(1)},${(H - padBottom).toFixed(1)} L${x(0).toFixed(1)},${(H - padBottom).toFixed(1)} Z`;
  const avgY = y(curve.average);
  const bandTop = y(160);
  const bandBottom = y(120);
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-36 w-full"
      role="img"
      aria-label={`Speaking pace over the interview, average ${curve.average} words per minute`}
    >
      <defs>
        <linearGradient id="paceFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      {/* comfortable band 120–160 wpm */}
      <rect
        x={padX}
        y={bandTop}
        width={W - padX * 2}
        height={Math.max(0, bandBottom - bandTop)}
        fill="var(--ok)"
        opacity="0.08"
      />
      <text x={W - padX} y={bandTop - 3} textAnchor="end" fontSize="9" fill="var(--ok)">
        comfortable 120–160
      </text>
      <path d={area} fill="url(#paceFill)" />
      <path
        d={line}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <line
        x1={padX}
        x2={W - padX}
        y1={avgY}
        y2={avgY}
        stroke="var(--ink-muted)"
        strokeDasharray="4 4"
        strokeWidth="1"
      />
      <text x={padX + 2} y={avgY - 4} fontSize="10" fill="var(--ink-muted)">
        avg {curve.average} wpm
      </text>
      {curve.answer_marks.map((m) => {
        const mx = padX + m.at * (W - padX * 2);
        return (
          <g key={m.label}>
            <line
              x1={mx}
              x2={mx}
              y1={padTop}
              y2={H - padBottom}
              stroke="var(--line-strong)"
              strokeWidth="1"
            />
            <text x={mx + 3} y={H - 8} fontSize="10" fill="var(--ink-muted)">
              Q{m.label}
            </text>
          </g>
        );
      })}
      <text x={W - padX} y={H - 8} textAnchor="end" fontSize="10" fill="var(--ink-muted)">
        {Math.round(curve.total_seconds)}s speaking
      </text>
    </svg>
  );
}

/** Speaking blocks vs silences inside one answer, like a waveform strip. */
export function RhythmStrip({
  segments,
  duration,
  wpm,
}: {
  segments: { start: number; end: number; words: number }[];
  duration: number | null;
  wpm: number | null;
}) {
  const total = duration ?? Math.max(0, ...segments.map((s) => s.end));
  if (!segments.length || !total) return null;
  const tone = wpm === null ? "bg-brand" : wpm < 110 || wpm > 175 ? "bg-warn" : "bg-ok";
  return (
    <div
      className="bg-line relative h-3 w-full overflow-hidden rounded-full"
      role="img"
      aria-label="Speaking rhythm: talking blocks and pauses"
    >
      {segments.map((s, i) => (
        <span
          key={i}
          className={`absolute top-0 h-full rounded-sm ${tone}`}
          style={{
            left: `${(s.start / total) * 100}%`,
            width: `${Math.max(0.6, ((s.end - s.start) / total) * 100)}%`,
          }}
          title={`${s.words} words · ${(s.end - s.start).toFixed(1)}s`}
        />
      ))}
    </div>
  );
}

/** Words per answer as columns, coloured by pace. */
export function WordsJourney({
  points,
}: {
  points: { label: string; words: number; wpm: number | null; fluency: number | null }[];
}) {
  if (!points.length) return null;
  const max = Math.max(1, ...points.map((p) => p.words));
  return (
    <div
      className="flex items-end gap-2 overflow-x-auto pb-1"
      role="img"
      aria-label="Words spoken per answer"
    >
      {points.map((p, i) => {
        const tone = p.wpm === null ? "brand" : p.wpm < 110 || p.wpm > 175 ? "warn" : "ok";
        return (
          <div key={i} className="flex w-12 shrink-0 flex-col items-center gap-1 text-[11px]">
            <span className="text-ink-muted tabular-nums">{p.words}</span>
            <div className="bg-line flex h-[72px] w-6 items-end overflow-hidden rounded">
              <div
                className={`w-full rounded ${toneBar(tone)}`}
                style={{ height: `${Math.max(4, (p.words / max) * 72)}px` }}
              />
            </div>
            <span className="text-ink-muted">{p.label}</span>
            {p.wpm !== null ? <span className="text-ink-muted">{p.wpm} wpm</span> : null}
          </div>
        );
      })}
    </div>
  );
}

/** Sticky in-page navigation for the review sections. */
export function SectionNav({ items }: { items: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="Review sections"
      className="bg-bg/90 sticky top-0 z-10 -mx-1 flex gap-1 overflow-x-auto px-1 py-2 backdrop-blur"
    >
      {items.map((item) => (
        <a
          key={item.id}
          href={`#${item.id}`}
          className="border-line bg-surface hover:border-brand hover:text-brand shrink-0 rounded-full border px-3 py-1 text-xs font-medium"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

/** Numbered, colour-striped section header so each part of the page reads as its own block. */
export function SectionHeading({
  id,
  index,
  title,
  description,
  tone,
}: {
  id: string;
  index: number;
  title: string;
  description: string;
  tone: BadgeTone;
}) {
  return (
    <div id={id} className="flex scroll-mt-16 items-start gap-3">
      <span
        className={`mt-1 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${toneBar(tone)}`}
      >
        {index}
      </span>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-ink-muted text-sm">{description}</p>
      </div>
    </div>
  );
}

/** Compact KPI tile. */
export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: BadgeTone;
  hint?: string;
}) {
  const ring = {
    neutral: "border-line",
    brand: "border-brand/40",
    ok: "border-ok/40",
    warn: "border-warn/40",
    bad: "border-bad/40",
  }[tone];
  return (
    <div className={`bg-surface rounded-lg border-2 px-3 py-2 ${ring}`}>
      <p className="text-ink-muted text-[11px] font-semibold uppercase">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="text-ink-muted text-xs">{hint}</p> : null}
    </div>
  );
}
