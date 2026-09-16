"use client";
import Link from "next/link";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { Icon } from "@/components/ui/Icon";
import type { PracticeReview, ReviewAnswer } from "@/lib/api/schemas/review";
import {
  FillerChart,
  Meter,
  ScoreJourney,
  ScoreRing,
  StatusPill,
  scoreTone,
  trendArrow,
} from "./reviewVisuals";

type Report = NonNullable<PracticeReview["report"]>;

/** The full practice review: verdict, competencies with quotes, claims, numbers, answers, delivery, presence. */
export function ReviewBody({ review }: { review: PracticeReview }) {
  const report = review.report;
  const journey = review.answers.map((a, i) => ({
    label: `${i + 1}`,
    score: a.scores.length ? Math.max(...a.scores.map((s) => s.score)) : null,
    kind: a.kind,
  }));
  return (
    <div className="flex flex-col gap-6">
      <Verdict review={review} report={report} journey={journey} />
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
      {report ? <Competencies report={report} /> : null}
      {report && (report.claims.length || report.metrics.length) ? (
        <ClaimsAndNumbers report={report} />
      ) : null}
      {report && (report.patterns.length || report.pressure.by_question.length) ? (
        <Patterns report={report} />
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
        <SpeechCard summary={review.speech_summary} />
        <PresenceCard review={review} />
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

function Verdict({
  review,
  report,
  journey,
}: {
  review: PracticeReview;
  report: Report | null;
  journey: { label: string; score: number | null; kind: string }[];
}) {
  return (
    <Card>
      <CardHeader
        title={`${review.job_title || "Practice interview"} · ${review.seniority}`}
        description={`${review.questions_answered} question${review.questions_answered === 1 ? "" : "s"} answered · ${review.duration_minutes} min${
          review.ended_at ? ` · ${new Date(review.ended_at).toLocaleString()}` : ""
        }`}
      />
      <CardBody className="flex flex-col gap-5">
        {report ? (
          <div className="grid gap-5 md:grid-cols-[auto_1fr_auto] md:items-center">
            <ScoreRing value={report.overall_score} />
            <div>
              <Badge tone={scoreTone(report.overall_score)}>
                {report.recommendation.replace(/_/g, " ")}
              </Badge>
              <p className="mt-2 text-lg font-semibold">{report.headline}</p>
              <p className="text-ink-muted mt-1 text-sm">{report.rationale}</p>
            </div>
            <div className="md:w-56">
              <p className="text-ink-muted mb-1 text-xs font-semibold uppercase">Score by answer</p>
              <ScoreJourney points={journey} />
            </div>
          </div>
        ) : (
          <Alert tone="warn">
            The overall report could not be written
            {review.report_error ? ` (${review.report_error})` : ""}. Your per-answer feedback below
            is complete; reload to try the report again.
          </Alert>
        )}
      </CardBody>
    </Card>
  );
}

function Competencies({ report }: { report: Report }) {
  if (!report.competencies.length) return null;
  return (
    <Card>
      <CardHeader
        title="Competency by competency"
        description="Score out of 5, how far up the ladder you got, and the exact words that counted."
      />
      <CardBody className="flex flex-col gap-4">
        {report.competencies.map((c) => {
          const tone = scoreTone(c.score);
          return (
            <div key={c.competency_id} className="border-line rounded-lg border p-3">
              <Meter
                value={c.score ?? 0}
                max={5}
                tone={tone}
                suffix="/5"
                label={
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-ink-muted text-xs">weight {c.weight}</span>
                    {c.demonstrated_up_to !== "not_assessed" ? (
                      <Badge
                        tone={
                          c.demonstrated_up_to === c.bar || c.demonstrated_up_to > c.bar
                            ? "ok"
                            : "warn"
                        }
                      >
                        reached {c.demonstrated_up_to} · bar {c.bar}
                      </Badge>
                    ) : (
                      <Badge>ladder not reached</Badge>
                    )}
                    <Badge>{c.confidence} confidence</Badge>
                  </span>
                }
              />
              {c.evidence.length ? (
                <ul className="mt-3 flex flex-col gap-2">
                  {c.evidence.map((e, i) => (
                    <li
                      key={i}
                      className="border-ok/40 bg-ok-soft rounded border-l-4 px-3 py-2 text-sm"
                    >
                      <span className="text-ink-muted font-mono text-xs">{e.question_id}</span> “
                      {e.quote}”<p className="text-ink-muted mt-1 text-xs">{e.observation}</p>
                    </li>
                  ))}
                </ul>
              ) : null}
              {c.gap ? (
                <p className="border-warn/40 bg-warn-soft mt-3 rounded border-l-4 px-3 py-2 text-sm">
                  <span className="text-warn font-semibold">Gap: </span>
                  {c.gap}
                </p>
              ) : null}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

function ClaimsAndNumbers({ report }: { report: Report }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader
          title="Claims you made"
          description="Every material statement and where it landed after follow-up."
        />
        <CardBody className="flex flex-col gap-3">
          {report.claims.length ? (
            report.claims.map((c) => (
              <div key={c.claim_id} className="border-line rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-muted font-mono text-xs">{c.claim_id}</span>
                  <Badge
                    tone={
                      c.materiality === "high"
                        ? "bad"
                        : c.materiality === "medium"
                          ? "warn"
                          : "neutral"
                    }
                  >
                    {c.materiality} materiality
                  </Badge>
                  <StatusPill status={c.status}>{c.status_label}</StatusPill>
                </div>
                <p className="mt-2 font-medium">{c.text}</p>
                {c.why ? (
                  <p className="text-warn mt-1 text-xs">
                    Why not settled: {c.why.replace(/_/g, " ")}
                  </p>
                ) : null}
                {c.quotes.length ? (
                  <p className="text-ink-muted mt-1 text-xs">“{c.quotes[0]}”</p>
                ) : null}
              </div>
            ))
          ) : (
            <p className="text-ink-muted text-sm">No material claims were recorded.</p>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Numbers you mentioned"
          description="Each metric needs a baseline, a window, a definition and a source to count."
        />
        <CardBody className="flex flex-col gap-3">
          {report.metrics.length ? (
            report.metrics.map((m) => (
              <div key={m.claim_id} className="border-line rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-ink-muted font-mono text-xs">{m.claim_id}</span>
                  <StatusPill status={m.status}>{m.status.replace(/_/g, " ")}</StatusPill>
                </div>
                <p className="mt-2 font-medium">{m.headline}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.entries(m.parts).map(([part, value]) => {
                    const missing = /^(missing|not (given|stated|provided|probed)|none|—|-)$/i.test(
                      value.trim(),
                    );
                    return (
                      <Badge key={part} tone={missing ? "bad" : "ok"}>
                        {part}: {value}
                      </Badge>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <p className="text-ink-muted text-sm">
              You did not quote any numbers — a result with a before/after figure is the fastest way
              to score.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Patterns({ report }: { report: Report }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader
          title="Habits the interviewer noticed"
          description="Patterns across answers. Reasons to probe, never score deductions."
        />
        <CardBody>
          {report.patterns.length ? (
            <ul className="flex flex-col gap-2 text-sm">
              {report.patterns.map((p, i) => (
                <li key={i} className="flex flex-wrap items-start gap-2">
                  <Badge tone="warn">×{p.occurrences}</Badge>
                  <span>
                    {p.label}
                    {p.example ? <span className="text-ink-muted"> — “{p.example}”</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ok text-sm">No recurring habits flagged.</p>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title="Under follow-up"
          description="Did your answers get more specific when pushed?"
        />
        <CardBody className="text-sm">
          <p>{report.pressure.narrative}</p>
          {report.pressure.by_question.length ? (
            <ul className="mt-3 flex flex-col gap-1">
              {report.pressure.by_question.map((q) => (
                <li key={q.question_id} className="flex items-center gap-2">
                  <span className="text-ink-muted font-mono text-xs">{q.question_id}</span>
                  <span
                    className={
                      q.direction === "increasing"
                        ? "text-ok"
                        : q.direction === "decreasing"
                          ? "text-bad"
                          : "text-ink-muted"
                    }
                  >
                    {trendArrow[q.direction] ?? q.direction}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>
    </div>
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
  const color =
    tone === "ok"
      ? "text-ok border-ok/40 bg-ok-soft"
      : tone === "warn"
        ? "text-warn border-warn/40 bg-warn-soft"
        : "text-brand border-brand/40 bg-brand-soft";
  return (
    <Card className={`border-l-4 ${color.split(" ").slice(1).join(" ")}`}>
      <CardBody>
        <p className={`text-xs font-semibold uppercase ${color.split(" ")[0]}`}>{title}</p>
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
  const tone = scoreTone(best);
  return (
    <details
      className={`rounded-card border-line bg-surface border border-l-4 p-4 ${tone === "ok" ? "border-l-ok" : tone === "warn" ? "border-l-warn" : tone === "bad" ? "border-l-bad" : tone === "brand" ? "border-l-brand" : ""}`}
      open={index === 1}
    >
      <summary className="flex cursor-pointer flex-wrap items-center gap-2">
        <span className="text-ink-muted font-mono text-xs">{index}</span>
        <Badge>{answer.kind}</Badge>
        <span className="flex-1 font-medium">{answer.question || "(question not recorded)"}</span>
        {best !== null ? <Badge tone={tone}>{best}/5</Badge> : <Badge>not scored</Badge>}
      </summary>
      <div className="mt-3 flex flex-col gap-3 text-sm">
        <blockquote className="border-line bg-surface-2 rounded border-l-4 px-3 py-2">
          {answer.answer}
        </blockquote>
        {answer.scores.length ? (
          <div className="grid gap-2 md:grid-cols-2">
            {answer.scores.map((s) => (
              <div key={s.competency_id} className="border-line rounded border px-3 py-2">
                <Meter
                  value={s.score}
                  max={5}
                  tone={scoreTone(s.score)}
                  suffix="/5"
                  label={<span className="font-medium">{s.name}</span>}
                />
                <p className="text-ink-muted mt-1 text-xs">evidence: {s.evidence_grade}</p>
                {s.evidence.length ? (
                  <p className="mt-1">
                    <span className="text-ok font-semibold">Counted:</span> {s.evidence.join("; ")}
                  </p>
                ) : null}
                {s.missing.length ? (
                  <p className="mt-1">
                    <span className="text-warn font-semibold">Would have lifted the score:</span>{" "}
                    {s.missing.join("; ")}
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
          <div className="border-warn/40 bg-warn-soft rounded border-l-4 px-3 py-2">
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
          <div className="border-ok/40 bg-ok-soft rounded border-l-4 px-3 py-2">
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
                <Badge tone={paceTone(answer.speech.words_per_minute)}>
                  {answer.speech.words_per_minute} wpm
                </Badge>
              ) : null}
              {answer.speech.fluency_score !== null ? (
                <Badge
                  tone={
                    answer.speech.fluency_score >= 85
                      ? "ok"
                      : answer.speech.fluency_score >= 65
                        ? "warn"
                        : "bad"
                  }
                >
                  fluency {answer.speech.fluency_score}/100
                </Badge>
              ) : null}
              {answer.speech.filler_count ? (
                <Badge tone="warn">fillers: {answer.speech.top_fillers.join(", ")}</Badge>
              ) : null}
              {answer.speech.repetitions.length ? (
                <Badge tone="warn">
                  repeated: {[...new Set(answer.speech.repetitions)].slice(0, 3).join(", ")}
                </Badge>
              ) : null}
              {answer.speech.long_pauses ? (
                <Badge tone="warn">
                  {answer.speech.long_pauses} long pause{answer.speech.long_pauses === 1 ? "" : "s"}{" "}
                  (max {answer.speech.longest_pause_sec}s)
                </Badge>
              ) : null}
            </>
          ) : null}
          {answer.presence ? (
            <>
              <Badge tone={answer.presence.camera_facing_percent >= 60 ? "ok" : "warn"}>
                {answer.presence.camera_facing_percent}% facing camera
              </Badge>
              <Badge tone={answer.presence.upright_posture_percent >= 60 ? "ok" : "warn"}>
                {answer.presence.upright_posture_percent}% upright
              </Badge>
            </>
          ) : null}
        </div>
      </div>
    </details>
  );
}

const paceTone = (wpm: number) => (wpm < 110 || wpm > 175 ? "warn" : "ok");

function SpeechCard({ summary }: { summary: PracticeReview["speech_summary"] }) {
  return (
    <Card>
      <CardHeader title="How you spoke" description={summary?.source ?? "From your transcript."} />
      <CardBody className="flex flex-col gap-4 text-sm">
        {summary ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              {summary.fluency_score !== null ? (
                <Meter
                  value={summary.fluency_score}
                  max={100}
                  tone={
                    summary.fluency_score >= 85
                      ? "ok"
                      : summary.fluency_score >= 65
                        ? "warn"
                        : "bad"
                  }
                  label="Fluency score"
                  suffix="/100"
                />
              ) : null}
              {summary.average_words_per_minute !== null ? (
                <Meter
                  value={summary.average_words_per_minute}
                  max={200}
                  tone={paceTone(summary.average_words_per_minute)}
                  label="Pace (words/min)"
                />
              ) : (
                <p className="text-ink-muted">Pace needs a spoken answer.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>{summary.total_words} words</Badge>
              <Badge
                tone={
                  summary.fillers_per_100_words >= 5
                    ? "bad"
                    : summary.fillers_per_100_words >= 2
                      ? "warn"
                      : "ok"
                }
              >
                {summary.fillers_per_100_words} fillers / 100 words
              </Badge>
              <Badge tone={summary.repetition_count ? "warn" : "ok"}>
                {summary.repetition_count} repeated words
              </Badge>
              <Badge tone={summary.long_pauses ? "warn" : "ok"}>
                {summary.long_pauses} long pauses
                {summary.longest_pause_sec ? ` (max ${summary.longest_pause_sec}s)` : ""}
              </Badge>
            </div>
            <div>
              <p className="text-ink-muted mb-1 text-xs font-semibold uppercase">Filler words</p>
              <FillerChart words={summary.filler_words} />
            </div>
            <ul className="list-disc pl-5">
              {summary.notes.map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
            <p className="text-ink-muted text-xs">
              Delivery notes are coaching only and never part of your score.
            </p>
          </>
        ) : (
          <p className="text-ink-muted">No spoken or typed answers to analyse.</p>
        )}
      </CardBody>
    </Card>
  );
}

function PresenceCard({ review }: { review: PracticeReview }) {
  const p = review.presence_summary;
  return (
    <Card>
      <CardHeader
        title="How you came across on camera"
        description="Coaching signals only. Never part of your score."
      />
      <CardBody className="flex flex-col gap-4 text-sm">
        {p ? (
          <>
            <Meter
              value={p.camera_facing_percent}
              tone={
                p.camera_facing_percent >= 70
                  ? "ok"
                  : p.camera_facing_percent >= 40
                    ? "warn"
                    : "bad"
              }
              label="Facing the camera"
              suffix="%"
            />
            <Meter
              value={p.upright_posture_percent}
              tone={p.upright_posture_percent >= 60 ? "ok" : "warn"}
              label="Upright posture"
              suffix="%"
            />
            <Meter
              value={p.camera_presence_percent}
              tone={p.camera_presence_percent >= 70 ? "ok" : "warn"}
              label="In frame"
              suffix="%"
            />
            <div className="flex flex-wrap gap-2">
              <Badge tone={p.gaze_away_events > 5 ? "warn" : "neutral"}>
                {p.gaze_away_events} look-aways
              </Badge>
              <Badge tone={p.high_movement_periods >= 3 ? "warn" : "neutral"}>
                {p.high_movement_periods} restless periods
              </Badge>
            </div>
            <ul className="list-disc pl-5">
              {p.coaching.map((tip, i) => (
                <li key={i}>{tip}</li>
              ))}
            </ul>
            <p className="text-ink-muted text-xs">{p.note}</p>
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
  );
}
