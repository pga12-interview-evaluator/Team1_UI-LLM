import { describe, expect, it } from "vitest";
import { stripQuestionEcho } from "./echo";

const Q1 =
  "What is one piece of data science work from your recent projects that you would be comfortable walking me through?";
const Q3 =
  "Noted. A churn prediction model shows falling accuracy. The product owner wants an answer. Ask me for anything you would need to know. Model accuracy on a customer churn prediction dashboard drops 15 percent week over week while feature inputs are unchanged. The product owner needs an explanation by tomorrow morning. How do you approach it?";

describe("stripQuestionEcho", () => {
  it("removes a read-aloud question with ASR errors and keeps the answer", () => {
    const out = stripQuestionEcho(
      "What is one piece of data science work from your recent projects that you would be comfortable working me through? I have completed a New York taxi price prediction recently.",
      Q1,
    );
    expect(out.text).toBe("I have completed a New York taxi price prediction recently.");
    expect(out.removed_words).toBeGreaterThan(10);
  });

  it("handles a long scenario question echoed with misheard words", () => {
    const out = stripQuestionEcho(
      "Note it. A journal prediction model shows falling accuracy. The product owner wants an answer. Ask me for anything you would need to know. Model accuracy on the customer churn prediction dish all drops 15 percent. We call a required feature. It would start unchanged. The product owner needs an explanation by tomorrow morning. How do you approach it? I think model accuracy will depend on the type of data.",
      Q3,
    );
    expect(out.text.startsWith("I think model accuracy")).toBe(true);
  });

  it("leaves a genuine answer alone, even one that reuses a few question words", () => {
    const answer =
      "The piece of work I am most comfortable with is a credit risk model I built last year with logistic regression.";
    expect(stripQuestionEcho(answer, Q1)).toEqual({ text: answer, removed_words: 0 });
  });

  it("never empties the answer when the candidate only repeated the question", () => {
    const out = stripQuestionEcho(Q1, Q1);
    expect(out.text).toBe(Q1);
    expect(out.removed_words).toBe(0);
  });
});
