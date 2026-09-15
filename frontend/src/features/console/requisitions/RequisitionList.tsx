"use client";

import Link from "next/link";
import { Alert, Button, Skeleton, Table, Td, Th } from "@/components/ui";
import { formatDateTime } from "@/lib/utils/time";
import { PageHeader } from "../components/ConsoleShell";
import { PressureBadge, RequisitionStatusBadge } from "../components/StatusBadge";
import { useRequisitions } from "../queries";

export function RequisitionList() {
  const query = useRequisitions();
  return (
    <>
      <PageHeader
        title="Requisitions"
        description="One requisition per role. Generate and freeze the blueprint before inviting candidates."
        actions={
          <Link href="/console/requisitions/new">
            <Button>New requisition</Button>
          </Link>
        }
      />
      {query.isPending ? <Skeleton className="h-40 w-full" /> : null}
      {query.isError ? <Alert tone="bad">Could not load requisitions.</Alert> : null}
      {query.data ? (
        <Table>
          <thead>
            <tr>
              <Th>Role</Th>
              <Th>Seniority</Th>
              <Th>Pressure</Th>
              <Th>Purpose</Th>
              <Th>Status</Th>
              <Th>Sessions</Th>
              <Th>Updated</Th>
            </tr>
          </thead>
          <tbody>
            {query.data.items.map((requisition) => (
              <tr key={requisition.requisition_id}>
                <Td>
                  <Link
                    href={`/console/requisitions/${requisition.requisition_id}`}
                    className="text-brand font-medium hover:underline"
                  >
                    {requisition.job_title}
                  </Link>
                  <div className="text-ink-muted text-xs">{requisition.field}</div>
                </Td>
                <Td>{requisition.seniority}</Td>
                <Td>
                  <PressureBadge level={requisition.pressure_level} />
                </Td>
                <Td>{requisition.interview_purpose.replace("_", " ")}</Td>
                <Td>
                  <RequisitionStatusBadge status={requisition.status} />
                </Td>
                <Td>{requisition.session_count}</Td>
                <Td>{formatDateTime(requisition.updated_at)}</Td>
              </tr>
            ))}
            {query.data.items.length === 0 ? (
              <tr>
                <Td colSpan={7} className="text-ink-muted text-center">
                  No requisitions yet.
                </Td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      ) : null}
    </>
  );
}
