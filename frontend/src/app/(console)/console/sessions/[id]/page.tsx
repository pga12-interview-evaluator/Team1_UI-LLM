import { ConsoleShell } from "@/features/console/components/ConsoleShell";
import { SessionDetail } from "@/features/console/sessions/SessionDetail";

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ConsoleShell>
      <SessionDetail id={id} />
    </ConsoleShell>
  );
}
