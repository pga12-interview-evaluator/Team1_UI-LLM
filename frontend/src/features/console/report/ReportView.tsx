"use client";

import Link from "next/link";
import { Alert, Badge, Card, CardBody, CardHeader, Skeleton, Table, Td, Th } from "@/components/ui";
import type { FinalReport } from "@/lib/api/schemas/console";
import { PageHeader } from "../components/ConsoleShell";
import { LoadError } from "../components/LoadError";
import { RecommendationBadge } from "../components/StatusBadge";
import { useSession } from "../queries";
import { DecisionForm } from "./DecisionForm";
import { NonScoredBlock } from "./NonScoredBlock";

export function ReportView({ id }: { id: string }) {
  const query = useSession(id);
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
  const { report, summary, human_decision } = query.data;
  if (!report) {
    return (
      <>
        <PageHeader title="Report" />
        <Alert tone="info">
          No report yet.{" "}
          <Link href={`/console/sessions/${id}`} className="text-brand underline">
            Generate it from the session page
          </Link>{" "}
          once the interview is closed.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={`Report · ${summary.candidate_label}`}
        description={`${report.role.job_title} · ${report.role.seniority} · ${report.interview_config.pressure_level} pressure · ${report.interview_config.interview_purpose.replace("_", " ")}`}
        actions={
          <>
            <RecommendationBadge value={report.recommendation} />
            <Badge>
              coverage {report.evidence_coverage.assessed_competency_weight_percent}% ·{" "}
              {report.evidence_coverage.coverage_confidence} confidence
            </Badge>
          </>
        }
      />

      <Alert tone="warn" className="mb-6" title="Read the evidence before the label.">
        The label is an interview signal, not a decision. Coverage, the ceiling summary and the
        quotes below are what you are reviewing. Record your own decision and reason at the bottom.
      </Alert>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Competency assessment"
              description={`Overall weighted score: ${report.overall_weighted_score ?? "not computed — evidence too thin"}`}
            />
            <CardBody className="flex flex-col gap-4">
              {report.competency_assessment.map((competency) => (
                <div key={competency.competency_id} className="border-line rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">
                      <span className="text-ink-muted mr-2 font-mono text-xs">
                        {competency.competency_id}
                      </span>
                      {competency.competency_name}
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge>weight {competency.weight}</Badge>
                      <Badge
                        tone={
                          competency.knowledge_depth_score === null
                            ? "neutral"
                            : competency.knowledge_depth_score >= 3
                              ? "ok"
                              : "warn"
                        }
                      >
                        {competency.knowledge_depth_score === null
                          ? "not assessed"
                          : `${competency.knowledge_depth_score}/5`}
                      </Badge>
                      <Badge>{competency.confidence} confidence</Badge>
                    </div>
                  </div>
                  {competency.evidence_for.length ? (
                    <ul className="mt-2 flex flex-col gap-1 text-sm">
                      {competency.evidence_for.map((evidence, index) => (
                        <li key={index} className="border-line border-l-2 pl-3">
                          <span className="text-ink-muted font-mono text-xs">
                            {evidence.question_id}
                          </span>{" "}
                          “{evidence.quote}”
                          <span className="text-ink-muted block text-xs">
                            {evidence.observation}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {competency.evidence_gap ? (
                    <p className="text-warn mt-2 text-sm">{competency.evidence_gap}</p>
                  ) : null}
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Knowledge ceiling vs seniority bar"
              description="A description of the ladder result, never a judgment of the person."
            />
            <CardBody>
              <Table>
                <thead>
                  <tr>
                    <Th>Competency</Th>
                    <Th>Demonstrated up to</Th>
                    <Th>Bar</Th>
                    <Th>Gap</Th>
                  </tr>
                </thead>
                <tbody>
                  {report.knowledge_ceiling_summary.map((row) => (
                    <tr key={row.competency_id}>
                      <Td className="font-mono text-xs">{row.competency_id}</Td>
                      <Td>{row.demonstrated_up_to}</Td>
                      <Td>{row.seniority_bar_rung}</Td>
                      <Td>{row.ceiling_gap.replace(/_/g, " ")}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Claim ledger resolution"
              description="Unsupported means the interview did not obtain support — never that the claim is false."
            />
            <CardBody className="flex flex-col gap-3">
              {report.claim_ledger_resolution.map((claim) => (
                <div key={claim.claim_id} className="border-line rounded-lg border p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink-muted font-mono text-xs">{claim.claim_id}</span>
                    <Badge>{claim.materiality}</Badge>
                    <Badge
                      tone={
                        claim.final_status === "supported"
                          ? "ok"
                          : claim.final_status.startsWith("conflict")
                            ? "bad"
                            : "warn"
                      }
                    >
                      {claim.final_status.replace(/_/g, " ")}
                    </Badge>
                    {claim.why_unsupported ? (
                      <span className="text-ink-muted text-xs">why: {claim.why_unsupported}</span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-medium">{claim.claim_text}</p>
                  <p className="text-ink-muted mt-1">{claim.what_probes_yielded}</p>
                  {claim.quotes.map((quote, index) => (
                    <p key={index} className="border-line text-ink-muted mt-1 border-l-2 pl-3">
                      “{quote}”
                    </p>
                  ))}
                </div>
              ))}
              {report.metric_table.length ? <MetricTable report={report} /> : null}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Evidence-quality patterns and candid signals"
              description="Patterns describe answers, never the person."
            />
            <CardBody className="grid gap-4 md:grid-cols-2">
              <div>
                {report.pattern_summary.length ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {report.pattern_summary.map((pattern, index) => (
                      <li key={`${pattern.pattern}-${index}`}>
                        <Badge tone="warn">{pattern.pattern}</Badge>{" "}
                        <span className="text-ink-muted">×{pattern.occurrences}</span>
                        {pattern.example_quotes.map((quote, index) => (
                          <p
                            key={index}
                            className="border-line text-ink-muted mt-1 border-l-2 pl-3"
                          >
                            “{quote}”
                          </p>
                        ))}
                        <p className="text-ink-muted mt-1 text-xs">{pattern.what_probes_yielded}</p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-muted text-sm">No patterns recorded.</p>
                )}
              </div>
              <div>
                {report.candid_signals_summary.length ? (
                  <ul className="flex flex-col gap-2 text-sm">
                    {report.candid_signals_summary.map((signal, index) => (
                      <li key={`${signal.signal}-${index}`}>
                        <Badge tone="ok">{signal.signal}</Badge>{" "}
                        <span className="text-ink-muted">×{signal.occurrences}</span>
                        <p className="border-line text-ink-muted mt-1 border-l-2 pl-3">
                          “{signal.example_quote}”
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-muted text-sm">No candid signals recorded.</p>
                )}
              </div>
            </CardBody>
          </Card>

          {report.consistency_notes.length ? (
            <Card>
              <CardHeader
                title="Consistency notes"
                description="Direct conflicts only, with both quotes. Intent is never inferred."
              />
              <CardBody className="flex flex-col gap-3 text-sm">
                {report.consistency_notes.map((note, index) => (
                  <div key={index} className="border-line rounded-lg border p-3">
                    <Badge tone="warn">{note.status.replace(/_/g, " ")}</Badge>{" "}
                    <span className="text-ink-muted text-xs">{note.references.join(", ")}</span>
                    <p className="border-line mt-2 border-l-2 pl-3">“{note.quote_a}”</p>
                    <p className="border-line mt-1 border-l-2 pl-3">“{note.quote_b}”</p>
                    <p className="text-ink-muted mt-2">
                      Reconciliation {note.reconciliation_asked ? "asked" : "not asked"} ·{" "}
                      {note.resolution_status.replace(/_/g, " ")}
                    </p>
                    <p className="mt-1 italic">{note.neutral_resolution_question}</p>
                  </div>
                ))}
              </CardBody>
            </Card>
          ) : null}

          <NonScoredBlock context={report.non_scored_behavioral_context} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Recommendation" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <RecommendationBadge value={report.recommendation} />
              <p>{report.recommendation_rationale}</p>
              <div>
                <p className="text-ink-muted text-xs font-semibold uppercase">
                  Smallest useful next step
                </p>
                <p className="font-medium">
                  {report.recommended_next_step.type.replace(/_/g, " ")}
                </p>
                <p className="text-ink-muted">{report.recommended_next_step.purpose}</p>
                <ul className="text-ink-muted mt-1 list-disc pl-5">
                  {report.recommended_next_step.targeted_questions_or_criteria.map(
                    (item, index) => (
                      <li key={`${index}-${item}`}>{item}</li>
                    ),
                  )}
                </ul>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Strengths · gaps · unverified" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <ListBlock
                title="Demonstrated strengths"
                items={report.demonstrated_strengths}
                tone="ok"
              />
              <ListBlock
                title="Material gaps or risks"
                items={report.material_gaps_or_risks}
                tone="warn"
              />
              <ListBlock
                title="Unverified claims"
                items={report.unverified_claims}
                tone="neutral"
              />
              <ListBlock
                title="Coverage limitations"
                items={report.coverage_limitations}
                tone="neutral"
              />
              <ListBlock
                title="Reviewer notes"
                items={report.human_reviewer_notes}
                tone="neutral"
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Ownership profile" />
            <CardBody className="text-sm">
              <p className="text-ink-muted text-xs">
                Expected for seniority: {report.ownership_profile.expected_for_seniority}
              </p>
              <p className="mt-1">{report.ownership_profile.demonstrated_summary}</p>
              {report.ownership_profile.honest_down_scopes.map((item) => (
                <p key={item.claim_id} className="border-line text-ink-muted mt-1 border-l-2 pl-3">
                  {item.claim_id}: “{item.quote}”
                </p>
              ))}
              {report.ownership_profile.notes.map((note, index) => (
                <p key={`${index}-${note}`} className="text-ink-muted mt-1">
                  {note}
                </p>
              ))}
            </CardBody>
          </Card>
          {report.candidate_feedback ? (
            <Card>
              <CardHeader
                title="Candidate feedback (practice mode)"
                description={report.candidate_feedback.note}
              />
              <CardBody className="text-sm">
                <ListBlock
                  title="Strengths"
                  items={report.candidate_feedback.strengths_in_plain_language}
                  tone="ok"
                />
                <ListBlock
                  title="Practice suggestions"
                  items={report.candidate_feedback.practice_suggestions}
                  tone="neutral"
                />
              </CardBody>
            </Card>
          ) : null}
          <DecisionForm sessionId={id} existing={human_decision} />
        </div>
      </div>
    </>
  );
}

function MetricTable({ report }: { report: FinalReport }) {
  return (
    <div className="mt-2">
      <p className="text-ink-muted mb-2 text-xs font-semibold uppercase">Metric provenance</p>
      <Table>
        <thead>
          <tr>
            <Th>Claim</Th>
            <Th>Headline</Th>
            {[
              "baseline",
              "window",
              "definition",
              "source",
              "confounders",
              "causality",
              "persistence",
            ].map((part) => (
              <Th key={part}>{part}</Th>
            ))}
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {report.metric_table.map((row) => (
            <tr key={row.claim_id}>
              <Td className="font-mono text-xs">{row.claim_id}</Td>
              <Td>{row.headline}</Td>
              {[
                "baseline",
                "window",
                "definition",
                "source",
                "confounders",
                "causality",
                "persistence",
              ].map((part) => (
                <Td key={part} className="text-xs">
                  {(row.parts[part] ?? "not_probed").replace(/_/g, " ")}
                </Td>
              ))}
              <Td>
                <Badge tone={row.metric_status === "anchored" ? "ok" : "warn"}>
                  {row.metric_status.replace(/_/g, " ")}
                </Badge>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "ok" | "warn" | "neutral";
}) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-ink-muted";
  return (
    <div>
      <p className={`text-xs font-semibold uppercase ${color}`}>{title}</p>
      {items.length ? (
        <ul className="mt-1 list-disc pl-5">
          {items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-muted mt-1">—</p>
      )}
    </div>
  );
}
