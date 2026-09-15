import { ConsoleShell } from "@/features/console/components/ConsoleShell";
import { RequisitionDetail } from "@/features/console/requisitions/RequisitionDetail";

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ConsoleShell>
      <RequisitionDetail id={id} />
    </ConsoleShell>
  );
}
