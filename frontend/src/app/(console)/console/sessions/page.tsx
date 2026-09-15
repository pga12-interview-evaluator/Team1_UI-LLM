import { ConsoleShell } from "@/features/console/components/ConsoleShell";
import { SessionList } from "@/features/console/sessions/SessionList";

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ requisition_id?: string }>;
}) {
  const { requisition_id } = await searchParams;
  return (
    <ConsoleShell>
      <SessionList requisitionId={requisition_id} />
    </ConsoleShell>
  );
}
