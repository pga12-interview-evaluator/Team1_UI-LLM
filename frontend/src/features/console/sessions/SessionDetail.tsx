"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Skeleton,
  Table,
  Tabs,
  Td,
  Th,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type {
  EvaluationSummary,
  SessionDetail as SessionDetailType,
  TranscriptEntry,
} from "@/lib/api/schemas/console";
import { formatDateTime } from "@/lib/utils/time";
import { PageHeader } from "../components/ConsoleShell";
import { LoadError } from "../components/LoadError";
import { PressureBadge, SessionStatusBadge } from "../components/StatusBadge";
import { useGenerateReport, useSession } from "../queries";

export function SessionDetail({ id }: { id: string }) {
  const query = useSession(id, true);
  const generate = useGenerateReport(id);
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data)
    return (
      <LoadError
        error={query.error}
        what="session"
        backHref="/console/sessions"
        onRetry={() => void query.refetch()}
      />
    );
  const detail = query.data;
  const { summary } = detail;
  const closed =
    summary.status === "closed" || summary.status === "escalated" || summary.status === "reported";

  return (
    <>
      <PageHeader
        title={`${summary.candidate_label} · ${summary.job_title}`}
        description={`Started ${formatDateTime(summary.started_at)} · ${summary.elapsed_minutes} min · ${summary.questions_asked}/${summary.questions_planned} questions · ${summary.probes_used} probes`}
        actions={
          <>
            <SessionStatusBadge status={summary.status} />
            <PressureBadge level={summary.pressure_level} />
            {summary.accommodation_applied ? (
              <Badge tone="neutral">accommodation applied</Badge>
            ) : null}
            {closed && !detail.report ? (
              <Button
                onClick={async () => {
                  setError(null);
                  try {
                    await generate.mutateAsync();
                    toast.push({
                      tone: "ok",
                      title: "Report generated",
                      body: "Read the evidence before the label.",
                    });
                  } catch (caught) {
                    setError(
                      caught instanceof ApiError
                        ? caught.message
                        : "Could not generate the report.",
                    );
                  }
                }}
                loading={generate.isPending}
              >
                Generate report
              </Button>
            ) : null}
            {detail.report ? (
              <Link href={`/console/sessions/${id}/report`}>
                <Button>Open report</Button>
              </Link>
            ) : null}
          </>
        }
      />
      {!closed ? (
        <Alert tone="info" className="mb-4" live>
          Live session. The report becomes available once the interview is closed.
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="bad" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <Tabs
        items={[
          {
            id: "transcript",
            label: `Transcript (${detail.transcript.length})`,
            content: <Transcript entries={detail.transcript} />,
          },
          {
            id: "evaluations",
            label: `Evaluations (${detail.evaluations.length})`,
            content: <Evaluations items={detail.evaluations} />,
          },
          { id: "budget", label: "Budget audit", content: <BudgetAudit detail={detail} /> },
          { id: "meta", label: "Versions", content: <Versions detail={detail} /> },
        ]}
      />
    </>
  );
}

function Transcript({ entries }: { entries: TranscriptEntry[] }) {
  if (!entries.length) return <p className="text-ink-muted">No turns yet.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {entries.map((entry) => (
        <li
          key={entry.turn_index}
          className={`border-line rounded-lg border p-3 ${entry.role === "candidate" ? "bg-surface" : "bg-surface-2"}`}
        >
          <div className="text-ink-muted flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono">#{entry.turn_index}</span>
            <span className="text-ink font-semibold">{entry.role}</span>
            {entry.question_id ? <span className="font-mono">{entry.question_id}</span> : null}
            {entry.technique && entry.technique !== "NONE" ? (
              <Badge tone="brand">{entry.technique}</Badge>
            ) : null}
            {entry.turn_type ? <span>{entry.turn_type.replace(/_/g, " ")}</span> : null}
            <span>{entry.source}</span>
            <span className="ml-auto">{formatDateTime(entry.committed_at)}</span>
          </div>
          <p className="mt-2 text-[15px] whitespace-pre-wrap">{entry.text}</p>
        </li>
      ))}
    </ol>
  );
}

function Evaluations({ items }: { items: EvaluationSummary[] }) {
  if (!items.length) return <p className="text-ink-muted">No evaluations yet.</p>;
  return (
    <div className="flex flex-col gap-4">
      {items.map((evaluation) => (
        <Card key={evaluation.answer_id}>
          <CardHeader
            title={
              <span className="font-mono text-sm">
                {evaluation.question_id} · {evaluation.answer_id}
              </span>
            }
            description={evaluation.question_digest}
            actions={
              <Badge tone={evaluation.recommended_next_action === "probe" ? "warn" : "ok"}>
                {evaluation.recommended_next_action.replace(/_/g, " ")}
              </Badge>
            }
          />
          <CardBody className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-ink-muted text-xs font-semibold uppercase">Competency scores</p>
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {evaluation.competency_scores.map((score) => (
                  <li
                    key={score.competency_id}
                    className="border-line flex items-center justify-between rounded border px-2 py-1"
                  >
                    <span className="font-mono text-xs">{score.competency_id}</span>
                    <span>
                      {score.score}/5 · {score.evidence_grade.replace(/_/g, " ")}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="text-ink-muted mt-2 text-xs">Confidence: {evaluation.confidence}</p>
            </div>
            <div className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-ink-muted text-xs font-semibold uppercase">
                  Evidence-quality patterns
                </p>
                {evaluation.pattern_flags.length ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {evaluation.pattern_flags.map((flag, index) => (
                      <li key={`${flag.pattern}-${index}`}>
                        <Badge tone="warn">{flag.pattern}</Badge>{" "}
                        <span className="text-ink-muted">
                          sev {flag.severity} · “{flag.quote}”
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-muted">none</p>
                )}
              </div>
              <div>
                <p className="text-ink-muted text-xs font-semibold uppercase">Candid signals</p>
                {evaluation.candid_signals.length ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {evaluation.candid_signals.map((signal, index) => (
                      <li key={`${signal.signal}-${index}`}>
                        <Badge tone="ok">{signal.signal}</Badge>{" "}
                        <span className="text-ink-muted">“{signal.quote}”</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-muted">none</p>
                )}
              </div>
              <div>
                <p className="text-ink-muted text-xs font-semibold uppercase">
                  Directives handed to the interviewer
                </p>
                {evaluation.probe_directives.length ? (
                  <ol className="mt-1 list-decimal pl-5">
                    {evaluation.probe_directives.map((directive) => (
                      <li key={directive.rank}>
                        <Badge tone="brand">{directive.technique}</Badge>{" "}
                        {directive.suggested_wording}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-ink-muted">none</p>
                )}
              </div>
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}

function BudgetAudit({ detail }: { detail: SessionDetailType }) {
  if (!detail.budget_audit.length)
    return <p className="text-ink-muted">No budget decisions yet.</p>;
  return (
    <Table>
      <thead>
        <tr>
          <Th>Answer</Th>
          <Th>Pattern weight</Th>
          <Th>Grade</Th>
          <Th>Escalation</Th>
          <Th>Base / cap</Th>
          <Th>Pool</Th>
          <Th>Model → backend</Th>
          <Th>Override</Th>
        </tr>
      </thead>
      <tbody>
        {detail.budget_audit.map((row) => (
          <tr key={row.answer_id}>
            <Td className="font-mono text-xs">{row.answer_id}</Td>
            <Td>
              {row.pattern_weight} ({row.distinct_moderate} moderate)
            </Td>
            <Td>{row.evidence_grade.replace(/_/g, " ")}</Td>
            <Td>
              {row.content_escalation ? "content +1" : "—"}
              {row.attention_boost ? " · attention +1" : ""}
            </Td>
            <Td>
              {row.base} / {row.cap}
            </Td>
            <Td>
              {row.pool_before} → {row.pool_after}
            </Td>
            <Td>
              {row.model_recommendation} → <strong>{row.backend_decision}</strong>
            </Td>
            <Td>{row.override_reason ?? "—"}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function Versions({ detail }: { detail: SessionDetailType }) {
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {Object.entries(detail.version_bundle).map(([key, value]) => (
        <div key={key} className="border-line rounded border px-3 py-2">
          <dt className="text-ink-muted font-mono text-xs">{key}</dt>
          <dd>{value}</dd>
        </div>
      ))}
      <div className="border-line rounded border px-3 py-2">
        <dt className="text-ink-muted font-mono text-xs">accommodations_applied</dt>
        <dd>
          {detail.accommodations_applied.length ? detail.accommodations_applied.join(", ") : "none"}
        </dd>
      </div>
    </dl>
  );
}
