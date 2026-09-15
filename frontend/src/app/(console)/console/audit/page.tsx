import { AuditList } from "@/features/console/audit/AuditList";
import { ConsoleShell } from "@/features/console/components/ConsoleShell";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  return (
    <ConsoleShell>
      <AuditList sessionId={session_id} />
    </ConsoleShell>
  );
}
