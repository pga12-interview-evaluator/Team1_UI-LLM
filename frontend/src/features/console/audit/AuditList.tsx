"use client";

import { Alert, Badge, Skeleton, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/utils/time";
import { PageHeader } from "../components/ConsoleShell";
import { useAudit } from "../queries";

export function AuditList({ sessionId }: { sessionId?: string }) {
  const query = useAudit(sessionId);
  return (
    <>
      <PageHeader
        title="Audit log"
        description="Guard violations, state-update rejections, budget decisions, escalations, consent and human decisions."
      />
      {query.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {query.isError ? <Alert tone="bad">Could not load the audit log.</Alert> : null}
      {query.data ? (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Kind</Th>
              <Th>Session</Th>
              <Th>Detail</Th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((event) => (
              <tr key={event.id}>
                <Td className="whitespace-nowrap">{formatDateTime(event.at)}</Td>
                <Td>
                  <Badge
                    tone={
                      event.kind === "guard_violation" || event.kind === "escalation"
                        ? "bad"
                        : event.kind === "human_decision"
                          ? "ok"
                          : "neutral"
                    }
                  >
                    {event.kind.replace(/_/g, " ")}
                  </Badge>
                </Td>
                <Td className="font-mono text-xs">{event.session_id ?? "—"}</Td>
                <Td>{event.detail}</Td>
              </tr>
            ))}
            {query.data.items.length === 0 ? (
              <tr>
                <Td colSpan={4} className="text-ink-muted text-center">
                  No events.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      ) : null}
    </>
  );
}
