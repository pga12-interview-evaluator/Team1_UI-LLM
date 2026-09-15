"use client";

import Link from "next/link";
import { Alert, Skeleton, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/utils/time";
import { PageHeader } from "../components/ConsoleShell";
import { PressureBadge, SessionStatusBadge } from "../components/StatusBadge";
import { useSessions } from "../queries";

export function SessionList({ requisitionId }: { requisitionId?: string }) {
  const query = useSessions(requisitionId ? { requisition_id: requisitionId } : undefined);
  return (
    <>
      <PageHeader
        title="Sessions"
        description="Live and completed interviews. Reviewers open a closed session to generate and read the report."
      />
      {query.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {query.isError ? <Alert tone="bad">Could not load sessions.</Alert> : null}
      {query.data ? (
        <Table>
          <thead>
            <tr>
              <Th>Candidate</Th>
              <Th>Role</Th>
              <Th>Status</Th>
              <Th>Pressure</Th>
              <Th>Progress</Th>
              <Th>Started</Th>
              <Th>Decision</Th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((session) => (
              <tr key={session.session_id}>
                <Td>
                  <Link
                    href={`/console/sessions/${session.session_id}`}
                    className="text-brand font-medium hover:underline"
                  >
                    {session.candidate_label}
                  </Link>
                  {session.invite_token ? (
                    <div className="text-ink-muted font-mono text-xs">
                      /i/{session.invite_token}
                    </div>
                  ) : null}
                </Td>
                <Td>{session.job_title}</Td>
                <Td>
                  <SessionStatusBadge status={session.status} />
                  {session.escalation_reason ? (
                    <div className="text-bad mt-1 text-xs">
                      {session.escalation_reason.replace(/_/g, " ")}
                    </div>
                  ) : null}
                </Td>
                <Td>
                  <PressureBadge level={session.pressure_level} />
                </Td>
                <Td>
                  {session.questions_asked}/{session.questions_planned} questions ·{" "}
                  {session.probes_used} probes · {session.elapsed_minutes} min
                </Td>
                <Td>{formatDateTime(session.started_at)}</Td>
                <Td>{session.human_decision ? session.human_decision.replace(/_/g, " ") : "—"}</Td>
              </tr>
            ))}
            {query.data.items.length === 0 ? (
              <tr>
                <Td colSpan={7} className="text-ink-muted text-center">
                  No sessions.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      ) : null}
    </>
  );
}
