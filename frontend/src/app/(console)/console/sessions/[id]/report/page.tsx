import { ConsoleShell } from "@/features/console/components/ConsoleShell";
import { ReportView } from "@/features/console/report/ReportView";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <ConsoleShell>
      <ReportView id={id} />
    </ConsoleShell>
  );
}
