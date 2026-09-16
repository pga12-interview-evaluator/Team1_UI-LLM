/**
 * Strip a read-aloud question echoed at the start of a voice answer. The microphone hears the
 * interviewer's text-to-speech (or the candidate reading the question back) before the answer,
 * and Whisper transcribes both. Pure text comparison; no model call.
 */

const tokens = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

/** Multiset Jaccard similarity of two token lists. */
function overlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const counts = new Map<string, number>();
  for (const word of b) counts.set(word, (counts.get(word) ?? 0) + 1);
  let shared = 0;
  for (const word of a) {
    const left = counts.get(word) ?? 0;
    if (left > 0) {
      shared += 1;
      counts.set(word, left - 1);
    }
  }
  return shared / (a.length + b.length - shared);
}

const MIN_ECHO_WORDS = 5;
const MIN_SIMILARITY = 0.55;

/**
 * If the transcript opens with a near-copy of `question`, return the transcript without it.
 * Tolerates ASR errors and a few extra/missing words by trying windows around the question's
 * length. Returns the original text when no confident echo is found.
 */
export function stripQuestionEcho(
  transcript: string,
  question: string,
): {
  text: string;
  removed_words: number;
} {
  const q = tokens(question);
  const raw = transcript.trim();
  const words = raw.split(/\s+/).filter(Boolean);
  if (q.length < MIN_ECHO_WORDS || words.length < MIN_ECHO_WORDS)
    return { text: raw, removed_words: 0 };
  let best = { n: 0, score: 0 };
  const low = Math.max(MIN_ECHO_WORDS, Math.floor(q.length * 0.7));
  const high = Math.min(words.length, Math.ceil(q.length * 1.3));
  for (let n = low; n <= high; n += 1) {
    const score = overlap(tokens(words.slice(0, n).join(" ")), q);
    if (score > best.score) best = { n, score };
  }
  if (best.score < MIN_SIMILARITY) return { text: raw, removed_words: 0 };
  // Snap the cut to where the question's last three words actually end in the transcript, so a
  // window that stopped a word early does not leave "...approach it?" glued to the answer.
  const tail = q.slice(-3);
  let cut = best.n;
  for (let i = Math.max(0, best.n - 6); i <= Math.min(words.length - 3, best.n + 8); i += 1) {
    const window = tokens(words.slice(i, i + 3).join(" "));
    const hits = window.filter((w, k) => w === tail[k]).length;
    if (hits >= 2) cut = i + 3;
  }
  const rest = words.slice(cut).join(" ").trim();
  // Never delete the whole answer: if nothing is left, the candidate only repeated the question.
  return { text: rest || raw, removed_words: rest ? cut : 0 };
}
