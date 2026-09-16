"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Card, CardBody } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError } from "@/lib/api/client";
import type { PracticeReview } from "@/lib/api/schemas/review";
import { ReviewBody } from "./ReviewBody";

type State =
  | { kind: "loading" }
  | { kind: "ready"; review: PracticeReview }
  | { kind: "not_finished" }
  | { kind: "not_practice" }
  | { kind: "error"; message: string };

/** The candidate's own post-interview review: scores per answer, delivery, presence, next steps. */
export function PracticeReviewPage({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const review = await candidateApi.getReview(token, signal);
        setState({ kind: "ready", review });
      } catch (caught) {
        if (signal?.aborted) return;
        if (caught instanceof ApiError && caught.code === "not_finished")
          setState({ kind: "not_finished" });
        else if (caught instanceof ApiError && caught.code === "not_practice")
          setState({ kind: "not_practice" });
        else
          setState({
            kind: "error",
            message: caught instanceof Error ? caught.message : "Could not load your review.",
          });
      }
    },
    [token],
  );

  useEffect(() => {
    const controller = new AbortController();
    // State updates happen only after the request resolves, never synchronously in the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  const retry = () => {
    setState({ kind: "loading" });
    void load();
  };

  return (
    <WorkspaceShell
      title="Your review"
      subtitle="Where your answers landed, what the interviewer pushed on, and what to practise next."
    >
      {state.kind === "loading" ? (
        <Card>
          <CardBody className="flex items-center gap-3" aria-busy>
            <span className="bg-brand-soft flex size-9 items-center justify-center rounded-full">
              <Icon name="spark" size={18} />
            </span>
            <div>
              <p className="font-medium">Preparing your review…</p>
              <p className="text-ink-muted text-sm">
                The first open of a review writes the full report. This takes about 15–30 seconds.
              </p>
            </div>
          </CardBody>
        </Card>
      ) : null}
      {state.kind === "not_finished" ? (
        <Alert tone="info">
          Your review is ready once the interview has ended.{" "}
          <Link className="underline" href={`/i/${encodeURIComponent(token)}`}>
            Return to the interview
          </Link>
          .
        </Alert>
      ) : null}
      {state.kind === "not_practice" ? (
        <Alert tone="info">Reviews are available for practice interviews only.</Alert>
      ) : null}
      {state.kind === "error" ? (
        <Alert tone="bad">
          {state.message}{" "}
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </Alert>
      ) : null}
      {state.kind === "ready" ? <ReviewBody review={state.review} /> : null}
    </WorkspaceShell>
  );
}
