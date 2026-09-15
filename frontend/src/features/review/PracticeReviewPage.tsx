"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, CardBody, CardHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import { WorkspaceShell } from "@/features/workspace/WorkspaceShell";
import { candidateApi } from "@/lib/api/candidate";
import { ApiError } from "@/lib/api/client";
import type { PracticeReview, ReviewAnswer } from "@/lib/api/schemas/review";

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

function ReviewBody({ review }: { review: PracticeReview }) {
  const report = review.report;
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          title={`${review.job_title || "Practice interview"} · ${review.seniority}`}
          description={`${review.questions_answered} question${review.questions_answered === 1 ? "" : "s"} answered · ${review.duration_minutes} min${
            review.ended_at ? ` · ${new Date(review.ended_at).toLocaleString()}` : ""
          }`}
        />
        <CardBody className="flex flex-col gap-4">
          {report ? (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <ScoreDial value={report.overall_score} />
                <div>
                  <p className="text-lg font-semibold">{report.headline}</p>
                  <p className="text-ink-muted text-sm">{report.rationale}</p>
                </div>
              </div>
              <CompetencyTable competencies={report.competencies} />
            </>
          ) : (
            <Alert tone="warn">
              The overall report could not be written
              {review.report_error ? ` (${review.report_error})` : ""}. Your per-answer feedback
              below is complete; reload to try the report again.
            </Alert>
          )}
        </CardBody>
      </Card>

      {report ? (
        <div className="grid gap-4 md:grid-cols-3">
          <ListCard
            tone="ok"
            title="What went well"
            items={report.strengths}
            empty="Nothing credited yet — the interview ended early."
          />
          <ListCard
            tone="warn"
            title="What to work on"
            items={[...report.gaps, ...report.unverified_claims]}
            empty="No material gaps recorded."
          />
          <ListCard
            tone="brand"
            title="Practise next"
            items={report.practice_suggestions}
            empty="Finish a full interview for tailored suggestions."
          />
        </div>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your answers, one by one</h2>
        {review.answers.length ? (
          review.answers.map((answer, index) => (
            <AnswerCard key={`${answer.answer_id}-${index}`} answer={answer} index={index + 1} />
          ))
        ) : (
          <p className="text-ink-muted text-sm">No evaluated answers in this session.</p>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader
            title="How you spoke"
            description="From your transcript. Never part of your score."
          />
          <CardBody className="flex flex-col gap-3 text-sm">
            {review.speech_summary ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{review.speech_summary.total_words} words</Badge>
                  <Badge>
                    {review.speech_summary.average_words_per_minute !== null
                      ? `${review.speech_summary.average_words_per_minute} words/min`
                      : "pace: needs voice answers"}
                  </Badge>
                  <Badge>{review.speech_summary.fillers_per_100_words} fillers / 100 words</Badge>
                </div>
                <ul className="list-disc pl-5">
                  {review.speech_summary.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="text-ink-muted">No spoken or typed answers to analyse.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="How you came across on camera"
            description="Coaching signals only. Never part of your score."
          />
          <CardBody className="flex flex-col gap-3 text-sm">
            {review.presence_summary ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Badge>{review.presence_summary.camera_facing_percent}% facing camera</Badge>
                  <Badge>{review.presence_summary.upright_posture_percent}% upright</Badge>
                  <Badge>{review.presence_summary.camera_presence_percent}% in frame</Badge>
                  <Badge>{review.presence_summary.gaze_away_events} look-aways</Badge>
                  <Badge>{review.presence_summary.high_movement_periods} restless periods</Badge>
                </div>
                <ul className="list-disc pl-5">
                  {review.presence_summary.coaching.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
                <p className="text-ink-muted text-xs">{review.presence_summary.note}</p>
              </>
            ) : (
              <p className="text-ink-muted">
                {review.presence_status === "no_consent"
                  ? "You did not opt in to camera analysis for this interview."
                  : review.presence_status === "camera_off"
                    ? "The camera was off for this interview."
                    : "No camera frames were analysed for this interview."}
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/setup" className="action-link">
          Practise again <Icon name="arrow" size={16} />
        </Link>
        <Link href="/review" className="action-link">
          All reviews
        </Link>
      </div>
    </div>
  );
}

function ScoreDial({ value }: { value: number | null }) {
  const pct = value === null ? 0 : Math.round((value / 5) * 100);
  return (
    <div
      className="border-line bg-surface-2 flex size-20 shrink-0 flex-col items-center justify-center rounded-full border-4"
      style={{ borderColor: value === null ? undefined : `hsl(${Math.round(pct * 1.2)} 60% 45%)` }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={5}
      aria-valuenow={value ?? undefined}
      aria-label="Overall score out of 5"
    >
      <span className="text-xl font-semibold">{value === null ? "—" : value.toFixed(1)}</span>
      <span className="text-ink-muted text-[11px]">of 5</span>
    </div>
  );
}

function CompetencyTable({
  competencies,
}: {
  competencies: NonNullable<PracticeReview["report"]>["competencies"];
}) {
  if (!competencies.length) return null;
  return (
    <ul className="flex flex-col gap-2">
      {competencies.map((c) => (
        <li key={c.competency_id} className="grid grid-cols-[1fr_auto] items-center gap-3 text-sm">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{c.name}</span>
              <span className="text-ink-muted text-xs">weight {c.weight}</span>
              {c.demonstrated_up_to !== "not_assessed" ? (
                <Badge tone={c.gap === null || c.demonstrated_up_to === c.bar ? "ok" : "warn"}>
                  reached {c.demonstrated_up_to} · bar {c.bar}
                </Badge>
              ) : null}
            </div>
            <div className="bg-line mt-1 h-2 w-full overflow-hidden rounded-full" aria-hidden>
              <div
                className="bg-brand h-full"
                style={{ width: `${c.score === null ? 0 : (c.score / 5) * 100}%` }}
              />
            </div>
            {c.gap ? <p className="text-ink-muted mt-1 text-xs">{c.gap}</p> : null}
          </div>
          <span className="font-semibold tabular-nums">
            {c.score === null ? "—" : `${c.score}/5`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function ListCard({
  title,
  items,
  empty,
  tone,
}: {
  title: string;
  items: string[];
  empty: string;
  tone: "ok" | "warn" | "brand";
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-brand";
  return (
    <Card>
      <CardBody>
        <p className={`text-xs font-semibold uppercase ${color}`}>{title}</p>
        {items.length ? (
          <ul className="mt-2 list-disc pl-5 text-sm">
            {items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted mt-2 text-sm">{empty}</p>
        )}
      </CardBody>
    </Card>
  );
}

function AnswerCard({ answer, index }: { answer: ReviewAnswer; index: number }) {
  const best = answer.scores.length ? Math.max(...answer.scores.map((s) => s.score)) : null;
  return (
    <details className="rounded-card border-line bg-surface border p-4" open={index === 1}>
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <span className="text-ink-muted font-mono text-xs">{index}</span>
        <Badge>{answer.kind}</Badge>
        <span className="flex-1 font-medium">{answer.question || "(question not recorded)"}</span>
        {best !== null ? (
          <Badge tone={best >= 3 ? "ok" : best >= 2 ? "neutral" : "warn"}>{best}/5</Badge>
        ) : (
          <Badge>not scored</Badge>
        )}
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <blockquote className="border-line bg-surface-2 rounded border-l-4 px-3 py-2">
          {answer.answer}
        </blockquote>
        {answer.scores.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {answer.scores.map((s) => (
              <div key={s.competency_id} className="border-line rounded border px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{s.name}</span>
                  <span className="font-semibold">{s.score}/5</span>
                </div>
                <p className="text-ink-muted text-xs">evidence: {s.evidence_grade}</p>
                {s.evidence.length ? (
                  <p className="mt-1">
                    <span className="text-ok font-semibold">Counted:</span> {s.evidence.join("; ")}
                  </p>
                ) : null}
                {s.missing.length ? (
                  <p className="mt-1">
                    <span className="text-warn font-semibold">Missing:</span> {s.missing.join("; ")}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-ink-muted">
            Not scored — warm-up, a repeat request, or an empty answer.
          </p>
        )}
        {answer.watch_outs.length ? (
          <div>
            <p className="text-warn text-xs font-semibold uppercase">Watch out</p>
            <ul className="mt-1 list-disc pl-5">
              {answer.watch_outs.map((w, i) => (
                <li key={i}>
                  {w.label}
                  {w.quote ? <span className="text-ink-muted"> — “{w.quote}”</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {answer.good_moves.length ? (
          <div>
            <p className="text-ok text-xs font-semibold uppercase">Good moves</p>
            <ul className="mt-1 list-disc pl-5">
              {answer.good_moves.map((g, i) => (
                <li key={i}>
                  {g.label}
                  {g.quote ? <span className="text-ink-muted"> — “{g.quote}”</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {answer.follow_up_asked ? (
          <p>
            <span className="font-semibold">Interviewer pushed with:</span> {answer.follow_up_asked}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {answer.speech ? (
            <>
              <Badge>{answer.speech.words} words</Badge>
              {answer.speech.words_per_minute !== null ? (
                <Badge>{answer.speech.words_per_minute} wpm</Badge>
              ) : null}
              {answer.speech.filler_count ? (
                <Badge tone="warn">fillers: {answer.speech.top_fillers.join(", ")}</Badge>
              ) : null}
            </>
          ) : null}
          {answer.presence ? (
            <>
              <Badge>{answer.presence.camera_facing_percent}% facing camera</Badge>
              <Badge>{answer.presence.upright_posture_percent}% upright</Badge>
            </>
          ) : null}
        </div>
      </div>
    </details>
  );
}
