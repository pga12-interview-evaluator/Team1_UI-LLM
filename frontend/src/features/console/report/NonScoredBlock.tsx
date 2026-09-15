"use client";

import { Badge } from "@/components/ui";
import type { FinalReport } from "@/lib/api/schemas/console";

/**
 * Behavioral context is rendered LAST, COLLAPSED, under the fixed disclaimer, as counts and flags only.
 * Omitted entirely when capture was disabled. This block is never adjacent to a score.
 */
export function NonScoredBlock({
  context,
}: {
  context: FinalReport["non_scored_behavioral_context"];
}) {
  if (!context || context.capture_status.startsWith("disabled")) return null;
  return (
    <details className="rounded-card border-line bg-surface-2 border p-4">
      <summary className="text-ink cursor-pointer text-sm font-semibold">
        Non-scored behavioral context (collapsed by default)
      </summary>
      <p className="border-warn/40 bg-warn-soft mt-3 rounded-lg border px-3 py-2 text-sm">
        {context.disclaimer}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Badge>capture: {context.capture_status.replace(/_/g, " ")}</Badge>
        <Badge>with signals: {context.coverage.answers_with_signals}</Badge>
        <Badge>partial: {context.coverage.answers_partial}</Badge>
        <Badge>without: {context.coverage.answers_without}</Badge>
        <Badge tone="ok">used in scoring: no</Badge>
      </div>
      {context.flags_by_answer.length ? (
        <ul className="mt-3 flex flex-col gap-2 text-sm">
          {context.flags_by_answer.map((answer) => (
            <li key={answer.answer_id} className="border-line bg-surface rounded border px-3 py-2">
              <span className="text-ink-muted font-mono text-xs">
                {answer.question_id} · {answer.answer_id}
              </span>
              <ul className="mt-1 flex flex-wrap gap-2">
                {answer.flags.map((flag, index) => (
                  <li key={index} className="text-xs">
                    <Badge>{flag.flag}</Badge> {flag.strength} · influenced:{" "}
                    {flag.influenced.replace(/_/g, " ")}
                    {flag.resolution_note ? (
                      <span className="text-ink-muted"> · {flag.resolution_note}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted mt-3 text-sm">
          No attention flags fired during this interview.
        </p>
      )}
    </details>
  );
}
