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
  Dialog,
  Input,
  Skeleton,
  Table,
  Td,
  Th,
  useToast,
} from "@/components/ui";
import { ApiError } from "@/lib/api/client";
import type { InviteResponse, Requisition } from "@/lib/api/schemas/console";
import { PageHeader } from "../components/ConsoleShell";
import { LoadError } from "../components/LoadError";
import { PressureBadge, RequisitionStatusBadge } from "../components/StatusBadge";
import { useInvite, useRequisition, useRequisitionAction, useSessions } from "../queries";
import { RequisitionForm } from "./RequisitionForm";

export function RequisitionDetail({ id }: { id: string }) {
  const query = useRequisition(id);
  const sessions = useSessions({ requisition_id: id });
  const generate = useRequisitionAction(id, "blueprint");
  const freeze = useRequisitionAction(id, "freeze");
  const invite = useInvite(id);
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [lastInvite, setLastInvite] = useState<InviteResponse | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (query.isPending) return <Skeleton className="h-64 w-full" />;
  if (query.isError || !query.data)
    return (
      <LoadError
        error={query.error}
        what="requisition"
        backHref="/console/requisitions"
        onRetry={() => void query.refetch()}
      />
    );
  const requisition = query.data;

  const run = async (
    action: () => Promise<unknown>,
    success?: { title: string; body?: string },
  ) => {
    setActionError(null);
    try {
      await action();
      if (success) toast.push({ tone: "ok", ...success });
    } catch (caught) {
      setActionError(caught instanceof ApiError ? caught.message : "Action failed.");
    }
  };

  if (editing) {
    return (
      <>
        <PageHeader
          title={`Edit · ${requisition.job_title}`}
          actions={
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Back
            </Button>
          }
        />
        <RequisitionForm existing={requisition} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={requisition.job_title}
        description={`${requisition.field} · ${requisition.seniority} · ${requisition.duration_minutes} min · ${requisition.interview_language}`}
        actions={
          <>
            <RequisitionStatusBadge status={requisition.status} />
            <PressureBadge level={requisition.pressure_level} />
            <Button
              variant="secondary"
              onClick={() => setEditing(true)}
              disabled={requisition.status === "frozen"}
            >
              Edit
            </Button>
            {!requisition.blueprint ||
            requisition.status === "draft" ||
            requisition.status === "blueprint_review" ? (
              <Button
                variant="secondary"
                onClick={() =>
                  run(() => generate.mutateAsync(), {
                    title: "Blueprint generated",
                    body: "Review the plan, then freeze it.",
                  })
                }
                loading={generate.isPending}
              >
                {requisition.blueprint ? "Regenerate blueprint" : "Generate blueprint"}
              </Button>
            ) : null}
            {requisition.blueprint && requisition.status !== "frozen" ? (
              <Button
                onClick={() =>
                  run(() => freeze.mutateAsync(), {
                    title: "Blueprint frozen",
                    body: "Rungs, cases and probes are now identical for every candidate.",
                  })
                }
                loading={freeze.isPending}
                disabled={!requisition.blueprint.validation.passed}
              >
                Freeze blueprint
              </Button>
            ) : null}
            {requisition.status === "frozen" ? (
              <Button onClick={() => setInviteOpen(true)}>Invite candidate</Button>
            ) : null}
          </>
        }
      />
      {actionError ? (
        <Alert tone="bad" className="mb-4">
          {actionError}
        </Alert>
      ) : null}
      {lastInvite ? (
        <Alert tone="ok" className="mb-4" title="Invite created">
          Share this link with the candidate:{" "}
          <code className="break-all">{lastInvite.invite_url}</code>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader
            title="Blueprint review"
            description="Human review before freezing. Rungs, cases and probe wording are then identical for every candidate."
          />
          <CardBody>
            {requisition.blueprint ? (
              <BlueprintView requisition={requisition} />
            ) : (
              <p className="text-ink-muted">
                No blueprint yet. Generate one from the job description.
              </p>
            )}
          </CardBody>
        </Card>
        <div className="flex min-w-0 flex-col gap-6">
          <Card>
            <CardHeader title="Inputs" />
            <CardBody className="flex flex-col gap-3 text-sm">
              <div>
                <p className="text-ink-muted text-xs font-semibold uppercase">Must-have</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {requisition.must_have_skills.map((skill) => (
                    <Badge key={skill} tone="brand">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-ink-muted text-xs font-semibold uppercase">Nice-to-have</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {requisition.nice_to_have_skills.length ? (
                    requisition.nice_to_have_skills.map((skill) => (
                      <Badge key={skill}>{skill}</Badge>
                    ))
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </div>
              </div>
              <div>
                <p className="text-ink-muted text-xs font-semibold uppercase">
                  Purpose · style · modality
                </p>
                <p>
                  {requisition.interview_purpose.replace("_", " ")} · {requisition.interview_style}{" "}
                  · {requisition.interview_modality}
                </p>
              </div>
              {requisition.pressure_rationale ? (
                <div>
                  <p className="text-ink-muted text-xs font-semibold uppercase">
                    Pressure rationale
                  </p>
                  <p>{requisition.pressure_rationale}</p>
                </div>
              ) : null}
              <details>
                <summary className="text-brand cursor-pointer">Job description</summary>
                <p className="text-ink-muted mt-2 whitespace-pre-wrap">
                  {requisition.job_description}
                </p>
              </details>
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Sessions"
              actions={
                <Link
                  href={`/console/sessions?requisition_id=${id}`}
                  className="text-brand text-sm hover:underline"
                >
                  All
                </Link>
              }
            />
            <CardBody className="text-sm">
              {sessions.data?.items.length ? (
                <ul className="flex flex-col gap-2">
                  {sessions.data.items.slice(0, 6).map((session) => (
                    <li
                      key={session.session_id}
                      className="flex items-center justify-between gap-2"
                    >
                      <Link
                        href={`/console/sessions/${session.session_id}`}
                        className="text-brand hover:underline"
                      >
                        {session.candidate_label}
                      </Link>
                      <span className="text-ink-muted text-xs">
                        {session.status.replace("_", " ")}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-ink-muted">No sessions yet.</p>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite a candidate"
        description="Use a pseudonymous label. The console never needs a candidate's name to review an interview."
        footer={
          <>
            <Button variant="secondary" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={invite.isPending}
              disabled={!label.trim()}
              onClick={() =>
                run(
                  async () => {
                    const result = await invite.mutateAsync({ candidate_label: label.trim() });
                    setLastInvite(result);
                    setLabel("");
                    setInviteOpen(false);
                  },
                  {
                    title: "Invite created",
                    body: "Copy the link from the banner and share it with the candidate.",
                  },
                )
              }
            >
              Create invite link
            </Button>
          </>
        }
      >
        <Input
          label="Candidate label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Candidate 07"
        />
      </Dialog>
    </>
  );
}

function BlueprintView({ requisition }: { requisition: Requisition }) {
  const blueprint = requisition.blueprint!;
  const reserve = blueprint.interview_control.candidate_questions_reserve_minutes;
  return (
    <div className="flex flex-col gap-5">
      {!blueprint.validation.passed ? (
        <Alert tone="bad" title="Validation failed">
          <ul className="list-disc pl-5">
            {blueprint.validation.failures.map((failure) => (
              <li key={failure}>{failure}</li>
            ))}
          </ul>
        </Alert>
      ) : (
        <Alert tone="ok">
          Blueprint validated (weights 100, ladders on critical competencies, no-leak, time fits).
        </Alert>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Competencies</h3>
        <Table>
          <thead>
            <tr>
              <Th>Id</Th>
              <Th>Name</Th>
              <Th>Weight</Th>
              <Th>Must-have</Th>
              <Th>Ladder</Th>
              <Th>Start → bar</Th>
            </tr>
          </thead>
          <tbody>
            {blueprint.competencies.map((c) => (
              <tr key={c.id}>
                <Td className="font-mono text-xs">{c.id}</Td>
                <Td>{c.name}</Td>
                <Td>{c.weight}</Td>
                <Td>{c.is_must_have ? "yes" : "—"}</Td>
                <Td>{c.has_ladder ? "L1–L3" : "—"}</Td>
                <Td>
                  {c.start_rung} → {c.seniority_bar_rung}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">
          Interview plan · {blueprint.interview_control.planned_minutes} min planned + {reserve} min
          reserve of {requisition.duration_minutes}
        </h3>
        <ol className="flex flex-col gap-2">
          {blueprint.interview_plan.map((item) => (
            <li key={item.question_id} className="border-line rounded-lg border p-3">
              <div className="text-ink-muted flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono">{item.question_id}</span>
                <Badge>{item.question_type.replace(/_/g, " ")}</Badge>
                <span>{item.time_budget_minutes} min</span>
                <span>{item.target_competencies.join(", ") || "unscored"}</span>
                <span>{item.probe_count} planned probes</span>
              </div>
              <p className="mt-1 text-[15px]">{item.candidate_facing_question}</p>
            </li>
          ))}
        </ol>
      </div>
      <details>
        <summary className="text-brand cursor-pointer text-sm">Self-check</summary>
        <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
          {Object.entries(blueprint.self_check).map(([key, value]) => (
            <li
              key={key}
              className="border-line flex items-center justify-between gap-2 rounded border px-2 py-1"
            >
              <span className="font-mono text-xs">{key}</span>
              <span>
                {Array.isArray(value)
                  ? value.length
                    ? value.join(", ")
                    : "—"
                  : value === null
                    ? "n/a"
                    : value
                      ? "✓"
                      : "✗"}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
