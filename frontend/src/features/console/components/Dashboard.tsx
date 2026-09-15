"use client";

import Link from "next/link";
import { Card, CardBody, CardHeader, Skeleton } from "@/components/ui";
import { useRequisitions, useSessions } from "../queries";
import { PageHeader } from "./ConsoleShell";
import { SessionStatusBadge } from "./StatusBadge";

export function Dashboard() {
  const requisitions = useRequisitions();
  const sessions = useSessions();
  const items = sessions.data?.items ?? [];
  const live = items.filter(
    (s) => s.status === "active" || s.status === "paused" || s.status === "candidate_questions",
  );
  const awaitingReport = items.filter((s) => s.status === "closed" || s.status === "escalated");
  const awaitingDecision = items.filter((s) => s.status === "reported" && !s.human_decision);

  return (
    <>
      <PageHeader title="Dashboard" description="What needs attention now." />
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Live interviews" value={sessions.isPending ? null : live.length} />
        <Stat
          label="Closed · report pending"
          value={sessions.isPending ? null : awaitingReport.length}
        />
        <Stat
          label="Reported · decision pending"
          value={sessions.isPending ? null : awaitingDecision.length}
        />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Needs a human decision" />
          <CardBody>
            {awaitingDecision.length ? (
              <ul className="flex flex-col gap-2 text-sm">
                {awaitingDecision.map((s) => (
                  <li key={s.session_id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/console/sessions/${s.session_id}/report`}
                      className="text-brand hover:underline"
                    >
                      {s.candidate_label} · {s.job_title}
                    </Link>
                    <SessionStatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-muted text-sm">Nothing waiting.</p>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader
            title="Requisitions"
            actions={
              <Link href="/console/requisitions" className="text-brand text-sm hover:underline">
                All
              </Link>
            }
          />
          <CardBody>
            {requisitions.data ? (
              <ul className="flex flex-col gap-2 text-sm">
                {requisitions.data.items.slice(0, 6).map((r) => (
                  <li key={r.requisition_id} className="flex items-center justify-between gap-2">
                    <Link
                      href={`/console/requisitions/${r.requisition_id}`}
                      className="text-brand hover:underline"
                    >
                      {r.job_title}
                    </Link>
                    <span className="text-ink-muted text-xs">{r.status.replace(/_/g, " ")}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Skeleton className="h-20 w-full" />
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <Card>
      <CardBody>
        <p className="text-ink-muted text-xs font-semibold uppercase">{label}</p>
        {value === null ? (
          <Skeleton className="mt-2 h-8 w-12" />
        ) : (
          <p className="text-ink mt-1 text-3xl font-semibold">{value}</p>
        )}
      </CardBody>
    </Card>
  );
}
