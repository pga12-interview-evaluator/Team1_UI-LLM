import { describe, expect, it } from "vitest";
import { countFillers, speechMetrics, speechNotes } from "./speech";

describe("speech metrics (practice coaching only)", () => {
  it("counts filler phrases without double counting and reports the top ones", () => {
    const { count, top } = countFillers(
      "Um, so I, you know, basically built it. Um, like, it worked, you know.",
    );
    expect(count).toBe(6);
    expect(top[0]).toMatch(/^(um|you know) ×2$/);
  });

  it("computes words per minute only with a usable duration", () => {
    const text = Array.from({ length: 60 }, (_, i) => `word${i}`).join(" ");
    expect(speechMetrics(text, 30).words_per_minute).toBe(120);
    expect(speechMetrics(text, null).words_per_minute).toBeNull();
    expect(speechMetrics(text, 1).words_per_minute).toBeNull();
    expect(speechMetrics("", 10).words).toBe(0);
  });

  it("writes pace and filler notes from the session as a whole", () => {
    const fast = speechMetrics(Array(200).fill("go").join(" "), 60);
    expect(speechNotes([fast])[0]).toMatch(/fast/);
    const filler = speechMetrics("um um um um um yes", 10);
    expect(speechNotes([filler]).some((n) => n.includes("Fillers at"))).toBe(true);
    expect(speechNotes([]).length).toBe(0);
  });
});
