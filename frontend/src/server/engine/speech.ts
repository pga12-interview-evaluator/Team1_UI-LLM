/**
 * Speech coaching metrics from a transcript (+ audio duration when known). Pure functions, no
 * model call. These are practice feedback only — 00 §5: fluency and pace are never scored, and
 * nothing here reaches Prompts 02/03/04.
 */

const FILLERS = [
  "um",
  "umm",
  "uh",
  "uhh",
  "er",
  "erm",
  "ah",
  "hmm",
  "like",
  "you know",
  "i mean",
  "basically",
  "literally",
  "actually",
  "kind of",
  "sort of",
  "right",
  "okay so",
] as const;

export interface SpeechMetrics {
  words: number;
  duration_sec: number | null;
  words_per_minute: number | null;
  filler_count: number;
  fillers_per_100_words: number;
  top_fillers: string[];
}

const wordsOf = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Count filler phrases (longest first so "you know" is not also counted as "know"). */
export function countFillers(text: string): { count: number; top: string[] } {
  const lowered = ` ${wordsOf(text).join(" ")} `;
  const counts = new Map<string, number>();
  let remaining = lowered;
  for (const filler of [...FILLERS].sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`(?<=\\s)${filler.replace(/\s+/g, "\\s+")}(?=\\s)`, "g");
    const hits = remaining.match(pattern)?.length ?? 0;
    if (hits) {
      counts.set(filler, hits);
      remaining = remaining.replace(pattern, "");
    }
  }
  const top = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([filler, n]) => `${filler} ×${n}`);
  return { count: [...counts.values()].reduce((a, b) => a + b, 0), top };
}

export function speechMetrics(text: string, durationSec: number | null): SpeechMetrics {
  const words = wordsOf(text).length;
  const { count, top } = countFillers(text);
  const usable = durationSec !== null && durationSec >= 2 && words > 0;
  return {
    words,
    duration_sec: durationSec !== null ? Number(durationSec.toFixed(1)) : null,
    words_per_minute: usable ? Math.round(words / (durationSec / 60)) : null,
    filler_count: count,
    fillers_per_100_words: words ? Number(((count / words) * 100).toFixed(1)) : 0,
    top_fillers: top,
  };
}

/** Plain-language notes for the whole session; thresholds are conventional coaching ranges. */
export function speechNotes(metrics: SpeechMetrics[]): string[] {
  const notes: string[] = [];
  const withPace = metrics.filter((m) => m.words_per_minute !== null);
  if (withPace.length) {
    const wpm = Math.round(
      withPace.reduce((s, m) => s + (m.words_per_minute ?? 0), 0) / withPace.length,
    );
    if (wpm < 110) notes.push(`Average pace ${wpm} words/min — on the slow side; aim for 120–160.`);
    else if (wpm > 175)
      notes.push(`Average pace ${wpm} words/min — fast; slow down on numbers and names.`);
    else notes.push(`Average pace ${wpm} words/min — comfortable range.`);
  }
  const totalWords = metrics.reduce((s, m) => s + m.words, 0);
  const totalFillers = metrics.reduce((s, m) => s + m.filler_count, 0);
  const rate = totalWords ? (totalFillers / totalWords) * 100 : 0;
  if (totalWords > 0) {
    if (rate >= 5)
      notes.push(
        `Fillers at ${rate.toFixed(1)} per 100 words — pause silently instead of "um" / "like".`,
      );
    else if (rate >= 2)
      notes.push(`Fillers at ${rate.toFixed(1)} per 100 words — noticeable but not distracting.`);
    else notes.push("Very few filler words — clean delivery.");
  }
  const short = metrics.filter((m) => m.words > 0 && m.words < 25).length;
  if (short && short >= metrics.length / 2)
    notes.push(
      "Most answers were under 25 words — give one concrete example per answer (situation, what you did, result).",
    );
  return notes;
}
